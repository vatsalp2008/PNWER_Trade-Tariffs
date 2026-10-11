# Data pipeline

Python scripts that pull **real public data** and write JSON files the website reads. GitHub Actions runs them daily (`.github/workflows/refresh.yml`); you can also run them on your laptop.

| Script | What it writes | Sources |
|---|---|---|
| `build.py` | `prototype/src/data/real.json`: trade, jobs, GDP, affordability (duties) and the "If USMCA ends" scenario for all 10 jurisdictions × 36 sectors/businesses | Census trade API (key needed); Statistics Canada CIMT and tables; Bank of Canada; BLS (QCEW, LAUS, import prices); BEA (state GDP, population, foreign-owned employment); Census ACS |
| `fetch_news.py` | `prototype/src/data/news.json`: the "Trade & tariff updates" feed | Federal Register, USTR, Government of Canada news (Finance, Global Affairs), CBP, PNWER blog, plus the two hand-kept files below |
| `watch_federal_register.py` | Opens a GitHub issue (label `tariff-watch`) for each new presidential tariff action on Canada | Federal Register |

## Run it locally

```bash
pip install -r pipeline/requirements.txt
python pipeline/fetch_news.py                # ~30 seconds
python pipeline/watch_federal_register.py    # prints new tariff actions (no issues opened locally)
python pipeline/build.py                     # first run 30-60 min; later runs are faster
python pipeline/build.py --if-new            # skips if real.json already has the latest month
```

- `build.py` needs your Census key in `prototype/.env.local` (`CENSUS_API_KEY=...`) or in the environment.
- Downloads are cached in `pipeline/.cache/`, which is git-ignored and safe to delete. Set `PIPELINE_CACHE=/some/other/folder` to keep the cache elsewhere.

## Files the team edits by hand

All three files live in `prototype/src/data/`. Edit them and open a pull request.

- **`tariff-events.json`** is the tariff timeline.
  - Only add events you've checked against an official source. Put the link in `sourceUrl` and set `verified: true`.
  - New U.S. proclamations show up as `tariff-watch` issues to review.
- **`news-curated.json`** holds media articles the team picks (Reuters, CBC, etc.). They appear as "Team pick".
- **`pnwer-engagement.json`** lists PNWER's own letters and statements, copied from pnwer.org.

## Checks: `build.py` won't write `real.json` if any of these fail

1. For every state and flow, the product rows add up to the Census total. This catches double counting.
2. Washington's 2025 trade with Canada is within 3% of the Embassy of Canada fact sheet ($7.0B / $16.1B).
3. BC → Washington exports for the latest month match Statistics Canada's published table 12-10-0099.
4. Sectors add up to the total, there are no negative values, and shares stay between 0 and 1.
5. Jobs, GDP shares, duty rates and duty-free shares stay in range.
6. Sanity anchors pass:
   - WA aerospace jobs are 50k–150k.
   - AB oil & gas jobs are 40k–250k.
   - WA GDP is in the hundreds of billions.

Every method and its limitations is explained in [docs/DECISIONS.md](../docs/DECISIONS.md).

## Things to update by hand once a year

- **BEA foreign-owned employment file:** the link in `fetch_economy.py` (`bea_canadian_owned_jobs`) points to the 2024 file (`.../2026-07/2024p-PartII-G1-G16.xls`). When BEA publishes the next year (around July), update the URL.
- **ACS households:** `acs_households` uses the 2024 ACS 1-year survey. Bump the year when the next one is on the Census API (usually September).
- **MFN reference year:** `fetch_tariffs.MFN_REFERENCE_YEAR = 2024` is deliberately a pre-tariff year. Don't move it to 2025 or later; those years include the new tariffs.

## Things to know about the data

- **U.S. exports** are by *state of origin of movement*, not necessarily where the goods were made. **U.S. imports** are by state of destination ("general imports").
- **Canadian imports** are by *province of clearance*, which can differ from where the goods are used. This mostly affects Alberta and the territories.
- **Provincial values** are converted from Canadian to U.S. dollars at each month's Bank of Canada average rate.
- **"Last 12 months"** ends with the latest month both countries have published, about 5-6 weeks behind.
- **Revisions:** both agencies revise recent months, so each rebuild re-downloads the latest two years.
- **Statistics Canada licence:** figures are "Adapted from Statistics Canada… This does not constitute an endorsement by Statistics Canada of this product."
