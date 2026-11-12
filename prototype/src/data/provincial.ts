/** Separate NAPCS/CAD contract: never join these groups directly to HS tariff scopes. */
export interface ProvincialRow {
  province: string
  product: string
  partner: string
  month: string
  valueCad: number
  vectorId: number
  coordinate: string
  sourceValue: number
  releaseTime: string
}

export interface ProvincialSummary {
  province: string
  product: string
  month: string
  usCad: number
  worldCad: number
  usShare: number | null
  yoy: number | null
  kind: 'observed-change'
  source: string
}

export interface ProvincialDataset {
  schemaVersion: number
  source: string
  table: string
  basis: string
  unit: string
  classification: string
  firstMonth: string
  lastMonth: string
  sourceReleaseTime: string
  provinces: Record<string, string>
  products: Record<string, string>
  partners: Record<string, string>
  rows: ProvincialRow[]
  summaries: ProvincialSummary[]
  limitations: string[]
}

export interface ProvincialManifest {
  schemaVersion: number
  version: string
  generatedAt: string
  retrievedAt: string
  lastMonth: string
  observationCount: number
  source: string
  files: Record<string, string>
  quality: {
    passed: boolean
    scope: string
    checks: { name: string; passed: boolean; detail: string }[]
    warnings: string[]
  }
  provenance: { file: string; url: string; sha256: string }[]
}

export interface ProvincialBundle { manifest: ProvincialManifest; dataset: ProvincialDataset; base: string }

async function checkedResponse(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-cache' })
  if (!response.ok) throw new Error(`Data request failed (${response.status}). Please retry later.`)
  return response
}

export async function loadProvincial(signal?: AbortSignal): Promise<ProvincialBundle> {
  const root = `${import.meta.env.BASE_URL}data/provincial/`
  const manifest: ProvincialManifest = await (await checkedResponse(`${root}latest.json`, signal)).json()
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{20}$/.test(manifest.version)
      || manifest.quality?.passed !== true || !manifest.quality.checks?.length
      || manifest.quality.checks.some((c) => c.passed !== true)) {
    throw new Error('This data version has not passed publication checks.')
  }
  const base = `${root}versions/${manifest.version}/`
  const buffer = await (await checkedResponse(`${base}dataset.json`, signal)).arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.files['dataset.json']) throw new Error('Data checksum mismatch. Please reload to obtain a consistent version.')
  const dataset: ProvincialDataset = JSON.parse(new TextDecoder().decode(buffer))
  if (dataset.schemaVersion !== 1 || dataset.unit !== 'CAD' || dataset.basis !== 'Domestic export'
      || dataset.lastMonth !== manifest.lastMonth || !Array.isArray(dataset.rows)
      || dataset.rows.length !== manifest.observationCount || !Array.isArray(dataset.summaries)) {
    throw new Error('The data contract does not match this page.')
  }
  return { manifest, dataset, base }
}

export function monthlySelection(data: ProvincialDataset, province: string, product: string, count: number) {
  const selection = data.rows.filter((r) => r.province === province && r.product === product)
  const world = new Map(selection.filter((r) => r.partner === 'world').map((r) => [r.month, r.valueCad]))
  return selection.filter((r) => r.partner === 'us').sort((a, b) => a.month.localeCompare(b.month)).slice(-count)
    .map((r) => ({ ...r, worldCad: world.get(r.month) ?? null }))
}

export function selectionCsv(data: ProvincialDataset, province: string, product: string, count: number): string {
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const headers = ['province', 'product', 'month', 'us_exports_cad', 'world_exports_cad', 'us_share', 'us_vector_id', 'source']
  const rows = monthlySelection(data, province, product, count).map((r) => [data.provinces[province], data.products[product],
    r.month, r.valueCad, r.worldCad, r.worldCad !== null && r.worldCad > 0 ? r.valueCad / r.worldCad : null, r.vectorId, data.source])
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')
}
