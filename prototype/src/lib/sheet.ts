// Shared by every 2-page sheet (fact sheets and corridor sheets).
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

const PAGE_W = 816 // 8.5in at 96 dpi

/** Shrinks the Letter-size pages to fit narrow screens (never in print). */
export function useFitWidth(ref: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setZoom(Math.min(1, (el.clientWidth - 8) / PAGE_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return zoom
}

/** Flags any page whose content no longer fits on its sheet of paper. */
export function useOverflowCheck(ref: RefObject<HTMLDivElement | null>, key: string) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      ref.current?.querySelectorAll<HTMLElement>('.sheet-page').forEach((page, k) => {
        const over = page.scrollHeight > page.clientHeight + 1
        page.dataset.overflow = String(over)
        if (over) console.warn(`Fact sheet ${key}: page ${k + 1} overflows by ${page.scrollHeight - page.clientHeight}px`)
      })
    }, 300)
    return () => window.clearTimeout(id)
  }, [ref, key])
}
