"""Persistent criterion-level status index, produced by the existing evaluator."""
from collections import defaultdict
from functools import lru_cache
from types import SimpleNamespace
import json
from django.conf import settings
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from dietary.models import Criterion
from dietary.services import evaluate, PRIORITY
from .models import Menu, MenuDietaryState, MenuDietaryStatus, CatalogSource, FoodDeclaration

ENGINE_VERSION = 2
SEPARATOR = '\x1f'


def rule_token(criteria):
    return json.dumps([(c.pk, c.code, c.kind, getattr(getattr(c, 'rule', None), 'enabled', None),
        getattr(getattr(c, 'rule', None), 'source', None), getattr(getattr(c, 'rule', None), 'excluded_tags', None))
        for c in criteria], sort_keys=True)


def enabled():
    value = getattr(settings, 'CATALOG_DIETARY_INDEX_ENABLED', 'auto')
    return value is True or value == 'true' or (value == 'auto' and connection.vendor == 'postgresql')


@lru_cache(maxsize=8)
def _tables_available(alias, name):
    return MenuDietaryState._meta.db_table in connection.introspection.table_names()


def available():
    return enabled() and _tables_available(connection.alias, str(connection.settings_dict.get('NAME')))


def ready_condition(prefix=''):
    return (Q(**{prefix + 'dirty': False, prefix + 'engine_version': ENGINE_VERSION}) &
            (Q(**{prefix + 'valid_until__isnull': True}) | Q(**{prefix + 'valid_until__gt': timezone.now()})))


def next_boundaries(menu_ids):
    # Keep expiry local to the affected menus; one expiring source must not
    # invalidate every restaurant in the catalog.
    from .models import AllergenLink
    now = timezone.now()
    deadlines = dict.fromkeys(menu_ids)
    declarations = FoodDeclaration.objects.filter(Q(menu_id__in=menu_ids) | Q(component__menu_id__in=menu_ids)).values_list(
        'menu_id', 'component__menu_id', 'confirmed_at', 'source__checked_at', 'source__valid_until')
    links = AllergenLink.objects.filter(menu_id__in=menu_ids).values_list('menu_id', 'source__checked_at', 'source__valid_until')
    events = [(mid or parent, dates) for mid, parent, *dates in declarations]
    events.extend((mid, dates) for mid, *dates in links)
    for mid, dates in events:
        for value in dates:
            if value is not None and value > now and (deadlines[mid] is None or value < deadlines[mid]):
                deadlines[mid] = value
    return deadlines


def rebuild(menu_ids=None, batch_size=1000, progress=None, force=False):
    from .db_repository import DatabaseCatalogRepository
    rows = Menu.objects.all()
    if menu_ids is not None:
        rows = rows.filter(pk__in=menu_ids)
    if not force:
        rows = rows.exclude(ready_condition('dietary_state__'))
    ids = list(rows.order_by('pk').values_list('pk', flat=True))
    criteria = list(Criterion.objects.exclude(kind='preference').select_related('rule').order_by('pk'))
    rules_version = rule_token(criteria)
    completed = 0
    repository = DatabaseCatalogRepository()
    for start in range(0, len(ids), batch_size):
        batch = ids[start:start + batch_size]
        MenuDietaryState.objects.bulk_create([MenuDietaryState(menu_id=mid) for mid in batch], ignore_conflicts=True)
        revisions = dict(MenuDietaryState.objects.filter(menu_id__in=batch).values_list('menu_id', 'revision'))
        deadlines = next_boundaries(batch)
        facts = repository.get_dietary_components(batch)
        prepared = {}
        contexts = []
        for criterion in criteria:
            rule = getattr(criterion, 'rule', None)
            rules = {criterion.code: rule} if rule and rule.enabled and rule.source else {}
            contexts.append((criterion, SimpleNamespace(criteria=[criterion], rules=rules, component_data=facts,
                prepared_components=prepared, cached_judgements={}, judgement_cache_keys={})))
        statuses = [MenuDietaryStatus(menu_id=mid, criterion_id=criterion.pk, menu_revision=revisions[mid],
                        rank=PRIORITY[evaluate(None, mid, context=context)['status']])
                    for mid in batch for criterion, context in contexts]
        documents = []
        fields = ('pk', 'name', 'restaurant__name', 'restaurant__brand', 'category', 'restaurant__category', 'data__restaurant_search_names')
        for mid, name, restaurant, brand, category, fallback, aliases in Menu.objects.filter(pk__in=batch).values_list(*fields):
            names = [name, restaurant, brand, *(alias for alias in (aliases or []) if isinstance(alias, str))]
            documents.append(MenuDietaryState(menu_id=mid, evaluation_data=facts[mid], name_key=name.casefold(), category_key=(category or fallback).casefold(),
                search_text=SEPARATOR.join(value.casefold() for value in names)))
        groups = defaultdict(list)
        for mid, revision in revisions.items():
            groups[(revision, deadlines[mid])].append(mid)
        with transaction.atomic():
            # Serialize publishers; an older rebuild cannot overwrite a newer document.
            locked = dict(MenuDietaryState.objects.select_for_update().filter(menu_id__in=batch).values_list('menu_id', 'revision'))
            current = {mid for mid, revision in revisions.items() if locked.get(mid) == revision}
            statuses = [status for status in statuses if status.menu_id in current]
            documents = [document for document in documents if document.menu_id in current]
            if statuses:
                MenuDietaryStatus.objects.bulk_create(statuses, batch_size=5000, update_conflicts=True,
                    unique_fields=['menu', 'criterion'], update_fields=['rank', 'menu_revision'])
            MenuDietaryState.objects.bulk_update(documents, ['name_key', 'category_key', 'search_text', 'evaluation_data'], batch_size=1000)
            if rule_token(Criterion.objects.exclude(kind='preference').select_related('rule').order_by('pk')) != rules_version:
                continue  # A concurrent rule edit must never publish old rankings.
            for (revision, deadline), members in groups.items():
                completed += MenuDietaryState.objects.filter(menu_id__in=[mid for mid in members if mid in current], revision=revision).update(
                    dirty=False, engine_version=ENGINE_VERSION, valid_until=deadline)
        if progress:
            progress(completed, len(ids))
    return completed


def ensure_ready(queryset):
    dirty = list(queryset.exclude(ready_condition('dietary_state__')).values_list('pk', flat=True)[:101])
    if not dirty:
        return True
    if len(dirty) > 100:
        return False  # Large imports are rebuilt by the import/maintenance command.
    rebuild(dirty)
    return not queryset.exclude(ready_condition('dietary_state__')).exists()


def rebuild_after_import():
    if available():
        rebuild()
