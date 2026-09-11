from django.db import connection
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Test
from .serializers import TestSerializer


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
    """
    if request.user.is_authenticated:
        return Response({"authenticated": True, "username": request.user.username})
    return Response({"authenticated": False})


class TestListView(generics.ListAPIView):
    """GET /api/tests/ -> all rows from my_bank.test as a plain JSON array."""
    queryset = Test.objects.all().order_by('id')
    serializer_class = TestSerializer
    permission_classes = [AllowAny]
    pagination_class = None
