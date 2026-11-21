"""ORM read boundary. No source CSV is opened by this repository."""
from .models import Menu, Restaurant, MenuComponent, AllergenLink
from .operations import operating_status, source_json, declaration_json, component_json, declared_tags
from django.core.exceptions import ValidationError


class DatabaseCatalogRepository:
    def _restaurants(self):
        return Restaurant.objects.select_related('hours_source').prefetch_related('business_hours', 'closures__source')

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
        return [self._restaurant(row) for row in self._restaurants().order_by('place_id')]

    def get_restaurant(self, restaurant_id):
        row = self._restaurants().filter(pk=restaurant_id).first()
        return self._restaurant(row) if row else None

    def coordinates(self):
        return {row['restaurant_id']: (row['latitude'], row['longitude'])
                for row in self.list_restaurants()
                if row.get('latitude') is not None and row.get('longitude') is not None}

    def list_menus(self):
        return [self._menu(row) for row in Menu.objects.select_related('restaurant').order_by('preprocess_row_id')]

    def list_restaurant_menus(self, restaurant_id):
        return [self._menu(row) for row in Menu.objects.select_related('restaurant').filter(restaurant_id=restaurant_id)
                    .order_by('preprocess_row_id')]

    def get_menu(self, menu_id):
        row = Menu.objects.select_related('restaurant').filter(pk=menu_id).first()
        if row is None:
            return None
        menu = self._menu(row)
        declarations = [declaration_json(d) for d in row.declarations.select_related('source')]
        link = AllergenLink.objects.select_related('source').filter(menu=row).first()
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
            original_information={'description_raw': menu.get('description')},
            source={'source_url': None, 'collected_at': menu.get('collected_at')},
            verification={'verification_status': 'declarations_available' if declarations else 'unmatched'}, safety_assessment='not_determined',
            ingredients=[d for d in declarations if d['kind'] == 'ingredient'],
            components=[component_json(c) for c in row.components.select_related('source').prefetch_related('declarations__source')],
            option_groups=[{'group_id': g.pk, 'name': g.name, 'min_select': g.min_select,
                'max_select': g.max_select, 'source': source_json(g.source)} for g in row.option_groups.select_related('source')])

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
            row = Menu.objects.filter(pk=component_id).first()
            if row is None:
                return None
            targets = [row, *row.components.filter(is_default=True)]
        present, absent, sources = set(), None, {}
        for target in targets:
            p, a, s = declared_tags(target.declarations.select_related('source', 'import_link'))
            present.update(p)
            absent = a if absent is None else absent & a
            sources.update(s)
        return {'present_tags': sorted(present), 'absent_tags': sorted((absent or set()) - present),
            'sources': list(sources.values()), 'preference_tags': []}
