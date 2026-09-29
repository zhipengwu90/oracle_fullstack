FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Note: psycopg2-binary bundles libpq statically, so no libpq-dev/gcc/apt
# step is needed here. If you ever switch to plain `psycopg2` (source
# build) or `psycopg[c]`, add libpq-dev back as an apt-get step.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# backend/media/ is gitignored/dockerignored (it's where end-user uploads
# land, and shouldn't ship in the image) - but these starter portfolio
# images are tracked at sql/seed_images/ instead, so a fresh deploy has
# working pictures immediately. See sql/portfolio_seed.sql.
COPY sql/seed_images/portfolio/ /app/media/portfolio/

RUN python manage.py collectstatic --noinput --skip-checks

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
