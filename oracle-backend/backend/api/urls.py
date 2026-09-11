from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health_check, name='health-check'),
    path('whoami/', views.whoami, name='whoami'),
    path('tests/', views.TestListView.as_view(), name='test-list'),
]
