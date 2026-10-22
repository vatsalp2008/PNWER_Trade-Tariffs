# Decision log: Cross-Border Trade & Tariff Explorer

This file records **what we decided, why, and what we gave up**, so anyone picking up the project can understand the choices before changing them. Add new decisions at the end of the relevant section, with a date. If you reverse a decision, don't delete it: mark it *Superseded* and link the new one.

Each entry has the same parts:
- **Decision:** what we chose.
- **Why:** the reasons.
- **Tradeoff:** what we gave up or accepted.
- **Revisit if:** the signal that it's time to rethink.

Related docs:
- [README](../README.md): setup.
- [pipeline/README.md](../pipeline/README.md): how the data pipeline runs.
- [prototype/README.md](../prototype/README.md): code layout.

---

## 1. Scope and product

### D1. Build a new, standalone site (not a "v2" of the previous cohort's portal), Oct 2026
- **Decision:** start fresh. The Spring 2026 portal (`MadaoShall-1/Borderless-Economics`) is used only for lessons learned.
- **Why:** we verified serious problems in the old portal:
  - Its "2025" was really January–November, compared against a full 12-month 2024, so it overstated the decline (−18.5% instead of ≈ −11.7%).
  - Product values were double-counted (4-digit and 6-digit HS rows were added together).
  - Its live backend has been shut down.
  - Its job and GDP "at risk" numbers came from multipliers its own authors labelled "illustrative".
  - The user explicitly asked for a different site.
- **Tradeoff:** we didn't reuse their dashboard code, so some features had to be rebuilt.
- **Revisit if:** never for the data. Their old numbers must not be quoted.

### D2. The website is the fact-sheet *tool*; the analytical assessment is a separate written document, Oct 2026
- **Why:** PNWER wants both. Ben asked for "graphics we can easily create", and the course brief asks for a written assessment. The site produces the evidence and charts the assessment uses.
- **Tradeoff:** the site doesn't try to make causal claims (e.g. "USMCA caused X% growth"). That belongs in the written analysis, with proper methods.

### D3. All 10 jurisdictions get the same 2-page US Letter fact sheet, Oct 2026
- **Why:** PNWER confirmed it wants all 10, as 2-page PDFs. WA, ID, BC and AB carry an "in-depth" tag because the written assessment covers them in more detail.
- **Tradeoff:** the territories (YT, NT) have very thin data, so some of their boxes show "—" or "not published".
- **How it's enforced:** `prototype/scripts/check-factsheets.sh` fails if any sheet spills past 2 pages. Run it after changing labels or data.

### D4. Sectors and businesses come from one shared file: `prototype/src/data/sectors.json`, Oct 2026
- **Decision:** 7 sectors and 28 "businesses":
  - Agriculture & Food, Energy and Manufacturing are flagged as the brief's focus sectors.
  - The others are Forest Products, Minerals & Metals, Chemicals & Fertilizers, and Other Goods.
  - Each sector has an "Other …" business so every product is counted somewhere.
- **Why:** both the website (labels) and the Python pipeline (grouping trade, jobs and GDP) read this file, so they can never disagree.
  - Each business lists its product codes (HS prefixes; the longest match wins, so `8411` jet engines go to Aerospace, not Machinery).
  - Each business also lists its industry codes (NAICS) for jobs, separately for the U.S. and Canada, because their code lists differ slightly.
- **Tradeoff:** some groupings are judgement calls and should be confirmed with PNWER.
  - Seafood includes prepared fish.
  - Tractors (HS 8701) count as Machinery & farm equipment, not Autos.
  - Lumber and logs are in Forest Products. Furniture (9401/9403) is in Wood products & furniture.
  - "Livestock & meat" replaced "Beef & cattle", because the product codes (HS 01–02) cover all livestock.
- **Revisit if:** PNWER wants a different business list. Edit `sectors.json` and rerun the pipeline.

### D5. Fact sheets are organized around PNWER's four lenses, Oct 2026
- **Decision:** integration, competitiveness, affordability and employment (from Tara's comments), plus the brief's indicators (GDP per person, economic output, employment).
  - Page 1 covers "How tied is it?": trade, integration, competitiveness.
  - Page 2 covers "Why it matters and what's at risk": jobs, output, affordability, tariffs, "If USMCA ends".

### D6. The "three eras" chart is the main visual, Oct 2026
- **Decision:** trade over the previous 12 months, plotted quarterly from Dec 2017, in three periods:
  - **Before USMCA:** to June 2020.
  - **USMCA:** from July 1, 2020, when it entered into force.
  - **Tariff era:** from March 4, 2025, when the first U.S. tariffs on Canadian goods took effect.
- **Why:** the brief asks us to separate USMCA effects from tariff effects. Rolling 12-month totals remove seasonality and avoid comparing a partial year with a full one, which was the old portal's mistake.
- **Tradeoff:** the chart is descriptive. It shows *when* trade changed, not *why*. Oil prices, COVID and exchange rates also move these lines.

### D7. Mexico is out of scope, Oct 2026
- **Why:** PNWER asked us to focus on Canada and the U.S.

---

## 2. Architecture and tools

### D8. A static website with no server
- **Decision:** Vite + React + TypeScript; Recharts for charts; d3-geo for the map.
- **Why:**
  - The data is public statistics that change monthly, so pre-built JSON files are enough.
  - There's no server to pay for or to go down. The previous cohort's server died after the semester.
  - TypeScript types (`prototype/src/data/types.ts`) define the exact data shape the pipeline must produce, which catches data-shape bugs early.
- **Tradeoff:** users can't run custom queries. Anything new has to be added to the pipeline and rebuilt.

### D9. No database (no Supabase) for now
- **Why:** the data fits in a few JSON files, version-controlled in GitHub with a full history of every change. Pull requests act as the edit screen and review step for hand-curated files.
- **Revisit if:**
  - PNWER staff need to edit content without GitHub (tariff timeline, quotes, business stories), or
  - the site needs to collect input (e.g. a business-impact story form).
  - Supabase would then be the simplest add-on.

### D10. A daily GitHub Actions job keeps data and news current
- **File:** `.github/workflows/refresh.yml`.
- **What it does:** runs daily at 14:23 UTC (7:23 a.m. Pacific), which avoids GitHub's busy top of the hour. It:
  - refreshes the news,
  - checks the Federal Register,
  - rebuilds trade and economy data only when a new month is out (`--if-new`),
  - checks that the site still builds,
  - then commits.
- **Why:** it's free for public repos, and every change shows up in the git history.
- **Tradeoff:**
  - A full rebuild downloads about 400 MB from Statistics Canada and takes 30–60 minutes. That's why it only runs when a new month is published.
  - GitHub disables scheduled jobs after 60 days with no repository activity. The daily news commits normally prevent that.

### D11. Vercel's free (Hobby) plan for hosting
- **Live site:** https://pnwer-trade-tariffs.vercel.app. Root directory: `prototype`.
- **Decisions and why:**
  - **Vercel Authentication is turned off** so teammates can open preview links without a Vercel account. The repo is public anyway.
  - **The refresh job commits as the repo owner** (his GitHub no-reply address, stored in the repo variable `COMMIT_EMAIL`). Hobby only deploys commits authored by the account owner. We tested this, and the automated commit deployed.
- **Tradeoff:**
  - Hobby is for non-commercial use. If PNWER hosts the site officially or anyone is paid to work on it, move to Pro.
  - Teammates' own commits *may* be blocked on Hobby (Vercel's docs are contradictory). If PR previews fail, merge PRs with a merge commit, or deploy from GitHub Actions with a Vercel token.

### D12. A public repo, with care
- **Decision:** client documents (project brief, project plan, PDFs) are git-ignored on purpose. The plan contains team names and a Drive link. API keys live only in `prototype/.env.local` and the GitHub secret `CENSUS_API_KEY`, never with a `VITE_` prefix (that would put them in the public JavaScript).
- **Also:** commits carry no AI co-author lines (the user's choice).

### D13. Real data replaces sample data section by section
- **Decision:** `src/data/index.ts` takes each section (trade, economy, affordability, scenario) from `real.json` when the pipeline provides it, and from `mock.json` otherwise.
  - Any section still on sample data shows a "Sample" tag and a watermark.
  - Every exported PNG of a sample chart is watermarked.
- **Why:** it let us publish real trade data early without mixing unlabelled fake numbers into the same page.
- **Tradeoff:** `mock.json` is still bundled as a fallback, which makes the site's JavaScript larger (about 580 KB compressed).
- **Revisit if:** the size becomes a problem. Load JSON per jurisdiction at runtime instead.

---

## 3. Data: sources, methods and limits

> **General rule:** every number on the site must come from an official public source we can name, using a method we can explain in one sentence. Each figure's year is shown, because sources publish on different schedules.

### D14. Trade data
- **U.S. states:** U.S. Census Bureau international trade API, `statehs`.
  - Exports are by **state of origin of movement**: where goods start their journey to the border, which isn't always where they were made.
  - Imports are by **state of destination** ("general imports").
- **Provinces and territories:** Statistics Canada Canadian International Merchandise Trade (CIMT) bulk files, monthly, by HS6 product.
  - We read only the product-level file from each ZIP, using HTTP range requests, so we don't download the whole ~80 MB file.
  - Canadian **imports are recorded by province of clearance**, which can differ from where goods are used. This mostly affects Alberta and the territories.
- **Currency:** provincial values are converted from CAD to USD using each month's Bank of Canada average rate (FXMUSDCAD).
- **Time window:**
  - "Last 12 months" ends with the latest month **both** countries have published (currently August 2026, about 5–6 weeks behind).
  - Annual figures use full calendar years only.
- **Rules learned from the previous cohort's errors:**
  - Use one product level per query (no HS4 + HS6 double counting).
  - Never compare a partial year with a full one.
  - **Never add U.S.-side and Canadian-side totals together.** A WA→BC shipment appears as both a WA export and a BC import.
- **Other trade metrics:**
  - **Canada's rank** as an export market uses the last full calendar year, with all countries and no regional aggregates.
  - **Top cross-border partners** (e.g. WA ↔ BC) come from CIMT, the only source that crosses provinces with U.S. states.
- **Checks:** `build.py` refuses to publish unless all of these hold:
  - product rows add up to the Census totals;
  - WA 2025 is within 3% of the Embassy of Canada fact sheet ($7.0B / $16.1B; we get $7.12B / $15.8B);
  - BC→WA matches Statistics Canada table 12-10-0099;
  - sectors add up to the total.
- **Not used:**
  - ISED Trade Data Online: web form only, no API.
  - The previous cohort's data (D1).

### D15. Jobs
- **U.S. source:** BLS Quarterly Census of Employment and Wages (QCEW), private-sector annual averages, 2025.
- **Canada source:** Statistics Canada table 36-10-0489, all jobs including self-employed, 2024.
  - Table 36-10-0713 looked right, but it only publishes broad sectors for provinces, and its industry detail is blank.
- **Tradeoff: the two countries' job counts are not directly comparable.**
  - QCEW counts private payroll jobs and excludes self-employed and government.
  - Statistics Canada counts all jobs.
  - The fact sheet shows each jurisdiction's own figure and year. Don't compare a state's number with a province's as if they were the same measure.
- **Confidential cells:** QCEW hides industries with few employers (e.g. WA oil & gas extraction).
  - When part of a total is hidden, the sheet says "at least N" (`jobsPartial`).
  - If the whole figure is hidden, it says "not published".
  - `sectors.json` can name a fallback code with `a|b` (e.g. WA beverages uses 312 when 3121 is hidden).

### D16. Economic output (GDP)
- **U.S. source:** BEA GDP by state and industry (SAGDP2), 2025.
  - BEA's line "Forestry, fishing & related activities" (113–115) is split between Agriculture & Food and Forest Products in proportion to QCEW jobs.
  - BEA puts coal mining inside "Mining (except oil & gas)", so U.S. coal GDP sits in Minerals & Metals. In Canada it's in Energy.
- **Canada source:** Statistics Canada table 36-10-0711, current dollars.
  - **Industry detail in current dollars is only published to 2022.** The sheet shows "2022" next to those figures.
  - Total GDP comes from table 36-10-0222 (market prices, to 2024).
- **Tradeoff:** U.S. and Canadian GDP figures are from different years, labelled on the sheet.
- **Business-level output:** a business fact sheet (e.g. Seafood) shows its **whole sector's** GDP, labelled "(whole sector)". BEA doesn't publish GDP that finely, and we chose not to estimate it.
- **GDP per person:**
  - U.S.: BEA GDP ÷ BEA population (SAINC1).
  - Canada: GDP at market prices ÷ population (17-10-0005), converted at the annual average exchange rate.

### D17. Employment rate
- **U.S.:** BLS Local Area Unemployment Statistics, employment-to-population ratio, annual average of monthly values. Missing months, such as the October 2025 shutdown, are skipped.
- **Canada:** Statistics Canada table 14-10-0464, employment rate (includes the territories).
- **Tradeoff:** the definitions are close but not identical. The U.S. covers ages 16+ and Canada 15+.

### D18. Jobs at partner-owned companies
- **U.S. states:** BEA, employment of majority-owned U.S. affiliates whose ultimate owner is Canadian (Table II.G 8, 2024 preliminary).
  - This is our free official substitute for the Embassy's Dun & Bradstreet figure (WA: BEA 27,100 vs. D&B 30,350).
- **Provinces:** Statistics Canada publishes no U.S.-owned breakdown by province. We show **jobs at all foreign-owned multinationals** (table 36-10-0620, 2024), labelled as such.
  - It reports the territories together, so YT and NT show "not published".
- **Tradeoff:** the measure differs across the border (Canadian-owned vs. all foreign-owned). The label says so.

### D19. No paid data, and no "jobs supported by exports" (Oct 2026)
- **Decision:** PNWER has no internal data, and the user chose "option 2": free official sources only. We did not use the paid sources the Embassy's sheets rely on (Trade Partnership Worldwide, Dun & Bradstreet).
- **Removed:** the "jobs supported by exports" figure. Every way to estimate it needed either a paid model (BEA RIMS II), a jobs-per-dollar ratio we couldn't source officially for both countries, or assumptions we couldn't defend. The previous cohort's version used invented multipliers.
- **Revisit if:** the team adopts a published method, for example ITA's national jobs-per-export ratio plus a Canadian equivalent. Document it here.

### D20. Affordability: the cost of today's U.S. tariffs
- **Duties:** we estimate the U.S. duties paid on the flow U.S. tariffs actually apply to:
  - **U.S. states:** their imports from Canada.
  - **Provinces:** their exports to the U.S.
- **Method:** Census publishes imports from Canada by product with the **duty actually collected** (calculated duty). For each 4-digit product we compute the national effective rate over the last 12 months, then apply it to the jurisdiction's own product mix.
  - This automatically includes every tariff in force (Sections 232, 301 and 338; IEEPA while it lasted).
- **Tradeoff:**
  - It assumes each jurisdiction pays the national average rate for each product.
  - It counts duties at the border, not who ends up paying them (importers, consumers or Canadian exporters).
  - **Anti-dumping and countervailing duties (AD/CVD) are not in Census's calculated duty.** They're collected separately by Commerce/CBP, so softwood lumber's combined ~35% AD/CVD is missing; only its 10% Section 232 tariff shows up. Lumber duty figures are therefore understated.
  - **Canadian counter-tariffs are not included.** No equivalent product-level duty data is published.
- **Per household:** U.S. states only, using households from the ACS 2024 one-year survey. For provinces we show the average U.S. duty rate on their exports instead.
- **Food, fuel & farm inputs:** imports from the partner in Agriculture & Food, Energy and Fertilizer, across all sectors. It's a simple, explainable stand-in for household-relevant goods.
- **Prices:**
  - **U.S.:** BLS import price index for goods from Canada (national), 12-month change. In Aug 2026 it was +14.2%, driven by energy (non-manufactured goods +24%; manufactured goods +10%).
  - **Provinces:** consumer price index, 12-month change. The territories use the Whitehorse and Yellowknife indexes.
  - These are different indexes and are labelled as such.

### D21. "If USMCA isn't renewed" scenario
- **Question:** what extra U.S. duties would apply if goods that cross duty-free today paid standard (most-favoured-nation, MFN) rates?
- **Standard rate:**
  - For each product, we use the average duty the U.S. actually collected on the **same product from the EU and Japan in 2024**, before the 2025 tariffs. Those imports pay MFN rates.
  - Where a product had no EU/Japan imports, we use the product chapter's rate, then the overall average.
- **Why not read the U.S. tariff schedule directly?** Many rates are specific (e.g. "0.43¢/litre") or compound, and they can't be turned into percentages without unit prices. Actual collections already handle that.
- **Duty-free today:** from Census, value minus dutiable value, by product, last 12 months.
- **Extra duties:** duty-free value × standard rate, by product.
- **Section 301 line:**
  - Since July 2026 a 10% Section 301 tariff applies to Canadian goods that don't qualify for USMCA.
  - If USMCA ended, it could apply to everything. We show this separately as an **upper bound**, because it depends on future policy.
- **Exposure rating:**
  - **High:** extra duties ≥ 2.5% of the trade flow.
  - **Moderate:** ≥ 1%.
  - **Low:** below 1%.
  - These thresholds are a team judgement; adjust them in `pipeline/sections.py`.
- **Not included:**
  - Canadian tariffs on U.S. goods.
  - Changes in what businesses buy (it's a static, before-adjustment estimate).
  - Rules-of-origin costs.
  - Investment effects.

### D22. Known limitations (keep this list honest)
- Duty and scenario figures apply national product-level rates to state and provincial trade mixes.
- Job counts use different definitions in the two countries (D15).
- Canadian GDP by industry lags by about three years (D16).
- Duty estimates leave out anti-dumping and countervailing duties, which matters most for softwood lumber (D20).
- Territories have thin data. Top-product lists and percentages can swing a lot.
- Census and Statistics Canada revise recent months, so numbers can shift slightly between rebuilds.

---

## 4. Tariff timeline and news

### D23. The tariff timeline is curated and verifiable; the news feed is automatic and unverified
- **Timeline** (`prototype/src/data/tariff-events.json`):
  - These are facts the site uses (tariff tags on businesses, chart markers).
  - Each event links to its official source (`sourceUrl`) and shows "unverified" until a teammate sets `verified: true`.
  - The daily job opens a GitHub issue (label `tariff-watch`) for each new U.S. presidential tariff action on Canada in the Federal Register.
- **News** (`prototype/src/data/news.json`):
  - Headlines with links, refreshed daily, kept 120 days.
  - Shown separately ("Latest trade & tariff updates" and `/news`) so unverified headlines never mix with the facts behind the numbers.

### D24. News sources: official feeds, PNWER, and team picks
- **Automatic sources** (free, and allowed to show headlines with links):
  - Federal Register API
  - USTR RSS
  - Government of Canada news API (Finance; Global Affairs)
  - CBP trade messages (strictly filtered)
  - PNWER blog
- **Hand-kept files:**
  - `pnwer-engagement.json` (PNWER's letters)
  - `news-curated.json` (media articles teammates add by pull request; shown as "Team pick")
- **Rejected sources:**

  | Source | Why rejected |
  |---|---|
  | Google News RSS | Its terms forbid use on a public site |
  | NewsAPI.org, GNews | Free tiers are for development only |
  | GDELT | Free, but barely responding in October 2026 |
- **Relevance filter:** an item must mention a trade term (tariff, duties, USMCA/CUSMA, Section 232/301/338…) **and** Canada.
  - Jurisdiction tags use careful patterns ("Washington State", not bare "Washington", which usually means D.C.).

### D25. Correction: Section 338 coverage (Oct 2026)
- Early research described Section 338 as covering paper, wood, plastics and electronics too.
- The official proclamations (Federal Register 2026-14991/14992/14997) cover **alcohol, dairy and motor vehicles**. The timeline was corrected.
- **Lesson:** always check the official text before an event goes on the timeline.

---

## 5. Design

### D26. Minimalist design in PNWER's colours (changed Oct 2026)
- **Decision:** PNWER's own colours, taken from its "Region Overview" sheet: navy (#132048) for headings, royal blue (#1b4585) for buttons and the exports line, sky blue (#64b6d2) for bars and highlights, on a pale blue-grey background. Clay and ochre stay for declines/tariffs and imports, because they carry meaning and are easy to tell apart from blue (including for colour-blind readers). Serif headings, system fonts elsewhere.
- **History:** the first version used earth tones (forest and sage greens on warm off-white). PNWER asked for blue in Oct 2026.
- **Where the colours live:** the `:root` variables at the top of `prototype/src/index.css`, mirrored for charts and the map in `prototype/src/lib/palette.ts`. Change both together.
- **Map colours:**
  - Pale sky blue to royal blue for amounts.
  - Clay-to-blue for change.
  - Grey for "no data".
- **Fact sheet:** fixed 8.5×11 in pages with print CSS. "Download PDF" uses the browser's print dialog, which gives sharp vector text. Each chart has a PNG button for slides.

---

### D27. Sanity anchors catch unit mistakes (Oct 2026)
- **What happened:** the first economy build showed Washington's GDP as "$892M" instead of $892B. BEA's file is already in millions, and we divided by 1,000 again.
- **What we did:** `build.py` now refuses to publish unless WA GDP is in the hundreds of billions and GDP per person is between $50k and $250k.
- **Lesson:** every new data source gets at least one "order of magnitude" check against a figure you know.

### D28. A source being down for a day doesn't fail the daily job (Oct 2026)
- **What happened:** the daily job failed on Oct 15 and Oct 21 because Statistics Canada's server timed out once and returned an error page instead of the data file once. Both times the next day's run worked, but that day's news update was lost because the job stopped before committing.
- **What we did:** downloads from Statistics Canada now retry a few times. If the daily run still can't check for a new month, it logs a warning, keeps the current data and carries on, so the news still updates. A manual "Rebuild trade data" run still fails loudly.
- **Tradeoff:** a long outage would quietly delay new trade data. Check the warnings on the Actions page if the "Data as of" month looks stale.

## 6. How we check our work
- **`python pipeline/build.py`:** the data checks in D14, plus range checks on jobs, GDP shares, duty rates and the scenario. It also has sanity anchors:
  - WA aerospace jobs between 50k and 150k;
  - AB oil & gas jobs between 40k and 250k.
- **`prototype/scripts/check-factsheets.sh`:** every fact sheet prints as exactly 2 pages with nothing cut off (all 360 checked).
- **Browser click-through test** (Playwright; script kept outside the repo), which checks:
  - map, panel, scenario switch, business picker;
  - PNG export;
  - news page;
  - real/sample labels;
  - no NaN values;
  - phone width.
- **`npm run build` and `npm run lint`** must pass before merging.

---

## 7. Open questions for the team / PNWER
- Confirm the business list and the judgement-call groupings in D4.
- Agree an official method for "jobs supported by exports", or keep it out (D19).
- Decide whether to add Canadian counter-tariff costs, which needs product lists from Finance Canada mapped to HS codes.
- Review the open `tariff-watch` issues and verify timeline events.
- Replace the placeholder "What businesses are saying" quotes with real stakeholder input from PNWER.
