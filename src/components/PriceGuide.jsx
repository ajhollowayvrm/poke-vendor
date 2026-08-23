import { useMemo, useState } from 'react'
import { SETS, rawValue, fmtMoney, rarityRank, marketMult, cardImg, cardNumber } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'

// A reference price guide: pick a set, browse every card with LIVE market prices
// (the living-market multiplier rides through rawValue, so values move day to day).
export default function PriceGuide() {
  const [setId, setSetId] = useState(SETS[0].id)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('number')
  // Subscribe to the persisted mults so the guide re-renders as the market drifts.
  const marketMults = useGame(s => s.marketMults)
  const marketHistory = useGame(s => s.marketHistory)

  const set = SETS.find(s => s.id === setId) || SETS[0]
  // Split the dropdown into the sets you can buy in the shop vs. vintage/legacy sets that
  // only turn up randomly on vendor shelves and at shows (sealed packs + loose singles in bins).
  const shopSets = SETS.filter(s => !s.vintage)
  const vintageSets = SETS.filter(s => s.vintage)
  // Current multiplier + recent history for THIS set (engine map is the source of truth;
  // marketMults is the same data, used here only to trigger re-render on drift).
  const mult = marketMults[set.id] ?? marketMult(set.id) ?? 1
  const history = marketHistory[set.id] || []
  const cards = useMemo(() => {
    let list = set.cards.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    list = [...list].sort((a, b) => {
      if (sort === 'value') return rawValue(b) - rawValue(a)
      if (sort === 'rarity') return rarityRank(b.rarity) - rarityRank(a.rarity)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return numOf(cardNumber(a)) - numOf(cardNumber(b)) // number (default)
    })
    return list
    // mult in deps so re-sorting by value tracks the live market
  }, [set, q, sort, mult])

  const total = set.cards.reduce((sum, c) => sum + rawValue(c), 0)
  const priciest = [...set.cards].sort((a, b) => rawValue(b) - rawValue(a))[0]

  return (
    <>
      <div className="banner mt-6">
        💲 Price guide — live TCGplayer market values, with the living market moving each set day to day. Refresh the base snapshot from the ⚙️ menu.
      </div>

      <div className="toolbar">
        <select value={setId} onChange={e => { setSetId(e.target.value); setQ('') }}>
          <optgroup label="In the shop">
            {shopSets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cards.length} total)</option>)}
          </optgroup>
          <optgroup label="Vintage · vendor-only">
            {vintageSets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cards.length} total)</option>)}
          </optgroup>
        </select>
        <input className="search" placeholder="Search cards…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="number">Sort: Number</option>
          <option value="value">Sort: Value</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        <span className="pill" style={{ marginLeft: 'auto' }}>Set value ≈ {fmtMoney(total)}</span>
        {priciest && <span className="pill">Chase: {priciest.name} {fmtMoney(rawValue(priciest))}</span>}
      </div>

      {/* Living-market trend for shop sets (a chip + sparkline). Vintage/legacy sets don't
          drift with the daily market, so they get a vendor-only note instead. */}
      <div className="toolbar" style={{ marginTop: -4 }}>
        {set.vintage ? (
          <span className="pill" style={{ color: '#ffd700', borderColor: '#ffd70066', display: 'inline-flex', gap: 6, alignItems: 'center' }}
            title="You can't buy this set from the regular shop catalog. Sealed vintage turns up randomly on vendor shelves (check weekly) and always at shows; loose singles show up in booth bins at bigger shows. Build vendor rapport and they'll hold pieces for you.">
            🗝️ Vintage · find it on vendor shelves & at shows
          </span>
        ) : (
          <>
            <TrendChip mult={mult} />
            <Sparkline history={history} />
          </>
        )}
      </div>

      {set.logo && <img src={set.logo} alt={set.name} style={{ height: 48, objectFit:'contain', margin:'4px 0 12px', filter:'drop-shadow(0 4px 8px #0008)' }} />}

      <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))' }}>
        {cards.map(c => (
          <div key={c.id} className="priceitem">
            <img src={cardImg(c)} alt={c.name} loading="lazy" decoding="async" />
            <div className="pname" title={c.name}>{c.name}</div>
            <div className="prow">
              <span className="ptag" style={{ color: rarityColor(c.rarity) }}>#{cardNumber(c)}</span>
              <span className="pval">{c.price != null || c.rarity ? fmtMoney(rawValue(c)) : '—'}</span>
            </div>
          </div>
        ))}
      </div>
      {cards.length === 0 && <div className="empty">No cards match “{q}”.</div>}
    </>
  )
}

// A chip showing the set's current market multiplier and which way it's leaning.
// Within ±1.5% of neutral it reads "steady"; above/below it goes hot/cold with an arrow.
function TrendChip({ mult }) {
  const pct = Math.round((mult - 1) * 100)
  const steady = Math.abs(mult - 1) < 0.015
  const up = mult > 1
  const color = steady ? 'var(--muted, #8a93a6)' : up ? '#3ec46d' : '#e2596b'
  const arrow = steady ? '→' : up ? '▲' : '▼'
  const label = steady ? 'Market steady' : `${up ? '+' : ''}${pct}% vs base`
  return (
    <span className="pill" style={{ color, borderColor: color, display: 'inline-flex', gap: 6, alignItems: 'center' }} title="The living market drifts each game-day. A live price refresh resets it to base.">
      {arrow} {label} · {mult.toFixed(2)}×
    </span>
  )
}

// Tiny inline SVG sparkline of the recent per-day multiplier samples for a set.
// Scales to the actual range with a little padding; flat when there's nothing yet.
function Sparkline({ history }) {
  const pts = (history || []).filter(v => typeof v === 'number')
  if (pts.length < 2) return <span className="pill muted" style={{ opacity: 0.6 }}>No trend yet — play a few days</span>
  const W = 120, H = 22, pad = 2
  const min = Math.min(...pts), max = Math.max(...pts)
  const span = max - min || 1
  const last = pts[pts.length - 1], first = pts[0]
  const stroke = last >= first ? '#3ec46d' : '#e2596b'
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / span) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ verticalAlign: 'middle' }} aria-label="market trend sparkline">
      <polyline points={coords} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function numOf(n) { const m = String(n).match(/\d+/); return m ? parseInt(m[0], 10) : 9999 }
