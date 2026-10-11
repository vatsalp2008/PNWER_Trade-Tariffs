"""U.S. Census Bureau international trade API: state trade with Canada and the world.

Docs: https://www.census.gov/data/developers/data-sets/international-trade.html
Needs CENSUS_API_KEY (free: https://api.census.gov/data/key_signup.html).
"""

from __future__ import annotations

import os

import pandas as pd

from common import get_json, log

BASE = "https://api.census.gov/data/timeseries/intltrade"
CANADA = "1220"
WORLD = "-"  # "TOTAL FOR ALL COUNTRIES"


def _key() -> str:
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise SystemExit("CENSUS_API_KEY is not set (put it in prototype/.env.local or the environment).")
    return key


def _query(path: str, *, cache: bool = True, **params) -> pd.DataFrame:
    data = get_json(f"{BASE}/{path}", {**params, "key": _key()}, cache=cache)
    if not data:
        return pd.DataFrame()
    df = pd.DataFrame(data[1:], columns=data[0])
    return df.loc[:, ~df.columns.duplicated()]  # filters are echoed back as duplicate columns


def _flow(flow: str) -> tuple[str, str, str]:
    # Exports: state of origin of movement. Imports: state of destination, general imports.
    return ("exports/statehs", "E_COMMODITY", "ALL_VAL_MO") if flow == "exp" else ("imports/statehs", "I_COMMODITY", "GEN_VAL_MO")


def state_monthly_hs4(state: str, flow: str, year: int, country: str, *, latest_year: int) -> pd.DataFrame:
    """Monthly values by HS4 for one state, flow and calendar year. Columns: hs4, ym, value (USD)."""
    path, comm, val = _flow(flow)
    get = f"{comm},{comm}_SDESC,{val}" if country == WORLD else f"{comm},{val}"
    # The current year keeps changing, so never serve it from cache.
    df = _query(path, cache=year < latest_year, get=get, STATE=state, CTY_CODE=country, COMM_LVL="HS4", time=str(year))
    if df.empty:
        return pd.DataFrame(columns=["hs4", "ym", "value", "desc"])
    out = pd.DataFrame({"hs4": df[comm], "ym": df["time"], "value": pd.to_numeric(df[val], errors="coerce").fillna(0)})
    if f"{comm}_SDESC" in df:
        out["desc"] = df[f"{comm}_SDESC"]
    return out


def state_exports_by_country_hs4(state: str, year: int) -> pd.DataFrame:
    """Calendar-year exports by country and HS4 (countries only, no regional aggregates)."""
    df = _query("exports/statehs", get="E_COMMODITY,CTY_CODE,ALL_VAL_YR,SUMMARY_LVL", STATE=state, COMM_LVL="HS4", time=f"{year}-12")
    df = df[(df["SUMMARY_LVL"] == "DET") & (df["CTY_CODE"] != WORLD)]
    return pd.DataFrame({"hs4": df["E_COMMODITY"], "country": df["CTY_CODE"], "value": pd.to_numeric(df["ALL_VAL_YR"], errors="coerce").fillna(0)})


def state_total(state: str, flow: str, year: int, country: str = CANADA) -> float:
    """Calendar-year total with no commodity breakdown (used to check HS4 rows add up)."""
    path = "exports/statehs" if flow == "exp" else "imports/statehs"
    val = "ALL_VAL_YR" if flow == "exp" else "GEN_VAL_YR"
    df = _query(path, get=val, STATE=state, CTY_CODE=country, time=f"{year}-12")
    return float(df[val].iloc[0]) if not df.empty else 0.0


def national_imports_hs4(year: int, *, latest_year: int) -> pd.DataFrame:
    """U.S. general imports from the world by HS4, monthly (for provinces' share of U.S. imports)."""
    df = _query("imports/hs", cache=year < latest_year, get="I_COMMODITY,I_COMMODITY_SDESC,GEN_VAL_MO", CTY_CODE=WORLD, COMM_LVL="HS4", time=str(year))
    if df.empty:
        return pd.DataFrame(columns=["hs4", "ym", "value", "desc"])
    return pd.DataFrame({
        "hs4": df["I_COMMODITY"], "ym": df["time"], "desc": df["I_COMMODITY_SDESC"],
        "value": pd.to_numeric(df["GEN_VAL_MO"], errors="coerce").fillna(0),
    })


def latest_month() -> str:
    """Latest month with state data published (YYYY-MM)."""
    from datetime import date

    today = date.today()
    for back in range(1, 6):
        y, m = today.year, today.month - back
        while m <= 0:
            y, m = y - 1, m + 12
        ym = f"{y}-{m:02d}"
        df = _query("exports/statehs", cache=False, get="ALL_VAL_MO", STATE="WA", CTY_CODE=CANADA, time=ym)
        if not df.empty:
            return ym
    raise RuntimeError("Could not find a recent month of Census state data")


def fetch_state(state: str, first_year: int, last_ym: str) -> dict[str, pd.DataFrame]:
    """Everything the build needs for one U.S. state (requests run in parallel; the API is slow)."""
    from concurrent.futures import ThreadPoolExecutor

    last_year = int(last_ym[:4])
    log(f"Census {state}: trade with Canada {first_year}–{last_ym}")
    world_years = sorted({2019, 2024, last_year - 1, last_year})
    jobs = [("canada", f, y, CANADA) for f in ("exp", "imp") for y in range(first_year, last_year + 1)]
    jobs += [("world", f, y, WORLD) for f in ("exp", "imp") for y in world_years]
    with ThreadPoolExecutor(max_workers=6) as pool:
        frames = list(pool.map(lambda j: state_monthly_hs4(state, j[1], j[2], j[3], latest_year=last_year), jobs))
        rank = state_exports_by_country_hs4(state, last_year - 1)
    out = {"rank": rank}
    for kind in ("canada", "world"):
        for flow in ("exp", "imp"):
            out[f"{kind}_{flow}"] = pd.concat([fr for j, fr in zip(jobs, frames) if j[0] == kind and j[1] == flow])
    return out
