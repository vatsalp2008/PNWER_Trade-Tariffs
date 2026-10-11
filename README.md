# PNWER Trade & Tariffs

Experience Expo project with **PNWER (Pacific NorthWest Economic Region)**. It looks at how U.S.–Canada trade, tariffs and the USMCA affect PNWER's 10 jurisdictions:
- **U.S. states:** Washington, Oregon, Idaho, Montana, Alaska
- **Canadian provinces and territories:** British Columbia, Alberta, Saskatchewan, Yukon, Northwest Territories

This repo holds the **Cross-Border Trade & Tariff Explorer**, a website prototype with two parts:
- A small dashboard where you pick a sector or business and a jurisdiction.
- A **2-page fact sheet** you can download as a PDF.

**Live site:** https://pnwer-trade-tariffs.vercel.app

**New to the project?** Read the [team guide](docs/WEBSITE_GUIDE.md) (everything on the website, every number, common tasks) and the [decision log](docs/DECISIONS.md) (why things are done this way).

> **Data status.**
> - **Real:** all figures come from official public sources: U.S. Census Bureau, BLS, BEA, Statistics Canada and Bank of Canada. Each section names its source and year.
> - **Still placeholders:** the "What businesses are saying" quotes, until PNWER provides real stakeholder input.
> - **Tariff timeline:** events link to their official source and show as "unverified" until a teammate checks them.
> - **Before you cite a number:** read [docs/DECISIONS.md](docs/DECISIONS.md). It explains every method and limitation.

---

## Setup (first time)

### 1. Install the tools

| Tool | Version | Check with | Get it from |
|---|---|---|---|
| **Node.js** | 20.19+ or 22.12+ (22 LTS recommended) | `node -v` | https://nodejs.org (pick "LTS") |
| **Git** | any recent | `git --version` | https://git-scm.com/downloads |

npm comes with Node.js; you don't install it separately.

### 2. Get the code

```bash
git clone https://github.com/vatsalp2008/PNWER_Trade-Tariffs.git
cd PNWER_Trade-Tariffs/prototype
```

### 3. Install dependencies

```bash
npm install
```

This takes a minute the first time and creates a `node_modules/` folder. Never commit that folder.

### 4. Run the site

```bash
npm run dev
```

Open the link it prints, usually **http://localhost:5173**. The page reloads automatically when you edit code. Press `Ctrl + C` in the terminal to stop it.

---

## Using the site

- **Dashboard:**
  1. Pick a sector tab.
  2. Click a state or province on the map, or use the *Jurisdiction* dropdown.
  3. Click **Open 2-page fact sheet**. You can also use **Fact sheet →** on any row of the businesses table.
- **Scenario switch:** "Today's tariffs" vs. "If USMCA ends".
- **Fact sheet links:** these follow the pattern `/factsheet/<jurisdiction>/<scope>`. For example:
  - http://localhost:5173/factsheet/WA/ag: Agriculture & Food in Washington
  - http://localhost:5173/factsheet/BC/lumber: Softwood lumber in British Columbia
  - http://localhost:5173/factsheet/ID/all: all goods in Idaho
- **Download PDF:** the button opens the print dialog; choose **Save as PDF**.
- **PNG:** every chart has a PNG button that saves the chart as an image for slides. The image is watermarked.

## Everyday commands

Run these inside `prototype/`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the site locally with live reload |
| `npm run build` | Type-check and build the final site into `dist/` |
| `npm run preview` | Serve the built site at http://localhost:4173 |
| `npm run mock` | Regenerate the sample data in `src/data/mock.json` |
| `npm run lint` | Check the code for common mistakes |
| `scripts/check-factsheets.sh` | With `npm run preview` running, checks that fact sheets print as exactly 2 pages (needs Google Chrome) |

## How the data stays up to date

- **`pipeline/`** has Python scripts that pull the data and news and write JSON into `prototype/src/data/`. See [pipeline/README.md](pipeline/README.md).
- **GitHub Actions** (`.github/workflows/refresh.yml`) runs them every day at 7:23 a.m. Pacific. It:
  - refreshes the news,
  - opens a `tariff-watch` issue for each new U.S. tariff action on Canada,
  - rebuilds the trade data when a new month is published.
- Changes are committed to `main`, and **Vercel redeploys the site automatically**.
- To run it by hand: GitHub → **Actions** → *Refresh data and news* → **Run workflow**.
- **Hand-edited files** (edit them through a pull request):
  - `tariff-events.json` (the timeline)
  - `news-curated.json` (team picks)
  - `pnwer-engagement.json` (PNWER statements)

## Census API key (for running the data pipeline yourself)

The prototype runs without any keys. When we start pulling real data from the U.S. Census Bureau:

1. Each person gets their own free key at https://api.census.gov/data/key_signup.html and clicks the activation link in the email.
2. Create a file called `prototype/.env.local` containing:
   ```
   CENSUS_API_KEY=your-key-here
   ```
3. `.env.local` is already git-ignored. **Never commit a key.** Don't add the `VITE_` prefix either: that would bundle the key into the public website.

## Where things are

```
pipeline/             Python scripts that fetch real data and news (see pipeline/README.md)
.github/workflows/    daily refresh job
prototype/
  src/
    pages/            Dashboard.tsx, FactSheet.tsx, News.tsx
    components/       map, charts, tables, watermark, PNG export
    data/
      types.ts        the data structure (real data must match this shape)
      sectors.json    sectors → businesses → HS product codes (shared with the pipeline)
      tariff-events.json  curated tariff timeline (edit by hand, with sources)
      real.json       real trade data (written by pipeline/build.py)
      news.json       updates feed (written by pipeline/fetch_news.py)
      mock.json       generated sample data for sections not yet real (run npm run mock)
      index.ts        the only place the screens read data from
    index.css         all styling (minimal, earth-tone palette)
  scripts/            sample-data generator, 2-page fit check
  README.md           technical notes, including how to swap in real data
```

More detail is in [prototype/README.md](prototype/README.md).

## Working together

- Don't push straight to `main`. Make a branch, push it, and open a pull request:
  ```bash
  git checkout -b your-name/short-description
  git add <files>
  git commit -m "What you changed"
  git push -u origin your-name/short-description
  ```
- Run `npm run build` before opening a pull request. If it fails, fix the errors first.
- Don't commit anything with names, emails, private links or keys. **This repo is public.**

## Troubleshooting

- **`npm install` fails or `npm run dev` complains about the Node version.** Run `node -v`. If it's older than 20.19, install the current LTS from nodejs.org and open a new terminal.
- **Port 5173 is already in use.** Vite automatically picks the next free port; use the link it prints.
- **A blank page.** Open the browser's developer console (F12 or Cmd+Option+I) and share the red error message with the team.
- **The PDF has more than 2 pages.** In the print dialog, set paper size to **Letter**, margins to **None**, and turn on **Background graphics**.

## Credits

- Map shapes come from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- The layout of the fact sheets was inspired by the Government of Canada's state trade fact sheets.
