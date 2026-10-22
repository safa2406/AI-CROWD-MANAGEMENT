from rest_framework import serializers
from .models import Location, CrowdReading, Alert
from .services import evaluate_reading_for_alerts


class LocationSerializer(serializers.ModelSerializer):
    current_count = serializers.IntegerField(read_only=True)
    occupancy_percentage = serializers.FloatField(read_only=True)
    current_status = serializers.CharField(read_only=True)

    class Meta:
        model = Location
        fields = [
            'id',
            'name',
            'location_type',
            'address',
            'safe_capacity',
            'latitude',
            'longitude',
            'created_at',
            'updated_at',
            'current_count',
            'occupancy_percentage',
            'current_status',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'current_count', 'occupancy_percentage', 'current_status']

    def validate_safe_capacity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Safe capacity must be a positive integer greater than zero.")
        return value


class CrowdReadingSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    location_safe_capacity = serializers.IntegerField(source='location.safe_capacity', read_only=True)
    occupancy_percentage = serializers.SerializerMethodField()

    class Meta:
        model = CrowdReading
        fields = [
            'id',
            'location',
            'location_name',
            'location_safe_capacity',
            'crowd_count',
            'occupancy_percentage',
            'timestamp',
            'data_source',
        ]
        read_only_fields = ['id', 'timestamp', 'location_name', 'location_safe_capacity', 'occupancy_percentage']

    def get_occupancy_percentage(self, obj):
        if not obj.location or not obj.location.safe_capacity or obj.location.safe_capacity <= 0:
            return 0.0
        return round((obj.crowd_count / obj.location.safe_capacity) * 100, 1)

    def validate_crowd_count(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError("Crowd count cannot be a negative number.")
        return value

    def create(self, validated_data):
        reading = super().create(validated_data)
        # Evaluate safety thresholds and trigger or escalate alerts
        evaluate_reading_for_alerts(reading)
        return reading


class AlertSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = Alert
        fields = [
            'id',
            'location',
            'location_name',
            'severity',
            'message',
            'status',
            'created_at',
            'acknowledged_at',
            'resolved_at',
        ]
        read_only_fields = ['id', 'created_at', 'acknowledged_at', 'resolved_at', 'location_name']

