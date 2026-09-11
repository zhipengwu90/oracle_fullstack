from django.db import models


class Test(models.Model):
    """
    Maps to the existing "test" table in the myapp_v1 schema.

    managed = False -> Django never creates/alters/drops this table via
    migrations; it only reads/writes rows. The bare db_table = 'test'
    resolves to myapp_v1.test through the connection search_path
    (DB_SCHEMA=myapp_v1, set in settings.py / .env).

    To add another myapp_v1 table to the admin: add a model here the same
    way (managed = False, db_table = '<table name>'), then register it in
    admin.py. No migration needed since the table already exists.
    """
    id = models.IntegerField(primary_key=True)
    data = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'test'
