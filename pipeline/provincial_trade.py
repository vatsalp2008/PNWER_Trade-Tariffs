"""Verified BC/Alberta monthly exports. Standard library only; no API key.

python pipeline/provincial_trade.py
python pipeline/provincial_trade.py --replay pipeline/.cache/provincial/<run-id>
Only the final pointer is replaced after both validation passes succeed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
API = "https://www150.statcan.gc.ca/t1/wds/rest/"
SOURCE = "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210017501"
PID = 12100175
PROVINCES = {"BC": "British Columbia", "AB": "Alberta"}
PARTNERS = {"world": "All countries", "us": "United States"}
PRODUCTS = {
    "all": "Total of all merchandise",
    "farm": "Farm, fishing and intermediate food products",
    "energy": "Energy products",
    "ores": "Metal ores and non-metallic minerals",
    "minerals": "Metal and non-metallic mineral products",
    "chemicals": "Basic and industrial chemical, plastic and rubber products",
    "forestry": "Forestry products and building and packaging materials",
    "machinery": "Industrial machinery, equipment and parts",
    "electronics": "Electronic and electrical equipment and parts",
    "vehicles": "Motor vehicles and parts",
    "transport": "Aircraft and other transportation equipment and parts",
    "consumer": "Consumer goods",
    "special": "Special transactions trade",
}
FIELDS = ["province", "product", "partner", "month", "valueCad", "vectorId", "coordinate", "sourceValue", "releaseTime"]
LIMITATIONS = [
    "NAPCS 2022 product groups are not HS/HTS tariff lines. Forestry also includes building and packaging materials.",
    "Domestic exports, nominal CAD, monthly customs-basis observations; no seasonal adjustment is applied by this pipeline.",
    "Automated source, schema, arithmetic and export round-trip checks are not independent-source verification.",
    "Changes describe trade, not a causal estimate of tariff losses. No tariff rate or coverage is inferred.",
]


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(content)
        name = tmp.name
    os.replace(name, path)


class Capture:
    def __init__(self, raw: Path, replay: bool):
        self.raw, self.replay = raw, replay
        self.files: list[dict] = []
        self.raw.mkdir(parents=True, exist_ok=True)
        self.original = json.loads((raw / "manifest.json").read_text()) if replay else None

    def post(self, method: str, payload: list[dict], filename: str) -> list[dict]:
        path = self.raw / filename
        if self.replay:
            original = next(f for f in self.original["files"] if f["file"] == filename)
            content = path.read_bytes()
            if original["sha256"] != digest(content) or original["request"] != payload:
                raise ValueError(f"Archived checksum or request mismatch: {filename}")
        else:
            for attempt in range(3):
                try:
                    request = urllib.request.Request(API + method, data=dumps(payload).encode(), headers={
                        "Content-Type": "application/json", "User-Agent": "PNWER-provincial-trade/1.0"})
                    with urllib.request.urlopen(request, timeout=60) as response:
                        content = response.read()
                    json.loads(content)
                    atomic_write(path, content)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        self.files.append({"file": filename, "url": API + method, "request": payload, "sha256": digest(content)})
        return json.loads(content)


def queries_from(meta: dict, periods: int) -> tuple[list[dict], dict[str, tuple[str, str, str]]]:
    dimensions = meta["dimension"]
    expected = ["Geography", "Trade", "North American Product Classification System (NAPCS)", "Principal trading partners"]
    if [d["dimensionNameEn"] for d in dimensions] != expected:
        raise ValueError("Official dimensions changed; review the source mapping before publishing")
    member = [{m["memberNameEn"]: m["memberId"] for m in d["member"]} for d in dimensions]
    labels = {}
    for province, name in PROVINCES.items():
        for product, product_name in PRODUCTS.items():
            for partner, partner_name in PARTNERS.items():
                coordinate = f"{member[0][name]}.{member[1]['Domestic export']}.{member[2][product_name]}.{member[3][partner_name]}.0.0.0.0.0.0"
                labels[coordinate] = (province, product, partner)
    return [{"productId": PID, "coordinate": c, "latestN": periods} for c in labels], labels


def normalize(responses: list[dict], labels: dict, infos: list[dict]) -> list[dict]:
    info_by_coord = {}
    for item in infos:
        if item.get("status") != "SUCCESS":
            raise ValueError("Series metadata request failed")
        obj = item["object"]
        coord = obj["coordinate"]
        if coord not in labels or coord in info_by_coord:
            raise ValueError("Unexpected or duplicate series metadata")
        province, product, partner = labels[coord]
        expected_title = ";".join([PROVINCES[province], "Domestic export", PRODUCTS[product], PARTNERS[partner]])
        # WDS codes: 81 = Canadian dollars, 3 = thousands, 6 = monthly.
        if (obj["productId"], obj["memberUomCode"], obj["scalarFactorCode"], obj["frequencyCode"], obj["terminated"]) != (PID, 81, 3, 6, 0) or obj["SeriesTitleEn"] != expected_title:
            raise ValueError(f"Source meaning, currency, scale or frequency changed: {coord}")
        info_by_coord[coord] = obj
    if set(info_by_coord) != set(labels):
        raise ValueError("Missing official series metadata")
    rows, seen = [], set()
    for item in responses:
        if item.get("status") != "SUCCESS":
            raise ValueError("Trade data request failed")
        obj = item["object"]
        coord = obj["coordinate"]
        if coord not in labels or coord in seen or obj["vectorId"] != info_by_coord[coord]["vectorId"]:
            raise ValueError("Unexpected, duplicate or mismatched source series")
        seen.add(coord)
        province, product, partner = labels[coord]
        for point in obj["vectorDataPoint"]:
            # Fail closed. New/revision/suppression flags need deliberate review, never fill missing with 0.
            if any(point[k] != v for k, v in {"scalarFactorCode": 3, "frequencyCode": 6,
                    "securityLevelCode": 0, "statusCode": 0, "symbolCode": 0}.items()):
                raise ValueError(f"Unsupported source flags in {coord} at {point['refPer']}")
            value = point.get("value")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f"Missing or invalid value in {coord} at {point['refPer']}")
            rows.append(dict(zip(FIELDS, [province, product, partner, point["refPer"][:7],
                value * 1000, obj["vectorId"], coord, value, point["releaseTime"]])))
    if seen != set(labels):
        raise ValueError("Missing source series")
    return sorted(rows, key=lambda r: (r["province"], r["product"], r["partner"], r["month"]))


def validate(rows: list[dict], periods: int, end_month: str) -> list[dict]:
    checks = []
    def check(name: str, ok: bool, detail: str):
        checks.append({"name": name, "passed": bool(ok), "detail": detail})
    keys = [(r["province"], r["product"], r["partner"], r["month"]) for r in rows]
    check("Unique observation keys", len(keys) == len(set(keys)), f"{len(rows)} observations")
    check("Finite nonnegative CAD amounts", bool(rows) and all(isinstance(r["valueCad"], (int, float))
        and math.isfinite(r["valueCad"]) and r["valueCad"] >= 0 for r in rows), "Missing values never become zero")
    check("Raw-to-CAD conversion", all(r["valueCad"] == r["sourceValue"] * 1000 for r in rows), "Thousand CAD × 1,000")
    year, month = map(int, end_month.split("-"))
    end = year * 12 + month - 1
    expected_months = [f"{n//12}-{n%12+1:02d}" for n in range(end-periods+1, end+1)]
    index = {key: r["valueCad"] for key, r in zip(keys, rows)}
    expected_keys = {(p, s, d, m) for p in PROVINCES for s in PRODUCTS for d in PARTNERS for m in expected_months}
    complete = set(index) == expected_keys and len(rows) == len(expected_keys)
    check("Complete aligned monthly coverage", complete, f"{periods} months through {end_month}; {len(expected_keys)} expected rows")
    if not complete:
        return checks
    check("US does not exceed world exports", all(index[p,s,"us",m] <= index[p,s,"world",m] + 1000
        for p in PROVINCES for s in PRODUCTS for m in expected_months), "Same province, product, month; 1,000 CAD rounding tolerance")
    max_diff = max(abs(index[p,"all",d,m] - sum(index[p,s,d,m] for s in PRODUCTS if s != "all"))
        for p in PROVINCES for d in PARTNERS for m in expected_months)
    check("Product groups reconcile to official total", max_diff <= 13000,
        f"Maximum difference {max_diff:g} CAD; 13,000 CAD accumulated rounding tolerance")
    return checks


def summaries(rows: list[dict]) -> list[dict]:
    index = {(r["province"],r["product"],r["partner"],r["month"]): r["valueCad"] for r in rows}
    months = sorted({r["month"] for r in rows})
    latest = months[-1]
    prior = f"{int(latest[:4])-1}{latest[4:]}"
    output = []
    for p in PROVINCES:
        for s in PRODUCTS:
            us, world = index[p,s,"us",latest], index[p,s,"world",latest]
            base = index.get((p,s,"us",prior))
            output.append({"province": p, "product": s, "month": latest, "usCad": us, "worldCad": world,
                "usShare": us/world if world > 0 else None,
                "yoy": us/base-1 if base is not None and base > 0 else None,
                "kind": "observed-change", "source": SOURCE})
    return output


def csv_bytes(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8")


def verify_exports(rows: list[dict], summary: list[dict], csv_content: bytes, json_content: bytes) -> list[dict]:
    decoded = json.loads(json_content)
    table = list(csv.DictReader(io.StringIO(csv_content.decode("utf-8"))))
    match = len(table) == len(rows) and all(all(str(row[k]) == exported[k] for k in FIELDS) for row, exported in zip(rows, table))
    return [
        {"name": "CSV export matches validated records", "passed": match, "detail": "Every field and observation re-read after serialization"},
        {"name": "JSON and insights reproduce from validated records", "passed": decoded["rows"] == rows
            and decoded["summaries"] == summary and summaries(decoded["rows"]) == summary,
            "detail": "CAD amounts, US shares and year-over-year comparisons recomputed"},
    ]


def run(output: Path, raw: Path, replay: bool = False, periods: int = 36) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    capture = Capture(raw, replay)
    checks = []
    try:
        response = capture.post("getCubeMetadata", [{"productId": PID}], "metadata.json")
        if len(response) != 1 or response[0].get("status") != "SUCCESS":
            raise ValueError("Official table metadata unavailable")
        meta = response[0]["object"]
        queries, labels = queries_from(meta, periods)
        info_queries = [{"productId": PID, "coordinate": c} for c in labels]
        infos = capture.post("getSeriesInfoFromCubePidCoord", info_queries, "series-info.json")
        responses = capture.post("getDataFromCubePidCoordAndLatestNPeriods", queries, "series.json")
        rows = normalize(responses, labels, infos)
        checks = [{"name": "Official series meaning and units confirmed", "passed": True,
            "detail": "52 named province/product/partner series; Domestic export; CAD; thousands; monthly"}]
        checks += validate(rows, periods, meta["cubeEndDate"][:7])
        if not all(c["passed"] for c in checks):
            raise ValueError("Source validation failed")
        summary = summaries(rows)
        payload = {"schemaVersion": 1, "source": SOURCE, "table": "12-10-0175-01", "unit": "CAD",
            "basis": "Domestic export", "classification": "NAPCS 2022", "sourceReleaseTime": meta["releaseTime"],
            "firstMonth": min(r["month"] for r in rows), "lastMonth": max(r["month"] for r in rows),
            "provinces": PROVINCES, "products": PRODUCTS, "partners": PARTNERS,
            "rows": rows, "summaries": summary, "limitations": LIMITATIONS}
        csv_content, json_content = csv_bytes(rows), dumps(payload).encode()
        checks += verify_exports(rows, summary, csv_content, json_content)
        if not all(c["passed"] for c in checks):
            raise ValueError("Export validation failed")
        # Stable ID means no redeploy merely because another unchanged download occurred.
        version = digest(json_content + b"\n" + csv_content)[:20]
        previous_path = output / "latest.json"
        previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
        warnings = [f"{s['province']}/{s['product']}: latest-month YoY exceeds 50%; investigate market drivers."
            for s in summary if s["yoy"] is not None and abs(s["yoy"]) > .5]
        report = {"passed": True, "checks": checks, "warnings": warnings,
            "scope": "Automated source meaning, consistency and export checks; no independent-source or tariff legal verification."}
        atomic_write(raw / "quality-report.json", dumps(report).encode())
        capture_manifest = {"retrievedAt": now, "source": SOURCE, "files": capture.files}
        if not replay:
            atomic_write(raw / "manifest.json", dumps(capture_manifest).encode())
        if previous.get("version") == version:
            print(f"Unchanged verified version {version}; raw refresh preserved in {raw}", flush=True)
            return previous
        manifest = {"schemaVersion": 1, "version": version, "generatedAt": now,
            "retrievedAt": capture.original["retrievedAt"] if replay else now,
            "source": SOURCE, "table": payload["table"], "firstMonth": payload["firstMonth"], "lastMonth": payload["lastMonth"],
            "observationCount": len(rows), "files": {"dataset.json": digest(json_content), "observations.csv": digest(csv_content)},
            "quality": report, "provenance": capture.original["files"] if replay else capture.files}
        version_dir = output / "versions" / version
        atomic_write(version_dir / "dataset.json", json_content)
        atomic_write(version_dir / "observations.csv", csv_content)
        # The pointer is the commit boundary: old version remains readable if anything earlier fails.
        atomic_write(previous_path, dumps(manifest).encode())
        print(f"Published {len(rows)} observations; {len(checks)} checks passed; {payload['firstMonth']}–{payload['lastMonth']}; {version}", flush=True)
        return manifest
    except Exception as exc:
        atomic_write(raw / "failure.json", dumps({"failedAt": now, "error": str(exc), "published": False, "checks": checks}).encode())
        if not replay:
            atomic_write(raw / "manifest.json", dumps({"retrievedAt": now, "source": SOURCE, "files": capture.files}).encode())
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "prototype/public/data/provincial")
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "pipeline/.cache/provincial")
    parser.add_argument("--replay", type=Path)
    args = parser.parse_args()
    raw = args.replay or args.raw_dir / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run(args.output, raw, bool(args.replay))


if __name__ == "__main__":
    main()
