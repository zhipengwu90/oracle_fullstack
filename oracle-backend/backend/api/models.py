from django.db import models


class Mortgage(models.Model):
    """
    Maps to the existing "mortgage" table in the myapp_v1 schema.

    managed = False -> Django never creates/alters/drops this table via
    migrations; it only reads/writes rows. The bare db_table = 'mortgage'
    resolves to myapp_v1.mortgage through the connection search_path
    (DB_SCHEMA=myapp_v1, set in settings.py / .env).
    """
    id = models.BigIntegerField(primary_key=True)
    data = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mortgage'
