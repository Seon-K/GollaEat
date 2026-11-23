"""Short-lived, content-versioned evaluation cache; never caches user favorites."""
import hashlib
import json
from django.conf import settings
from django.core.cache import caches
from django.db import connection, DatabaseError
from django.utils import timezone


def database_version():
    # All committed writes (including bulk imports and external SQL) change the
    # PostgreSQL visibility snapshot. Own uncommitted writes are not represented,
    # so bypass caching inside transactions. SQLite/CSV retain the uncached path.
    if (not getattr(settings, 'DIETARY_JUDGEMENT_CACHE_ENABLED', True)
            or connection.vendor != 'postgresql' or connection.in_atomic_block
            or not connection.get_autocommit()):
        return None
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_current_snapshot()::text')
            snapshot = cursor.fetchone()[0]
    except DatabaseError:
        return None
    database = [connection.settings_dict.get(k) for k in ('HOST', 'PORT', 'NAME')]
    return hashlib.sha256(json.dumps([database, snapshot], default=str).encode()).hexdigest()


def cache_keys(context, component_ids):
    version = database_version()
    if version is None:
        return {}
    criteria = [(c.code, c.name, c.kind,
                 getattr(context.rules.get(c.code), 'excluded_tags', None),
                 getattr(context.rules.get(c.code), 'source', None)) for c in context.criteria]
    signature = hashlib.sha256(json.dumps(criteria, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return {mid: 'judgement:v1:' + hashlib.sha256(f'{version}:{signature}:{mid}'.encode()).hexdigest()
            for mid in component_ids if not mid.startswith('component:')}


def read_many(keys):
    now = timezone.now().timestamp()
    try:
        entries = caches['dietary_judgements'].get_many(list(keys.values()))
    except Exception:
        return {}
    return {mid: entries[key]['result'] for mid, key in keys.items()
            if key in entries and entries[key]['expires'] > now}


def entry(result):
    now = timezone.now().timestamp()
    expires = now + settings.DIETARY_JUDGEMENT_CACHE_TTL
    # A database snapshot doesn't change when a source expires with time.
    for source in result.get('sources', []):
        until = source.get('valid_until')
        if until is not None:
            expires = min(expires, until.timestamp())
    return {'result': result, 'expires': expires}


def write_many(entries):
    if not entries:
        return
    try:
        caches['dietary_judgements'].set_many(entries, timeout=settings.DIETARY_JUDGEMENT_CACHE_TTL)
    except Exception:
        pass  # Cache availability must not change evaluation behavior.
