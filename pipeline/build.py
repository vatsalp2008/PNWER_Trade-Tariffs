"""Builds prototype/src/data/real.json (trade section) from public sources.

    python pipeline/build.py            # uses CENSUS_API_KEY from env or prototype/.env.local
    python pipeline/build.py --if-new   # skip if real.json already has the latest month

Output matches the TradeRecord shape in prototype/src/data/types.ts. The build
refuses to write anything if a data check fails.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date

import pandas as pd
import requests

import fetch_boc
import fetch_census
import fetch_cimt
from common import DATA_DIR, FIRST_YEAR, PROVINCES, ROOT, US_STATES, business_of, log, scopes
from names import PROVINCE_NAMES, STATE_NAMES, product_name, register_descriptions

MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load_env() -> None:
    env = ROOT / "prototype" / ".env.local"
    if not os.environ.get("CENSUS_API_KEY") and env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def month_list(first_year: int, last_ym: str) -> list[str]:
    ly, lm = int(last_ym[:4]), int(last_ym[5:])
    return [f"{y}-{m:02d}" for y in range(first_year, ly + 1) for m in range(1, 13) if (y, m) <= (ly, lm)]


def sig(x: float, digits: int = 3) -> float:
    return 0.0 if not x else float(f"{x:.{digits}g}")


def frac(x: float) -> float:
    return round(float(x), 3)


def with_biz(df: pd.DataFrame, col: str = "hs4") -> pd.DataFrame:
    table = {c: business_of(c) for c in df[col].unique()}
    return df.assign(biz=df[col].map(table))


# ---------- per-jurisdiction inputs ----------

class Inputs:
    """Everything needed to build TradeRecords for one jurisdiction. Values in USD."""

    partner_code: str
    monthly: pd.DataFrame  # ym, biz, exp, imp  (trade with the partner country)
    world: pd.DataFrame  # ym, biz, exp, imp  (trade with all countries)
    hs: pd.DataFrame  # ym, hs4, biz, exp, imp (partner, for top products)
    rank: pd.DataFrame  # country, biz, value (exports, calendar year)
    partners: pd.DataFrame  # name, ym, biz, value (two-way, across the border)
    share_num: pd.Series  # by biz, last 12 months
    share_den: pd.Series


def last12(df: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    return df[df["ym"].isin(months[-12:])]


def us_inputs(state: str, census: dict, cimt_recent: list[dict], fx: dict, months: list[str], nat_imports: pd.DataFrame) -> Inputs:
    x = Inputs()
    x.partner_code = fetch_census.CANADA
    ce, ci = with_biz(census["canada_exp"]), with_biz(census["canada_imp"])
    hs = pd.concat([ce.assign(exp=ce["value"], imp=0.0), ci.assign(exp=0.0, imp=ci["value"])])
    x.hs = hs.groupby(["ym", "hs4", "biz"], as_index=False)[["exp", "imp"]].sum()
    x.monthly = x.hs.groupby(["ym", "biz"], as_index=False)[["exp", "imp"]].sum()
    we, wi = with_biz(census["world_exp"]), with_biz(census["world_imp"])
    w = pd.concat([we.assign(exp=we["value"], imp=0.0), wi.assign(exp=0.0, imp=wi["value"])])
    x.world = w.groupby(["ym", "biz"], as_index=False)[["exp", "imp"]].sum()
    x.rank = with_biz(census["rank"]).groupby(["country", "biz"], as_index=False)["value"].sum()

    us_states = pd.concat([c["us_states"] for c in cimt_recent])
    us_states = us_states[us_states["state"] == state].copy()
    us_states["value"] = us_states["value"] / us_states["ym"].map(fx)
    recent = last12(us_states, months)
    x.partners = recent.assign(name=recent["province"].map(PROVINCE_NAMES).fillna(recent["province"]))[["name", "ym", "biz", "value"]]
    # Share of Canada's imports that come from this state (Canadian import records, CAD ratio).
    canada_total = last12(pd.concat([c["canada_total"] for c in cimt_recent]), months)
    from_state = last12(pd.concat([c["us_states"] for c in cimt_recent]), months)
    from_state = from_state[(from_state["state"] == state) & (from_state["flow"] == "imp")]
    x.share_num = from_state.groupby("biz")["value"].sum()
    x.share_den = canada_total.groupby("biz")["value"].sum()
    return x


def province_inputs(prov: str, cimt_all: dict[int, dict], fx: dict, months: list[str], nat_imports: pd.DataFrame, rank_year: int) -> Inputs:
    x = Inputs()
    x.partner_code = "US"
    p = pd.concat([cimt_all[y]["prov"] for y in sorted(cimt_all)])
    p = p[(p["province"] == prov) & p["ym"].isin(months)].copy()
    p["us"] = p["us"].astype(str).str.lower().eq("true")
    p["value"] = p["value"] / p["ym"].map(fx)
    p = with_biz(p)
    p["exp"] = p["value"].where(p["flow"] == "exp", 0.0)
    p["imp"] = p["value"].where(p["flow"] == "imp", 0.0)
    x.hs = p[p["us"]].groupby(["ym", "hs4", "biz"], as_index=False)[["exp", "imp"]].sum()
    x.monthly = x.hs.groupby(["ym", "biz"], as_index=False)[["exp", "imp"]].sum()
    x.world = p.groupby(["ym", "biz"], as_index=False)[["exp", "imp"]].sum()

    pc = cimt_all[rank_year]["prov_country"]
    x.rank = pc[pc["province"] == prov].groupby(["country", "biz"], as_index=False)["value"].sum()

    ps = pd.concat([cimt_all[y]["prov_states"] for y in sorted(cimt_all) if not cimt_all[y]["prov_states"].empty])
    ps = last12(ps[ps["province"] == prov], months).copy()
    ps["value"] = ps["value"] / ps["ym"].map(fx)
    x.partners = ps.assign(name=ps["state"].map(STATE_NAMES).fillna("Unspecified state"))[["name", "ym", "biz", "value"]]
    # Share of U.S. imports (from the world) that come from this province.
    exp_us = last12(x.monthly, months)
    x.share_num = exp_us.groupby("biz")["exp"].sum()
    ni = with_biz(last12(nat_imports, months))
    x.share_den = ni.groupby("biz")["value"].sum()
    return x


# ---------- TradeRecord ----------

def trade_record(x: Inputs, bizs: list[str], months: list[str]) -> dict:
    sel = x.monthly[x.monthly["biz"].isin(bizs)].groupby("ym")[["exp", "imp"]].sum().reindex(months, fill_value=0.0)
    exp, imp = sel["exp"].to_numpy() / 1e6, sel["imp"].to_numpy() / 1e6  # USD millions
    n = len(months)

    rolling = []
    for i, ym in enumerate(months):
        y, m = int(ym[:4]), int(ym[5:])
        if i >= 11 and (m % 3 == 0 or i == n - 1):
            rolling.append([frac(y + m / 12), sig(exp[i - 11 : i + 1].sum()), sig(imp[i - 11 : i + 1].sum())])

    full_years = sorted({int(m[:4]) for m in months if months.count(f"{m[:4]}-12")})
    annual = []
    for y in full_years:
        idx = [i for i, ym in enumerate(months) if ym.startswith(f"{y}-")]
        annual.append({"year": y, "exports": sig(exp[idx].sum()), "imports": sig(imp[idx].sum())})

    l12 = {"exports": sig(exp[-12:].sum()), "imports": sig(imp[-12:].sum())}
    p12 = {"exports": sig(exp[-24:-12].sum()), "imports": sig(imp[-24:-12].sum())}

    hs = last12(x.hs[x.hs["biz"].isin(bizs)], months).groupby("hs4")[["exp", "imp"]].sum() / 1e6

    def top(col: str) -> list[dict]:
        t = hs[hs[col] > 0].sort_values(col, ascending=False).head(5)
        return [{"name": product_name(code), "hs": code, "value": sig(v)} for code, v in t[col].items()]

    world12 = last12(x.world[x.world["biz"].isin(bizs)], months)[["exp", "imp"]].sum() / 1e6
    share = lambda part, whole: frac(min(1.0, part / whole)) if whole > 0 else 0.0

    by_country = x.rank[x.rank["biz"].isin(bizs)].groupby("country")["value"].sum().sort_values(ascending=False)
    by_country = by_country[by_country > 0]
    rank = int(list(by_country.index).index(x.partner_code) + 1) if x.partner_code in by_country.index else 0

    pj = x.partners[x.partners["biz"].isin(bizs)].groupby("name")["value"].sum()
    total = pj.sum()
    pj = pj.drop(labels=["Unspecified state"], errors="ignore").sort_values(ascending=False).head(5)
    partner_jurisdictions = [{"name": k, "share": frac(v / total)} for k, v in pj.items()] if total > 0 else []

    def annual_value(df: pd.DataFrame, year: int, col: str = "exp") -> float:
        d = df[df["biz"].isin(bizs) & df["ym"].str.startswith(f"{year}-")]
        return float(d[col].sum())

    g_partner = annual_value(x.monthly, 2024) / annual_value(x.monthly, 2019) - 1 if annual_value(x.monthly, 2019) else 0.0
    g_world = annual_value(x.world, 2024) / annual_value(x.world, 2019) - 1 if annual_value(x.world, 2019) else 0.0

    num = float(x.share_num.reindex(bizs, fill_value=0).sum())
    den = float(x.share_den.reindex(bizs, fill_value=0).sum())

    return {
        "rolling": rolling,
        "annual": annual,
        "last12": l12,
        "prev12": p12,
        "topExports": top("exp"),
        "topImports": top("imp"),
        "exportShareToPartner": share(l12["exports"], float(world12["exp"])),
        "importShareFromPartner": share(l12["imports"], float(world12["imp"])),
        "partnerRank": rank,
        "partnerJurisdictions": partner_jurisdictions,
        "growthUsmcaToPartner": frac(g_partner),
        "growthUsmcaToWorld": frac(g_world),
        "shareOfPartnerImports": float(f"{num / den:.3g}") if den > 0 else 0.0,
    }


# ---------- checks ----------

def statcan_bc_to_wa(ym: str) -> float:
    """BC domestic exports to Washington, all goods, from StatCan table 12-10-0099 (CAD)."""
    r = requests.post(
        "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods",
        json=[{"productId": 12100099, "coordinate": "11.2.49.1.0.0.0.0.0.0", "latestN": 6}],
        timeout=60,
    )
    r.raise_for_status()
    points = r.json()[0]["object"]["vectorDataPoint"]
    for p in points:
        if p["refPer"].startswith(ym):
            return float(p["value"]) * 10 ** p.get("scalarFactorCode", 3)
    raise RuntimeError(f"Table 12-10-0099 has no value for {ym}")


def run_checks(trade: dict, census: dict, cimt_recent: list[dict], last_ym: str) -> list[str]:
    problems = []
    year = int(last_ym[:4]) - 1
    # 1. HS4 rows add up to the Census total (no double counting).
    for st in US_STATES:
        for flow in ("exp", "imp"):
            df = census[st][f"canada_{flow}"]
            hs_sum = df[df["ym"].str.startswith(f"{year}-")]["value"].sum()
            total = fetch_census.state_total(st, flow, year)
            if total and abs(hs_sum / total - 1) > 0.001:
                problems.append(f"{st} {flow} {year}: HS4 rows {hs_sum:,.0f} ≠ total {total:,.0f}")
    # 2. Close to the Embassy of Canada's WA fact sheet (2025: $7.0B / $16.1B).
    wa = {a["year"]: a for a in trade["WA"]["all"]["annual"]}.get(2025)
    if wa:
        for k, ref in (("exports", 7000), ("imports", 16100)):
            if abs(wa[k] / ref - 1) > 0.03:
                problems.append(f"WA 2025 {k} {wa[k]}M is more than 3% from the Embassy figure {ref}M")
    # 3. CIMT matches StatCan's published table (BC → Washington, latest month).
    ps = pd.concat([c["prov_states"] for c in cimt_recent])
    ours = ps[(ps["flow"] == "exp") & (ps["province"] == "BC") & (ps["state"] == "WA") & (ps["ym"] == last_ym)]["value"].sum()
    try:
        theirs = statcan_bc_to_wa(last_ym)
        if abs(ours / theirs - 1) > 0.005:
            problems.append(f"BC→WA {last_ym}: CIMT {ours:,.0f} vs table 12-10-0099 {theirs:,.0f}")
    except Exception as e:  # network hiccup should not block a release, but say so
        log(f"  (skipped StatCan cross-check: {e})")
    # 4. Sectors add up to the total; no negatives; shares in range.
    from common import taxonomy

    for j, recs in trade.items():
        sector_sum = sum(recs[s["id"]]["last12"]["exports"] for s in taxonomy()["sectors"])
        allx = recs["all"]["last12"]["exports"]
        if allx and abs(sector_sum / allx - 1) > 0.01:
            problems.append(f"{j}: sector exports {sector_sum} do not add up to total {allx}")
        for scope, r in recs.items():
            if any(v < 0 for _, e, i in r["rolling"] for v in (e, i)):
                problems.append(f"{j}/{scope}: negative trade")
            if not 0 <= r["exportShareToPartner"] <= 1:
                problems.append(f"{j}/{scope}: export share out of range")
    return problems


# ---------- main ----------

def main() -> None:
    load_env()
    census_last = fetch_census.latest_month()
    cimt_last = fetch_cimt.latest_month(int(census_last[:4]))
    last_ym = min(census_last, cimt_last)
    last_year = int(last_ym[:4])
    rank_year = last_year - 1 if int(last_ym[5:]) < 12 else last_year
    months = month_list(FIRST_YEAR, last_ym)
    log(f"Latest month: Census {census_last}, StatCan {cimt_last} → using {last_ym}")
    existing = DATA_DIR / "real.json"
    if "--if-new" in sys.argv and existing.exists():
        current = json.loads(existing.read_text())["meta"].get("dataAsOf")
        if current == last_ym:
            log(f"Trade data is already up to date ({current}); nothing to rebuild.")
            return

    fx = fetch_boc.monthly_cad_per_usd(FIRST_YEAR)
    missing_fx = [m for m in months if m not in fx]
    if missing_fx:
        raise SystemExit(f"Missing exchange rates for {missing_fx}")

    census = {st: fetch_census.fetch_state(st, FIRST_YEAR, last_ym) for st in US_STATES}
    for st in census:  # keep only months up to last_ym
        for k in ("canada_exp", "canada_imp", "world_exp", "world_imp"):
            census[st][k] = census[st][k][census[st][k]["ym"] <= last_ym]
    nat_imports = pd.concat([fetch_census.national_imports_hs4(y, latest_year=last_year) for y in (last_year - 1, last_year)])
    for st in census:
        for k in ("world_exp", "world_imp"):
            register_descriptions(census[st][k]["hs4"], census[st][k]["desc"])
    register_descriptions(nat_imports["hs4"], nat_imports["desc"])

    recent_years = {last_year - 1, last_year}
    cimt_all = {
        y: fetch_cimt.aggregate_year(y, detail=y in recent_years, rank=y == rank_year, fresh=y in recent_years)
        for y in range(FIRST_YEAR, last_year + 1)
    }
    cimt_recent = [cimt_all[y] for y in sorted(recent_years)]

    log("Building trade records…")
    trade: dict = {}
    for st in US_STATES:
        x = us_inputs(st, census[st], cimt_recent, fx, months, nat_imports)
        trade[st] = {scope: trade_record(x, bizs, months) for scope, bizs in scopes().items()}
    for prov in PROVINCES:
        x = province_inputs(prov, cimt_all, fx, months, nat_imports, rank_year)
        trade[prov] = {scope: trade_record(x, bizs, months) for scope, bizs in scopes().items()}

    problems = run_checks(trade, census, cimt_recent, last_ym)
    if problems:
        log("DATA CHECKS FAILED — real.json not written:")
        for p in problems:
            log(f"  - {p}")
        sys.exit(1)

    y, m = int(last_ym[:4]), int(last_ym[5:])
    out = {
        "meta": {
            "generatedAt": date.today().isoformat(),
            "dataAsOf": last_ym,
            "dataAsOfLabel": f"{MONTH_ABBR[m - 1]} {y}",
            "sections": {"trade": True},
            "sources": [
                "U.S. Census Bureau, USA Trade / international trade API (state exports and imports by HS code)",
                "Adapted from Statistics Canada, Canadian International Merchandise Trade database (monthly). This does not constitute an endorsement by Statistics Canada of this product.",
                "Bank of Canada, monthly average exchange rates (FXMUSDCAD)",
            ],
        },
        "trade": trade,
    }
    path = DATA_DIR / "real.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    log(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB). All checks passed.")
    wa = {a['year']: a for a in trade['WA']['all']['annual']}[2025]
    log(f"  WA 2025 with Canada: exports ${wa['exports']:,.0f}M, imports ${wa['imports']:,.0f}M")
    log("  Canada's export-market rank: " + ", ".join(f"{s} #{trade[s]['all']['partnerRank']}" for s in US_STATES))


if __name__ == "__main__":
    main()
