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

import sectorsJson from './sectors.json'
import tariffEventsJson from './tariff-events.json'

type SectorJson = Omit<Sector, 'businesses' | 'id'> & {
  id: string
  businesses: (Omit<Business, 'products' | 'sector'> & { products: [string, string][] })[]
}

/** Sectors and businesses come from sectors.json, which the data pipeline also reads. */
export const SECTORS: Sector[] = (sectorsJson.sectors as unknown as SectorJson[]).map((s) => ({
  ...s,
  id: s.id as SectorId,
  businesses: s.businesses.map((x) => ({
    ...x,
    sector: s.id as SectorId,
    products: x.products.map(([name, hs]) => ({ name, hs })),
  })),
}))

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<SectorId, Sector>
export const BUSINESSES: Business[] = SECTORS.flatMap((s) => s.businesses)
export const BUSINESS_BY_ID = Object.fromEntries(BUSINESSES.map((x) => [x.id, x])) as Record<string, Business>

/** Curated in tariff-events.json (edit there). Compiled from public reporting; check `verified`. */
export const TARIFF_EVENTS: TariffEvent[] = (tariffEventsJson.events as TariffEvent[]).sort((a, b) => a.date.localeCompare(b.date))

/** Where each fact-sheet figure will come from once real data replaces the mock data. */
export const SOURCES = {
  tradeUS: 'U.S. Census Bureau, state trade by HS code',
  tradeCA: 'Adapted from Statistics Canada, CIMT (provincial trade by HS code)',
  partnerJur: 'Statistics Canada, CIMT (province × U.S. state)',
  jobsUS: 'BLS Quarterly Census of Employment & Wages; BLS LAUS',
  jobsCA: 'Adapted from Statistics Canada, tables 36-10-0489 and 14-10-0464',
  ownedUS: 'BEA, U.S. affiliates by country of owner (Table II.G 8)',
  ownedCA: 'Statistics Canada, table 36-10-0620',
  gdpUS: 'BEA, GDP by state & industry (SAGDP2) and population (SAINC1)',
  gdpCA: 'Adapted from Statistics Canada, tables 36-10-0711, 36-10-0222, 17-10-0005',
  tariffs: 'Federal Register; Finance Canada; USTR (curated tariff timeline)',
  duties: 'U.S. Census Bureau, imports from Canada with calculated duty (last 12 months)',
  mfn: 'U.S. Census Bureau, duties on EU and Japan imports, 2024',
  prices: 'BLS import price index (Canada); Statistics Canada CPI (18-10-0004)',
} as const
