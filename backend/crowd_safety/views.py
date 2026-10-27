from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.db import connection
from django.utils import timezone
import sys
import time
import json
import socket
import urllib.request
import urllib.error
import subprocess
from pathlib import Path
import django

from .models import Location, CrowdReading, Alert
from .serializers import (
    LocationSerializer,
    CrowdReadingSerializer,
    AlertSerializer,
)
from .services import get_dashboard_summary


# ==========================================
# Location Endpoints
# ==========================================

class LocationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/locations/ - List all monitored venue locations.
    POST /api/locations/ - Register a new monitored location.
    """
    queryset = Location.objects.all().prefetch_related('readings')
    serializer_class = LocationSerializer


class LocationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/locations/<int:pk>/ - Retrieve specific location details.
    PATCH  /api/locations/<int:pk>/ - Partially update location details.
    PUT    /api/locations/<int:pk>/ - Update location details.
    DELETE /api/locations/<int:pk>/ - Delete location with safety validation.
    """
    queryset = Location.objects.all().prefetch_related('readings')
    serializer_class = LocationSerializer

    def perform_destroy(self, instance):
        # Validation: prevent deleting location while active alerts are open
        active_alerts = instance.alerts.filter(status='active')
        if active_alerts.exists():
            raise ValidationError(
                "Cannot delete a location with active unresolved alerts. Resolve all active alerts before removing."
            )
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)


# ==========================================
# Crowd Readings Endpoints
# ==========================================

class CrowdReadingListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/readings/ - List crowd readings (optional filter ?location=<id>).
    POST /api/readings/ - Ingest a new crowd reading and evaluate safety thresholds.
    """
    serializer_class = CrowdReadingSerializer

    def get_queryset(self):
        queryset = CrowdReading.objects.select_related('location').all()
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset[:250]


class CrowdReadingDetailView(generics.RetrieveAPIView):
    """
    GET /api/readings/<int:pk>/ - Retrieve an individual reading by ID.
    """
    queryset = CrowdReading.objects.select_related('location').all()
    serializer_class = CrowdReadingSerializer


# ==========================================
# Alert Endpoints
# ==========================================

class AlertListView(generics.ListAPIView):
    """
    GET /api/alerts/ - List safety alerts (optional filters: ?status=active&severity=critical&location=1).
    """
    serializer_class = AlertSerializer

    def get_queryset(self):
        queryset = Alert.objects.select_related('location').all()
        status_param = self.request.query_params.get('status')
        severity_param = self.request.query_params.get('severity')
        location_id = self.request.query_params.get('location')

        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)
        if severity_param and severity_param != 'all':
            queryset = queryset.filter(severity=severity_param)
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset


class AlertDetailView(generics.RetrieveAPIView):
    """
    GET /api/alerts/<int:pk>/ - Retrieve an individual alert by ID.
    """
    queryset = Alert.objects.select_related('location').all()
    serializer_class = AlertSerializer


class AlertAcknowledgeView(APIView):
    """
    POST /api/alerts/<int:pk>/acknowledge/ - Acknowledge an active safety alert.
    """
    def post(self, request, pk):
        alert = get_object_or_404(Alert, pk=pk)
        try:
            alert.acknowledge()
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': f'Alert {alert.id} acknowledged successfully.',
                'alert': AlertSerializer(alert).data,
            },
            status=status.HTTP_200_OK
        )


class AlertResolveView(APIView):
    """
    POST /api/alerts/<int:pk>/resolve/ - Resolve a safety alert.
    """
    def post(self, request, pk):
        alert = get_object_or_404(Alert, pk=pk)
        alert.resolve()

        return Response(
            {
                'message': f'Alert {alert.id} resolved successfully.',
                'alert': AlertSerializer(alert).data,
            },
            status=status.HTTP_200_OK
        )


# ==========================================
# Dashboard Summary Endpoint
# ==========================================

class DashboardSummaryView(APIView):
    """
    GET /api/dashboard/summary/ - Aggregate venue safety KPIs and hourly trend data.
    """
    def get(self, request):
        summary_data = get_dashboard_summary()
        return Response(summary_data, status=status.HTTP_200_OK)


# ==========================================
# Live Webcam Demonstration Endpoints
# ==========================================

WEBCAM_SERVICE_HOST = "127.0.0.1"
WEBCAM_SERVICE_PORT = 8001
WEBCAM_SERVICE_URL = f"http://{WEBCAM_SERVICE_HOST}:{WEBCAM_SERVICE_PORT}"


def get_demo_location():
    """Retrieves or creates the dedicated demonstration location with default capacity 5."""
    loc, _ = Location.objects.get_or_create(
        name="Live Demonstration Area",
        defaults={
            "location_type": "General Venue",
            "address": "Zone DEMO - Live Webcam Feed",
            "safe_capacity": 5,
        }
    )
    return loc


def is_service_port_open(port=WEBCAM_SERVICE_PORT, host=WEBCAM_SERVICE_HOST):
    """Checks if the webcam runner port is currently open and accepting connections."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


def query_webcam_service(path, method="GET", data=None, timeout=3.0):
    """Communicates with the background Python vision webcam module."""
    url = f"{WEBCAM_SERVICE_URL}{path}"
    req_data = json.dumps(data).encode("utf-8") if data else None
    headers = {"Content-Type": "application/json"} if req_data else {}
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}
    except Exception as e:
        return None, {"error": str(e)}


def ensure_webcam_service_running():
    """Ensures the Python vision webcam runner process is active; launches if needed."""
    code, _ = query_webcam_service("/health", timeout=1.5)
    if code == 200:
        return True, "Webcam runner service is active."

    # If port 8001 is already listening, avoid launching duplicate processes
    if is_service_port_open():
        code, _ = query_webcam_service("/health", timeout=1.5)
        if code == 200:
            return True, "Webcam runner service is active."
        return True, "Webcam service port is listening."

    # Locate vision-venv python executable and script
    root_dir = Path(__file__).resolve().parent.parent.parent
    vision_python = root_dir / "vision-venv" / "Scripts" / "python.exe"
    script_path = root_dir / "vision" / "scripts" / "webcam_runner.py"

    if not vision_python.exists():
        return False, f"Vision virtual environment Python not found at: {vision_python}"
    if not script_path.exists():
        return False, f"Webcam runner script not found at: {script_path}"

    try:
        flags = 0
        if sys.platform == "win32":
            flags = subprocess.CREATE_NO_WINDOW

        subprocess.Popen(
            [str(vision_python), str(script_path), "--port", str(WEBCAM_SERVICE_PORT)],
            cwd=str(root_dir),
            creationflags=flags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        for _ in range(25):
            time.sleep(0.3)
            status_code, _ = query_webcam_service("/health", timeout=0.8)
            if status_code == 200:
                return True, "Webcam runner service launched successfully."

        return False, "Timed out waiting for webcam runner service to start on port 8001."
    except Exception as exc:
        return False, f"Failed to start webcam process: {exc}"


class WebcamStatusView(APIView):
    """
    GET /api/webcam/status/ - Get live webcam capture state and demonstration telemetry.
    """
    def get(self, request):
        demo_loc = get_demo_location()
        code, data = query_webcam_service("/status", timeout=2.0)
        is_running = False
        is_starting = False
        error = None
        fps = 0.0
        crowd_count = 0
        camera_index = 0

        if code == 200 and isinstance(data, dict):
            is_running = data.get("is_running", False)
            is_starting = data.get("is_starting", False)
            error = data.get("error")
            fps = data.get("fps", 0.0)
            crowd_count = data.get("crowd_count", 0)
            camera_index = data.get("camera_index", 0)

        return Response({
            "is_running": is_running,
            "is_starting": is_starting,
            "is_service_active": (code == 200),
            "camera_index": camera_index,
            "crowd_count": crowd_count,
            "fps": fps,
            "error": error,
            "demo_location": {
                "id": demo_loc.id,
                "name": demo_loc.name,
                "safe_capacity": demo_loc.safe_capacity,
                "current_count": demo_loc.current_count,
                "occupancy_percentage": demo_loc.occupancy_percentage,
                "current_status": demo_loc.current_status,
            }
        }, status=status.HTTP_200_OK)


class WebcamStartView(APIView):
    """
    POST /api/webcam/start/ - Start OpenCV webcam capture and YOLO detection.
    """
    def post(self, request):
        success, msg = ensure_webcam_service_running()
        if not success:
            return Response({"success": False, "error": msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        camera_index = request.data.get("camera_index", 0)
        code, data = query_webcam_service("/start", method="POST", data={"camera_index": camera_index}, timeout=8.0)

        if code == 200:
            return Response(data, status=status.HTTP_200_OK)
        else:
            err_msg = data.get("message") or data.get("error") or "Failed to open webcam."
            return Response({"success": False, "error": err_msg}, status=status.HTTP_400_BAD_REQUEST)


class WebcamStopView(APIView):
    """
    POST /api/webcam/stop/ - Stop OpenCV webcam capture and release camera resource.
    """
    def post(self, request):
        code, data = query_webcam_service("/stop", method="POST", timeout=3.0)
        if code == 200:
            return Response(data, status=status.HTTP_200_OK)
        return Response({"success": True, "message": "Webcam stopped or service inactive."}, status=status.HTTP_200_OK)


class WebcamConfigureView(APIView):
    """
    GET  /api/webcam/configure/ - Retrieve demonstration location configuration.
    POST /api/webcam/configure/ - Update demonstration location safe capacity.
    """
    def get(self, request):
        demo_loc = get_demo_location()
        return Response({
            "demo_location_id": demo_loc.id,
            "name": demo_loc.name,
            "safe_capacity": demo_loc.safe_capacity,
            "current_count": demo_loc.current_count,
            "occupancy_percentage": demo_loc.occupancy_percentage,
            "current_status": demo_loc.current_status,
            "high_threshold_percentage": 75.0,
            "critical_threshold_percentage": 90.0,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        demo_loc = get_demo_location()
        new_capacity = request.data.get("safe_capacity")
        if new_capacity is not None:
            try:
                new_cap_int = int(new_capacity)
                if new_cap_int <= 0:
                    return Response({"error": "Capacity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)
                demo_loc.safe_capacity = new_cap_int
                demo_loc.save(update_fields=["safe_capacity", "updated_at"])
                # Also notify webcam runner if running
                query_webcam_service("/configure", method="POST", data={"safe_capacity": new_cap_int}, timeout=1.0)
            except (ValueError, TypeError):
                return Response({"error": "Invalid capacity value."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "demo_location_id": demo_loc.id,
            "name": demo_loc.name,
            "safe_capacity": demo_loc.safe_capacity,
            "occupancy_percentage": demo_loc.occupancy_percentage,
            "current_status": demo_loc.current_status,
        }, status=status.HTTP_200_OK)


class WebcamFeedProxyView(APIView):
    """
    GET /api/webcam/feed/ - Proxy the live MJPEG camera stream from the vision service.
    """
    def get(self, request):
        def stream_generator():
            try:
                req = urllib.request.Request(f"{WEBCAM_SERVICE_URL}/feed")
                with urllib.request.urlopen(req, timeout=10.0) as stream:
                    while True:
                        chunk = stream.read(4096)
                        if not chunk:
                            break
                        yield chunk
            except (GeneratorExit, Exception):
                return

        try:
            resp = StreamingHttpResponse(
                stream_generator(),
                content_type="multipart/x-mixed-replace; boundary=frame"
            )
            resp["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp["Pragma"] = "no-cache"
            resp["Expires"] = "0"
            return resp
        except Exception as e:
            return Response({"error": f"Stream unavailable: {e}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)



# ==========================================
# Root Status / Homepage Endpoint
# ==========================================

def home_view(request):
    """
    Root status page for CrowdGuard Django Backend.
    Performs real database and system checks and displays a clean status overview.
    """
    db_status = "Connected"
    is_healthy = True
    error_msg = None
    locations_count = 0
    readings_count = 0
    alerts_count = 0

    try:
        connection.ensure_connection()
        locations_count = Location.objects.count()
        readings_count = CrowdReading.objects.count()
        alerts_count = Alert.objects.count()
    except Exception as e:
        db_status = "Disconnected"
        is_healthy = False
        error_msg = str(e)

    # Return JSON if explicitly requested via Accept header or query param
    accept_header = request.headers.get('Accept', '')
    if 'application/json' in accept_header or request.GET.get('format') == 'json':
        return JsonResponse({
            'project': 'CrowdGuard Backend',
            'status': 'healthy' if is_healthy else 'degraded',
            'django_server': 'running',
            'database': {
                'status': db_status,
                'locations_count': locations_count,
                'readings_count': readings_count,
                'alerts_count': alerts_count,
                'error': error_msg,
            },
            'timestamp': timezone.now().isoformat(),
            'endpoints': {
                'admin': '/admin/',
                'locations': '/api/locations/',
                'readings': '/api/readings/',
                'alerts': '/api/alerts/',
                'dashboard_summary': '/api/dashboard/summary/',
            }
        }, status=200 if is_healthy else 503)

    badge_bg = "#064e3b" if is_healthy else "#7f1d1d"
    badge_text = "#34d399" if is_healthy else "#f87171"
    badge_border = "#059669" if is_healthy else "#dc2626"
    status_label = "SYSTEM HEALTHY" if is_healthy else "SYSTEM DEGRADED"
    now_str = timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrowdGuard Backend — Status</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0b1120;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }}
    .card {{
      width: 100%;
      max-width: 720px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }}
    .header {{
      background: #0d162b;
      border-bottom: 1px solid #334155;
      padding: 24px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .header-title h1 {{
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }}
    .header-title p {{
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: {badge_bg};
      color: {badge_text};
      border: 1px solid {badge_border};
    }}
    .dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: {badge_text};
      box-shadow: 0 0 8px {badge_text};
    }}
    .content {{
      padding: 28px;
    }}
    .stats-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }}
    .stat-card {{
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }}
    .stat-value {{
      font-size: 20px;
      font-weight: 700;
      color: #38bdf8;
      font-family: monospace;
    }}
    .stat-label {{
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }}
    .section-title {{
      font-size: 12px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 12px;
    }}
    .links-list {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }}
    .link-item {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px 16px;
      text-decoration: none;
      color: inherit;
      transition: all 0.15s ease;
    }}
    .link-item:hover {{
      border-color: #38bdf8;
      background: #19243a;
      transform: translateY(-1px);
    }}
    .link-info {{
      display: flex;
      flex-direction: column;
      gap: 2px;
    }}
    .link-name {{
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
    }}
    .link-desc {{
      font-size: 11px;
      color: #94a3b8;
    }}
    .link-path {{
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }}
    .footer {{
      background: #0d162b;
      border-top: 1px solid #334155;
      padding: 16px 28px;
      font-size: 12px;
      color: #94a3b8;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }}
    .footer a {{
      color: #38bdf8;
      text-decoration: none;
    }}
    .footer a:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-title">
        <h1>CrowdGuard Backend</h1>
        <p>Django REST Framework server is running and active</p>
      </div>
      <div class="badge">
        <span class="dot"></span>
        <span>{status_label}</span>
      </div>
    </div>
    <div class="content">
      <div class="section-title">Backend Health & Database Status</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{db_status}</div>
          <div class="stat-label">Database</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{locations_count}</div>
          <div class="stat-label">Locations</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{readings_count}</div>
          <div class="stat-label">Readings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{alerts_count}</div>
          <div class="stat-label">Alerts</div>
        </div>
      </div>

      <div class="section-title">Available API Endpoints & Administration</div>
      <div class="links-list">
        <a href="/admin/" class="link-item">
          <div class="link-info">
            <span class="link-name">Django Administration</span>
            <span class="link-desc">Manage location records, database models, and users</span>
          </div>
          <span class="link-path">/admin/</span>
        </a>
        <a href="/api/dashboard/summary/" class="link-item">
          <div class="link-info">
            <span class="link-name">Dashboard Summary API</span>
            <span class="link-desc">Aggregated venue KPIs, occupancy counts, and hourly trends</span>
          </div>
          <span class="link-path">/api/dashboard/summary/</span>
        </a>
        <a href="/api/locations/" class="link-item">
          <div class="link-info">
            <span class="link-name">Locations API</span>
            <span class="link-desc">List all monitored venue sectors and capacities</span>
          </div>
          <span class="link-path">/api/locations/</span>
        </a>
        <a href="/api/readings/" class="link-item">
          <div class="link-info">
            <span class="link-name">Crowd Readings API</span>
            <span class="link-desc">POST AI camera readings / GET historical crowd telemetry</span>
          </div>
          <span class="link-path">/api/readings/</span>
        </a>
        <a href="/api/alerts/" class="link-item">
          <div class="link-info">
            <span class="link-name">Safety Alerts API</span>
            <span class="link-desc">View and triage active, acknowledged, or resolved incidents</span>
          </div>
          <span class="link-path">/api/alerts/</span>
        </a>
      </div>
    </div>
    <div class="footer">
      <span>Server Time: {now_str}</span>
      <span>Frontend URL: <a href="http://localhost:5173" target="_blank">http://localhost:5173</a></span>
    </div>
  </div>
</body>
</html>"""
    return HttpResponse(html, content_type="text/html")


