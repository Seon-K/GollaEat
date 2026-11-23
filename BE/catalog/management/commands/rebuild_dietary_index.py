from django.core.management.base import BaseCommand
from catalog.dietary_index import rebuild


class Command(BaseCommand):
    help = 'Build derived menu/criterion statuses using the existing dietary evaluator.'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=1000)
        parser.add_argument('--force', action='store_true')

    def handle(self, *args, **options):
        size = options['batch_size']
        if not 1 <= size <= 2000:
            from django.core.management.base import CommandError
            raise CommandError('batch-size must be 1..2000')
        count = rebuild(batch_size=size, force=options['force'],
            progress=lambda done, total: self.stdout.write(f'Indexed {done}/{total} menus'))
        self.stdout.write(self.style.SUCCESS(f'Completed: {count} menus'))
