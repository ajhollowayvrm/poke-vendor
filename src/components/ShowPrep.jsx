import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rarityRank, fmtMoney, isHit, sealedValue, setById } from '../game/engine'
import { SHOW_TIERS } from '../game/shows'
import CardTile from './CardTile'

// Booth locations: a better spot pulls more foot traffic, for a fee on top of the booth cost.
const SPOTS = [
  { key: 'standard', label: 'Standard table', mult: 1.0,  feeMult: 0,   blurb: 'Included — a normal spot in the aisles.' },
  { key: 'aisle',    label: 'Aisle spot',     mult: 1.25, feeMult: 0.5, blurb: '+25% foot traffic — on a main walkway.' },
  { key: 'corner',   label: 'Corner endcap',  mult: 1.5,  feeMult: 1.0, blurb: '+50% foot traffic — everyone passes it.' },
]
const ARRIVALS = [
  { key: 'open', label: '🌅 Arrive at open', blurb: 'First dibs — showcases are fresh and full.' },
  { key: 'late', label: '🌇 Roll in late',   blurb: 'Best pieces are gone, but vendors mark the rest down to clear.' },
]

// Pre-show staging: pick which cards from your collection you'll bring to SELL at
// the show. Only these are offered to floor shoppers; anything unsold comes home when
// you leave. Backing out here costs nothing (the entry fee is charged on confirm).
export default function ShowPrep({ show, onConfirm, onCancel }) {
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const cash = useGame(s => s.cash)
  const hasPhone = useGame(s => !!s.upgrades.smartphone)
  const tier = SHOW_TIERS[show.tierKey]

  const [sort, setSort] = useState('value')
  const [picked, setPicked] = useState(() => new Set())
  const [pickedSealed, setPickedSealed] = useState(() => new Set())
  const [spot, setSpot] = useState('standard') // booth location — traffic vs cost
  const [arrival, setArrival] = useState('open') // when you walk in to shop the floor

  const spotDef = SPOTS.find(s => s.key === spot) || SPOTS[0]
  const spotFee = Math.round((tier.vendorFee || 0) * spotDef.feeMult)
  const totalFee = tier.entryFee + (tier.vendorFee || 0) + spotFee

  const view = useMemo(() => {
    return [...collection].sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
  }, [collection, sort])

  function toggle(c) {
    setPicked(p => { const n = new Set(p); n.has(c.uid) ? n.delete(c.uid) : n.add(c.uid); return n })
  }
  function selectAll() {
    setPicked(p => p.size === view.length ? new Set() : new Set(view.map(c => c.uid)))
  }
  // Quick pick: grab every hit / graded / foil — the stuff worth manning a table for.
  function pickValuable() {
    const worth = view.filter(c => isHit(c) || c.grade || c.foil)
    setPicked(new Set(worth.map(c => c.uid)))
  }

  function toggleSealed(it) {
    setPickedSealed(p => { const n = new Set(p); n.has(it.uid) ? n.delete(it.uid) : n.add(it.uid); return n })
  }
  const sealedView = useMemo(() =>
    [...(sealedInventory || [])].sort((a, b) => sealedValue(b) - sealedValue(a)), [sealedInventory])
  function selectAllSealed() {
    setPickedSealed(p => p.size === sealedView.length ? new Set() : new Set(sealedView.map(it => it.uid)))
  }

  const selCards = useMemo(() => view.filter(c => picked.has(c.uid)), [view, picked])
  const selSealed = useMemo(() => sealedView.filter(it => pickedSealed.has(it.uid)), [sealedView, pickedSealed])
  const selValue = selCards.reduce((a, c) => a + cardValue(c), 0) + selSealed.reduce((a, it) => a + sealedValue(it), 0)
  const count = selCards.length
  const sealedCount = selSealed.length

  return (
    <div className="showprep">
      <div className="topbar" style={{ marginBottom: 14 }}>
        <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} onClick={onCancel}>← Back</button>
        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{show.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            <span className="pill" style={{ background: tier.color + '33', color: tier.color }}>{tier.name}</span>
            {' · '}Vendor {fmtMoney(tier.entryFee + (tier.vendorFee || 0))} <span style={{ opacity: 0.7 }}>(entry {fmtMoney(tier.entryFee)} + booth {fmtMoney(tier.vendorFee || 0)})</span> · {tier.days} day{tier.days > 1 ? 's' : ''}
          </div>
        </div>
        <div className="cash" style={{ marginLeft: 0 }}>{fmtMoney(cash)}<small>balance</small></div>
      </div>

      <div className="banner" style={{ marginTop: 0 }}>
        🎪 <b>Pack your case.</b> Pick the cards <b>and sealed product</b> you'll bring to sell at your booth —
        shoppers on the floor only buy from these. Anything you don't sell comes home when you leave.
        {!hasPhone && <> · ⚠️ Online orders during the show will be missed (no 📱 Smartphone).</>}
      </div>

      <div className="prep-choices">
        <div className="prep-choice-group">
          <div className="prep-choice-label">📍 Booth spot</div>
          <div className="prep-choice-row">
            {SPOTS.map(s => (
              <button key={s.key} className={`chip-btn ${spot === s.key ? 'active' : ''}`} onClick={() => setSpot(s.key)}
                title={s.blurb}>
                <b>{s.label}</b>
                <small>{s.feeMult ? `+${fmtMoney(Math.round((tier.vendorFee||0)*s.feeMult))}` : 'included'} · {s.blurb}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="prep-choice-group">
          <div className="prep-choice-label">🕘 When you arrive</div>
          <div className="prep-choice-row">
            {ARRIVALS.map(a => (
              <button key={a.key} className={`chip-btn ${arrival === a.key ? 'active' : ''}`} onClick={() => setArrival(a.key)}
                title={a.blurb}>
                <b>{a.label}</b><small>{a.blurb}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      {collection.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          Your collection is empty — nothing to stock the booth with. You can still pay the vendor fee and man an empty table, but you'd be better off attending as a shopper.
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>
              {collection.length} in collection
            </span>
            <select value={sort} onChange={e => setSort(e.target.value)}>
              <option value="value">Sort: Value</option><option value="rarity">Sort: Rarity</option>
              <option value="name">Sort: Name</option>
            </select>
            <button className="btn alt" style={{ flex: 'none' }} onClick={selectAll}>
              {picked.size === view.length && view.length ? 'Deselect all' : `Select all (${view.length})`}
            </button>
            <button className="btn alt" style={{ flex: 'none' }} onClick={pickValuable}
              title="Select every hit, slab, and special foil">⭐ Pick the good stuff</button>
          </div>

          <div className="grid coll-grid" style={{ marginTop: 14, paddingBottom: 110 }}>
            {view.map(c => (
              <div key={c.uid} className={`coll-cell selectable ${picked.has(c.uid) ? 'picked' : ''}`} onClick={() => toggle(c)}>
                <CardTile card={c} noBorder interactive={false} />
                {picked.has(c.uid) && <span className="coll-check">✓</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {sealedView.length > 0 && (
        <>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 14%, transparent)', color: 'var(--gold)' }}>
              📦 {sealedView.length} sealed on hand
            </span>
            <span className="muted" style={{ fontSize: 12 }}>Bring sealed product to sell at your booth too.</span>
            <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }} onClick={selectAllSealed}>
              {pickedSealed.size === sealedView.length && sealedView.length ? 'Deselect sealed' : `Select all sealed (${sealedView.length})`}
            </button>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', marginTop: 12, paddingBottom: 110 }}>
            {sealedView.map(it => {
              const set = setById(it.setId)
              const on = pickedSealed.has(it.uid)
              return (
                <div key={it.uid} className={`product sealed-item selectable ${on ? 'picked' : ''}`} style={{ cursor: 'pointer', outline: on ? '2px solid var(--accent)' : 'none' }} onClick={() => toggleSealed(it)}>
                  <div className="sealed-head">
                    {set?.logo && <img className="sealed-logo" src={set.logo} alt={set.name} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b className="sealed-name">{it.product.icon || '📦'} {it.product.type}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{set?.name}{it.vintage ? ' · 🏛️ vintage' : ''} · {it.product.packs} pk</div>
                    </div>
                    {on && <span className="coll-check">✓</span>}
                  </div>
                  <div className="sealed-value"><span className="sealed-now">{fmtMoney(sealedValue(it))}</span></div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Fixed confirm bar — always reachable so you can attend with 0 items too. */}
      <div className="bulk-bar">
        <div className="bulk-bar-summary">
          {count > 0 || sealedCount > 0
            ? <><b>{[count && `${count} card${count > 1 ? 's' : ''}`, sealedCount && `${sealedCount} sealed`].filter(Boolean).join(' + ')}</b> to bring · {fmtMoney(selValue)} market</>
            : <span className="muted">Bringing nothing — buy &amp; flip on the floor</span>}
        </div>
        <div className="bulk-bar-actions">
          <button className="btn gold" disabled={cash < totalFee} onClick={() => onConfirm({ cardUids: [...picked], sealedUids: [...pickedSealed], spot, spotFee, spotMult: spotDef.mult, spotLabel: spotDef.label, arrival })}>
            🎪 Vend — pay {fmtMoney(totalFee)} {count + sealedCount > 0 ? `· bring ${count + sealedCount}` : ''} →
          </button>
        </div>
      </div>
    </div>
  )
}
