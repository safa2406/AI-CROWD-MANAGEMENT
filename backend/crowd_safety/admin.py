from django.contrib import admin
from .models import Location, CrowdReading, Alert


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'location_type', 'safe_capacity', 'current_count', 'occupancy_percentage', 'current_status', 'created_at')
    search_fields = ('name', 'address', 'location_type')
    list_filter = ('location_type',)


@admin.register(CrowdReading)
class CrowdReadingAdmin(admin.ModelAdmin):
    list_display = ('location', 'crowd_count', 'timestamp', 'data_source')
    list_filter = ('data_source', 'location')
    date_hierarchy = 'timestamp'


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('location', 'severity', 'status', 'created_at', 'acknowledged_at', 'resolved_at')
    list_filter = ('severity', 'status', 'location')
    search_fields = ('message', 'location__name')

