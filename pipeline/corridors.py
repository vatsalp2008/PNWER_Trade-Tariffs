"""Cross-border corridors: province/territory <-> U.S. state trade by HS section, monthly since 1990.

Built on the team's cleaning of Statistics Canada table 12-10-0099-01 (docs/notebooks/statcan_12100099.ipynb),
but fetched series by series through the Statistics Canada data API instead of the 15-million-row table.

Sources (free, no key):
- Statistics Canada 12-10-0099-01: merchandise imports and exports by HS section, province x U.S. state.
- Statistics Canada 12-10-0175-01: provinces' domestic exports to all countries (for "where exports go").
- Exchange rates: Bank of Canada monthly averages from real.json (2017 on, the dashboard's rates);
  U.S. Federal Reserve H.10 monthly averages (FRED series EXCAUS) for 1990-2016.

Writes prototype/public/data/corridors/{latest.json, versions/<id>/index.json, versions/<id>/pairs/<P>-<S>.json},
only when every check passes. Values stay in thousands of Canadian dollars (as published); the site converts
to US$ with the stored monthly rates.

    python pipeline/corridors.py              # refresh the last 24 months (revisions) on top of the published history
    python pipeline/corridors.py --full       # download all months since 1990 again, series by series
    python pipeline/corridors.py --from-zip   # build the full history from the bulk table files instead (186 MB once;
                                              # useful when the data API is down, e.g. during its overnight maintenance)
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import shutil
import sys
import time

import requests

import pandas as pd

from common import CACHE_DIR, DATA_DIR, ROOT, log, statcan_points
from provincial_trade import atomic_write, digest, dumps

OUT_DIR = ROOT / "prototype" / "public" / "data" / "corridors"
PID, WORLD_PID = 12100099, 12100175
FIRST = "1990-01"

# Statistics Canada member ids (12-10-0099 metadata). Names are never used to filter: "Washington, State" etc.
PROVINCES = {"BC": (11, "British Columbia"), "AB": (10, "Alberta"), "SK": (9, "Saskatchewan"), "YT": (12, "Yukon"), "NT": (14, "Northwest Territories")}
STATES = {"WA": (49, "Washington"), "OR": (39, "Oregon"), "ID": (15, "Idaho"), "MT": (28, "Montana"), "AK": (2, "Alaska")}
ALL_US, CANADA = 1, 1
FLOWS = {"exp": 2, "imp": 4}  # province's domestic exports to / total imports from the state
SECTIONS = {
    "total": "All goods", "I": "Live animals & animal products", "II": "Vegetable products", "III": "Animal & vegetable fats and oils",
    "IV": "Prepared foods, beverages & tobacco", "V": "Mineral products (incl. energy)", "VI": "Chemicals", "VII": "Plastics & rubber",
    "VIII": "Hides, leather & travel goods", "IX": "Wood & wood products", "X": "Pulp & paper", "XI": "Textiles & clothing",
    "XII": "Footwear & headgear", "XIII": "Stone, ceramic & glass", "XIV": "Precious metals & stones", "XV": "Base metals (steel, aluminum…)",
    "XVI": "Machinery & electrical equipment", "XVII": "Vehicles, aircraft & vessels", "XVIII": "Instruments & medical devices",
    "XIX": "Arms & ammunition", "XX": "Miscellaneous manufactured goods", "XXI": "Works of art & antiques",
}
SECTION_IDS = {code: i + 1 for i, code in enumerate(SECTIONS)}  # member 1 = total, 2 = I, ... 22 = XXI
SOURCES = [
    "Adapted from Statistics Canada, table 12-10-0099-01 (merchandise imports and exports by HS section, provinces and U.S. states) and table 12-10-0175-01. This does not constitute an endorsement by Statistics Canada of this product.",
    "Exchange rates: Bank of Canada monthly averages (2017 on); U.S. Federal Reserve H.10 monthly averages via FRED series EXCAUS (1990-2016).",
    "Builds on the project team's cleaning of table 12-10-0099 (docs/notebooks/statcan_12100099.ipynb).",
]


def coord(*ids: int) -> str:
    return ".".join(str(i) for i in ids) + ".0" * (10 - len(ids))


def months_between(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[5:])
    out = []
    while f"{y}-{m:02d}" <= last:
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


# ---------- fetch ----------

def series_specs() -> dict[str, tuple[int, str]]:
    """{key: (product id, coordinate)}. Keys: P|S|flow|section, P|US|exp|total, CA|S|flow|total, P|WORLD|exp|total."""
    specs: dict[str, tuple[int, str]] = {}
    for p, (g, _) in PROVINCES.items():
        for s, (st, _) in STATES.items():
            for f, t in FLOWS.items():
                for sec, h in SECTION_IDS.items():
                    specs[f"{p}|{s}|{f}|{sec}"] = (PID, coord(g, t, st, h))
        specs[f"{p}|US|exp|total"] = (PID, coord(g, FLOWS["exp"], ALL_US, 1))
        specs[f"{p}|WORLD|exp|total"] = (WORLD_PID, coord(g, 2, 1, 1))  # 12-10-0175: domestic export, all merchandise, all countries
    for s, (st, _) in STATES.items():  # Canada as a whole, for the mirror check against U.S. records
        for f, t in FLOWS.items():
            specs[f"CA|{s}|{f}|total"] = (PID, coord(CANADA, t, st, 1))
    return specs


def fetch(latest_n: int) -> tuple[dict[str, dict[str, float | None]], list[str]]:
    """{key: {YYYY-MM: thousands of C$ or None}} plus a list of unit problems."""
    specs = series_specs()
    out: dict[str, dict[str, float | None]] = {}
    units: list[str] = []
    for pid in (PID, WORLD_PID):
        keys = {c: k for k, (p, c) in specs.items() if p == pid}
        pts = statcan_points(pid, list(keys), latest_n, raw=True)
        for c, k in keys.items():
            by: dict[str, float | None] = {}
            for pt in pts.get(c, []):
                by[pt["refPer"][:7]] = pt["value"]
                if pt["value"] is not None and pt.get("scalarFactorCode") != 3:
                    units.append(f"{k} {pt['refPer'][:7]} scalar {pt.get('scalarFactorCode')}")
            out[k] = by
    return out, units


def fetch_from_tables() -> tuple[dict[str, dict[str, float | None]], list[str]]:
    """Same result as fetch(), from Statistics Canada's bulk CSV files, matched by coordinate (never by name)."""
    specs = series_specs()
    def short(c: str) -> str:  # the bulk files write "11.2.49.1", the API "11.2.49.1.0.0.0.0.0.0"
        while c.endswith(".0"):
            c = c[:-2]
        return c

    wanted = {(pid, short(c)): k for k, (pid, c) in specs.items()}
    out: dict[str, dict[str, float | None]] = {k: {} for k in specs}
    units: list[str] = []
    for pid in (PID, WORLD_PID):
        path = CACHE_DIR / "corridors" / f"{pid}-eng.zip"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with requests.get(f"https://www150.statcan.gc.ca/n1/tbl/csv/{pid}-eng.zip", stream=True, timeout=600) as r:
                r.raise_for_status()
                with open(path, "wb") as fh:
                    for chunk in r.iter_content(1 << 20):
                        fh.write(chunk)
        import zipfile

        with zipfile.ZipFile(path) as zf:
            name = next(n for n in zf.namelist() if n.endswith(".csv") and "MetaData" not in n)
            for chunk in pd.read_csv(zf.open(name), usecols=["REF_DATE", "SCALAR_FACTOR", "VALUE", "COORDINATE"], dtype=str, chunksize=500_000):
                chunk = chunk[chunk["COORDINATE"].map(lambda c: (pid, c) in wanted)]
                # usecols keeps the file's column order, so name the order explicitly.
                for date, scale, value, c in chunk[["REF_DATE", "SCALAR_FACTOR", "VALUE", "COORDINATE"]].itertuples(index=False):
                    key = wanted[(pid, c)]
                    v = float(value) if isinstance(value, str) and value.strip() else None
                    out[key][date[:7]] = v
                    if v is not None and str(scale).strip().lower() != "thousands":
                        units.append(f"{key} {date[:7]} scale {scale}")
        log(f"  read {path.name}")
    return out, units


def fred_cad_per_usd() -> dict[str, float]:
    """Federal Reserve H.10 monthly average (Canadian dollars per U.S. dollar), for months before the Bank of Canada series."""
    for attempt in range(4):
        try:
            # A plain request: FRED stalls requests carrying the pipeline's custom User-Agent.
            r = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXCAUS", timeout=60)
            r.raise_for_status()
            return {row["observation_date"][:7]: float(row["EXCAUS"]) for row in csv.DictReader(io.StringIO(r.text)) if row["EXCAUS"] not in ("", ".")}
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(5 * 2**attempt)
    return {}


def load_published() -> tuple[dict[str, dict[str, float | None]], dict[str, float]] | None:
    """The published history as {key: {month: value}}, so a daily run only refreshes recent months."""
    latest = OUT_DIR / "latest.json"
    if not latest.exists():
        return None
    manifest = json.loads(latest.read_text())
    vdir = OUT_DIR / "versions" / manifest["version"]
    index = json.loads((vdir / "index.json").read_text())
    months = index["months"]
    out: dict[str, dict[str, float | None]] = {}
    for key, values in index["series"].items():
        out[key] = dict(zip(months, values))
    fx = dict(zip(months, index["fx"]))
    for p in PROVINCES:
        for s in STATES:
            pair = json.loads((vdir / "pairs" / f"{p}-{s}.json").read_text())
            for key, values in pair["series"].items():
                out[key] = dict(zip(months, values))
    return out, fx


# ---------- metrics ----------

def grubel_lloyd(x: float, m: float) -> float | None:
    """Two-way trade in the same products: 1 = perfectly balanced, 0 = one-way only."""
    return None if x + m <= 0 else 1 - abs(x - m) / (x + m)


def pair_integration(series: dict[str, list], p: str, s: str, idx: list[int]) -> float | None:
    """Trade-weighted integration score across the 21 sections over the months in idx."""
    num = den = 0.0
    for sec in SECTIONS:
        if sec == "total":
            continue
        x = sum(series[f"{p}|{s}|exp|{sec}"][i] or 0 for i in idx)
        m = sum(series[f"{p}|{s}|imp|{sec}"][i] or 0 for i in idx)
        num += abs(x - m)
        den += x + m
    return None if den <= 0 else round(1 - num / den, 4)


# ---------- tariff impact tracker ----------

# HS chapter ranges of the 21 sections (World Customs Organization nomenclature).
SECTION_CHAPTERS = [("I", 1, 5), ("II", 6, 14), ("III", 15, 15), ("IV", 16, 24), ("V", 25, 27), ("VI", 28, 38), ("VII", 39, 40),
                    ("VIII", 41, 43), ("IX", 44, 46), ("X", 47, 49), ("XI", 50, 63), ("XII", 64, 67), ("XIII", 68, 70), ("XIV", 71, 71),
                    ("XV", 72, 83), ("XVI", 84, 85), ("XVII", 86, 89), ("XVIII", 90, 92), ("XIX", 93, 93), ("XX", 94, 96), ("XXI", 97, 97)]
MIN_BASE = 5_000  # thousands of C$: below C$5M a year earlier, a % change says little


def section_of(hs: str) -> str | None:
    ch = int(hs[:2])
    return next((sec for sec, lo, hi in SECTION_CHAPTERS if lo <= ch <= hi), None)


def event_sections() -> dict[str, list[str]]:
    """HS sections hit by each targeted tariff action.

    Canada's counter-tariffs use their official item lists (canada-countermeasures.json); other actions use the
    site's business tags and those businesses' HS codes.
    """
    taxonomy = json.loads((DATA_DIR / "sectors.json").read_text())
    hs_of = {b["id"]: b["hs"] for sec in taxonomy["sectors"] for b in sec["businesses"]}
    events = json.loads((DATA_DIR / "tariff-events.json").read_text())["events"]
    lists_file = DATA_DIR / "canada-countermeasures.json"
    listed = {m["id"]: [i.replace(".", "") for g in m["groups"] for i in g["items"]]
              for m in (json.loads(lists_file.read_text())["measures"] if lists_file.exists() else [])}
    out = {}
    for e in events:
        if e["kind"] not in ("tariff", "counter-tariff") or e["businesses"] == "all":
            continue  # across-the-board actions leave nothing to compare with
        codes = listed.get(e["id"]) or [code for b in e["businesses"] for code in hs_of.get(b, [])]
        secs = sorted({section_of(code) for code in codes} - {None}, key=lambda x: SECTION_IDS[x])
        if secs:
            out[e["id"]] = secs
    return out


def _yoy(values: list[float], months: list[str], window: list[str]) -> float | None:
    now = sum(values[months.index(m)] for m in window)
    before = sum(values[months.index(m) - 12] for m in window)
    return None if before <= 0 else now / before - 1


def tariff_impacts(series: dict[str, list], months: list[str]) -> dict[str, list[dict]]:
    """For each targeted action and corridor: did the hit sections change more than the corridor's other trade?

    Compares the months after the action with the same months a year earlier (so seasons cancel), for the hit
    sections and for the corridor's other sections excluding energy (section V swings with oil prices). The
    difference is an indicative effect, not proof: other news, prices and overlapping actions also move trade.
    """
    events = {e["id"]: e for e in json.loads((DATA_DIR / "tariff-events.json").read_text())["events"]}
    hit_by = event_sections()
    out: dict[str, list[dict]] = {}
    for p in PROVINCES:
        for s in STATES:
            rows = []
            for eid, hit in hit_by.items():
                e = events[eid]
                flow = "exp" if e["imposedBy"] == "US" else "imp"  # U.S. tariffs hit Canada's exports; Canada's hit its imports
                start = e["date"][:7]
                if start not in months or months.index(start) < 24:
                    continue
                i0 = months.index(start)
                post = months[i0 : i0 + 12]
                if len(post) < 3:
                    continue
                pre = months[i0 - 12 : i0]
                other = [sec for sec in SECTIONS if sec not in ("total", "V", *hit)]
                treated = [sum(series[f"{p}|{s}|{flow}|{sec}"][i] or 0 for sec in hit) for i in range(len(months))]
                control = [sum(series[f"{p}|{s}|{flow}|{sec}"][i] or 0 for sec in other) for i in range(len(months))]
                base = sum(treated[months.index(m) - 12] for m in post)
                if base < MIN_BASE or sum(control[months.index(m) - 12] for m in post) < MIN_BASE:
                    continue
                g_t, g_c = _yoy(treated, months, post), _yoy(control, months, post)
                pre_t, pre_c = _yoy(treated, months, pre), _yoy(control, months, pre)
                if g_t is None or g_c is None:
                    continue
                monthly = sorted(
                    (treated[i] / treated[i - 12]) / (control[i] / control[i - 12]) - 1
                    for i in (months.index(m) for m in post) if treated[i - 12] > 0 and control[i - 12] > 0 and control[i] > 0
                )
                q = lambda f: monthly[min(len(monthly) - 1, int(f * (len(monthly) - 1) + 0.5))] if monthly else None
                rows.append({
                    "id": eid, "date": e["date"], "measure": e["measure"], "imposedBy": e["imposedBy"], "flow": flow, "sections": hit,
                    "monthsAfter": len(post), "baseCad": round(base), "hitChange": round(g_t, 4), "otherChange": round(g_c, 4),
                    "effect": round((1 + g_t) / (1 + g_c) - 1, 4), "low": None if q(0.25) is None else round(q(0.25), 4),
                    "high": None if q(0.75) is None else round(q(0.75), 4),
                    "preTrend": None if pre_t is None or pre_c is None else round((1 + pre_t) / (1 + pre_c) - 1, 4),
                })
            out[f"{p}-{s}"] = sorted(rows, key=lambda r: r["date"])
    return out


# ---------- unusual-movement alerts ----------

ALERT_Z, ALERT_MIN, ALERT_MAX, WINDOW = 2.5, 5_000, 5, 3  # z-score, C$ thousands (C$5M), alerts per month, months per window
SEEN = ROOT / "pipeline" / "alerts-seen.json"


def window_changes(values: list) -> list[float | None]:
    """log(last 3 months / same 3 months a year earlier) for every month, None where either side is small or missing."""
    out: list[float | None] = []
    for t in range(len(values)):
        if t < 12 + WINDOW - 1:
            out.append(None)
            continue
        now = values[t - WINDOW + 1 : t + 1]
        before = values[t - 12 - WINDOW + 1 : t - 12 + 1]
        if any(v is None for v in now + before) or sum(before) < ALERT_MIN or sum(now) <= 0:
            out.append(None)
        else:
            out.append(math.log(sum(now) / sum(before)))
    return out


def alerts_at(series: dict[str, list], months: list[str], t: int, changes: dict[str, list]) -> list[dict]:
    """Moves at month t that are unusual against each series' own history before t."""
    found = []
    for key, ch in changes.items():
        x = ch[t]
        hist = [v for v in ch[:t] if v is not None]
        if x is None or len(hist) < 36:
            continue
        mean = sum(hist) / len(hist)
        sd = (sum((v - mean) ** 2 for v in hist) / (len(hist) - 1)) ** 0.5
        if sd <= 0:
            continue
        z = (x - mean) / sd
        values = series[key]
        now, before = sum(values[t - WINDOW + 1 : t + 1]), sum(values[t - 12 - WINDOW + 1 : t - 12 + 1])
        if abs(z) >= ALERT_Z and abs(now - before) >= ALERT_MIN:
            p, s, flow, sec = key.split("|")
            found.append({"pair": f"{p}-{s}", "flow": flow, "section": sec, "month": months[t], "nowCad": round(now), "beforeCad": round(before),
                          "change": round(now / before - 1, 4), "z": round(z, 2)})
    return sorted(found, key=lambda a: abs(a["nowCad"] - a["beforeCad"]), reverse=True)


def unusual_moves(series: dict[str, list], months: list[str]) -> dict:
    """Latest month's alerts (top 5), plus a backtest: how many moves would have been flagged each month since 2019."""
    keys = [k for k in series if k.split("|")[0] in PROVINCES and k.split("|")[1] in STATES]
    changes = {k: window_changes(series[k]) for k in keys}
    last = len(months) - 1
    backtest = {}
    for t in range(months.index("2019-01"), last + 1):
        backtest[months[t]] = len(alerts_at(series, months, t, changes))
    return {"month": months[last], "items": alerts_at(series, months, last, changes)[:ALERT_MAX], "backtest": backtest,
            "rule": f"last {WINDOW} months vs a year earlier, beyond {ALERT_Z} standard deviations of the series' own history, and at least C$5M"}


# Context: which products made the move, and the province's trade in those products with all U.S. states and all
# countries over the same months. If that total barely moved, the corridor's move was mostly trade switching routes or
# partners (another port, state or country). Example: in 2026 Saskatchewan's potash shipped through Portland, Oregon fell
# 90% while its potash exports to all countries held steady. Products, not whole HS sections, because a section's total
# also carries unrelated products (Saskatchewan's other chemicals fell at the same time, to other states).
SMALL_SHARE, OFFSET, TOP_PRODUCTS, EXPLAINED = 0.05, 0.5, 3, 0.8


def reading(change: float, all_before: float, all_change: float) -> str:
    """'small': the corridor's move is under 5% of the province's trade in those products with all countries;
    'shift': that total moved less than half as much, or the other way, so the move was mostly made up elsewhere;
    'real': the total moved with it."""
    if all_before <= 0 or abs(change) < SMALL_SHARE * all_before:
        return "small"
    if all_change * change <= 0 or abs(all_change) < OFFSET * abs(change):
        return "shift"
    return "real"


def main_products(delta: "pd.Series") -> list[str]:
    """The HS4 products behind most of a corridor's move: those moving the same way, biggest first, until they
    explain 80% of the net move (at most 3)."""
    total = delta.sum()
    same = delta[delta * total > 0].abs().sort_values(ascending=False)
    out, covered = [], 0.0
    for hs4, v in same.items():
        out.append(hs4)
        covered += v
        if covered >= EXPLAINED * abs(total) or len(out) == TOP_PRODUCTS:
            break
    return out


def published_alerts() -> dict | None:
    latest = OUT_DIR / "latest.json"
    if not latest.exists():
        return None
    version = json.loads(latest.read_text())["version"]
    return json.loads((OUT_DIR / "versions" / version / "index.json").read_text()).get("alerts")


def alert_context(items: list[dict], months: list[str], previous: dict | None) -> None:
    """Add each alert's "context" (thousands of C$, from the customs files by HS4 product). Reuses the published context
    for the same alert, so the files are read about once a month; if they can't be read, the alerts go out without it."""
    old = {(a["pair"], a["flow"], a["section"], a["month"]): a.get("context") for a in (previous or {}).get("items", [])}
    todo = []
    for a in items:
        ctx = old.get((a["pair"], a["flow"], a["section"], a["month"]))
        if ctx and ctx.get("products"):  # (an older format without products is rebuilt)
            a["context"] = ctx
        else:
            todo.append(a)
    if not todo:
        return
    windows = {}
    need: dict[int, str] = {}
    for a in todo:
        t = months.index(a["month"])
        windows[id(a)] = (months[t - WINDOW + 1 : t + 1], months[t - 12 - WINDOW + 1 : t - 12 + 1])
        for m in windows[id(a)][0] + windows[id(a)][1]:
            need[int(m[:4])] = max(need.get(int(m[:4]), m), m)
    try:
        import fetch_cimt  # reads Statistics Canada's bulk customs files; only needed when there are new alerts

        df = pd.concat([fetch_cimt.corridor_hs4(y, need=m) for y, m in sorted(need.items())])
        names = {**fetch_cimt.statcan_hs4_names(max(need)), **fetch_cimt.hs4_names()}
    except (requests.RequestException, RuntimeError, OSError) as e:
        log(f"::warning::Couldn't read the customs files for the alerts' context ({e}); alerts go out without it.")
        return
    df["section"] = df["hs4"].str.zfill(4).map(section_of)
    for a in todo:
        p, s = a["pair"].split("-")
        rows = df[(df["flow"] == a["flow"]) & (df["province"] == p)]
        if a["section"] != "total":
            rows = rows[rows["section"] == a["section"]]
        now, before = windows[id(a)]
        by = lambda partner, ms: rows[(rows["partner"] == partner) & rows["ym"].isin(ms)].groupby("hs4")["value"].sum() / 1000
        t = pd.DataFrame({"corridorNowCad": by(s, now), "corridorBeforeCad": by(s, before), "usNowCad": by("US", now),
                          "usBeforeCad": by("US", before), "allNowCad": by("ALL", now), "allBeforeCad": by("ALL", before)}).fillna(0)
        top = main_products(t["corridorNowCad"] - t["corridorBeforeCad"])
        if not top:
            continue
        picked = t.loc[top].sum()
        a["context"] = {
            "products": [{"hs4": h, "name": names.get(h, f"HS {h}"), **{k: round(v) for k, v in t.loc[h].items()}} for h in top],
            "reading": reading(picked["corridorNowCad"] - picked["corridorBeforeCad"], picked["allBeforeCad"],
                               picked["allNowCad"] - picked["allBeforeCad"]),
        }


def context_text(a: dict, province: str) -> str:
    """One plain-language line for an alert's context (the site says the same in CorridorData.tsx)."""
    c = a.get("context")
    if not c:
        return ""
    ps = c["products"]
    tot = {k: sum(p[k] for p in ps) for k in ("allNowCad", "allBeforeCad", "usNowCad", "usBeforeCad")}
    trade, to = ("exports", "to") if a["flow"] == "exp" else ("imports", "from")
    it = "it" if len(ps) == 1 else "them"
    m = lambda x: f"C${x / 1e3:,.1f}M"
    pct = lambda now, before: f" ({now / before - 1:+.0%})" if before else ""
    move = "fall" if a["nowCad"] < a["beforeCad"] else "rise"
    what = ", ".join(f"{p['name']} (HS {p['hs4']})" for p in ps)
    line = (f"Mostly {what}. {province}'s {trade} of {it} {to} all countries: "
            f"{m(tot['allBeforeCad'])} → {m(tot['allNowCad'])}{pct(tot['allNowCad'], tot['allBeforeCad'])}; {to} all U.S. states: "
            f"{m(tot['usBeforeCad'])} → {m(tot['usNowCad'])}{pct(tot['usNowCad'], tot['usBeforeCad'])}. ")
    return line + {
        "shift": f"That total barely moved (or moved the other way), so this looks mostly like trade switching routes or partners "
                 f"(another port, state or country), not a real {move} in {province}'s {trade}.",
        "real": f"That total moved the same way, so this looks like a real {move} in {province}'s {trade}.",
        "small": f"This is small next to {province}'s total {trade} of {it}.",
    }[c["reading"]]


def open_alert_issue(alerts: dict, ix_provinces: dict, ix_states: dict) -> None:
    """In GitHub Actions, open one 'trade-alert' issue per new data month (remembered in pipeline/alerts-seen.json)."""
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    seen = json.loads(SEEN.read_text()) if SEEN.exists() else []
    if not alerts["items"] or alerts["month"] in seen:
        return
    lines = []
    for a in alerts["items"]:
        p, s = a["pair"].split("-")
        way = f"{ix_provinces[p]} → {ix_states[s]}" if a["flow"] == "exp" else f"{ix_states[s]} → {ix_provinces[p]}"
        lines.append(f"- **{way} · {SECTIONS[a['section']]}**: {a['change']:+.0%} vs a year earlier (C${a['beforeCad'] / 1e3:,.1f}M → C${a['nowCad'] / 1e3:,.1f}M over 3 months; {a['z']:+.1f} standard deviations)")
        if a.get("context"):
            lines.append(f"  - {context_text(a, ix_provinces[p])}")
    body = (f"Unusual cross-border trade moves in the 3 months to {alerts['month']} (Statistics Canada table 12-10-0099).\n\n"
            + "\n".join(lines) + "\n\nRule: " + alerts["rule"] + ". Check the news and the tariff timeline; see the Corridors tab on /data.")
    if repo and token:
        r = requests.post(f"https://api.github.com/repos/{repo}/issues", timeout=60,
                          headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                          json={"title": f"Trade alert: unusual corridor moves, {alerts['month']}", "body": body, "labels": ["trade-alert"]})
        if r.ok:
            log(f"Opened trade-alert issue #{r.json().get('number')}")
        else:
            log(f"::warning::Couldn't open the trade-alert issue: HTTP {r.status_code}")
            return
    else:
        log("Trade alerts (not opening an issue outside GitHub Actions):\n" + "\n".join(lines))
        return  # only a real issue marks the month as seen
    SEEN.write_text(json.dumps(sorted(set(seen) | {alerts["month"]}), indent=1) + "\n")


# ---------- checks ----------

def check(name: str, problems: list[str], detail: str) -> dict:
    return {"name": name, "passed": not problems, "detail": detail if not problems else "; ".join(problems[:5])}


def run_checks(series: dict[str, list], months: list[str], units: list[str], fx: dict[str, float], fx_bank: dict[str, float]) -> list[dict]:
    gaps, sums = [], []
    for key, values in series.items():
        first = next((i for i, v in enumerate(values) if v is not None), None)
        if first is not None and any(v is None for v in values[first:]):
            gaps.append(key)
    for p in PROVINCES:
        for s in STATES:
            for f in FLOWS:
                total = series[f"{p}|{s}|{f}|total"]
                parts = [series[f"{p}|{s}|{f}|{sec}"] for sec in SECTIONS if sec != "total"]
                for i, m in enumerate(months):
                    if total[i] is None:
                        continue
                    gap = abs(total[i] - sum(x[i] or 0 for x in parts))
                    if gap > 11:  # 21 sections, each rounded to C$1,000
                        sums.append(f"{p}->{s} {f} {m}: gap C${gap:,.0f}k")
    latest = [k for k in ("BC|WA|exp|total", "AB|WA|exp|total", "BC|ID|exp|total", "AB|ID|exp|total") if series[k][-1] is None]
    splice = [f"{m}: {fx[m]} vs {fx_bank[m]}" for m in fx_bank if m in fx and abs(fx[m] / fx_bank[m] - 1) > 0.000001]
    missing_fx = [m for m in months if m not in fx]
    return [
        check("Values are in thousands of Canadian dollars", units, "Every data point's scale code is 3 (thousands)"),
        check("Sections add up to the total", sums, "All 25 corridors, both directions, every month, within C$11,000 (21 sections rounded to C$1,000)"),
        check("No gaps in any series", gaps, f"{len(series)} series, {months[0]} to {months[-1]}"),
        check("Latest month present for B.C./Alberta with Washington/Idaho", latest, f"Latest month {months[-1]}"),
        check("Exchange rates cover every month and match the dashboard's", missing_fx + splice,
              "Bank of Canada rates (as on the dashboard) from 2017; Federal Reserve rates before, which agree within 0.15% where both exist"),
    ]


def mirror(series: dict[str, list], months: list[str], fx: dict[str, float], dashboard: dict) -> list[dict]:
    """Canada's record of trade with each state vs the U.S. record (last 12 months, US$). Reported, not enforced."""
    out = []
    window = range(len(months) - 12, len(months))
    for s, (_, name) in STATES.items():
        if s not in dashboard:
            continue
        ca_exp = sum((series[f"CA|{s}|exp|total"][i] or 0) * 1000 / fx[months[i]] for i in window) / 1e6
        ca_imp = sum((series[f"CA|{s}|imp|total"][i] or 0) * 1000 / fx[months[i]] for i in window) / 1e6
        us = dashboard[s]["all"]["last12"]
        out.append({"state": s, "name": name, "canadaExportsToState": round(ca_exp), "stateImportsFromCanada": us["imports"],
                    "canadaImportsFromState": round(ca_imp), "stateExportsToCanada": us["exports"]})
    return out


# ---------- publish ----------

def publish(files: dict[str, bytes], quality: dict) -> bool:
    version = digest(b"".join(digest(files[k]).encode() for k in sorted(files)))[:20]
    latest = OUT_DIR / "latest.json"
    if latest.exists() and json.loads(latest.read_text()).get("version") == version:
        log("Corridor data unchanged; nothing to publish.")
        return False
    vdir = OUT_DIR / "versions" / version
    for name, content in files.items():
        (vdir / name).parent.mkdir(parents=True, exist_ok=True)
        atomic_write(vdir / name, content)
    manifest = {"schemaVersion": 1, "version": version, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "files": {k: digest(v) for k, v in sorted(files.items())}, "quality": quality}
    atomic_write(latest, (json.dumps(manifest, indent=1) + "\n").encode())
    for old in (OUT_DIR / "versions").iterdir():
        if old.name != version:
            shutil.rmtree(old)
    log(f"Published corridor data version {version}.")
    return True


def main() -> None:
    dashboard = json.loads((DATA_DIR / "real.json").read_text())
    fx_bank = dashboard["meta"]["fx"]
    published = None if "--full" in sys.argv or "--from-zip" in sys.argv else load_published()
    try:
        # Rates before 2017 never change: reuse the published ones, so FRED is only needed for a first or --full run.
        fred = published[1] if published else fred_cad_per_usd()
        fresh, units = fetch_from_tables() if "--from-zip" in sys.argv else fetch(latest_n=24 if published else 460)
    except (requests.RequestException, RuntimeError) as e:
        log(f"::warning::Couldn't reach a corridor data source ({e}); keeping the current files.")
        return
    data = published[0] if published else {}
    for key, by in fresh.items():  # recent months replace the published ones (Statistics Canada revises them)
        data.setdefault(key, {}).update(by)
    last = max(m for k, by in data.items() if k.endswith("|total") and not k.startswith("CA") for m, v in by.items() if v is not None)
    months = months_between(FIRST, last)
    series = {k: [data.get(k, {}).get(m) for m in months] for k in series_specs()}
    fx = {m: fx_bank.get(m, fred.get(m)) for m in months if m in fx_bank or m in fred}

    checks = run_checks(series, months, units, fx, fx_bank)
    for c in checks:
        log(f"  {'✓' if c['passed'] else '✗'} {c['name']}: {c['detail']}")
    if not all(c["passed"] for c in checks):
        sys.exit("Corridor data checks failed; nothing published.")

    last12 = list(range(len(months) - 12, len(months)))
    years = sorted({m[:4] for m in months if months.count(f"{m[:4]}-12")})
    integration = {}
    for p in PROVINCES:
        for s in STATES:
            by_year = {y: pair_integration(series, p, s, [i for i, m in enumerate(months) if m.startswith(y)]) for y in years}
            integration[f"{p}-{s}"] = {"last12": pair_integration(series, p, s, last12), "byYear": by_year}

    alerts = unusual_moves(series, months)
    alert_context(alerts["items"], months, published_alerts())
    index_series = {k: v for k, v in series.items() if k.endswith("|total")}
    index = {
        "schemaVersion": 1, "months": months, "lastMonth": last, "fx": [round(fx[m], 6) for m in months],
        "provinces": {p: n for p, (_, n) in PROVINCES.items()}, "states": {s: n for s, (_, n) in STATES.items()},
        "sections": SECTIONS, "series": index_series, "integration": integration,
        "mirror": mirror(series, months, fx, dashboard["trade"]), "sources": SOURCES,
        "impacts": tariff_impacts(series, months), "eventSections": event_sections(), "alerts": alerts,
    }
    files = {"index.json": dumps(index).encode()}
    for p in PROVINCES:
        for s in STATES:
            pair = {k: v for k, v in series.items() if k.startswith(f"{p}|{s}|") and not k.endswith("|total")}
            files[f"pairs/{p}-{s}.json"] = dumps({"schemaVersion": 1, "pair": f"{p}-{s}", "series": pair}).encode()
    publish(files, {"passed": True, "checks": checks})
    open_alert_issue(index["alerts"], index["provinces"], index["states"])
    counts = sorted(index["alerts"]["backtest"].values())
    log(f"  Alerts this month: {len(index['alerts']['items'])}; backtest 2019 on: median {counts[len(counts) // 2]} flagged a month, max {counts[-1]}")
    for p, s in (("BC", "WA"), ("AB", "WA"), ("BC", "ID"), ("AB", "ID")):
        x = sum((series[f"{p}|{s}|exp|total"][i] or 0) * 1000 / fx[months[i]] for i in last12) / 1e6
        g = integration[f"{p}-{s}"]["last12"]
        log(f"  {p} -> {s}: exports US${x:,.0f}M over 12 months to {last}; integration score {g}")
    for r in index["impacts"]["BC-WA"]:
        log(f"  BC-WA {r['date']} {r['id']}: hit sections {r['hitChange']:+.0%} vs other {r['otherChange']:+.0%} -> indicative {r['effect']:+.0%} (pre-trend {r['preTrend']})")


if __name__ == "__main__":
    main()
