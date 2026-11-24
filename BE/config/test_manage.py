import json
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client, TestCase

from catalog.models import Restaurant, Menu, InformationReport, ReportEvent, FoodDeclaration, CatalogSource, MenuAnalysisReference
from dietary.models import Criterion, Profile, Review, SupportRule


class ManageTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser('operator', email='operator@example.com', password='test-only-password')
        self.client.force_login(self.admin)
        self.restaurant = Restaurant.objects.create(place_id='store', name='기존 매장')
        self.menu = Menu.objects.create(preprocess_row_id='menu', restaurant=self.restaurant, name='메뉴')

    def send(self, path, body, method='patch'):
        return getattr(self.client, method)('/api/manage/' + path, json.dumps(body), content_type='application/json')

    def test_staff_and_model_permissions(self):
        anonymous = Client()
        self.assertEqual(anonymous.get('/api/manage/menus').status_code, 401)
        employee = get_user_model().objects.create_user('staff', is_staff=True)
        self.client.force_login(employee)
        self.assertEqual(self.client.get('/api/manage/menus').status_code, 403)
        employee.user_permissions.add(Permission.objects.get(codename='view_menu', content_type__app_label='catalog'))
        self.assertEqual(self.client.get('/api/manage/menus').status_code, 200)
        self.assertEqual(self.send('menus/menu', {'name': '변경'}).status_code, 403)

    def test_login_csrf_rotation_and_logout(self):
        browser = Client(enforce_csrf_checks=True)
        token = browser.get('/api/manage/session').json()['csrf']
        self.assertEqual(browser.post('/api/manage/login', {'email': 'operator@example.com', 'password': 'test-only-password'}, content_type='application/json').status_code, 403)
        response = browser.post('/api/manage/login', {'email': 'operator@example.com', 'password': 'test-only-password'}, content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertTrue(response.json()['authenticated'])
        rotated = response.json()['csrf']
        self.assertEqual(browser.post('/api/manage/logout', HTTP_X_CSRFTOKEN=rotated).status_code, 200)
        self.assertEqual(browser.get('/api/manage/menus').status_code, 401)

    def test_email_login_normalization_and_invalid_credentials(self):
        self.client.logout()
        self.assertEqual(self.send('login', {'email': ' OPERATOR@EXAMPLE.COM ', 'password': 'test-only-password'}, 'post').status_code, 200)
        self.client.logout()
        self.assertEqual(self.send('login', {'email': 'operator@example.com', 'password': 'wrong'}, 'post').status_code, 401)
        self.assertEqual(self.send('login', {'username': 'operator', 'password': 'test-only-password'}, 'post').status_code, 400)
        self.assertEqual(self.send('login', {'email': 'invalid', 'password': 'test-only-password'}, 'post').status_code, 400)

    def test_duplicate_email_is_rejected(self):
        get_user_model().objects.create_user('duplicate', email='OPERATOR@example.com', password='another-password', is_staff=True)
        self.client.logout()
        self.assertEqual(self.send('login', {'email': 'operator@example.com', 'password': 'test-only-password'}, 'post').status_code, 401)
        self.assertFalse(self.client.get('/api/manage/session').json()['authenticated'])

    def test_nonstaff_and_inactive_email_login_is_rejected(self):
        self.client.logout()
        for field in ['is_staff', 'is_active']:
            with self.subTest(field=field):
                setattr(self.admin, field, False)
                self.admin.save()
                self.assertEqual(self.send('login', {'email': 'operator@example.com', 'password': 'test-only-password'}, 'post').status_code, 401)
                setattr(self.admin, field, True)

    def test_menu_validation_and_immutable_identity(self):
        self.assertEqual(self.send('menus/menu', {'price_amount': -1}).status_code, 400)
        self.assertEqual(self.send('menus/menu', {'restaurant': 'other'}).status_code, 400)
        self.assertEqual(self.send('menus/menu', {'name': '변경 메뉴', 'price_amount': 5000}).status_code, 200)
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.price_amount, 5000)
        self.assertTrue(self.admin.logentry_set.exists())

    def test_existing_reference_allergens_are_visible_without_declarations(self):
        MenuAnalysisReference.objects.create(menu=self.menu, public_allergens='밀 | 대두')
        response = self.client.get('/api/manage/menus')
        row = response.json()['results'][0]
        self.assertEqual(row['reference_allergens'], '밀 | 대두')
        self.assertEqual(row['allergens'], [])
        self.assertEqual(self.send('menus/menu', {'allergens': []}).status_code, 200)
        self.assertEqual(self.client.get('/api/manage/menus/menu').json()['reference_allergens'], '')

    def test_menu_allergen_add_edit_delete(self):
        source = CatalogSource.objects.create(title='매장 확인', source_type='store')
        row = {'name_raw': '우유', 'canonical_tag': 'milk', 'presence': 'present',
               'verification_status': 'verified', 'source_id': source.pk,
               'confirmed_at': '2026-11-25T00:00:00+09:00', 'unknown_scope': '', 'applicability_scope': '메뉴'}
        response = self.send('menus/menu', {'allergens': [row]})
        self.assertEqual(response.status_code, 200, response.content)
        saved = response.json()['allergens'][0]
        self.assertEqual(saved['canonical_tag'], 'milk')
        self.assertEqual(self.client.get('/api/manage/menus/menu').json()['allergens'], [saved])
        saved['presence'] = 'absent'
        self.assertEqual(self.send('menus/menu', {'allergens': [saved]}).status_code, 200)
        self.assertEqual(FoodDeclaration.objects.get(pk=saved['id']).presence, 'absent')
        ingredient = FoodDeclaration.objects.create(menu=self.menu, kind='ingredient', name_raw='양파')
        self.assertEqual(self.send('menus/menu', {'allergens': []}).status_code, 200)
        self.assertTrue(FoodDeclaration.objects.filter(pk=ingredient.pk).exists())
        self.assertFalse(self.menu.declarations.filter(kind='allergen').exists())

    def test_invalid_allergens_roll_back_menu_and_declarations(self):
        row = {'name_raw': '우유', 'canonical_tag': 'milk', 'presence': 'present', 'verification_status': 'unverified'}
        for bad in [None, {}, [row, dict(row, verification_status='verified')], [dict(row, id=999)], [dict(row, canonical_tag='invalid')]]:
            with self.subTest(bad=bad):
                response = self.send('menus/menu', {'name': '변경 금지', 'allergens': bad})
                self.assertEqual(response.status_code, 400, response.content)
                self.menu.refresh_from_db()
                self.assertEqual(self.menu.name, '메뉴')
                self.assertFalse(self.menu.declarations.exists())

    def test_allergen_cannot_edit_another_menu_and_requires_menu_permission(self):
        other = Menu.objects.create(preprocess_row_id='other', restaurant=self.restaurant, name='다른 메뉴')
        declaration = FoodDeclaration.objects.create(menu=other, kind='allergen', name_raw='우유')
        self.assertEqual(self.send('menus/menu', {'allergens': [{'id': declaration.pk}]}).status_code, 400)
        employee = get_user_model().objects.create_user('allergen-reader', is_staff=True)
        employee.user_permissions.add(Permission.objects.get(codename='view_menu', content_type__app_label='catalog'))
        self.client.force_login(employee)
        self.assertEqual(self.client.get('/api/manage/allergen-options').status_code, 200)
        self.assertEqual(self.send('menus/menu', {'allergens': []}).status_code, 403)

    def test_criteria_registration_and_deactivation(self):
        response = self.send('criteria', {'code': 'test-milk', 'name': '우유', 'kind': 'allergen', 'category': '', 'active': True}, 'post')
        self.assertEqual(response.status_code, 201)
        pk = response.json()['id']
        self.assertEqual(self.send('criteria/' + pk, {'active': False}).status_code, 200)
        self.assertFalse(Criterion.objects.get(pk=pk).active)
        self.assertEqual(self.send('criteria/' + pk, {'kind': 'ingredient'}).status_code, 400)

    def test_report_uses_existing_workflow_and_records_event(self):
        report = InformationReport.objects.create(menu=self.menu, category='menu_price', content='가격 오류', proposed_changes={'price_amount': 7000})
        response = self.send(f'reports/{report.pk}', {'action': 'apply', 'review_notes': '매장 확인'}, 'post')
        self.assertEqual(response.status_code, 200)
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.price_amount, 7000)
        self.assertEqual(ReportEvent.objects.get(report=report).action, 'apply')
        self.assertEqual(self.send(f'reports/{report.pk}', {'action': 'reject', 'review_notes': '재처리'}, 'post').status_code, 400)

    def test_failed_report_action_rolls_back_notes(self):
        report = InformationReport.objects.create(menu=self.menu, category='ingredients_allergens', content='성분 오류')
        self.assertEqual(self.send(f'reports/{report.pk}', {'action': 'apply', 'review_notes': '자동 처리 금지'}, 'post').status_code, 400)
        report.refresh_from_db()
        self.assertEqual(report.review_notes, '')
        self.assertEqual(report.status, 'pending')

    def test_rule_validation_and_creation(self):
        criterion = Criterion.objects.create(code='test', name='테스트', kind='allergen', active=False)
        body = {'criterion': criterion.pk, 'excluded_tags': ['milk'], 'source': '매장 확인', 'enabled': True}
        response = self.send('rules', body, 'post')
        self.assertEqual(response.status_code, 201)
        rule = SupportRule.objects.get(criterion=criterion)
        self.assertEqual(rule.excluded_tags, ['milk'])
        self.assertEqual(self.send(f'rules/{rule.pk}', {'excluded_tags': []}).status_code, 400)
        self.assertEqual(self.send(f'rules/{rule.pk}', {'criterion': criterion.pk}).status_code, 400)

    def test_review_delete_is_audited_and_catalog_delete_denied(self):
        profile = Profile.objects.create(guest_id=uuid.uuid4())
        review = Review.objects.create(profile=profile, menu_id=self.menu.pk, body='리뷰')
        response = self.client.delete(f'/api/manage/reviews/{review.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Review.objects.filter(pk=review.pk).exists())
        self.assertTrue(self.admin.logentry_set.filter(action_flag=3).exists())
        self.assertEqual(self.client.delete('/api/manage/menus/menu').status_code, 400)
