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
