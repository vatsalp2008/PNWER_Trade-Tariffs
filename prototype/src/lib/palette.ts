// Colours for charts and the map, which need real hex values (SVG attributes, colour ramps).
// They mirror the :root variables in index.css; change both together.

export const BRAND_700 = '#1b4585'
export const BRAND_100 = '#d8edf5'
export const STONE = '#e3e9ea'
export const MUTED = '#5a6478'
export const CLAY = '#9c4a2b'
export const CLAY_100 = '#f4e6dc'
export const CLAY_DARK = '#8a4b2a'
export const OCHRE = '#b5793a'

/** Map fill for jurisdictions with no data. */
export const NO_DATA = '#dce3e5'
/** Light bars behind top-product rows. */
export const EXPORT_BAR = '#d5e9f2'
export const IMPORT_BAR = '#f1e4cf'

/** Map ramps: pale sky → sky blue → royal blue, and clay (decline) → neutral → brand blue (growth). */
export const SEQ_STOPS = ['#e4f1f6', '#9dd0e3', '#5a9cc8', BRAND_700]
export const DIV_STOPS = [CLAY, '#dcae93', '#eef1f2', '#9dd0e3', BRAND_700]
