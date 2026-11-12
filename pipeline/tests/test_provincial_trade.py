"""Regression tests for publication safety, units and non-double-counted totals."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "provincial_trade.py"
spec = importlib.util.spec_from_file_location("provincial_trade", MODULE_PATH)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def fixture():
    dimensions = [
        ("Geography", list(p.PROVINCES.values())),
        ("Trade", ["Domestic export"]),
        ("North American Product Classification System (NAPCS)", list(p.PRODUCTS.values())),
        ("Principal trading partners", list(p.PARTNERS.values())),
    ]
    meta = {"dimension": [{"dimensionNameEn": name, "member": [
        {"memberNameEn": member, "memberId": i + 1} for i, member in enumerate(members)]} for name, members in dimensions],
        "cubeEndDate": "2026-09-01", "releaseTime": "2026-11-04T08:30"}
    queries, labels = p.queries_from(meta, 36)
    infos, series = [], []
    end = 2026 * 12 + 8
    months = [f"{n//12}-{n%12+1:02d}" for n in range(end-35, end+1)]
    for vector, (coord, (province, product, partner)) in enumerate(labels.items(), 100):
        info = {"productId": p.PID, "coordinate": coord, "vectorId": vector, "memberUomCode": 81,
            "scalarFactorCode": 3, "frequencyCode": 6, "terminated": 0,
            "SeriesTitleEn": ";".join([p.PROVINCES[province], "Domestic export", p.PRODUCTS[product], p.PARTNERS[partner]])}
        infos.append({"status": "SUCCESS", "object": info})
        weight = 78 if product == "all" else list(p.PRODUCTS).index(product)
        points = [{"refPer": m + "-01", "value": (100 + i) * weight * (2 if partner == "world" else 1),
            "scalarFactorCode": 3, "frequencyCode": 6, "securityLevelCode": 0, "statusCode": 0,
            "symbolCode": 0, "releaseTime": "2026-11-04T08:30"} for i, m in enumerate(months)]
        series.append({"status": "SUCCESS", "object": {"productId": p.PID, "coordinate": coord,
            "vectorId": vector, "vectorDataPoint": points}})
    return meta, labels, infos, series


class ProvincialTests(unittest.TestCase):
    def setUp(self):
        self.meta, self.labels, self.infos, self.series = fixture()

    def rows(self):
        return p.normalize(self.series, self.labels, self.infos)

    def test_converts_thousands_and_reconciles_mutually_exclusive_groups(self):
        rows = self.rows()
        self.assertEqual(len(rows), 1872)
        self.assertTrue(all(c["passed"] for c in p.validate(rows, 36, "2026-09")))
        first = next(r for r in rows if (r["province"], r["product"], r["partner"], r["month"]) == ("BC", "all", "us", "2023-10"))
        self.assertEqual(first["valueCad"], 7_800_000)

    def test_currency_or_basis_change_requires_review(self):
        self.infos[0]["object"]["memberUomCode"] = 82
        with self.assertRaisesRegex(ValueError, "currency"):
            self.rows()

    def test_missing_value_and_suppression_never_turn_into_zero(self):
        point = self.series[0]["object"]["vectorDataPoint"][0]
        point["value"] = None
        with self.assertRaisesRegex(ValueError, "Missing"):
            self.rows()
        point["value"] = 1
        point["securityLevelCode"] = 1
        with self.assertRaisesRegex(ValueError, "flags"):
            self.rows()

    def test_missing_series_or_duplicate_coordinate_rejected(self):
        original = self.series.pop()
        with self.assertRaisesRegex(ValueError, "Missing source series"):
            self.rows()
        self.series.append(original)
        self.series.append(copy.deepcopy(original))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.rows()

    def test_wrong_month_or_product_sum_blocks_publication(self):
        rows = self.rows()
        rows[0]["month"] = "2020-01"
        self.assertFalse(all(c["passed"] for c in p.validate(rows, 36, "2026-09")))
        rows = self.rows()
        row = next(r for r in rows if r["product"] == "farm" and r["partner"] == "us")
        row["valueCad"] += 100_000
        row["sourceValue"] += 100
        checks = p.validate(rows, 36, "2026-09")
        self.assertFalse(next(c for c in checks if c["name"].startswith("Product groups"))["passed"])

    def test_metrics_use_same_month_last_year_and_exclude_total_from_parts(self):
        summary = next(s for s in p.summaries(self.rows()) if s["province"] == "BC" and s["product"] == "all")
        self.assertAlmostEqual(summary["usShare"], .5)
        self.assertAlmostEqual(summary["yoy"], 135 / 123 - 1)
        self.assertEqual(summary["kind"], "observed-change")

    def test_zero_denominators_stay_unknown(self):
        rows = self.rows()
        for row in rows:
            row["valueCad"] = 0
        self.assertTrue(all(s["usShare"] is None and s["yoy"] is None for s in p.summaries(rows)))

    def test_second_pass_catches_corrupted_csv_and_stale_insights(self):
        rows = self.rows()
        summary = p.summaries(rows)
        payload = {"rows": rows, "summaries": summary}
        good_csv = p.csv_bytes(rows)
        checks = p.verify_exports(rows, summary, good_csv, p.dumps(payload).encode())
        self.assertTrue(all(c["passed"] for c in checks))
        altered = good_csv.replace(str(rows[0]["valueCad"]).encode(), b"999999999", 1)
        self.assertFalse(p.verify_exports(rows, summary, altered, p.dumps(payload).encode())[0]["passed"])
        payload["summaries"][0]["yoy"] = 99
        self.assertFalse(p.verify_exports(rows, summary, good_csv, p.dumps(payload).encode())[1]["passed"])

    def test_failure_preserves_last_published_version_and_records_reason(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "public"
            raw = Path(folder) / "run1"
            reply = {"metadata.json": [{"status": "SUCCESS", "object": self.meta}],
                "series-info.json": self.infos, "series.json": self.series}
            with patch.object(p.Capture, "post", side_effect=lambda method, body, filename: reply[filename]):
                p.run(output, raw)
                before = (output / "latest.json").read_bytes()
                # An identical refresh must not create a new published version or change timestamps.
                p.run(output, Path(folder) / "run2")
                self.assertEqual(before, (output / "latest.json").read_bytes())
                self.series[0]["object"]["vectorDataPoint"][0]["value"] = None
                with self.assertRaises(ValueError):
                    p.run(output, Path(folder) / "run3")
                self.assertEqual(before, (output / "latest.json").read_bytes())
                self.assertFalse(json.loads((Path(folder) / "run3/failure.json").read_text())["published"])

    def test_replay_rejects_modified_raw_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = Path(folder)
            original = b"[]"
            (raw / "metadata.json").write_bytes(original)
            request = [{"productId": p.PID}]
            (raw / "manifest.json").write_text(p.dumps({"files": [{"file": "metadata.json", "request": request, "sha256": p.digest(original)}]}))
            capture = p.Capture(raw, True)
            (raw / "metadata.json").write_text('[{}]')
            with self.assertRaisesRegex(ValueError, "checksum"):
                capture.post("getCubeMetadata", request, "metadata.json")


if __name__ == "__main__":
    unittest.main()
