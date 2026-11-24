import uuid
from django.test import TestCase, override_settings
from django.utils import timezone
from dietary.models import Profile, Criterion
from .models import Menu, Restaurant, FoodDeclaration, CatalogSource
from .db_repository import DatabaseCatalogRepository
from .services import list_menus, MenuQueryError


@override_settings(CATALOG_USE_DB=True)
class MenuSearchPriorityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.store = Restaurant.objects.create(place_id='search-store', name='식당', address='아산시', category='한식')
        cls.profile = Profile.objects.create(guest_id=uuid.uuid4())
        cls.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'other-{i:02}', restaurant=cls.store,
            name=f'가 메뉴 {i:02}', category='한식', price_amount=100 + i) for i in range(41)])
        cls.partial = Menu.objects.create(preprocess_row_id='partial', restaurant=cls.store, name='야채김밥', category='한식', price_amount=6000)
        cls.exact = Menu.objects.create(preprocess_row_id='exact', restaurant=cls.store, name='김밥', category='한식', price_amount=9000)
        Menu.objects.create(preprocess_row_id='english', restaurant=cls.store, name='LATTE', category='카페', price_amount=100)
        source = CatalogSource.objects.create(title='Verified', evidence_locator='record', source_type='store', checked_at=timezone.now())
        FoodDeclaration.objects.create(menu=cls.exact, canonical_tag='milk', kind='allergen', name_raw='Milk',
            presence='present', verification_status='verified', source=source, confirmed_at=timezone.now())

    def read(self, **extra):
        return list_menus({'restaurant_id': self.store.pk, 'sort': 'price_asc', 'limit': '20', **extra},
            DatabaseCatalogRepository(), profile=self.profile)

    def test_priority_before_pagination_preserves_all_menus_and_group_sort(self):
        for indexed in (False, True):
            with self.subTest(indexed=indexed), override_settings(CATALOG_DIETARY_INDEX_ENABLED=indexed):
                baseline = self.read()
                pages = [self.read(menu_query='  김밥  ', page=str(p)) for p in (1, 2, 3)]
                ids = [m['menu_id'] for page in pages for m in page['results']]
                self.assertEqual(ids[:2], [self.exact.pk, self.partial.pk])
                baseline_ids = [m['menu_id'] for p in (1, 2, 3) for m in self.read(page=str(p))['results']]
                self.assertEqual(ids[2:], [mid for mid in baseline_ids if mid not in ids[:2]])
                self.assertEqual(len(ids), len(set(ids)))
                self.assertEqual(len(ids), baseline['pagination']['total'])
                self.assertEqual(pages[0]['pagination']['next_page'], 2)

    def test_dietary_and_category_filters_remain_effective(self):
        for indexed in (False, True):
            with self.subTest(indexed=indexed), override_settings(CATALOG_DIETARY_INDEX_ENABLED=indexed):
                filtered = self.read(menu_query='김밥', sort='dietary', category='한식', judgement_status='needs_check', limit='100')
                ids = [m['menu_id'] for m in filtered['results']]
                self.assertEqual(ids[0], self.partial.pk)
                self.assertNotIn(self.exact.pk, ids)
                self.assertEqual(len(ids), 42)
                self.assertTrue(all(m['judgement']['status'] == 'needs_check' for m in filtered['results']))

    def test_empty_or_unmatched_query_preserves_existing_order(self):
        for indexed in (False, True):
            with override_settings(CATALOG_DIETARY_INDEX_ENABLED=indexed):
                original = self.read()
                for text in ('', '  ', '없는 메뉴'):
                    self.assertEqual(self.read(menu_query=text), original)

    def test_casefold_and_existing_q_filter(self):
        for indexed in (False, True):
            with override_settings(CATALOG_DIETARY_INDEX_ENABLED=indexed):
                self.assertEqual(self.read(menu_query='latte')['results'][0]['menu_name'], 'LATTE')
                filtered = self.read(q='김밥', menu_query='김밥')
                self.assertEqual(filtered['pagination']['total'], 2)

    def test_priority_parameter_validation(self):
        with self.assertRaises(MenuQueryError):
            self.read(menu_query='a' * 101)
