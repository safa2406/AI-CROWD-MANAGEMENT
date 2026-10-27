from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


class Location(models.Model):
    LOCATION_TYPE_CHOICES = [
        ('Transit Station', 'Transit Station'),
        ('Stadium Entrance', 'Stadium Entrance'),
        ('Public Plaza', 'Public Plaza'),
        ('Stadium Walkway', 'Stadium Walkway'),
        ('Footbridge', 'Footbridge'),
        ('Arena Perimeter', 'Arena Perimeter'),
        ('General Venue', 'General Venue'),
    ]

    name = models.CharField(max_length=150, unique=True, help_text="Unique name of the monitored location")
    location_type = models.CharField(max_length=100, choices=LOCATION_TYPE_CHOICES, default='General Venue')
    address = models.CharField(max_length=255, blank=True, default='')
    safe_capacity = models.PositiveIntegerField(help_text="Safe maximum crowd capacity (must be greater than 0)")
    latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.safe_capacity is not None and self.safe_capacity <= 0:
            raise ValidationError({'safe_capacity': 'Safe capacity must be a positive integer greater than zero.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} (Safe Capacity: {self.safe_capacity})"

    @property
    def latest_reading(self):
        """Retrieve the most recent crowd reading for this location."""
        if hasattr(self, '_prefetched_objects_cache') and 'readings' in self._prefetched_objects_cache:
            prefetched = self._prefetched_objects_cache['readings']
            return prefetched[0] if prefetched else None
        return self.readings.order_by('-timestamp').first()

    @property
    def current_count(self):
        """Current crowd count based on the latest reading."""
        reading = self.latest_reading
        return reading.crowd_count if reading else 0

    @property
    def occupancy_percentage(self):
        """
        Calculate occupancy percentage:
        (Current crowd count / Safe capacity) * 100
        """
        if not self.safe_capacity or self.safe_capacity <= 0:
            return 0.0
        return round((self.current_count / self.safe_capacity) * 100, 1)

    @property
    def current_status(self):
        """
        Crowd safety thresholds:
        - Below 50%: Low
        - 50% to below 75%: Moderate
        - 75% to below 90%: High
        - 90% and above: Critical
        """
        occupancy = self.occupancy_percentage
        if occupancy >= 90.0:
            return 'critical'
        elif occupancy >= 75.0:
            return 'high'
        elif occupancy >= 50.0:
            return 'moderate'
        return 'low'


class CrowdReading(models.Model):
    DATA_SOURCE_CHOICES = [
        ('simulated_sensor', 'Simulated Sensor'),
        ('manual_entry', 'Manual Entry'),
        ('cctv_ai_detection', 'CCTV AI Detection (Simulated)'),
    ]

    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name='readings',
        help_text="Monitored location associated with this reading"
    )
    crowd_count = models.IntegerField(help_text="Estimated head count at the timestamp")
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    data_source = models.CharField(
        max_length=50,
        choices=DATA_SOURCE_CHOICES,
        default='simulated_sensor',
        help_text="Origin of the crowd reading. Automated readings are marked as simulated."
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['location', '-timestamp']),
        ]

    def clean(self):
        super().clean()
        if self.crowd_count is not None and self.crowd_count < 0:
            raise ValidationError({'crowd_count': 'Crowd count cannot be a negative number.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.location.name}: {self.crowd_count} at {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"


class Alert(models.Model):
    SEVERITY_CHOICES = [
        ('low', 'Low'),
        ('moderate', 'Moderate'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('acknowledged', 'Acknowledged'),
        ('resolved', 'Resolved'),
    ]

    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name='alerts',
        help_text="Location triggering this alert"
    )
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    message = models.TextField(help_text="Safety warning or incident message")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def acknowledge(self):
        """Transition alert to acknowledged state."""
        if self.status == 'resolved':
            raise ValidationError("Cannot acknowledge an alert that has already been resolved.")
        self.status = 'acknowledged'
        self.acknowledged_at = timezone.now()
        self.save(update_fields=['status', 'acknowledged_at'])

    def resolve(self):
        """Transition alert to resolved state."""
        self.status = 'resolved'
        self.resolved_at = timezone.now()
        self.save(update_fields=['status', 'resolved_at'])

    def __str__(self):
        return f"[{self.severity.upper()}] {self.location.name}: {self.status}"
