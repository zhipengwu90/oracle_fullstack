import json
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from . import ai, topic_sources
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
    def test_anonymous_cannot_read_or_act(self):
        topic = Topic.objects.create(source="hackernews", content="x", created_date=date.today())
        self.assertEqual(self.client.get("/api/topics/").status_code, 403)
        self.assertEqual(self.client.post("/api/topics/collect/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/topics/{topic.pk}/suggest/").status_code, 403)

    def test_list_newest_first_with_url(self):
        self.login()
        Topic.objects.create(source="a", content="old", created_date=date.today() - timedelta(days=1))
        Topic.objects.create(source="b", content="new", url="https://x.test", created_date=date.today())
        rows = self.client.get("/api/topics/").json()
        self.assertEqual([r["content"] for r in rows], ["new", "old"])
        self.assertEqual(rows[0]["url"], "https://x.test")

    def test_delete_topic(self):
        self.login()
        topic = Topic.objects.create(source="a", content="junk", created_date=date.today())
        self.assertEqual(self.client.delete(f"/api/topics/{topic.pk}/").status_code, 204)
        self.assertFalse(Topic.objects.exists())

    def test_suggest_without_api_key_explains_instead_of_crashing(self):
        self.login()
        topic = Topic.objects.create(source="a", content="x", created_date=date.today())
        with mock.patch.dict("os.environ", {}, clear=True):
            res = self.client.post(f"/api/topics/{topic.pk}/suggest/")
        self.assertEqual(res.status_code, 503)
        self.assertIn("ANTHROPIC_API_KEY", res.json()["error"])

    def test_suggest_saves_answer(self):
        self.login()
        topic = Topic.objects.create(source="a", content="x", created_date=date.today())
        with mock.patch("api.views.suggest_for_topic", return_value="Write a post") as suggest:
            res = self.client.post(
                f"/api/topics/{topic.pk}/suggest/", {"question": "angle?"}, format="json"
            )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["ai_suggestion"], "Write a post")
        self.assertEqual(suggest.call_args.args[1], "angle?")
        topic.refresh_from_db()
        self.assertEqual(topic.ai_suggestion, "Write a post")

    def test_suggest_refusal_leaves_topic_unchanged(self):
        self.login()
        topic = Topic.objects.create(source="a", content="x", created_date=date.today())
        with mock.patch("api.views.suggest_for_topic", side_effect=ai.AIRefused("no")):
            res = self.client.post(f"/api/topics/{topic.pk}/suggest/")
        self.assertEqual(res.status_code, 422)
        topic.refresh_from_db()
        self.assertIsNone(topic.ai_suggestion)


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


def fake_response(stop_reason, *texts):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=t) for t in texts],
    )


@mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
class SuggestForTopicTests(TestCase):
    def setUp(self):
        self.topic = Topic(source="hackernews", content="New DB release", url="https://db.test")

    def patch_create(self, *responses):
        client = mock.patch("api.ai.anthropic.Anthropic").start()
        self.addCleanup(mock.patch.stopall)
        create = client.return_value.beta.messages.create
        create.side_effect = list(responses)
        return create

    def test_returns_text_and_sends_topic_and_question(self):
        create = self.patch_create(fake_response("end_turn", "Idea 1. ", "Idea 2."))
        self.assertEqual(ai.suggest_for_topic(self.topic, "for beginners?"), "Idea 1. Idea 2.")
        prompt = create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("New DB release", prompt)
        self.assertIn("https://db.test", prompt)
        self.assertIn("for beginners?", prompt)

    def test_resumes_after_pause_turn(self):
        paused = fake_response("pause_turn", "")
        create = self.patch_create(paused, fake_response("end_turn", "Done"))
        self.assertEqual(ai.suggest_for_topic(self.topic), "Done")
        resumed_messages = create.call_args.kwargs["messages"]
        self.assertEqual(resumed_messages[1], {"role": "assistant", "content": paused.content})

    def test_refusal_raises(self):
        self.patch_create(fake_response("refusal"))
        with self.assertRaises(ai.AIRefused):
            ai.suggest_for_topic(self.topic)
