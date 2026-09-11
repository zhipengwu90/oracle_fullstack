from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.db import connection
from django.middleware.csrf import get_token
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Mortgage
from .serializers import MortgageSerializer


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
    logged in. Used by the Next.js middleware to gate protected pages -
    it forwards the browser's Cookie header here on every protected
    request. Always 200; the "authenticated" field is what callers check.

    Note: this is called server-to-server (NavBar/middleware fetch it
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


class MortgageListView(generics.ListAPIView):
    """GET /api/mortgages/ -> all rows from myapp_v1.mortgage as a plain JSON array."""
    queryset = Mortgage.objects.all().order_by('id')
    serializer_class = MortgageSerializer
    permission_classes = [AllowAny]
    pagination_class = None
