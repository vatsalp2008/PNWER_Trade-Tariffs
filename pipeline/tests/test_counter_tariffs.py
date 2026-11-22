"""Canadian counter-tariff costing (pipeline/counter_tariffs.py) on a small made-up example."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import pandas as pd

    import counter_tariffs as ct

    HAS_DEPS = True
except ImportError:  # pandas/requests not installed
    HAS_DEPS = False

MEASURES = [
    {"id": "steel", "name": "Steel", "start": "2025-03-13", "end": None,
     "groups": [{"rate": 0.25, "items": ["7208.10.00", "7210.49.00"]}]},
    {"id": "new", "name": "New list", "start": "2026-09-08", "end": None,
     "groups": [{"rate": 0.5, "items": ["4810.31.00", "7210.49.00"]}, {"rate": 0.15, "items": ["8427.10.10"]}]},
    {"id": "old", "name": "First round", "start": "2025-03-04", "end": "2025-09-01",
     "groups": [{"rate": 0.25, "items": ["0406.10.10"]}]},
    {"id": "autos", "name": "Autos", "start": "2025-04-09", "end": None, "notCostedWhy": "depends on each vehicle's content",
     "groups": [{"rate": 0.25, "items": ["8703.23.00"]}]},
]


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Rates(unittest.TestCase):
    def test_only_costed_measures_in_force_count(self):
        rates = ct.item_rates(MEASURES, "2026-11-21")
        self.assertNotIn("04061010", rates)  # ended
        self.assertNotIn("87032300", rates)  # not costed
        self.assertEqual(rates["72081000"], (0.25, "steel"))
        self.assertEqual(rates["84271010"], (0.15, "new"))

    def test_item_on_two_lists_takes_the_higher_rate(self):
        self.assertEqual(ct.item_rates(MEASURES, "2026-11-21")["72104900"], (0.5, "new"))
        self.assertEqual(ct.item_rates(MEASURES, "2026-09-01")["72104900"], (0.25, "steel"))  # before the new list

    def test_window(self):
        w = ct.months_window("2026-09")
        self.assertEqual((w[0], w[-1], len(w)), ("2025-10", "2026-09", 12))


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Estimate(unittest.TestCase):
    def test_duty_is_value_times_rate_in_usd(self):
        window = ["2026-08", "2026-09"]
        fx = {"2026-08": 1.25, "2026-09": 1.25}
        imports = pd.DataFrame([
            # C$ values; 1.25 C$ per US$
            {"ym": "2026-08", "hs8": "72081000", "province": "BC", "state": "WA", "value": 1_250_000},
            {"ym": "2026-09", "hs8": "48103100", "province": "BC", "state": "WA", "value": 2_500_000},
            {"ym": "2026-09", "hs8": "99999999", "province": "BC", "state": "WA", "value": 5_000_000},  # not listed
            {"ym": "2026-07", "hs8": "72081000", "province": "BC", "state": "WA", "value": 9_999_999},  # outside the window
        ])
        rates = ct.item_rates(MEASURES, "2026-11-21")
        df, hit = ct.estimate(imports, rates, window, fx)
        self.assertAlmostEqual(df["usd"].sum(), 7_000_000)
        self.assertAlmostEqual(hit["usd"].sum(), 3_000_000)
        self.assertAlmostEqual(hit["duty"].sum(), 1_000_000 * 0.25 + 2_000_000 * 0.5)


if __name__ == "__main__":
    unittest.main()
