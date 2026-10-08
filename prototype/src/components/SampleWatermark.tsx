// Visible on every page and inside every exportable chart, so a screenshot or
// PNG of sample numbers can never pass as real data.

export function PageWatermark() {
  return (
    <div className="page-watermark" aria-hidden="true">
      <span>SAMPLE DATA</span>
    </div>
  )
}

export function CardWatermark() {
  return (
    <div className="card-watermark" aria-hidden="true">
      <span>SAMPLE DATA</span>
      <em className="card-stamp">SAMPLE DATA · not for citation</em>
    </div>
  )
}
