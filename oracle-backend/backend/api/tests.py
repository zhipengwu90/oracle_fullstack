import urllib.error
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import stock_quotes, topic_sources
from .models import Topic, TrackedStock


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


def fake_quote(symbol, exchange, instrument_type="EQUITY", name=None):
    return {
        "symbol": symbol, "name": name or symbol, "exchange": exchange, "exchange_name": exchange,
        "instrument_type": instrument_type, "currency": "CAD" if "." in symbol else "USD",
        "price": 10.0, "change": 0.5, "change_percent": 5.263, "day_high": 10.2, "day_low": 9.6,
        "year_high": 12.0, "year_low": 8.0, "volume": 1000, "market_time": 0, "history": [9.5, 10.0],
    }


class StockApiTests(LoggedInTestCase):
    # Yahoo is faked: symbol -> quote, anything else is unknown.
    QUOTES = {
        "SHOP.TO": fake_quote("SHOP.TO", "TOR", name="Shopify Inc."),
        "XIC.TO": fake_quote("XIC.TO", "TOR", "ETF"),
        "AAPL": fake_quote("AAPL", "NMS"),
        "VOO": fake_quote("VOO", "PCX", "ETF"),
        "BTC-USD": fake_quote("BTC-USD", "CCC", "CRYPTOCURRENCY"),
    }

    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(stock_quotes, "get_quote", side_effect=self.QUOTES.get)
        patcher.start()
        self.addCleanup(patcher.stop)

    def add(self, symbol, market):
        return self.client.post("/api/stocks/", {"symbol": symbol, "market": market}, format="json")

    def test_anonymous_cannot_read_or_write(self):
        self.assertEqual(self.client.get("/api/stocks/").status_code, 403)
        self.assertEqual(self.add("AAPL", "US").status_code, 403)
        self.assertEqual(self.client.get("/api/stocks/search/?q=apple").status_code, 403)

    def test_add_list_and_remove(self):
        self.login()
        res = self.add("aapl", "US")
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.json()["symbol"], res.json()["asset_type"]), ("AAPL", "stock"))
        self.assertEqual(self.add("VOO", "US").json()["asset_type"], "etf")

        rows = self.client.get("/api/stocks/").json()
        self.assertEqual([r["symbol"] for r in rows], ["AAPL", "VOO"])
        self.assertEqual(rows[0]["quote"]["price"], 10.0)

        self.assertEqual(self.client.delete(f"/api/stocks/{rows[0]['id']}/").status_code, 204)
        self.assertEqual(list(TrackedStock.objects.values_list("symbol", flat=True)), ["VOO"])

    def test_canadian_bare_ticker_resolves_to_exchange_listing(self):
        self.login()
        res = self.add("SHOP", "CA")
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.json()["symbol"], res.json()["name"]), ("SHOP.TO", "Shopify Inc."))
        self.assertEqual(self.add("XIC", "CA").json()["asset_type"], "etf")

    def test_rejects_unknown_wrong_market_duplicates_and_non_stocks(self):
        self.login()
        self.assertIn("No stock or ETF", self.add("ZZZZ", "US").json()["error"])
        self.assertIn("trades in Canada", self.add("SHOP.TO", "US").json()["error"])
        self.assertIn("only stocks and ETFs", self.add("BTC-USD", "US").json()["error"])
        self.assertEqual(self.add("AAPL", "EU").status_code, 400)
        self.assertEqual(self.add("AAPL", "US").status_code, 201)
        self.assertIn("already tracking", self.add("AAPL", "US").json()["error"])
        self.assertEqual(TrackedStock.objects.count(), 1)

    def test_new_symbols_go_last_and_order_can_be_saved(self):
        self.login()
        ids = [self.add(sym, mkt).json()["id"] for sym, mkt in [("AAPL", "US"), ("SHOP", "CA"), ("VOO", "US")]]
        symbols = lambda: [r["symbol"] for r in self.client.get("/api/stocks/").json()]
        self.assertEqual(symbols(), ["AAPL", "SHOP.TO", "VOO"])

        res = self.client.post("/api/stocks/order/", {"ids": [ids[2], ids[0], ids[1]]}, format="json")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(symbols(), ["VOO", "AAPL", "SHOP.TO"])
        # Added after a reorder -> still goes to the bottom.
        self.add("XIC", "CA")
        self.assertEqual(symbols(), ["VOO", "AAPL", "SHOP.TO", "XIC.TO"])

    def test_order_ignores_other_users_rows_and_rejects_junk(self):
        other = User.objects.create_user("other", password="pw")
        theirs = TrackedStock.objects.create(user=other, symbol="AAPL", market="US", asset_type="stock", position=7)
        self.assertEqual(self.client.post("/api/stocks/order/", {"ids": []}, format="json").status_code, 403)
        self.login()
        mine = self.add("VOO", "US").json()["id"]
        self.assertEqual(self.client.post("/api/stocks/order/", {"ids": [theirs.pk, mine]}, format="json").status_code, 204)
        theirs.refresh_from_db()
        self.assertEqual(theirs.position, 7)
        for junk in ({"ids": "1,2"}, {"ids": [1, "2"]}, {"ids": [True]}, {}):
            self.assertEqual(self.client.post("/api/stocks/order/", junk, format="json").status_code, 400)

    def test_users_only_see_and_delete_their_own(self):
        other = User.objects.create_user("other", password="pw")
        theirs = TrackedStock.objects.create(user=other, symbol="AAPL", market="US", asset_type="stock")
        self.login()
        self.assertEqual(self.client.get("/api/stocks/").json(), [])
        self.assertEqual(self.client.delete(f"/api/stocks/{theirs.pk}/").status_code, 404)
        # Same symbol is fine for a different user.
        self.assertEqual(self.add("AAPL", "US").status_code, 201)

    def test_search_keeps_stocks_and_etfs_on_the_chosen_market(self):
        self.login()
        yahoo = {"quotes": [
            {"symbol": "SHOP", "quoteType": "EQUITY", "exchange": "NMS", "longname": "Shopify Inc."},
            {"symbol": "SHOP.TO", "quoteType": "EQUITY", "exchange": "TOR", "exchDisp": "Toronto"},
            {"symbol": "SHPE.TO", "quoteType": "ETF", "exchange": "TOR"},
            {"symbol": "SHOP.MX", "quoteType": "EQUITY", "exchange": "MEX"},
            {"symbol": "SHOP260116C00100000", "quoteType": "OPTION", "exchange": "OPR"},
        ]}
        with mock.patch.object(stock_quotes, "_get_json", return_value=yahoo):
            ca = self.client.get("/api/stocks/search/?q=shop&market=CA").json()
            both = self.client.get("/api/stocks/search/?q=shop").json()
        self.assertEqual([(r["symbol"], r["asset_type"]) for r in ca], [("SHOP.TO", "stock"), ("SHPE.TO", "etf")])
        self.assertEqual([r["symbol"] for r in both], ["SHOP", "SHOP.TO", "SHPE.TO"])


class QuoteSourceTests(TestCase):
    """Yahoo is the base quote; Finnhub's real-time fields go on top for US symbols."""

    def yahoo(self, symbol, exchange):
        return {"chart": {"result": [{
            "meta": {"symbol": symbol, "exchangeName": exchange, "instrumentType": "EQUITY", "currency": "USD",
                     "longName": "Apple Inc.", "regularMarketPrice": 100.0, "regularMarketChangePercent": 1.0,
                     "regularMarketTime": 1000, "fiftyTwoWeekHigh": 150.0, "fiftyTwoWeekLow": 80.0},
            "indicators": {"quote": [{"close": [98.0, 99.0, 100.0]}]},
        }]}}

    def fetch(self, symbol, exchange, finnhub):
        def fake(url, headers=None):
            if "finnhub.io" in url:
                self.finnhub_headers = headers
                if isinstance(finnhub, Exception):
                    raise finnhub
                return finnhub
            return self.yahoo(symbol, exchange)

        stock_quotes._finnhub_paused_until = 0.0
        with mock.patch.object(stock_quotes, "_get_json", side_effect=fake):
            return stock_quotes._fetch_quote(symbol)

    LIVE = {"c": 101.5, "d": 2.5, "dp": 2.5253, "h": 102.0, "l": 99.0, "o": 99.5, "pc": 99.0, "t": 2000}

    @override_settings(FINNHUB_API_KEY="k")
    def test_us_symbol_gets_finnhub_live_fields(self):
        q = self.fetch("AAPL", "NMS", self.LIVE)
        self.assertEqual((q["price"], q["change"], q["market_time"], q["source"]), (101.5, 2.5, 2000, "finnhub"))
        # Yahoo still supplies what Finnhub's quote doesn't have.
        self.assertEqual((q["name"], q["year_high"], q["history"]), ("Apple Inc.", 150.0, [98.0, 99.0, 100.0]))
        self.assertEqual(self.finnhub_headers, {"X-Finnhub-Token": "k"})

    @override_settings(FINNHUB_API_KEY="k")
    def test_canadian_symbol_stays_on_yahoo(self):
        q = self.fetch("SHOP.TO", "TOR", self.LIVE)
        self.assertEqual((q["price"], q["source"]), (100.0, "yahoo"))

    @override_settings(FINNHUB_API_KEY="")
    def test_no_key_means_yahoo_only(self):
        self.assertEqual(self.fetch("AAPL", "NMS", self.LIVE)["source"], "yahoo")

    @override_settings(FINNHUB_API_KEY="k")
    def test_finnhub_failures_fall_back_to_yahoo(self):
        unknown = {"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0, "t": 0}
        self.assertEqual(self.fetch("AAPL", "NMS", unknown)["source"], "yahoo")
        self.assertEqual(self.fetch("AAPL", "NMS", OSError("down"))["source"], "yahoo")

    @override_settings(FINNHUB_API_KEY="k")
    def test_rate_limit_pauses_finnhub(self):
        limited = urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None)
        self.assertEqual(self.fetch("AAPL", "NMS", limited)["source"], "yahoo")
        # Still paused, so Finnhub isn't even asked (its good answer goes unused).
        with mock.patch.object(stock_quotes, "_get_json", side_effect=lambda url, headers=None: (
            self.fail("Finnhub called while paused") if "finnhub.io" in url else self.yahoo("AAPL", "NMS")
        )):
            self.assertEqual(stock_quotes._fetch_quote("AAPL")["source"], "yahoo")
        stock_quotes._finnhub_paused_until = 0.0


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
