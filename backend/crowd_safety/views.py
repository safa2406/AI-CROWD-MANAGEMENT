from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError

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

