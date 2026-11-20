"""External final CSV adapter; legacy CSV settings remain supported."""
import math
from decimal import Decimal, InvalidOperation

from django.conf import settings

from .repository import CatalogDataError, CsvCatalogRepository, _load_csv


def place_id(value):
    try:
        number = Decimal(value)
        if number.is_finite() and number > 0 and number == number.to_integral_value():
            return str(int(number))
    except InvalidOperation:
        pass
    raise CatalogDataError('Invalid final CSV place_id')


def get_repository():
    if settings.CATALOG_FINAL_CSV:
        return FinalCatalogRepository()
    return CsvCatalogRepository(settings.CATALOG_MENU_CSV, settings.CATALOG_RESTAURANT_CSV,
                                settings.CATALOG_COORDINATE_CSVS)


class FinalCatalogRepository:
    def __init__(self):
        self.rows = _load_csv(settings.CATALOG_FINAL_CSV, {
            'preprocess_row_id', 'place_id', '식당 이름', '식당 위치', '메뉴 이름',
            '메뉴 가격', 'price_numeric', 'price_status', 'menu_option', 'description',
            'restaurant_type', 'latitude_clean', 'longitude_clean',
            'coordinate_verification_status', '데이터 수집일', '갱신일'}, 'final')
        ids = [r['preprocess_row_id'] for r in self.rows]
        if len(set(ids)) != len(ids) or any(not value for value in ids):
            raise CatalogDataError('Final CSV requires unique nonempty preprocess_row_id')
        self.validation = {}
        if settings.CATALOG_COORDINATE_VALIDATION_CSV:
            for row in _load_csv(settings.CATALOG_COORDINATE_VALIDATION_CSV,
                    {'place_id', '2차검증_최종상태', '외부_주소좌표_검증'}, 'coordinate validation'):
                key = place_id(row['place_id'])
                if key in self.validation and self.validation[key] != row:
                    raise CatalogDataError('Conflicting coordinate validation records')
                self.validation[key] = row

    def coordinates(self):
        candidates = {}
        for row in self.rows:
            try:
                lat, lng = float(row['latitude_clean']), float(row['longitude_clean'])
                point = (lat, lng) if math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180 else None
            except (ValueError, TypeError):
                point = None
            candidates.setdefault(place_id(row['place_id']), set()).add(point)
        return {key: next(iter(values)) for key, values in candidates.items()
                if len(values) == 1 and None not in values}

    def list_restaurants(self):
        points, result = self.coordinates(), {}
        for row in self.rows:
            key = place_id(row['place_id'])
            if key in result:
                continue
            point = points.get(key)
            validation = self.validation.get(key, {})
            result[key] = {'restaurant_id': key, 'restaurant_name': row['식당 이름'],
                'brand': '', 'address': row['식당 위치'], 'phone': row.get('전화번호') or None,
                'map_url': row.get('홈페이지 URL') or None,
                'restaurant_type': row['restaurant_type'],
                'classification_source': row.get('classification_source'),
                'latitude': point[0] if point else None, 'longitude': point[1] if point else None,
                'coordinate_verification_status': row['coordinate_verification_status'],
                'coordinate_validation_status': validation.get('2차검증_최종상태'),
                'external_coordinate_verification': validation.get('외부_주소좌표_검증'),
                'collected_at': row['데이터 수집일'], 'updated_at': row['갱신일']}
        return list(result.values())

    def get_restaurant(self, restaurant_id):
        return next((r for r in self.list_restaurants() if r['restaurant_id'] == restaurant_id), None)

    def list_menus(self):
        result = []
        for row in self.rows:
            try:
                value = Decimal(row['price_numeric'])
                amount = int(value) if value.is_finite() and value >= 0 and value == value.to_integral_value() else None
            except InvalidOperation:
                amount = None
            result.append({'menu_id': row['preprocess_row_id'], 'menu_name': row['메뉴 이름'],
                'restaurant_id': place_id(row['place_id']), 'restaurant_name': row['식당 이름'],
                'brand': '', 'category': '', 'price_raw': row['메뉴 가격'], 'price_amount': amount,
                'price_status': 'fixed' if amount is not None else 'unknown',
                'source_price_status': row['price_status'], 'menu_option': row['menu_option'],
                'description': row['description'], 'restaurant_type': row['restaurant_type'],
                'collected_at': row['데이터 수집일'], 'updated_at': row['갱신일'],
                'branch_sale_status': 'unverified'})
        return result

    def list_restaurant_menus(self, restaurant_id):
        return [m for m in self.list_menus() if m['restaurant_id'] == restaurant_id]

    def get_menu(self, menu_id):
        menu = next((m for m in self.list_menus() if m['menu_id'] == menu_id), None)
        if menu is None:
            return None
        return dict(menu, allergen_information={'allergens_contains_normalized': None},
                    original_information={'description_raw': menu['description']},
                    source={'source_url': None, 'collected_at': menu['collected_at']},
                    verification={'verification_status': 'unmatched'}, safety_assessment='not_determined')
