"""Corridor maths and checks (no network)."""
import importlib.util
import sys
import unittest
from pathlib import Path

HAS_DEPS = all(importlib.util.find_spec(m) for m in ("pandas", "requests"))
if HAS_DEPS:  # The provincial workflows run these tests without pip install; skip there.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import corridors as c


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Helpers(unittest.TestCase):
    def test_coordinates_pad_to_ten_dimensions(self):
        self.assertEqual(c.coord(11, 2, 49, 1), "11.2.49.1.0.0.0.0.0.0")

    def test_months_between_crosses_years(self):
        self.assertEqual(c.months_between("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"])
        self.assertEqual(len(c.months_between("1990-01", "2026-09")), 441)

    def test_every_pair_has_all_sections_both_ways(self):
        specs = c.series_specs()
        self.assertEqual(len(specs), 25 * 22 * 2 + 5 + 5 + 10)  # pairs x sections x flows + U.S. + world + Canada-wide
        self.assertEqual(specs["BC|WA|exp|total"], (c.PID, "11.2.49.1.0.0.0.0.0.0"))


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Integration(unittest.TestCase):
    def test_grubel_lloyd(self):
        self.assertEqual(c.grubel_lloyd(50, 50), 1)
        self.assertEqual(c.grubel_lloyd(100, 0), 0)
        self.assertAlmostEqual(c.grubel_lloyd(75, 25), 0.5)
        self.assertIsNone(c.grubel_lloyd(0, 0))

    def test_pair_score_is_trade_weighted_across_sections(self):
        series = {f"BC|WA|{f}|{sec}": [0.0] for f in ("exp", "imp") for sec in c.SECTIONS}
        series["BC|WA|exp|I"], series["BC|WA|imp|I"] = [50.0], [50.0]      # perfectly two-way
        series["BC|WA|exp|V"], series["BC|WA|imp|V"] = [100.0], [0.0]      # one-way
        # 1 - (0 + 100) / (100 + 100) = 0.5
        self.assertEqual(c.pair_integration(series, "BC", "WA", [0]), 0.5)


def full_series(value=10.0, months=3):
    """Every spec key with consistent values: each section 10, totals 210 (21 sections)."""
    out = {}
    for key in c.series_specs():
        out[key] = [value * 21 if key.endswith("|total") else value] * months
    return out


@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Checks(unittest.TestCase):
    months = ["2026-07", "2026-08", "2026-09"]
    fx = {m: 1.38 for m in months}

    def results(self, series, units=()):
        return {r["name"]: r["passed"] for r in c.run_checks(series, self.months, list(units), self.fx, self.fx)}

    def test_consistent_data_passes(self):
        self.assertTrue(all(self.results(full_series()).values()))

    def test_sections_must_add_up_to_the_total(self):
        s = full_series()
        s["BC|WA|exp|total"] = [210.0, 210.0, 250.0]
        self.assertFalse(self.results(s)["Sections add up to the total"])

    def test_a_gap_inside_a_series_fails_but_a_late_start_does_not(self):
        s = full_series()
        s["NT|AK|imp|II"] = [None, 10.0, 10.0]
        self.assertTrue(self.results(s)["No gaps in any series"])
        s["NT|AK|imp|II"] = [10.0, None, 10.0]
        self.assertFalse(self.results(s)["No gaps in any series"])

    def test_units_other_than_thousands_fail(self):
        self.assertFalse(self.results(full_series(), units=["BC|WA|exp|I 2026-09 scalar 0"])["Values are in thousands of Canadian dollars"])



@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class TariffImpacts(unittest.TestCase):
    def test_hs_chapters_map_to_sections(self):
        self.assertEqual(c.section_of("4407"), "IX")
        self.assertEqual(c.section_of("72"), "XV")
        self.assertEqual(c.section_of("9403"), "XX")
        self.assertIsNone(c.section_of("98"))

    def test_events_get_sections_from_business_tags(self):
        secs = c.event_sections()
        self.assertEqual(secs["us-232-wood"], ["IX", "XX"])  # lumber + wood products incl. furniture (94)
        self.assertEqual(secs["ca-counter-metals"], ["XV"])  # Canada's lists come from the official items: steel & aluminum only
        self.assertEqual(secs["ca-counter-autos"], ["XVII"])
        self.assertIn("XV", secs["us-232-metals"])
        self.assertNotIn("us-ieepa", secs)  # across-the-board actions have no comparison group

    def test_halving_the_hit_sections_reads_as_about_minus_half(self):
        months = c.months_between("2023-01", "2026-09")
        series = {k: [1000.0] * len(months) for k in c.series_specs()}  # above the C$5M minimum
        cut = months.index("2025-10")
        series["BC|WA|exp|IX"] = [1000.0 if i < cut else 500.0 for i in range(len(months))]
        series["BC|WA|exp|XX"] = [1000.0 if i < cut else 500.0 for i in range(len(months))]
        row = next(r for r in c.tariff_impacts(series, months)["BC-WA"] if r["id"] == "us-232-wood")
        self.assertAlmostEqual(row["effect"], -0.5, places=3)
        self.assertAlmostEqual(row["preTrend"], 0.0, places=3)
        self.assertEqual(row["flow"], "exp")



@unittest.skipUnless(HAS_DEPS, "needs pipeline/requirements.txt")
class Alerts(unittest.TestCase):
    def series(self, level, crash_at=None):
        months = c.months_between("2015-01", "2026-09")
        # A steady corridor with a gentle seasonal wiggle, then (optionally) a collapse.
        values = [level * (1 + 0.05 * ((i % 12) - 6) / 6) for i in range(len(months))]
        if crash_at:
            k = months.index(crash_at)
            values = [v if i < k else v * 0.3 for i, v in enumerate(values)]
        return months, {"BC|WA|exp|IX": values}

    def test_a_sudden_collapse_is_flagged(self):
        months, series = self.series(10_000, crash_at="2026-07")
        changes = {k: c.window_changes(v) for k, v in series.items()}
        found = c.alerts_at(series, months, len(months) - 1, changes)
        self.assertEqual(len(found), 1)
        self.assertLess(found[0]["change"], -0.6)
        self.assertLess(found[0]["z"], -2.5)

    def test_normal_months_and_small_flows_are_not_flagged(self):
        months, series = self.series(10_000)
        changes = {k: c.window_changes(v) for k, v in series.items()}
        self.assertEqual(c.alerts_at(series, months, len(months) - 1, changes), [])
        months, series = self.series(500, crash_at="2026-07")  # C$0.5M a month: below the C$5M threshold
        changes = {k: c.window_changes(v) for k, v in series.items()}
        self.assertEqual(c.alerts_at(series, months, len(months) - 1, changes), [])

    def test_reading_tells_a_route_change_from_a_real_one(self):
        # Saskatchewan potash through Oregon, Jul-Sep 2026: -C$238M there, -C$58M (-2%) to all countries.
        self.assertEqual(c.reading(-238_169, 2_566_598, -57_562), "shift")
        self.assertEqual(c.reading(-238_169, 2_566_598, 120_000), "shift")  # rose elsewhere
        self.assertEqual(c.reading(-238_169, 1_000_000, -200_000), "real")
        self.assertEqual(c.reading(21_000, 3_000_000, 700_000), "small")  # under 5% of the total

    def test_main_products_explain_most_of_the_move(self):
        import pandas as pd
        delta = pd.Series({"3104": -238_000.0, "3105": -10_000.0, "2801": 4_000.0, "3102": -1_000.0})
        self.assertEqual(c.main_products(delta), ["3104"])  # 97% of the net move on its own
        delta = pd.Series({"2710": 13_000.0, "2713": 7_700.0, "2709": 2_000.0, "2701": -500.0})
        self.assertEqual(c.main_products(delta), ["2710", "2713"])
        self.assertEqual(c.main_products(pd.Series(dtype=float)), [])

    def test_alert_context_from_customs_rows_and_reused_after(self):
        from unittest import mock
        import pandas as pd
        import fetch_cimt
        months = c.months_between("2024-01", "2026-09")
        rows = []
        for ym, oregon, everyone in (("2025-07", 100, 900), ("2025-08", 100, 900), ("2025-09", 100, 900),
                                     ("2026-07", 10, 880), ("2026-08", 10, 880), ("2026-09", 10, 880)):
            rows += [{"flow": "exp", "province": "SK", "partner": "OR", "ym": ym, "hs4": "3104", "value": oregon * 1e6},
                     {"flow": "exp", "province": "SK", "partner": "US", "ym": ym, "hs4": "3104", "value": 400e6},
                     {"flow": "exp", "province": "SK", "partner": "ALL", "ym": ym, "hs4": "3104", "value": everyone * 1e6}]
        df = pd.DataFrame(rows)
        alert = {"pair": "SK-OR", "flow": "exp", "section": "VI", "month": "2026-09", "nowCad": 30_000, "beforeCad": 300_000}
        with mock.patch.object(fetch_cimt, "corridor_hs4", side_effect=lambda y, need: df[df["ym"].str.startswith(str(y))]) as read, \
             mock.patch.object(fetch_cimt, "statcan_hs4_names", return_value={}), \
             mock.patch.object(fetch_cimt, "hs4_names", return_value={"3104": "Potash"}):
            items = [dict(alert)]
            c.alert_context(items, months, None)
            ctx = items[0]["context"]
            self.assertEqual(ctx["reading"], "shift")
            self.assertEqual(ctx["products"][0]["name"], "Potash")
            self.assertEqual(ctx["products"][0]["corridorBeforeCad"], 300_000)
            self.assertEqual(ctx["products"][0]["allNowCad"], 2_640_000)
            self.assertIn("switching routes", c.context_text(items[0], "Saskatchewan"))
            read.reset_mock()
            again = [dict(alert)]
            c.alert_context(again, months, {"items": items})  # same alert next day: reuse, don't read the files
            read.assert_not_called()
            self.assertEqual(again[0]["context"], ctx)


if __name__ == "__main__":
    unittest.main()
