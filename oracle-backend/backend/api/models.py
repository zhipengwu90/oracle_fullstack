from django.db import models


class Test(models.Model):
    """
    Maps to the existing "test" table in the my_bank schema.

    managed = False -> Django never creates/alters/drops this table via
    migrations; it only reads/writes rows. The bare db_table = 'test'
    resolves to my_bank.test through the connection search_path
    (DB_SCHEMA=my_bank, set in settings.py / .env).
    """
    id = models.IntegerField(primary_key=True)
    data = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'test'
