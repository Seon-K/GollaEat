"""Catalog data boundaries.

The mock repository is intentionally isolated so a database-backed repository can
replace it without changing the HTTP view or query validation.
"""

import csv
import math
import os
import re
import unicodedata
from functools import lru_cache


MOCK_MENUS = (
    {
        'menu_id': 'menu-001',
        'menu_name': '패밀리 세트',
        'restaurant_id': 'restaurant-001',
        'restaurant_name': '갓잇 아산탕정점',
        'category': '멕시코',
        'price_raw': '79,000원',
        'price_amount': 79000,
    },
    {
        'menu_id': 'menu-002',
        'menu_name': '파히타&타코 세트',
        'restaurant_id': 'restaurant-001',
        'restaurant_name': '갓잇 아산탕정점',
        'category': '멕시코',
        'price_raw': '42,000원',
        'price_amount': 42000,
    },
    {
        'menu_id': 'menu-003',
        'menu_name': '두부 포케',
        'restaurant_id': 'restaurant-002',
        'restaurant_name': '그린테이블 아산점',
        'category': '샐러드',
        'price_raw': '12,000원',
        'price_amount': 12000,
    },
    {
        'menu_id': 'menu-004',
        'menu_name': '순두부찌개',
        'restaurant_id': 'restaurant-003',
        'restaurant_name': '온양한식당',
        'category': '한식',
        'price_raw': '9,000원',
        'price_amount': 9000,
    },
    {
        'menu_id': 'menu-005',
        'menu_name': '버섯 크림 파스타',
        'restaurant_id': 'restaurant-004',
        'restaurant_name': '키친온',
        'category': '양식',
        'price_raw': '15,000원',
        'price_amount': 15000,
    },
)


class MockMenuRepository:
    def list_menus(self):
        """Return copies so filtering code cannot mutate shared mock records."""
        return [dict(menu) for menu in MOCK_MENUS]


MENU_REQUIRED_COLUMNS = {
    'brand',
    'menu_name_raw',
    'menu_id',
    'clean_id',
    'category',
    'allergen_status',
    'verification_status',
}
RESTAURANT_REQUIRED_COLUMNS = {
    '브랜드',
    'place_id',
    '식당 이름(지점명)',
    '주소',
    '전화번호',
    '네이버지도 URL',
    '수집일시',
}


class CatalogDataError(RuntimeError):
    pass


def normalize_brand(value):
    """Normalize representation only; do not perform fuzzy brand matching."""
    normalized = unicodedata.normalize('NFKC', value or '')
    return re.sub(r'\s+', '', normalized).casefold()


@lru_cache(maxsize=4)
def _read_csv(path, modified_ns):
    del modified_ns  # Cache key only; invalidates automatically when the file changes.
    with open(path, encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        return tuple(dict(row) for row in reader), set(reader.fieldnames or [])


def _load_csv(path, required_columns, label):
    if not path:
        raise CatalogDataError(f'{label} CSV path is not configured')
    try:
        modified_ns = os.stat(path).st_mtime_ns
    except OSError as exc:
        raise CatalogDataError(f'{label} CSV is not readable') from exc
    try:
        rows, columns = _read_csv(os.path.abspath(path), modified_ns)
    except (OSError, UnicodeError, csv.Error) as exc:
        raise CatalogDataError(f'{label} CSV could not be parsed') from exc
    missing = sorted(required_columns - columns)
    if missing:
        raise CatalogDataError(f'{label} CSV is missing columns: {", ".join(missing)}')
    return rows


class CsvCatalogRepository:
    """Read-only restaurant data and brand-level menu references from CSV files."""

    def __init__(self, menu_csv_path, restaurant_csv_path, coordinate_paths=()):
        self.menu_csv_path = menu_csv_path
        self.restaurant_csv_path = restaurant_csv_path
        self.coordinate_paths = coordinate_paths

    def coordinates(self):
        candidates = {}
        for path in self.coordinate_paths:
            for row in _load_csv(path, {'place_id', '위도', '경도'}, 'coordinates'):
                key = row['place_id'].strip()
                try:
                    lat, lng = float(row['위도']), float(row['경도'])
                    valid = math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180
                except (TypeError, ValueError):
                    valid = False
                if key:
                    candidates.setdefault(key, set()).add((lat, lng) if valid else None)
        # Repeated menu rows are fine; conflicting coordinates are not guessed.
        return {key: next(iter(values)) for key, values in candidates.items()
                if len(values) == 1 and None not in values}

    def list_restaurants(self):
        rows = _load_csv(
            self.restaurant_csv_path,
            RESTAURANT_REQUIRED_COLUMNS,
            'restaurant',
        )
        points = self.coordinates()
        result = [self._restaurant(row) for row in rows]
        for item in result:
            point = points.get(item['restaurant_id'])
            item['latitude'] = point[0] if point else None
            item['longitude'] = point[1] if point else None
        return result

    def list_menus(self):
        rows = _load_csv(self.menu_csv_path, MENU_REQUIRED_COLUMNS, 'menu')
        restaurants = self.list_restaurants() if self.restaurant_csv_path else []
        result = []
        for row in rows:
            matches = [r for r in restaurants if normalize_brand(r['brand']) == normalize_brand(row['brand'])]
            raw = row.get('price_raw') or row.get('price') or ''
            numeric = re.fullmatch(r'\s*([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)\s*원?\s*', raw)
            amount = int(numeric.group(1).replace(',', '')) if numeric else None
            result.append({'menu_id': row['menu_id'], 'menu_name': row['menu_name_raw'],
                'brand': row['brand'], 'category': row['category'],
                'restaurant_id': None, 'restaurant_name': None,
                'restaurant_search_names': [r['restaurant_name'] for r in matches],
                'price_raw': raw or None, 'price_amount': amount,
                'price_status': 'fixed' if amount is not None else 'unknown',
                'branch_sale_status': 'unverified'})
        return result

    def get_menu(self, menu_id):
        rows = _load_csv(self.menu_csv_path, MENU_REQUIRED_COLUMNS, 'menu')
        matches = [row for row in rows if row['menu_id'] == menu_id]
        if len(matches) > 1:
            raise CatalogDataError('menu CSV contains duplicate menu_id')
        if not matches:
            return None
        row = matches[0]
        # Keep source strings, including blanks and unknown statuses, unchanged.
        groups = {
            'allergen_information': ('allergens_contains_raw', 'allergens_contains_normalized',
                'allergen_status', 'allergen_declaration_scope', 'components_allergens_raw',
                'allergens_cross_contact_raw'),
            'original_information': ('ingredients_raw', 'ingredient_scope', 'description_raw',
                'sauce_info_raw', 'topping_info_raw', 'set_components_raw', 'notes'),
            'source': ('source_url', 'source_reference_date', 'collected_at', 'source_file',
                'source_sha256', 'evidence_locator'),
            'verification': ('verification_status', 'review_flag', 'review_priority',
                'review_reason', 'service_display_status'),
        }
        result = {'menu_id': row['menu_id'], 'menu_name': row['menu_name_raw'],
                  'brand': row['brand'], 'category': row['category']}
        for group, fields in groups.items():
            result[group] = {field: row.get(field) for field in fields}
        result['safety_assessment'] = 'not_determined'
        return result

    def get_restaurant(self, restaurant_id):
        for restaurant in self.list_restaurants():
            if restaurant['restaurant_id'] == restaurant_id:
                return restaurant
        return None

    def list_brand_menu_references(self, brand):
        brand_key = normalize_brand(brand)
        rows = _load_csv(self.menu_csv_path, MENU_REQUIRED_COLUMNS, 'menu')
        return [self._menu_reference(row) for row in rows if normalize_brand(row['brand']) == brand_key]

    @staticmethod
    def _restaurant(row):
        return {
            'restaurant_id': row['place_id'].strip(),
            'brand': row['브랜드'].strip(),
            'restaurant_name': row['식당 이름(지점명)'].strip(),
            'address': row['주소'].strip(),
            'phone': row['전화번호'].strip() or None,
            'map_url': row['네이버지도 URL'].strip() or None,
            'collected_at': row['수집일시'].strip() or None,
        }

    @staticmethod
    def _menu_reference(row):
        return {
            'menu_id': row['menu_id'],
            'reference_menu_id': row['clean_id'].strip() or row['menu_id'].strip(),
            'menu_name': row['menu_name_raw'].strip(),
            'category': row['category'].strip() or None,
            'allergen_status': row['allergen_status'].strip() or None,
            'verification_status': row['verification_status'].strip() or None,
            'branch_sale_status': 'unverified',
        }

