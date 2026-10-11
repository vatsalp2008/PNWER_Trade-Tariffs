"""Builds prototype/src/data/news.json: recent official and PNWER updates on
U.S.–Canada trade and tariffs, plus links the team adds by hand.

    python pipeline/fetch_news.py

Sources (all free; headlines + links only):
  - Federal Register API (presidential documents and USTR notices mentioning Canada)
  - USTR press releases RSS
  - Government of Canada news API (Finance; Global Affairs)
  - CBP trade messages (CSMS), strictly filtered
  - PNWER blog feed, and pnwer-engagement.json (hand-kept)
  - news-curated.json: media articles the team adds by pull request ("Team pick")
"""

from __future__ import annotations

import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime

from common import DATA_DIR, SESSION, log

KEEP_DAYS = 120
TODAY = date.today()

TRADE = re.compile(
    r"tariff|duties|duty\b|countermeasure|counter-tariff|surtax|usmca|cusma|section 23[2]|section 301|section 122|section 338|"
    r"ieepa|anti-?dumping|countervailing|softwood|trade agreement|joint review|import ban|retaliat",
    re.I,
)
CANADA = re.compile(r"canad|cusma|usmca|cross-border|north american", re.I)
MEXICO_ONLY = re.compile(r"mexic", re.I)

JURISDICTIONS = {
    "WA": r"washington state|\bseattle\b|spokane|tacoma|bellingham|\bblaine\b",
    "OR": r"\boregon\b",
    "ID": r"\bidaho\b|\bboise\b",
    "MT": r"\bmontana\b",
    "AK": r"\balaska\b|juneau|anchorage",
    "BC": r"british columbia|\bb\.c\.|\bbc\b(?= (?:lumber|forest|premier|government))",
    "AB": r"\balberta\b|calgary|edmonton",
    "SK": r"saskatchewan|\bregina\b|saskatoon",
    "YT": r"\byukon\b|whitehorse",
    "NT": r"northwest territories|\bn\.w\.t\.|yellowknife",
}
SECTORS = {
    "ag": r"dairy|cheese|milk|whey|canola|wheat|grain|cattle|beef|pork|seafood|salmon|fish|agricultur|farm|food|alcohol|wine|beer|spirits|sugar|potato",
    "energy": r"\benergy\b|\boil\b|crude|natural gas|\bgas\b|pipeline|electricity|\bpower\b|uranium",
    "mfg": r"automobile|motor vehicle|\bautos?\b|vehicle|aerospace|aircraft|machinery|manufactur|semiconductor|electronic|truck",
    "forest": r"lumber|softwood|timber|wood|forest|pulp|paper|furniture|cabinet",
    "metals": r"steel|alumin|copper|critical mineral|metal|zinc|nickel|mining",
    "chem": r"potash|fertili|chemical|plastic|pharmac",
}


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def tag(text: str) -> tuple[list[str], list[str]]:
    js = [j for j, pat in JURISDICTIONS.items() if re.search(pat, text, re.I)]
    ss = [s for s, pat in SECTORS.items() if re.search(pat, text, re.I)]
    return js, ss


def item(title: str, url: str, when: date, source: str, kind: str, text: str = "") -> dict:
    title = re.sub(r"\s+", " ", title).strip()
    js, ss = tag(f"{title} {text}")
    return {
        "id": hashlib.sha1(url.encode()).hexdigest()[:12],
        "title": title,
        "url": url,
        "date": when.isoformat(),
        "source": source,
        "kind": kind,
        "jurisdictions": js,
        "sectors": ss,
    }


def relevant(title: str, text: str = "", *, strict: bool = False) -> bool:
    blob = f"{title} {text}"
    if not (TRADE.search(blob) and CANADA.search(blob)):
        return False
    if MEXICO_ONLY.search(title) and not re.search(r"canad|cusma|usmca", title, re.I):
        return False
    if strict and not re.search(r"canad|cusma|usmca", blob, re.I):
        return False
    return True


def _get(url: str, **params):
    r = SESSION.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r


def federal_register() -> list[dict]:
    out = []
    base = "https://www.federalregister.gov/api/v1/documents.json"
    common = {"order": "newest", "per_page": 50, "fields[]": ["title", "publication_date", "html_url", "abstract", "type"]}
    queries = [
        {"conditions[term]": "Canada (tariff | tariffs | duties)", "conditions[type][]": "PRESDOCU"},
        {"conditions[term]": "Canada", "conditions[agencies][]": "trade-representative-office-of-united-states"},
    ]
    for q in queries:
        data = _get(base, **common, **q).json()
        for d in data.get("results", []):
            title, abstract = d.get("title", ""), d.get("abstract") or ""
            if "canad" not in f"{title} {abstract}".lower():
                continue  # full-text search is noisy; require Canada in title or summary
            out.append(item(title, d["html_url"], date.fromisoformat(d["publication_date"]), "Federal Register", "official", abstract))
    return out


def _rss(url: str, source: str, kind: str, *, strict: bool = False, keep_all: bool = False) -> list[dict]:
    root = ET.fromstring(_get(url).content)
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        desc = re.sub("<[^>]+>", " ", it.findtext("description") or "")
        try:
            when = parsedate_to_datetime(it.findtext("pubDate") or "").date()
        except (TypeError, ValueError):
            continue
        if title and link and (keep_all or relevant(title, desc, strict=strict)):
            out.append(item(title, link, when, source, kind, desc))
    return out


def gc_news(dept: str, source: str) -> list[dict]:
    """Government of Canada news API (Atom)."""
    url = "https://api.io.canada.ca/io-server/gc/news/en/v2"
    root = ET.fromstring(_get(url, dept=dept, sort="publishedDate", orderBy="desc", pick=50, format="atom").content)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for e in root.findall("a:entry", ns):
        title = (e.findtext("a:title", default="", namespaces=ns) or "").strip()
        link_el = e.find("a:link", ns)
        link = link_el.get("href") if link_el is not None else ""
        summary = re.sub("<[^>]+>", " ", e.findtext("a:summary", default="", namespaces=ns) or "")
        stamp = e.findtext("a:published", default="", namespaces=ns) or e.findtext("a:updated", default="", namespaces=ns)
        try:
            when = datetime.fromisoformat(stamp.replace("Z", "+00:00")).date()
        except ValueError:
            continue
        if title and link and relevant(title, summary):
            out.append(item(title, link, when, source, "official", summary))
    return out


def hand_kept(name: str, kind: str) -> list[dict]:
    path = DATA_DIR / name
    if not path.exists():
        return []
    entries = json.loads(path.read_text()).get("items", [])
    out = []
    for e in entries:
        it = item(e["title"], e["url"], date.fromisoformat(e["date"]), e["source"], kind)
        it["jurisdictions"] = e.get("jurisdictions") or it["jurisdictions"]
        it["sectors"] = e.get("sectors") or it["sectors"]
        out.append(it)
    return out


def main() -> None:
    fetchers = {
        "Federal Register": federal_register,
        "USTR": lambda: _rss("https://ustr.gov/rss.xml", "USTR", "official"),
        "Finance Canada": lambda: gc_news("departmentfinance", "Finance Canada"),
        "Global Affairs Canada": lambda: gc_news("departmentofforeignaffairstradeanddevelopment", "Global Affairs Canada"),
        "CBP": lambda: _rss("https://public.govdelivery.com/topics/USDHSCBP_3/feed.rss", "U.S. Customs and Border Protection", "official", strict=True),
        "PNWER blog": lambda: _rss("https://www.pnwer.org/blog/feed", "PNWER", "pnwer"),
    }
    items: list[dict] = []
    status = {}
    for name, fn in fetchers.items():
        try:
            got = fn()
            items += got
            status[name] = len(got)
        except Exception as e:  # one broken feed must not break the others
            status[name] = f"failed: {e.__class__.__name__}"
    items += hand_kept("pnwer-engagement.json", "pnwer")
    items += hand_kept("news-curated.json", "media")

    cutoff = TODAY - timedelta(days=KEEP_DAYS)
    seen_url, seen_title, kept = set(), set(), []
    for it in sorted(items, key=lambda x: x["date"], reverse=True):
        if date.fromisoformat(it["date"]) < cutoff and it["kind"] != "pnwer":
            continue
        key = _norm(it["title"])
        if it["url"] in seen_url or key in seen_title:
            continue
        seen_url.add(it["url"])
        seen_title.add(key)
        kept.append(it)

    path = DATA_DIR / "news.json"
    old = json.loads(path.read_text())["items"] if path.exists() else None
    if old == kept:
        log(f"News unchanged ({len(kept)} items).")
        return
    path.write_text(json.dumps({"updated": TODAY.isoformat(), "items": kept}, indent=1, ensure_ascii=False))
    log(f"Wrote news.json: {len(kept)} items. Per source: {status}")


if __name__ == "__main__":
    main()
