import { useState, useMemo } from 'react'
import { useGame } from '../game/store'
import { sealedValue, fmtMoney, setById, SEALED_FLIP_RATE } from '../game/engine'
import { toast } from '../ui/dialog'

// Your SEALED product on hand — bought but not yet ripped. Identical products (same set +
// type) STACK into one row with a quantity; each can be ripped (launches the normal rip,
// no re-charge), listed on your site, or quick-flipped for instant cash, one unit at a
// time. Held value tracks the set's market multiplier, so vintage appreciates while it sits.
export default function SealedInventory({ onRip }) {
  const inventory = useGame(s => s.sealedInventory)
  // subscribe to the market so values re-render after a day-tick / drift event
  useGame(s => s.marketMults)

  // Group identical products (same set + type + vintage flag) into stacks. Value is the
  // same per unit (product.price × current market); cost is summed across the units bought.
  const groups = useMemo(() => {
    const map = new Map()
    for (const it of inventory) {
      const key = `${it.setId}|${it.product?.type}|${it.product?.name || ''}|${it.vintage ? 1 : 0}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    }
    return [...map.values()]
  }, [inventory])

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
        {groups.map(items => <SealedRow key={items[0].uid} items={items} onRip={onRip} />)}
      </div>
    </>
  )
}

// One stacked row for a group of identical sealed products. Actions act on ONE unit at a
// time (the stack decrements); with qty > 1 the row just stays and shows the new count.
function SealedRow({ items, onRip }) {
  const listSealed = useGame(s => s.listSealed)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const [listing, setListing] = useState(false)
  const [mult, setMult] = useState(1.0)

  const item = items[0]           // the unit any single action operates on
  const qty = items.length
  const set = setById(item.setId)
  const unit = sealedValue(item)  // per-unit market value (same across the stack)
  const value = unit * qty        // whole-stack value
  const cost = items.reduce((a, it) => a + (it.boughtPrice || 0), 0) // total paid across the stack
  const delta = value - cost
  const pct = cost ? Math.round((delta / cost) * 100) : 0
  const up = delta >= 0
  const flip = unit * SEALED_FLIP_RATE

  function doList() {
    const q = listSealed(item.uid, mult)
    if (q) toast(`Listed ${set?.name || ''} ${item.product.type} at ${fmtMoney(q.ask)} — track it on the Sell tab.`)
    setListing(false)
  }
  function doFlip() {
    const net = quickFlipSealed(item.uid)
    if (net != null) toast(`Quick-flipped a ${item.product.type} for ${fmtMoney(net)}.`)
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
        {qty > 1 && <span className="sealed-qty" title={`${qty} in stock`}>×{qty}</span>}
      </div>

      <div className="sealed-value">
        <span className="sealed-now">{fmtMoney(value)}</span>
        <span className="muted" style={{ fontSize: 11 }}>&nbsp;{qty > 1 ? `value (${fmtMoney(unit)} ea)` : 'value'}</span>
        <span className="pill sealed-delta" style={{ marginLeft: 'auto', background: up ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: up ? 'var(--green)' : 'var(--red)' }}>
          {up ? '▲' : '▼'} {up ? '+' : ''}{pct}% ({up ? '+' : ''}{fmtMoney(delta)})
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>paid {fmtMoney(cost)}{qty > 1 ? ' total' : ''}</div>

      <div className="sealed-actions">
        <button className="btn gold" onClick={() => onRip(item.uid)}>📦 Rip{qty > 1 ? ' one' : ''}</button>
        <button className="btn alt" onClick={() => setListing(v => !v)}>{listing ? 'Cancel' : '🌐 List'}</button>
        <button className="btn" onClick={doFlip} title={`Instant cash at ${Math.round(SEALED_FLIP_RATE * 100)}% of value`}>⚡ Flip {fmtMoney(flip)}</button>
      </div>

      {listing && (
        <div className="sealed-list-ctl">
          <div className="list-pct-row">
            {[0.8, 0.9, 1.0, 1.1].map(m => (
              <button key={m} className={`pctbtn ${mult === m ? 'on' : ''}`} onClick={() => setMult(m)}>{Math.round(m * 100)}%</button>
            ))}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>ask <b>{fmtMoney(unit * mult)}</b></span>
          </div>
          <button className="btn gold" style={{ marginTop: 8, maxWidth: 200 }} onClick={doList}>{qty > 1 ? 'List one for sale' : 'List for sale'}</button>
        </div>
      )}
    </div>
  )
}
