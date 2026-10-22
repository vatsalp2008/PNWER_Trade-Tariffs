# Cross-Border Trade & Tariff Explorer: team guide

**Live site:** https://pnwer-trade-tariffs.vercel.app
**Repo:** https://github.com/vatsalp2008/PNWER_Trade-Tariffs

This guide explains everything on the website: what each part shows, where the numbers come from, how it stays up to date, and how to make common changes. Two other docs go deeper:
- [`docs/DECISIONS.md`](DECISIONS.md) explains *why* things are done this way: every decision, tradeoff and limitation.
- [`README.md`](../README.md) covers setting up the code on your laptop.

---

## 1. What the site is

The site shows how trade between the U.S. and Canada, tariffs, and the USMCA trade agreement affect PNWER's 10 jurisdictions. It also turns any view into a printable **2-page fact sheet**.

It answers three questions, for any sector or business in any of the 10 places:
1. **How tied together are the two sides?** Trade, dependence, cross-border partners.
2. **How are today's tariffs hurting?** Trade changes since tariffs began, duties being paid, prices.
3. **What would be lost if USMCA ended?** Extra duties, and how exposed the place is.

It's the **tool** half of the project. The written assessment for PNWER is a separate document that uses the site's numbers and charts.

**Data status:**
- **Official public data:** every number comes from a U.S. or Canadian government source: Census Bureau, BLS, BEA, Statistics Canada, Bank of Canada.
- **Data as of:** trade runs to **August 2026**. Other figures show their own year.
- **Placeholders:** only the "What businesses are saying" quotes, until PNWER supplies real stakeholder input.

### The three pages

| Page | Address | What it's for |
|---|---|---|
| **Dashboard** | `/` | Explore. Pick a sector, business and place; see the map, four headline numbers, the businesses table, the tariff timeline and the latest news. |
| **Fact sheet** | `/factsheet/<jurisdiction>/<scope>` | Share. A 2-page US Letter document for one place and one sector or business, with a PDF download and image downloads. |
| **Trade & tariff updates** | `/news` | Keep current. Recent official announcements, PNWER statements and articles picked by the team. |

### The 10 jurisdictions

| Code | Jurisdiction | Trades with | In-depth? |
|---|---|---|---|
| WA | Washington | Canada | ★ yes |
| OR | Oregon | Canada | |
| ID | Idaho | Canada | ★ yes |
| MT | Montana | Canada | |
| AK | Alaska | Canada | |
| BC | British Columbia | the U.S. | ★ yes |
| AB | Alberta | the U.S. | ★ yes |
| SK | Saskatchewan | the U.S. | |
| YT | Yukon | the U.S. | |
| NT | Northwest Territories | the U.S. | |

★ marks the four places our written assessment covers in depth. The website treats all 10 the same.

U.S. states are always measured on trade **with Canada**; provinces and territories on trade **with the U.S.** The site calls the other country the **partner**.

### Sectors and businesses

There are 7 sectors containing 28 "businesses" (industries). The ● marks the three focus sectors named in PNWER's brief.

| Sector | Businesses |
|---|---|
| ● Agriculture & Food | Livestock & meat · Grains & oilseeds · Fruits & vegetables · Seafood · Dairy · Beverages · Other food & farm products |
| ● Energy | Crude oil & fuels · Natural gas · Electricity · Coal & other energy |
| ● Manufacturing | Aerospace · Machinery & farm equipment · Autos & trucks · Electronics & instruments · Ships, rail & other manufacturing |
| Forest Products | Lumber & logs · Wood products & furniture · Pulp & paper |
| Minerals & Metals | Steel · Aluminum · Critical minerals & precious metals · Stone, glass & metal goods |
| Chemicals & Fertilizers | Fertilizer & potash · Plastics & rubber · Chemicals & pharmaceuticals |
| Other Goods | Clothing & consumer goods · Special & returned goods |

**How products and industries are assigned:**
- Every traded product is assigned to exactly one business using its HS product code, so the sectors always add up to the total.
- Jobs and GDP are matched to businesses using official industry codes (NAICS).
- Both mappings live in one file, `prototype/src/data/sectors.json`, which the website and the data pipeline share.

A **scope** is either "All traded goods", one sector, or one business.

---

## 2. Dashboard tour (top to bottom)

```
┌────────────────────────────────────────────────────────────────────┐
│ Cross-Border Trade & Tariff Explorer      [Official public data]   │
│ Dashboard · Trade & tariff updates        [Data as of Aug 2026]    │
├────────────────────────────────────────────────────────────────────┤
│ [All sectors] [Agriculture & Food ●] [Energy ●] [Manufacturing ●] …│
│ Business ▾   Jurisdiction ▾   Colour map by ▾   (Today | If USMCA ends)│
├───────────────────────────────────┬────────────────────────────────┤
│              MAP                  │  SIDE PANEL                    │
│   10 jurisdictions, coloured      │  All PNWER summary, or the     │
│   by the chosen measure           │  selected place's 4 lens tiles │
├───────────────────────────────────┴────────────────────────────────┤
│ BUSINESSES TABLE: trade, change, tariffs, trend, fact sheet link   │
├────────────────────────────────────────────────────────────────────┤
│ TARIFF & POLICY TIMELINE: one card per tariff action               │
├────────────────────────────────────────────────────────────────────┤
│ LATEST TRADE & TARIFF UPDATES: 6 headlines + "See all updates"     │
├────────────────────────────────────────────────────────────────────┤
│ Footer: data notes and the full list of sources                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 Header
- **Title and tagline.** Click the title to return to the dashboard from any page.
- **Navigation:** *Dashboard* and *Trade & tariff updates*.
- **Badges:**
  - **Official public data:** every section uses real data. If a section ever falls back to placeholders, this changes to a warning badge.
  - **Data as of Aug 2026:** the latest month of trade data both countries have published, usually 5–6 weeks behind today.

### 2.2 Sector tabs
- One round button for **All sectors**, plus one for each of the 7 sectors.
- The **small dot** marks the brief's focus sectors.
- Clicking a tab filters the map, panel, businesses table, timeline and news to that sector.

### 2.3 Controls

| Control | What it does |
|---|---|
| **Business** | Narrows everything to one business, e.g. Dairy. Its row is highlighted in the table. |
| **Jurisdiction** | Picks one of the 10 places, the same as clicking it on the map. "All PNWER" shows the region summary. |
| **Colour map by** | Chooses what the map colours mean (see below). |
| **Today's tariffs / If USMCA ends** | The scenario switch. *Today's tariffs* shows the current situation. *If USMCA ends* swaps the lens tiles and map to the "agreement ends" estimates. |

**"Colour map by" options:**

| Option | Meaning | How to read the colours |
|---|---|---|
| Two-way trade (last 12 months) | Exports + imports with the partner over the latest 12 months | Darker blue = more trade (log scale, so small places still show differences) |
| Change since 2024 (tariff era) | Last 12 months vs. calendar 2024, the last full year before tariffs | Clay/red = fell, blue = grew |
| Share of exports to partner | How much of the place's exports in this scope go to the partner | Darker = more dependent |
| Jobs in sector | Jobs in the industries that make up the scope | Darker = more jobs |
| Extra U.S. duties if USMCA ends (% of trade) | Extra duties as a share of the trade U.S. tariffs apply to | Darker = more exposed |

**Grey means "no data"**, for example a territory with no trade in that business in 2024.

### 2.4 Map
- Shows the 10 jurisdictions as one region. ★ marks the in-depth places.
- **Hover** shows the place's value in the line under the map.
- **Click** selects it. Click again (or "Back to all PNWER") to deselect. The keyboard works too: Tab to a place, then press Enter.
- The legend shows the colour scale with its lowest and highest values.
- **PNG** (top right) saves the map as an image for slides.

### 2.5 Side panel

**When no place is selected ("All PNWER"):**
- Two boxes:
  - **U.S. states ↔ Canada:** exports, imports and change since 2024 for the 5 states combined.
  - **Provinces & territories ↔ U.S.:** the same for the 5 Canadian jurisdictions.
- **Why the sides are separate:** a truck from Washington to B.C. counts as a Washington export *and* a B.C. import, so adding the two sides would count it twice.
- **Biggest declines since 2024:** the places whose trade fell most in this scope. Click one to select it.

**When a place is selected**, the panel shows its name, partner, an *In-depth* tag if relevant, and **four lens tiles**, one per question PNWER asked us to answer:

| Lens | *Today's tariffs* view | *If USMCA ends* view |
|---|---|---|
| **Integration** | % of exports in this scope that go to the partner | % of the U.S.-bound trade that crosses duty-free today |
| **Competitiveness** | Export growth to the partner under USMCA, 2019→2024 | Average U.S. tariff this trade would face without USMCA |
| **Affordability** | Estimated U.S. duties paid over the last 12 months | Extra U.S. duties per year if USMCA ended |
| **Employment** | Jobs in the industry (with year) | Same jobs, shown as the workforce exposed |

"U.S.-bound trade" means what U.S. tariffs apply to: a **state's imports from Canada**, or a **province's exports to the U.S.**

Below the tiles:
- **A mini chart:** trade from 2018 to 2026. The blue line is exports to the partner, the amber line imports, and the shading marks the tariff era.
- **Open 2-page fact sheet:** goes to the fact sheet for this place and scope.
- **Back to all PNWER**.

### 2.6 Businesses table

One row per business in the chosen sector (or all 28 under "All sectors").

| Column | With a place selected | With "All PNWER" |
|---|---|---|
| Business | Name (and sector, when showing all) | same |
| Trade | **Two-way trade**, last 12 months | Two columns: **U.S. states ↔ Canada** and **Provinces ↔ U.S.**, each with its change since 2024 |
| Since 2024 | % change vs. 2024 (red = down). "—" means there was no trade in 2024 to compare. | (inside the trade columns) |
| Tariffs today | Coloured tags (below) | same |
| Trend | Tiny chart of trade over time; the shaded end is the tariff era | same |
| Fact sheet → | Opens that business's fact sheet | (needs a place selected) |

**Tariff tags** come from the curated tariff timeline:
- **U.S. tariff:** a U.S. tariff that USMCA does *not* exempt currently applies (e.g. Section 232 steel, Section 338 dairy).
- **U.S. tariff · USMCA-exempt:** a U.S. tariff exists, but goods that meet USMCA's rules are exempt. This is the agreement protecting the trade.
- **Canadian counter-tariff:** Canada currently taxes this U.S. product in return.
- **No tariff:** nothing currently applies.

### 2.7 Tariff & policy timeline
A scrolling row of cards, one per tariff or policy action affecting the chosen scope. Each card shows:
- **Date** and **who acted** (U.S. or Canada).
- **Rate**, e.g. "50%", "25% (10% energy & potash)", or "Ban".
- **What it was**, e.g. "Section 338 tariffs on Canadian alcohol, dairy & motor vehicles".
- **Status:** *In effect*, *Ended*, *Relief* (good news, such as a tariff lifted) or *Policy* (a rule change, such as the USMCA review).
- **Official source ↗:** link to the Federal Register, USTR or Finance Canada document.
- **"unverified"**, until a teammate has checked the event against its source.

A long row of cards is itself the point: frequent changes make it hard for businesses to plan.

### 2.8 Latest trade & tariff updates
- **What it shows:** six recent headlines. Items tagged with the chosen sector or place come first.
- **What each item has:** a source type tag (**Official**, **PNWER** or **Team pick**), the source, the date, and a headline linking to the original.
- **Not team-verified:** unlike the timeline above, these headlines haven't been checked by the team.
- **See all updates →** opens the full `/news` page.

### 2.9 Footer
A plain-language data note, the full list of data sources with required credits (including Statistics Canada's "Adapted from…" wording), and a reminder that the policy timeline is still being verified.

### 2.10 Shareable links
The dashboard remembers your choices in the address bar, so you can copy the URL and send someone exactly what you're looking at.

| Part of the URL | Meaning | Values |
|---|---|---|
| `s=` | sector | `ag`, `energy`, `mfg`, `forest`, `metals`, `chem`, `other` |
| `b=` | business | e.g. `dairy`, `lumber`, `aerospace`, `crude` (ids are in `sectors.json`) |
| `j=` | jurisdiction | `WA`, `OR`, `ID`, `MT`, `AK`, `BC`, `AB`, `SK`, `YT`, `NT` |
| `mode=noUsmca` | scenario switch on "If USMCA ends" | |
| `m=` | map colouring | `trade`, `change`, `dependence`, `jobs`, `risk` |

Examples:
- `/?s=forest&j=BC`: forest products in British Columbia.
- `/?s=ag&b=dairy&j=WA&mode=noUsmca`: Washington dairy, if USMCA ends.

---

## 3. Fact sheet tour

### 3.1 Opening and using a fact sheet
- **To open one:**
  - Click **Open 2-page fact sheet** in the side panel, or **Fact sheet →** in the businesses table.
  - Or go straight to `/factsheet/<jurisdiction>/<scope>`. Examples:
    - `/factsheet/WA/ag`: Agriculture & Food in Washington.
    - `/factsheet/BC/lumber`: Lumber & logs in British Columbia.
    - `/factsheet/ID/all`: all traded goods in Idaho.
- **The bar at the top** (it doesn't print):
  - **← Dashboard** goes back, keeping your selection.
  - Two dropdowns switch the **jurisdiction** and the **scope** (all goods, a whole sector, or one business).
  - **Download PDF** opens your browser's print dialog. Choose **Save as PDF**. If it ever prints more than 2 pages, set paper to **Letter**, margins to **None**, and turn on **Background graphics**.
- **PNG** buttons on the charts save that chart as an image for slides.
- **On a phone**, the pages shrink to fit the screen. Printing always uses full size.

Every number on the sheet names its source, and its year where sources differ.

### 3.2 Page 1: "How closely is it tied to [partner]?"

| Section | What it shows | Source |
|---|---|---|
| **Header** | "[Scope] in [Jurisdiction]", an *Official data* badge, and tags: *Focus sector*, *In-depth jurisdiction*, *Data as of Aug 2026* | |
| **Four headline numbers** | Exports to the partner (last 12 months); imports from the partner; change in two-way trade vs. the previous 12 months; the partner's rank among this place's export markets (e.g. Canada is **#2** for Washington) | Census / Statistics Canada |
| **Trade across three eras** | Trade with the partner over the previous 12 months, quarterly from Dec 2017, in three shaded periods (see notes below) | Census / Statistics Canada |
| **Economic integration** | Share of exports going to the partner and share of imports coming from it, plus a bar chart of the **main trading partners across the border** (e.g. WA's top provinces: B.C., Alberta, Ontario…) | Census / Statistics Canada; Statistics Canada CIMT for province ↔ state |
| **Competitiveness** | Export growth to the partner under USMCA (2019→2024) vs. growth to the rest of the world; this place's share of the partner's imports in the scope; a one-line summary | Census / Statistics Canada |
| **Top products, last 12 months** | Top 5 exports to and top 5 imports from the partner, with HS codes and values | Census / Statistics Canada |
| **Footer** | Page number and source credits | |

**Notes on the three-eras chart:**
- The three periods are:
  - **Before USMCA:** to June 2020.
  - **USMCA:** from July 1, 2020, when it entered into force.
  - **Tariff era:** from March 4, 2025, the first U.S. tariffs.
- **Numbered lines** mark key tariff actions. The numbers match the table on page 2.
- The **dashed line** is the latest month of data.
- The chart shows **when** trade changed, not **why**. Oil prices, COVID and exchange rates also move these lines.

### 3.3 Page 2: "Why it matters and what's at risk"

| Section | What it shows | Source |
|---|---|---|
| **Employment** | Jobs in the industry (with year); jobs at partner-owned companies; employment rate with a small trend line (see below) | BLS QCEW and LAUS; BEA; Statistics Canada |
| **Economic output** | GDP of the sector (with year), its share of the economy, GDP per person with a trend line, and the total economy. A business sheet shows its **whole sector's** GDP, labelled as such. | BEA; Statistics Canada |
| **Affordability** | Food, fuel & farm inputs imported from the partner; estimated U.S. duties paid; duties per household or average duty rate; prices (see below) | Census; BLS; Statistics Canada |
| **Tariff actions since January 2025** | Numbered table: date, action (linked to its official source), who, rate, whether USMCA goods are exempt, status. It shows the 10 most relevant actions, and the subtitle says how many touched the scope and how many are still in effect. | Curated timeline |
| **If USMCA isn't renewed** | Share crossing duty-free today; average U.S. tariff without USMCA; extra U.S. duties per year (and % of the trade); an upper-bound Section 301 line; an exposure rating (see below) | Census duty data |
| **What businesses are saying** | A quote box. **Currently a placeholder**, to be replaced with stakeholder input from PNWER. | |
| **About these numbers** | Three short method notes for that jurisdiction | |

**Employment details:**
- **Jobs in the industry:**
  - "At least N" means some detailed industries are confidential, so N is a lower bound.
  - "Not published" means the whole figure is confidential.
- **Partner-owned companies:**
  - U.S. states show jobs at **Canadian-owned** companies.
  - Provinces show jobs at **all foreign-owned** multinationals, because no U.S.-only figure exists by province. The territories are reported together, so YT and NT show "not published".

**Affordability details:**
- **Food, fuel & farm inputs:** imports in Agriculture & Food, Energy and Fertilizer, all sectors combined.
- **Estimated U.S. duties paid** over the last 12 months, on a state's imports from Canada or a province's exports to the U.S.
- **Duties per household** for states, or the **average duty rate** for provinces.
- **Prices:** U.S. import prices from Canada for states, or consumer prices for provinces (Whitehorse and Yellowknife for the territories), 12-month change.

**"If USMCA isn't renewed" details:**
- **Section 301 line:** "Plus, if the 10% Section 301 tariff applied" is an upper bound. It depends on future policy.
- **Exposure rating:** *High* when extra duties are ≥ 2.5% of the trade, *Moderate* when ≥ 1%, otherwise *Low*.

### 3.4 Every number, explained

| Number | What it means | How it's worked out | Source (year) |
|---|---|---|---|
| Exports / imports with partner | Value of goods crossing the border in the latest 12 months | Sum of monthly values, Sep 2025–Aug 2026. Provinces converted to USD at each month's Bank of Canada rate. | Census; Statistics Canada CIMT; Bank of Canada |
| Change in two-way trade | Latest 12 months vs. the 12 before | (exports + imports) ÷ previous (exports + imports) − 1 | same |
| Change since 2024 | Latest 12 months vs. calendar 2024 | Same formula against 2024 | same |
| Partner's export-market rank | Where the partner ranks among all destinations | All countries, last full year (2025), no regional groups | Census; Statistics Canada |
| Share of exports to partner | Dependence on the partner | Exports to partner ÷ exports to the world, last 12 months | same |
| Main trading partners across the border | Which provinces (for states) or states (for provinces) trade most with this place | Share of two-way trade, last 12 months | Statistics Canada CIMT |
| Export growth under USMCA | How sales to the partner grew while USMCA was in force | 2024 ÷ 2019 − 1, to the partner and to the world | Census; Statistics Canada |
| Share of partner's imports | This place's slice of the partner's total imports in the scope | States: Canada's imports from the state ÷ Canada's total. Provinces: exports to U.S. ÷ U.S. total imports. | Statistics Canada; Census |
| Top products | Biggest 4-digit HS products each way | Last 12 months | Census; Statistics Canada |
| Jobs | Jobs in the matching industries | U.S.: private payroll jobs. Canada: all jobs incl. self-employed. Not directly comparable across the border. | BLS QCEW (2025); Statistics Canada 36-10-0489 (2024) |
| Jobs at partner-owned companies | Employment at companies owned from the partner country | U.S.: majority-owned affiliates with a Canadian owner. Canada: all foreign-owned multinationals. | BEA Table II.G 8 (2024); Statistics Canada 36-10-0620 (2024) |
| Employment rate | % of working-age people with a job | U.S.: annual average of monthly ratio. Canada: annual rate. | BLS LAUS (2025); Statistics Canada 14-10-0464 (2025) |
| GDP of sector, share of economy | Value added by the sector, as a share of the whole economy | Sum of matching industries ÷ total GDP | BEA SAGDP2 (2025); Statistics Canada 36-10-0711 (2022) |
| GDP per person, total economy | Size of the economy per resident | GDP ÷ population | BEA (2025); Statistics Canada 36-10-0222 and 17-10-0005 (2024) |
| Estimated U.S. duties | What U.S. tariffs cost on this trade | For each product: national duty actually collected on Canadian goods ÷ their value, × this place's trade in that product | Census imports from Canada with calculated duty, last 12 months |
| Duties per household | The duties spread across the state's households | Estimated duties ÷ households | Census ACS (2024) |
| Price change | How prices moved over 12 months | U.S.: import prices for goods from Canada. Canada: consumer prices. | BLS; Statistics Canada 18-10-0004 |
| Share crossing duty-free | Trade that pays no U.S. duty today | (value − dutiable value) ÷ value, by product | Census, last 12 months |
| Average U.S. tariff without USMCA | Standard rate this trade would face | What the U.S. collected on the same products from the EU and Japan in 2024, before the new tariffs, weighted by this trade | Census (2024) |
| Extra U.S. duties if USMCA ends | Added yearly cost | Duty-free value × standard rate, by product | Census |
| Section 301 upper bound | Further cost if the 10% Section 301 tariff hit all goods now exempt | Duty-free value × 10% | Census |
| Exposure | Quick rating | High ≥ 2.5%, Moderate ≥ 1% of the trade | Team threshold |

**Caveats to repeat whenever you quote these numbers:**
- **Duty estimates leave out anti-dumping and countervailing duties**, so softwood lumber's real duties are higher than shown.
- **Canadian counter-tariffs are not costed**; there's no equivalent product-level data.
- **U.S. exports are counted by "state of origin of movement"**, which isn't always where goods were made.
- **Canadian imports are counted by province of clearance.**
- More detail is in [`DECISIONS.md`](DECISIONS.md), sections D14–D22.

---

## 4. Trade & tariff updates page (`/news`)

- **Filters:**
  - **Source:** All, *Official (U.S. & Canada)*, *PNWER*, or *Team picks*.
  - **Jurisdiction** and **Sector:** show only items tagged with them.
  - **Search:** words in the headline or source, e.g. *lumber*, *dairy*, *Section 232*.
- **Each item:** a source type tag, the source, the date, the headline (opens the original in a new tab), and jurisdiction and sector tags guessed from the text.
- **Sources:**

  | Source type | Where it comes from |
  |---|---|
  | **Official (automatic)** | Federal Register (presidential tariff documents, USTR notices); USTR press releases; Government of Canada news (Finance Canada, Global Affairs Canada); U.S. Customs and Border Protection trade messages |
  | **PNWER** | PNWER's blog, plus its letters and statements (hand-kept list) |
  | **Team pick** | Media articles teammates add (see section 6) |
- **Refresh:** daily. Items stay for 120 days; PNWER's own statements stay longer.
- **Relevance filter:** an item is only included if it mentions both a trade term (tariff, duties, USMCA/CUSMA, Section 232/301/338…) and Canada.
- **Updates vs. timeline:** the updates page is **automatic and not verified**. The **tariff timeline** on the dashboard and fact sheets is **curated and linked to official sources**, and it's what the site's tariff tags use.

---

## 5. How the site stays up to date

**Every day at 7:23 a.m. Pacific**, a GitHub Actions job (`.github/workflows/refresh.yml`) does the following:
1. **Refreshes the news feed** (`news.json`).
2. **Checks the Federal Register** for new U.S. presidential tariff actions on Canada. For each new one, it **opens a GitHub issue** labelled `tariff-watch` so a teammate can review it.
3. **Checks whether a new month of trade data is out.** If it is, it rebuilds all the data: trade, jobs, GDP, duties and the scenario (`real.json`). The build runs its checks first and won't publish if any fail. If Statistics Canada or Census is down that day, it keeps the current data, shows a warning on the run, and tries again tomorrow.
4. **Makes sure the website still builds.**
5. **Commits any changes.** Vercel then redeploys the live site automatically, within a couple of minutes.

**Running it by hand:** GitHub → **Actions** → *Refresh data and news* → **Run workflow**. Tick *Rebuild trade data* to force a full rebuild; it takes 30–60 minutes.

**Preview links:** every pull request gets its own preview link from Vercel, posted as a comment on the PR. Anyone can open it.

**What the build checks before publishing:**
- Product rows add up to the official totals.
- Washington's 2025 trade with Canada is within 3% of the Embassy of Canada fact sheet. We get $7.12B / $15.8B; the Embassy has $7.0B / $16.1B.
- B.C. → Washington exports match Statistics Canada's published table.
- Sectors add up to totals.
- Jobs, GDP shares, duty rates and shares are in range.
- Sanity checks hold, e.g. WA aerospace jobs and WA GDP are the right order of magnitude.

---

## 6. Common tasks

### View the site on your laptop
```bash
git clone https://github.com/vatsalp2008/PNWER_Trade-Tariffs.git
cd PNWER_Trade-Tariffs/prototype
npm install
npm run dev        # open http://localhost:5173
```
You need Node.js 20.19+ or 22.12+ (22 LTS recommended). Full setup is in the [README](../README.md).

### Make any change
1. Create a branch: `git checkout -b your-name/what-you-are-changing`.
2. Edit, then run `npm run build` inside `prototype/`. It must pass.
3. Push and open a pull request. Check the Vercel preview link on the PR.
4. Merge when someone has reviewed it.

**Never commit API keys or anyone's personal details. The repo is public.**

### Add a media article ("Team pick")
Edit `prototype/src/data/news-curated.json` and add an entry to `items`:
```json
{
  "title": "Headline exactly as published",
  "url": "https://publisher.com/the-article",
  "date": "2026-10-09",
  "source": "Reuters",
  "jurisdictions": ["WA", "BC"],
  "sectors": ["forest"]
}
```
- `jurisdictions` and `sectors` are optional. They're guessed from the title if left out.
- Use the publisher's own link, never a Google News link.
- It appears after the next daily refresh, or immediately if you run the workflow by hand.

### Review a `tariff-watch` issue
1. Open the issue and read the linked Federal Register document.
2. If it changes tariffs on Canadian goods, add an event to `prototype/src/data/tariff-events.json` (next task).
3. Close the issue, saying what you did. Close it without changes if it doesn't affect the timeline.

### Add or verify a tariff event
Each event in `prototype/src/data/tariff-events.json` looks like this:
```json
{
  "id": "us-338",
  "date": "2026-08-22",
  "imposedBy": "US",
  "kind": "tariff",
  "measure": "Section 338 tariffs on Canadian alcohol, dairy & motor vehicles",
  "rate": "50%",
  "rateNum": 0.5,
  "usmcaExempt": "no",
  "businesses": ["beverages", "dairy", "autos"],
  "verified": false,
  "sourceUrl": "https://www.federalregister.gov/documents/…"
}
```

| Field | What to put |
|---|---|
| `id` | A short unique name |
| `date` | The date it takes effect |
| `end` | Optional: the date it stopped |
| `imposedBy` | `US` or `CA` |
| `kind` | `tariff`, `counter-tariff`, `relief` or `policy` |
| `rate` | Text as you'd say it |
| `rateNum` | The rate as a fraction |
| `usmcaExempt` | `yes`, `no`, `partial` or `n/a` |
| `businesses` | Business ids from `sectors.json`, or `"all"` |

**To verify an event:** open its `sourceUrl`, check the date, rate and products against the official text, then set `"verified": true`. **Never add an event without an official source.**

### Add a PNWER statement
Copy it from https://www.pnwer.org/trade-and-tariffs.html into `prototype/src/data/pnwer-engagement.json`, using the same fields as a team pick.

### Change the business list
1. Edit `prototype/src/data/sectors.json`. Each business has:
   - an `id` and `name`;
   - `hs` (product code prefixes; the longest match wins);
   - `naics` (industry codes for jobs, separate lists for `US` and `CA`).
   Each sector also has `bea` (BEA GDP line codes).
2. Rerun the pipeline (next task) so the data matches.
3. Run the fit check, since new names can make a fact sheet spill onto a third page.

### Run the data pipeline yourself
```bash
pip install -r pipeline/requirements.txt
python pipeline/fetch_news.py
python pipeline/watch_federal_register.py   # prints new tariff actions; opens no issues locally
python pipeline/build.py                    # needs CENSUS_API_KEY in prototype/.env.local
```
- The first `build.py` run downloads about 400 MB and can take 30–60 minutes. Later runs use a cache.
- More detail is in [pipeline/README.md](../pipeline/README.md).

### Check every fact sheet still fits on 2 pages
```bash
cd prototype
npm run build && npm run preview          # in one terminal
scripts/check-factsheets.sh "WA OR ID MT AK BC AB SK YT NT" "all ag energy mfg forest metals chem other"
```
Any line starting with `FAIL` names the sheet and how many pixels it spills over.

---

## 7. Where things live

```
.github/workflows/refresh.yml   daily refresh job
docs/
  WEBSITE_GUIDE.md              this guide
  DECISIONS.md                  every decision, tradeoff and limitation
pipeline/                       Python scripts that fetch and check the data
  build.py                      builds real.json (trade, economy, duties, scenario) + checks
  fetch_census.py, fetch_cimt.py, fetch_boc.py, fetch_economy.py, fetch_tariffs.py
  sections.py                   jobs, GDP, affordability and scenario calculations
  fetch_news.py                 builds news.json
  watch_federal_register.py     opens tariff-watch issues
  names.py                      readable product names
prototype/                      the website (Vite + React + TypeScript)
  src/pages/                    Dashboard.tsx, FactSheet.tsx, News.tsx
  src/components/               map, charts, tables, tiles, news list, watermark, PNG export
  src/data/
    sectors.json                sectors → businesses → product & industry codes (shared)
    tariff-events.json          curated tariff timeline (edit by hand)
    news-curated.json           team picks (edit by hand)
    pnwer-engagement.json       PNWER statements (edit by hand)
    real.json                   real data (written by the pipeline; don't edit)
    news.json                   updates feed (written by the pipeline; don't edit)
    mock.json                   sample data, only used if a real section is missing
    types.ts                    the exact shape of the data
    index.ts                    the one place the pages read data from
  src/index.css                 all styling (minimal, PNWER blue palette)
  scripts/check-factsheets.sh   2-page fit check
```

---

## 8. FAQ

**Why does a number say "at least"?**
Some detailed industries are confidential in U.S. job data, so the total is a lower bound.

**Why do Yukon and the Northwest Territories show "—" or "not published" in places?**
Their trade in some businesses is zero or tiny, and Statistics Canada reports some figures for the three territories together.

**Why don't our Washington numbers exactly match the Embassy of Canada fact sheet?**
They're within 2%. The Embassy used Census's February release; Census revises the previous year each June, and we use the latest release.

**Why is Canadian GDP by industry from 2022 when U.S. GDP is 2025?**
Statistics Canada publishes current-dollar GDP by detailed industry about three years late. The sheet always shows the year.

**Why do provinces show "foreign-owned" jobs instead of U.S.-owned?**
Statistics Canada doesn't publish a U.S.-only figure by province.

**Can I compare a state's job count with a province's?**
Not directly. U.S. figures count private payroll jobs; Canadian figures count all jobs, including self-employed.

**Is there any sample or fake data left?**
Only the "What businesses are saying" quotes. Everything else is official data. If a real section ever fails to load, the site falls back to sample data and clearly tags it "Sample".

**Where did the old "jobs supported by exports" number go?**
We removed it. Every way to estimate it relied on paid models or assumptions we couldn't defend. See `DECISIONS.md` D19.

**Who decides what goes on the tariff timeline?**
The team, through pull requests. The automatic watcher only *flags* new actions as issues.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **USMCA / CUSMA** | The U.S.–Mexico–Canada Agreement (called CUSMA in Canada), in force since July 1, 2020. It lets most goods that meet its rules cross duty-free. In July 2026 the U.S. declined to extend it, so it's now reviewed every year. |
| **Tariff / duty** | A tax on goods when they cross the border. |
| **Counter-tariff** | A tariff one country imposes in response to another's. |
| **Section 232 / 301 / 338 / 122** | U.S. laws used to impose tariffs: 232 (national security, e.g. steel, aluminum, lumber), 301 (unfair trade practices), 338 (discrimination against U.S. commerce), 122 (temporary balance-of-payments surcharge). |
| **IEEPA tariffs** | The 2025 "border" tariffs on Canadian goods under an emergency-powers law. The Supreme Court struck them down in February 2026. |
| **AD/CVD** | Anti-dumping and countervailing duties: special duties on specific products such as softwood lumber, collected separately from regular tariffs. |
| **MFN rate** | The standard ("most-favoured-nation") tariff a country charges trading partners without a trade deal. |
| **HS code** | The international product classification. 2 digits = chapter (e.g. 44 = wood); 4 digits = product group (e.g. 4407 = sawn lumber). |
| **NAICS** | The North American industry classification used for jobs and GDP (e.g. 3364 = aerospace manufacturing). |
| **Two-way trade** | Exports plus imports. |
| **Last 12 months** | The latest 12 months both countries have published (currently Sep 2025–Aug 2026). |
| **State of origin of movement** | How the U.S. assigns exports to states: where goods begin their journey to the border. |
| **Province of clearance** | How Canada assigns imports to provinces: where goods clear customs. |
| **Duty-free share** | The part of trade that paid no U.S. duty. |
| **Exposure** | Our quick rating of how much a place would pay in extra U.S. duties if USMCA ended. |

---

*Questions about how a number is calculated: see [`DECISIONS.md`](DECISIONS.md). Something wrong or confusing in this guide: open an issue or a pull request.*
