import { useMemo } from 'react'
import { SHOP_SETS, openPack, cardValue, fmtMoney, hitGemRate, marketMult, round2 } from '../game/engine'
import { useGame } from '../game/store'
import { useOpen, bigScreen } from '../ui/Collapse'

// Buy-tab intel panels, each gated behind its upgrade (they render null unowned):
//   📈 Hobby Wire (upgrades.hobbyWire) — demand: what walk-ins asked for and you couldn't
//      produce (the demand board's fortnight log, tallied), plus the market's movers.
//   📐 Breaker's Almanac (upgrades.almanac) — rip EV per set: Monte-Carlo pack EV through
//      the REAL openPack/cardValue path (same definition as `npm run sim`'s RIP EV gate),
//      so the numbers ride the living market and match the economy the sim enforces.

// Sticky open/closed state now shared from ui/Collapse (default: open on desktop only —
// on a phone these panels stack in front of the actual shop shelves).

const trendPct = (mult, hist) => (hist && hist.length > 1 ? mult / hist[0] - 1 : 0)
const TrendTag = ({ pct }) => Math.abs(pct) < 0.005 ? <span className="muted">→</span>
  : <span style={{ color: pct > 0 ? 'var(--green)' : 'var(--red)' }}>{pct > 0 ? '↑' : '↓'}{Math.abs(pct * 100).toFixed(0)}%</span>

export function HobbyWire() {
  const owned = useGame(s => !!s.upgrades.hobbyWire)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const demandLog = useGame(s => s.demandLog)
  const marketMults = useGame(s => s.marketMults)
  const marketHistory = useGame(s => s.marketHistory)
  const [open, toggle] = useOpen('pv-wire-open', bigScreen())
  if (!owned) return null

  // Tally the fortnight's missed walk-in asks by item — the same aggregation as the Store
  // tab's demand board, compressed to pills for sourcing decisions.
  const asks = Object.entries((demandLog || []).reduce((m, e) => {
    const k = `${e.kind === 'card' ? '🃏' : e.kind === 'bulk' ? '🗑️' : '📦'} ${e.what}`
    m[k] = (m[k] || 0) + 1; return m
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6)

  // Movers: every shop set's live mult + drift since the history ring's oldest sample.
  const movers = SHOP_SETS.map(s => {
    const mult = marketMults?.[s.id] ?? marketMult(s.id) ?? 1
    return { s, mult, pct: trendPct(mult, marketHistory?.[s.id]) }
  })
  const hot = [...movers].sort((a, b) => b.mult - a.mult).slice(0, 3).filter(m => m.mult >= 1.03)
  const soft = [...movers].sort((a, b) => a.mult - b.mult).slice(0, 2).filter(m => m.mult <= 0.97)

  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head" style={{ cursor: 'pointer' }} onClick={toggle}>
        📈 Hobby Wire <span className="muted">— demand at your counter · market movers</span>
        <span className="muted" style={{ marginLeft: 'auto' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>🗣️ Asked for &amp; missed:</span>
            {asks.length === 0
              ? <span className="muted" style={{ fontSize: 12.5 }}>
                  {hasStore ? 'nothing this fortnight — the floor had what the town wanted.' : 'no counter yet — walk-in demand starts with a Brick-and-Mortar Store.'}
                </span>
              : asks.map(([what, n]) => (
                  <span key={what} className="pill" title="Walk-ins asked for this and left empty-handed (last 14 days). Stock it and they stop leaving.">
                    {what}{n > 1 ? <b> ×{n}</b> : null}
                  </span>
                ))}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>📊 Movers:</span>
            {hot.length === 0 && soft.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>market's flat — no set far off ×1.00.</span>}
            {hot.map(({ s, mult, pct }) => (
              <span key={s.id} className="pill" style={{ color: 'var(--gold)' }} title="Running hot — sealed you hold here is worth more, and rips pay out closer to the pack price.">
                🔥 {s.name} ×{mult.toFixed(2)} <TrendTag pct={pct} />
              </span>
            ))}
            {soft.map(({ s, mult, pct }) => (
              <span key={s.id} className="pill" title="Running soft — weak sell prices, but the cheap moment to buy sealed you believe in.">
                🧊 {s.name} ×{mult.toFixed(2)} <TrendTag pct={pct} />
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function BreakersAlmanac() {
  const owned = useGame(s => !!s.upgrades.almanac)
  const currentDay = useGame(s => s.currentDay)
  const marketMults = useGame(s => s.marketMults)
  const marketHistory = useGame(s => s.marketHistory)
  const [open, toggle] = useOpen('pv-almanac-open', bigScreen())

  // Monte-Carlo pack EV per shop set through the real openPack/cardValue path — the same
  // number the sim's RIP-EV gate computes, at a UI-friendly N. Recomputed once per game-day
  // (the market drifts on the day tick) and only while the panel is open. N=400 keeps a fat-
  // tailed mean readable as a percentage without a noticeable stall (~7k packs total).
  const rows = useMemo(() => {
    if (!owned || !open) return []
    const N = 400
    const out = []
    for (const s of SHOP_SETS) {
      const products = (s.products || []).filter(p => p.price > 0 && p.packs >= 1)
      const booster = products.find(p => p.packs === 1 && /booster pack/i.test(p.type || ''))
      if (!booster) continue
      let total = 0
      for (let i = 0; i < N; i++) for (const c of openPack(s)) total += cardValue(c)
      const evPack = total / N
      // Best value per dollar across the set's products — usually the box (cheapest per pack).
      const best = products.reduce((b, p) => {
        const pct = (evPack * p.packs) / p.price
        return !b || pct > b.pct ? { p, pct } : b
      }, null)
      const mult = marketMults?.[s.id] ?? marketMult(s.id) ?? 1
      out.push({
        s, evPack: round2(evPack), booster, packPct: evPack / booster.price,
        best, gem: hitGemRate(s, 100, 10), mult, trend: trendPct(mult, marketHistory?.[s.id]),
      })
    }
    return out.sort((a, b) => b.best.pct - a.best.pct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned, open, currentDay])
  if (!owned) return null

  const cols = 'minmax(130px,1.4fr) minmax(110px,1fr) minmax(120px,1fr) minmax(70px,0.7fr) minmax(80px,0.8fr)'
  const pctCell = (pct) => (
    <b style={{ color: pct >= 1 ? 'var(--gold)' : pct >= 0.75 ? 'var(--green)' : 'inherit' }}>{(pct * 100).toFixed(0)}%</b>
  )
  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head" style={{ cursor: 'pointer' }} onClick={toggle}>
        📐 Breaker's Almanac <span className="muted">— rip EV by set, riding today's market</span>
        <span className="muted" style={{ marginLeft: 'auto' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div style={{ minWidth: 560 }}>
              <div className="muted" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, fontSize: 11.5, padding: '2px 4px' }}>
                <span>Set</span><span>EV / pack</span><span>Best rip</span><span title="Of the set's hit lineup, the share worth $100+ as a PSA 10 — how stacked the chase is.">🎯 Chase</span><span>Market</span>
              </div>
              {rows.map(r => (
                <div key={r.s.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, fontSize: 12.5, padding: '5px 4px', borderTop: '1px solid #ffffff14', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700 }}>{r.s.name}</span>
                  <span>{fmtMoney(r.evPack)} <span className="muted">/ {fmtMoney(r.booster.price)}</span> · {pctCell(r.packPct)}</span>
                  <span><span className="muted">{r.best.p.type}</span> · {pctCell(r.best.pct)}</span>
                  <span>{(r.gem.pct * 100).toFixed(0)}%</span>
                  <span>×{r.mult.toFixed(2)} <TrendTag pct={r.trend} /></span>
                </div>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 4px 2px' }}>
            Monte-Carlo, {`N=400`} packs/set through the real pack odds, at today's market. Ripping is designed to
            trail the pack price on average — the chase is the point — so shop the <b>spread</b>: which set wastes
            least, and when a 🔥 market pushes a box toward (or past) break-even.
          </p>
        </>
      )}
    </div>
  )
}
