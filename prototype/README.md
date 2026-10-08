# Cross-Border Trade & Tariff Explorer (prototype)

A clickable prototype for the PNWER project: pick a sector or business and one of PNWER's
10 jurisdictions, see how cross-border trade, tariffs and USMCA affect it, and download a
2-page fact sheet.

> **All numbers are sample data.** They are generated to look realistic and must not be
> cited. Every page, PDF and exported image is watermarked "SAMPLE DATA". The tariff/policy
> events in `src/data/reference.ts` are compiled from public reporting and still need to be
> checked against official sources.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built site at http://localhost:4173 |
| `npm run mock` | Regenerate `src/data/mock.json` (same output every time) |
| `npm run lint` | Lint |
| `scripts/check-factsheets.sh` | With `preview` running: confirms fact sheets print as exactly 2 pages with nothing cut off |

## What's in it

- **Dashboard (`/`)**
  - Sector tabs, a business picker, and a jurisdiction picker. The jurisdiction can also be picked on the map.
  - A scenario switch: today's tariffs, or if USMCA ends.
  - A side panel with one headline number for each of PNWER's four lenses: integration, competitiveness, affordability and employment.
  - A businesses table showing which tariffs hit each business.
  - A tariff/policy timeline.
- **Fact sheet (`/factsheet/:jurisdiction/:scope`)**: a 2-page Letter document.
  - The scope is `all`, a sector id (e.g. `ag`) or a business id (e.g. `dairy`).
  - "Download PDF" opens the print dialog; choose "Save as PDF".
  - Each chart has a PNG button for slides.

## How the code is organised

```
src/
  config.ts              site title, tariff-list date
  data/
    types.ts             the data contract (real data must match this shape)
    reference.ts         jurisdictions, sectors → businesses, tariff events, source labels
    mock.json            generated sample data (do not edit by hand)
    index.ts             the only place the UI reads data from
    pnwer-region.geo.json  map shapes (Natural Earth, public domain)
  components/            map, charts, tables, watermark, PNG export
  pages/                 Dashboard.tsx, FactSheet.tsx
  lib/                   number/date formatting, colours
scripts/
  generate-mock-data.ts  builds mock.json from reference.ts
  check-factsheets.sh    2-page fit check
```

## Swapping in real data later

1. Write a data pipeline (e.g. Python) that outputs the shape in `src/data/types.ts`:
   - Census for U.S. states
   - Statistics Canada for provinces
   - BEA/BLS for GDP and jobs
   - the tariff tracker
2. Point `src/data/index.ts` at the real file instead of `mock.json`. The UI doesn't need to change.
3. Remove the watermark only once every figure has been checked.
4. Re-run `scripts/check-factsheets.sh`. Longer real product names can push a page over.

Things to get right when switching to real data:
- Use full calendar years: the Census December "year-to-date" values.
- Never add HS4 and HS6 rows together.
- Never add the U.S.-side and Canadian-side totals together (it's the same shipments counted twice).

## Deploying (later)

It's a static site with no server and no secrets, so it can go on Vercel as-is:
- Import the folder.
- Build command: `npm run build`. Output folder: `dist`.
- `vercel.json` already handles page URLs like `/factsheet/WA/ag`.

`.env.local` (not committed, not bundled) holds the Census API key for the future data pipeline. Never prefix it with `VITE_`, or it would be bundled into the website.
