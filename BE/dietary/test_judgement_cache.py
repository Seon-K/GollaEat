import uuid
from datetime import timedelta
from unittest.mock import Mock, patch
from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone
from catalog.adapters import DietaryCatalog
from .models import Criterion, Profile
from .services import EvaluationContext, evaluate
from . import judgement_cache


@override_settings(CATALOG_USE_DB=True)
class JudgementCacheTests(TestCase):
    def setUp(self):
        caches['dietary_judgements'].clear()
        self.addCleanup(caches['dietary_judgements'].clear)
        self.profile = Profile.objects.create(guest_id=uuid.uuid4())
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.adapter = DietaryCatalog()
        self.data = {'present_tags': [], 'absent_tags': ['milk'],
                     'sources': [{'id': 'source', 'url': 'https://example.com', 'valid_until': None}]}
        self.adapter.get_components = Mock(side_effect=lambda ids: {mid: self.data for mid in ids})
        self.adapter.get_component = Mock(side_effect=lambda mid: self.data)
        self.factory = patch('dietary.services.get_catalog', return_value=self.adapter).start()
        self.version = patch('dietary.judgement_cache.database_version', return_value='snapshot-one').start()
        self.addCleanup(patch.stopall)

    def run_evaluation(self, profile=None):
        profile = profile or self.profile
        context = EvaluationContext(profile)
        context.prime(['m'])
        result = evaluate(profile, 'm', context=context)
        context.flush()
        return result

    def test_reuses_result_and_skips_component_reads(self):
        first = self.run_evaluation()
        self.assertEqual(first['status'], 'match')
        self.assertEqual(self.run_evaluation(), first)
        self.adapter.get_components.assert_called_once_with(['m'])
        self.adapter.get_component.assert_not_called()

    def test_database_write_version_invalidates_cached_result(self):
        self.assertEqual(self.run_evaluation()['status'], 'match')
        self.data = dict(self.data, present_tags=['milk'], absent_tags=[])
        self.version.return_value = 'snapshot-two'
        self.assertEqual(self.run_evaluation()['status'], 'mismatch')
        self.assertEqual(self.adapter.get_components.call_count, 2)

    def test_criteria_change_does_not_reuse_previous_verdict(self):
        self.run_evaluation()
        self.profile.criteria.add(Criterion.objects.get(code='allergen-egg'))
        self.assertEqual(self.run_evaluation()['status'], 'needs_check')
        self.assertEqual(self.adapter.get_components.call_count, 2)

    def test_expired_source_bypasses_cache_even_without_database_writes(self):
        now = timezone.now()
        self.data['sources'][0]['valid_until'] = now + timedelta(seconds=1)
        self.run_evaluation()
        self.data = dict(self.data, absent_tags=[], sources=[])
        with patch('dietary.judgement_cache.timezone.now', return_value=now + timedelta(seconds=2)):
            self.assertEqual(self.run_evaluation()['status'], 'needs_check')
        self.assertEqual(self.adapter.get_components.call_count, 2)

    def test_disabled_cache_and_modifications_do_not_reuse_match(self):
        self.run_evaluation()
        context = EvaluationContext(self.profile)
        context.prime(['m'])
        result = evaluate(self.profile, 'm', modifications=['remove-milk'], context=context)
        self.assertEqual(result['status'], 'needs_check')
        self.version.return_value = None
        self.data = dict(self.data, present_tags=['milk'])
        self.assertEqual(self.run_evaluation()['status'], 'mismatch')

    def test_cache_failure_falls_back_to_normal_evaluation(self):
        with patch('dietary.judgement_cache.read_many', return_value={}):
            with patch.object(caches['dietary_judgements'], 'set_many', side_effect=OSError('unavailable')):
                self.assertEqual(self.run_evaluation()['status'], 'match')


class SnapshotSafetyTests(TestCase):
    def test_uncommitted_writes_bypass_cache(self):
        with patch('dietary.judgement_cache.connection') as connection:
            connection.vendor = 'postgresql'
            connection.in_atomic_block = True
            self.assertIsNone(judgement_cache.database_version())
            connection.cursor.assert_not_called()

    def test_postgresql_snapshot_is_read_only_and_hashed(self):
        with patch('dietary.judgement_cache.connection') as connection:
            connection.vendor = 'postgresql'
            connection.in_atomic_block = False
            connection.get_autocommit.return_value = True
            connection.settings_dict = {'HOST': 'db', 'PORT': 5432, 'NAME': 'test'}
            cursor = connection.cursor.return_value.__enter__.return_value
            cursor.fetchone.return_value = ['10:20:11,12']
            version = judgement_cache.database_version()
            cursor.execute.assert_called_once_with('SELECT pg_current_snapshot()::text')
            self.assertEqual(len(version), 64)
            cursor.fetchone.return_value = ['10:21:11,12']
            self.assertNotEqual(judgement_cache.database_version(), version)
