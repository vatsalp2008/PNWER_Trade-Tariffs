"""Bank of Canada Valet API: monthly average CAD per USD (series FXMUSDCAD). No key.

Terms: free to reuse with attribution to the Bank of Canada.
"""

from __future__ import annotations

from common import get_json


def monthly_cad_per_usd(first_year: int) -> dict[str, float]:
    """{'2025-01': 1.4383, ...}: Canadian dollars per U.S. dollar, monthly average."""
    data = get_json(
        "https://www.bankofcanada.ca/valet/observations/FXMUSDCAD/json",
        {"start_date": f"{first_year}-01-01"},
        cache=False,
    )
    rates = {o["d"][:7]: float(o["FXMUSDCAD"]["v"]) for o in data["observations"] if o.get("FXMUSDCAD")}
    if not rates:
        raise RuntimeError("Bank of Canada returned no exchange rates")
    return rates
