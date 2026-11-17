"""Checks and headline maths for the Washington & Idaho regional data (no network)."""
import importlib.util
import sys
import unittest
from pathlib import Path

HAS_DEPS = all(importlib.util.find_spec(m) for m in ("pandas", "requests"))
if HAS_DEPS:  # The provincial workflows run these tests without pip install; skip there.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import regional_indicators as r


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Helpers(unittest.TestCase):
    def test_month_window_crosses_years(self):
        self.assertEqual(r.month_window("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"])
        self.assertEqual(len(r.month_window("2026-09")), 36)

    def test_change_never_divides_by_zero(self):
        self.assertAlmostEqual(r.change(75, 100), -0.25)
        self.assertIsNone(r.change(5, 0))
        self.assertIsNone(r.change(None, 10))

    def test_census_labels_read_naturally(self):
        self.assertEqual(r.sentence_case("FORESTRY PRODUCTS, NESOI"), "Forestry products")
        self.assertEqual(r.sentence_case("GOODS RETURNED (EXPORTS FOR CANADA ONLY)"), "Goods returned (exports for Canada only)")


def trade_fixture(total_bump=0.0):
    months = r.month_window("2026-09", 3)
    series = {"WA|exp|canada|111": [10.0, 20.0, 30.0], "WA|exp|canada|336": [1.0, 2.0, 3.0], "WA|imp|canada|211": [1.0, 2.0, 3.0]}
    totals = {"WA|exp|canada": [11.0, 22.0, 33.0 + total_bump], "WA|imp|canada": [1.0, 2.0, 3.0]}
    return {"months": months, "industries": {}, "series": series, "totals": totals}


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Checks(unittest.TestCase):
    def setUp(self):
        r.STATES, self._states = {"WA": "Washington"}, r.STATES

    def tearDown(self):
        r.STATES = self._states

    def dashboard(self, exports):
        return {"WA": {"all": {"last12": {"exports": exports, "imports": 6e-6}}}}

    def test_industries_must_add_up_to_the_official_total(self):
        good = r.check_trade(trade_fixture(), self.dashboard(66e-6))
        self.assertTrue(good[1]["passed"])
        bad = r.check_trade(trade_fixture(total_bump=5), self.dashboard(66e-6))
        self.assertFalse(bad[1]["passed"])

    def test_a_missing_census_total_fails(self):
        t = trade_fixture()
        t["totals"]["WA|exp|canada"][0] = float("nan")
        self.assertFalse(r.check_trade(t, self.dashboard(66e-6))[0]["passed"])

    def test_totals_must_match_the_dashboard(self):
        self.assertFalse(r.check_trade(trade_fixture(), self.dashboard(1.0))[2]["passed"])

    def test_crossings_reject_negatives_and_fewer_passengers_than_cars(self):
        c = {"months": ["2026-09"], "lastMonth": "2026-09", "ports": {"3004": {"name": "Blaine", "state": "WA"}},
             "series": {"3004|Trucks": [5.0], "3009|Trucks": [1.0], "3302|Trucks": [1.0],
                        "3004|Personal Vehicles": [10.0], "3004|Personal Vehicle Passengers": [8.0]}}
        results = {x["name"]: x["passed"] for x in r.check_crossings(c)}
        self.assertTrue(results["Latest month present at Blaine, Sumas and Eastport"])
        self.assertFalse(results["Passengers are never fewer than vehicles"])
        c["series"]["3004|Trucks"] = [-1.0]
        self.assertFalse({x["name"]: x["passed"] for x in r.check_crossings(c)}["No negative crossing counts"])

    def test_partial_months_of_daily_data_fail_except_the_last(self):
        p = {"months": ["2026-09", "2026-10"], "lastDay": "2026-10-15", "days": {"2026-09": 30, "2026-10": 15}}
        self.assertTrue(r.check_plates(p)[0]["passed"])
        p["days"]["2026-09"] = 20
        self.assertFalse(r.check_plates(p)[0]["passed"])


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Headlines(unittest.TestCase):
    def test_changes_compare_the_same_month_two_years_earlier(self):
        months = r.month_window("2026-08", 36)
        i, j = months.index("2026-08"), months.index("2024-08")
        trav = {g: [None] * 36 for g in ("273", "249", "246")}
        trav["273"][i], trav["273"][j] = 75.0, 100.0
        trav["249"][i], trav["249"][j] = 30.0, 60.0
        cm = r.month_window("2026-09", 36)
        cross = {"3004|Trucks": [None] * 36, "3302|Trucks": [None] * 36}
        cross["3004|Trucks"][cm.index("2026-09")], cross["3004|Trucks"][cm.index("2024-09")] = 90.0, 100.0
        cross["3302|Trucks"][cm.index("2026-09")], cross["3302|Trucks"][cm.index("2024-09")] = 10.0, 20.0
        d = {
            "travellers": {"months": months, "lastMonth": "2026-08", "bcTotal": "246", "series": trav,
                           "ports": {"273": {"name": "Douglas", "facing": "WA", "usPort": "Blaine"},
                                     "249": {"name": "Kingsgate", "facing": "ID", "usPort": "Eastport"}}},
            "crossings": {"months": cm, "lastMonth": "2026-09", "series": cross,
                          "ports": {"3004": {"name": "Blaine", "state": "WA"}, "3302": {"name": "Eastport", "state": "ID"}}},
        }
        h = r.headlines(d)
        self.assertEqual([x["change"] for x in h["WA"]], [-0.25, -0.1])
        self.assertEqual([x["change"] for x in h["ID"]], [-0.5, -0.5])
        self.assertIn("Douglas", h["WA"][0]["text"])

    def test_energy_shares_are_parts_of_a_whole(self):
        d = {"travellers": {"months": r.month_window("2026-08", 36), "lastMonth": "2026-08", "bcTotal": "246", "series": {}, "ports": {}},
             "crossings": {"months": r.month_window("2026-09", 36), "lastMonth": "2026-09", "series": {}, "ports": {}},
             "energy": {"crude": {"lastMonth": "2026-08", "kbbl": {"canada": [8203.0], "world": [8608.0]}},
                        "gas": {"lastMonth": "2026-08", "ports": {"YEPRT-NCA": {"name": "Eastport", "state": "ID"}},
                                "mmcf": {"YEPRT-NCA": [30.0] * 12}, "usTotalMmcf": [100.0] * 12}}}
        h = r.headlines(d)
        crude = next(x for x in h["WA"] if x["kind"] == "share")
        gas = next(x for x in h["ID"] if x["kind"] == "share")
        self.assertAlmostEqual(crude["share"], 0.953, places=3)
        self.assertAlmostEqual(gas["share"], 0.3)
        self.assertEqual(h["WA"][1], crude, "energy comes second, so fact sheets show it")


if __name__ == "__main__":
    unittest.main()
