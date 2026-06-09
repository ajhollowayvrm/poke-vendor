import { fmtMoney } from '../game/engine'

// A compact price-history chart for a single card: a filled area + line of the card's
// value over the recent living-market window, with the current price and the % change
// across the window. Feed it a dollar series (oldest → newest) from engine.valueHistory.
// Needs ≥ 2 points; with fewer it shows a "no trend yet" note — the market history fills
// in one sample per game-day, so a fresh save has nothing to plot.
export default function PriceChart({ series }) {
  const pts = (series || []).filter(v => typeof v === 'number')
  if (pts.length < 2) {
    return (
      <div className="price-chart pc-empty muted">
        📈 Price history — play a few days to watch this card move with the market.
      </div>
    )
  }
  // viewBox units; the SVG itself stretches to the container width (preserveAspectRatio
  // none) while a non-scaling stroke keeps the line crisp at any rendered size.
  const W = 260, H = 60, padX = 3, padY = 8
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const first = pts[0], last = pts[pts.length - 1]
  const up = last >= first
  const stroke = up ? 'var(--green)' : 'var(--red)'
  const x = i => padX + (i / (pts.length - 1)) * (W - padX * 2)
  const y = v => padY + (1 - (v - min) / span) * (H - padY * 2)
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${padX.toFixed(1)},${H} ${line} ${(W - padX).toFixed(1)},${H}`
  const pct = first > 0 ? Math.round(((last - first) / first) * 100) : 0
  const gid = up ? 'pcgrad-up' : 'pcgrad-down'

  return (
    <div className="price-chart">
      <div className="pc-head">
        <span className="pc-title">📈 Price history</span>
        <span className="pc-now">{fmtMoney(last)}</span>
        <span className="pc-chg" style={{ color: stroke }}>
          {up ? '▲' : '▼'} {up ? '+' : ''}{pct}%
          <span className="muted"> · {pts.length}d</span>
        </span>
      </div>
      <svg className="pc-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label={`Price history: ${fmtMoney(first)} to ${fmtMoney(last)} over ${pts.length} days`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gid})`} stroke="none" />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="2"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="pc-axis muted">
        <span>lo {fmtMoney(min)}</span>
        <span>hi {fmtMoney(max)}</span>
      </div>
    </div>
  )
}
