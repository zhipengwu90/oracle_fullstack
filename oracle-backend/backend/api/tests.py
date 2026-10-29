import json
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from . import topic_sources
from .models import Mortgage, Topic


class LoggedInTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("tester", password="pw")

    def login(self):
        self.client.force_login(self.user)


class HealthTests(TestCase):
    def test_health_ok(self):
        res = APIClient().get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["database"], "ok")


class MortgageApiTests(LoggedInTestCase):
    def test_anonymous_cannot_read_or_write(self):
        Mortgage.objects.create(data="private")
        self.assertEqual(self.client.get("/api/mortgages/").status_code, 403)
        self.assertEqual(self.client.post("/api/mortgages/", {"data": "{}"}).status_code, 403)

    def test_save_list_and_delete_scenario(self):
        self.login()
        scenario = json.dumps({"name": "Starter home", "price": 500000})
        res = self.client.post("/api/mortgages/", {"data": scenario}, format="json")
        self.assertEqual(res.status_code, 201)
        new_id = res.json()["id"]

        rows = self.client.get("/api/mortgages/").json()
        self.assertEqual([r["data"] for r in rows], [scenario])

        self.assertEqual(self.client.delete(f"/api/mortgages/{new_id}/").status_code, 204)
        self.assertFalse(Mortgage.objects.exists())


class TopicApiTests(LoggedInTestCase):
    def setUp(self):
        super().setUp()
        self.today = date.today()
        self.yesterday = self.today - timedelta(days=1)

    def add(self, content, day=None, **fields):
        return Topic.objects.create(source="hackernews", content=content, created_date=day or self.today, **fields)

    def test_anonymous_can_browse_but_not_see_ai_fields(self):
        self.add("hot", ai_suggestion="private idea", ai_status="done")
        res = self.client.get("/api/topics/")
        self.assertEqual(res.status_code, 200)
        row = res.json()["results"][0]
        self.assertEqual(row["content"], "hot")
        self.assertNotIn("ai_suggestion", row)
        self.assertNotIn("ai_status", row)

    def test_anonymous_cannot_act(self):
        topic = self.add("x")
        self.assertEqual(self.client.post("/api/topics/collect/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/topics/{topic.pk}/suggest/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/topics/{topic.pk}/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/topics/{topic.pk}/").status_code, 403)

    def test_logged_in_sees_ai_fields(self):
        self.login()
        self.add("hot", ai_suggestion="idea", ai_status="done")
        row = self.client.get("/api/topics/").json()["results"][0]
        self.assertEqual((row["ai_suggestion"], row["ai_status"]), ("idea", "done"))

    def test_defaults_to_latest_day_and_filters_by_date(self):
        self.add("old", self.yesterday)
        self.add("new", self.today)
        res = self.client.get("/api/topics/").json()
        self.assertEqual((res["date"], [r["content"] for r in res["results"]]), (self.today.isoformat(), ["new"]))
        res = self.client.get(f"/api/topics/?date={self.yesterday.isoformat()}")
        self.assertEqual([r["content"] for r in res.json()["results"]], ["old"])

    def test_all_days(self):
        self.add("old", self.yesterday)
        self.add("new", self.today)
        res = self.client.get("/api/topics/?date=all")
        self.assertEqual([r["content"] for r in res.json()["results"]], ["new", "old"])

    def test_pagination(self):
        for i in range(35):
            self.add(f"t{i}")
        first = self.client.get("/api/topics/").json()
        self.assertEqual((first["count"], first["page"], first["pages"]), (35, 1, 2))
        self.assertEqual(len(first["results"]), 30)
        self.assertEqual(first["results"][0]["content"], "t34")  # newest first
        second = self.client.get("/api/topics/?page=2").json()
        self.assertEqual([r["content"] for r in second["results"]], [f"t{i}" for i in range(4, -1, -1)])
        # Out-of-range or junk page numbers clamp instead of erroring.
        self.assertEqual(self.client.get("/api/topics/?page=99").json()["page"], 2)
        self.assertEqual(self.client.get("/api/topics/?page=abc").json()["page"], 1)

    def test_source_and_search_filters_keep_full_source_counts(self):
        self.add("Rust release")
        self.add("Python tips")
        Topic.objects.create(source="reddit", content="rust meme", created_date=self.today)
        res = self.client.get("/api/topics/?source=hackernews&q=rust").json()
        self.assertEqual([r["content"] for r in res["results"]], ["Rust release"])
        self.assertEqual(res["count"], 1)
        self.assertEqual(
            res["sources"], [{"source": "hackernews", "count": 2}, {"source": "reddit", "count": 1}]
        )

    def test_dates_list_newest_first_with_counts(self):
        self.add("a", self.yesterday)
        self.add("b", self.today)
        self.add("c", self.today)
        self.assertEqual(
            self.client.get("/api/topics/dates/").json(),
            [{"date": self.today.isoformat(), "count": 2}, {"date": self.yesterday.isoformat(), "count": 1}],
        )

    def test_delete_topic(self):
        self.login()
        topic = self.add("junk")
        self.assertEqual(self.client.delete(f"/api/topics/{topic.pk}/").status_code, 204)
        self.assertFalse(Topic.objects.exists())

    def test_ask_ai_queues_request_for_the_worker(self):
        self.login()
        topic = self.add("x", ai_suggestion="old answer", ai_status="done")
        res = self.client.post(f"/api/topics/{topic.pk}/suggest/", {"question": " angle? "}, format="json")
        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json()["ai_status"], "pending")
        topic.refresh_from_db()
        self.assertEqual((topic.ai_status, topic.ai_question), ("pending", "angle?"))
        self.assertIsNotNone(topic.ai_requested_at)
        # The previous answer stays visible until the worker replaces it.
        self.assertEqual(topic.ai_suggestion, "old answer")
        self.assertEqual(self.client.get(f"/api/topics/{topic.pk}/").json()["ai_status"], "pending")


class CollectTopicsTests(TestCase):
    def fake_sources(self, **fetchers):
        return mock.patch.dict(topic_sources.SOURCES, fetchers, clear=True)

    def test_inserts_new_items_and_skips_repeats(self):
        items = [{"title": "A", "url": "https://a"}, {"title": "B", "url": None}]
        with self.fake_sources(demo=lambda limit: items):
            first = topic_sources.collect_topics()
            second = topic_sources.collect_topics()
        self.assertEqual(first["demo"], {"added": 2, "skipped": 0})
        self.assertEqual(second["demo"], {"added": 0, "skipped": 2})
        self.assertEqual(Topic.objects.count(), 2)
        self.assertEqual(Topic.objects.get(content="A").url, "https://a")

    def test_repeat_after_dedupe_window_is_saved_again(self):
        old = date.today() - timedelta(days=topic_sources.DEDUPE_DAYS + 1)
        Topic.objects.create(source="demo", content="A", url="https://a", created_date=old)
        with self.fake_sources(demo=lambda limit: [{"title": "A", "url": "https://a"}]):
            result = topic_sources.collect_topics()
        self.assertEqual(result["demo"]["added"], 1)

    def test_one_failing_source_does_not_stop_the_rest(self):
        def broken(limit):
            raise OSError("site down")

        with self.fake_sources(bad=broken, good=lambda limit: [{"title": "ok", "url": None}]):
            result = topic_sources.collect_topics()
        self.assertEqual(result["bad"], {"error": "site down"})
        self.assertEqual(result["good"]["added"], 1)


class SourceParserTests(TestCase):
    def test_reddit_atom_feed(self):
        feed = b"""<feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>Hot post</title><link href="https://reddit.com/r/x/1"/></entry>
        </feed>"""
        with mock.patch.object(topic_sources, "_get", return_value=feed):
            self.assertEqual(
                topic_sources.reddit(5), [{"title": "Hot post", "url": "https://reddit.com/r/x/1"}]
            )

    def test_googletrends_uses_first_news_link(self):
        feed = b"""<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
          <item><title>term</title><link>https://trends.google.com/generic</link>
            <ht:news_item><ht:news_item_url>https://news/1</ht:news_item_url></ht:news_item>
            <ht:news_item><ht:news_item_url>https://news/2</ht:news_item_url></ht:news_item>
          </item></channel></rss>"""
        with mock.patch.object(topic_sources, "_get", return_value=feed):
            self.assertEqual(topic_sources.googletrends(5), [{"title": "term", "url": "https://news/1"}])

    def test_baidu_skips_pinned_rows(self):
        data = {"data": {"cards": [{"content": [{"content": [
            {"isTop": True, "word": "pinned", "url": "u0"},
            {"isTop": False, "word": "hot", "url": "u1"},
        ]}]}]}}
        with mock.patch.object(topic_sources, "_get_json", return_value=data):
            self.assertEqual(topic_sources.baidu(5), [{"title": "hot", "url": "u1"}])
