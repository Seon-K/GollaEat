"""Conservative identity matching. Never infer absence from missing matrix cells."""
import re
from collections import Counter, defaultdict
from datetime import datetime, time
from urllib.parse import urlparse

from django.utils import timezone
from django.utils.dateparse import parse_date

from .adapters import DietaryCatalog
from .final_repository import place_id
from .repository import _load_csv, normalize_brand, CatalogDataError


# Explicit source-origin registry, not a guess from menu/restaurant name prefixes.
OFFICIAL_DOMAINS = {'맘스터치': 'momstouch.co.kr', '프랭크버거': 'frankburger.co.kr'}
REVIEWED = {'manual_visual_checked', 'official_image_visual_checked'}
REQUIRED = {'brand', 'menu_name_raw', 'menu_id', 'allergens_contains_normalized',
    'verification_status', 'allergen_declaration_scope', 'source_url', 'source_reference_date'}


def source_info(row, brand):
    url = row['source_url'].strip()
    parsed = urlparse(url)
    domain = OFFICIAL_DOMAINS.get(brand)
    official = bool(domain and parsed.scheme == 'https' and parsed.hostname and
        (parsed.hostname == domain or parsed.hostname.endswith('.' + domain)))
    try:
        date = parse_date(row['source_reference_date'])
    except ValueError:
        date = None
    checked = timezone.make_aware(datetime.combine(date, time.min)) if date else None
    verified = bool(official and checked and checked <= timezone.now() and
        row['verification_status'] in REVIEWED and row['allergen_declaration_scope'] == 'menu')
    return official, checked, verified


def match_rows(menus, allergen_path, brand_path):
    rows = _load_csv(allergen_path, REQUIRED, 'allergens')
    stores = _load_csv(brand_path, {'place_id', '브랜드'}, 'brand identity')
    brands, names = defaultdict(set), {}
    for row in stores:
        key, brand = place_id(row['place_id']), normalize_brand(row['브랜드'])
        brands[key].add(brand)
        names[brand] = row['브랜드'].strip()
    index = defaultdict(list)
    for row in rows:
        index[normalize_brand(row['brand']), normalize_brand(row['menu_name_raw'])].append(row)
    stats, matches = Counter(), []
    for menu in menus:
        identities = brands.get(menu['restaurant_id'], set())
        if len(identities) != 1:
            stats['no_unambiguous_brand'] += 1
            continue
        brand = next(iter(identities))
        candidates = index.get((brand, normalize_brand(menu['menu_name'])), [])
        if len(candidates) != 1:
            stats['ambiguous_menu' if candidates else 'no_exact_menu'] += 1
            continue
        row = candidates[0]
        if not row['menu_id'].strip() or len(row['menu_id']) > 100:
            raise CatalogDataError('Allergen reference requires a valid menu_id')
        official, checked, verified = source_info(row, names[brand])
        tokens = [t.strip() for t in re.split(r'[,;|/\n]+', row['allergens_contains_normalized']) if t.strip()]
        tags = {DietaryCatalog.TAGS[t] for t in tokens if t in DietaryCatalog.TAGS}
        tags.update({'고등어': 'mackerel', '게': 'crab', '새우': 'shrimp'}[t] for t in tokens if t in {'고등어', '게', '새우'})
        # Unrecognized normalized tokens are retained in payload, not silently considered absent.
        eligible = verified and bool(tags)
        stats['verified_source' if eligible else 'reference'] += 1
        matches.append((menu, row, names[brand], official, checked, eligible, tags))
    return matches, stats
