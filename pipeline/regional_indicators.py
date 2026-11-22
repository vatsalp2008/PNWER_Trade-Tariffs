"""Extra Washington & Idaho data for the /data page, plus the "Across the border" headlines.

Sources (free and official):
- U.S. Census Bureau international trade API: state exports and imports by NAICS industry
  (statenaics), with Canada and the world. Needs CENSUS_API_KEY.
- BTS Border Crossing Entry Data (data.bts.gov, keg4-3bc2): monthly inbound crossings at
  every Washington and Idaho port. No key.
- Statistics Canada table 24-10-0053: Canadian residents returning from the U.S. by car,
  by B.C. port of entry. No key.
- Statistics Canada table 24-10-0057 (daily leading indicator): travellers in Washington-
  and Idaho-plated vehicles entering B.C. No key.
- EIA API v2: natural gas pipeline imports from Canada at Sumas and Eastport (and every other
  entry point, for shares); crude imports processed by Washington refineries; WA/ID gas prices.
  Needs EIA_API_KEY (free).
- Canada Energy Regulator open data: electricity trade by province and state; natural gas
  exports by port (a cross-check on EIA). No key.
- BLS QCEW county files: jobs and wages in retail, accommodation and food services in the six
  border counties. No key.
- BEA, Activities of U.S. affiliates (2024): property, plant and equipment and manufacturing
  jobs of Canadian-owned companies (tables II.C9 and II.G13). No key.

Writes prototype/public/data/regional/{latest.json, versions/<id>/dataset.json} and
prototype/src/data/regional-headlines.json, only when every check passes. A source that
can't be reached keeps the current files (a warning, not a failure); a failed check stops
the run with an error.

    python pipeline/regional_indicators.py
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import sys
import time

import pandas as pd
import requests

import fetch_census
import fetch_economy
from common import DATA_DIR, ROOT, get_json, log, statcan_points
from provincial_trade import atomic_write, digest, dumps

OUT_DIR = ROOT / "prototype" / "public" / "data" / "regional"
HEADLINES = DATA_DIR / "regional-headlines.json"
STATES = {"WA": "Washington", "ID": "Idaho"}
MONTHS = 36

BTS = "https://data.bts.gov/resource/keg4-3bc2.json"

# B.C. ports of entry (table 24-10-0053 member ids) and the U.S. port across from each.
BC_PORTS = {
    274: ("Pacific Highway", "WA", "Blaine"),
    273: ("Douglas", "WA", "Blaine, Peace Arch"),
    272: ("Boundary Bay", "WA", "Point Roberts"),
    271: ("Aldergrove", "WA", "Lynden"),
    270: ("Abbotsford/Huntingdon", "WA", "Sumas"),
    267: ("Osoyoos", "WA", "Oroville"),
    263: ("Chopaka", "WA", "Nighthawk"),
    261: ("Carson", "WA", "Danville"),
    262: ("Cascade", "WA", "Laurier"),
    266: ("Midway", "WA", "Ferry"),
    251: ("Paterson", "WA", "Frontier"),
    254: ("Waneta", "WA", "Boundary"),
    250: ("Nelway", "WA", "Metaline Falls"),
    249: ("Kingsgate", "ID", "Eastport"),
    253: ("Rykerts", "ID", "Porthill"),
}
BC_TOTAL = 246  # British Columbia, all ports (24-10-0053)
# Census's wording for code 980 describes the export side only; it covers returned goods both ways.
NAICS_LABELS = {"980": "Returned goods"}
RETURNING_BY_CAR = 47  # Canadian residents returning from the U.S., land, automobile
PLATES = {"WA": 48, "ID": 13}  # 24-10-0057 licence-plate members
BC_GEO_0057 = 133

EIA = "https://api.eia.gov/v2/"
CER = "https://www.cer-rec.gc.ca/open/imports-exports/"
# EIA entry points (and the B.C. port across, as the Canada Energy Regulator names it).
GAS_PORTS = {"YSUMS-NCA": ("Sumas", "WA", "Huntingdon"), "YEPRT-NCA": ("Eastport", "ID", "Kingsgate")}
GAS_PRICES = {"N3050": "citygate", "N3010": "residential"}  # + state + "3", $/thousand cubic feet
COUNTIES = {
    "53073": ("Whatcom", "WA"), "53047": ("Okanogan", "WA"), "53063": ("Spokane", "WA"),
    "16021": ("Boundary", "ID"), "16017": ("Bonner", "ID"), "16055": ("Kootenai", "ID"),
}
COUNTY_INDUSTRIES = {"10": "All private jobs", "44-45": "Retail", "721": "Accommodation", "722": "Food services and drinking places"}
BEA_TABLES = {  # (workbook, cache name, sheet, unit multiplier)
    "ppe": ("2024p-PartII-C1-C17.xls", "bea-mne-2024p-C.xls", "II.C9", 1e6),
    "mfgJobs": ("2024p-PartII-G1-G16.xls", "bea-mne-2024p.xls", "II.G13", 1e3),
    "jobs": ("2024p-PartII-G1-G16.xls", "bea-mne-2024p.xls", "II.G8", 1e3),
}

SOURCES = {
    "trade": "U.S. Census Bureau, international trade API: state exports and imports by NAICS industry (statenaics)",
    "crossings": "Bureau of Transportation Statistics, Border Crossing Entry Data (from U.S. Customs and Border Protection)",
    "travellers": "Adapted from Statistics Canada, table 24-10-0053-01. This does not constitute an endorsement by Statistics Canada of this product.",
    "plates": "Adapted from Statistics Canada, table 24-10-0057-01 (leading indicator; preliminary). This does not constitute an endorsement by Statistics Canada of this product.",
    "energy": "U.S. Energy Information Administration (natural gas imports by point of entry, crude oil imports by refinery state, natural gas prices); Canada Energy Regulator (electricity trade, natural gas exports by port), Open Government Licence – Canada",
    "counties": "U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages (county files)",
    "ownership": "U.S. Bureau of Economic Analysis, Activities of U.S. Affiliates of Foreign Multinational Enterprises, preliminary 2024 (tables II.C9, II.G8, II.G13)",
}


# ---------- small helpers ----------

def month_window(last: str, n: int = MONTHS) -> list[str]:
    """The n months ending at `last` (YYYY-MM), oldest first."""
    y, m = int(last[:4]), int(last[5:])
    out = []
    for k in range(n - 1, -1, -1):
        mm = m - 1 - k
        out.append(f"{y + mm // 12}-{mm % 12 + 1:02d}")
    return out


def same_month_earlier(month: str, years: int) -> str:
    return f"{int(month[:4]) - years}{month[4:]}"


def change(now: float | None, then: float | None) -> float | None:
    return None if now is None or not then else now / then - 1


def r4(x: float | None) -> float | None:
    return None if x is None else round(x, 4)


def sentence_case(label: str) -> str:
    """Census labels are upper case: 'FORESTRY PRODUCTS, NESOI' -> 'Forestry products'."""
    s = re.sub(r",?\s*NESOI\b", "", label.strip()).capitalize()  # NESOI = "not elsewhere specified or included"
    for word, fixed in (("u.s.", "U.S."), ("canada", "Canada"), ("united states", "United States"), (" mfg", " manufacturing")):
        s = s.replace(word, fixed)
    return s


def check(name: str, problems: list[str], detail: str) -> dict:
    return {"name": name, "passed": not problems, "detail": detail if not problems else "; ".join(problems[:5])}


# ---------- 1. trade by industry (Census statenaics) ----------

def fetch_trade(last: str) -> dict:
    months = month_window(last)
    span = f"from {months[0]} to {months[-1]}"
    series: dict[str, list[float]] = {}
    labels: dict[str, str] = {}
    totals: dict[str, list[float]] = {}
    for st in STATES:
        for flow, path, val in (("exp", "statenaics", "ALL_VAL_MO"), ("imp", "statenaics", "GEN_VAL_MO")):
            direction = "exports" if flow == "exp" else "imports"
            for partner, code in (("canada", fetch_census.CANADA), ("world", fetch_census.WORLD)):
                df = fetch_census._query(f"{direction}/{path}", cache=False, get=f"NAICS,NAICS_SDESC,{val}",
                                         STATE=st, CTY_CODE=code, COMM_LVL="NA3", time=span)
                tot = fetch_census._query(f"{direction}/statehs", cache=False, get=val, STATE=st, CTY_CODE=code, time=span)
                totals[f"{st}|{flow}|{partner}"] = [
                    float(tot.loc[tot["time"] == m, val].iloc[0]) if (tot["time"] == m).any() else float("nan") for m in months
                ]
                for naics, grp in df.groupby("NAICS"):
                    labels[naics] = NAICS_LABELS.get(naics) or sentence_case(grp["NAICS_SDESC"].iloc[0])
                    by_month = dict(zip(grp["time"], grp[val].astype(float)))
                    # Census lists only non-zero cells, so a month missing for an industry is a real zero.
                    series[f"{st}|{flow}|{partner}|{naics}"] = [by_month.get(m, 0.0) for m in months]
    return {"months": months, "industries": dict(sorted(labels.items())), "series": series, "totals": totals}


def check_trade(trade: dict, dashboard: dict) -> list[dict]:
    months = trade["months"]
    missing, mismatch, dash = [], [], []
    for key, tot in trade["totals"].items():
        if any(t != t for t in tot):  # NaN: Census had no total for a month
            missing.append(key)
            continue
        parts = [v for k, v in trade["series"].items() if k.startswith(key + "|")]
        for i, m in enumerate(months):
            s = sum(p[i] for p in parts)
            if abs(s - tot[i]) > 1:
                mismatch.append(f"{key} {m}: industries {s:,.0f} vs total {tot[i]:,.0f}")
    for st in STATES:
        for flow, field in (("exp", "exports"), ("imp", "imports")):
            ours = sum(trade["totals"][f"{st}|{flow}|canada"][-12:]) / 1e6
            theirs = dashboard[st]["all"]["last12"][field]
            # Dashboard totals are stored to 3 significant figures.
            if abs(ours / theirs - 1) > 0.006:
                dash.append(f"{st} {field}: {ours:,.0f}M vs dashboard {theirs:,.0f}M")
    return [
        check("Every month has an official Census total", missing, f"{len(trade['totals'])} state/flow/partner series × {len(months)} months"),
        check("Industries add up to the Census total, every month", mismatch, "Sum of NAICS 3-digit industries equals the state total to the dollar"),
        check("Last-12-month totals with Canada match the dashboard", dash, "Within 0.6% (dashboard figures are rounded to 3 significant figures)"),
    ]


# ---------- 2. U.S. border crossings (BTS) ----------

def fetch_crossings() -> dict:
    rows = get_json(BTS, {
        "$select": "port_name,port_code,state,measure,date,value",
        "$where": "state in('Washington','Idaho') AND date >= '2019-01-01T00:00:00'",
        "$limit": 50000,
    }, cache=False)
    last = max(r["date"][:7] for r in rows)
    months = month_window(last)
    keep = set(months) | {same_month_earlier(m, k) for m in months[-12:] for k in (1, 2, 5, 6, 7)}
    abbr = {"Washington": "WA", "Idaho": "ID"}
    ports: dict[str, dict] = {}
    values: dict[str, dict[str, float]] = {}
    for r in rows:
        ym = r["date"][:7]
        ports[r["port_code"]] = {"name": r["port_name"].replace("Kenneth G Ward", "Lynden (Kenneth G. Ward)"), "state": abbr[r["state"]]}
        if ym in keep:
            values.setdefault(f"{r['port_code']}|{r['measure']}", {})[ym] = float(r["value"])
    all_months = sorted(keep)
    series = {k: [v.get(m) for m in all_months] for k, v in sorted(values.items())}
    return {"months": all_months, "lastMonth": last, "ports": dict(sorted(ports.items())), "series": series}


def check_crossings(c: dict) -> list[dict]:
    i = c["months"].index(c["lastMonth"])
    missing = [p for p in ("3004", "3009", "3302") if (c["series"].get(f"{p}|Trucks") or [None] * len(c["months"]))[i] is None]
    neg = [k for k, s in c["series"].items() if any(v is not None and v < 0 for v in s)]
    odd = []
    for code in c["ports"]:
        veh, pas = c["series"].get(f"{code}|Personal Vehicles"), c["series"].get(f"{code}|Personal Vehicle Passengers")
        if veh and pas:
            odd += [f"{c['ports'][code]['name']} {m}" for m, v, p in zip(c["months"], veh, pas) if v and p is not None and p < v]
    return [
        check("Latest month present at Blaine, Sumas and Eastport", missing, f"Latest month {c['lastMonth']}"),
        check("No negative crossing counts", neg, f"{len(c['series'])} port × measure series"),
        check("Passengers are never fewer than vehicles", odd, "Personal-vehicle passengers ≥ personal vehicles at every port and month"),
    ]


# ---------- 3. Canadian residents returning by car, by B.C. port (StatCan 24-10-0053) ----------

def fetch_travellers() -> dict:
    coords = {f"{g}.{RETURNING_BY_CAR}.1.0.0.0.0.0.0.0": g for g in [*BC_PORTS, BC_TOTAL]}
    pts = statcan_points(24100053, list(coords), latest_n=MONTHS + 36)
    last = max(p[0][:7] for s in pts.values() for p in s)
    months = sorted({p[0][:7] for s in pts.values() for p in s})
    series = {}
    for coord, g in coords.items():
        by = {p[0][:7]: p[1] for p in pts.get(coord, [])}
        series[str(g)] = [by.get(m) for m in months]
    ports = {str(g): {"name": n, "facing": st, "usPort": us} for g, (n, st, us) in BC_PORTS.items()}
    return {"months": months, "lastMonth": last, "ports": ports, "bcTotal": str(BC_TOTAL), "series": series}


def check_travellers(t: dict) -> list[dict]:
    i = t["months"].index(t["lastMonth"])
    missing = [t["ports"][g]["name"] for g in ("273", "274", "249") if t["series"][g][i] is None]
    over = [m for k, m in enumerate(t["months"])
            if t["series"][t["bcTotal"]][k] is not None
            and sum(t["series"][g][k] or 0 for g in t["ports"]) > t["series"][t["bcTotal"]][k]]
    return [
        check("Latest month present at Douglas, Pacific Highway and Kingsgate", missing, f"Latest month {t['lastMonth']}"),
        check("Ports facing WA and ID never exceed the B.C. total", over, "Sum of the 15 ports ≤ all B.C. ports, every month"),
    ]


# ---------- 4. WA/ID-plated vehicles entering B.C. (StatCan 24-10-0057, daily) ----------

def fetch_plates() -> dict:
    coords = {f"{BC_GEO_0057}.{plate}.4.4.3.0.0.0.0.0": st for st, plate in PLATES.items()}
    pts = statcan_points(24100057, list(coords), latest_n=MONTHS * 31 + 400)
    last_day = max(p[0] for s in pts.values() for p in s)
    monthly: dict[str, dict[str, list[float]]] = {}
    for coord, st in coords.items():
        for day, v in pts.get(coord, []):
            if v is not None:
                monthly.setdefault(st, {}).setdefault(day[:7], []).append(v)
    months = month_window(last_day[:7])
    series = {st: [sum(monthly.get(st, {}).get(m, [])) if monthly.get(st, {}).get(m) else None for m in months] for st in STATES}
    days = {m: max(len(monthly.get(st, {}).get(m, [])) for st in STATES) for m in months}
    return {"months": months, "lastDay": last_day[:10], "series": series, "days": days}


def check_plates(p: dict) -> list[dict]:
    short = [m for m in p["months"][:-1] if p["days"][m] < 28]
    return [check("Every complete month has daily counts for every day", short, f"Daily data through {p['lastDay']}")]


# ---------- 5. energy (EIA, Canada Energy Regulator) ----------

def eia(route: str, params: dict) -> list[dict]:
    key = os.environ.get("EIA_API_KEY")
    if not key:
        raise SystemExit("EIA_API_KEY is not set (free: https://www.eia.gov/opendata/register.php).")
    for attempt in range(4):
        try:
            r = requests.get(EIA + route, params={**params, "api_key": key, "length": 5000}, timeout=120)
            r.raise_for_status()
            return r.json()["response"]["data"]
        except requests.RequestException as e:
            if attempt == 3:  # never echo the request URL: it contains the key
                raise requests.RequestException(f"EIA {route}: {type(e).__name__}") from None
            time.sleep(5 * 2**attempt)
    return []


def cer_csv(name: str) -> pd.DataFrame:
    r = requests.get(CER + name, timeout=120)
    r.raise_for_status()
    df = pd.read_csv(io.BytesIO(r.content), encoding="latin-1")
    df["month"] = pd.to_datetime(df["Period"], format="%m/%d/%Y").dt.strftime("%Y-%m")
    for col in [c for c in df.columns if "(" in c]:  # unit columns, e.g. "Value (US$)"; some arrive as text
        df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", ""), errors="coerce")
    return df


def fetch_energy(fx: dict[str, float]) -> dict:
    # Natural gas pipeline imports from Canada, every entry point (for Sumas, Eastport and the U.S. total).
    gas = eia("natural-gas/move/poe1/data/", {"frequency": "monthly", "data[]": "value", "facets[process][]": ["IRP", "PRP"], "start": "2022-01"})
    gas = [g for g in gas if g["series"].endswith("NCA_2") or g["series"].endswith("NCA_3")]
    last = max(g["period"] for g in gas if g["duoarea"] in GAS_PORTS)
    months = month_window(last)
    vol = {g["duoarea"]: {} for g in gas}
    price: dict[str, dict] = {d: {} for d in GAS_PORTS}
    for g in gas:
        if g["value"] is None:
            continue
        if g["series"].endswith("_2"):
            vol[g["duoarea"]][g["period"]] = float(g["value"])
        elif g["duoarea"] in GAS_PORTS:
            price[g["duoarea"]][g["period"]] = float(g["value"])
    entry_points = [d for d in vol if not d.startswith("NUS")]
    us_total = [sum(vol[d].get(m, 0.0) for d in entry_points) for m in months]
    # CER: the same gas leaving Canada at Huntingdon and Kingsgate (US$ value; a cross-check on EIA volumes).
    cer_gas = cer_csv("natural-gas-exports-monthly.csv")
    cer_gas = cer_gas[cer_gas["Flow"] == "Exports"]
    cer = {}
    for d, (_, _, bc_port) in GAS_PORTS.items():
        sel = cer_gas[cer_gas["Port"] == bc_port].groupby("month")[["Volume (MCF)", "Value (US$)"]].sum()
        cer[d] = {"mmcf": [round(sel["Volume (MCF)"].get(m) / 1e3, 1) if m in sel.index else None for m in months],
                  "usd": [round(sel["Value (US$)"].get(m)) if m in sel.index else None for m in months]}
    # Crude oil imports processed by Washington refineries: from Canada and from everywhere.
    crude = eia("crude-oil-imports/data/", {"frequency": "monthly", "data[]": "quantity", "facets[destinationId][]": "RS_WA",
                                            "facets[originId][]": ["CTY_CA", "WORLD"], "start": months[0]})
    kbbl: dict[str, dict[str, float]] = {"canada": {}, "world": {}}
    for c in crude:
        side = "canada" if c["originId"] == "CTY_CA" else "world"
        kbbl[side][c["period"]] = kbbl[side].get(c["period"], 0.0) + float(c["quantity"])  # summed over crude grades
    crude_months = month_window(max(kbbl["world"]))
    # Natural gas prices paid by utilities (citygate) and homes (residential).
    series = [f"{code}{st}3" for code in GAS_PRICES for st in STATES]
    prices = eia("natural-gas/pri/sum/data/", {"frequency": "monthly", "data[]": "value", "facets[series][]": series, "start": months[0]})
    gas_prices: dict[str, dict[str, float]] = {}
    for x in prices:
        if x["value"] is not None:
            gas_prices.setdefault(f"{x['series'][5:7]}|{GAS_PRICES[x['series'][:5]]}", {})[x["period"]] = float(x["value"])
    # Electricity trade with Canada (CER reports from Canada's side: exports = Canada -> state).
    el = cer_csv("electricity-exports-and-imports-monthly.csv")
    names = {"Washington": "WA", "Idaho": "ID"}
    el_last = el["month"].max()
    el_months = month_window(el_last)
    electricity: dict[str, list] = {}
    for st_name, st in names.items():
        for key, sel in (("fromCanada", el[(el["Activity"] == "Exports") & (el["Destination"] == st_name) & (el["Source"] != "Total")]),
                         ("toCanada", el[(el["Activity"] == "Imports") & (el["Source"] == st_name) & (el["Destination"] != "Total")])):
            g = sel.groupby("month")[["Energy (MW.h)", "Total Value (CAN$)"]].sum()
            electricity[f"{st}|{key}|mwh"] = [float(g["Energy (MW.h)"].get(m, 0.0)) for m in el_months]
            electricity[f"{st}|{key}|usd"] = [round(float(g["Total Value (CAN$)"].get(m, 0.0)) / fx[m]) if m in fx else None for m in el_months]
    return {
        "gas": {"months": months, "lastMonth": last, "ports": {d: {"name": n, "state": st, "bcPort": bc} for d, (n, st, bc) in GAS_PORTS.items()},
                "mmcf": {d: [vol[d].get(m) for m in months] for d in GAS_PORTS}, "price": {d: [price[d].get(m) for m in months] for d in GAS_PORTS},
                "usTotalMmcf": us_total, "cer": cer},
        "crude": {"months": crude_months, "lastMonth": crude_months[-1],
                  "kbbl": {side: [kbbl[side].get(m) for m in crude_months] for side in kbbl}},
        "gasPrices": {"months": months, "series": {k: [v.get(m) for m in months] for k, v in sorted(gas_prices.items())}},
        "electricity": {"months": el_months, "lastMonth": el_last, "series": electricity},
    }


def check_energy(e: dict) -> list[dict]:
    g, c = e["gas"], e["crude"]
    missing = [g["ports"][d]["name"] for d in GAS_PORTS if g["mmcf"][d][-1] is None]
    gap = []
    for d in GAS_PORTS:  # EIA (entering the U.S.) vs CER (leaving Canada), last 12 months both report
        pairs = [(a, b) for a, b in zip(g["mmcf"][d][-13:], g["cer"][d]["mmcf"][-13:]) if a is not None and b is not None][-12:]
        eia_sum, cer_sum = sum(a for a, _ in pairs), sum(b for _, b in pairs)
        if len(pairs) < 12 or abs(eia_sum / cer_sum - 1) > 0.05:
            gap.append(f"{g['ports'][d]['name']}: EIA {eia_sum:,.0f} vs CER {cer_sum:,.0f} MMcf over {len(pairs)} months")
    over = [m for m, ca, w in zip(c["months"], c["kbbl"]["canada"], c["kbbl"]["world"]) if ca is not None and (w is None or ca > w + 0.5)]
    neg = [k for k, s in e["electricity"]["series"].items() if any(v is not None and v < 0 for v in s)]
    return [
        check("Latest gas imports present at Sumas and Eastport", missing, f"Latest month {g['lastMonth']}"),
        check("EIA and Canada Energy Regulator gas volumes agree", gap, "Sumas vs Huntingdon and Eastport vs Kingsgate within 5% over 12 months"),
        check("Canadian crude never exceeds all imported crude", over, f"Washington refineries, through {c['lastMonth']}"),
        check("No negative electricity trade", neg, f"Through {e['electricity']['lastMonth']}"),
    ]


# ---------- 6. border-county jobs (BLS QCEW) ----------

def fetch_counties() -> dict:
    year, q = time.gmtime().tm_year, 4
    latest = None
    for y in (year, year - 1):  # newest quarter that BLS has published
        for qq in (4, 3, 2, 1):
            if requests.head(f"https://data.bls.gov/cew/data/api/{y}/{qq}/area/53073.csv", timeout=60).status_code == 200:
                latest = (y, qq)
                break
        if latest:
            break
    year, q = latest
    quarters = []
    for k in range(9):  # latest quarter back to the same quarter two years earlier
        qq = (q - 1 - k) % 4 + 1
        yy = year + (q - 1 - k) // 4
        quarters.insert(0, (yy, qq))
    jobs: dict[str, list] = {}
    wages: dict[str, list] = {}
    for fips in COUNTIES:
        for yy, qq in quarters:
            name = f"qcew-{yy}-q{qq}-{fips}.csv"
            fresh = (yy, qq) >= quarters[-4]  # BLS revises recent quarters
            df = pd.read_csv(io.BytesIO(fetch_economy._download(f"https://data.bls.gov/cew/data/api/{yy}/{qq}/area/{fips}.csv", name, fresh=fresh)),
                             dtype={"industry_code": str, "own_code": str, "disclosure_code": str})
            df = df[(df["own_code"] == "5") & df["industry_code"].isin(COUNTY_INDUSTRIES)].set_index("industry_code")
            for ind in COUNTY_INDUSTRIES:
                ok = ind in df.index and str(df.loc[ind, "disclosure_code"]).strip() != "N"
                jobs.setdefault(f"{fips}|{ind}", []).append(float(df.loc[ind, "month3_emplvl"]) if ok else None)
                wages.setdefault(f"{fips}|{ind}", []).append(float(df.loc[ind, "avg_wkly_wage"]) if ok else None)
    return {"quarters": [f"{yy}-Q{qq}" for yy, qq in quarters], "counties": {f: {"name": n, "state": st} for f, (n, st) in COUNTIES.items()},
            "industries": COUNTY_INDUSTRIES, "jobs": jobs, "wages": wages}


def check_counties(c: dict) -> list[dict]:
    missing = [c["counties"][f]["name"] for f in COUNTIES if c["jobs"][f"{f}|10"][-1] is None]
    over = []
    for f in COUNTIES:
        total = c["jobs"][f"{f}|10"]
        for ind in ("44-45", "721", "722"):
            over += [f"{c['counties'][f]['name']} {ind} {q}" for q, v, t in zip(c["quarters"], c["jobs"][f"{f}|{ind}"], total) if v is not None and t is not None and v > t]
    return [
        check("Latest quarter present for all six border counties", missing, f"Latest quarter {c['quarters'][-1]}"),
        check("Industry jobs never exceed all private jobs", over, "Retail, accommodation and food services ≤ the county's private total"),
    ]


# ---------- 7. Canadian-owned companies (BEA) ----------

def fetch_ownership() -> dict:
    import xlrd

    out: dict[str, dict] = {st: {} for st in STATES}
    for field, (book, cache, sheet, unit) in BEA_TABLES.items():
        wb = xlrd.open_workbook(file_contents=fetch_economy._download(f"https://www.bea.gov/sites/default/files/2026-07/{book}", cache))
        sh = wb.sheet_by_name(sheet)
        cols = {str(sh.cell_value(r, c)).strip(): c for r in range(3, 7) for c in range(sh.ncols)}
        for r in range(sh.nrows):
            name = str(sh.cell_value(r, 0)).strip()
            st = next((k for k, v in STATES.items() if v == name), None)
            if st:
                val = lambda c: float(sh.cell_value(r, c)) * unit if isinstance(sh.cell_value(r, c), (int, float)) else None  # "(D)" = withheld
                out[st][f"{field}Canada"] = val(cols["Canada"])
                out[st][f"{field}All"] = val(cols["All countries"])
    return {"year": 2024, "states": out}


def check_ownership(o: dict) -> list[dict]:
    bad = [f"{st} {k}" for st, v in o["states"].items() for k in ("ppe", "mfgJobs", "jobs")
           if v.get(f"{k}Canada") is not None and v.get(f"{k}All") is not None and v[f"{k}Canada"] > v[f"{k}All"]]
    missing = [st for st, v in o["states"].items() if v.get("ppeCanada") is None]
    return [check("Canadian-owned figures never exceed all foreign-owned figures", bad + [f"{m} withheld" for m in missing], "BEA 2024, Washington and Idaho")]


# ---------- headlines for the dashboard and fact sheets ----------

def headlines(d: dict) -> dict:
    """Up to three indicators per state, most important first; fact sheets show the first two.

    kind "change": vs the same month two years earlier (before most tariffs). kind "share": a part of a whole.
    """
    out: dict[str, list[dict]] = {}
    t, c, e = d["travellers"], d["crossings"], d.get("energy")
    for st, name in STATES.items():
        items = []
        # Canadians driving home through the B.C. crossings facing this state.
        ports = [g for g, p in t["ports"].items() if p["facing"] == st]
        i, j = t["months"].index(t["lastMonth"]), t["months"].index(same_month_earlier(t["lastMonth"], 2))
        now = sum(t["series"][g][i] or 0 for g in ports)
        then = sum(t["series"][g][j] or 0 for g in ports)
        crossings = " and ".join(t["ports"][g]["name"] for g in ports) if len(ports) <= 2 else f"the {len(ports)} B.C. crossings facing {name}"
        items.append({"kind": "change", "change": r4(change(now, then)), "value": now, "month": t["lastMonth"], "baseMonth": t["months"][j],
                      "text": f"Canadians driving home through {crossings}", "source": "Statistics Canada, table 24-10-0053"})
        # Energy: Washington's refineries run on Canadian crude; Idaho's Eastport is the main door for Canadian gas.
        if e and st == "WA":
            ca, world = e["crude"]["kbbl"]["canada"][-1], e["crude"]["kbbl"]["world"][-1]
            if ca is not None and world:
                items.append({"kind": "share", "share": round(ca / world, 4), "value": ca, "month": e["crude"]["lastMonth"], "period": "month",
                              "text": "of Washington refineries' foreign crude oil came from Canada",
                              "source": "U.S. Energy Information Administration, crude oil imports"})
        if e and st == "ID":
            port = next(k for k, v in e["gas"]["ports"].items() if v["state"] == st)
            ours, total = sum(v or 0 for v in e["gas"]["mmcf"][port][-12:]), sum(e["gas"]["usTotalMmcf"][-12:])
            if total:
                items.append({"kind": "share", "share": round(ours / total, 4), "value": ours, "month": e["gas"]["lastMonth"], "period": "12 months",
                              "text": "of Canadian natural gas piped into the U.S. came in at Eastport",
                              "source": "U.S. Energy Information Administration, natural gas imports by point of entry"})
        # Trucks entering the state from Canada.
        k, b = c["months"].index(c["lastMonth"]), c["months"].index(same_month_earlier(c["lastMonth"], 2))
        trucks = [s for key, s in c["series"].items() if key.endswith("|Trucks") and c["ports"][key.split("|")[0]]["state"] == st]
        now = sum(s[k] or 0 for s in trucks)
        then = sum(s[b] or 0 for s in trucks)
        items.append({"kind": "change", "change": r4(change(now, then)), "value": now, "month": c["lastMonth"], "baseMonth": c["months"][b],
                      "text": f"Trucks entering {name} from Canada", "source": "U.S. Bureau of Transportation Statistics, Border Crossing Entry Data"})
        out[st] = items
    return out


# ---------- publish ----------

def publish(dataset: dict, quality: dict, heads: dict) -> bool:
    content = dumps(dataset).encode()
    version = digest(content)[:20]
    current = OUT_DIR / "latest.json"
    head_bytes = (json.dumps({"version": version, "states": heads}, indent=1, ensure_ascii=False) + "\n").encode()
    if current.exists() and json.loads(current.read_text()).get("version") == version:
        if not HEADLINES.exists() or HEADLINES.read_bytes() != head_bytes:  # wording changed, data didn't
            atomic_write(HEADLINES, head_bytes)
            log("Regional data unchanged; headlines rewritten.")
        else:
            log("Regional data unchanged; nothing to publish.")
        return False
    vdir = OUT_DIR / "versions" / version
    vdir.mkdir(parents=True, exist_ok=True)
    atomic_write(vdir / "dataset.json", content)
    manifest = {
        "schemaVersion": 1, "version": version, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "files": {"dataset.json": digest(content)}, "quality": quality,
    }
    atomic_write(current, (json.dumps(manifest, indent=1) + "\n").encode())
    for old in (OUT_DIR / "versions").iterdir():  # keep only the published version
        if old.name != version:
            shutil.rmtree(old)
    atomic_write(HEADLINES, head_bytes)
    log(f"Published regional data version {version}.")
    return True


def main() -> None:
    from build import load_env

    load_env()
    dashboard = json.loads((DATA_DIR / "real.json").read_text())
    try:
        trade = fetch_trade(dashboard["meta"]["dataAsOf"])
        crossings = fetch_crossings()
        travellers = fetch_travellers()
        plates = fetch_plates()
        energy = fetch_energy(dashboard["meta"]["fx"])
        counties = fetch_counties()
        ownership = fetch_ownership()
    except (requests.RequestException, RuntimeError) as e:
        log(f"::warning::Couldn't reach a regional data source ({e}); keeping the current files.")
        return
    checks = (check_trade(trade, dashboard["trade"]) + check_crossings(crossings) + check_travellers(travellers) + check_plates(plates)
              + check_energy(energy) + check_counties(counties) + check_ownership(ownership))
    for c in checks:
        log(f"  {'✓' if c['passed'] else '✗'} {c['name']}: {c['detail']}")
    if not all(c["passed"] for c in checks):
        sys.exit("Regional data checks failed; nothing published.")
    dataset = {
        "schemaVersion": 1,
        "states": STATES,
        "sources": SOURCES,
        "trade": {k: trade[k] for k in ("months", "industries", "series")},
        "crossings": crossings,
        "travellers": travellers,
        "plates": plates,
        "energy": energy,
        "counties": counties,
        "ownership": ownership,
    }
    heads = headlines(dataset)
    publish(dataset, {"passed": True, "checks": checks}, heads)
    for st, items in heads.items():
        for h in items:
            figure = f"{h['share']:.0%} share" if h["kind"] == "share" else f"{h['change']:+.1%} vs {h['baseMonth']}"
            log(f"  {st}: {h['text']}: {h['value']:,.0f} in {h['month']} ({figure})")


if __name__ == "__main__":
    main()
