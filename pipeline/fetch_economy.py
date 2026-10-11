"""Economy data: jobs, GDP, population, households, employment rate, prices,
and jobs at partner-owned companies, for the 10 jurisdictions.

U.S. (no key except ACS households, which uses CENSUS_API_KEY):
  - BLS QCEW open data: jobs by state and industry (annual averages)
  - BEA bulk files SAGDP2 (GDP by state and industry) and SAINC1 (population)
  - BLS API v2 (no key, 25 requests/day): LAUS employment-population ratio; import price index, Canada
  - BEA, U.S. affiliates of foreign multinationals, Table II.G 8 (employment by state × country)
  - Census ACS 1-year: households
Canada (no key): Statistics Canada tables
  - 36-10-0713 jobs and nominal value added by industry (provinces and territories)
  - 14-10-0464 employment rate; 17-10-0005 population; 17-10-0159 households
  - 36-10-0620 jobs at foreign multinationals; 18-10-0004 consumer price index
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from functools import lru_cache

import pandas as pd

from common import CACHE_DIR, PROVINCES, SESSION, US_STATES, get_json, log

FIPS = {"WA": "53", "OR": "41", "ID": "16", "MT": "30", "AK": "02"}
PROV_NAMES = {"BC": "British Columbia", "AB": "Alberta", "SK": "Saskatchewan", "YT": "Yukon", "NT": "Northwest Territories"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (PNWER trade explorer student project)"}


def _download(url: str, name: str, *, fresh: bool = False) -> bytes:
    path = CACHE_DIR / "econ" / name
    if path.exists() and not fresh:
        return path.read_bytes()
    r = SESSION.get(url, timeout=300, headers=BROWSER_UA)
    r.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    return r.content


# ---------- generic NAICS-list evaluation ----------

def eval_codes(codes: list[str], lookup) -> tuple[float | None, bool]:
    """Sum industries in `codes` using lookup(code) -> value or None (confidential).

    '-code' subtracts; 'a|b' uses b when a is confidential. Returns (total, partial),
    where partial means some industries were not published.
    """
    total, partial, any_value = 0.0, False, False
    for raw in codes:
        sign = -1 if raw.startswith("-") else 1
        options = raw.lstrip("-").split("|")
        val = None
        for code in options:
            val = lookup(code)
            if val is not None:
                break
        if val is None:
            partial = True
            continue
        total += sign * val
        any_value = True
    return (max(total, 0.0) if any_value else None), partial


# ---------- U.S. ----------

@lru_cache(maxsize=None)
def qcew(state: str, year: int) -> pd.DataFrame:
    """Annual-average private employment and wages by industry for one state."""
    url = f"https://data.bls.gov/cew/data/api/{year}/a/area/{FIPS[state]}000.csv"
    df = pd.read_csv(io.BytesIO(_download(url, f"qcew-{year}-{state}.csv")), dtype={"industry_code": str, "own_code": str, "disclosure_code": str})
    df = df[df["own_code"] == "5"]  # private ownership
    return df.set_index("industry_code")


def qcew_lookup(state: str, year: int):
    df = qcew(state, year)

    def look(code: str):
        if code not in df.index:
            return 0.0  # industry not present in the state
        row = df.loc[code]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        if str(row.get("disclosure_code", "")).strip() == "N":
            return None  # confidential
        return float(row["annual_avg_emplvl"])

    return look


def qcew_year() -> int:
    for year in (2025, 2024):
        try:
            qcew("WA", year)
            return year
        except Exception:
            continue
    raise RuntimeError("No QCEW annual file found")


@lru_cache(maxsize=1)
def bea_tables() -> dict[str, pd.DataFrame]:
    out = {}
    for zname, member in (("SAGDP", "SAGDP2__ALL_AREAS"), ("SAINC", "SAINC1__ALL_AREAS")):
        zf = zipfile.ZipFile(io.BytesIO(_download(f"https://apps.bea.gov/regional/zip/{zname}.zip", f"{zname}.zip")))
        name = next(n for n in zf.namelist() if n.startswith(member))
        df = pd.read_csv(zf.open(name), dtype=str, encoding="latin-1")
        df["fips"] = df["GeoFIPS"].str.extract(r"(\d{5})")[0]
        df["LineCode"] = df["LineCode"].str.strip()
        out[zname] = df
    return out


def bea_value(table: str, state: str, line: str, year: int) -> float | None:
    df = bea_tables()[table]
    row = df[(df["fips"] == f"{FIPS[state]}000") & (df["LineCode"] == line)]
    if row.empty or str(year) not in row:
        return None
    v = str(row.iloc[0][str(year)]).strip()
    return float(v) if re.fullmatch(r"-?\d+(\.\d+)?", v) else None  # "(D)" = confidential


def bea_latest_year() -> int:
    cols = [c for c in bea_tables()["SAGDP"].columns if c.isdigit()]
    return max(int(c) for c in cols if bea_value("SAGDP", "WA", "1", int(c)) is not None)


def bls_series(series: list[str], start: int, end: int) -> dict[str, dict[str, float]]:
    """BLS API v2 without a key: {series: {'2025-08': value}} (monthly)."""
    r = SESSION.post("https://api.bls.gov/publicAPI/v2/timeseries/data/", json={"seriesid": series, "startyear": str(start), "endyear": str(end)}, timeout=120)
    r.raise_for_status()
    body = r.json()
    if body.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS API: {body.get('message')}")
    out = {}
    for s in body["Results"]["series"]:
        out[s["seriesID"]] = {
            f"{d['year']}-{d['period'][1:]}": float(d["value"])
            for d in s["data"]
            if d["period"].startswith("M") and d["period"] != "M13" and re.fullmatch(r"-?\d+(\.\d+)?", d["value"].strip())
        }  # missing months (e.g. Oct 2025 shutdown) come back as "-"
    return out


def bea_canadian_owned_jobs() -> tuple[dict[str, float | None], int]:
    """Employment of majority-owned U.S. affiliates with a Canadian owner, by state (BEA Table II.G 8)."""
    import xlrd

    url = "https://www.bea.gov/sites/default/files/2026-07/2024p-PartII-G1-G16.xls"
    wb = xlrd.open_workbook(file_contents=_download(url, "bea-mne-2024p.xls"))
    sh = wb.sheet_by_name("II.G8")
    col = next(c for c in range(sh.ncols) if str(sh.cell_value(4, c)).strip() == "Canada")
    names = {"Washington": "WA", "Oregon": "OR", "Idaho": "ID", "Montana": "MT", "Alaska": "AK"}
    out: dict[str, float | None] = {}
    for r in range(sh.nrows):
        name = str(sh.cell_value(r, 0)).strip()
        if name in names:
            v = sh.cell_value(r, col)
            out[names[name]] = float(v) * 1000 if isinstance(v, (int, float)) else None  # thousands; "(D)" = confidential
    return out, 2024


def acs_households() -> dict[str, float]:
    key = os.environ["CENSUS_API_KEY"]
    data = get_json("https://api.census.gov/data/2024/acs/acs1", {"get": "B11001_001E,B01003_001E", "for": "state:" + ",".join(FIPS.values()), "key": key})
    by_fips = {row[-1]: float(row[0]) for row in data[1:]}
    return {st: by_fips[f] for st, f in FIPS.items()}


# ---------- Canada (Statistics Canada) ----------

@lru_cache(maxsize=None)
def statcan_table(pid: int) -> pd.DataFrame:
    meta = SESSION.get(f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{pid}/en", timeout=60).json()
    zf = zipfile.ZipFile(io.BytesIO(_download(meta["object"], f"statcan-{pid}.zip")))
    name = next(n for n in zf.namelist() if n.endswith(".csv") and "MetaData" not in n)
    return pd.read_csv(zf.open(name), dtype=str, low_memory=False)


def _num(df: pd.DataFrame) -> pd.Series:
    scale = {"units": 1, "thousands": 1e3, "millions": 1e6, "billions": 1e9}
    factor = df["SCALAR_FACTOR"].str.lower().map(scale).fillna(1)
    return pd.to_numeric(df["VALUE"], errors="coerce") * factor


def statcan_industry(pid: int, measure_prefix: str, measure: str) -> pd.DataFrame:
    """Rows of a StatCan by-industry table as GEO, NAICS code (from the [code] in the label), year, value."""
    df = statcan_table(pid)
    naics_col = next(c for c in df.columns if c.startswith("North American"))
    measure_col = next(c for c in df.columns if c.startswith(measure_prefix))
    df = df[df[measure_col] == measure].copy()
    df["code"] = df[naics_col].str.extract(r"\[([0-9A-Z\-]+)\]\s*$")[0]
    df["year"] = df["REF_DATE"].str[:4].astype(int)
    df["value"] = _num(df)
    return df[["GEO", "code", "year", "value"]].dropna(subset=["code"])


def latest_year_with_data(df: pd.DataFrame, geo: str = "British Columbia") -> int:
    sub = df[(df["GEO"] == geo) & df["value"].notna()]
    counts = sub.groupby("year").size()
    return int(counts[counts > 50].index.max())  # needs detailed industries, not just totals


def statcan_lookup(df: pd.DataFrame, geo: str, year: int):
    sub = df[(df["GEO"] == geo) & (df["year"] == year)].set_index("code")["value"]

    def look(code: str):
        if code not in sub.index:
            return 0.0
        v = sub.loc[code]
        v = v.iloc[0] if isinstance(v, pd.Series) else v
        return None if pd.isna(v) else float(v)

    return look


def statcan_series(pid: int, filters: dict[str, str], geo_names: dict[str, str]) -> dict[str, dict[int, float]]:
    """Annual values {prov: {year: value}} for one row filter (column -> value)."""
    df = statcan_table(pid)
    for col_prefix, val in filters.items():
        col = next(c for c in df.columns if c.startswith(col_prefix))
        df = df[df[col] == val]
    out = {}
    for prov, geo in geo_names.items():
        sub = df[df["GEO"] == geo]
        vals = _num(sub)
        out[prov] = {int(y[:4]): float(v) for y, v in zip(sub["REF_DATE"], vals) if pd.notna(v)}
    return out


def cpi_12m_change() -> dict[str, float]:
    """12-month change in the all-items CPI (provinces; Whitehorse and Yellowknife for the territories)."""
    geo_member = {"BC": 26, "AB": 23, "SK": 20, "YT": 29, "NT": 30}
    out = {}
    for prov, member in geo_member.items():
        r = SESSION.post(
            "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods",
            json=[{"productId": 18100004, "coordinate": f"{member}.2.0.0.0.0.0.0.0.0", "latestN": 13}],
            timeout=60,
        )
        pts = sorted(r.json()[0]["object"]["vectorDataPoint"], key=lambda p: p["refPer"])
        out[prov] = pts[-1]["value"] / pts[0]["value"] - 1
    return out


def fetch_all() -> dict:
    """Everything build.py needs for the economy, affordability context and population."""
    log("Economy: BLS QCEW, BEA, BLS API, Census ACS, Statistics Canada")
    data: dict = {"qcew_year": qcew_year(), "bea_year": bea_latest_year()}
    data["acs_households"] = acs_households()
    data["can_owned"], data["can_owned_year"] = bea_canadian_owned_jobs()
    y0 = data["bea_year"] - 8
    laus = bls_series([f"LASST{FIPS[s]}0000000000007" for s in US_STATES] + ["EIUCOCANTOT"], y0, data["bea_year"] + 1)
    data["laus"] = {s: laus[f"LASST{FIPS[s]}0000000000007"] for s in US_STATES}
    data["import_prices"] = laus["EIUCOCANTOT"]

    # Jobs by detailed industry (all jobs, incl. self-employed): table 36-10-0489.
    data["ca_jobs"] = statcan_industry(36100489, "Labour statistics", "Total number of jobs")
    data["ca_jobs_year"] = latest_year_with_data(data["ca_jobs"])
    # GDP by detailed industry, current dollars: table 36-10-0711 (current dollars lag by a few years).
    data["ca_gdp"] = statcan_industry(36100711, "Prices", "Current dollars")
    data["ca_gdp_year"] = latest_year_with_data(data["ca_gdp"])
    # Total GDP at market prices, current prices: table 36-10-0222.
    data["ca_total_gdp"] = statcan_series(36100222, {"Prices": "Current prices", "Estimates": "Gross domestic product at market prices"}, PROV_NAMES)
    data["ca_emp_rate"] = statcan_series(14100464, {"Labour force characteristics": "Employment rate"}, PROV_NAMES)
    data["ca_population"] = statcan_series(17100005, {"Gender": "Total - gender", "Age group": "All ages"}, PROV_NAMES)
    data["ca_households"] = statcan_series(17100159, {"Size": "Total - Household size"}, PROV_NAMES)
    mne = statcan_table(36100620)
    sector_col = next(c for c in mne.columns if c.startswith("Sector"))
    desc_col = next(c for c in mne.columns if c.startswith("Descriptive"))
    naics_col = next(c for c in mne.columns if c.startswith("North American"))
    mne = mne[(mne[sector_col].str.startswith("Foreign multinational")) & (mne[desc_col] == "Total number of jobs")]
    mne = mne[mne[naics_col].str.contains("All industries|Total", regex=True)]
    data["ca_foreign_jobs"] = {
        prov: {int(y[:4]): float(v) for y, v in zip(mne[mne["GEO"] == geo]["REF_DATE"], _num(mne[mne["GEO"] == geo])) if pd.notna(v)}
        for prov, geo in PROV_NAMES.items()
    }
    data["ca_cpi"] = cpi_12m_change()
    return data
