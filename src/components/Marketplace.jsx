import { useMemo, useState } from 'react'
import { SETS, MARKETPLACE_CARDS, marketVariants, rawValue, fmtMoney, rarityRank,
  rarityLabel, setNameOfCard, setIdOfCard } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'

// How many distinct cards to render at once. The pool is every card in every set
// (~3k+), so we filter then cap — each card expands into several variant rows, and
// a giant grid would be slow and useless. A search/filter narrows to what you want.
const RESULT_CAP = 50

// The global singles marketplace: search ANY card across all sets and buy a specific
// copy — Near Mint raw, a Poké Ball foil, or a PSA 9 / 10 slab — at a markup over
// market (the price of buying exactly what you want instead of ripping for it).
export default function Marketplace() {
  const cash = useGame(s => s.cash)
  const buyFromMarket = useGame(s => s.buyFromMarket)
  // Re-render as the living market drifts (rawValue rides marketMult).
  const marketMults = useGame(s => s.marketMults)
  const [q, setQ] = useState('')
  const [setId, setSetId] = useState('all')
  const [rarity, setRarity] = useState('all')
  const [sort, setSort] = useState('value')
  const [toastMsg, setToastMsg] = useState(null)
  const flash = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400) }

  const shopSets = SETS.filter(s => !s.vintage)
  const vintageSets = SETS.filter(s => s.vintage)
  // Rarities actually present, in canonical order, for the filter dropdown.
  const rarities = useMemo(() => {
    const seen = new Set(MARKETPLACE_CARDS.map(c => c.rarity))
    return [...seen].sort((a, b) => rarityRank(a) - rarityRank(b))
  }, [])

  const { results, total } = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = MARKETPLACE_CARDS.filter(c => {
      if (needle && !c.name.toLowerCase().includes(needle)) return false
      if (setId !== 'all' && setIdOfCard(c) !== setId) return false
      if (rarity !== 'all' && c.rarity !== rarity) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'rarity') return rarityRank(b.rarity) - rarityRank(a.rarity)
      if (sort === 'low') return rawValue(a) - rawValue(b)
      return rawValue(b) - rawValue(a) // value (high → low), default
    })
    return { total: list.length, results: list.slice(0, RESULT_CAP) }
    // marketMults in deps so value sort + prices track the living market
  }, [q, setId, rarity, sort, marketMults])

  function buy(listing) {
    // spend() inside buyFromMarket is the authoritative cash guard; flash on its
    // verdict rather than a stale closure read of `cash`.
    if (!buyFromMarket(listing)) { flash('Not enough cash.'); return }
    flash(`Bought ${listing.card.name} (${listing.label}) — ${fmtMoney(listing.ask)}`)
  }

  return (
    <>
      <div className="banner" style={{ marginTop: 16 }}>
        🛍️ The <b>marketplace</b> — buy any single instead of gambling on packs. The markup
        <b> scales with value</b>: cheap to grab filler for a set, but chases cost a steep premium —
        ripping and hunting shows is still the smart way to land the big ones. Near Mint raw,
        Poké Ball foils, and graded slabs where they trade. Vintage chases live here too.
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search every card…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={setId} onChange={e => setSetId(e.target.value)}>
          <option value="all">All sets</option>
          <optgroup label="In the shop">
            {shopSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          <optgroup label="Vintage">
            {vintageSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        </select>
        <select value={rarity} onChange={e => setRarity(e.target.value)}>
          <option value="all">All rarities</option>
          {rarities.map(r => <option key={r} value={r}>{rarityLabel(r)}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="value">Sort: Value ↓</option>
          <option value="low">Sort: Value ↑</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        <span className="pill" style={{ marginLeft: 'auto' }}>💵 {fmtMoney(cash)}</span>
      </div>

      {total > RESULT_CAP && (
        <div className="toolbar" style={{ marginTop: -4 }}>
          <span className="pill muted">Showing {RESULT_CAP} of {total.toLocaleString()} — refine your search to see more.</span>
        </div>
      )}

      <div className="grid market-grid">
        {results.map(c => {
          const variants = marketVariants(c)
          return (
            <div key={c.id} className="market-card">
              <img src={c.img} alt={c.name} loading="lazy" decoding="async" />
              <div className="market-meta">
                <div className="market-name" title={c.name}>{c.name}</div>
                <div className="market-sub">
                  <span style={{ color: rarityColor(c.rarity) }}>{rarityLabel(c.rarity)}</span>
                  <span className="muted"> · {setNameOfCard(c) || '—'} · #{c.number}</span>
                </div>
              </div>
              <div className="market-variants">
                {variants.map(v => (
                  <button key={v.id} className="market-buy" disabled={cash < v.ask}
                    onClick={() => buy(v)} title={`Buy ${c.name} — ${v.label}`}>
                    <span className="mv-label">
                      {v.kind === 'foil' ? `✨ ${v.label}` : v.kind === 'graded' ? `🏆 ${v.label}` : v.label}
                    </span>
                    <span className="mv-price">{fmtMoney(v.ask)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {total === 0 && <div className="empty">No cards match {q ? `“${q}”` : 'those filters'}.</div>}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}
