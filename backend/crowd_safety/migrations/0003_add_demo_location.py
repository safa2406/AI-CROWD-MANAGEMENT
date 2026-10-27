from django.db import migrations
from decimal import Decimal


def create_demo_location(apps, schema_editor):
    import sys
    if 'test' in sys.argv:
        return
    Location = apps.get_model('crowd_safety', 'Location')
    # Create the dedicated demonstration location if it does not exist
    Location.objects.get_or_create(
        name="Live Demonstration Area",
        defaults={
            "location_type": "General Venue",
            "address": "Zone DEMO - Live Webcam Feed",
            "safe_capacity": 5,
            "latitude": Decimal("40.750000"),
            "longitude": Decimal("-73.985000"),
        }
    )


def remove_demo_location(apps, schema_editor):
    Location = apps.get_model('crowd_safety', 'Location')
    Location.objects.filter(name="Live Demonstration Area").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('crowd_safety', '0002_alter_location_latitude_alter_location_longitude'),
    ]

    operations = [
        migrations.RunPython(create_demo_location, remove_demo_location),
    ]
