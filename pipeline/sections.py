"""Builds the economy, affordability and "If USMCA ends" sections of real.json.

Shapes match EconomyRecord, JurisdictionEconomy, AffordabilityRecord and
ScenarioRecord in prototype/src/data/types.ts. Money is USD millions unless noted.
"""

from __future__ import annotations

import pandas as pd

import fetch_economy as fe
import fetch_tariffs as ft
from common import taxonomy

SECTION_301_RATE = 0.10  # applies to non-USMCA Canadian goods since Jul 24 2026
FOOD_FUEL_INPUTS = {"ag", "energy"}  # sectors, plus the fertilizer business
EXPOSURE = ((0.025, "High"), (0.01, "Moderate"))  # extra duties as a share of U.S.-bound trade


def sig(x: float | None, digits: int = 3):
    return None if x is None else (0.0 if not x else float(f"{x:.{digits}g}"))


def annual_fx(fx_monthly: dict[str, float]) -> dict[int, float]:
    by_year: dict[int, list[float]] = {}
    for ym, v in fx_monthly.items():
        by_year.setdefault(int(ym[:4]), []).append(v)
    return {y: sum(v) / len(v) for y, v in by_year.items()}


def _sectors():
    return taxonomy()["sectors"]


# ---------- economy ----------

def economy_us(st: str, econ: dict) -> tuple[dict, dict]:
    jy, gy = econ["qcew_year"], econ["bea_year"]
    look = fe.qcew_lookup(st, jy)
    records: dict[str, dict] = {}

    total_gdp = fe.bea_value("SAGDP", st, "1", gy)  # SAGDP2 is in millions of current dollars
    j113, j114, j115 = (look(c) or 0.0 for c in ("113", "114", "115"))
    forest_share_l5 = j113 / (j113 + j114 + j115) if (j113 + j114 + j115) else 0.5
    line5 = fe.bea_value("SAGDP", st, "5", gy) or 0.0

    sector_gdp, sector_jobs = {}, {}
    for s in _sectors():
        jobs, partial = fe.eval_codes(s["naics"]["US"], look)
        gdp = sum((fe.bea_value("SAGDP", st, line, gy) or 0.0) for line in s["bea"])
        if s["id"] == "forest":
            gdp += line5 * forest_share_l5
        if s["id"] == "ag":
            gdp += line5 * (1 - forest_share_l5)
        sector_gdp[s["id"]], sector_jobs[s["id"]] = gdp, (jobs, partial)
        records[s["id"]] = _econ(jobs, partial, jy, gdp, total_gdp, gy, "sector")
        for b in s["businesses"]:
            bj, bp = fe.eval_codes(b["naics"]["US"], look) if b["naics"]["US"] else (None, False)
            records[b["id"]] = _econ(bj, bp, jy, gdp, total_gdp, gy, "sector")
    all_jobs = sum(v[0] or 0 for v in sector_jobs.values())
    records["all"] = _econ(all_jobs, any(v[1] for v in sector_jobs.values()), jy, sum(sector_gdp.values()), total_gdp, gy, "all")

    pop = {y: fe.bea_value("SAINC", st, "2", y) for y in range(gy - 8, gy + 1)}
    gdp_pc = [{"year": y, "value": round(fe.bea_value("SAGDP", st, "1", y) * 1e6 / p)} for y, p in pop.items() if p and fe.bea_value("SAGDP", st, "1", y)]
    laus = econ["laus"][st]
    emp_rate = []
    for y in range(gy - 8, gy + 1):
        vals = [v for ym, v in laus.items() if ym.startswith(f"{y}-")]
        if len(vals) >= 10:
            emp_rate.append({"year": y, "value": round(sum(vals) / len(vals), 1)})
    jur = {
        "gdpPerCapita": gdp_pc,
        "employmentRate": emp_rate,
        "ownedJobs": econ["can_owned"].get(st),
        "ownedJobsKind": "partner",
        "ownedJobsYear": econ["can_owned_year"],
        "totalGdp": sig(total_gdp),
        "totalGdpYear": gy,
        "households": round(econ["acs_households"][st]),
        "population": round(pop[gy]),
    }
    return records, jur


def economy_ca(prov: str, econ: dict, fx_year: dict[int, float]) -> tuple[dict, dict]:
    geo = fe.PROV_NAMES[prov]
    jy, gy = econ["ca_jobs_year"], econ["ca_gdp_year"]
    look_j = fe.statcan_lookup(econ["ca_jobs"], geo, jy)
    look_g = fe.statcan_lookup(econ["ca_gdp"], geo, gy)
    usd = lambda cad, year: cad / fx_year[year] / 1e6  # CAD dollars -> USD millions
    total_va = look_g("T001")
    total_gdp_basic = usd(total_va, gy) if total_va else None
    records: dict[str, dict] = {}
    sector_gdp, sector_jobs = {}, {}
    for s in _sectors():
        jobs, partial = fe.eval_codes(s["naics"]["CA"], look_j)
        gdp_cad, _ = fe.eval_codes(s["naics"]["CA"], look_g)
        gdp = usd(gdp_cad, gy) if gdp_cad is not None else None
        sector_gdp[s["id"]], sector_jobs[s["id"]] = gdp, (jobs, partial)
        records[s["id"]] = _econ(jobs, partial, jy, gdp, total_gdp_basic, gy, "sector")
        for b in s["businesses"]:
            bj, bp = fe.eval_codes(b["naics"]["CA"], look_j) if b["naics"]["CA"] else (None, False)
            records[b["id"]] = _econ(bj, bp, jy, gdp, total_gdp_basic, gy, "sector")
    all_jobs = sum(v[0] or 0 for v in sector_jobs.values())
    all_gdp = sum(v or 0 for v in sector_gdp.values())
    records["all"] = _econ(all_jobs, any(v[1] for v in sector_jobs.values()), jy, all_gdp, total_gdp_basic, gy, "all")

    total = econ["ca_total_gdp"][prov]
    pop = econ["ca_population"][prov]
    years = sorted(y for y in total if y in pop and y in fx_year and y >= max(total) - 8)
    gdp_pc = [{"year": y, "value": round(total[y] / fx_year[y] / pop[y])} for y in years]
    emp = econ["ca_emp_rate"][prov]
    latest_total_year = max(total)
    foreign = econ["ca_foreign_jobs"].get(prov) or {}
    jur = {
        "gdpPerCapita": gdp_pc,
        "employmentRate": [{"year": y, "value": round(v, 1)} for y, v in sorted(emp.items()) if y >= max(emp) - 8],
        "ownedJobs": foreign.get(max(foreign)) if foreign else None,
        "ownedJobsKind": "foreign",
        "ownedJobsYear": max(foreign) if foreign else econ["ca_jobs_year"],
        "totalGdp": sig(total[latest_total_year] / fx_year[latest_total_year] / 1e6),
        "totalGdpYear": latest_total_year,
        "households": round(max(econ["ca_households"][prov].items())[1]),
        "population": round(pop[max(pop)]),
    }
    return records, jur


def _econ(jobs, partial, jobs_year, gdp, total_gdp, gdp_year, scope):
    return {
        "jobs": None if jobs is None else round(jobs),
        "jobsPartial": bool(partial),
        "jobsYear": jobs_year,
        "gdp": sig(gdp),
        "gdpShare": round(gdp / total_gdp, 4) if gdp is not None and total_gdp else None,
        "gdpYear": gdp_year,
        "gdpScope": scope,
    }


# ---------- affordability & scenario ----------

def _flow_hs4(x, bizs: list[str], months: list[str], col: str) -> pd.Series:
    """Last-12-month values by HS4 (USD) for the businesses in scope."""
    hs = x.hs[x.hs["biz"].isin(bizs) & x.hs["ym"].isin(months[-12:])]
    return hs.groupby("hs4")[col].sum()


def tariff_sections(j: str, country: str, x, scopes: dict[str, list[str]], months: list[str],
                    duty: pd.DataFrame, mfn: tuple, households: float, price_change: float) -> tuple[dict, dict]:
    """Affordability and scenario records for one jurisdiction.

    The U.S.-bound flow is what U.S. tariffs apply to: a state's imports from Canada,
    or a province's exports to the U.S.
    """
    col = "imp" if country == "US" else "exp"
    rate4, rate2, overall = mfn
    food_bizs = [b["id"] for s in _sectors() for b in s["businesses"] if s["id"] in FOOD_FUEL_INPUTS or b["id"] == "fertilizer"]
    food_fuel = float(_flow_hs4(x, food_bizs, months, "imp").sum()) / 1e6

    afford, scen = {}, {}
    for scope, bizs in scopes.items():
        v = _flow_hs4(x, bizs, months, col)
        v = v[v > 0]
        total = float(v.sum())
        d = duty.reindex(v.index)
        rate = d["rate"].fillna(0.0)
        free = d["free_share"].fillna(1.0)
        m = ft.mfn_for(v.index, rate4, rate2, overall)
        duties = float((v * rate).sum())
        extra = float((v * free * m).sum())
        extra301 = float((v * free * SECTION_301_RATE).sum())
        share = extra / total if total else 0.0
        afford[scope] = {
            "foodFuelInputImports": sig(food_fuel),
            "estDuties": sig(duties / 1e6),
            "effectiveDutyRate": round(duties / total, 4) if total else 0.0,
            "dutiesPerHousehold": round(duties / households) if country == "US" and households else None,
            "priceChange": round(price_change, 4),
            "priceIndex": "import" if country == "US" else "consumer",
        }
        scen[scope] = {
            "dutyFreeShare": round(float((v * free).sum()) / total, 3) if total else 0.0,
            "usTariffWithoutUsmca": round(float((v * m).sum()) / total, 4) if total else 0.0,
            "extraDuties": sig(extra / 1e6),
            "extraDutiesSection301": sig(extra301 / 1e6),
            "extraDutiesShare": round(share, 4),
            "exposure": next((label for cut, label in EXPOSURE if share >= cut), "Low"),
        }
    return afford, scen
