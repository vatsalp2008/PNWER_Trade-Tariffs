# Provincial exports: collection → checks → tables → checks → presentation

The **Data & verification** navigation item opens `/data`, within the existing React/Vercel site. It covers BC and Alberta monthly domestic exports to the United States and all countries for 36 months, across the all-goods total and 12 mutually exclusive NAPCS product groups. It does not replace the existing HS-based cross-border explorer or claim these broad groups are tariff lines.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `pipeline/provincial_trade.py` | Capture official responses, confirm series meaning, normalize, validate, export CSV/JSON, check the exports, compute insights, publish a version |
| `pipeline/tests/test_provincial_trade.py` | Regression tests for missing/suppressed values, units, coverage, totals, metrics, exports, replay integrity and failure rollback |
| `prototype/public/data/provincial/latest.json` | Publication pointer, version, timestamps, quality report and raw response hashes |
| `prototype/public/data/provincial/versions/<id>/dataset.json` | Versioned validated observations and precomputed latest-month insights |
| `prototype/public/data/provincial/versions/<id>/observations.csv` | All validated observations as a spreadsheet-compatible table |
| `prototype/src/data/provincial.ts` | Separate CAD/NAPCS data contract, version/checksum-aware loading, selection and CSV export |
| `prototype/src/pages/ProvincialData.tsx` | Province/product/time filters, headline indicators, trends, product ranking, paginated records and evidence |
| `prototype/tests/provincial.test.ts` | Checks that the committed publication, filters, insights and downloads agree |
| `.github/workflows/provincial-data.yml` | Daily official refresh, evidence archive, tests/build and publication commit |
| `.github/workflows/check-provincial.yml` | Offline regression checks and website build on pull requests |

Raw responses and failure reports go in `pipeline/.cache/provincial/<run>/`. They are git-ignored and are uploaded as Actions artifacts. They contain public statistics and requests only; no API key is needed for this source.

## Source and definitions

- Statistics Canada [table 12-10-0175-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210017501), [WDS documentation](https://www.statcan.gc.ca/en/developers/wds/user-guide).
- Flow: **Domestic export**, not total exports including re-exports. For interpretation and geography, retain the official table definitions and notes.
- Geography: British Columbia and Alberta as defined by the source table. This is not an allocation based on shipping ports.
- Classification: **NAPCS 2022**. Forestry products and building/packaging materials are broader than softwood lumber. No HS/HTS tariff rule is inferred or assigned.
- Original series currency is checked as WDS unit code 81 (Canadian dollars), frequency code 6 (monthly), scalar code 3 (thousands). Source values are multiplied by 1,000 exactly once. No FX conversion, inflation adjustment or additional seasonal adjustment is performed.
- US share = same month's US-bound domestic exports / world-bound domestic exports for the same province and product group.
- Year-over-year change = latest month's US exports / same month one year earlier − 1. A zero/missing denominator yields `null`, displayed as unavailable.
- Insights describe observed changes only. Commodity prices, currency, demand, fires, supply and other drivers are not controlled for. This is not a causal tariff-loss estimate.

## How the page lines up with the dashboard

The pipeline stores the official values in Canadian dollars, unchanged. The page then makes them match the rest of the site:

- **Currency:** it shows US$, converting each month at the Bank of Canada rate the dashboard used (`meta.fx` in `prototype/src/data/real.json`). The original C$ values stay in the table and in every download; the selected-months CSV also has `cad_per_usd` and US$ columns.
- **Months:** it shows the dashboard's latest month ("trade data through"), or the snapshot's if that is earlier. A newer month published by Statistics Canada appears once the dashboard updates.
- **Indicators:** the 12-month total, latest month, year-over-year change (in US$) and U.S. share are computed on the page from the shown records. The all-goods 12-month total shows the matching dashboard figure next to it.
- **Cross-check:** every dashboard rebuild (`pipeline/build.py`) compares B.C.'s and Alberta's last-12-month exports to the U.S. with this snapshot and refuses to publish if they differ by more than 0.5%. In Nov 2026 they differed by 0.01% (B.C.) and 0.04% (Alberta). Both come from Statistics Canada's customs records.
- **Product groups** are Statistics Canada's NAPCS groups, not the dashboard's HS-based sectors, so only the all-goods total has an exact dashboard equivalent. The page says so under the product filter.

## Washington & Idaho on the same page

`/data?province=WA` and `?province=ID` show a separate dataset built by `pipeline/regional_indicators.py` (run daily by `refresh.yml`, after `build.py`). It follows the same publication pattern: `prototype/public/data/regional/latest.json` points to a checksummed `versions/<id>/dataset.json`, written only when every check passes, and the page refuses a version whose checks or checksum don't match.

| Section | Source | Detail |
|---|---|---|
| Trade by industry | U.S. Census Bureau international trade API, `exports/statenaics` and `imports/statenaics` (Census key) | WA/ID with Canada and the world, NAICS 3-digit, 36 months to the dashboard's month, US$ |
| Crossings into the state | BTS Border Crossing Entry Data (`data.bts.gov/resource/keg4-3bc2.json`, no key) | Personal vehicles, trucks and more, monthly, all 15 WA/ID ports |
| Canadians driving home | Statistics Canada 24-10-0053 (no key) | Canadian residents returning from the U.S. by car, by B.C. port facing WA/ID |
| WA/ID-plated vehicles into B.C. | Statistics Canada 24-10-0057 (no key) | Daily leading indicator, summed by month |
| Energy links | EIA API v2 (`EIA_API_KEY`): natural gas imports by point of entry, crude imports by refinery state, gas prices; Canada Energy Regulator open data (no key) | Gas at Sumas/Eastport (volume, price, share of all Canadian pipeline gas), Canada's share of WA refineries' foreign crude, WA/ID citygate and residential gas prices, electricity trade with Canada |
| Border communities | BLS QCEW county files (no key) | Private jobs and wages in retail, accommodation and food services in Whatcom, Okanogan, Spokane, Boundary, Bonner and Kootenai counties, quarterly |
| Canadian investment | BEA, U.S. affiliates 2024 tables II.C9, II.G8, II.G13 (no key) | Property, plant and equipment, jobs and manufacturing jobs of Canadian-owned companies |

Its 16 checks (all must pass): industries add up to the official Census total to the dollar every month; last-12-month totals with Canada match the dashboard; latest month present at Blaine, Sumas and Eastport, and at Douglas, Pacific Highway and Kingsgate; no negative counts; passengers ≥ vehicles; the 15 B.C. ports never exceed the B.C. total; complete months of daily data; EIA and Canada Energy Regulator gas volumes agree within 5%; Canadian crude ≤ all imported crude; county industry jobs ≤ the county total; Canadian-owned ≤ all foreign-owned. The same run writes `prototype/src/data/regional-headlines.json`, the "Across the border" headlines for the dashboard (three per state) and fact sheets (the first two). Tests: `pipeline/tests/test_regional_indicators.py` and `prototype/tests/regional.test.ts` (`npm run test:data` runs both page test files).

## Two validation passes

Before generating tables:

1. Confirm all 52 source series' titles, units, frequency and vector IDs against official series metadata.
2. Reject missing, nonfinite, negative, suppressed or unhandled-flag values; never turn missing data into zero.
3. Require unique observation keys, complete aligned 36-month coverage, and a consistent thousand-CAD conversion.
4. Check same-month US exports do not exceed world exports (1,000 CAD rounding tolerance).
5. Sum the 12 component groups, excluding the all-goods total, and reconcile against that official total (13,000 CAD cumulative rounding tolerance).

After generating tables:

6. Re-read every exported CSV field and compare it with validated observations.
7. Re-read JSON and recalculate shares and YoY to detect inconsistent exported insights.

There are nine named automatic checks in the publication report. Source capture/replay checks and normalization gates run before those checks. Large YoY changes (>50% in either direction) are warnings for investigation, not automatic evidence of data error. The website discloses these notes.

These checks establish extraction and internal consistency. API metadata and table totals belong to the same underlying source; **they are not independent observations**. A separate independent-source review and legal tariff applicability review remain outside this provincial overview's scope.

## Running locally

From the repository root, Python 3.10+ (standard library only):

```sh
python pipeline/provincial_trade.py
python -m unittest discover -s pipeline/tests -v
```

From `prototype/`, use the project's Node 22 environment:

```sh
npm ci
npm run test:provincial
npm run build
npm run dev
```

Open `/data`. Filters are shareable URL parameters, for example `/data?province=AB&product=energy&months=24`. The initial snapshot is committed so a fresh checkout can render without running the live pipeline.

To reproduce an archived run without network access:

```sh
python pipeline/provincial_trade.py --replay pipeline/.cache/provincial/<run>
```

Replay verifies original response hashes and request payloads. A modified capture fails. `--output <directory>` supports isolated builds without touching the published pointer. Source network failures retry three times and then fail visibly.

## Publication and cloud operation

The new workflow runs daily at **17:41 UTC**, and can also be triggered manually. It re-fetches the entire 36-month window every time, so historical revisions can be detected even when the latest month has not changed. It requires no Census key. It shares the existing workflow's `refresh` concurrency group, avoiding concurrent automated writers.

The workflow runs pipeline tests, fetches/validates data, runs browser-data tests and builds the website before committing publication files to `main`. It uses the existing `COMMIT_EMAIL` repository variable when set, or the repository owner's GitHub no-reply address. Check the Vercel project's Git integration and commit-author requirements using the same owner configuration as the existing refresh job. If repository protection prohibits direct automation pushes, change the publication step to your team's PR-based publication process; do not weaken protection.

Each dataset is stored under an immutable content-derived version directory. The `latest.json` pointer is replaced only after all files pass validation. The React page resolves that pointer first, loads its matching version and verifies the downloaded dataset hash. A failed fetch or checksum does not substitute mock values. It displays an error and offers a retry. An unchanged refresh preserves the published pointer and timestamps, while archiving its raw retrieval separately.

Failed runs leave `failure.json` in the raw run and do not commit a replacement dataset. Enable GitHub Actions failure notifications for the people maintaining the source. The run summary and evidence artifact are available on success/failure. A failed refresh retains the previously deployed version. A successful data commit follows the existing Vercel Git deployment path.

Artifacts are retained for **90 days**, not forever. Download them before expiry for submitted research, or configure durable object storage if permanent audit evidence is required. Published data versions remain in Git. A scheduler that is disabled cannot report its own failure: for long-term unattended operation, add an external last-success monitor. The page flags monthly data older than 100 days, but this alone does not establish that the scheduler is healthy.

## Larger datasets

The current snapshot is small (1,872 observations) and is loaded only when `/data` is visited, rather than bundled into every main-page request. It is not a large-data backend. With more provinces, detailed HS codes or longer histories, retain raw files in object storage, pre-aggregate monthly outputs, split publication files by province/product, and query paginated details through a database/API where needed. The overview/filter/detail pattern can remain the same without sending millions of raw records to the browser.
