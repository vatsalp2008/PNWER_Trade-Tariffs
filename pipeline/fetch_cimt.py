"""Statistics Canada, Canadian International Merchandise Trade (CIMT) bulk files.

https://www150.statcan.gc.ca/n1/pub/71-607-x/2021004/zip/CIMT-CICM_{Dom_Exp|Imp}_{YYYY}.zip
Province × HS6 × country × U.S. state, monthly, in Canadian dollars. No key needed.
Only the HS6 file is read from each ZIP (via HTTP range requests).

- Domestic exports: province = where goods were produced; state = U.S. destination.
- Imports: province = province of CLEARANCE (not necessarily where goods are used);
  state = U.S. state of origin.

Licence: Statistics Canada Open Licence. Credit "Adapted from Statistics Canada".
"""

from __future__ import annotations

import json

import pandas as pd

from common import CACHE_DIR, DATA_DIR, PROVINCES, US_STATES, business_of, log, remote_zip
from names import OVERRIDES, _tidy

URL = "https://www150.statcan.gc.ca/n1/pub/71-607-x/2021004/zip/CIMT-CICM_{kind}_{year}.zip"
MEMBER = {"Dom_Exp": "ODPFN018", "Imp": "ODPFN015"}  # the HS6 files
COLS = ["ym", "hs6", "country", "province", "state", "value"]


def _biz_lookup(codes: pd.Series) -> pd.Series:
    table = {c: business_of(c) for c in codes.unique()}
    return codes.map(table)


def aggregate_year(year: int, *, detail: bool, rank: bool, fresh: bool) -> dict[str, pd.DataFrame]:
    """Read one year of exports and imports and return compact aggregates (values in CAD).

    detail: also build the province↔state partner tables (only needed for the latest 12 months)
    rank:   also build province exports by country (for the U.S.'s rank among markets)
    fresh:  ignore the on-disk cache (current-year files are revised every month)
    """
    cache = CACHE_DIR / "cimt-agg" / f"{year}-d{int(detail)}-r{int(rank)}"
    names = ["prov", "us_states", "prov_states", "canada_total", "prov_country"]
    if not fresh and all((cache / f"{n}.csv.gz").exists() for n in names):
        return {n: pd.read_csv(cache / f"{n}.csv.gz", dtype={"hs4": str, "ym": str}) for n in names}

    out: dict[str, list[pd.DataFrame]] = {n: [] for n in names}
    for kind, flow in (("Dom_Exp", "exp"), ("Imp", "imp")):
        url = URL.format(kind=kind, year=year)
        zf = remote_zip(url)
        name = next(n for n in zf.namelist() if MEMBER[kind] in n and n.lower().endswith(".csv"))
        log(f"StatCan CIMT {year} {kind}: reading {name.split('/')[-1]} ({zf.getinfo(name).compress_size / 1e6:.0f} MB)")
        with zf.open(name) as f:
            reader = pd.read_csv(
                f, header=0, names=COLS, usecols=range(6), dtype={c: str for c in COLS[:5]},
                encoding="latin-1", chunksize=750_000,
            )
            for chunk in reader:
                chunk["value"] = pd.to_numeric(chunk["value"], errors="coerce").fillna(0)
                chunk["ym"] = chunk["ym"].str[:4] + "-" + chunk["ym"].str[4:6]
                chunk["hs4"] = chunk["hs6"].str.zfill(6).str[:4]
                chunk["biz"] = _biz_lookup(chunk["hs4"])
                chunk["flow"] = flow
                us = chunk["country"] == "US"

                # Our provinces: partner (U.S.) vs world, by HS4 — the main series.
                p = chunk[chunk["province"].isin(PROVINCES)].assign(us=us)
                out["prov"].append(p.groupby(["flow", "province", "ym", "hs4", "us"], as_index=False)["value"].sum())

                if detail:
                    # Trade between our U.S. states and every province (partner bars, shares).
                    s = chunk[us & chunk["state"].isin(US_STATES)]
                    out["us_states"].append(s.groupby(["flow", "state", "province", "ym", "biz"], as_index=False)["value"].sum())
                    # Our provinces with every U.S. state (partner bars).
                    ps = chunk[us & chunk["province"].isin(PROVINCES)]
                    out["prov_states"].append(ps.groupby(["flow", "province", "state", "ym", "biz"], as_index=False)["value"].sum())
                    # Canada's total imports by business (share of Canada's imports from a state).
                    if flow == "imp":
                        out["canada_total"].append(chunk.groupby(["flow", "ym", "biz"], as_index=False)["value"].sum())
                if rank and flow == "exp":
                    pc = chunk[chunk["province"].isin(PROVINCES)]
                    out["prov_country"].append(pc.groupby(["province", "country", "biz"], as_index=False)["value"].sum())

    result = {}
    keys = {
        "prov": ["flow", "province", "ym", "hs4", "us"],
        "us_states": ["flow", "state", "province", "ym", "biz"],
        "prov_states": ["flow", "province", "state", "ym", "biz"],
        "canada_total": ["flow", "ym", "biz"],
        "prov_country": ["province", "country", "biz"],
    }
    cache.mkdir(parents=True, exist_ok=True)
    for n in names:
        df = pd.concat(out[n]).groupby(keys[n], as_index=False)["value"].sum() if out[n] else pd.DataFrame(columns=keys[n] + ["value"])
        df.to_csv(cache / f"{n}.csv.gz", index=False)
        result[n] = df
    return result


def corridor_hs4(year: int, *, need: str) -> pd.DataFrame:
    """Our provinces' trade by HS4 and month with each of our U.S. states, all U.S. states ("US") and all countries ("ALL").

    Columns: flow (exp/imp), province, partner, ym, hs4, value (CAD). Used to explain the corridor alerts: which
    products moved, and whether the province's total for them moved too. Cached per year; a cache without month
    `need` (YYYY-MM) is rebuilt.
    """
    cache = CACHE_DIR / "cimt-agg" / f"{year}-corridor-hs4.csv.gz"
    if cache.exists():
        df = pd.read_csv(cache, dtype={"hs4": str, "ym": str})
        if need in set(df["ym"]):
            return df
    keys = ["flow", "province", "partner", "ym", "hs4"]
    parts = []
    for kind, flow in (("Dom_Exp", "exp"), ("Imp", "imp")):
        zf = remote_zip(URL.format(kind=kind, year=year))
        name = next(n for n in zf.namelist() if MEMBER[kind] in n and n.lower().endswith(".csv"))
        log(f"StatCan CIMT {year} {kind} by product (for the alerts): reading {name.split('/')[-1]} ({zf.getinfo(name).compress_size / 1e6:.0f} MB)")
        with zf.open(name) as f:
            for chunk in pd.read_csv(f, header=0, names=COLS, usecols=range(6), dtype={c: str for c in COLS[:5]},
                                     encoding="latin-1", chunksize=750_000):
                chunk = chunk[chunk["province"].isin(PROVINCES)]
                chunk = chunk.assign(value=pd.to_numeric(chunk["value"], errors="coerce").fillna(0), flow=flow,
                                     ym=chunk["ym"].str[:4] + "-" + chunk["ym"].str[4:6], hs4=chunk["hs6"].str.zfill(6).str[:4])
                us = chunk["country"] == "US"
                for partner, rows in (("ALL", chunk), ("US", chunk[us])):
                    parts.append(rows.groupby(["flow", "province", "ym", "hs4"], as_index=False)["value"].sum().assign(partner=partner))
                states = chunk[us & chunk["state"].isin(US_STATES)].rename(columns={"state": "partner"})
                parts.append(states.groupby(keys, as_index=False)["value"].sum())
    df = pd.concat(parts).groupby(keys, as_index=False)["value"].sum()
    cache.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache, index=False)
    return df


def hs4_names() -> dict[str, str]:
    """Readable product names: the dashboard's own, then hand-written ones."""
    names = dict(OVERRIDES)
    real = json.loads((DATA_DIR / "real.json").read_text())
    for j in real["trade"].values():
        for rec in j.values():
            for p in rec.get("topExports", []) + rec.get("topImports", []):
                names.setdefault(p["hs"], p["name"])
    return names


def statcan_hs4_names(year: int) -> dict[str, str]:
    """Fallback: the English description of the first current 6-digit code in each heading (fixed-width file)."""
    zf = remote_zip(URL.format(kind="Imp", year=year))
    name = next(n for n in zf.namelist() if "HS6MDesc" in n)
    codes, descs = [], []
    with zf.open(name) as f:
        for line in f.read().decode("latin-1").splitlines():
            if line[18:24] == "999912" and line[:4] not in codes:  # still-current descriptions only
                codes.append(line[:4])
                descs.append(line[29:112].strip())
    return {c: _tidy(d) for c, d in zip(codes, descs)}


HS10_MEMBER = "ODPFN014"  # imports by Canadian 10-digit code (the first 8 digits are the tariff item)


def us_imports_hs8(year: int, *, fresh: bool) -> pd.DataFrame:
    """Canada's imports from the U.S. by 8-digit tariff item, for rows touching a PNWER state or province (CAD).

    Columns: ym, hs8, province (of clearance), state (of origin), value. This is what Canada's counter-tariff
    lists are written in, so measures match item by item.
    """
    cache = CACHE_DIR / "cimt-agg" / f"{year}-us-hs8.csv.gz"
    if cache.exists() and not fresh:
        return pd.read_csv(cache, dtype={"hs8": str, "ym": str})
    zf = remote_zip(URL.format(kind="Imp", year=year))
    name = next(n for n in zf.namelist() if HS10_MEMBER in n and n.lower().endswith(".csv"))
    log(f"StatCan CIMT {year} imports by tariff item: reading {name.split('/')[-1]} ({zf.getinfo(name).compress_size / 1e6:.0f} MB)")
    cols = ["ym", "hs10", "country", "province", "state", "value"]
    parts = []
    with zf.open(name) as f:
        for chunk in pd.read_csv(f, header=0, names=cols, usecols=range(6), dtype={c: str for c in cols[:5]},
                                 encoding="latin-1", chunksize=750_000):
            chunk = chunk[chunk["country"] == "US"]
            chunk = chunk.assign(value=pd.to_numeric(chunk["value"], errors="coerce").fillna(0),
                                 ym=chunk["ym"].str[:4] + "-" + chunk["ym"].str[4:6], hs8=chunk["hs10"].str.zfill(10).str[:8])
            # Canada-wide totals (province and state "ALL") to check each list against the value Finance Canada announced.
            parts.append(chunk.groupby(["ym", "hs8"], as_index=False)["value"].sum().assign(province="ALL", state="ALL"))
            ours = chunk[chunk["state"].isin(US_STATES) | chunk["province"].isin(PROVINCES)]
            parts.append(ours.groupby(["ym", "hs8", "province", "state"], as_index=False)["value"].sum())
    keys = ["ym", "hs8", "province", "state"]
    df = pd.concat(parts).groupby(keys, as_index=False)["value"].sum() if parts else pd.DataFrame(columns=keys + ["value"])
    cache.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache, index=False)
    return df


def latest_month(year: int) -> str:
    """Latest month present in a year's export file name, e.g. ODPFN018_202608N.csv -> 2026-08."""
    zf = remote_zip(URL.format(kind="Dom_Exp", year=year))
    name = next(n for n in zf.namelist() if MEMBER["Dom_Exp"] in n)
    stamp = name.split("_")[-1][:6]
    return f"{stamp[:4]}-{stamp[4:]}"
