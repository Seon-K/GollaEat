from django.test import SimpleTestCase
from .services import serialize_menu_detail


class MenuResponseContractTests(SimpleTestCase):
    def test_common_objects_keep_legacy_fields_and_unknowns(self):
        original = {'menu_id': 'm1', 'price_raw': '가격문의', 'price_amount': None,
                    'restaurant_id': 'r1', 'restaurant_name': '식당',
                    'verification': {'verification_status': 'unmatched'}}
        result = serialize_menu_detail(original)
        self.assertEqual(result['price'], {'raw': '가격문의', 'amount': None,
                                          'currency': 'KRW', 'status': 'unknown'})
        self.assertEqual(result['restaurant']['restaurant_id'], 'r1')
        self.assertEqual(result['price_raw'], original['price_raw'])
        self.assertEqual(result['verification'], original['verification'])
        self.assertEqual(result['branch_sale_status'], 'unverified')
        self.assertNotIn('price', original)
        self.assertIsNone(serialize_menu_detail({'menu_id': 'brand-menu'})['restaurant']['restaurant_id'])
        self.assertIsNone(serialize_menu_detail(None))
