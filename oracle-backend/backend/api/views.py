from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.core.paginator import Paginator
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

from . import stock_quotes
from .models import Experience, Profile, Project, SocialLink, Skill, Stat, Topic, TrackedStock
from .topic_sources import collect_topics
from .serializers import (
    ExperienceSerializer,
    ProfileSerializer,
    PublicTopicSerializer,
    ProjectSerializer,
    SocialLinkSerializer,
    SkillSerializer,
    StatSerializer,
    TopicSerializer,
    TrackedStockSerializer,
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


def _with_quotes(stocks):
    """Serialize watchlist rows with their live quote attached under "quote"."""
    quotes = stock_quotes.get_quotes([s.symbol for s in stocks])
    rows = TrackedStockSerializer(stocks, many=True).data
    for row in rows:
        row['quote'] = quotes.get(row['symbol'])
    return rows


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def stock_list(request):
    """
    GET  /api/stocks/ -> the logged-in user's watchlist, each row with a live
         "quote" (null if Yahoo no longer knows the symbol, {"error": ...} if
         the fetch failed).
    POST /api/stocks/ {"symbol": "SHOP", "market": "CA"|"US"} -> start
         tracking it. The symbol is checked against Yahoo first; for Canada a
         bare ticker is resolved to its exchange listing (SHOP -> SHOP.TO).
         Stock vs ETF and the name come from Yahoo, not the client.

    Each user only ever sees and edits their own list.
    """
    if request.method == 'GET':
        stocks = TrackedStock.objects.filter(user=request.user).order_by('market', 'symbol')
        return Response(_with_quotes(stocks))

    market = request.data.get('market')
    if market not in (TrackedStock.MARKET_CA, TrackedStock.MARKET_US):
        return Response({"error": "Choose Canada or US."}, status=400)
    try:
        quote = stock_quotes.lookup(request.data.get('symbol'), market)
    except stock_quotes.SymbolError as exc:
        return Response({"error": str(exc)}, status=400)
    except (OSError, ValueError) as exc:
        return Response({"error": f"Couldn't reach Yahoo Finance: {exc}"}, status=502)

    stock, created = TrackedStock.objects.get_or_create(
        user=request.user,
        symbol=quote['symbol'],
        defaults={
            'market': market,
            'asset_type': stock_quotes.ASSET_TYPES[quote['instrument_type']],
            'name': (quote['name'] or '')[:200] or None,
        },
    )
    if not created:
        return Response({"error": f"You're already tracking {stock.symbol}."}, status=400)
    row = TrackedStockSerializer(stock).data
    row['quote'] = quote
    return Response(row, status=201)


class StockDetailView(generics.DestroyAPIView):
    """DELETE /api/stocks/<id>/ -> stop tracking. Other users' rows 404."""
    serializer_class = TrackedStockSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TrackedStock.objects.filter(user=self.request.user)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_search(request):
    """
    GET /api/stocks/search/?q=shopify&market=CA -> up to 10 matching stocks
    and ETFs on that market (both markets if market is omitted), for the
    add box's suggestions.
    """
    q = (request.query_params.get('q') or '').strip()
    if not q:
        return Response([])
    market = request.query_params.get('market') or None
    try:
        return Response(stock_quotes.search(q[:50], market))
    except (OSError, ValueError) as exc:
        return Response({"error": f"Couldn't reach Yahoo Finance: {exc}"}, status=502)


TOPICS_PAGE_SIZE = 30


@api_view(['GET'])
@permission_classes([AllowAny])
def topic_list(request):
    """
    GET /api/topics/ -> one page of topics, newest first:
      ?date=YYYY-MM-DD | all   (default: the most recent day that has any)
      ?source=hackernews       (optional)
      ?q=text                  (optional, matches the title)
      ?page=N                  (30 per page; out-of-range pages clamp)

    Returns {"date", "count", "page", "pages", "sources", "results"}.
    "sources" counts every source on the chosen day(s), ignoring ?source
    and ?q, so the filter chips stay put while you filter.

    Public: anyone can browse what's trending. Logged-in users also get the
    private AI fields (see TopicSerializer vs PublicTopicSerializer).
    """
    params = request.query_params
    topics = Topic.objects.all()
    if params.get('date') == 'all':
        day = 'all'
    else:
        day = parse_date(params.get('date') or '') or (
            Topic.objects.order_by('-created_date').values_list('created_date', flat=True).first()
        )
        topics = topics.filter(created_date=day)

    sources = [
        {"source": r['source'], "count": r['count']}
        for r in topics.values('source').annotate(count=Count('tp_id')).order_by('source')
    ]
    if params.get('source'):
        topics = topics.filter(source=params['source'])
    if params.get('q'):
        topics = topics.filter(content__icontains=params['q'])

    page = Paginator(topics.order_by('-created_date', '-tp_id'), TOPICS_PAGE_SIZE).get_page(
        params.get('page')
    )
    serializer = TopicSerializer if request.user.is_authenticated else PublicTopicSerializer
    return Response({
        "date": day,
        "count": page.paginator.count,
        "page": page.number,
        "pages": page.paginator.num_pages,
        "sources": sources,
        "results": serializer(page.object_list, many=True).data,
    })


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
