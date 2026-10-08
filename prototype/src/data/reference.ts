// Reference data: jurisdictions, the sector → business taxonomy, and the
// tariff/policy event list. Unlike mock.json, these are meant to be real,
// but every policy event is flagged `verify` until checked against an
// official source (Federal Register, Canada Department of Finance, CBP).

import type { Business, Jurisdiction, JurisdictionId, Sector, SectorId, TariffEvent } from './types'

export const JURISDICTIONS: Jurisdiction[] = [
  { id: 'WA', name: 'Washington', country: 'US', partner: 'CA', inDepth: true, population: 7_960_000, households: 3_100_000 },
  { id: 'OR', name: 'Oregon', country: 'US', partner: 'CA', inDepth: false, population: 4_270_000, households: 1_720_000 },
  { id: 'ID', name: 'Idaho', country: 'US', partner: 'CA', inDepth: true, population: 2_000_000, households: 720_000 },
  { id: 'MT', name: 'Montana', country: 'US', partner: 'CA', inDepth: false, population: 1_140_000, households: 470_000 },
  { id: 'AK', name: 'Alaska', country: 'US', partner: 'CA', inDepth: false, population: 740_000, households: 270_000 },
  { id: 'BC', name: 'British Columbia', country: 'CA', partner: 'US', inDepth: true, population: 5_700_000, households: 2_250_000 },
  { id: 'AB', name: 'Alberta', country: 'CA', partner: 'US', inDepth: true, population: 4_960_000, households: 1_800_000 },
  { id: 'SK', name: 'Saskatchewan', country: 'CA', partner: 'US', inDepth: false, population: 1_240_000, households: 480_000 },
  { id: 'YT', name: 'Yukon', country: 'CA', partner: 'US', inDepth: false, population: 46_000, households: 19_000 },
  { id: 'NT', name: 'Northwest Territories', country: 'CA', partner: 'US', inDepth: false, population: 45_000, households: 16_000 },
]

export const JURISDICTION_BY_ID = Object.fromEntries(JURISDICTIONS.map((j) => [j.id, j])) as Record<
  JurisdictionId,
  Jurisdiction
>

export const COUNTRY_NAME = { US: 'the U.S.', CA: 'Canada' } as const
export const COUNTRY_ADJ = { US: 'U.S.', CA: 'Canadian' } as const

/** Main trading partners on the other side of the border (names only; shares are generated). */
export const PARTNER_JURISDICTIONS: Record<JurisdictionId, string[]> = {
  WA: ['British Columbia', 'Alberta', 'Ontario', 'Quebec', 'Saskatchewan'],
  OR: ['British Columbia', 'Ontario', 'Alberta', 'Quebec', 'Saskatchewan'],
  ID: ['Alberta', 'British Columbia', 'Ontario', 'Saskatchewan', 'Quebec'],
  MT: ['Alberta', 'Saskatchewan', 'British Columbia', 'Ontario', 'Manitoba'],
  AK: ['British Columbia', 'Yukon', 'Alberta', 'Ontario', 'Quebec'],
  BC: ['Washington', 'California', 'Oregon', 'Texas', 'Illinois'],
  AB: ['Illinois', 'Montana', 'Washington', 'Texas', 'Minnesota'],
  SK: ['Illinois', 'North Dakota', 'Minnesota', 'Montana', 'Texas'],
  YT: ['Alaska', 'Washington', 'California', 'Texas', 'New York'],
  NT: ['Alaska', 'Washington', 'New York', 'Texas', 'California'],
}

const b = (
  id: string,
  name: string,
  sector: SectorId,
  everydayShare: number,
  products: [string, string][],
): Business => ({ id, name, sector, everydayShare, products: products.map(([n, hs]) => ({ name: n, hs })) })

export const SECTORS: Sector[] = [
  {
    id: 'ag',
    name: 'Agriculture & Food',
    focus: true,
    color: '#6a8f4e',
    businesses: [
      b('beef', 'Beef & cattle', 'ag', 0.95, [
        ['Live cattle', '0102'],
        ['Fresh beef', '0201'],
        ['Frozen beef', '0202'],
        ['Live swine', '0103'],
        ['Fresh pork', '0203'],
      ]),
      b('grains', 'Grains & oilseeds', 'ag', 0.9, [
        ['Wheat', '1001'],
        ['Canola', '1205'],
        ['Barley', '1003'],
        ['Dried peas & lentils', '0713'],
        ['Oats', '1004'],
      ]),
      b('produce', 'Fruits & vegetables', 'ag', 0.95, [
        ['Apples & pears', '0808'],
        ['Cherries', '0809'],
        ['Frozen potato products', '2004'],
        ['Fresh potatoes', '0701'],
        ['Berries', '0810'],
      ]),
      b('seafood', 'Seafood', 'ag', 0.95, [
        ['Crab & shellfish', '0306'],
        ['Frozen fish', '0303'],
        ['Fish fillets', '0304'],
        ['Fresh fish', '0302'],
        ['Prepared fish', '1604'],
      ]),
      b('dairy', 'Dairy', 'ag', 0.95, [
        ['Cheese', '0406'],
        ['Milk & cream', '0401'],
        ['Whey', '0404'],
        ['Butter', '0405'],
      ]),
      b('beverages', 'Beverages', 'ag', 0.9, [
        ['Wine', '2204'],
        ['Beer', '2203'],
        ['Spirits', '2208'],
        ['Non-alcoholic drinks', '2202'],
      ]),
    ],
  },
  {
    id: 'energy',
    name: 'Energy',
    focus: true,
    color: '#c29a45',
    businesses: [
      b('crude', 'Crude oil & fuels', 'energy', 0.95, [
        ['Crude oil', '2709'],
        ['Refined fuels', '2710'],
      ]),
      b('natgas', 'Natural gas', 'energy', 1, [['Natural gas', '2711']]),
      b('electricity', 'Electricity', 'energy', 1, [['Electricity', '2716']]),
    ],
  },
  {
    id: 'mfg',
    name: 'Manufacturing',
    focus: true,
    color: '#5c7065',
    businesses: [
      b('aerospace', 'Aerospace', 'mfg', 0.3, [
        ['Aircraft', '8802'],
        ['Aircraft parts', '8803'],
        ['Jet engines', '8411'],
      ]),
      b('machinery', 'Machinery & farm equipment', 'mfg', 0.6, [
        ['Tractors', '8701'],
        ['Harvesting machinery', '8433'],
        ['Pumps', '8413'],
        ['Engines', '8408'],
        ['Construction equipment', '8429'],
      ]),
      b('autos', 'Autos & trucks', 'mfg', 0.7, [
        ['Cars', '8703'],
        ['Trucks', '8704'],
        ['Auto parts', '8708'],
      ]),
      b('electronics', 'Electronics & instruments', 'mfg', 0.5, [
        ['Computers', '8471'],
        ['Semiconductors', '8542'],
        ['Lab instruments', '9027'],
        ['Medical devices', '9018'],
      ]),
    ],
  },
  {
    id: 'forest',
    name: 'Forest Products',
    focus: false,
    color: '#7a5c3e',
    businesses: [
      b('lumber', 'Softwood lumber', 'forest', 0.9, [
        ['Softwood lumber', '4407'],
        ['Logs', '4403'],
      ]),
      b('woodprod', 'Wood products & furniture', 'forest', 0.85, [
        ['Plywood & panels', '4412'],
        ['Oriented strand board', '4410'],
        ['Builders’ woodwork', '4418'],
        ['Wood furniture', '9403'],
      ]),
      b('paper', 'Pulp & paper', 'forest', 0.8, [
        ['Wood pulp', '4703'],
        ['Paper & paperboard', '4810'],
        ['Newsprint', '4801'],
        ['Tissue', '4818'],
      ]),
    ],
  },
  {
    id: 'metals',
    name: 'Minerals & Metals',
    focus: false,
    color: '#8c8a7e',
    businesses: [
      b('steel', 'Steel', 'metals', 0.7, [
        ['Flat-rolled steel', '7208'],
        ['Steel pipe', '7304'],
        ['Steel structures', '7308'],
        ['Steel bars', '7214'],
      ]),
      b('aluminum', 'Aluminum', 'metals', 0.7, [
        ['Unwrought aluminum', '7601'],
        ['Aluminum plate', '7606'],
        ['Aluminum structures', '7610'],
      ]),
      b('critmin', 'Critical minerals & ores', 'metals', 0.5, [
        ['Copper', '7403'],
        ['Zinc ores', '2608'],
        ['Gold', '7108'],
        ['Diamonds', '7102'],
        ['Copper ores', '2603'],
      ]),
    ],
  },
  {
    id: 'chem',
    name: 'Chemicals & Fertilizers',
    focus: false,
    color: '#a0674b',
    businesses: [
      b('fertilizer', 'Fertilizer & potash', 'chem', 1, [
        ['Potash', '3104'],
        ['Nitrogen fertilizer', '3102'],
        ['Mixed fertilizers', '3105'],
        ['Sulphur', '2503'],
      ]),
      b('plastics', 'Plastics & rubber', 'chem', 0.6, [
        ['Polyethylene', '3901'],
        ['Plastic packaging', '3923'],
        ['Plastic sheets', '3920'],
        ['Tires', '4011'],
      ]),
      b('chemicals', 'Other chemicals', 'chem', 0.6, [
        ['Methanol & organics', '2905'],
        ['Pharmaceuticals', '3004'],
        ['Industrial gases', '2804'],
        ['Caustic soda', '2815'],
      ]),
    ],
  },
]

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<SectorId, Sector>
export const BUSINESSES: Business[] = SECTORS.flatMap((s) => s.businesses)
export const BUSINESS_BY_ID = Object.fromEntries(BUSINESSES.map((x) => [x.id, x])) as Record<string, Business>

const ev = (e: Omit<TariffEvent, 'verify'>): TariffEvent => ({ ...e, verify: true })

/** Compiled from public reporting as of Oct 2026. Verify each item before citing. */
export const TARIFF_EVENTS: TariffEvent[] = [
  ev({ id: 'us-ieepa', date: '2025-03-04', end: '2026-02-20', imposedBy: 'US', kind: 'tariff', measure: 'IEEPA "border" tariffs on Canadian goods', rate: '25% (10% energy & potash)', rateNum: 0.25, usmcaExempt: 'partial', businesses: 'all' }),
  ev({ id: 'ca-counter-1', date: '2025-03-04', end: '2025-09-01', imposedBy: 'CA', kind: 'counter-tariff', measure: 'Canadian counter-tariffs, first round (C$30B)', rate: '25%', rateNum: 0.25, usmcaExempt: 'no', businesses: ['beverages', 'produce', 'dairy', 'beef', 'plastics', 'chemicals', 'paper', 'machinery', 'electronics', 'woodprod'] }),
  ev({ id: 'us-ieepa-exempt', date: '2025-03-07', imposedBy: 'US', kind: 'relief', measure: 'USMCA-compliant goods exempted from IEEPA tariffs', rate: '0% for compliant goods', usmcaExempt: 'yes', businesses: 'all' }),
  ev({ id: 'us-232-metals', date: '2025-03-12', imposedBy: 'US', kind: 'tariff', measure: 'Section 232 tariffs on steel & aluminum', rate: '25%', rateNum: 0.25, usmcaExempt: 'no', businesses: ['steel', 'aluminum'] }),
  ev({ id: 'ca-counter-metals', date: '2025-03-13', imposedBy: 'CA', kind: 'counter-tariff', measure: 'Canadian counter-tariffs on U.S. steel & aluminum (C$29.8B)', rate: '25%', rateNum: 0.25, usmcaExempt: 'no', businesses: ['steel', 'aluminum', 'machinery', 'electronics'] }),
  ev({ id: 'us-232-autos', date: '2025-04-03', imposedBy: 'US', kind: 'tariff', measure: 'Section 232 tariffs on autos (non-U.S. content)', rate: '25%', rateNum: 0.25, usmcaExempt: 'partial', businesses: ['autos'] }),
  ev({ id: 'ca-counter-autos', date: '2025-04-09', imposedBy: 'CA', kind: 'counter-tariff', measure: 'Canadian counter-tariffs on U.S. autos', rate: '25%', rateNum: 0.25, usmcaExempt: 'no', businesses: ['autos'] }),
  ev({ id: 'us-232-metals-50', date: '2025-06-04', imposedBy: 'US', kind: 'tariff', measure: 'Section 232 steel & aluminum tariffs doubled', rate: '50%', rateNum: 0.5, usmcaExempt: 'no', businesses: ['steel', 'aluminum'] }),
  ev({ id: 'us-ieepa-35', date: '2025-08-01', end: '2026-02-20', imposedBy: 'US', kind: 'tariff', measure: 'IEEPA rate raised on non-USMCA goods', rate: '35%', rateNum: 0.35, usmcaExempt: 'yes', businesses: 'all' }),
  ev({ id: 'us-232-copper', date: '2025-08-01', imposedBy: 'US', kind: 'tariff', measure: 'Section 232 tariffs on semi-finished copper', rate: '50%', rateNum: 0.5, usmcaExempt: 'no', businesses: ['critmin'] }),
  ev({ id: 'us-lumber-adcvd', date: '2025-08-08', imposedBy: 'US', kind: 'tariff', measure: 'Softwood lumber anti-dumping & countervailing duties raised', rate: '~35% combined', rateNum: 0.35, usmcaExempt: 'no', businesses: ['lumber'] }),
  ev({ id: 'ca-counter-relief', date: '2025-09-01', imposedBy: 'CA', kind: 'relief', measure: 'Canada lifts counter-tariffs on CUSMA-compliant U.S. goods', rate: '0% for compliant goods', usmcaExempt: 'yes', businesses: ['beverages', 'produce', 'dairy', 'beef', 'plastics', 'chemicals', 'paper', 'machinery', 'electronics', 'woodprod'] }),
  ev({ id: 'us-232-wood', date: '2025-10-14', imposedBy: 'US', kind: 'tariff', measure: 'Section 232 tariffs on lumber, cabinets & furniture', rate: '10% lumber; 25% furniture', rateNum: 0.1, usmcaExempt: 'no', businesses: ['lumber', 'woodprod'] }),
  ev({ id: 'scotus-ieepa', date: '2026-02-20', imposedBy: 'US', kind: 'relief', measure: 'Supreme Court strikes down IEEPA tariffs', rate: 'IEEPA tariffs end', usmcaExempt: 'n/a', businesses: 'all' }),
  ev({ id: 'us-122', date: '2026-02-24', end: '2026-07-24', imposedBy: 'US', kind: 'tariff', measure: 'Section 122 temporary global tariff', rate: '10%', rateNum: 0.1, usmcaExempt: 'yes', businesses: 'all' }),
  ev({ id: 'usmca-review', date: '2026-07-01', imposedBy: 'US', kind: 'policy', measure: 'USMCA review: U.S. declines to extend; annual reviews begin', rate: '—', usmcaExempt: 'n/a', businesses: 'all' }),
  ev({ id: 'us-301', date: '2026-07-24', imposedBy: 'US', kind: 'tariff', measure: 'Section 301 tariffs on Canadian goods', rate: '10%', rateNum: 0.1, usmcaExempt: 'yes', businesses: 'all' }),
  ev({ id: 'us-338', date: '2026-08-22', imposedBy: 'US', kind: 'tariff', measure: 'Section 338 tariffs on selected Canadian goods', rate: '50%', rateNum: 0.5, usmcaExempt: 'no', businesses: ['autos', 'beverages', 'dairy', 'paper', 'woodprod', 'plastics', 'electronics'] }),
  ev({ id: 'ca-counter-2026', date: '2026-09-08', imposedBy: 'CA', kind: 'counter-tariff', measure: 'New Canadian counter-tariffs (C$27.6B)', rate: '15–50%', rateNum: 0.25, usmcaExempt: 'no', businesses: ['steel', 'aluminum', 'dairy', 'machinery', 'paper', 'woodprod', 'electronics', 'seafood'] }),
  ev({ id: 'us-bans', date: '2026-09-29', imposedBy: 'US', kind: 'tariff', measure: 'U.S. import bans: alcohol, dairy ingredients, whey, sugar', rate: 'Ban', rateNum: 1, usmcaExempt: 'no', businesses: ['beverages', 'dairy'] }),
]

/** Where each fact-sheet figure will come from once real data replaces the mock data. */
export const SOURCES = {
  tradeUS: 'U.S. Census Bureau, state trade by HS code',
  tradeCA: 'Statistics Canada, provincial trade by HS code',
  partnerJur: 'ISED Trade Data Online (province × U.S. state)',
  jobsUS: 'BLS Quarterly Census of Employment & Wages',
  jobsCA: 'Statistics Canada Labour Force Survey',
  exportJobs: 'Estimate: exports × official jobs-per-$ ratio (ITA / Statistics Canada)',
  ownedUS: 'BEA, U.S. affiliates of foreign multinationals',
  ownedCA: 'Statistics Canada, foreign-controlled enterprises',
  gdpUS: 'BEA, GDP by state & industry',
  gdpCA: 'Statistics Canada, GDP by province & industry',
  tariffs: 'Tariff tracker (Federal Register; Canada Dept. of Finance)',
  mfn: 'USITC Harmonized Tariff Schedule; CBSA Customs Tariff',
  usmcaUse: 'USITC DataWeb (imports by trade program); Statistics Canada',
  prices: 'BLS import price index; Statistics Canada CPI',
} as const
