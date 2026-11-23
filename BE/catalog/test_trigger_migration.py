from importlib import import_module
from unittest import skipUnless

from django.db import connection
from django.test import TestCase
from django.utils import timezone

from .models import Menu, MenuDietaryState, Restaurant


@skipUnless(connection.vendor == "postgresql", "PostgreSQL trigger regression")
class DietaryTriggerMigrationTests(TestCase):
    def test_repairs_previously_installed_functions_and_preserves_index_rows(self):
        migration = import_module("catalog.migrations.0011_fix_dietary_trigger_timestamp")
        store = Restaurant.objects.create(place_id="trigger-repair", name="Before")
        menu = Menu.objects.create(preprocess_row_id="trigger-menu", restaurant=store, name="Menu")
        MenuDietaryState.objects.filter(menu=menu).update(dirty=False, valid_until=timezone.now())
        previous = MenuDietaryState.objects.get(menu=menu)

        # Reproduce the stored function body in databases migrated before the fix.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_get_functiondef('dietary_dirty_catalog_restaurant_update()'::regprocedure)")
            definition = cursor.fetchone()[0]
            self.assertIn("NULL::timestamp with time zone", definition)
            cursor.execute(definition.replace("NULL::timestamp with time zone", "NULL"))

        migration.repair_functions(None, connection.schema_editor())
        unchanged = MenuDietaryState.objects.get(menu=menu)
        self.assertEqual(unchanged.revision, previous.revision)
        self.assertEqual(unchanged.valid_until, previous.valid_until)
        self.assertFalse(unchanged.dirty)

        Restaurant.objects.filter(pk=store.pk).update(name="After")
        updated = MenuDietaryState.objects.get(menu=menu)
        self.assertTrue(updated.dirty)
        self.assertIsNone(updated.valid_until)
        self.assertGreater(updated.revision, previous.revision)

        Restaurant.objects.create(place_id="trigger-empty", name="No menus")
        Menu.objects.create(preprocess_row_id="trigger-new-menu", restaurant=store, name="New menu")
        self.assertTrue(MenuDietaryState.objects.get(menu_id="trigger-new-menu").dirty)
