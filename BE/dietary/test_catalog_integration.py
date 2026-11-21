from datetime import timedelta

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from catalog.models import CatalogSource, FoodDeclaration, Menu, MenuComponent, Restaurant
from .catalog_info import component_summaries
from .models import Favorite, Profile, Criterion


@override_settings(CATALOG_USE_DB=True, DIETARY_CATALOG_ADAPTER='catalog.adapters.DietaryCatalog')
class CatalogIntegrationTests(TestCase):
    # A 실제 모델 기반 B API 통합 검증
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get('/api/session').json()['csrf_token']
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.restaurant = Restaurant.objects.create(place_id='r1', name='테스트 매장')
        self.menu = Menu.objects.create(preprocess_row_id='m1', restaurant=self.restaurant,
                                        name='두부 샐러드', price_amount=9000)
        self.source = CatalogSource.objects.create(title='매장 성분 확인', source_type='store',
            evidence_locator='성분표 1쪽', checked_at=timezone.now() - timedelta(hours=1))

    def send(self, path, body):
        return self.client.post(path, body, content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def declaration(self, presence, component=None, **kwargs):
        return FoodDeclaration.objects.create(menu=None if component else self.menu,
            component=component, kind='allergen', name_raw='우유', canonical_tag='milk',
            presence=presence, source=self.source, verification_status='verified',
            confirmed_at=timezone.now() - timedelta(minutes=30), **kwargs)

    def favorite(self):
        response = self.send('/api/favorites', {'menu_id': self.menu.pk})
        self.assertEqual(response.status_code, 201)
        return response.json()['id']

    def test_favorite_current_metadata_and_declaration_changes(self):
        self.favorite()
        declaration = self.declaration('absent')
        entry = self.client.get('/api/favorites').json()['favorites'][0]
        self.assertEqual(entry['menu']['name'], '두부 샐러드')
        self.assertEqual(entry['menu']['price']['amount'], 9000)
        self.assertEqual(entry['menu']['restaurant']['restaurant_name'], '테스트 매장')
        self.assertEqual(entry['judgement']['status'], 'match')
        self.assertTrue(entry['judgement']['sources'])
        self.menu.name, self.menu.price_amount = '변경 메뉴', 10000
        self.menu.save()
        declaration.presence = 'present'
        declaration.save()
        entry = self.client.get('/api/favorites').json()['favorites'][0]
        self.assertEqual(entry['menu']['name'], '변경 메뉴')
        self.assertEqual(entry['menu']['price']['amount'], 10000)
        self.assertEqual(entry['judgement']['status'], 'mismatch')
        self.profile.criteria.clear()
        self.assertEqual(self.client.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'match')

    def test_missing_favorite_preserved_and_null_price_is_unknown(self):
        Favorite.objects.create(profile=self.profile, menu_id='deleted-menu')
        entry = self.client.get('/api/favorites').json()['favorites'][0]
        self.assertIsNone(entry['menu'])
        self.assertEqual(entry['catalog_status'], 'unavailable')
        self.assertEqual(entry['judgement']['status'], 'needs_check')
        self.menu.price_amount = None
        self.menu.save()
        self.assertEqual(component_summaries(['m1'])['m1']['price']['status'], 'unknown')

    def test_default_and_optional_components_in_order_and_message(self):
        self.declaration('absent')
        sauce = MenuComponent.objects.create(menu=self.menu, name='우유 소스', role='sauce')
        self.declaration('present', component=sauce)
        component_id = 'component:' + str(sauce.pk)
        parts = [{'id': 'm1', 'role': 'menu'}, {'id': component_id, 'role': 'sauce'}]
        result = self.send('/api/orders/check', {'components': parts}).json()
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual([c['status'] for c in result['components']], ['match', 'mismatch'])
        result = self.send('/api/communication', {'components': parts}).json()
        self.assertIn('두부 샐러드, 우유 소스', result['text'])
        self.assertNotIn(component_id, result['text'])
        self.assertEqual(result['order']['components'][1]['name'], '우유 소스')
        sauce.is_default = True
        sauce.save()
        self.assertEqual(self.send('/api/judgements', {'menu_id': 'm1'}).json()['status'], 'mismatch')

    def test_unverified_expired_and_incomplete_absence_need_check(self):
        declaration = self.declaration('absent')
        for field, value, reset in [('verification_status', 'unverified', 'verified'),
                                     ('unknown_scope', '소스 미확인', '')]:
            setattr(declaration, field, value)
            declaration.save()
            self.assertEqual(self.send('/api/judgements', {'menu_id': 'm1'}).json()['status'], 'needs_check')
            setattr(declaration, field, reset)
            declaration.save()
        self.source.valid_until = timezone.now() - timedelta(minutes=1)
        self.source.save()
        self.assertEqual(self.send('/api/judgements', {'menu_id': 'm1'}).json()['status'], 'needs_check')

    def test_missing_component_message_and_metadata_batch_queries(self):
        parts = [{'id': 'missing', 'role': 'menu'}, {'id': 'component:invalid', 'role': 'sauce'}]
        result = self.send('/api/communication', {'components': parts})
        self.assertEqual(result.status_code, 200)
        self.assertIn('이름 미확인 구성', result.json()['text'])
        self.assertEqual(result.json()['status'], 'needs_check')
        sauce = MenuComponent.objects.create(menu=self.menu, name='소스', role='sauce')
        ids = ['m1', 'component:' + str(sauce.pk)] * 20
        with self.assertNumQueries(2):
            self.assertEqual(len(component_summaries(ids)), 2)

    def test_same_judgement_across_endpoints_and_owner_protection(self):
        self.declaration('present')
        fid = self.favorite()
        self.assertEqual(self.send('/api/judgements', {'menu_id': 'm1'}).json()['status'], 'mismatch')
        self.assertEqual(self.send('/api/recommendations/rank', {'menu_ids': ['m1']}).json()['results'][0]['status'], 'mismatch')
        self.assertEqual(self.client.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'mismatch')
        other = Client(enforce_csrf_checks=True)
        token = other.get('/api/session').json()['csrf_token']
        self.assertEqual(other.get('/api/favorites').json()['favorites'], [])
        self.assertEqual(other.delete(f'/api/favorites/{fid}', HTTP_X_CSRFTOKEN=token).status_code, 404)

    def test_option_uuid_aliases_keep_name_and_judgement(self):
        # 대문자·하이픈 생략 UUID의 표시 이름 및 판정 일관성
        sauce = MenuComponent.objects.create(menu=self.menu, name='우유 소스', role='sauce')
        self.declaration('present', component=sauce)
        canonical = 'component:' + str(sauce.pk)
        aliases = [canonical, 'component:' + str(sauce.pk).upper(),
                   'component:' + sauce.pk.hex, 'component:' + sauce.pk.hex.upper()]
        with self.assertNumQueries(1):
            summaries = component_summaries(aliases)
        for alias in aliases:
            with self.subTest(alias=alias):
                self.assertEqual(summaries[alias]['name'], '우유 소스')
                self.assertEqual(summaries[alias]['component_id'], canonical)
                result = self.send('/api/communication', {
                    'components': [{'id': alias, 'role': 'sauce'}]})
                self.assertEqual(result.status_code, 200)
                body = result.json()
                self.assertEqual(body['status'], 'mismatch')
                self.assertEqual(body['order']['components'][0]['name'], '우유 소스')
                self.assertIn('선택 구성: 우유 소스', body['text'])
                self.assertNotIn('이름 미확인', body['text'])
