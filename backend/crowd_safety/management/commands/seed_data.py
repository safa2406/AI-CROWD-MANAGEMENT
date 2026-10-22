from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from crowd_safety.models import Location, CrowdReading, Alert

LOCATIONS_DATA = [
    {
        "name": "Central Metro Interchange",
        "location_type": "Transit Station",
        "address": "Zone A - Underground Concourse",
        "safe_capacity": 3500,
        "current_count": 3290,  # 94% -> Critical
        "latitude": Decimal("40.752700"),
        "longitude": Decimal("-73.977200"),
    },
    {
        "name": "Stadium Gate A & B Turnstiles",
        "location_type": "Stadium Entrance",
        "address": "Zone B - Main Entrance",
        "safe_capacity": 2800,
        "current_count": 2240,  # 80% -> High
        "latitude": Decimal("40.750500"),
        "longitude": Decimal("-73.993400"),
    },
    {
        "name": "North Terminal Concourse",
        "location_type": "Transit Station",
        "address": "Zone A - Level 2",
        "safe_capacity": 4500,
        "current_count": 2650,  # 58% -> Moderate
        "latitude": Decimal("40.756000"),
        "longitude": Decimal("-73.986500"),
    },
    {
        "name": "City Civic Plaza Esplanade",
        "location_type": "Public Plaza",
        "address": "Zone C - Outdoor Promenade",
        "safe_capacity": 6000,
        "current_count": 2100,  # 35% -> Low
        "latitude": Decimal("40.758900"),
        "longitude": Decimal("-73.985100"),
    },
    {
        "name": "East Grandstand Promenade",
        "location_type": "Stadium Walkway",
        "address": "Zone B - Walkway Corridor",
        "safe_capacity": 1800,
        "current_count": 1530,  # 85% -> High
        "latitude": Decimal("40.748000"),
        "longitude": Decimal("-73.984000"),
    },
    {
        "name": "South Pedestrian Overpass",
        "location_type": "Footbridge",
        "address": "Zone D - Connector Bridge",
        "safe_capacity": 1200,
        "current_count": 460,  # 38% -> Low
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
        # Critical Alert for Central Metro Interchange
        metro_loc = location_objs["Central Metro Interchange"][0]
        if not Alert.objects.filter(location=metro_loc, severity='critical', status='active').exists():
            Alert.objects.create(
                location=metro_loc,
                severity='critical',
                message="Platform 2 and Stairwell 4 are dangerously crowded (94% capacity). Hold turnstiles.",
                status='active',
            )

        # High Alert for East Grandstand Promenade
        grandstand_loc = location_objs["East Grandstand Promenade"][0]
        if not Alert.objects.filter(location=grandstand_loc, severity='high', status='active').exists():
            Alert.objects.create(
                location=grandstand_loc,
                severity='high',
                message="Heavy crowd near Gate 6 food stands is blocking the main exit hallway (85% capacity).",
                status='active',
            )

        # Acknowledged High Alert for Stadium Gate A & B
        stadium_loc = location_objs["Stadium Gate A & B Turnstiles"][0]
        if not Alert.objects.filter(location=stadium_loc, severity='high', status='acknowledged').exists():
            Alert.objects.create(
                location=stadium_loc,
                severity='high',
                message="Turnstiles moving slowly, causing long crowded lines outside Gate B entrance (80% capacity).",
                status='acknowledged',
                acknowledged_at=now - timedelta(minutes=14),
            )

        # Acknowledged Moderate Alert for North Terminal Concourse
        terminal_loc = location_objs["North Terminal Concourse"][0]
        if not Alert.objects.filter(location=terminal_loc, severity='moderate', status='acknowledged').exists():
            Alert.objects.create(
                location=terminal_loc,
                severity='moderate',
                message="Hallway congestion near baggage drop area (58% capacity). Public announcement requested.",
                status='acknowledged',
                acknowledged_at=now - timedelta(minutes=32),
            )

        # Resolved Low Alert for City Civic Plaza Esplanade
        plaza_loc = location_objs["City Civic Plaza Esplanade"][0]
        if not Alert.objects.filter(location=plaza_loc, severity='low', status='resolved').exists():
            Alert.objects.create(
                location=plaza_loc,
                severity='low',
                message="Temporary barricades narrowed the eastern walkway. Walkway inspected and cleared.",
                status='resolved',
                acknowledged_at=now - timedelta(hours=1, minutes=10),
                resolved_at=now - timedelta(hours=1),
            )
