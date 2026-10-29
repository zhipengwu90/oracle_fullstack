from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health_check, name='health-check'),
    path('whoami/', views.whoami, name='whoami'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('mortgages/', views.MortgageListView.as_view(), name='mortgage-list'),
    path('mortgages/<int:pk>/', views.MortgageDetailView.as_view(), name='mortgage-detail'),
    path('topics/', views.TopicListView.as_view(), name='topic-list'),
    path('topics/collect/', views.topics_collect, name='topic-collect'),
    path('topics/<int:pk>/', views.TopicDetailView.as_view(), name='topic-detail'),
    path('topics/<int:pk>/suggest/', views.topic_suggest, name='topic-suggest'),
    path('portfolio/profile/', views.ProfileDetailView.as_view(), name='portfolio-profile'),
    path('portfolio/stats/', views.StatListView.as_view(), name='portfolio-stats'),
    path('portfolio/skills/', views.SkillListView.as_view(), name='portfolio-skills'),
    path('portfolio/experience/', views.ExperienceListView.as_view(), name='portfolio-experience'),
    path('portfolio/projects/', views.ProjectListView.as_view(), name='portfolio-projects'),
    path('portfolio/social-links/', views.SocialLinkListView.as_view(), name='portfolio-social-links'),
]
