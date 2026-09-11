from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health_check, name='health-check'),
    path('whoami/', views.whoami, name='whoami'),
    path('logout/', views.logout_view, name='logout'),
    path('mortgages/', views.MortgageListView.as_view(), name='mortgage-list'),
]
