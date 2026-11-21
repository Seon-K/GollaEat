from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test.utils import override_settings

from catalog.final_repository import FinalCatalogRepository
from catalog.repository import CatalogDataError
from catalog.models import Menu, Restaurant


class Command(BaseCommand):
    help = 'Upsert external final CSV into the configured database; never delete records.'

    def add_arguments(self, parser):
        parser.add_argument('--csv', default=None)
        parser.add_argument('--coordinates', default=None)

    def handle(self, *args, **options):
        with override_settings(
            CATALOG_FINAL_CSV=options['csv'] or settings.CATALOG_FINAL_CSV,
            CATALOG_COORDINATE_VALIDATION_CSV=(options['coordinates'] if options['coordinates'] is not None
                                              else settings.CATALOG_COORDINATE_VALIDATION_CSV)):
            try:
                source = FinalCatalogRepository()
                restaurants, menus = source.list_restaurants(), source.list_menus()
            except CatalogDataError as exc:
                raise CommandError(str(exc)) from exc
        for item in restaurants:
            if len(item['restaurant_id']) > 100 or len(item['restaurant_name']) > 500:
                raise CommandError('Restaurant identifier or name too long')
        for item in menus:
            if len(item['menu_id']) > 100 or len(item['menu_name']) > 500:
                raise CommandError('Menu identifier or name too long')
            if item['price_amount'] is not None and item['price_amount'] > 9223372036854775807:
                raise CommandError('Price exceeds database integer range')
        with transaction.atomic():
            for item in restaurants:
                Restaurant.objects.update_or_create(pk=item['restaurant_id'], defaults={
                    'name': item['restaurant_name'], 'data': item})
            for item in menus:
                existing = Menu.objects.filter(pk=item['menu_id']).values_list('restaurant_id', flat=True).first()
                if existing is not None and existing != item['restaurant_id']:
                    raise CommandError('Menu ID reassigned to another restaurant; import rolled back')
                Menu.objects.update_or_create(pk=item['menu_id'], defaults={
                    'restaurant_id': item['restaurant_id'], 'name': item['menu_name'],
                    'price_amount': item['price_amount'], 'data': item})
        self.stdout.write(self.style.SUCCESS(f'Upserted {len(restaurants)} restaurants, {len(menus)} menus; no deletions'))
