"""
Fetchers for "what's hot right now" on public social/news sites.

Every source here works without an API key or login. Sites that need a
paid API or a logged-in session (X/Twitter, YouTube, TikTok, Instagram,
Weibo, Zhihu) are deliberately left out - they either reject this
server's requests or require credentials we don't have.

Each fetcher takes a limit and returns a list of {"title": ..., "url": ...}
dicts. They only read; saving to the database is collect_topics()'s job.
"""
import json
import logging
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) wuapp-topics/1.0"
TIMEOUT = 15  # seconds per HTTP request


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.read()


def _get_json(url):
    return json.loads(_get(url))


def hackernews(limit):
    ids = _get_json("https://hacker-news.firebaseio.com/v0/topstories.json")[:limit]
    items = []
    for item_id in ids:
        item = _get_json(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json")
        if item and item.get("title"):
            items.append({
                "title": item["title"],
                # Ask HN / Show HN posts have no external url - link the thread.
                "url": item.get("url") or f"https://news.ycombinator.com/item?id={item_id}",
            })
    return items


def reddit(limit):
    # The JSON API 403s from cloud IPs; the Atom feed still works.
    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(_get(f"https://www.reddit.com/r/popular/top/.rss?t=day&limit={limit}"))
    items = []
    for entry in root.findall("a:entry", ns)[:limit]:
        link = entry.find("a:link", ns)
        items.append({
            "title": entry.findtext("a:title", default="", namespaces=ns),
            "url": link.get("href") if link is not None else None,
        })
    return items


def googletrends(limit, geo="US"):
    ns = {"ht": "https://trends.google.com/trending/rss"}
    root = ET.fromstring(_get(f"https://trends.google.com/trending/rss?geo={geo}"))
    items = []
    for item in root.iter("item"):
        # The item's own <link> is the generic feed URL, so point at the
        # first news story about the search term instead.
        items.append({
            "title": item.findtext("title", default=""),
            "url": item.findtext("ht:news_item/ht:news_item_url", namespaces=ns),
        })
        if len(items) >= limit:
            break
    return items


def bluesky(limit):
    data = _get_json(
        f"https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit={limit}"
    )
    return [
        {
            "title": t.get("displayName") or t["topic"],
            "url": f"https://bsky.app{t['link']}" if t.get("link") else None,
        }
        for t in data.get("topics", [])[:limit]
    ]


def mastodon(limit):
    links = _get_json(f"https://mastodon.social/api/v1/trends/links?limit={limit}")
    return [{"title": link["title"], "url": link["url"]} for link in links[:limit]]


def github(limit):
    # GitHub has no "trending" API; repos created this week sorted by stars
    # is the closest public equivalent.
    since = (date.today() - timedelta(days=7)).isoformat()
    data = _get_json(
        "https://api.github.com/search/repositories"
        f"?q=created:>{since}&sort=stars&order=desc&per_page={limit}"
    )
    items = []
    for repo in data.get("items", [])[:limit]:
        title = repo["full_name"]
        if repo.get("description"):
            title += f" - {repo['description']}"
        items.append({"title": title, "url": repo["html_url"]})
    return items


def devto(limit):
    articles = _get_json(f"https://dev.to/api/articles?top=1&per_page={limit}")
    return [{"title": a["title"], "url": a["url"]} for a in articles[:limit]]


def lobsters(limit):
    stories = _get_json("https://lobste.rs/hottest.json")
    return [
        {"title": s["title"], "url": s.get("url") or s["comments_url"]}
        for s in stories[:limit]
    ]


SOURCES = {
    "hackernews": hackernews,
    "reddit": reddit,
    "googletrends": googletrends,
    "bluesky": bluesky,
    "mastodon": mastodon,
    "github": github,
    "devto": devto,
    "lobsters": lobsters,
}

# Skip an item if the same source already saved it within this many days,
# so a story that stays hot all week isn't stored seven times.
DEDUPE_DAYS = 7


def collect_topics(sources=None, limit=10):
    """
    Fetch each source and insert new items into the topics table.

    One failing site never stops the others. Returns
    {source: {"added": n, "skipped": n} or {"error": "..."}}.
    """
    from .models import Topic

    today = date.today()
    since = today - timedelta(days=DEDUPE_DAYS)
    results = {}
    for name in sources or SOURCES:
        try:
            items = SOURCES[name](limit)
        except Exception as exc:  # noqa: BLE001 - network/parse errors vary by site
            logger.warning("collect_topics: %s failed: %s", name, exc)
            results[name] = {"error": str(exc)}
            continue

        recent = Topic.objects.filter(source=name, created_date__gte=since)
        seen_urls = set(recent.exclude(url=None).values_list("url", flat=True))
        seen_titles = set(recent.values_list("content", flat=True))
        new = []
        for item in items:
            title = (item.get("title") or "").strip()
            url = item.get("url") or None
            if not title or url in seen_urls or title in seen_titles:
                continue
            seen_titles.add(title)
            if url:
                seen_urls.add(url)
            new.append(Topic(source=name, content=title, url=url, created_date=today))
        Topic.objects.bulk_create(new)
        results[name] = {"added": len(new), "skipped": len(items) - len(new)}
    return results
