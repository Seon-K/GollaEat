import uuid
from unittest.mock import patch

from django.test import TestCase, override_settings

from dietary.catalog import get_catalog
from dietary.models import Criterion, Profile
from dietary.services import evaluate


@override_settings(CATALOG_USE_DB=False)
class DietaryAdapterTests(TestCase):
    def test_csv_boundary_and_existing_judgement(self):
        menu = {
            'brand': 'test', 'menu_name': 'test',
            'source': {'source_url': 'https://example.com/menu'},
            'verification': {'verification_status': 'official_image_visual_checked'},
            'allergen_information': {'allergens_contains_normalized': '우유,새우'},
        }
        profile = Profile.objects.create(guest_id=uuid.uuid4())
        profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        with patch('catalog.adapters.CsvCatalogRepository.get_menu', return_value=menu):
            component = get_catalog().get_component('real-csv-id')
            self.assertEqual(component['present_tags'], ['crustacean', 'milk', 'shrimp'])
            self.assertEqual(component['absent_tags'], [])
            self.assertEqual(evaluate(profile, 'real-csv-id')['status'], 'mismatch')
            menu['verification']['verification_status'] = 'auto_extracted_pending_review'
            self.assertEqual(evaluate(profile, 'real-csv-id')['status'], 'needs_check')
            self.assertEqual(get_catalog().get_component('real-csv-id')['present_tags'], [])
            menu['verification']['verification_status'] = 'official_image_visual_checked'
            menu['source'] = {}
            self.assertEqual(evaluate(profile, 'real-csv-id')['status'], 'needs_check')
        with patch('catalog.adapters.CsvCatalogRepository.get_menu', return_value=None):
            self.assertIsNone(get_catalog().get_component('missing'))
