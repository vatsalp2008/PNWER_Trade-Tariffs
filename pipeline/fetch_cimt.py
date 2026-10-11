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

import pandas as pd

from common import CACHE_DIR, PROVINCES, US_STATES, business_of, log, remote_zip

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


def latest_month(year: int) -> str:
    """Latest month present in a year's export file name, e.g. ODPFN018_202608N.csv -> 2026-08."""
    zf = remote_zip(URL.format(kind="Dom_Exp", year=year))
    name = next(n for n in zf.namelist() if MEMBER["Dom_Exp"] in n)
    stamp = name.split("_")[-1][:6]
    return f"{stamp[:4]}-{stamp[4:]}"
