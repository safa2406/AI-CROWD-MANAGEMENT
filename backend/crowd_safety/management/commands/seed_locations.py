from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Alias command for seed_data: seeds the 6 locations and simulated historical readings."

    def handle(self, *args, **options):
        call_command('seed_data', *args, **options)

