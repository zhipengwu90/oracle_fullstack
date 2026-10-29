from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.db import connection
from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Experience, Mortgage, Profile, Project, SocialLink, Skill, Stat, Topic
from .topic_sources import collect_topics
from .serializers import (
    ExperienceSerializer,
    MortgageSerializer,
    ProfileSerializer,
    PublicTopicSerializer,
    ProjectSerializer,
    SocialLinkSerializer,
    SkillSerializer,
    StatSerializer,
    TopicSerializer,
)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Simple liveness/readiness probe that also confirms the DB connection works."""
    db_ok = True
    db_error = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        db_ok = False
        db_error = str(exc)

    status_code = 200 if db_ok else 503
    return Response(
        {
            "status": "ok" if db_ok else "error",
            "database": "ok" if db_ok else db_error,
        },
        status=status_code,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def whoami(request):
    """
    GET /api/whoami/ -> tells the caller whether their session cookie is
    logged in. Used by the Next.js proxy (proxy.ts) to gate protected pages -
    it forwards the browser's Cookie header here on every protected
    request. Always 200; the "authenticated" field is what callers check.

    Note: this is called server-to-server (NavBar/proxy.ts fetch it
    directly from Node, not the browser), so anything it sets via
    Set-Cookie never reaches the browser - that's why get_token() for the
    csrftoken cookie lives in login_view instead, which the browser calls
    directly through the proxy.
    """
    if request.user.is_authenticated:
        return Response({"authenticated": True, "username": request.user.username})
    return Response({"authenticated": False})


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/login/ {"username": ..., "password": ...} -> logs the session
    in. No CSRF token required here: DRF's SessionAuthentication only
    enforces CSRF once there's already a logged-in user to protect, and
    there isn't one yet at the point someone is trying to log in.

    get_token() guarantees this response sets the csrftoken cookie. This
    call is a genuine browser -> (Next.js rewrite/nginx proxy) -> Django
    round trip, so unlike whoami's server-to-server fetch (whose Set-Cookie
    never reaches the browser), this Set-Cookie *does* land in the browser
    - giving LogoutButton a csrftoken cookie to send afterwards.
    """
    get_token(request)
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"authenticated": False, "error": "Invalid username or password."},
            status=400,
        )
    django_login(request, user)
    return Response({"authenticated": True, "username": user.username})


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """
    POST /api/logout/ -> ends the current session. Called from the browser
    (fetch, with an X-CSRFToken header) so it's a same-origin request nginx
    proxies straight to Django; DRF's SessionAuthentication only enforces
    CSRF when there's an actual session to protect, so anonymous calls are
    a harmless no-op.
    """
    django_logout(request)
    return Response({"authenticated": False})


class MortgageListView(generics.ListCreateAPIView):
    """
    GET  /api/mortgages/ -> saved calculator scenarios, oldest first.
    POST /api/mortgages/ {"data": "<JSON string>"} -> save a scenario.

    Login required: the Calculator page is members-only, and so is its data.
    """
    queryset = Mortgage.objects.all().order_by('id')
    serializer_class = MortgageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class MortgageDetailView(generics.DestroyAPIView):
    """DELETE /api/mortgages/<id>/ -> remove a saved scenario."""
    queryset = Mortgage.objects.all()
    serializer_class = MortgageSerializer
    permission_classes = [IsAuthenticated]


class TopicListView(generics.ListAPIView):
    """
    GET /api/topics/?date=YYYY-MM-DD -> that day's topics, newest first.
    Without ?date, returns the most recent day that has any.

    Public: anyone can browse what's trending. Logged-in users also get the
    private AI fields (see TopicSerializer vs PublicTopicSerializer).
    """
    permission_classes = [AllowAny]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.user.is_authenticated:
            return TopicSerializer
        return PublicTopicSerializer

    def get_queryset(self):
        day = parse_date(self.request.query_params.get('date') or '')
        if day is None:
            day = Topic.objects.order_by('-created_date').values_list('created_date', flat=True).first()
        return Topic.objects.filter(created_date=day).order_by('-tp_id')


@api_view(['GET'])
@permission_classes([AllowAny])
def topic_dates(request):
    """GET /api/topics/dates/ -> [{"date": ..., "count": ...}] newest first, for the date picker."""
    rows = (
        Topic.objects.exclude(created_date=None)
        .values('created_date')
        .annotate(count=Count('tp_id'))
        .order_by('-created_date')
    )
    return Response([{"date": r['created_date'], "count": r['count']} for r in rows])


class TopicDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/topics/<id>/ -> one topic (the page polls this while AI works).
    DELETE /api/topics/<id>/ -> remove a topic you don't care about.
    """
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer
    permission_classes = [IsAuthenticated]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def topics_collect(request):
    """
    POST /api/topics/collect/ -> fetch trending items from every source now
    (same as `manage.py collect_topics`). Takes ~10s; returns per-source
    counts or errors.
    """
    return Response(collect_topics())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def topic_suggest(request, pk):
    """
    POST /api/topics/<id>/suggest/ {"question": optional} -> queue this topic
    for Claude Code. Returns immediately with ai_status='pending'; the host's
    scripts/ai_worker.py answers within a minute or two, and the page polls
    GET /api/topics/<id>/ until ai_status is 'done' or 'error'.
    """
    topic = get_object_or_404(Topic, pk=pk)
    topic.ai_status = Topic.AI_PENDING
    topic.ai_question = (request.data.get('question') or '').strip() or None
    topic.ai_requested_at = timezone.now()
    topic.save(update_fields=['ai_status', 'ai_question', 'ai_requested_at'])
    return Response(TopicSerializer(topic).data, status=202)


# ---------------------------------------------------------------------------
# Portfolio content - all read-only and public. Writes happen through
# Django Admin (staff-only, session-authenticated), never through this API.
# ---------------------------------------------------------------------------

class ProfileDetailView(generics.RetrieveAPIView):
    """GET /api/portfolio/profile/ -> the single profile row."""
    serializer_class = ProfileSerializer
    permission_classes = [AllowAny]

    def get_object(self):
        return get_object_or_404(Profile.objects.all())


class StatListView(generics.ListAPIView):
    """GET /api/portfolio/stats/ -> About-page stat counters, in display order."""
    queryset = Stat.objects.all()
    serializer_class = StatSerializer
    permission_classes = [AllowAny]
    pagination_class = None


class SkillListView(generics.ListAPIView):
    """GET /api/portfolio/skills/ -> skills, in display order."""
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    permission_classes = [AllowAny]
    pagination_class = None


class ExperienceListView(generics.ListAPIView):
    """GET /api/portfolio/experience/ -> work history, in display order."""
    queryset = Experience.objects.all()
    serializer_class = ExperienceSerializer
    permission_classes = [AllowAny]
    pagination_class = None


class ProjectListView(generics.ListAPIView):
    """GET /api/portfolio/projects/ -> projects with their tags, in display order."""
    queryset = Project.objects.prefetch_related('tags').all()
    serializer_class = ProjectSerializer
    permission_classes = [AllowAny]
    pagination_class = None


class SocialLinkListView(generics.ListAPIView):
    """GET /api/portfolio/social-links/ -> social/contact links, in display order."""
    queryset = SocialLink.objects.all()
    serializer_class = SocialLinkSerializer
    permission_classes = [AllowAny]
    pagination_class = None
