"""외부 알레르겐 CSV 기반 격리 테스트"""
import csv
import hashlib
import io
import json
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from unittest import skipUnless

from django.core.management import call_command
from django.test import TestCase, override_settings

from catalog.adapters import DietaryCatalog
from catalog.allergen_import import match_rows, source_info
from catalog.models import AllergenLink, FoodDeclaration, Menu, Restaurant
from .models import Criterion
from .services import EvaluationContext, evaluate

CSV_PATH = os.getenv('DIETARY_TEST_ALLERGEN_CSV', '')


@skipUnless(CSV_PATH, 'Set DIETARY_TEST_ALLERGEN_CSV for external CSV tests')
@override_settings(CATALOG_USE_DB=True, DIETARY_CATALOG_ADAPTER='catalog.adapters.DietaryCatalog')
class ExternalAllergenCSVTests(TestCase):
    # 실제 파일 읽기 전용, 테스트 DB 한정 메뉴·매핑
    def setUp(self):
        self.path = Path(CSV_PATH)
        self.digest = hashlib.sha256(self.path.read_bytes()).hexdigest()
        with self.path.open(encoding='utf-8-sig', newline='') as source:
            self.rows = list(csv.DictReader(source))
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.brand_path = Path(self.directory.name) / 'test_brand_identity.csv'

    def tearDown(self):
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), self.digest)

    def brands(self, values):
        with self.brand_path.open('w', encoding='utf-8-sig', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=['place_id', '브랜드'])
            writer.writeheader()
            writer.writerows({'place_id': pk, '브랜드': brand} for pk, brand in values)

    def import_in_test_db(self, dry_run=False):
        output = io.StringIO()
        call_command('import_catalog_allergens', allergens=str(self.path),
                     brand_restaurants=str(self.brand_path), dry_run=dry_run, stdout=output)
        return json.loads(output.getvalue())

    def test_full_csv_candidate_and_source_classification(self):
        brands = {brand: str(index + 90000000) for index, brand in enumerate(sorted({r['brand'] for r in self.rows}))}
        self.brands([(pk, brand) for brand, pk in brands.items()])
        menus = [{'menu_id': f'test-row-{i}', 'menu_name': row['menu_name_raw'],
                  'restaurant_id': brands[row['brand']]} for i, row in enumerate(self.rows)]
        matches, stats = match_rows(menus, str(self.path), str(self.brand_path))
        self.assertEqual(len(matches) + stats['ambiguous_menu'] + stats['no_exact_menu'] + stats['no_unambiguous_brand'], len(self.rows))
        self.assertTrue(matches)
        self.assertGreater(stats['ambiguous_menu'], 0)
        verified = [item for item in matches if item[5]]
        self.assertTrue(verified)
        self.assertTrue(all(source_info(item[1], item[2])[2] for item in verified))
        print('EXTERNAL_CSV_MAPPING', json.dumps({'rows': len(self.rows), 'stats': dict(stats),
              'eligible_brands': dict(Counter(item[2] for item in verified))}, ensure_ascii=False))

    def test_real_cyburger_mapping_two_branches_and_allergy_verdicts(self):
        row = next(r for r in self.rows if r['brand'] == '맘스터치' and r['menu_name_raw'] == '싸이버거')
        self.brands([('990001', '맘스터치'), ('990002', '맘스터치'), ('990003', '프랭크버거')])
        for index, pk in enumerate(['990001', '990002', '990003']):
            store = Restaurant.objects.create(place_id=pk, name=f'테스트 지점 {index}')
            Menu.objects.create(preprocess_row_id=f'branch-menu-{index}', restaurant=store, name=row['menu_name_raw'])
        self.import_in_test_db(dry_run=True)
        self.assertFalse(AllergenLink.objects.exists())
        self.import_in_test_db()
        self.assertEqual(AllergenLink.objects.count(), 2)
        self.assertEqual(set(AllergenLink.objects.values_list('external_menu_id', flat=True)), {row['menu_id']})
        expected = [(['allergen-shrimp'], 'match'), (['allergen-soy'], 'mismatch'),
                    (['allergen-shrimp', 'allergen-soy'], 'mismatch')]
        report = []
        for conditions, status in expected:
            context = EvaluationContext(None, conditions)
            context.prime(['branch-menu-0', 'branch-menu-1', 'branch-menu-2'])
            for mid in ['branch-menu-0', 'branch-menu-1']:
                self.assertEqual(evaluate(None, mid, context=context)['status'], status)
            self.assertEqual(evaluate(None, 'branch-menu-2', context=context)['status'], 'needs_check')
            report.append({'conditions': conditions, 'status': status})
        print('EXTERNAL_CYBURGER', json.dumps({'allergens': row['allergens_contains_normalized'], 'results': report}, ensure_ascii=False))

    def test_every_eligible_official_row_against_all_17_allergens(self):
        eligible = [r for r in self.rows if source_info(r, r['brand'])[2]]
        brands = {brand: str(index + 98000000) for index, brand in enumerate(sorted({r['brand'] for r in eligible}))}
        self.brands([(pk, brand) for brand, pk in brands.items()])
        Restaurant.objects.bulk_create([Restaurant(place_id=pk, name=brand + ' 테스트점') for brand, pk in brands.items()])
        menus = [Menu(preprocess_row_id=f'official-test-{i}', restaurant_id=brands[r['brand']], name=r['menu_name_raw']) for i, r in enumerate(eligible)]
        Menu.objects.bulk_create(menus)
        self.import_in_test_db()
        total = Counter()
        for criterion in Criterion.objects.filter(kind='allergen', active=True):
            context = EvaluationContext(None, [criterion.code])
            context.prime([m.pk for m in menus])
            for menu, row in zip(menus, eligible):
                with self.subTest(menu=row['menu_name_raw'], condition=criterion.name):
                    tokens = [t.strip() for t in re.split(r'[,;|/\n]+', row['allergens_contains_normalized']) if t.strip()]
                    tags = {DietaryCatalog.TAGS[t] for t in tokens}
                    tags.update({'고등어': 'mackerel', '게': 'crab', '새우': 'shrimp'}[t] for t in tokens if t in {'고등어', '게', '새우'})
                    expected = 'mismatch' if set(criterion.rule.excluded_tags) & tags else 'match'
                    verdict = evaluate(None, menu.pk, context=context)
                    self.assertEqual(verdict['status'], expected)
                    total[verdict['status']] += 1
        print('EXTERNAL_OFFICIAL_VERDICTS', json.dumps({'menus': len(menus), 'checks': sum(total.values()), 'results': dict(total)}, ensure_ascii=False))

    def test_official_reference_row_uses_confirmed_allergen_list(self):
        row = next(r for r in self.rows if r['brand'] == '60계치킨' and r['menu_name_raw'] == '감자치즈전')
        self.brands([('970001', row['brand'])])
        store = Restaurant.objects.create(place_id='970001', name='테스트 매장')
        menu = Menu.objects.create(preprocess_row_id='unreviewed-test', restaurant=store, name=row['menu_name_raw'])
        self.import_in_test_db()
        self.assertEqual(AllergenLink.objects.get().status, 'reference')
        context = EvaluationContext(None, ['allergen-milk'])
        self.assertEqual(evaluate(None, menu.pk, context=context)['status'], 'mismatch')
        context = EvaluationContext(None, ['allergen-soy'])
        self.assertEqual(evaluate(None, menu.pk, context=context)['status'], 'match')
        self.assertFalse(FoodDeclaration.objects.filter(verification_status='verified').exists())
