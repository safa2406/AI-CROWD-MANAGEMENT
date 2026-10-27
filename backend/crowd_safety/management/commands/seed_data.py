from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from crowd_safety.models import Location, CrowdReading, Alert

LOCATIONS_DATA = [
    {
        "name": "Street Pathway",
        "location_type": "Transit Station",
        "address": "Zone A - Underground Concourse",
        "safe_capacity": 350,
        "current_count": 329,  # 94% -> Critical
        "latitude": Decimal("40.752700"),
        "longitude": Decimal("-73.977200"),
    },
    {
        "name": "Central Metro Station",
        "location_type": "Stadium Entrance",
        "address": "Zone B - Main Entrance",
        "safe_capacity": 280,
        "current_count": 224,  # 80% -> High
        "latitude": Decimal("40.750500"),
        "longitude": Decimal("-73.993400"),
    },
    {
        "name": "Railway Station Hall",
        "location_type": "Transit Station",
        "address": "Zone A - Level 2",
        "safe_capacity": 65,
        "current_count": 53,  # 81.5% -> High
        "latitude": Decimal("40.756000"),
        "longitude": Decimal("-73.986500"),
    },
    {
        "name": "Bus Terminal Entrance",
        "location_type": "Public Plaza",
        "address": "Zone C - Outdoor Promenade",
        "safe_capacity": 400,
        "current_count": 140,  # 35% -> Low
        "latitude": Decimal("40.758900"),
        "longitude": Decimal("-73.985100"),
    },
    {
        "name": "City Market Square",
        "location_type": "Stadium Walkway",
        "address": "Zone B - Walkway Corridor",
        "safe_capacity": 180,
        "current_count": 153,  # 85% -> High
        "latitude": Decimal("40.748000"),
        "longitude": Decimal("-73.984000"),
    },
    {
        "name": "Pedestrian Crossing",
        "location_type": "Footbridge",
        "address": "Zone D - Connector Bridge",
        "safe_capacity": 120,
        "current_count": 46,  # 38% -> Low
        "latitude": Decimal("40.745000"),
        "longitude": Decimal("-73.989000"),
    },
]


class Command(BaseCommand):
    help = "Seeds the 6 monitored locations and simulated historical readings safely."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding Crowd Safety database..."))

        now = timezone.now()
        created_loc_count = 0
        updated_loc_count = 0

        # 1. Seed or Update the 6 Locations
        location_objs = {}
        for data in LOCATIONS_DATA:
            current_target = data.pop("current_count")
            loc, created = Location.objects.update_or_create(
                name=data["name"],
                defaults={
                    "location_type": data["location_type"],
                    "address": data["address"],
                    "safe_capacity": data["safe_capacity"],
                    "latitude": data["latitude"],
                    "longitude": data["longitude"],
                }
            )
            data["current_count"] = current_target
            location_objs[loc.name] = (loc, current_target)

            if created:
                created_loc_count += 1
            else:
                updated_loc_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Locations processed: {created_loc_count} created, {updated_loc_count} preserved/updated."
            )
        )

        # Ensure dedicated demonstration location exists
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

        # 2. Seed Simulated Historical Readings
        # Create hourly historical data over the last 8 hours up to now
        total_readings_seeded = 0
        for name, (loc, target_current) in location_objs.items():
            # Check if recent readings exist to avoid infinite duplicates
            existing_count = loc.readings.count()
            if existing_count < 8:
                # Generate 8 hourly readings leading up to current count
                steps = 8
                for i in range(steps):
                    hours_ago = steps - 1 - i
                    t_stamp = now - timedelta(hours=hours_ago)
                    
                    # Gradual progression toward target count
                    ratio = (0.55 + (0.45 * (i / (steps - 1))))
                    count_at_hour = max(50, int(target_current * ratio))

                    CrowdReading.objects.create(
                        location=loc,
                        crowd_count=count_at_hour,
                        timestamp=t_stamp,
                        data_source='simulated_sensor'
                    )
                    total_readings_seeded += 1
            else:
                # Ensure the latest reading matches the target current count
                latest = loc.latest_reading
                if not latest or latest.crowd_count != target_current:
                    CrowdReading.objects.create(
                        location=loc,
                        crowd_count=target_current,
                        timestamp=now,
                        data_source='simulated_sensor'
                    )
                    total_readings_seeded += 1

        self.stdout.write(
            self.style.SUCCESS(f"Simulated readings processed: {total_readings_seeded} readings added.")
        )

        # 3. Seed Realistic Initial Alerts (Safe / Idempotent)
        self.seed_initial_alerts(location_objs, now)

        self.stdout.write(self.style.SUCCESS("Database seeding completed successfully!"))

    def seed_initial_alerts(self, location_objs, now):
        """
        Seeds initial baseline alerts matching dashboard mock state without creating duplicates.
        """
        # Critical Alert for Street Pathway
        metro_loc = location_objs["Street Pathway"][0]
        if not Alert.objects.filter(location=metro_loc, severity='critical', status='active').exists():
            Alert.objects.create(
                location=metro_loc,
                severity='critical',
                message="Street pathway bottleneck is dangerously crowded (94% capacity). Hold entry flow.",
                status='active',
            )

        # High Alert for City Market Square
        grandstand_loc = location_objs["City Market Square"][0]
        if not Alert.objects.filter(location=grandstand_loc, severity='high', status='active').exists():
            Alert.objects.create(
                location=grandstand_loc,
                severity='high',
                message="Heavy crowd near market stalls is blocking the main walkway (85% capacity).",
                status='active',
            )

        # Acknowledged High Alert for Central Metro Station
        stadium_loc = location_objs["Central Metro Station"][0]
        if not Alert.objects.filter(location=stadium_loc, severity='high', status='acknowledged').exists():
            Alert.objects.create(
                location=stadium_loc,
                severity='high',
                message="Turnstiles moving slowly, causing long crowded lines outside Central Metro Station (80% capacity).",
                status='acknowledged',
                acknowledged_at=now - timedelta(minutes=14),
            )

        # Acknowledged Moderate Alert for Railway Station Hall
        terminal_loc = location_objs["Railway Station Hall"][0]
        if not Alert.objects.filter(location=terminal_loc, severity='moderate', status='acknowledged').exists():
            Alert.objects.create(
                location=terminal_loc,
                severity='moderate',
                message="Hallway congestion near passenger waiting area (81.5% capacity). Public announcement requested.",
                status='acknowledged',
                acknowledged_at=now - timedelta(minutes=32),
            )

        # Resolved Low Alert for Bus Terminal Entrance
        plaza_loc = location_objs["Bus Terminal Entrance"][0]
        if not Alert.objects.filter(location=plaza_loc, severity='low', status='resolved').exists():
            Alert.objects.create(
                location=plaza_loc,
                severity='low',
                message="Temporary barricades narrowed the bus terminal entrance walkway. Walkway inspected and cleared.",
                status='resolved',
                acknowledged_at=now - timedelta(hours=1, minutes=10),
                resolved_at=now - timedelta(hours=1),
            )
