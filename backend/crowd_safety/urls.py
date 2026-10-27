from django.urls import path
from .views import (
    LocationListCreateView,
    LocationDetailView,
    CrowdReadingListCreateView,
    CrowdReadingDetailView,
    AlertListView,
    AlertDetailView,
    AlertAcknowledgeView,
    AlertResolveView,
    DashboardSummaryView,
    WebcamStatusView,
    WebcamStartView,
    WebcamStopView,
    WebcamConfigureView,
    WebcamFeedProxyView,
)

urlpatterns = [
    # Location endpoints
    path('locations/', LocationListCreateView.as_view(), name='location-list-create'),
    path('locations/<int:pk>/', LocationDetailView.as_view(), name='location-detail'),

    # Crowd readings endpoints
    path('readings/', CrowdReadingListCreateView.as_view(), name='reading-list-create'),
    path('readings/<int:pk>/', CrowdReadingDetailView.as_view(), name='reading-detail'),

    # Alert endpoints
    path('alerts/', AlertListView.as_view(), name='alert-list'),
    path('alerts/<int:pk>/', AlertDetailView.as_view(), name='alert-detail'),
    path('alerts/<int:pk>/acknowledge/', AlertAcknowledgeView.as_view(), name='alert-acknowledge'),
    path('alerts/<int:pk>/resolve/', AlertResolveView.as_view(), name='alert-resolve'),

    # Dashboard summary endpoint
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),

    # Live Webcam Demonstration endpoints
    path('webcam/status/', WebcamStatusView.as_view(), name='webcam-status'),
    path('webcam/start/', WebcamStartView.as_view(), name='webcam-start'),
    path('webcam/stop/', WebcamStopView.as_view(), name='webcam-stop'),
    path('webcam/configure/', WebcamConfigureView.as_view(), name='webcam-configure'),
    path('webcam/feed/', WebcamFeedProxyView.as_view(), name='webcam-feed'),
]

