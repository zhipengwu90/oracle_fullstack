"""
Live quotes and symbol search for the Stocks page, from Yahoo Finance.

Yahoo's chart and search endpoints need no API key. Symbols are Yahoo
tickers: Canadian listings carry an exchange suffix (SHOP.TO on the TSX,
.V on the TSX Venture, .NE on Cboe Canada, .CN on the CSE); US listings
have none (AAPL, VOO, BRK-B).

Nothing here touches the database - views.py decides what to store.
"""
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) wuapp-stocks/1.0"
TIMEOUT = 10  # seconds per HTTP request
CACHE_SECONDS = 15  # quotes are shared across users; don't hit Yahoo on every poll

CA_SUFFIXES = (".TO", ".V", ".NE", ".CN")
US_EXCHANGES = {"NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "BTS"}
ASSET_TYPES = {"EQUITY": "stock", "ETF": "etf"}
MARKET_NAMES = {"CA": "Canada", "US": "the US"}

SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,19}$")

_cache = {}
_cache_lock = threading.Lock()


class SymbolError(Exception):
    """A symbol that doesn't exist, isn't a stock/ETF, or is on the wrong market."""


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as exc:
        # Yahoo answers unknown symbols with a 404 whose body is still JSON.
        if exc.code == 404:
            return json.loads(exc.read())
        raise


def market_of(symbol, exchange=None):
    """'CA', 'US' or None (some other country's listing)."""
    if symbol.endswith(CA_SUFFIXES):
        return "CA"
    if "." not in symbol and (exchange is None or exchange in US_EXCHANGES):
        return "US"
    return None


def normalize(symbol):
    symbol = (symbol or "").strip().upper()
    if not SYMBOL_RE.match(symbol):
        raise SymbolError("Enter a ticker symbol like AAPL or SHOP.TO.")
    return symbol


def _fetch_quote(symbol):
    """One symbol's quote plus ~1 month of daily closes for a sparkline."""
    data = _get_json(
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(symbol)}?range=1mo&interval=1d"
    )
    result = (data.get("chart") or {}).get("result")
    if not result:
        return None
    meta = result[0]["meta"]
    closes = [
        round(c, 4)
        for c in ((result[0].get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
        if c is not None
    ]
    price = meta.get("regularMarketPrice")
    pct = meta.get("regularMarketChangePercent")
    if price is not None and pct is not None:
        change = price - price / (1 + pct / 100)
    elif price is not None and len(closes) >= 2:
        change = price - closes[-2]
        pct = change / closes[-2] * 100
    else:
        change = None
    return {
        "symbol": meta.get("symbol", symbol),
        "name": meta.get("longName") or meta.get("shortName"),
        "exchange": meta.get("exchangeName"),
        "exchange_name": meta.get("fullExchangeName"),
        "instrument_type": meta.get("instrumentType"),
        "currency": meta.get("currency"),
        "price": price,
        "change": round(change, 4) if change is not None else None,
        "change_percent": round(pct, 3) if pct is not None else None,
        "day_high": meta.get("regularMarketDayHigh"),
        "day_low": meta.get("regularMarketDayLow"),
        "year_high": meta.get("fiftyTwoWeekHigh"),
        "year_low": meta.get("fiftyTwoWeekLow"),
        "volume": meta.get("regularMarketVolume"),
        "market_time": meta.get("regularMarketTime"),
        "history": closes,
    }


def get_quote(symbol):
    """Cached quote for one symbol, or None if Yahoo doesn't know it."""
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(symbol)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1]
    quote = _fetch_quote(symbol)
    with _cache_lock:
        _cache[symbol] = (now, quote)
    return quote


def get_quotes(symbols):
    """{symbol: quote | None | {"error": ...}} fetched in parallel; one failure doesn't sink the rest."""
    def one(symbol):
        try:
            return get_quote(symbol)
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    symbols = list(dict.fromkeys(symbols))
    if not symbols:
        return {}
    with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as pool:
        return dict(zip(symbols, pool.map(one, symbols)))


def lookup(symbol, market):
    """
    Resolve what the user typed into a trackable listing on `market`.
    For Canada a bare ticker (SHOP) is tried on each Canadian exchange in
    turn (SHOP.TO, SHOP.V, ...). Returns the quote dict; raises SymbolError.
    """
    symbol = normalize(symbol)
    candidates = [symbol]
    if market == "CA" and not symbol.endswith(CA_SUFFIXES):
        candidates = [symbol + suffix for suffix in CA_SUFFIXES]

    for candidate in candidates:
        quote = get_quote(candidate)
        if not quote:
            continue
        if quote["instrument_type"] not in ASSET_TYPES:
            raise SymbolError(f"{candidate} is a {quote['instrument_type'] or 'non-stock'} - only stocks and ETFs can be tracked.")
        found = market_of(quote["symbol"], quote["exchange"])
        if found != market:
            where = MARKET_NAMES.get(found, "another market")
            raise SymbolError(f"{candidate} trades in {where}, not {MARKET_NAMES[market]}.")
        return quote
    raise SymbolError(f"No stock or ETF found for {symbol} in {MARKET_NAMES[market]}.")


def search(query, market=None, limit=10):
    """Ticker/company-name search, limited to stocks and ETFs on `market` (CA/US/None for both)."""
    data = _get_json(
        "https://query2.finance.yahoo.com/v1/finance/search?"
        + urllib.parse.urlencode({
            "q": query, "quotesCount": 20, "newsCount": 0, "listsCount": 0,
            # Without region=CA, US listings crowd Canadian ones out of the results.
            "region": market or "US", "lang": "en-CA" if market == "CA" else "en-US",
        })
    )
    results = []
    for q in data.get("quotes") or []:
        asset_type = ASSET_TYPES.get(q.get("quoteType"))
        symbol = q.get("symbol") or ""
        found = market_of(symbol, q.get("exchange"))
        if not asset_type or not found or (market and found != market):
            continue
        results.append({
            "symbol": symbol,
            "name": q.get("longname") or q.get("shortname"),
            "exchange": q.get("exchDisp") or q.get("exchange"),
            "market": found,
            "asset_type": asset_type,
        })
    return results[:limit]
