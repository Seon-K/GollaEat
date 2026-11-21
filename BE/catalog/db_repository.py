"""ORM read boundary. No source CSV is opened by this repository."""
from .models import Menu, Restaurant


class DatabaseCatalogRepository:
    def list_restaurants(self):
        return list(Restaurant.objects.order_by('place_id').values_list('data', flat=True))

    def get_restaurant(self, restaurant_id):
        return Restaurant.objects.filter(pk=restaurant_id).values_list('data', flat=True).first()

    def coordinates(self):
        return {row['restaurant_id']: (row['latitude'], row['longitude'])
                for row in self.list_restaurants()
                if row.get('latitude') is not None and row.get('longitude') is not None}

    def list_menus(self):
        return list(Menu.objects.order_by('preprocess_row_id').values_list('data', flat=True))

    def list_restaurant_menus(self, restaurant_id):
        return list(Menu.objects.filter(restaurant_id=restaurant_id)
                    .order_by('preprocess_row_id').values_list('data', flat=True))

    def get_menu(self, menu_id):
        menu = Menu.objects.filter(pk=menu_id).values_list('data', flat=True).first()
        if menu is None:
            return None
        return dict(menu, allergen_information={'allergens_contains_normalized': None},
            original_information={'description_raw': menu.get('description')},
            source={'source_url': None, 'collected_at': menu.get('collected_at')},
            verification={'verification_status': 'unmatched'}, safety_assessment='not_determined')
