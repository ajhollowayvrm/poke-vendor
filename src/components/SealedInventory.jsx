import { useState } from 'react'
import { useGame } from '../game/store'
import { sealedValue, fmtMoney, setById, SEALED_FLIP_RATE } from '../game/engine'
import { toast } from '../ui/dialog'

// Your SEALED product on hand — bought but not yet ripped. Each item can be ripped
// (launches the normal rip, no re-charge), listed on your site (rides the same
// browsing/offer engine as a card), or quick-flipped for instant cash. Held value
// tracks the set's market multiplier, so vintage (which trends up) appreciates here.
export default function SealedInventory({ onRip }) {
  const inventory = useGame(s => s.sealedInventory)
  // subscribe to the market so values re-render after a day-tick / drift event
  useGame(s => s.marketMults)

  if (!inventory.length) {
    return (
      <div className="empty" style={{ marginTop: 20 }}>
        📦 No sealed product on hand. Buy boxes, packs, or vintage from the <b>🛒 Buy</b> tab —
        they land here to <b>rip</b>, <b>list for sale</b>, or <b>quick-flip</b> whenever you want.
      </div>
    )
  }

  const totalValue = inventory.reduce((a, it) => a + sealedValue(it), 0)
  const totalCost = inventory.reduce((a, it) => a + (it.boughtPrice || 0), 0)
  const pl = totalValue - totalCost

  return (
    <>
      <div className="banner" style={{ marginTop: 14 }}>
        📦 <b>Sealed inventory</b> — {inventory.length} item{inventory.length > 1 ? 's' : ''} ·
        value <b>{fmtMoney(totalValue)}</b> · cost {fmtMoney(totalCost)} ·
        <b style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}> {pl >= 0 ? '+' : ''}{fmtMoney(pl)}</b> unrealized.
        {' '}Sealed rides the market — <b>vintage climbs</b> the longer you hold it.
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
        {inventory.map(it => <SealedRow key={it.uid} item={it} onRip={onRip} />)}
      </div>
    </>
  )
}

function SealedRow({ item, onRip }) {
  const listSealed = useGame(s => s.listSealed)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const [listing, setListing] = useState(false)
  const [mult, setMult] = useState(1.0)

  const set = setById(item.setId)
  const value = sealedValue(item)
  const cost = item.boughtPrice || 0
  const delta = value - cost
  const pct = cost ? Math.round((delta / cost) * 100) : 0
  const up = delta >= 0
  const flip = value * SEALED_FLIP_RATE

  function doList() {
    const q = listSealed(item.uid, mult)
    if (q) toast(`Listed ${set?.name || ''} ${item.product.type} at ${fmtMoney(q.ask)} — track it on the Sell tab.`)
    setListing(false)
  }
  function doFlip() {
    const net = quickFlipSealed(item.uid)
    if (net != null) toast(`Quick-flipped ${item.product.type} for ${fmtMoney(net)}.`)
  }

  return (
    <div className="product sealed-item">
      <div className="sealed-head">
        {set?.logo && <img className="sealed-logo" src={set.logo} alt={set.name} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="sealed-name">{item.product.icon || '📦'} {item.product.type}</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {set?.name}{item.vintage ? ' · 🏛️ vintage' : ''} · {item.product.packs} pk
          </div>
        </div>
      </div>

      <div className="sealed-value">
        <span className="sealed-now">{fmtMoney(value)}</span>
        <span className="muted" style={{ fontSize: 11 }}>&nbsp;value</span>
        <span className="pill sealed-delta" style={{ marginLeft: 'auto', background: up ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: up ? 'var(--green)' : 'var(--red)' }}>
          {up ? '▲' : '▼'} {up ? '+' : ''}{pct}% ({up ? '+' : ''}{fmtMoney(delta)})
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>paid {fmtMoney(cost)}</div>

      <div className="sealed-actions">
        <button className="btn gold" onClick={() => onRip(item.uid)}>📦 Rip</button>
        <button className="btn alt" onClick={() => setListing(v => !v)}>{listing ? 'Cancel' : '🌐 List'}</button>
        <button className="btn" onClick={doFlip} title={`Instant cash at ${Math.round(SEALED_FLIP_RATE * 100)}% of value`}>⚡ Flip {fmtMoney(flip)}</button>
      </div>

      {listing && (
        <div className="sealed-list-ctl">
          <div className="list-pct-row">
            {[0.8, 0.9, 1.0, 1.1].map(m => (
              <button key={m} className={`pctbtn ${mult === m ? 'on' : ''}`} onClick={() => setMult(m)}>{Math.round(m * 100)}%</button>
            ))}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>ask <b>{fmtMoney(value * mult)}</b></span>
          </div>
          <button className="btn gold" style={{ marginTop: 8, maxWidth: 200 }} onClick={doList}>List for sale</button>
        </div>
      )}
    </div>
  )
}
