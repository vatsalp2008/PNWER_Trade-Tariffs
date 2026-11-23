"""Canada's counter-tariffs on U.S. goods: estimated cost for each PNWER state and province.

Writes prototype/src/data/counter-tariffs.json, used by the fact sheets (Affordability card), the dashboard's
side panel and the /data "Canada's counter-tariffs" view.

How it works:
- The measures (which Canadian tariff items, at what surtax rate, from when) are curated by hand in
  prototype/src/data/canada-countermeasures.json, from the orders in the Canada Gazette.
- Trade is Canada's own import record (Statistics Canada CIMT, by 8-digit tariff item, U.S. state of origin
  and province of clearance), so each listed item matches exactly.
- Cost = imports of each listed item over the dashboard's last 12 months x the surtax rate in force today,
  in US$ at the dashboard's monthly exchange rates. A static estimate: it assumes the same goods keep
  crossing, and it's before any relief (remission) Canada grants to some importers, so it's an upper bound.

Run: python pipeline/counter_tariffs.py      (about 20 seconds; no key needed)
"""

from __future__ import annotations

import json
import sys
from datetime import date

import pandas as pd
import requests

import fetch_cimt
from common import DATA_DIR, PROVINCES, US_STATES, business_of, log, scopes
from names import PROVINCE_NAMES, STATE_NAMES

MEASURES = DATA_DIR / "canada-countermeasures.json"
OUT = DATA_DIR / "counter-tariffs.json"
TOP = 8  # products listed per jurisdiction on /data
ANNOUNCED_TOLERANCE = 0.10  # a list's Canada-wide imports in the announcement's base year vs the value announced


def months_window(last: str, n: int = 12) -> list[str]:
    y, m = int(last[:4]), int(last[5:])
    out = []
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out[::-1]


def in_force(measure: dict, day: str) -> bool:
    return measure["start"] <= day and (not measure.get("end") or measure["end"] > day)


def costed(measure: dict) -> bool:
    """Measures whose cost we can't estimate from trade data are listed but not costed (see `notCostedWhy`)."""
    return not measure.get("notCostedWhy")


def item_rates(measures: list[dict], day: str) -> dict[str, tuple[float, str]]:
    """Tariff item (8 digits) -> (surtax rate, measure id) for the costed measures in force on `day`.

    If an item is on two lists, the higher rate is used (a new order usually raises the rate on the same goods).
    """
    rates: dict[str, tuple[float, str]] = {}
    for m in measures:
        if not (in_force(m, day) and costed(m)):
            continue
        for g in m["groups"]:
            for item in g["items"]:
                hs8 = item.replace(".", "")
                if hs8 not in rates or g["rate"] > rates[hs8][0]:
                    rates[hs8] = (g["rate"], m["id"])
    return rates


def estimate(imports: pd.DataFrame, rates: dict[str, tuple[float, str]], window: list[str], fx: dict[str, float]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """All of the window's imports (US$), and the rows that are on a list, with the surtax each would pay (both in US$)."""
    df = imports[imports["ym"].isin(window)].copy()
    df["usd"] = df["value"] / df["ym"].map(fx)
    hit = df[df["hs8"].isin(rates)].copy()
    hit["rate"] = hit["hs8"].map(lambda h: rates[h][0])
    hit["measure"] = hit["hs8"].map(lambda h: rates[h][1])
    hit["duty"] = hit["usd"] * hit["rate"]
    hit["hs4"] = hit["hs8"].str[:4]
    hit["biz"] = hit["hs4"].map(business_of)
    return df, hit


def m(x: float) -> float:
    """US$ millions, 3 significant figures."""
    v = x / 1e6
    return float(f"{v:.3g}") if v else 0.0


def jurisdiction(code: str, df: pd.DataFrame, hit: pd.DataFrame, names: dict[str, str]) -> dict:
    us = code in US_STATES
    side, other = ("state", "province") if us else ("province", "state")
    mine, mine_hit = df[df[side] == code], hit[hit[side] == code]
    all_biz = mine.assign(biz=mine["hs8"].str[:4].map(business_of))
    out_scopes = {}
    for scope, bizs in scopes().items():
        h = mine_hit[mine_hit["biz"].isin(bizs)]
        out_scopes[scope] = {
            "duties": m(h["duty"].sum()),
            "covered": m(h["usd"].sum()),
            "trade": m(all_biz.loc[all_biz["biz"].isin(bizs), "usd"].sum()),
        }
    partners = PROVINCES if us else US_STATES
    by_partner = mine_hit.groupby(other)["duty"].sum()
    top = (mine_hit.groupby("hs4").agg(duty=("duty", "sum"), usd=("usd", "sum")).sort_values("duty", ascending=False).head(TOP))
    return {
        "name": STATE_NAMES[code] if us else PROVINCE_NAMES[code],
        "scopes": out_scopes,
        "byMeasure": {k: m(v) for k, v in mine_hit.groupby("measure")["duty"].sum().items()},
        "byPartner": {**{p: m(by_partner.get(p, 0.0)) for p in partners}, "other": m(by_partner[~by_partner.index.isin(partners)].sum())},
        "top": [{"hs4": h, "name": names.get(h, f"HS {h} products"), "covered": m(r.usd), "duties": m(r.duty), "rate": round(r.duty / r.usd, 3) if r.usd else 0.0}
                for h, r in top.iterrows()],
    }


def check(name: str, problems: list[str], detail: str) -> dict:
    return {"name": name, "passed": not problems, "detail": detail if not problems else "; ".join(problems[:5])}


def list_values(measures: list[dict], imports: pd.DataFrame, months: list[str]) -> dict[str, float]:
    """Canada-wide imports from the U.S. of each list's items over `months` (C$)."""
    canada = imports[(imports["state"] == "ALL") & imports["ym"].isin(months)]
    by_item = canada.groupby("hs8")["value"].sum()
    return {m["id"]: float(by_item[by_item.index.isin({i.replace(".", "") for g in m["groups"] for i in g["items"]})].sum()) for m in measures}


def run_checks(measures: list[dict], rates: dict, imports: pd.DataFrame, df: pd.DataFrame, hit: pd.DataFrame,
               window: list[str], fx: dict[str, float], today: str) -> list[dict]:
    bad_items = [f"{m['id']}: {i}" for m in measures for g in m["groups"] for i in g["items"] if len(i.replace(".", "")) != 8 or not i.replace(".", "").isdigit()]
    bad_rates = [f"{m['id']}: {g['rate']}" for m in measures for g in m["groups"] if not 0 < g["rate"] <= 1]
    # Each list's Canada-wide imports in the announcement's base year vs the value the government announced:
    # catches a list that's missing items or has wrong codes.
    announced, lines = [], []
    for meas in measures:
        if not meas.get("announcedCad"):
            continue
        y = meas["announcedYear"]
        ours = list_values([meas], imports, [f"{y}-{k:02d}" for k in range(1, 13)])[meas["id"]]
        lines.append(f"{meas['name']}: C${ours / 1e9:.1f}B of {y} imports vs C${meas['announcedCad'] / 1e9:.1f}B announced")
        if not (1 - ANNOUNCED_TOLERANCE) <= ours / meas["announcedCad"] <= 1 + ANNOUNCED_TOLERANCE:
            announced.append(f"{meas['name']}: C${ours / 1e9:.1f}B of {y} imports vs C${meas['announcedCad'] / 1e9:.1f}B announced")
    missing = [ym for ym in window if ym not in set(imports["ym"]) or ym not in fx]
    # Every jurisdiction's duties can't exceed the most any listed item pays (50%) on its covered trade.
    over = [] if hit.empty or (hit["duty"] <= hit["usd"] * 0.5 + 1e-6).all() else ["a duty above 50% of the goods' value"]
    return [
        check("Every listed item is an 8-digit Canadian tariff item with a rate between 0 and 100%", bad_items + bad_rates,
              f"{len(rates)} items in force on {today}"),
        check(f"Each list's imports are within {ANNOUNCED_TOLERANCE:.0%} of the value the government announced", announced, "; ".join(lines) or "no announced values"),
        check("The trade data covers the dashboard's last 12 months", missing, f"{window[0]} to {window[-1]}"),
        check("No item pays more than 50% of its value", over, "highest rate on any list is 50%"),
    ]


def main() -> int:
    real = json.loads((DATA_DIR / "real.json").read_text())
    last, fx = real["meta"]["dataAsOf"], real["meta"]["fx"]
    window = months_window(last)
    today = date.today().isoformat()
    curated = json.loads(MEASURES.read_text())
    measures = curated["measures"]
    rates = item_rates(measures, today)
    years = sorted({int(ym[:4]) for ym in window} | {m["announcedYear"] for m in measures if m.get("announcedYear")})
    newest = max(years)
    try:
        imports = pd.concat([fetch_cimt.us_imports_hs8(y, fresh=y == newest) for y in years])
        names = {**fetch_cimt.statcan_hs4_names(newest), **fetch_cimt.hs4_names(), **curated.get("productNames", {})}
    except (requests.RequestException, RuntimeError, OSError) as e:
        log(f"::warning::Couldn't reach Statistics Canada ({e}); keeping the current counter-tariffs.json.")
        return 0
    df, hit = estimate(imports, rates, window, fx)
    checks = run_checks(measures, rates, imports, df, hit, window, fx, today)
    for c in checks:
        log(f"  {'ok ' if c['passed'] else 'FAIL'} {c['name']}: {c['detail']}")
    if not all(c["passed"] for c in checks):
        log("::error::Counter-tariff checks failed; keeping the existing counter-tariffs.json")
        return 1
    out = {
        "asOf": today,
        "window": [window[0], window[-1]],
        "measures": [{
            "id": x["id"], "name": x["name"], "start": x["start"], "end": x.get("end"), "rates": sorted({g["rate"] for g in x["groups"]}),
            "items": sum(len(g["items"]) for g in x["groups"]), "itemsWithProductRelief": x.get("itemsWithProductRelief", 0),
            "inForce": in_force(x, today), "costed": costed(x), "notCostedWhy": x.get("notCostedWhy"), "order": x.get("order"),
            "sourceUrl": x.get("sourceUrl"), "verified": x.get("verified", False), "note": x.get("note"),
            "canadaImportsUsd": m(sum(v / fx[ym] for ym, v in imports[(imports["state"] == "ALL") & imports["ym"].isin(window)
                                    & imports["hs8"].isin({i.replace(".", "") for g in x["groups"] for i in g["items"]})]
                                    .groupby("ym")["value"].sum().items())),
        } for x in measures],
        "ended": curated.get("ended", []),
        "notIncluded": curated.get("notIncluded", []),
        "jurisdictions": {j: jurisdiction(j, df, hit, names) for j in US_STATES + PROVINCES},
        "checks": checks,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    for j in US_STATES + PROVINCES:
        a = out["jurisdictions"][j]["scopes"]["all"]
        log(f"  {j}: US${a['duties']}M a year on US${a['covered']}M of listed goods (of US${a['trade']}M)")
    log(f"Wrote {OUT.relative_to(DATA_DIR.parent.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
