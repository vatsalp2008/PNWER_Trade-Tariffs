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
  - **Industry detail in current dollars is published about three years late** (2022 when this was written; 2023 since Nov 2026). The sheet shows the year next to those figures.
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
  - **Canadian counter-tariffs are estimated separately** (D36), from Canada's surtax lists and its import records.
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
- **Tradeoff:** a long outage would quietly delay new trade data. Check the warnings on the Actions page if the "trade data through" month looks stale.

### D29. Clarity changes from industry partners' feedback (Nov 2026)
- **Feedback:** PNWER's industry partners couldn't tell US$ from C$, saw job figures shown four different ways, didn't know what "Exposure" meant, couldn't easily see when data was updated, found some terms unclear, and couldn't tell "Today's tariffs" from "If USMCA ends".
- **What we did:**
  - **Currency:** everything stays in **US$**, so all 10 jurisdictions compare directly. We chose this over showing C$ on Canadian sheets. Headline numbers say "US$", and every page says "All amounts in US$".
  - **Missing figures:** one label, **"Not available"**, with a short reason. Job counts are rounded to the nearest hundred; partial totals say "minimum (part not published)"; real zeros say "none reported".
  - **Pipeline fix:** an industry that Statistics Canada's table doesn't publish now counts as missing, not zero. A total that is part confidential and otherwise zero is also missing. Canadian auto jobs now use the codes the jobs table publishes (3361–3363). This fixed B.C., Alberta and Saskatchewan auto sheets that showed 0 jobs. Non-metallic mining now uses the jobs table's two detailed codes (diamond mining and other); the old combined code is only in the GDP table, so NWT's minerals jobs had left out its diamond mines (335 jobs → about 1,850).
  - **Risk level:** "Exposure" is now "Risk level", with its key printed on every sheet (Low < 1% of the trade, Moderate 1–2.5%, High ≥ 2.5%).
  - **Dates:** every page shows "Updated [date] · trade data through [month]". The date is the last time the site's content changed (news or data).
  - **Plain terms:** "tariff" everywhere instead of mixing in "duty"; "total trade" instead of "two-way trade"; "industries that make traded goods". A new glossary page, "What the terms mean" (`/glossary`), defines every term.
  - **One name for the scenario:** "If USMCA ends (estimate)" everywhere, with a one-line explanation of both views under the dashboard toggle.
- **Tradeoff:** a few labels are longer. All 360 fact sheets were re-checked and still print as exactly 2 pages.

### D30. The `/data` page matches the dashboard (Nov 2026)
- **Context:** a teammate added a Data & verification page (PR #6) built on Statistics Canada table 12-10-0175, in C$ and by NAPCS product group. Its numbers looked different from the dashboard's B.C. and Alberta figures.
- **Finding:** they weren't really different. Both come from Statistics Canada's customs records, and over the same 12 months, converted at the same rates, the totals agree within 0.04%.
- **What we did:**
  - The page shows **US$** at the dashboard's monthly Bank of Canada rates, now saved in `real.json` (`meta.fx`). Original C$ values stay in the table and downloads.
  - It stops at the dashboard's latest month, and shows the matching dashboard figure next to its all-goods 12-month total.
  - `build.py` has a new check: B.C. and Alberta last-12-month exports to the U.S. must match the `/data` snapshot within 0.5%, or the dashboard data isn't published. Tests check the same thing and the US$ downloads.
  - Dates use the site's "Sep 2026" style.
- **Kept on purpose:** Statistics Canada's product groups. Mapping them onto our sectors isn't possible exactly, and the official groups are a useful second view. The page explains that only the all-goods total has a dashboard equivalent.
- **Tradeoff:** a month Statistics Canada publishes before Census appears on `/data` only when the dashboard catches up.

### D31. More data for Washington and Idaho (Nov 2026)
- **Why:** the `/data` page (PR #6) gave B.C. and Alberta detailed monthly data; Washington and Idaho had nothing comparable, and the dashboard's set of sources was thin. Three researchers checked 48 free sources live; this adds the strongest ones that need no new key.
- **Added (`pipeline/regional_indicators.py`, published to `prototype/public/data/regional/`):**
  - **Trade by industry:** Census state exports and imports by NAICS 3-digit industry (`statenaics`), with Canada and the world, 36 months. The U.S. counterpart of the Statistics Canada product groups used for B.C. and Alberta, and it includes imports, which matter most for Washington (oil and gas).
  - **U.S. border crossings:** BTS Border Crossing Entry Data, monthly personal vehicles, trucks, passengers and more at all 15 Washington and Idaho ports.
  - **Canadians driving home:** Statistics Canada 24-10-0053, Canadian residents returning from the U.S. by car through each of the 15 B.C. crossings facing Washington and Idaho.
  - **WA/ID-plated vehicles into B.C.:** Statistics Canada 24-10-0057, daily leading indicator summed by month.
  - **Energy:** EIA natural gas imports from Canada at Sumas and Eastport (and every other entry point, for shares), crude imports run by Washington refineries, WA/ID gas prices; Canada Energy Regulator electricity trade and gas exports by port. Needs a free `EIA_API_KEY` (in `prototype/.env.local` and the GitHub secret of the same name).
  - **Border communities:** BLS QCEW county files for Whatcom, Okanogan, Spokane, Boundary, Bonner and Kootenai counties: private jobs and wages in retail, accommodation and food services, quarterly.
  - **Canadian investment:** BEA 2024 tables II.C9, II.G8 and II.G13: property, plant and equipment, jobs and manufacturing jobs of Canadian-owned companies, vs. all foreign-owned.
- **Checks before publishing (16):** industries add up to the official Census total to the dollar, every month; last-12-month totals match the dashboard; latest months present at the big ports; no negative counts; passengers ≥ vehicles; the 15 B.C. ports never exceed the B.C. total; complete months of daily data; EIA and Canada Energy Regulator gas volumes agree within 5% at Sumas/Huntingdon and Eastport/Kingsgate; Canadian crude never exceeds all imported crude; county industry jobs never exceed the county total; Canadian-owned figures never exceed all foreign-owned figures. A source that's down keeps yesterday's files; a failed check stops the run.
- **Where it shows:**
  - `/data` now covers Washington, Idaho, B.C. and Alberta; for WA/ID it shows trade by industry plus an "At the border" section.
  - "Across the border" headlines: three per state on the dashboard panel, the first two on the fact sheets, where they replace the placeholder "What businesses are saying" card (other places keep it until PNWER sends quotes). WA: Canadians driving home through the B.C. crossings facing Washington (−28% vs 2024); 95% of the foreign crude run by Washington refineries is Canadian; trucks entering. ID: Canadians driving home through Kingsgate and Rykerts (−37%); 28% of all Canadian gas piped into the U.S. enters at Eastport; trucks entering.
- **Not yet added (researched, kept for later):** USDA farm exports and NASS production, NOAA seafood trade, USDA AMS cattle imports, WA retail sales by city, exporter counts, ITA export jobs, BTS freight by mode (bts.gov blocks scripts), Census port-level trade.
- **Tradeoff:** Census industry groups (NAICS) differ from the dashboard's sectors, so only the all-industry total has an exact dashboard equivalent; the page says so.

### D32. Cross-border corridors (Nov 2026)
- **Why:** PNWER's members work in pairs (e.g. the 2026 B.C.–Washington interparliamentary agreement), but the site only described one place at a time. A teammate cleaned Statistics Canada table 12-10-0099 (province ↔ U.S. state trade by HS section, both ways, monthly since 1990); this turns that work into a live "corridor" view.
- **What:** `pipeline/corridors.py` publishes all 25 PNWER province/territory × state pairs, 21 HS sections plus totals, both directions, 1990 to the latest month, to `prototype/public/data/corridors/` (an index plus one file per pair, loaded on demand). The `/data` page has a **Cross-border corridors** tab: an overview of all corridors, a 1990–2026 chart with NAFTA, USMCA and tariff-era bands, trade by section, a supply-chain integration score, where the province's exports go, and a CSV download.
- **Method choices:**
  - **Series by series, not the 15-million-row table:** the daily run asks the Statistics Canada data API for the last 24 months only (where revisions happen) on top of the published history. `--from-zip` rebuilds the full history from the bulk files when the API is down (it has an overnight maintenance window).
  - **Matched by Statistics Canada member ids, never by names** ("Washington, State" was the trap the team's notebook caught).
  - **US$:** Bank of Canada monthly rates from 2017 (the dashboard's); U.S. Federal Reserve H.10 monthly rates (FRED EXCAUS) for 1990–2016. They agree within 0.15% where both exist. Original C$ values stay in the data and downloads.
  - **Integration score:** Grubel–Lloyd index, 1 − |exports − imports| / (exports + imports), trade-weighted across the 21 sections. HS sections are broad, so it reads higher than it would at product level.
  - **Small bases:** % changes are shown only when the starting 12-month value is at least US$10M (corridors) or US$5M (sections).
- **Checks:** values in thousands; sections add up to the total (within C$11,000); no gaps; latest month present for B.C./Alberta with Washington/Idaho; exchange rates cover every month and match the dashboard's. `build.py` also compares 12-month B.C./Alberta exports to Washington/Idaho with our CIMT data (within 0.5%; they match exactly). The published data reproduces the team notebook's 77,616 values and 7,542 zeros.
- **Credit:** the cleaning notebook is in `docs/notebooks/statcan_12100099.ipynb` (Part 1 now reads the big file in chunks). The repo is public, so teammates are credited as "the team", not by name.

### D33. Corridor fact sheets (Nov 2026)
- **Why:** PNWER brings lawmakers from both sides of one border together; a 2-page brief on "B.C. and Washington" is what they take into those meetings.
- **What:** `/corridor/<province>/<state>` (e.g. `/corridor/BC/WA`), a 2-page US Letter sheet like the place fact sheets, with a PDF download.
  - **Page 1:** trade each way over the last 12 months and vs. two years earlier, the integration score, a 1990–2026 chart with NAFTA, USMCA and tariff-era bands, and the top product sections each way.
  - **Page 2:** shared supply chains (sections that cross both ways), the border and energy links where we have them (B.C.–Washington and B.C.–Idaho), otherwise where the province's exports go, the tariff impact table (D34), and sources.
- **Which corridors:** only those with at least US$250M of two-way trade a year (14 today), so every sheet has enough to say. The others stay on the `/data` Corridors tab.
- **Check:** `prototype/scripts/check-corridor-sheets.sh` prints every eligible sheet and fails if one isn't exactly 2 pages.

### D34. Did a tariff change trade? (indicative effects) (Nov 2026)
- **Why:** the timeline shows *when* tariffs hit; partners asked what they *did*.
- **Which actions:** the targeted ones on the timeline (lumber, steel and aluminum, autos, Canada's counter-tariffs…). Their HS sections come from the businesses each event is tagged with in `tariff-events.json` and those businesses' HS codes in `sectors.json`, so tagging an event correctly is all the upkeep it needs. Across-the-board actions are skipped: they leave nothing untouched to compare with.
- **Method (a simple difference-in-differences):**
  - For each corridor, compare the months after the action (up to 12, at least 3) with the same months a year earlier, so seasons cancel.
  - Do that for the **hit sections** and for the corridor's **other sections** (excluding energy, which swings with oil prices). The exchange rate, the economy and border traffic move both groups, so comparing them removes most of that.
  - **Indicative effect** = (1 + change in hit sections) / (1 + change in other sections) − 1. The range is the middle half of the month-by-month effects.
  - U.S. tariffs are measured on Canada's exports; Canadian counter-tariffs on Canada's imports.
- **Guard rails:** no result when the hit sections were under C$5M a year earlier. A **pre-trend** check repeats the calculation for the 12 months *before* the action; if the hit sections were already drifting by more than 10%, the row is flagged "read with care". Aircraft and ships (section XVII) are marked because single deliveries swing it.
- **Limits:** HS sections are broad (lumber is part of "Wood & wood products"); trade is in dollars, so price changes aren't separated from volumes; overlapping actions, anti-dumping duties and news also move trade. It's labelled an indicative effect, never proof. Example: B.C. → Washington wood after the Section 232 lumber tariff (Oct 2025) was about 28% lower than the corridor's other trade would suggest.

### D35. Unusual-movement alerts (Nov 2026)
- **Why:** after the course ends, no one will be watching 1,100 series every month. The site should point at what changed.
- **Rule:** for every corridor × product section × direction, take the last 3 months vs. the same 3 months a year earlier. Flag it if that change is beyond **2.5 standard deviations** of the same series' own history (at least 3 years of history needed) **and** at least C$5M. Show the 5 largest by dollar change.
- **Backtest:** applied to every month since 2019, it flags a median of 4 moves a month (at most 14, in the mid-2021 rebound from the 2020 lockdowns and the mid-2025 tariff months), so a flag is rare enough to read.
- **Where:** an "Unusual moves" card on the `/data` Corridors tab, and once per new data month the daily job opens a GitHub issue labelled `trade-alert` (`pipeline/alerts-seen.json` remembers which months already have one). A flag is a prompt to look closer (news, tariff actions, a one-off shipment), not a conclusion.

### D36. Canadian counter-tariff costs (Nov 2026)
- **Why:** the site costed U.S. tariffs but not Canada's answer to them (the known gap in D20 and D22). For U.S. members, Canada's surtaxes are the tariffs their own exporters face; for provinces, they're a cost their importers pay.
- **The lists:** `prototype/src/data/canada-countermeasures.json`, curated from the three surtax orders in force (Canada Gazette, Part II): the September 2026 list (SOR/2026-186; 335 tariff items at 15%, 25% or 50%), steel and aluminum (SOR/2025-95 as amended; 294 items, most at 50% since Sept 8, 2026) and passenger vehicles (SOR/2025-118; 19 items). Every item and rate matches Finance Canada's complete list. The first round (C$30B, March 2025) was repealed in full on Sept 1, 2025. `verified` stays false until a teammate checks each measure against its order.
- **Trade data:** Canada's own import record (Statistics Canada CIMT imports by 10-digit code, whose first 8 digits are the tariff item), by U.S. state of origin and province of clearance. The lists are written in the same codes, so items match exactly, with no guessing at 6-digit level. We first planned to use U.S. Census state exports; CIMT is better because it's the record Canadian customs taxes.
- **Estimate:** imports of each listed item over the dashboard's last 12 months × the surtax rate in force today, in US$ at the dashboard's monthly exchange rates. For a state: the surtax on goods coming from that state. For a province: the surtax its importers pay on goods from anywhere in the U.S. If an item were on two lists, the higher rate counts.
- **What it leaves out:**
  - **Vehicles aren't costed.** Vehicles that qualify under CUSMA pay only on their non-Canadian, non-Mexican content, and automakers import set quotas surtax-free, so trade values can't show what's paid.
  - **It's an upper bound.** Canada grants relief (remission) to some importers: manufacturers' non-steel inputs, food and beverage packaging, health care, public safety and more, plus specific goods (185 of the 294 steel and aluminum items have relief for some products). It also assumes the same goods keep crossing; surtaxes usually reduce them.
  - Canada's global 25% surtax on steel-derivative goods isn't a counter-tariff and isn't included.
- **Checks (`pipeline/counter_tariffs.py` keeps yesterday's file if any fail):** every item is an 8-digit tariff item with a rate between 0 and 100%; each list's imports in 2024 are within 10% of the value the government announced (steel and aluminum C$15.6B vs C$15.6B announced; vehicles C$36.4B vs C$35.6B); the trade data covers the dashboard's 12 months; no item pays more than 50%. Finance Canada's C$27.6B covers the whole September 2026 package, so the 2026 list has no figure of its own to check against.
- **Where:** a line on every fact sheet's Affordability card ("Est. Canadian counter-tariffs per year"), a "Colour map by" option and a line on the Affordability tile on the dashboard, and a **Canada's counter-tariffs** view on `/data` (every member, most affected products, where it's paid, the lists and their sources).
- **Timeline fixes from the same research:** the September 2026 event is now tagged with the businesses its list actually covers (fish and seafood were dropped before the order was made), the steel and aluminum rate reads 25–50%, and the September 2025 relief event says Canada dropped its counter-tariffs except on steel, aluminum and autos. The tariff impact tracker (D34) now takes Canada's hit sections from these lists.
- **Upkeep:** when Canada changes an order, edit the JSON (items, rates, dates). The daily job recomputes the next morning.

## 6. How we check our work
- **`python pipeline/build.py`:** the data checks in D14, plus range checks on jobs, GDP shares, duty rates and the scenario. It also has sanity anchors:
  - WA aerospace jobs between 50k and 150k;
  - AB oil & gas jobs between 40k and 250k.
- **`prototype/scripts/check-factsheets.sh`:** every fact sheet prints as exactly 2 pages with nothing cut off (all 360 checked).
- **`prototype/scripts/check-corridor-sheets.sh`:** the same for every corridor fact sheet (14 today, D33).
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
- Verify the three Canadian surtax lists in `canada-countermeasures.json` against their orders and set `verified` (D36).
- Review the open `tariff-watch` issues and verify timeline events.
- Replace the placeholder "What businesses are saying" quotes with real stakeholder input from PNWER.
