import { toPng } from 'html-to-image'
import { useState, type RefObject } from 'react'

interface Props {
  target: RefObject<HTMLElement | null>
  fileName: string
}

/** Downloads the target element (chart card, watermark included) as a PNG for slides. */
export function ExportPngButton({ target, fileName }: Props) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!target.current) return
    setBusy(true)
    // While exporting, the watermark is drawn on top of the chart so no image leaves without it.
    target.current.classList.add('exporting')
    try {
      const url = await toPng(target.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains('no-export')),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName}.png`
      a.click()
    } finally {
      target.current?.classList.remove('exporting')
      setBusy(false)
    }
  }
  return (
    <button type="button" className="png-btn no-export no-print" onClick={run} disabled={busy} title="Download this chart as an image">
      {busy ? 'Saving…' : 'PNG'}
    </button>
  )
}
