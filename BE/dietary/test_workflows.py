from copy import deepcopy
from datetime import timedelta
from unittest.mock import patch

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client, RequestFactory, TestCase, override_settings
from django.utils import timezone

from catalog.adapters import DietaryCatalog
from catalog.db_repository import DatabaseCatalogRepository
from catalog.models import (CatalogSource, FoodDeclaration, Menu, MenuComponent,
                            OptionGroup, Restaurant)
from .analysis_reference import prepare_reference
from .models import Criterion, Profile, Review
from .order_validation import validate_selection
from .services import evaluate


@override_settings(CATALOG_USE_DB=True, DIETARY_CATALOG_ADAPTER='catalog.adapters.DietaryCatalog')
class WorkflowTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get('/api/session').json()['csrf_token']
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.profile.criteria.set(Criterion.objects.filter(code__in=['allergen-milk']))
        self.restaurant = Restaurant.objects.create(place_id='r', name='식당')
        self.menu = Menu.objects.create(preprocess_row_id='a', name='메뉴', restaurant=self.restaurant, category='한식', price_amount=1000)
        self.source = CatalogSource.objects.create(title='공식 성분표', source_type='official',
            url='https://example.com/menu', checked_at=timezone.now() - timedelta(hours=2))

    def send(self, path, data, method='post'):
        return getattr(self.client, method)(path, data, content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def declare(self, target, tag='milk', presence='absent'):
        return FoodDeclaration.objects.create(
            menu=target if isinstance(target, Menu) else None,
            component=target if isinstance(target, MenuComponent) else None,
            name_raw=tag, kind='allergen', canonical_tag=tag, presence=presence,
            source=self.source, verification_status='verified', confirmed_at=timezone.now() - timedelta(hours=1))

    def parts(self, *options):
        return [{'id': self.menu.pk, 'role': 'menu'}] + [
            {'id': 'component:' + str(o.pk), 'role': o.role} for o in options]

    def test_group_minimum_maximum_and_duplicate_uuid(self):
        self.declare(self.menu)
        group = OptionGroup.objects.create(menu=self.menu, name='소스', min_select=1, max_select=1)
        first = MenuComponent.objects.create(menu=self.menu, group=group, name='소스1', role='sauce')
        second = MenuComponent.objects.create(menu=self.menu, group=group, name='소스2', role='sauce')
        self.declare(first)
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts()}).status_code, 400)
        result = self.send('/api/orders/check', {'components': self.parts(first)})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['selection_validation']['status'], 'valid')
        self.assertEqual(result.json()['status'], 'match')
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts(first, second)}).status_code, 400)
        aliases = self.parts(first) + [{'id': 'component:' + first.pk.hex.upper(), 'role': 'sauce'}]
        self.assertEqual(self.send('/api/orders/check', {'components': aliases}).status_code, 400)

    def test_parent_role_and_root_duplicates(self):
        other = Menu.objects.create(preprocess_row_id='other', name='다른 메뉴', restaurant=self.restaurant)
        sauce = MenuComponent.objects.create(menu=other, name='다른 소스', role='sauce')
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts(sauce)}).status_code, 400)
        own = MenuComponent.objects.create(menu=self.menu, name='소스', role='sauce')
        wrong = self.parts(own)
        wrong[1]['role'] = 'drink'
        self.assertEqual(self.send('/api/orders/check', {'components': wrong}).status_code, 400)
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts() * 2}).status_code, 400)
        self.assertEqual(self.send('/api/communication', {'components': self.parts(sauce)}).status_code, 400)
        foreign_group = OptionGroup.objects.create(menu=other, name='다른 그룹')
        own.group = foreign_group
        own.save()
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts(own)}).status_code, 400)

    def test_default_selection_and_unverified_removal(self):
        self.declare(self.menu)
        group = OptionGroup.objects.create(menu=self.menu, name='기본 소스', min_select=1, max_select=1)
        default = MenuComponent.objects.create(menu=self.menu, group=group, name='기본', role='sauce', is_default=True)
        self.declare(default, presence='present')
        result = self.send('/api/orders/check', {'components': self.parts(default)})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['status'], 'mismatch')
        parts = self.parts()
        parts[0]['modifications'] = ['remove-default']
        self.assertEqual(self.send('/api/orders/check', {'components': parts}).json()['status'], 'mismatch')
        extra = MenuComponent.objects.create(menu=self.menu, group=group, name='추가', role='sauce')
        self.assertEqual(self.send('/api/orders/check', {'components': self.parts(extra)}).status_code, 400)

    def test_missing_option_is_not_valid_or_safe(self):
        result = self.send('/api/orders/check', {'components': [
            {'id': 'missing', 'role': 'menu'}, {'id': 'component:bad', 'role': 'sauce'}]})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['status'], 'needs_check')
        self.assertEqual(result.json()['selection_validation']['status'], 'needs_check')

    def test_global_dietary_sort_before_pagination(self):
        self.declare(self.menu, presence='present')
        unknown = Menu.objects.create(preprocess_row_id='b', name='후보', restaurant=self.restaurant)
        ok = Menu.objects.create(preprocess_row_id='z', name='후보', restaurant=self.restaurant, category='일식')
        preferred = Menu.objects.create(preprocess_row_id='zz', name='후보', restaurant=self.restaurant, category='한식')
        self.declare(ok)
        self.declare(preferred)
        response = self.client.get('/api/menus?sort=dietary&limit=1&personalize=true').json()
        self.assertEqual(response['pagination']['total'], 4)
        self.assertEqual(response['results'][0]['menu_id'], 'z')
        self.assertEqual(response['results'][0]['judgement']['preference_score'], 0)
        second = self.client.get('/api/menus?sort=dietary&limit=1&page=2').json()
        self.assertEqual(second['results'][0]['menu_id'], 'zz')
        third = self.client.get('/api/menus?sort=dietary&limit=1&page=3').json()
        self.assertEqual(third['results'][0]['menu_id'], unknown.pk)
        last = self.client.get('/api/menus?sort=dietary&limit=1&page=4').json()
        self.assertEqual(last['results'][0]['menu_id'], 'a')
        self.assertEqual(last['results'][0]['judgement']['status'], 'mismatch')
        self.assertEqual(self.client.get('/api/menus?sort=dietary&page=99').json()['results'], [])
        filtered = self.client.get('/api/menus?sort=dietary&min_price=1').json()
        self.assertEqual(filtered['pagination']['total'], 1)
        self.assertEqual(self.client.get('/api/menus?sort=dietary&open_now=bad').status_code, 400)

    def test_preference_feature_unavailable(self):
        self.assertEqual(DatabaseCatalogRepository().get_dietary_component('a')['preference_tags'], [])
        codes = [c['code'] for c in self.client.get('/api/dietary-criteria').json()['criteria']]
        self.assertNotIn('prefer-korean', codes)
        self.assertEqual(self.send('/api/profile', {'criteria': ['prefer-korean']}, method='put').status_code, 400)

    def test_batch_matches_single_and_refreshes_source(self):
        self.declare(self.menu)
        sauce = MenuComponent.objects.create(menu=self.menu, name='기본', role='sauce', is_default=True)
        self.declare(sauce, presence='present')
        repo = DatabaseCatalogRepository()
        self.assertEqual(repo.get_dietary_components(['a'])['a'], repo.get_dietary_component('a'))
        self.source.valid_until = timezone.now() - timedelta(minutes=1)
        self.source.save()
        self.assertEqual(repo.get_dietary_components(['a'])['a']['present_tags'], [])

    def test_profile_completion_empty_invalid_and_other_session(self):
        self.assertFalse(self.client.get('/api/profile').json()['setup_completed'])
        result = self.send('/api/profile', {'criteria': ['bad']}, method='put')
        self.assertEqual(result.status_code, 400)
        self.assertFalse(self.client.get('/api/profile').json()['setup_completed'])
        result = self.send('/api/profile', {'criteria': []}, method='put')
        self.assertTrue(result.json()['setup_completed'])
        self.assertEqual(result.json()['criteria'], [])
        self.assertTrue(self.client.get('/api/profile').json()['setup_completed'])
        self.assertFalse(Client().get('/api/profile').json()['setup_completed'])

    def test_legacy_profile_completion_backfill(self):
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        from types import SimpleNamespace
        from uuid import uuid4
        empty = Profile.objects.create(guest_id=uuid4())
        migration = import_module('dietary.migrations.0003_profile_setup_completed')
        migration.mark_existing_profiles(apps, SimpleNamespace(connection=connection))
        self.profile.refresh_from_db()
        empty.refresh_from_db()
        self.assertTrue(self.profile.setup_completed)
        self.assertFalse(empty.setup_completed)

    def test_all_allergen_and_restriction_names_map_to_rule_tags(self):
        for criterion in Criterion.objects.filter(kind__in=['allergen', 'ingredient']):
            with self.subTest(criterion=criterion.code):
                tag = DietaryCatalog.TAGS[criterion.name]
                self.assertIn(tag, criterion.rule.excluded_tags + ['fish', 'crustacean'])
                # 개별 생선·갑각류 태그 별도 보존
                tag = {'고등어': 'mackerel', '게': 'crab', '새우': 'shrimp'}.get(criterion.name, tag)
                self.profile.criteria.set([criterion])
                declaration = self.declare(self.menu, tag=tag, presence='present')
                self.assertEqual(evaluate(self.profile, 'a')['status'], 'mismatch')
                declaration.delete()

    def test_group_expansion_does_not_infer_group_absence(self):
        for tag, condition in [('shrimp', 'exclude-crustacean'), ('crab', 'exclude-crustacean'),
                               ('mackerel', 'exclude-fish'), ('cheese-butter', 'allergen-milk')]:
            with self.subTest(tag=tag):
                self.profile.criteria.set([Criterion.objects.get(code=condition)])
                declaration = self.declare(self.menu, tag=tag, presence='present')
                self.assertEqual(evaluate(self.profile, 'a')['status'], 'mismatch')
                declaration.presence = 'absent'
                declaration.save()
                self.assertEqual(evaluate(self.profile, 'a')['status'], 'needs_check')
                declaration.delete()

    def test_ai_reference_preparation_does_not_change_judgement(self):
        reference = {'qwen': {'ingredients': ['우유']}, 'gemini': {'ingredients': ['달걀']},
                     'public_data': {'allergens': ['밀']}, 'affects_judgement': True}
        before = evaluate(self.profile, 'a')
        original = deepcopy(reference)
        prepared = prepare_reference(reference)
        self.assertFalse(prepared['affects_judgement'])
        self.assertEqual(reference, original)
        prepared['qwen']['ingredients'].append('콩')
        self.assertEqual(reference, original)
        self.assertEqual(before, evaluate(self.profile, 'a'))
        self.assertIsNone(prepare_reference(None))
        for invalid in [[], {'gemini': []}]:
            with self.assertRaises(ValueError):
                prepare_reference(invalid)

    @override_settings(CATALOG_USE_DB=False, CATALOG_FINAL_CSV='')
    def test_csv_group_tags_share_db_expansion(self):
        source = {'source_url': 'https://example.com/official'}
        menu = {'brand': '매장', 'menu_name': '메뉴', 'source': source,
                'verification': {'verification_status': 'official_image_visual_checked'},
                'allergen_information': {'allergens_contains_normalized': '치즈·버터, 견과류, 새우'}}
        with patch('catalog.adapters.CsvCatalogRepository.get_menu', return_value=menu):
            result = DietaryCatalog().get_component('a')
        self.assertEqual(result['present_tags'], ['cheese-butter', 'crustacean', 'milk', 'nuts', 'shrimp'])
        self.assertEqual(result['absent_tags'], [])

    def test_batch_query_count_does_not_grow_with_candidate_count(self):
        self.declare(self.menu)
        for i in range(8):
            menu = Menu.objects.create(preprocess_row_id=f'm{i}', restaurant=self.restaurant, name='메뉴', category='한식')
            self.declare(menu)
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        repository = DatabaseCatalogRepository()
        with CaptureQueriesContext(connection) as single:
            repository.get_dietary_components(['a'])
        with CaptureQueriesContext(connection) as many:
            results = repository.get_dietary_components(['a'] + [f'm{i}' for i in range(8)])
        self.assertEqual(len(single), len(many))
        self.assertEqual(len(results), 9)


class AdminPrivacyTests(TestCase):
    def user(self, *permissions):
        user = get_user_model().objects.create_user(username='staff' + str(get_user_model().objects.count()), is_staff=True)
        user.user_permissions.set(Permission.objects.filter(content_type__app_label='dietary', codename__in=permissions))
        return user

    def test_review_only_admin_cannot_see_profile(self):
        client = Client()
        client.force_login(self.user('view_review', 'change_review'))
        from uuid import uuid4
        profile = Profile.objects.create(guest_id=uuid4())
        review = Review.objects.create(profile=profile, menu_id='a', body='후기')
        response = client.get(f'/admin/dietary/review/{review.pk}/change/')
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, str(profile.pk))
        self.assertNotContains(response, str(profile.guest_id))
        self.assertEqual(client.get(f'/admin/dietary/profile/{profile.pk}/change/').status_code, 403)

    def test_profile_change_requires_view_and_change(self):
        model_admin = admin.site._registry[Profile]
        request = RequestFactory().get('/admin/')
        request.user = self.user('change_profile', 'delete_profile')
        self.assertFalse(model_admin.has_change_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request))
        request.user = self.user('view_profile')
        self.assertTrue(model_admin.has_view_permission(request))
        self.assertFalse(model_admin.has_change_permission(request))
        request.user = self.user('view_profile', 'change_profile')
        self.assertTrue(model_admin.has_change_permission(request))
