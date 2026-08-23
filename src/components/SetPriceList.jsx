import { useMemo, useState } from 'react'
import { setById, rawValue, psaValueAt, fmtMoney, rarityRank, cardImg, cardNumber } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'

// The full price sheet for one set — every card with its live raw market value and the
// "if it gemmed" PSA 10 / PSA 9 estimates beside it. Code-split + only mounted when the
// player taps "price list" in the sealed modal, so a 250-card set's worth of art never
// loads until it's actually wanted. Default sort is Value (chase on top), so a glance
// tells you whether this is a top-heavy chase set or a deep one where everything's worth
// something (a Skyridge). Rides the living market (rawValue/psaValueAt do).
export default function SetPriceList({ setId }) {
  const set = setById(setId)
  const marketMults = useGame(s => s.marketMults) // re-render on market drift
  const [sort, setSort] = useState('value')
  const [q, setQ] = useState('')

  const cards = useMemo(() => {
    if (!set) return []
    const needle = q.trim().toLowerCase()
    let list = needle
      ? set.cards.filter(c => c.name.toLowerCase().includes(needle) || String(cardNumber(c)).toLowerCase().includes(needle))
      : set.cards
    return [...list].sort((a, b) => {
      if (sort === 'rarity') return rarityRank(b.rarity) - rarityRank(a.rarity) || rawValue(b) - rawValue(a)
      if (sort === 'number') return numOf(cardNumber(a)) - numOf(cardNumber(b))
      if (sort === 'name') return a.name.localeCompare(b.name)
      return rawValue(b) - rawValue(a) // value (default) — chase first
    })
    // marketMults in deps so a value sort re-orders as the market drifts
  }, [set, q, sort, marketMults])

  if (!set) return null

  return (
    <>
      <div className="setprice-head">
        {set.logo && <img src={set.logo} alt={set.name} className="setprice-logo" decoding="async" />}
        <div style={{ minWidth: 0 }}>
          <b>{set.name}</b>
          <div className="cap">{set.cards.length} cards · live market</div>
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="value">Sort: Value</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="number">Sort: Number</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>
      <input className="search" placeholder="Search cards…" value={q} onChange={e => setQ(e.target.value)}
        style={{ width: '100%', margin: '10px 0 4px', boxSizing: 'border-box' }} />

      <div className="setprice-grid">
        {cards.map(c => (
          <div key={c.id} className="setprice-cell">
            <img src={cardImg(c)} alt={c.name} loading="lazy" decoding="async" />
            <div className="spc-body">
              <div className="spc-name" title={c.name}>{c.name}</div>
              <div className="spc-rarity" style={{ color: rarityColor(c.rarity) }}>{c.rarity} · #{cardNumber(c)}</div>
              <div className="spc-prices">
                <span><small>Raw</small><b>{fmtMoney(rawValue(c))}</b></span>
                <span><small>PSA 10</small><b className="spc-gem">{fmtMoney(psaValueAt(c, 10))}</b></span>
                <span><small>PSA 9</small><b>{fmtMoney(psaValueAt(c, 9))}</b></span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {cards.length === 0 && <div className="empty mt-5">No cards match “{q}”.</div>}
    </>
  )
}

function numOf(n) { const m = String(n).match(/\d+/); return m ? parseInt(m[0], 10) : 9999 }
