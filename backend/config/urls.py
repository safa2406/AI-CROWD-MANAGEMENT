from django.contrib import admin
from django.urls import path, include
from crowd_safety.views import home_view

urlpatterns = [
    path('', home_view, name='backend-home'),
    path('admin/', admin.site.urls),
    path('api/', include('crowd_safety.urls')),
]

