import uuid
from unittest.mock import patch

from django.test import Client, TestCase

from .models import Criterion, Favorite, Profile, Review
from .services import check_order, communication, evaluate, rank_menus


class ReviewOwnershipTests(TestCase):
    def setUp(self):
        self.client.get('/api/session')
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.other = Profile.objects.create(guest_id=uuid.uuid4())
        self.milk = [{'code': 'allergen-milk', 'name': '우유', 'kind': 'allergen'}]
        self.own = Review.objects.create(profile=self.profile, menu_id='menu', body='mine', disclosed_conditions=self.milk)
        self.theirs = Review.objects.create(profile=self.other, menu_id='menu', body='other', disclosed_conditions=self.milk)

    def test_list_and_detail_is_mine_without_identity_disclosure(self):
        data = self.client.get('/api/reviews').json()['reviews']
        self.assertEqual({r['id']: r['is_mine'] for r in data}, {self.own.pk: True, self.theirs.pk: False})
        self.assertTrue(self.client.get(f'/api/reviews/{self.own.pk}').json()['is_mine'])
        self.assertFalse(Client().get(f'/api/reviews/{self.own.pk}').json()['is_mine'])
        for r in data:
            self.assertNotIn('profile', r)
            self.assertNotIn('guest_id', r)
        visitor = Client()
        self.assertTrue(all(not r['is_mine'] for r in visitor.get('/api/reviews').json()['reviews']))
        self.assertNotIn('dietary_owner', visitor.session)

    def test_mine_combines_snapshot_menu_and_pagination(self):
        Review.objects.create(profile=self.profile, menu_id='other-menu', body='other menu', disclosed_conditions=self.milk)
        Review.objects.create(profile=self.profile, menu_id='menu', body='no snapshot')
        newest = Review.objects.create(profile=self.profile, menu_id='menu', body='new', disclosed_conditions=self.milk)
        response = self.client.get('/api/reviews?mine=true&menu_id=menu&condition=allergen-milk&limit=1').json()
        self.assertEqual(response['pagination']['total'], 2)
        self.assertEqual(response['reviews'][0]['id'], newest.pk)
        second = self.client.get('/api/reviews?mine=true&menu_id=menu&condition=allergen-milk&limit=1&page=2').json()
        self.assertEqual(second['reviews'][0]['id'], self.own.pk)
        self.assertEqual(Client().get('/api/reviews?mine=true').json()['reviews'], [])
        self.assertEqual(self.client.get('/api/reviews?mine=invalid').status_code, 400)
        self.assertEqual(len(self.client.get('/api/reviews?mine=false').json()['reviews']), 5)

    def test_create_edit_and_delete_enforce_server_ownership(self):
        result = self.client.post('/api/reviews', {'menu_id': 'menu', 'body': 'new', 'is_mine': False}, content_type='application/json')
        self.assertEqual(result.status_code, 201)
        self.assertTrue(result.json()['is_mine'])
        result = self.client.patch(f'/api/reviews/{self.own.pk}', {'body': 'edit'}, content_type='application/json')
        self.assertTrue(result.json()['is_mine'])
        self.assertEqual(self.client.patch(f'/api/reviews/{self.theirs.pk}', {'body': 'edit', 'is_mine': True}, content_type='application/json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/reviews/{self.theirs.pk}').status_code, 404)
