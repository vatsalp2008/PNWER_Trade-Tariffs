import { tariffStatus } from '../data'
import type { ScopeId } from '../data/types'

export function TariffChips({ scope }: { scope: ScopeId }) {
  const s = tariffStatus(scope)
  return (
    <span className="chips">
      {s.us === 'tariffed' && <span className="chip chip-us">U.S. tariff</span>}
      {s.us === 'exempt' && <span className="chip chip-exempt">U.S. tariff · USMCA-exempt</span>}
      {s.ca === 'tariffed' && <span className="chip chip-ca">Canadian counter-tariff</span>}
      {s.us === 'none' && s.ca === 'none' && <span className="chip">No tariff</span>}
    </span>
  )
}
