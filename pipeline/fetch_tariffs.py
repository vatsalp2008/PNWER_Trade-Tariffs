"""U.S. duty data from the Census Bureau, used for the affordability and
"If USMCA ends" sections.

1. What Canadian goods actually pay today: national imports from Canada by HS4,
   last 12 months — value, dutiable value and calculated duty. This captures every
   U.S. tariff in force during the period (Section 232, 301, 338, IEEPA while it
   lasted) as actually collected.
2. What they would pay without USMCA: the average duty the U.S. collected on the
   same products from the European Union and Japan in 2024, before the 2025 tariffs.
   Those imports pay standard ("most-favoured-nation") rates, so this is an
   evidence-based stand-in for the MFN rate, including specific (¢/kg) duties that
   are hard to convert from the tariff schedule.
"""

from __future__ import annotations

import pandas as pd

from fetch_census import CANADA, _query

EU, JAPAN = "0003", "5880"
MFN_REFERENCE_YEAR = 2024


def canada_duties(months: list[str]) -> pd.DataFrame:
    """Per HS4 over the given months: con (value), dut (dutiable value), cal (duty), rate, free_share."""
    years = sorted({int(m[:4]) for m in months})
    latest = max(years)
    frames = []
    for y in years:
        df = _query("imports/hs", cache=y < latest, get="I_COMMODITY,CON_VAL_MO,DUT_VAL_MO,CAL_DUT_MO", CTY_CODE=CANADA, COMM_LVL="HS4", time=str(y))
        frames.append(df)
    df = pd.concat(frames)
    df = df[df["time"].isin(months)]
    for c in ("CON_VAL_MO", "DUT_VAL_MO", "CAL_DUT_MO"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    g = df.groupby("I_COMMODITY")[["CON_VAL_MO", "DUT_VAL_MO", "CAL_DUT_MO"]].sum()
    g.columns = ["con", "dut", "cal"]
    g["rate"] = (g["cal"] / g["con"]).where(g["con"] > 0, 0.0)
    g["free_share"] = ((g["con"] - g["dut"]) / g["con"]).clip(0, 1).where(g["con"] > 0, 1.0)
    g.index.name = "hs4"
    return g


def mfn_rates() -> tuple[pd.Series, pd.Series, float]:
    """Average duty rate on EU + Japan imports in 2024, by HS4 (with HS2 and overall fallbacks)."""
    frames = []
    for cty in (EU, JAPAN):
        df = _query("imports/hs", get="I_COMMODITY,CON_VAL_YR,CAL_DUT_YR", CTY_CODE=cty, COMM_LVL="HS4", time=f"{MFN_REFERENCE_YEAR}-12")
        frames.append(df)
    df = pd.concat(frames)
    df["con"] = pd.to_numeric(df["CON_VAL_YR"], errors="coerce").fillna(0)
    df["cal"] = pd.to_numeric(df["CAL_DUT_YR"], errors="coerce").fillna(0)
    by4 = df.groupby("I_COMMODITY")[["con", "cal"]].sum()
    by2 = by4.groupby(by4.index.str[:2]).sum()
    rate4 = (by4["cal"] / by4["con"]).where(by4["con"] > 0)
    rate2 = (by2["cal"] / by2["con"]).where(by2["con"] > 0)
    overall = float(by4["cal"].sum() / by4["con"].sum())
    return rate4.dropna(), rate2.dropna(), overall


def mfn_for(hs4: pd.Index, rate4: pd.Series, rate2: pd.Series, overall: float) -> pd.Series:
    r = pd.Series(rate4.reindex(hs4).to_numpy(), index=hs4)
    fill2 = pd.Series(rate2.reindex(hs4.str[:2]).to_numpy(), index=hs4)
    return r.fillna(fill2).fillna(overall)
