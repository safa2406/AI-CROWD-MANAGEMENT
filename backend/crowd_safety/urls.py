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
]

