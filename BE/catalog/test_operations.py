import json
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase, Client, override_settings
from django.utils import timezone

from dietary.catalog import get_catalog
from .db_repository import DatabaseCatalogRepository
from .models import (Restaurant, Menu, CatalogSource, BusinessHours, Closure, MenuComponent,
    OptionGroup, FoodDeclaration, InformationReport, ReportEvent)
from .operations import operating_status, apply_report, review_report


@override_settings(CATALOG_USE_DB=True)
class CatalogOperationsTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(place_id='100', name='테스트 식당', address='아산시 배방읍',
            category='한식', latitude=36.78, longitude=127.05, phone='041-000-0000')
        self.menu = Menu.objects.create(preprocess_row_id='menus_stable', name='메뉴', restaurant=self.restaurant,
            price_amount=10000, data={'price_raw': '10000', 'price_amount': 10000})
        self.source = CatalogSource.objects.create(title='매장 확인', source_type='store', url='https://example.com/menu',
            checked_at=timezone.now() - timedelta(days=1), valid_until=timezone.now() + timedelta(days=365))

    def client_session(self):
        client = Client(enforce_csrf_checks=True)
        token = client.get('/api/session').json()['csrf_token']
        return client, token

    def send(self, client, token, path, data, method='post', expected=200):
        response = getattr(client, method)(path, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, expected, response.content)
        return response.json()

    def hours(self):
        self.restaurant.hours_source = self.source
        self.restaurant.hours_confirmed_at = self.source.checked_at
        self.restaurant.save()
        for day in range(7):
            BusinessHours.objects.create(restaurant=self.restaurant, weekday=day, opens_at=time(9), closes_at=time(21),
                break_start=time(14), break_end=time(15))

    def test_hours_unknown_open_break_closed_and_holiday(self):
        local = ZoneInfo('Asia/Seoul')
        moment = datetime(2026, 11, 23, 10, tzinfo=local)
        self.assertEqual(operating_status(self.restaurant, moment), 'unknown')
        # Keep evidence valid at the fixed scenario time, independent of today's date.
        self.source.checked_at = moment - timedelta(days=1)
        self.source.valid_until = moment + timedelta(days=365)
        self.source.save()
        self.hours()
        for hour, status in [(10, 'open'), (14, 'break'), (15, 'open'), (21, 'closed'), (8, 'closed')]:
            self.assertEqual(operating_status(self.restaurant, moment.replace(hour=hour)), status)
        Closure.objects.create(restaurant=self.restaurant, date=moment.date(), source=self.source)
        self.assertEqual(operating_status(self.restaurant, moment), 'closed')
        self.source.valid_until = moment - timedelta(days=1)
        self.source.save()
        self.restaurant.refresh_from_db()
        self.assertEqual(operating_status(self.restaurant, moment), 'unknown')

    def test_overnight_and_hours_validation(self):
        moment = datetime(2026, 11, 24, 1, tzinfo=ZoneInfo('Asia/Seoul'))
        # Keep evidence valid at the fixed scenario time, independent of today's date.
        self.source.checked_at = moment - timedelta(days=1)
        self.source.valid_until = moment + timedelta(days=365)
        self.source.save()
        self.hours()
        monday = self.restaurant.business_hours.get(weekday=0)
        monday.opens_at, monday.closes_at, monday.closes_next_day = time(22), time(2), True
        monday.break_start, monday.break_end = time(0), time(0, 30)
        monday.full_clean()
        monday.save()
        self.assertEqual(operating_status(self.restaurant, moment), 'open')
        monday.break_end = time(12)
        with self.assertRaises(ValidationError):
            monday.full_clean()

    def test_filters_distance_and_unknown_coordinates(self):
        Restaurant.objects.create(place_id='200', name='미확인', address='서울', category='양식')
        data = self.client.get('/api/menus', {'region': '아산', 'lat': '36.78', 'lng': '127.05',
            'radius_km': '1', 'sort': 'distance_asc'}).json()
        self.assertEqual(data['results'][0]['menu_id'], self.menu.pk)
        self.assertEqual(data['results'][0]['distance_km'], 0)
        self.assertEqual(self.client.get('/api/restaurants', {'open_now': 'true'}).json()['results'], [])
        with patch('catalog.db_repository.operating_status', return_value='open'):
            results = self.client.get('/api/restaurants', {'category': '한식', 'region': '아산', 'open_now': 'true',
                'min_price': 9000, 'max_price': 11000, 'sort': 'price_asc'}).json()['results']
            self.assertEqual([r['restaurant_id'] for r in results], ['100'])
        self.assertEqual(self.client.get('/api/menus', {'lat': 'nan', 'lng': 0}).status_code, 400)
        self.assertEqual(self.client.get('/api/restaurants', {'open_now': 'yes'}).status_code, 400)

    def test_admin_edits_override_snapshot_and_menu_contract(self):
        self.menu.name, self.menu.price_amount, self.menu.description = '수정 메뉴', None, '확인 중'
        self.menu.save()
        listing = self.client.get('/api/menus').json()['results'][0]
        detail = self.client.get('/api/menus/' + self.menu.pk).json()
        branch = self.client.get('/api/restaurants/100/menus').json()['results'][0]
        for item in [listing, detail, branch]:
            self.assertEqual(item['menu_name'], '수정 메뉴')
            self.assertEqual(item['price'], {'raw': None, 'amount': None, 'currency': 'KRW', 'status': 'unknown'})
            self.assertEqual(item['restaurant']['restaurant_id'], '100')
            self.assertEqual(item['branch_sale_status'], 'unverified')
        self.assertEqual(self.client.get('/api/menus', {'min_price': 1}).json()['results'], [])

    def test_option_constraints_and_b_order_components(self):
        group = OptionGroup.objects.create(menu=self.menu, name='소스 선택', min_select=1, max_select=1)
        sauce = MenuComponent.objects.create(menu=self.menu, group=group, name='소스', role='sauce')
        mid = 'component:' + str(sauce.pk)
        self.assertIsNotNone(get_catalog().get_component(mid))
        self.assertIsNone(get_catalog().get_component('component:invalid'))
        client, token = self.client_session()
        self.send(client, token, '/api/profile', {'criteria': ['allergen-milk']}, 'put')
        self.assertFalse(self.send(client, token, '/api/menus/' + self.menu.pk + '/options/check', {'component_ids': []})['valid'])
        self.assertTrue(self.send(client, token, '/api/menus/' + self.menu.pk + '/options/check', {'component_ids': [mid]})['valid'])
        self.send(client, token, '/api/menus/' + self.menu.pk + '/options/check', {'component_ids': [mid, mid]}, expected=400)
        self.assertEqual(self.send(client, token, '/api/orders/check', {'components': [
            {'id': self.menu.pk, 'role': 'menu'}, {'id': mid, 'role': 'sauce'}]})['status'], 'needs_check')
        other = Menu.objects.create(preprocess_row_id='other', restaurant=self.restaurant, name='다른 메뉴')
        with self.assertRaises(ValidationError):
            MenuComponent(menu=other, group=group, name='잘못된 연결', role='sauce').full_clean()

    def test_confirmed_evidence_and_default_component_absence(self):
        fact = FoodDeclaration.objects.create(menu=self.menu, kind='allergen', name_raw='우유', canonical_tag='milk',
            presence='absent', verification_status='verified', source=self.source, confirmed_at=self.source.checked_at)
        client, token = self.client_session()
        self.send(client, token, '/api/profile', {'criteria': ['allergen-milk']}, 'put')
        judge = lambda: self.send(client, token, '/api/judgements', {'menu_id': self.menu.pk})['status']
        self.assertEqual(judge(), 'match')
        component = MenuComponent.objects.create(menu=self.menu, name='기본 소스', role='sauce', is_default=True)
        self.assertEqual(judge(), 'needs_check')
        FoodDeclaration.objects.create(component=component, kind='allergen', name_raw='우유', canonical_tag='milk',
            presence='present', verification_status='verified', source=self.source, confirmed_at=self.source.checked_at)
        self.assertEqual(judge(), 'mismatch')
        self.source.valid_until = timezone.now() - timedelta(hours=1)
        self.source.save()
        self.assertEqual(judge(), 'needs_check')
        fact.verification_status = 'unverified'
        fact.save()
        self.assertEqual(get_catalog().get_component(self.menu.pk)['absent_tags'], [])

    def test_report_csrf_ownership_validation_and_no_auto_application(self):
        client, token = self.client_session()
        body = {'menu_id': self.menu.pk, 'category': 'menu_price', 'content': '가격 수정',
                'proposed_changes': {'price_amount': 12000}}
        self.assertEqual(client.post('/api/reports', json.dumps(body), content_type='application/json').status_code, 403)
        report = self.send(client, token, '/api/reports', body, expected=201)
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.price_amount, 10000)
        self.assertEqual(client.get('/api/reports/' + str(report['report_id'])).status_code, 200)
        other, other_token = self.client_session()
        self.assertEqual(other.get('/api/reports').json()['results'], [])
        self.assertEqual(other.get('/api/reports/' + str(report['report_id'])).status_code, 404)
        self.send(client, token, '/api/reports', dict(body, status='resolved'), expected=400)
        self.send(client, token, '/api/reports', dict(body, menu_id='missing'), expected=404)
        self.send(client, token, '/api/reports', dict(body, restaurant_id='missing'), expected=404)

    def test_report_review_permission_and_application(self):
        report = InformationReport.objects.create(menu=self.menu, category='menu_price', content='수정',
            proposed_changes={'price_amount': 12000}, review_notes='가격표 확인')
        user = get_user_model().objects.create_user('reviewer', is_staff=True)
        with self.assertRaises(PermissionDenied):
            apply_report(report.pk, user)
        user.user_permissions.add(*Permission.objects.filter(content_type__app_label='catalog',
            codename__in=['change_informationreport', 'change_menu']))
        user = get_user_model().objects.get(pk=user.pk)
        apply_report(report.pk, user)
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.price_amount, 12000)
        self.assertEqual(self.client.get('/api/menus/' + self.menu.pk).json()['price']['amount'], 12000)
        report.refresh_from_db()
        self.assertEqual(report.status, 'resolved')
        self.assertEqual(report.reviewed_by_id, user.pk)
        event = ReportEvent.objects.get(report=report, action='apply')
        self.assertEqual(event.before, {'price_amount': 10000})
        self.assertEqual(event.after, {'price_amount': 12000})

    def test_review_rejection_audit_is_permission_protected(self):
        user = get_user_model().objects.create_user('audit-reviewer', is_staff=True)
        report = InformationReport.objects.create(menu=self.menu, category='other', content='확인', review_notes='검토 기록')
        with self.assertRaises(PermissionDenied):
            review_report(report.pk, user, 'reject')
        user.user_permissions.add(Permission.objects.get(content_type__app_label='catalog', codename='change_informationreport'))
        user = get_user_model().objects.get(pk=user.pk)
        review_report(report.pk, user, 'review')
        review_report(report.pk, user, 'reject')
        self.assertEqual(ReportEvent.objects.filter(report=report).count(), 2)
        self.assertEqual(ReportEvent.objects.get(report=report, action='reject').before, {'status': 'reviewing'})
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.price_amount, 10000)

    @override_settings(STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
    })
    def test_personalized_menu_and_admin_permissions(self):
        client, token = self.client_session()
        self.send(client, token, '/api/profile', {'criteria': ['allergen-milk']}, 'put')
        self.send(client, token, '/api/favorites', {'menu_id': self.menu.pk}, expected=201)
        item = client.get('/api/menus', {'personalize': 'true'}).json()['results'][0]
        self.assertTrue(item['saved'])
        self.assertEqual(item['judgement']['status'], 'needs_check')
        self.assertEqual(self.client.get('/admin/catalog/menu/').status_code, 302)
        staff = get_user_model().objects.create_user('staff', is_staff=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get('/admin/catalog/menu/').status_code, 403)
        staff.user_permissions.add(Permission.objects.get(content_type__app_label='catalog', codename='view_menu'))
        self.assertEqual(self.client.get('/admin/catalog/menu/').status_code, 200)
        for model in [Restaurant, Menu, CatalogSource, MenuComponent, FoodDeclaration, InformationReport]:
            self.assertIn(model, admin.site._registry)
