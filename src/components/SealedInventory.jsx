import { useState, useMemo } from 'react'
import { useGame } from '../game/store'
import { sealedValue, fmtMoney, setById, SEALED_FLIP_RATE, breakOptions } from '../game/engine'
import { toast } from '../ui/dialog'
import { AskPicker } from '../ui/AskPicker'

// Your SEALED product on hand — bought but not yet ripped. Identical products (same set +
// type) STACK into one row with a quantity; each can be ripped (launches the normal rip,
// no re-charge), listed on your site, or quick-flipped for instant cash, one unit at a
// time. Held value tracks the set's market multiplier, so vintage appreciates while it sits.
export default function SealedInventory({ onRip }) {
  const inventory = useGame(s => s.sealedInventory)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const listSealedMany = useGame(s => s.listSealedMany)
  // subscribe to the market so values re-render after a day-tick / drift event
  useGame(s => s.marketMults)

  // Group identical products (same set + type + vintage + kept flag) into stacks. Value is
  // the same per unit (product.price × current market); cost is summed across the units.
  // Kept (locked) units group separately so a mixed stack reads honestly.
  const groups = useMemo(() => {
    const map = new Map()
    for (const it of inventory) {
      const key = `${it.setId}|${it.product?.type}|${it.product?.name || ''}|${it.vintage ? 1 : 0}|${it.locked ? 1 : 0}`
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

  function listAll() {
    const n = listSealedMany(inventory.map(it => it.uid), 1.0)
    if (n) toast(`Listed all ${n} sealed at 100% of market — track them on the Sell tab.`)
  }

  return (
    <>
      <div className="banner" style={{ marginTop: 14 }}>
        📦 <b>Sealed inventory</b> — {inventory.length} item{inventory.length > 1 ? 's' : ''} ·
        value <b>{fmtMoney(totalValue)}</b> · cost {fmtMoney(totalCost)} ·
        <b style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}> {pl >= 0 ? '+' : ''}{fmtMoney(pl)}</b> unrealized.
        {' '}Sealed rides the market — <b>vintage climbs</b> the longer you hold it.
        {hasStore && <> <b>🏬 This IS your store's sealed stock</b> — walk-ins buy from it unless a unit is 🔒 kept.</>}
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>Move it all at once:</span>
        <button className="btn alt" style={{ flex: 'none' }} onClick={listAll}>🌐 List all online</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', marginTop: 12 }}>
        {groups.map(items => <SealedRow key={items[0].uid} items={items} onRip={onRip} hasStore={hasStore} />)}
      </div>
    </>
  )
}

// One stacked row for a group of identical sealed products. Actions act on ONE unit at a
// time (the stack decrements); with qty > 1 the row just stays and shows the new count.
function SealedRow({ items, onRip, hasStore }) {
  const listSealed = useGame(s => s.listSealed)
  const listSealedMany = useGame(s => s.listSealedMany)
  const toggleLockSealed = useGame(s => s.toggleLockSealed)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const breakSealed = useGame(s => s.breakSealed)
  useGame(s => s.marketMults) // break values are market-priced — re-read them as the market drifts
  const [listing, setListing] = useState(false)
  const [breaking, setBreaking] = useState(false)
  const [mult, setMult] = useState(1.0)
  const [qtySel, setQtySel] = useState(1)   // how many units of the stack an action applies to

  const item = items[0]           // the unit a single action operates on
  const qty = items.length
  const n = Math.max(1, Math.min(qty, qtySel)) // clamp the selected quantity to the stack size
  const set = setById(item.setId)
  const unit = sealedValue(item)  // per-unit market value (same across the stack)
  const value = unit * qty        // whole-stack value
  const cost = items.reduce((a, it) => a + (it.boughtPrice || 0), 0) // total paid across the stack
  const delta = value - cost
  const pct = cost ? Math.round((delta / cost) * 100) : 0
  const up = delta >= 0
  const flip = unit * SEALED_FLIP_RATE
  // What one unit of this stack can be split into (empty for a single pack — already atomic).
  const breaks = useMemo(() => breakOptions(item), [item])
  const pickUids = (k) => items.slice(0, k).map(i => i.uid) // the first k units of the stack

  function doList() {
    const uids = pickUids(n)
    const listed = listSealedMany(uids, mult)
    if (listed) toast(`Listed ${listed}× ${item.product.type} at ${Math.round(mult*100)}% — track them on the Sell tab.`)
    setListing(false); setQtySel(1)
  }
  // Flip KEEP on the selected units (kept units group into their own stack on re-render).
  function doKeep() {
    for (const uid of pickUids(n)) toggleLockSealed(uid)
    toast(item.locked
      ? `🔓 ${n}× ${item.product.type} back up for sale in the store.`
      : `🔒 Keeping ${n}× ${item.product.type} — walk-ins can't buy it (you can still rip, stream, or repack it).`)
    setQtySel(1)
  }
  function doFlip() {
    const net = quickFlipSealed(item.uid)
    if (net != null) toast(`Quick-flipped a ${item.product.type} for ${fmtMoney(net)}.`)
  }
  // Break ONE unit of the stack (breaking the whole stack at once would be a very expensive
  // mis-tap: a case is thousands of dollars of product and there's no undo).
  function doBreak(opt) {
    const r = breakSealed(item.uid, opt.product.type)
    if (r?.error) return toast(r.error)
    toast(`🔨 Broke a ${item.product.type} into ${r.count}× ${r.type} — ${fmtMoney(r.value)} of product.`)
    setBreaking(false)
  }

  return (
    <div className="product sealed-item">
      <div className="sealed-head">
        {set?.logo && <img className="sealed-logo" src={set.logo} alt={set.name} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="sealed-name">{item.product.icon || '📦'} {item.product.type}</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {set?.name}{item.vintage ? ' · 🏛️ vintage' : ''} · {item.product.packs} pk
            {item.locked ? <b style={{ color: 'var(--gold)' }}> · 🔒 kept (not for sale)</b> : ''}
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

      {qty > 1 && (
        <div className="sealed-qty-ctl">
          <span className="muted" style={{ fontSize: 12 }}>Quantity</span>
          <button className="qstep" onClick={() => setQtySel(q => Math.max(1, Math.min(qty, q) - 1))} disabled={n <= 1} aria-label="Fewer">−</button>
          <b className="qval">{n}</b>
          <button className="qstep" onClick={() => setQtySel(q => Math.min(qty, Math.max(1, q) + 1))} disabled={n >= qty} aria-label="More">+</button>
          <button className="qstep qmax" onClick={() => setQtySel(qty)} disabled={n >= qty}>All {qty}</button>
          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>applies to List / Keep</span>
        </div>
      )}

      <div className="sealed-actions">
        <button className="btn gold" onClick={() => onRip(item.uid)}>📦 Rip{qty > 1 ? ' one' : ''}</button>
        <button className="btn alt" onClick={() => setListing(v => !v)}>{listing ? 'Cancel' : `🌐 List${qty > 1 ? ` ${n}` : ''}`}</button>
        {hasStore && (
          <button className={`btn ${item.locked ? 'gold' : 'alt'}`} onClick={doKeep}
            title={item.locked ? 'Kept — not for sale in your store. Tap to put it back on the floor.' : 'Keep it — walk-ins can\'t buy it (rips, streams & repacks still can use it)'}>
            {item.locked ? '🔓 Unkeep' : '🔒 Keep'}{qty > 1 ? ` ${n}` : ''}
          </button>
        )}
        {breaks.length > 0 && (
          <button className={`btn ${breaking ? 'gold' : 'alt'}`} onClick={() => setBreaking(v => !v)}
            title={`Split it up — a case into boxes, a box into loose packs`}>
            {breaking ? 'Cancel' : '🔨 Break'}
          </button>
        )}
        <button className="btn" onClick={doFlip} title={`Instant cash at ${Math.round(SEALED_FLIP_RATE * 100)}% of value`}>⚡ Flip {fmtMoney(flip)}</button>
      </div>

      {/* BREAK IT DOWN. Every option shows what the resulting pile is worth against what the
          sealed unit is worth now, because that delta IS the decision: splitting a case into
          boxes is ~free money over what you paid, while cracking boxes into singles gives up
          the sealed premium in exchange for product that actually moves. */}
      {breaking && (
        <div className="sealed-list-ctl">
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Break <b>one</b> {item.product.type} ({fmtMoney(unit)}) into:
          </div>
          {breaks.map(o => {
            const gain = o.delta >= 0
            return (
              <button key={o.product.type} className="btn alt sealed-break-opt" onClick={() => doBreak(o)}>
                <span>{o.product.icon || '📦'} <b>{o.count}× {o.product.type}</b> <span className="muted">({fmtMoney(o.unit)} ea)</span></span>
                <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{fmtMoney(o.total)}</span>
                <span className="pill" style={{ background: gain ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: gain ? 'var(--green)' : 'var(--red)' }}>
                  {/* fmtMoney of a negative renders "$-1298.76" — sign it properly instead */}
                  {gain ? '+' : '−'}{fmtMoney(Math.abs(o.delta))}
                </span>
              </button>
            )
          })}
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Sealed product carries a premium the bigger the unit — breaking down to singles trades
            value for <b>liquidity</b> (loose packs sell, stream and repack far faster than a case).
          </div>
        </div>
      )}

      {listing && (
        <div className="sealed-list-ctl">
          <AskPicker pct={Math.round(mult * 100)} onChange={p => setMult((p || 0) / 100)} custom={false} label={null}>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>ask <b>{fmtMoney(unit * mult)}</b>{n > 1 ? ` ea · ${fmtMoney(unit * mult * n)} total` : ''}</span>
          </AskPicker>
          <button className="btn gold" style={{ marginTop: 8, maxWidth: 220 }} onClick={doList}>List {n > 1 ? `${n} units` : 'for sale'}</button>
        </div>
      )}
    </div>
  )
}
