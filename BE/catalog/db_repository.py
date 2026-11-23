"""ORM read boundary. No source CSV is opened by this repository."""
from .models import Menu, Restaurant, MenuComponent, AllergenLink, FoodDeclaration, OptionGroup, BusinessHours, Closure
from .operations import operating_status, source_json, declaration_json, component_json, declared_tags
from .operations import official_menu_allergens
from .analysis_reference import analysis_json
from .map_links import kakao_links
from django.core.exceptions import ValidationError
from django.db.models import Prefetch, Q, F, Min, Count, Exists, OuterRef, prefetch_related_objects
from django.db.models.functions import Lower, Collate
from django.db import connection
from .query_expressions import UnicodeCasefold


# Keep exceptional Unicode strings for the exact Python casefold check.
_COMPLEX_TEXT = r'[^\x01-\x7f가-힣]'


def _contains_candidates(field, value):
    return Q(**{field + '__icontains': value}) | Q(**{field + '__regex': _COMPLEX_TEXT})


def _simple_sort_text(value):
    return all(ord(c) < 128 or '가' <= c <= '힣' for c in value)


class DatabaseCatalogRepository:
    def nearby_menu_rows(self, location, radius_km, restaurant_query='', menu_query=''):
        from .services import haversine_km
        distances = {}
        stores = Restaurant.objects.exclude(latitude=None).exclude(longitude=None).values('pk', 'name', 'brand', 'latitude', 'longitude')
        for store in stores:
            if restaurant_query and restaurant_query.casefold() not in (store['name'] + ' ' + store['brand']).casefold():
                continue
            distance = haversine_km(location['lat'], location['lng'], store['latitude'], store['longitude'])
            if distance <= radius_km:
                distances[store['pk']] = distance * 1000
        rows = Menu.objects.filter(restaurant_id__in=distances).values('pk', 'name', 'restaurant_id', 'restaurant__name', 'sale_status')
        result = [{'restaurant_id': row['restaurant_id'], 'restaurant_name': row['restaurant__name'],
                   'menu_id': row['pk'], 'menu_name': row['name'], 'distance_m': distances[row['restaurant_id']],
                   'branch_sale_status': row['sale_status']} for row in rows
                  if not menu_query or menu_query.casefold() in row['name'].casefold()]
        return sorted(result, key=lambda row: (row['distance_m'], str(row['restaurant_id']), str(row['menu_id'])))

    def _restaurants(self):
        return Restaurant.objects.select_related('hours_source').annotate(
            _catalog_has_hours=Exists(BusinessHours.objects.filter(restaurant_id=OuterRef('pk'))),
            _catalog_has_closures=Exists(Closure.objects.filter(restaurant_id=OuterRef('pk'))))

    def _restaurant_rows(self, queryset):
        rows = list(queryset)
        for relation, flag in [('business_hours', '_catalog_has_hours'), ('closures', '_catalog_has_closures')]:
            populated = []
            for row in rows:
                if getattr(row, flag):
                    populated.append(row)
                else:
                    empty = getattr(row, relation).none()
                    row.__dict__.setdefault('_prefetched_objects_cache', {})[relation] = empty
            if populated:
                lookup = (Prefetch('closures', queryset=Closure.objects.select_related('source'))
                          if relation == 'closures' else 'business_hours')
                prefetch_related_objects(populated, lookup)
        return rows

    def _restaurant(self, row):
        result = dict(row.data)
        result.update(restaurant_id=row.pk, restaurant_name=row.name, address=row.address,
            phone=row.phone or None, brand=row.brand, category=row.category,
            restaurant_type=row.restaurant_type,
            latitude=row.latitude, longitude=row.longitude, takeaway=row.takeaway, delivery=row.delivery,
            reservation_url=row.reservation_url or None, directions_url=row.directions_url or None,
            contact_url=('tel:' + row.phone) if row.phone else None,
            operating_status=operating_status(row), hours_confirmed_at=row.hours_confirmed_at,
            hours_source=source_json(row.hours_source),
            business_hours=[{'weekday': h.weekday, 'is_closed': h.is_closed,
                'opens_at': h.opens_at, 'closes_at': h.closes_at, 'closes_next_day': h.closes_next_day,
                'break_start': h.break_start, 'break_end': h.break_end} for h in row.business_hours.all()],
            closures=[{'date': c.date, 'reason': c.reason, 'source': source_json(c.source)} for c in row.closures.all()])
        if (row.latitude, row.longitude) != (row.data.get('latitude'), row.data.get('longitude')):
            result['coordinate_verification_status'] = 'manual_changed_unverified'
        result.update(kakao_links(row.name, row.latitude, row.longitude))
        return result

    def _menu(self, row):
        result = dict(row.data)
        result.update(menu_id=row.pk, menu_name=row.name, restaurant_id=row.restaurant_id,
            restaurant_name=row.restaurant.name, brand=row.restaurant.brand,
            category=row.category or row.restaurant.category, description=row.description,
            restaurant_type=row.restaurant.restaurant_type,
            price_amount=row.price_amount, price_status='fixed' if row.price_amount is not None else 'unknown',
            branch_sale_status=row.sale_status, latitude=row.restaurant.latitude, longitude=row.restaurant.longitude)
        if row.price_amount != row.data.get('price_amount'):
            result['price_raw'] = str(row.price_amount) if row.price_amount is not None else None
        result.setdefault('price_raw', None)
        return result

    def list_restaurants(self):
        return [self._restaurant(row) for row in self._restaurant_rows(self._restaurants().order_by('place_id'))]

    def get_restaurant(self, restaurant_id):
        rows = self._restaurant_rows(self._restaurants().filter(pk=restaurant_id))
        return self._restaurant(rows[0]) if rows else None

    def coordinates(self):
        return {pk: (lat, lng) for pk, lat, lng in Restaurant.objects.filter(
            latitude__isnull=False, longitude__isnull=False).values_list('pk', 'latitude', 'longitude')}

    def menu_candidates(self, *, min_price=None, max_price=None, query='', categories=(), region='', restaurant_id=''):
        """Read only search keys, never full source JSON or analysis/evidence.

        Keep Python casefold/alias and Haversine semantics shared with CSV mode.
        Full menu payloads are fetched only after pagination.
        """
        rows = Menu.objects.all()
        if restaurant_id:
            rows = rows.filter(restaurant_id=restaurant_id)
        if min_price is not None:
            rows = rows.filter(price_amount__gte=min_price)
        if max_price is not None:
            rows = rows.filter(price_amount__lte=max_price)
        # PostgreSQL text parameters cannot contain NUL; let the exact Python
        # check handle such input without sending it as a database parameter.
        if query and '\x00' not in query:
            rows = rows.filter(_contains_candidates('name', query)
                | _contains_candidates('restaurant__name', query)
                | _contains_candidates('restaurant__brand', query)
                | Q(data__has_key='restaurant_search_names'))
        if region and '\x00' not in region:
            rows = rows.filter(_contains_candidates('restaurant__address', region))
        if categories and not any('\x00' in category for category in categories):
            matching = Q(category__regex=_COMPLEX_TEXT)
            for category in categories:
                matching |= Q(category__iexact=category)
                matching |= Q(category='', restaurant__category__iexact=category)
            matching |= Q(category='', restaurant__category__regex=_COMPLEX_TEXT)
            rows = rows.filter(matching)
        fields = ('pk', 'name', 'restaurant_id', 'restaurant__name', 'restaurant__brand',
            'category', 'restaurant__category', 'price_amount', 'restaurant__latitude',
            'restaurant__longitude', 'restaurant__address', 'data__restaurant_search_names')
        return [{'menu_id': pk, 'menu_name': name, 'restaurant_id': rid,
            'restaurant_name': rname, 'brand': brand, 'category': category or rcategory,
            'price_amount': price, 'latitude': lat, 'longitude': lng, 'address': address,
            'restaurant_search_names': aliases or []}
            for pk, name, rid, rname, brand, category, rcategory, price, lat, lng, address, aliases
            in rows.values_list(*fields)]

    def menu_summaries(self, menu_ids):
        return {row.pk: self._menu(row) for row in Menu.objects.select_related('restaurant').filter(pk__in=menu_ids)}

    def initial_menu_page(self, *, sort, page, limit, min_price=None, max_price=None):
        if connection.vendor not in {'postgresql', 'sqlite'}:
            return None
        rows = Menu.objects.all()
        if min_price is not None or max_price is not None:
            rows = rows.filter(price_amount__gte=min_price or 0)
            if max_price is not None:
                rows = rows.filter(price_amount__lte=max_price)
        else:
            rows = rows.filter(Q(price_amount__isnull=True) | Q(price_amount__gte=0))
        total = rows.count()
        if not total or (page - 1) * limit >= total:
            return [], total
        collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
        tie = Collate('pk', collation)
        if sort == 'menu_name_asc':
            order = [Collate(UnicodeCasefold('name'), collation), tie]
        else:
            price = F('price_amount')
            order = [price.asc(nulls_last=True) if sort == 'price_asc' else price.desc(nulls_last=True), tie]
        start = (page - 1) * limit
        return [self._menu(row) for row in rows.select_related('restaurant').order_by(*order)[start:start + limit]], total

    def ordered_menu_page(self, candidates, sort, page, limit):
        """SQL ordering/offset for equivalent keys; None means exact Python fallback."""
        collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
        if sort == 'menu_name_asc':
            if not all(_simple_sort_text(menu['menu_name']) for menu in candidates):
                return None
            order = [Collate(Lower(Collate('name', collation)), collation), Collate('pk', collation)]
        elif sort in {'price_asc', 'price_desc'}:
            price = F('price_amount')
            order = [price.asc(nulls_last=True) if sort == 'price_asc' else price.desc(nulls_last=True),
                     Collate('pk', collation)]
        else:
            return None
        ids = [menu['menu_id'] for menu in candidates]
        start = (page - 1) * limit
        rows = Menu.objects.select_related('restaurant').filter(pk__in=ids).order_by(*order)[start:start + limit]
        distances = {menu['menu_id']: menu.get('distance_km') for menu in candidates}
        return [dict(self._menu(row), distance_km=distances[row.pk]) for row in rows]

    def restaurant_candidates(self, *, include_hours=False):
        if include_hours:
            return self.list_restaurants()
        return [dict(restaurant_id=pk, restaurant_name=name, brand=brand, address=address,
                     category=category, restaurant_type=kind, latitude=lat, longitude=lng)
                for pk, name, brand, address, category, kind, lat, lng in Restaurant.objects.values_list(
                    'pk', 'name', 'brand', 'address', 'category', 'restaurant_type', 'latitude', 'longitude')]

    def discovery_candidates(self, *, bounds=None, lat=None, lng=None, radius=None, include_hours=False, region=''):
        import math
        rows = self._restaurants() if include_hours else Restaurant.objects.all()
        if region and '\x00' not in region:
            rows = rows.filter(_contains_candidates('address', region))
        if bounds:
            w, s, e, n = bounds
            rows = rows.filter(latitude__range=(s, n), longitude__range=(w, e))
        elif radius is not None:
            delta = math.degrees(radius / 6371.0088)
            rows = rows.filter(latitude__range=(lat - delta, lat + delta))
            if abs(lat) + delta < 90:
                width = math.degrees(math.asin(min(1, math.sin(radius / 6371.0088) / math.cos(math.radians(lat)))))
                if -180 <= lng - width and lng + width <= 180:
                    rows = rows.filter(longitude__range=(lng - width, lng + width))
        if include_hours:
            return [self._restaurant(row) for row in self._restaurant_rows(rows)]
        return list(rows.values('latitude', 'longitude', 'brand', 'address', 'category', 'restaurant_type',
                                restaurant_id=F('pk'), restaurant_name=F('name')))

    def discovery_menus(self, restaurant_ids):
        # No full source JSON or per-menu ORM reads in map candidate selection.
        fields = ('pk', 'name', 'restaurant_id', 'restaurant__name', 'restaurant__brand',
                  'category', 'restaurant__category', 'price_amount', 'sale_status')
        return [dict(menu_id=pk, menu_name=name, restaurant_id=rid, restaurant_name=rname,
                     brand=brand, category=category or fallback, price_amount=price,
                     price_raw=str(price) if price is not None else None,
                     price_status='fixed' if price is not None else 'unknown', branch_sale_status=sale)
                for pk, name, rid, rname, brand, category, fallback, price, sale
                in Menu.objects.filter(restaurant_id__in=restaurant_ids).values_list(*fields)]

    def restaurant_summaries(self, restaurant_ids):
        return {row.pk: self._restaurant(row) for row in self._restaurant_rows(
            self._restaurants().filter(pk__in=restaurant_ids))}

    def restaurant_prices(self, minimum, maximum):
        eligible = Q(price_amount__gte=minimum)
        if maximum is not None:
            eligible &= Q(price_amount__lte=maximum)
        rows = Menu.objects.values('restaurant_id').annotate(
            minimum=Min('price_amount'), eligible=Count('pk', filter=eligible))
        return ({row['restaurant_id']: row['minimum'] for row in rows if row['minimum'] is not None},
                {row['restaurant_id'] for row in rows if row['eligible']})

    def list_menus(self):
        return [self._menu(row) for row in Menu.objects.select_related('restaurant').order_by('preprocess_row_id')]

    def list_restaurant_menus(self, restaurant_id):
        return [self._menu(row) for row in Menu.objects.select_related('restaurant').filter(restaurant_id=restaurant_id)
                    .order_by('preprocess_row_id')]

    def get_menu(self, menu_id):
        row = Menu.objects.select_related('restaurant', 'analysis_reference', 'allergen_link__source').annotate(
            _catalog_has_declarations=Exists(FoodDeclaration.objects.filter(menu_id=OuterRef('pk'))),
            _catalog_has_components=Exists(MenuComponent.objects.filter(menu_id=OuterRef('pk'))),
            _catalog_has_groups=Exists(OptionGroup.objects.filter(menu_id=OuterRef('pk')))).filter(pk=menu_id).first()
        if row is None:
            return None
        menu = self._menu(row)
        declarations = ([declaration_json(d) for d in row.declarations.select_related('source')]
                        if row._catalog_has_declarations else [])
        link = getattr(row, 'allergen_link', None)
        reference = None if link is None else {
            'external_menu_id': link.external_menu_id, 'brand': link.brand,
            'match_method': link.match_method, 'status': link.status,
            'allergens_contains_raw': link.payload.get('allergens_contains_raw'),
            'allergens_contains_normalized': link.payload.get('allergens_contains_normalized'),
            'ingredients_raw': link.payload.get('ingredients_raw'),
            'applicability_scope': link.payload.get('allergen_declaration_scope'),
            'original_verification_status': link.payload.get('verification_status'),
            'source': source_json(link.source)}
        return dict(menu, allergen_information={'allergens_contains_normalized': None,
            'declarations': declarations, 'brand_reference': reference},
            analysis_reference=analysis_json(getattr(row, 'analysis_reference', None)),
            original_information={'description_raw': menu.get('description')},
            source={'source_url': None, 'collected_at': menu.get('collected_at')},
            verification={'verification_status': 'declarations_available' if declarations else 'unmatched'}, safety_assessment='not_determined',
            ingredients=[d for d in declarations if d['kind'] == 'ingredient'],
            components=([component_json(c) for c in row.components.select_related('source').prefetch_related(
                Prefetch('declarations', queryset=FoodDeclaration.objects.select_related('source')))]
                        if row._catalog_has_components else []),
            option_groups=[{'group_id': g.pk, 'name': g.name, 'min_select': g.min_select,
                'max_select': g.max_select, 'source': source_json(g.source)} for g in row.option_groups.select_related('source')]
                if row._catalog_has_groups else [])

    def get_dietary_component(self, component_id):
        if component_id.startswith('component:'):
            try:
                row = MenuComponent.objects.filter(pk=component_id.split(':', 1)[1]).first()
            except (ValueError, ValidationError):
                return None
            if row is None:
                return None
            targets = [row]
        else:
            row = Menu.objects.select_related('restaurant', 'analysis_reference', 'allergen_link__source').filter(pk=component_id).first()
            if row is None:
                return None
            targets = [row, *row.components.filter(is_default=True)]
        present, absent, sources = set(), None, {}
        for target in targets:
            p, a, s = declared_tags(target.declarations.select_related('source', 'import_link'))
            present.update(p)
            absent = a if absent is None else absent & a
            sources.update(s)
        official_absent = set()
        if isinstance(row, Menu):
            p, official_absent, s = official_menu_allergens(row)
            present.update(p)
            sources.update(s)
        return {'present_tags': sorted(present), 'absent_tags': sorted(((absent or set()) | official_absent) - present),
            'sources': list(sources.values()),
            'preference_tags': [],
            'analysis_reference': analysis_json(getattr(row, 'analysis_reference', None)) if isinstance(row, Menu) else None}

    def get_dietary_components(self, menu_ids):
        # 후보 전체의 메뉴·기본 구성품·성분 근거 일괄 조회
        declarations = 'declarations__source'
        menus = Menu.objects.filter(pk__in=menu_ids).select_related('restaurant', 'analysis_reference', 'allergen_link__source').prefetch_related(
            declarations, 'declarations__import_link__menu',
            Prefetch('components', queryset=MenuComponent.objects.filter(is_default=True).prefetch_related(
                'declarations__source', 'declarations__import_link__menu'))).defer(
                    'data', 'description', 'restaurant__data', 'analysis_reference__payload')
        result = dict.fromkeys(menu_ids)
        for menu in menus:
            present, absent, sources = set(), None, {}
            for target in [menu, *menu.components.all()]:
                p, a, s = declared_tags(target.declarations.all())
                present.update(p)
                absent = a if absent is None else absent & a
                sources.update(s)
            p, official_absent, s = official_menu_allergens(menu)
            present.update(p)
            sources.update(s)
            result[menu.pk] = {'present_tags': sorted(present),
                'absent_tags': sorted(((absent or set()) | official_absent) - present), 'sources': list(sources.values()),
                'preference_tags': [],
                'analysis_reference': analysis_json(getattr(menu, 'analysis_reference', None))}
        for component_id in menu_ids:
            if component_id.startswith('component:'):
                result[component_id] = self.get_dietary_component(component_id)
        return result
