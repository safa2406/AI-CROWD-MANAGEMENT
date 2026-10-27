from unittest.mock import patch, MagicMock
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Location, CrowdReading, Alert
from .services import (
    calculate_occupancy_percentage,
    determine_crowd_status,
    evaluate_reading_for_alerts,
    get_dashboard_summary,
)


class LocationTests(APITestCase):
    def setUp(self):
        self.location = Location.objects.create(
            name="Main Plaza Test Area",
            location_type="Public Plaza",
            address="Zone A",
            safe_capacity=1000,
        )

    def test_location_creation_valid(self):
        """Test valid location creation and basic string representation."""
        self.assertEqual(self.location.name, "Main Plaza Test Area")
        self.assertEqual(self.location.safe_capacity, 1000)
        self.assertEqual(self.location.current_count, 0)
        self.assertEqual(self.location.occupancy_percentage, 0.0)
        self.assertEqual(self.location.current_status, "low")

    def test_location_safe_capacity_must_be_positive(self):
        """Test that safe_capacity <= 0 raises ValidationError."""
        invalid_loc = Location(
            name="Zero Capacity Arena",
            location_type="Transit Station",
            safe_capacity=0,
        )
        with self.assertRaises(ValidationError):
            invalid_loc.clean()

    def test_location_occupancy_percentage_and_status_thresholds(self):
        """Test crowd status thresholds: low (<50%), moderate (50-74%), high (75-89%), critical (>=90%)."""
        loc = self.location
        
        # 1. Low status (< 50%)
        CrowdReading.objects.create(location=loc, crowd_count=400, data_source='simulated_sensor')
        self.assertEqual(loc.current_count, 400)
        self.assertEqual(loc.occupancy_percentage, 40.0)
        self.assertEqual(loc.current_status, "low")
        self.assertEqual(determine_crowd_status(40.0), "low")

        # 2. Moderate status (50% to < 75%)
        CrowdReading.objects.create(location=loc, crowd_count=650, data_source='simulated_sensor')
        self.assertEqual(loc.current_count, 650)
        self.assertEqual(loc.occupancy_percentage, 65.0)
        self.assertEqual(loc.current_status, "moderate")
        self.assertEqual(determine_crowd_status(65.0), "moderate")

        # 3. High status (75% to < 90%)
        CrowdReading.objects.create(location=loc, crowd_count=800, data_source='simulated_sensor')
        self.assertEqual(loc.current_count, 800)
        self.assertEqual(loc.occupancy_percentage, 80.0)
        self.assertEqual(loc.current_status, "high")
        self.assertEqual(determine_crowd_status(80.0), "high")

        # 4. Critical status (>= 90%)
        CrowdReading.objects.create(location=loc, crowd_count=950, data_source='simulated_sensor')
        self.assertEqual(loc.current_count, 950)
        self.assertEqual(loc.occupancy_percentage, 95.0)
        self.assertEqual(loc.current_status, "critical")
        self.assertEqual(determine_crowd_status(95.0), "critical")

    def test_location_api_list_and_create(self):
        """Test GET /api/locations/ and POST /api/locations/."""
        # List
        res_list = self.client.get('/api/locations/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.data), 1)

        # Create valid
        payload = {
            "name": "North Gate Terminal",
            "location_type": "Transit Station",
            "address": "Terminal 1",
            "safe_capacity": 2500,
        }
        res_create = self.client.post('/api/locations/', payload)
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_create.data['name'], "North Gate Terminal")

        # Create invalid (safe_capacity <= 0)
        invalid_payload = {
            "name": "Invalid Venue",
            "location_type": "Public Plaza",
            "safe_capacity": 0,
        }
        res_invalid = self.client.post('/api/locations/', invalid_payload)
        self.assertEqual(res_invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_location_api_retrieve_patch_delete(self):
        """Test GET, PATCH, and DELETE on /api/locations/<id>/."""
        loc_id = self.location.id
        # Retrieve
        res = self.client.get(f'/api/locations/{loc_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], "Main Plaza Test Area")

        # Patch
        patch_res = self.client.patch(f'/api/locations/{loc_id}/', {"safe_capacity": 1500})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['safe_capacity'], 1500)

        # Delete with active alert -> should fail validation (HTTP 400)
        Alert.objects.create(location=self.location, severity='high', message="Active test alert", status='active')
        del_fail = self.client.delete(f'/api/locations/{loc_id}/')
        self.assertEqual(del_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Delete after resolving alert -> HTTP 204
        Alert.objects.filter(location=self.location).update(status='resolved')
        del_ok = self.client.delete(f'/api/locations/{loc_id}/')
        self.assertEqual(del_ok.status_code, status.HTTP_204_NO_CONTENT)

    def test_location_invalid_id_returns_404(self):
        """Test non-existent location ID returns HTTP 404."""
        res = self.client.get('/api/locations/99999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class CrowdReadingTests(APITestCase):
    def setUp(self):
        self.location = Location.objects.create(
            name="Sensor Test Zone",
            location_type="Transit Station",
            safe_capacity=2000,
        )

    def test_reading_creation_valid(self):
        """Test valid reading creation and occupancy serialization."""
        reading = CrowdReading.objects.create(
            location=self.location,
            crowd_count=1200,
            data_source='simulated_sensor'
        )
        self.assertEqual(reading.crowd_count, 1200)
        self.assertEqual(reading.data_source, 'simulated_sensor')

    def test_reading_negative_count_rejected(self):
        """Test that negative crowd count raises validation error."""
        reading = CrowdReading(
            location=self.location,
            crowd_count=-50,
            data_source='simulated_sensor'
        )
        with self.assertRaises(ValidationError):
            reading.clean()

        # Serializer / API rejection
        res = self.client.post('/api/readings/', {
            "location": self.location.id,
            "crowd_count": -10,
            "data_source": "simulated_sensor"
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reading_api_list_create_and_retrieve(self):
        """Test GET /api/readings/, POST /api/readings/, GET /api/readings/<id>/."""
        post_res = self.client.post('/api/readings/', {
            "location": self.location.id,
            "crowd_count": 800,
            "data_source": "simulated_sensor"
        })
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)
        reading_id = post_res.data['id']
        self.assertEqual(post_res.data['occupancy_percentage'], 40.0)

        # Retrieve
        get_res = self.client.get(f'/api/readings/{reading_id}/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['crowd_count'], 800)

        # Invalid reading ID
        invalid_res = self.client.get('/api/readings/99999/')
        self.assertEqual(invalid_res.status_code, status.HTTP_404_NOT_FOUND)


class SafetyLogicAndAlertTests(APITestCase):
    def setUp(self):
        self.location = Location.objects.create(
            name="Threshold Test Area",
            location_type="Stadium Walkway",
            safe_capacity=1000,
        )

    def test_high_alert_generated_at_75_percent(self):
        """Occupancy reaching 75% creates a high alert."""
        reading = CrowdReading.objects.create(
            location=self.location,
            crowd_count=750,  # exactly 75%
            data_source='simulated_sensor'
        )
        alert, created, _ = evaluate_reading_for_alerts(reading)
        self.assertTrue(created)
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, 'high')
        self.assertEqual(alert.status, 'active')

    def test_critical_alert_generated_at_90_percent(self):
        """Occupancy reaching 90% creates a critical alert."""
        reading = CrowdReading.objects.create(
            location=self.location,
            crowd_count=900,  # exactly 90%
            data_source='simulated_sensor'
        )
        alert, created, _ = evaluate_reading_for_alerts(reading)
        self.assertTrue(created)
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, 'critical')
        self.assertEqual(alert.status, 'active')

    def test_low_and_moderate_do_not_generate_high_or_critical_alerts(self):
        """Occupancy below 75% does not create high or critical alerts."""
        reading_low = CrowdReading.objects.create(
            location=self.location,
            crowd_count=450,  # 45%
            data_source='simulated_sensor'
        )
        alert_low, created_low, _ = evaluate_reading_for_alerts(reading_low)
        self.assertFalse(created_low)
        self.assertIsNone(alert_low)

        reading_mod = CrowdReading.objects.create(
            location=self.location,
            crowd_count=700,  # 70%
            data_source='simulated_sensor'
        )
        alert_mod, created_mod, _ = evaluate_reading_for_alerts(reading_mod)
        self.assertFalse(created_mod)
        self.assertIsNone(alert_mod)

    def test_duplicate_alert_prevention(self):
        """Repeated readings under same condition suppress duplicate alerts."""
        # First reading triggers High alert
        r1 = CrowdReading.objects.create(location=self.location, crowd_count=780, data_source='simulated_sensor')
        a1, created1, _ = evaluate_reading_for_alerts(r1)
        self.assertTrue(created1)

        # Second reading at 80% should be suppressed
        r2 = CrowdReading.objects.create(location=self.location, crowd_count=800, data_source='simulated_sensor')
        a2, created2, msg = evaluate_reading_for_alerts(r2)
        self.assertFalse(created2)
        self.assertEqual(Alert.objects.filter(location=self.location, severity='high').count(), 1)
        self.assertIn("Duplicate", msg)

    def test_severity_escalation_from_high_to_critical(self):
        """Existing high alert escalates to critical when occupancy rises to >= 90%."""
        # Location reaches 80% -> High alert
        r_high = CrowdReading.objects.create(location=self.location, crowd_count=800, data_source='simulated_sensor')
        high_alert, created_high, _ = evaluate_reading_for_alerts(r_high)
        self.assertEqual(high_alert.severity, 'high')

        # Location surges to 95% -> Escalate to Critical
        r_crit = CrowdReading.objects.create(location=self.location, crowd_count=950, data_source='simulated_sensor')
        escalated_alert, escalated, msg = evaluate_reading_for_alerts(r_crit)

        self.assertTrue(escalated)
        self.assertEqual(escalated_alert.id, high_alert.id)
        self.assertEqual(escalated_alert.severity, 'critical')
        self.assertEqual(escalated_alert.status, 'active')
        self.assertIn("Escalation", msg)

    def test_alerts_not_automatically_resolved_on_low_reading(self):
        """A new safe reading arriving does NOT automatically resolve active alerts."""
        # Trigger critical alert
        r_crit = CrowdReading.objects.create(location=self.location, crowd_count=920, data_source='simulated_sensor')
        crit_alert, _, _ = evaluate_reading_for_alerts(r_crit)
        self.assertEqual(crit_alert.status, 'active')

        # Subsequent low reading arrives
        r_low = CrowdReading.objects.create(location=self.location, crowd_count=300, data_source='simulated_sensor')
        evaluate_reading_for_alerts(r_low)

        # Alert should still be active
        crit_alert.refresh_from_db()
        self.assertEqual(crit_alert.status, 'active')
        self.assertIsNone(crit_alert.resolved_at)

    def test_alert_acknowledgement_and_resolution_endpoints(self):
        """Test separate alert acknowledgement and resolution operations."""
        alert = Alert.objects.create(
            location=self.location,
            severity='high',
            message="Test High Warning",
            status='active'
        )

        # 1. Acknowledge
        ack_res = self.client.post(f'/api/alerts/{alert.id}/acknowledge/')
        self.assertEqual(ack_res.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertEqual(alert.status, 'acknowledged')
        self.assertIsNotNone(alert.acknowledged_at)

        # 2. Resolve
        res_res = self.client.post(f'/api/alerts/{alert.id}/resolve/')
        self.assertEqual(res_res.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertEqual(alert.status, 'resolved')
        self.assertIsNotNone(alert.resolved_at)

        # 3. Cannot acknowledge after resolution
        bad_ack = self.client.post(f'/api/alerts/{alert.id}/acknowledge/')
        self.assertEqual(bad_ack.status_code, status.HTTP_400_BAD_REQUEST)

    def test_alert_invalid_id_returns_404(self):
        """Test non-existent alert ID returns HTTP 404."""
        ack_res = self.client.post('/api/alerts/99999/acknowledge/')
        self.assertEqual(ack_res.status_code, status.HTTP_404_NOT_FOUND)


class DashboardSummaryAPITests(APITestCase):
    def setUp(self):
        # Create 2 locations with known safe capacities
        self.loc1 = Location.objects.create(
            name="Zone Alpha Station",
            location_type="Transit Station",
            safe_capacity=1000,
        )
        self.loc2 = Location.objects.create(
            name="Zone Beta Plaza",
            location_type="Public Plaza",
            safe_capacity=2000,
        )

        # loc1: 850 (85% -> High)
        CrowdReading.objects.create(location=self.loc1, crowd_count=850, data_source='simulated_sensor')
        # loc2: 500 (25% -> Low)
        CrowdReading.objects.create(location=self.loc2, crowd_count=500, data_source='simulated_sensor')

        # Active alert on loc1
        Alert.objects.create(location=self.loc1, severity='high', message="Loc 1 high alert", status='active')

    def test_dashboard_summary_calculations(self):
        """Test venue-wide summary statistics, overall occupancy calculation, and JSON structure."""
        res = self.client.get('/api/dashboard/summary/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Total Monitored Locations = 2
        self.assertEqual(data['total_locations'], 2)

        # Total Current Crowd = 850 + 500 = 1350
        self.assertEqual(data['total_crowd_count'], 1350)

        # Total Safe Capacity = 1000 + 2000 = 3000
        self.assertEqual(data['total_safe_capacity'], 3000)

        # Overall Occupancy Percentage = (1350 / 3000) * 100 = 45.0%
        # (NOT an average of loc1's 85% and loc2's 25% which would be 55%)
        self.assertEqual(data['overall_occupancy_percentage'], 45.0)

        # Active Alerts Count = 1
        self.assertEqual(data['active_alerts_count'], 1)
        self.assertEqual(data['high_and_critical_alerts_count'], 1)

        # High Crowd Locations Count (loc1 is high, loc2 is low) = 1
        self.assertEqual(data['high_crowd_locations_count'], 1)

        # Locations List
        self.assertEqual(len(data['locations']), 2)
        loc1_data = next(l for l in data['locations'] if l['id'] == self.loc1.id)
        self.assertEqual(loc1_data['current_count'], 850)
        self.assertEqual(loc1_data['current_status'], 'high')

        # Hourly Crowd Trends present as a list
        self.assertIsInstance(data['hourly_crowd_trends'], list)


class WebcamDemonstrationTests(APITestCase):
    def setUp(self):
        self.demo_loc = Location.objects.create(
            name="Live Demonstration Area",
            location_type="General Venue",
            address="Zone DEMO - Live Webcam Feed",
            safe_capacity=5,
        )

    def test_webcam_status_endpoint(self):
        """Test GET /api/webcam/status/ returns proper structure and demo location info."""
        res = self.client.get('/api/webcam/status/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('is_running', res.data)
        self.assertIn('demo_location', res.data)
        self.assertEqual(res.data['demo_location']['name'], "Live Demonstration Area")
        self.assertEqual(res.data['demo_location']['safe_capacity'], 5)

    def test_webcam_configure_capacity_endpoint(self):
        """Test GET and POST /api/webcam/configure/ to configure demonstration capacity dynamically."""
        # GET config
        res_get = self.client.get('/api/webcam/configure/')
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.data['safe_capacity'], 5)

        # POST update capacity to 8
        res_post = self.client.post('/api/webcam/configure/', {'safe_capacity': 8}, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertEqual(res_post.data['safe_capacity'], 8)
        self.demo_loc.refresh_from_db()
        self.assertEqual(self.demo_loc.safe_capacity, 8)

        # Reset back to 5 for subsequent demonstration tests
        self.client.post('/api/webcam/configure/', {'safe_capacity': 5}, format='json')

    def test_demonstration_capacity_alert_generation_flow(self):
        """
        Verify the exact college review demonstration requirements with capacity = 5:
        - 0-3 people (0-60%): Normal/Moderate, no alert
        - 4 people (80%): High alert generated
        - 5 people (100%): Critical alert generated and takes precedence
        """
        loc = self.demo_loc
        self.assertEqual(loc.safe_capacity, 5)

        # 1. 3 people detected (60% occupancy) -> No alert
        res1 = self.client.post('/api/readings/', {
            'location': loc.id,
            'crowd_count': 3,
            'data_source': 'cctv_ai_detection'
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['occupancy_percentage'], 60.0)
        self.assertEqual(Alert.objects.filter(location=loc).count(), 0)

        # 2. 4 people detected (80% occupancy >= 75%) -> High alert generated
        res2 = self.client.post('/api/readings/', {
            'location': loc.id,
            'crowd_count': 4,
            'data_source': 'cctv_ai_detection'
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data['occupancy_percentage'], 80.0)
        high_alerts = Alert.objects.filter(location=loc, status='active')
        self.assertEqual(high_alerts.count(), 1)
        self.assertEqual(high_alerts.first().severity, 'high')

        # 3. 5 people detected (100% occupancy >= 90%) -> Critical alert takes precedence (escalated)
        res3 = self.client.post('/api/readings/', {
            'location': loc.id,
            'crowd_count': 5,
            'data_source': 'cctv_ai_detection'
        }, format='json')
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res3.data['occupancy_percentage'], 100.0)
        active_alerts = Alert.objects.filter(location=loc, status='active')
        self.assertEqual(active_alerts.count(), 1)
        self.assertEqual(active_alerts.first().severity, 'critical')

        # 4. Count drops to 4 people (80%): Critical alert is NOT downgraded to high
        res4 = self.client.post('/api/readings/', {
            'location': loc.id,
            'crowd_count': 4,
            'data_source': 'cctv_ai_detection'
        }, format='json')
        self.assertEqual(res4.status_code, status.HTTP_201_CREATED)
        active_alerts_after = Alert.objects.filter(location=loc, status='active')
        self.assertEqual(active_alerts_after.count(), 1)
        self.assertEqual(active_alerts_after.first().severity, 'critical')

    @patch('crowd_safety.views.query_webcam_service')
    def test_webcam_status_view_with_active_runner(self, mock_query):
        """Test GET /api/webcam/status/ when runner service reports active capture."""
        mock_query.return_value = (200, {
            'is_running': True,
            'is_starting': False,
            'camera_index': 0,
            'crowd_count': 3,
            'fps': 24.2,
            'error': None,
        })
        res = self.client.get('/api/webcam/status/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_running'])
        self.assertTrue(res.data['is_service_active'])
        self.assertEqual(res.data['crowd_count'], 3)
        self.assertEqual(res.data['fps'], 24.2)

    @patch('crowd_safety.views.query_webcam_service')
    def test_webcam_status_view_with_offline_runner(self, mock_query):
        """Test GET /api/webcam/status/ when runner service is unreachable (timeout/error)."""
        mock_query.return_value = (None, {'error': 'timed out'})
        res = self.client.get('/api/webcam/status/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['is_running'])
        self.assertFalse(res.data['is_service_active'])

    @patch('crowd_safety.views.ensure_webcam_service_running')
    @patch('crowd_safety.views.query_webcam_service')
    def test_webcam_start_view_success(self, mock_query, mock_ensure):
        """Test POST /api/webcam/start/ launches webcam successfully."""
        mock_ensure.return_value = (True, "Webcam runner service is active.")
        mock_query.return_value = (200, {
            'success': True,
            'message': 'Webcam capture started successfully.',
            'status': {'is_running': True, 'camera_index': 0}
        })
        res = self.client.post('/api/webcam/start/', {'camera_index': 0}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])

    @patch('crowd_safety.views.query_webcam_service')
    def test_webcam_stop_view(self, mock_query):
        """Test POST /api/webcam/stop/ safely releases camera."""
        mock_query.return_value = (200, {
            'success': True,
            'message': 'Webcam stopped successfully.',
            'status': {'is_running': False}
        })
        res = self.client.post('/api/webcam/stop/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])



