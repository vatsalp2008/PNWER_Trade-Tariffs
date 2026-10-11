"""Flags new U.S. presidential tariff actions on Canada for the team to review.

    python pipeline/watch_federal_register.py

Looks for Federal Register presidential documents mentioning Canada and tariffs or
duties. Anything not already linked in tariff-events.json and not seen before is
reported. In GitHub Actions (GITHUB_TOKEN + GITHUB_REPOSITORY set) it opens one
issue per document, labelled "tariff-watch". Seen documents are remembered in
pipeline/fr-seen.json so nothing is reported twice.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta

from common import DATA_DIR, ROOT, SESSION, log

SEEN = ROOT / "pipeline" / "fr-seen.json"
LOOKBACK_DAYS = 45


def known_documents() -> set[str]:
    events = json.loads((DATA_DIR / "tariff-events.json").read_text())["events"]
    linked = {m.group(1) for e in events if e.get("sourceUrl") for m in [re.search(r"/(\d{4}-\d{5})(?:/|$)", e["sourceUrl"])] if m}
    seen = set(json.loads(SEEN.read_text())["documents"]) if SEEN.exists() else set()
    return linked | seen


def recent_documents() -> list[dict]:
    params = {
        "per_page": 50,
        "order": "newest",
        "conditions[type][]": "PRESDOCU",
        "conditions[term]": "Canada (tariff | tariffs | duties | importation)",
        "conditions[publication_date][gte]": (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat(),
        "fields[]": ["document_number", "title", "publication_date", "html_url", "signing_date"],
    }
    r = SESSION.get("https://www.federalregister.gov/api/v1/documents.json", params=params, timeout=60)
    r.raise_for_status()
    docs = r.json().get("results", [])
    return [d for d in docs if re.search(r"canad", d["title"], re.I)]


def open_issue(doc: dict) -> None:
    repo, token = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"]
    body = (
        f"A new presidential document about Canada and tariffs was published in the Federal Register.\n\n"
        f"- **Title:** {doc['title']}\n"
        f"- **Published:** {doc['publication_date']} (signed {doc.get('signing_date') or 'n/a'})\n"
        f"- **Link:** {doc['html_url']}\n\n"
        "**To do:** read it and, if it changes tariffs on Canadian goods, add an event to "
        "`prototype/src/data/tariff-events.json` (date it takes effect, rate, covered businesses, "
        "USMCA exemption, `sourceUrl`). Set `verified: true` once checked. Close this issue if it "
        "doesn't affect the timeline.\n\n_Opened automatically by the daily refresh job._"
    )
    api = f"https://api.github.com/repos/{repo}/issues"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    r = SESSION.post(api, headers=headers, json={"title": f"Tariff watch: {doc['title'][:180]} ({doc['document_number']})", "body": body, "labels": ["tariff-watch"]}, timeout=60)
    r.raise_for_status()
    log(f"  opened issue #{r.json()['number']}")


def main() -> None:
    known = known_documents()
    new = [d for d in recent_documents() if d["document_number"] not in known]
    if not new:
        log("Federal Register: no new tariff actions on Canada.")
        return
    in_ci = bool(os.environ.get("GITHUB_TOKEN") and os.environ.get("GITHUB_REPOSITORY"))
    for d in new:
        log(f"New: {d['publication_date']} {d['document_number']} {d['title']}")
        if in_ci:
            open_issue(d)
    if in_ci:  # only remember documents once an issue exists for them
        seen = set(json.loads(SEEN.read_text())["documents"]) if SEEN.exists() else set()
        seen |= {d["document_number"] for d in new}
        SEEN.write_text(json.dumps({"documents": sorted(seen)}, indent=1) + "\n")


if __name__ == "__main__":
    main()
