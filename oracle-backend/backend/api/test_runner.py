from django.apps import apps
from django.db import connections
from django.test.runner import DiscoverRunner


class UnmanagedModelTestRunner(DiscoverRunner):
    """
    The api app's tables are managed=False (created by hand-written SQL,
    never by migrate), so the throwaway test database would otherwise have
    none of them. Create them there straight from the models after the test
    database is set up; the real databases are never touched.
    """

    def setup_databases(self, **kwargs):
        old_config = super().setup_databases(**kwargs)
        models = apps.get_app_config('api').get_models()
        for alias in connections:
            with connections[alias].schema_editor() as editor:
                for model in models:
                    editor.create_model(model)
        return old_config
