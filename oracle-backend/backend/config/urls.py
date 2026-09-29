"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api-auth/', include('rest_framework.urls')),
    # Always-on (not just DEBUG): low-traffic personal site, so Django
    # serving /media/ directly is simpler than an nginx alias or S3. nginx
    # still proxies /media/ to this app first, same as /static/.
    path('media/<path:path>', serve, {'document_root': settings.MEDIA_ROOT}),
]
