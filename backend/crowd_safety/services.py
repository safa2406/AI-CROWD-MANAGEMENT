from django.utils import timezone
from django.db.models import Sum, Max
from .models import Location, CrowdReading, Alert

# Safety Threshold Percentages
THRESHOLD_MODERATE = 50.0  # 50% to < 75%
THRESHOLD_HIGH = 75.0      # 75% to < 90%
THRESHOLD_CRITICAL = 90.0  # >= 90%


def calculate_occupancy_percentage(crowd_count: int, safe_capacity: int) -> float:
    """
    Calculate occupancy percentage using:
    (Current crowd count / Safe capacity) * 100
    """
    if not safe_capacity or safe_capacity <= 0:
        return 0.0
    return round((crowd_count / safe_capacity) * 100, 1)


def determine_crowd_status(occupancy_percentage: float) -> str:
    """
    Evaluate crowd status according to safety thresholds:
    - Below 50%: Low
    - 50% to below 75%: Moderate
    - 75% to below 90%: High
    - 90% and above: Critical
    """
    if occupancy_percentage >= THRESHOLD_CRITICAL:
        return 'critical'
    elif occupancy_percentage >= THRESHOLD_HIGH:
        return 'high'
    elif occupancy_percentage >= THRESHOLD_MODERATE:
        return 'moderate'
    return 'low'


def evaluate_reading_for_alerts(reading: CrowdReading):
    """
    Evaluates a crowd reading against safety thresholds:
    - Triggers 'high' alert when occupancy reaches 75%.
    - Triggers 'critical' alert when occupancy reaches 90%.
    - Prevents duplicate unresolved alerts (active or acknowledged) for the same location and condition.
    - Escalates an existing high-severity alert to critical if occupancy reaches 90%.
    - Avoids generating repeated alerts on every reading tick.
    - Does NOT automatically resolve an alert merely because a new reading arrives.
    
    Returns:
        tuple (alert: Alert | None, created_or_escalated: bool, reason: str)
    """
    location = reading.location
    occupancy = calculate_occupancy_percentage(reading.crowd_count, location.safe_capacity)

    unresolved_alerts = Alert.objects.filter(
        location=location,
        status__in=['active', 'acknowledged']
    ).order_by('-created_at')

    # Condition: Critical (Occupancy >= 90%)
    if occupancy >= THRESHOLD_CRITICAL:
        existing_critical = unresolved_alerts.filter(severity='critical').first()
        if existing_critical:
            # Duplicate prevention: An unresolved critical alert already exists for this location
            return existing_critical, False, "Duplicate suppressed: Unresolved Critical alert already exists."

        existing_high = unresolved_alerts.filter(severity='high').first()
        if existing_high:
            # Escalation: Escalate the existing high alert to critical
            existing_high.severity = 'critical'
            existing_high.message = (
                f"ESCALATION to Critical: Crowd reached {reading.crowd_count} "
                f"({occupancy}% of safe capacity {location.safe_capacity}). Urgent gate intervention required."
            )
            # Escalated condition requires immediate active attention
            existing_high.status = 'active'
            existing_high.save(update_fields=['severity', 'message', 'status'])
            return existing_high, True, "Escalation: Existing High alert escalated to Critical."

        # New Critical Alert
        new_alert = Alert.objects.create(
            location=location,
            severity='critical',
            message=(
                f"CRITICAL OVERCROWDING: Crowd reached {reading.crowd_count} "
                f"({occupancy}% of safe capacity {location.safe_capacity}). Emergency hold recommended."
            ),
            status='active'
        )
        return new_alert, True, "New Critical alert generated."

    # Condition: High (Occupancy >= 75% and < 90%)
    elif occupancy >= THRESHOLD_HIGH:
        # If an active or acknowledged critical alert already exists, do not downgrade it
        if unresolved_alerts.filter(severity='critical').exists():
            return unresolved_alerts.filter(severity='critical').first(), False, "Higher severity Critical alert already active."

        existing_high = unresolved_alerts.filter(severity='high').first()
        if existing_high:
            # Duplicate prevention: An unresolved high alert already exists
            return existing_high, False, "Duplicate suppressed: Unresolved High alert already exists."

        # New High Alert
        new_alert = Alert.objects.create(
            location=location,
            severity='high',
            message=(
                f"HIGH CROWD WARNING: Crowd reached {reading.crowd_count} "
                f"({occupancy}% of safe capacity {location.safe_capacity}). Monitor and control entry rates."
            ),
            status='active'
        )
        return new_alert, True, "New High alert generated."

    # Condition: Low or Moderate (< 75%)
    # Do not create alerts, and do NOT resolve existing alerts automatically
    return None, False, "Reading is below alert threshold (under 75% occupancy). No alert created."


def get_dashboard_summary():
    """
    Computes aggregated dashboard metrics:
    - Total monitored locations
    - Total current crowd count
    - Total safe capacity
    - Overall occupancy percentage: (Total current crowd / Total safe capacity) * 100
    - Number of active alerts
    - Number of high and critical alerts
    - Number of high-crowd locations (status in ['high', 'critical'])
    - Current status and crowd count for every location
    - Hourly crowd trends based on stored readings
    """
    locations = Location.objects.all().prefetch_related('readings')
    total_locations = locations.count()

    # Calculate overall venue capacity and total crowd
    total_current_crowd = sum(loc.current_count for loc in locations)
    total_safe_capacity = sum(loc.safe_capacity for loc in locations)
    overall_occupancy_percentage = calculate_occupancy_percentage(total_current_crowd, total_safe_capacity)

    # Alert counts
    active_alerts = Alert.objects.filter(status='active')
    active_alerts_count = active_alerts.count()
    high_and_critical_alerts_count = Alert.objects.filter(
        status='active',
        severity__in=['high', 'critical']
    ).count()

    # High crowd locations (status 'high' or 'critical')
    high_crowd_locations_count = sum(
        1 for loc in locations if loc.current_status in ['high', 'critical']
    )

    # Location summaries
    locations_summary = []
    for loc in locations:
        locations_summary.append({
            'id': loc.id,
            'name': loc.name,
            'location_type': loc.location_type,
            'address': loc.address,
            'safe_capacity': loc.safe_capacity,
            'current_count': loc.current_count,
            'occupancy_percentage': loc.occupancy_percentage,
            'current_status': loc.current_status,
            'latitude': float(loc.latitude) if loc.latitude is not None else None,
            'longitude': float(loc.longitude) if loc.longitude is not None else None,
            'updated_at': loc.updated_at.strftime('%Y-%m-%d %H:%M:%S') if loc.updated_at else None,
        })

    # Hourly crowd trends computed from stored readings
    hourly_trends = calculate_hourly_crowd_trends(total_safe_capacity)

    return {
        'total_locations': total_locations,
        'total_current_crowd': total_current_crowd,
        'total_crowd_count': total_current_crowd,
        'total_safe_capacity': total_safe_capacity,
        'overall_occupancy_percentage': overall_occupancy_percentage,
        'active_alerts_count': active_alerts_count,
        'high_and_critical_alerts_count': high_and_critical_alerts_count,
        'high_crowd_locations_count': high_crowd_locations_count,
        'locations': locations_summary,
        'hourly_crowd_trends': hourly_trends,
    }


def calculate_hourly_crowd_trends(total_safe_capacity: int):
    """
    Computes hourly crowd volume based on stored readings.
    Returns ordered hourly trend points compatible with dashboard charts.
    """
    readings = CrowdReading.objects.all().order_by('timestamp')
    if not readings.exists():
        return []

    # Group latest reading per location per hour
    # We bucket timestamps by hour string (e.g. '08:00', '09:00', ...)
    hourly_buckets = {}
    
    for r in readings:
        hour_label = r.timestamp.strftime('%H:00')
        loc_id = r.location_id
        if hour_label not in hourly_buckets:
            hourly_buckets[hour_label] = {}
        # Keep latest reading for this location in this hour bucket
        hourly_buckets[hour_label][loc_id] = r.crowd_count

    safe_limit = total_safe_capacity
    peak_limit = int(total_safe_capacity * 1.15) if total_safe_capacity > 0 else 0

    trend_points = []
    # Sort hours chronologically
    sorted_hours = sorted(hourly_buckets.keys())
    for hour in sorted_hours:
        total_hour_crowd = sum(hourly_buckets[hour].values())
        trend_points.append({
            'time': hour,
            'total_crowd': total_hour_crowd,
            'totalCrowd': total_hour_crowd,
            'safe_limit': safe_limit,
            'safeLimit': safe_limit,
            'peak_limit': peak_limit,
            'peakLimit': peak_limit,
        })

    return trend_points

