import { SiteHeader } from '../components/SiteHeader'
import { updatedLine } from '../data'

const GROUPS: { title: string; terms: [string, string][] }[] = [
  {
    title: 'Money, dates and missing figures',
    terms: [
      ['US$', 'All dollar amounts are U.S. dollars. Canadian figures are converted from Canadian dollars at the Bank of Canada’s average rate for the period. One currency lets you compare all 10 jurisdictions directly.'],
      ['Last 12 months', 'The most recent 12 months of trade data that both countries have published. Trade data comes out about 5–6 weeks after each month ends.'],
      ['Updated · trade data through', '“Updated” is the last date the site’s content changed; it checks for new data every day. “Trade data through” is the latest month of trade data published so far.'],
      ['Not available', 'The source doesn’t publish this figure, usually to protect one company’s confidential numbers, or because it isn’t broken down to that industry or place. We don’t estimate it.'],
      ['Minimum', 'Some industries in this total aren’t published, so the real number is at least this high.'],
      ['Years', 'Each source publishes on its own schedule, so every figure shows its year. For example, Canadian GDP by industry is only available up to 2022.'],
    ],
  },
  {
    title: 'Trade',
    terms: [
      ['Exports and imports', 'For U.S. states: trade with Canada. For provinces and territories: trade with the United States.'],
      ['Total trade', 'Exports plus imports with the partner country. We never add the U.S. and Canadian sides together, because both record the same shipments.'],
      ['Export market rank', 'Where the partner country ranks among all the places this jurisdiction sells to. #1 means it is the biggest buyer.'],
      ['Main trading partners', 'The states or provinces on the other side of the border that this jurisdiction trades with most.'],
      ['HS code', 'The international product code used by customs, e.g. HS 4407 is sawn lumber.'],
    ],
  },
  {
    title: 'Tariffs and USMCA',
    terms: [
      ['Tariff (or duty)', 'A tax on imported goods, paid by the importer.'],
      ['USMCA', 'The United States–Mexico–Canada Agreement: the trade deal that lets most goods made in the three countries cross their borders without tariffs, as long as they meet its rules.'],
      ['Tariff-free today', 'The share of trade that currently crosses without U.S. tariffs, mostly because it qualifies under USMCA.'],
      ['Today’s tariffs', 'What is actually being paid now, with USMCA in place, based on U.S. customs collections over the last 12 months.'],
      ['If USMCA ends', 'Our estimate, not a forecast. Goods that cross tariff-free today would pay the standard U.S. rate: what the U.S. charged the same products from the EU and Japan in 2024. It assumes businesses don’t change what they buy, and it leaves out Canada’s tariffs on U.S. goods.'],
      ['Risk level (Low, Moderate, High)', 'How hard a jurisdiction’s trade would be hit if USMCA ends, measured as extra U.S. tariffs as a share of that trade. Low: under 1%. Moderate: 1% to 2.5%. High: 2.5% or more.'],
      ['Section 232, 301, 338 and IEEPA', 'U.S. laws used to put tariffs on Canadian goods: 232 for national security (e.g. steel, aluminum, lumber), 301 for unfair trade practices, 338 for discrimination against U.S. businesses, and IEEPA emergency powers (struck down by the Supreme Court in Feb 2026).'],
      ['Counter-tariff', 'A tariff Canada puts on U.S. goods in response to U.S. tariffs.'],
      ['Anti-dumping and countervailing duties', 'Extra duties on specific products found to be sold below fair value or subsidized, mainly softwood lumber here. Our tariff figures leave these out.'],
    ],
  },
  {
    title: 'PNWER’s four lenses',
    terms: [
      ['Economic integration', 'How tied together the two economies are, e.g. the share of exports that goes across the border.'],
      ['Competitiveness', 'Whether businesses are gaining or losing ground, e.g. export growth to the partner compared with the rest of the world.'],
      ['Affordability', 'What tariffs cost businesses and households, e.g. tariffs paid and changes in prices.'],
      ['Employment', 'Jobs in the industries that make the goods being traded.'],
    ],
  },
  {
    title: 'Jobs and the economy',
    terms: [
      ['Industries that make traded goods', 'Farming, fishing, forestry, mining, energy and manufacturing: the industries that produce the goods in the trade data.'],
      ['Jobs at Canadian-owned companies', 'U.S. jobs at companies owned from Canada (BEA). For provinces, Statistics Canada only publishes jobs at foreign-owned multinationals from all countries combined.'],
      ['GDP', 'The value an industry or economy produces in a year.'],
      ['In-depth jurisdiction', 'Washington, Idaho, British Columbia and Alberta: the four PNWER asked us to study in more detail.'],
      ['Focus sector', 'Agriculture & food, energy and manufacturing: the sectors named in the project brief.'],
    ],
  },
]

/** Plain-language definitions of every term used on the dashboard and fact sheets. */
export function Glossary() {
  return (
    <div className="app">
      <SiteHeader />
      <main className="dash">
        <p className="intro">What the terms on the dashboard and fact sheets mean. {updatedLine()}.</p>
        {GROUPS.map((g) => (
          <section className="card" key={g.title}>
            <h3>{g.title}</h3>
            <dl className="glossary">
              {g.terms.map(([term, text]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </main>
    </div>
  )
}
