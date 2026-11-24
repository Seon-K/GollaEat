import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.allergen_import import match_rows
from catalog.models import Menu, Restaurant, CatalogSource, AllergenLink, FoodDeclaration
from catalog.repository import CatalogDataError


class Command(BaseCommand):
    help = 'Link exact brand/menu allergen references to already imported menus; never infer absence.'

    def add_arguments(self, parser):
        parser.add_argument('--allergens', required=True)
        parser.add_argument('--brand-restaurants', required=True)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        menus = [{'menu_id': m.pk, 'menu_name': m.name, 'restaurant_id': m.restaurant_id}
                 for m in Menu.objects.all()]
        try:
            matches, stats = match_rows(menus, options['allergens'], options['brand_restaurants'])
        except CatalogDataError as exc:
            raise CommandError(str(exc)) from exc
        if not options['dry_run']:
            with transaction.atomic():
                # Only imported declarations are downgraded, never operator-authored evidence.
                AllergenLink.objects.update(status='inactive')
                FoodDeclaration.objects.filter(import_link__isnull=False).update(verification_status='unverified')
                for menu, row, brand, official, checked, eligible, tags in matches:
                    Restaurant.objects.filter(pk=menu['restaurant_id'], brand='').update(brand=brand)
                    previous = AllergenLink.objects.filter(menu_id=menu['menu_id']).first()
                    defaults = {'title': f"{brand} {row['menu_name_raw']}"[:300], 'url': row['source_url'],
                        'evidence_locator': row.get('evidence_locator') or '',
                        'source_type': 'official' if official else 'reference', 'checked_at': checked,
                        'notes': row.get('notes') or ''}
                    if previous:
                        source = previous.source
                        for key, value in defaults.items():
                            setattr(source, key, value)
                        source.save()
                    else:
                        source = CatalogSource.objects.create(**defaults)
                    link, _ = AllergenLink.objects.update_or_create(menu_id=menu['menu_id'], defaults={
                        'external_menu_id': row['menu_id'], 'brand': brand, 'payload': row, 'source': source,
                        'status': 'verified_source' if eligible else 'reference'})
                    for tag in tags:
                        FoodDeclaration.objects.update_or_create(import_link=link, canonical_tag=tag, defaults={
                            'menu_id': menu['menu_id'], 'kind': 'allergen', 'name_raw': tag,
                            'presence': 'present', 'verification_status': 'verified' if eligible else 'unverified',
                            'source': source, 'confirmed_at': checked if eligible else None,
                            'applicability_scope': 'brand_menu_reference:' + row['allergen_declaration_scope'],
                            'unknown_scope': '지점별 현재 판매·레시피 변경·교차접촉·전체 성분 범위는 미확인'})
        from catalog.dietary_index import rebuild_after_import
        if not options['dry_run']:
            rebuild_after_import()
        self.stdout.write(json.dumps(dict(stats), ensure_ascii=False, sort_keys=True))
