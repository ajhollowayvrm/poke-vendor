import { useMemo, useState } from 'react'
import { SETS, rawValue, fmtMoney, rarityRank } from '../game/engine'
import { rarityColor } from './CardTile'

// A reference price guide: pick a set, browse every card with market prices.
export default function PriceGuide() {
  const [setId, setSetId] = useState(SETS[0].id)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('number')

  const set = SETS.find(s => s.id === setId) || SETS[0]
  const cards = useMemo(() => {
    let list = set.cards.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    list = [...list].sort((a, b) => {
      if (sort === 'value') return (b.price ?? 0) - (a.price ?? 0)
      if (sort === 'rarity') return rarityRank(b.rarity) - rarityRank(a.rarity)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return numOf(a.number) - numOf(b.number) // number (default)
    })
    return list
  }, [set, q, sort])

  const total = set.cards.reduce((sum, c) => sum + (c.price ?? 0), 0)
  const priciest = [...set.cards].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0]

  return (
    <>
      <div className="banner" style={{ marginTop: 16 }}>
        💲 Price guide — live TCGplayer market values for every card in each set. Reference only; refresh prices in Settings.
      </div>

      <div className="toolbar">
        <select value={setId} onChange={e => { setSetId(e.target.value); setQ('') }}>
          {SETS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cards.length})</option>)}
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

      {set.logo && <img src={set.logo} alt={set.name} style={{ height: 48, objectFit:'contain', margin:'4px 0 12px', filter:'drop-shadow(0 4px 8px #0008)' }} />}

      <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))' }}>
        {cards.map(c => (
          <div key={c.id} className="priceitem">
            <img src={c.img} alt={c.name} loading="lazy" />
            <div className="pname" title={c.name}>{c.name}</div>
            <div className="prow">
              <span className="ptag" style={{ color: rarityColor(c.rarity) }}>#{c.number}</span>
              <span className="pval">{c.price != null ? fmtMoney(c.price) : '—'}</span>
            </div>
          </div>
        ))}
      </div>
      {cards.length === 0 && <div className="empty">No cards match “{q}”.</div>}
    </>
  )
}
function numOf(n) { const m = String(n).match(/\d+/); return m ? parseInt(m[0], 10) : 9999 }
