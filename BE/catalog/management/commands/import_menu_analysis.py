from collections import Counter
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.analysis_reference import read_analysis_csv
from catalog.final_repository import place_id
from catalog.repository import CatalogDataError, normalize_brand
from catalog.models import Menu, MenuAnalysisReference


class Command(BaseCommand):
    help = 'Upsert unverified AI references onto existing menu IDs; never update menus or dietary declarations.'

    def add_arguments(self, parser):
        parser.add_argument('--csv', required=True)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        rows = read_analysis_csv(options['csv'])
        counts = Counter()
        with transaction.atomic():
            query = Menu.objects.filter(pk__in=[row['preprocess_row_id'] for row, _ in rows]).prefetch_related('restaurant')
            # No nullable JOIN in the row-lock query; PostgreSQL-safe, read-only dry-run.
            if not options['dry_run']:
                query = query.select_for_update()
            menus = query.in_bulk()
            for number, (row, values) in enumerate(rows, start=2):
                menu = menus.get(row['preprocess_row_id'])
                if menu is None:
                    raise CommandError(f'Row {number}: menu does not exist; import the base catalog first')
                try:
                    restaurant_id = place_id(row['place_id'])
                except CatalogDataError:
                    raise CommandError(f'Row {number}: invalid place ID') from None
                if (restaurant_id != menu.restaurant_id or
                        normalize_brand(row['menu_name']) != normalize_brand(menu.name) or
                        normalize_brand(row['restaurant_name']) != normalize_brand(menu.restaurant.name)):
                    raise CommandError(f'Row {number}: menu/restaurant identity mismatch')
                counts[values['ingredient_source']] += 1
            if not options['dry_run']:
                for row, values in rows:
                    MenuAnalysisReference.objects.update_or_create(menu_id=row['preprocess_row_id'], defaults=values)
        from catalog.dietary_index import rebuild_after_import
        if not options['dry_run']:
            rebuild_after_import()
        self.stdout.write(json.dumps({'dry_run': options['dry_run'], 'rows': len(rows),
            'sources': dict(counts)}, ensure_ascii=False, sort_keys=True))
