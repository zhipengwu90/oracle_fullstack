from django.core.management.base import BaseCommand, CommandError

from api.topic_sources import SOURCES, collect_topics


class Command(BaseCommand):
    help = (
        "Fetch trending topics from public social/news sites into the topics "
        "table. Meant to run from cron, e.g. on the production host:\n"
        "  docker compose exec -T backend python manage.py collect_topics"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source", action="append", choices=sorted(SOURCES),
            help="Only these sources (repeatable). Default: all.",
        )
        parser.add_argument(
            "--limit", type=int, default=10,
            help="Max items to fetch per source (default 10).",
        )

    def handle(self, *args, **options):
        results = collect_topics(options["source"], options["limit"])
        for name, result in results.items():
            if "error" in result:
                self.stderr.write(f"{name:13} ERROR {result['error']}")
            else:
                self.stdout.write(f"{name:13} +{result['added']} new, {result['skipped']} already saved")
        if all("error" in r for r in results.values()):
            raise CommandError("Every source failed.")
