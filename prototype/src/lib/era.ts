import { decimalYear } from './format'

// Era boundaries: USMCA entered into force Jul 1 2020; first U.S. tariffs on
// Canadian goods Mar 4 2025.
export const ERA = {
  start: 2018,
  usmca: 2020.5,
  tariffs: decimalYear('2025-03-04'),
  end: 2026.92,
}
