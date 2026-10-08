// Data contract for the explorer. The mock generator writes data in exactly
// this shape; a real data pipeline must produce the same shape later.
// All money values are USD millions unless a field name says otherwise.

export type Country = 'US' | 'CA'
export type JurisdictionId = 'WA' | 'OR' | 'ID' | 'MT' | 'AK' | 'BC' | 'AB' | 'SK' | 'YT' | 'NT'
export type SectorId = 'ag' | 'energy' | 'mfg' | 'forest' | 'metals' | 'chem'
export type BusinessId = string
/** 'all', a SectorId, or a BusinessId. */
export type ScopeId = string

export interface Jurisdiction {
  id: JurisdictionId
  name: string
  country: Country
  /** The country this jurisdiction trades with across the border. */
  partner: Country
  /** Covered in depth in the team's written assessment. */
  inDepth: boolean
  population: number
  households: number
}

export interface Product {
  name: string
  hs: string
}

export interface Business {
  id: BusinessId
  name: string
  sector: SectorId
  /** Share of imports that are everyday goods or production inputs (affordability lens). */
  everydayShare: number
  products: Product[]
}

export interface Sector {
  id: SectorId
  name: string
  /** One of the brief's named focus sectors. */
  focus: boolean
  color: string
  businesses: Business[]
}

export type TariffKind = 'tariff' | 'counter-tariff' | 'relief' | 'policy'
export type UsmcaExempt = 'yes' | 'no' | 'partial' | 'n/a'

export interface TariffEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** YYYY-MM-DD, when the measure stopped applying. */
  end?: string
  imposedBy: Country
  kind: TariffKind
  measure: string
  rate: string
  /** Headline rate as a fraction, used for duty estimates. */
  rateNum?: number
  usmcaExempt: UsmcaExempt
  businesses: BusinessId[] | 'all'
  /** Every policy event must be checked against an official source before real use. */
  verify: true
}

export interface Flow {
  exports: number
  imports: number
}

export interface ProductValue {
  name: string
  hs: string
  value: number
}

export interface PartnerShare {
  name: string
  share: number
}

export interface TradeRecord {
  /** Trade over the previous 12 months, sampled quarterly: [decimal year, exports, imports]. */
  rolling: [number, number, number][]
  /** Full calendar years only. */
  annual: { year: number; exports: number; imports: number }[]
  /** Latest 12 months of data. */
  last12: Flow
  /** The 12 months before that. */
  prev12: Flow
  topExports: ProductValue[]
  topImports: ProductValue[]
  /** Share of this jurisdiction's exports (in scope) that go to the partner, 0..1. */
  exportShareToPartner: number
  /** Share of this jurisdiction's imports (in scope) that come from the partner, 0..1. */
  importShareFromPartner: number
  /** Partner's rank among this jurisdiction's export markets. */
  partnerRank: number
  partnerJurisdictions: PartnerShare[]
  /** Export growth 2019→2024, fraction. */
  growthUsmcaToPartner: number
  growthUsmcaToWorld: number
  /** This jurisdiction's share of the partner country's imports in scope, 0..1. */
  shareOfPartnerImports: number
}

export interface EconomyRecord {
  sectorJobs: number
  jobsSupportedByExports: number
  sectorGdp: number
  /** Share of the jurisdiction's GDP, 0..1. */
  sectorGdpShare: number
}

export interface JurisdictionEconomy {
  /** USD per person. */
  gdpPerCapita: { year: number; value: number }[]
  /** Percent of working-age population employed. */
  employmentRate: { year: number; value: number }[]
  /** Companies owned from the partner country (e.g. Canadian-owned firms in WA). */
  partnerOwnedFirms: number
  partnerOwnedJobs: number
  totalGdp: number
}

export interface AffordabilityRecord {
  /** Imports of everyday goods and production inputs, last 12 months. */
  everydayAndInputImports: number
  /** Estimated duties on the last 12 months of imports at today's tariffs. */
  estDutiesToday: number
  /** USD per household (not millions). */
  dutiesPerHousehold: number
  /** Change in import prices from the partner over 12 months, fraction. */
  importPriceChange: number
}

export type Exposure = 'Low' | 'Moderate' | 'High'

export interface ScenarioRecord {
  /** Share of trade that currently enters duty-free under USMCA, 0..1. */
  usmcaDutyFreeShare: number
  /** Standard (non-USMCA) tariff this jurisdiction's exports would face. */
  mfnOnExports: number
  /** Standard (non-USMCA) tariff its imports from the partner would face. */
  mfnOnImports: number
  /** Extra duties per year if USMCA ends. */
  extraDuties: number
  /** extraDuties as a share of two-way trade. */
  extraDutiesShare: number
  exposure: Exposure
}

export interface Quote {
  sector: SectorId
  text: string
  attribution: string
}

export interface Meta {
  sample: true
  /** YYYY-MM of the latest month of trade data. */
  dataAsOf: string
  dataAsOfLabel: string
  generatedAt: string
  note: string
}

export type ByJurisdiction<T> = Record<JurisdictionId, T>
export type ByScope<T> = Record<ScopeId, T>

export interface MockData {
  meta: Meta
  trade: ByJurisdiction<ByScope<TradeRecord>>
  economy: ByJurisdiction<ByScope<EconomyRecord>>
  affordability: ByJurisdiction<ByScope<AffordabilityRecord>>
  scenario: ByJurisdiction<ByScope<ScenarioRecord>>
  jurisdictionEconomy: ByJurisdiction<JurisdictionEconomy>
  quotes: Quote[]
}
