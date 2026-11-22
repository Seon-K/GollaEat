from django.test import TestCase, override_settings

from .categories import MENU_CATEGORIES
from .models import Menu, Restaurant


@override_settings(CATALOG_USE_DB=True)
class CategoryFilterTests(TestCase):
    # 실제 메뉴 category 기반 단일·복수 필터 및 페이지 검증
    def setUp(self):
        self.restaurant = Restaurant.objects.create(place_id='category-store', name='분류 테스트 매장')
        for index, category in enumerate(MENU_CATEGORIES):
            Menu.objects.create(preprocess_row_id=f'category-{index}', restaurant=self.restaurant,
                                name=f'{category} 테스트 메뉴', category=category, price_amount=1000 * (index + 1))
        Menu.objects.create(preprocess_row_id='uncategorized', restaurant=self.restaurant,
                            name='분류 없음', category='')

    def test_category_choices_and_method(self):
        response = self.client.get('/api/menu-categories')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['categories'], list(MENU_CATEGORIES))
        self.assertEqual(self.client.post('/api/menu-categories').status_code, 405)

    def test_each_category_and_other(self):
        for category in MENU_CATEGORIES:
            with self.subTest(category=category):
                result = self.client.get('/api/menus', {'category': category}).json()
                self.assertEqual(result['pagination']['total'], 1)
                self.assertEqual(result['results'][0]['category'], category)
        self.assertEqual(self.client.get('/api/menus', {'category': '없는 분류'}).json()['results'], [])
        self.assertEqual(self.client.get('/api/menus', {'category': ''}).json()['pagination']['total'], 8)

    def test_multiple_categories_sort_filter_before_page(self):
        response = self.client.get('/api/menus', {'category': ['한식', '중식', '한식'], 'sort': 'price_desc', 'limit': 1})
        result = response.json()
        self.assertEqual(result['pagination']['total'], 2)
        self.assertEqual(result['results'][0]['category'], '중식')
        second = self.client.get('/api/menus', {'category': ['한식', '중식'], 'sort': 'price_desc', 'limit': 1, 'page': 2}).json()
        self.assertEqual(second['results'][0]['category'], '한식')
        self.assertEqual(self.client.get('/api/menus', {'category': ' 한식 ', 'q': '테스트', 'max_price': 1000}).json()['pagination']['total'], 1)

    def test_dietary_sort_and_personalization(self):
        result = self.client.get('/api/menus', {'category': ['한식', '카페'], 'sort': 'dietary', 'personalize': 'true'}).json()
        self.assertEqual(result['pagination']['total'], 2)
        self.assertEqual({r['category'] for r in result['results']}, {'한식', '카페'})
        self.assertTrue(all('judgement' in r and 'saved' in r for r in result['results']))

    def test_restaurant_menu_category_filter(self):
        path = f'/api/restaurants/{self.restaurant.pk}/menus'
        result = self.client.get(path, {'category': ['일식', '양식'], 'limit': 1}).json()
        self.assertEqual(result['pagination']['total'], 2)
        self.assertEqual(len(result['results']), 1)
        self.assertEqual(self.client.get(path, {'category': '없는 분류'}).json()['results'], [])

    def test_category_input_limits(self):
        for path in ['/api/menus', f'/api/restaurants/{self.restaurant.pk}/menus']:
            self.assertEqual(self.client.get(path, {'category': '가' * 51}).status_code, 400)
            self.assertEqual(self.client.get(path, {'category': ['한식'] * 21}).status_code, 400)
