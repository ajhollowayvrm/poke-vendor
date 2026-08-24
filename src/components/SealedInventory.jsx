import { useState, useMemo } from 'react'
import { useGame } from '../game/store'
import { sealedValue, fmtMoney, setById, productTypeLabel } from '../game/engine'
import { toast } from '../ui/dialog'
import { Collapse } from '../ui/Collapse'
import { Explain } from '../ui/Explain'
import SealedModal from './SealedModal'

// Your SEALED product on hand — bought but not yet ripped. Identical products (same set +
// type) STACK into one compact row, and rows group BY SET the same way a booth table reads,
// so a deep sealed position is a few collapsible lines instead of a wall of tiles. Loose
// single packs pool into one cross-set 🃏 bin — that's trade fodder, not shelf furniture.
// Rip acts on ONE unit right from the row; every other move (list, keep, break, flip,
// grade) lives in the product modal behind ⋯ / a row tap.
export default function SealedInventory({ onRip, onSift }) {
  const inventory = useGame(s => s.sealedInventory)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const listSealedMany = useGame(s => s.listSealedMany)
  // subscribe to the market so values re-render after a day-tick / drift event
  useGame(s => s.marketMults)
  // A row tap (or its ⋯) opens the stack's detail modal — value, chase density, price sheet,
  // and the full action set. `sealedView` holds the whole stack so the modal can act on N.
  const [sealedView, setSealedView] = useState(null)
  // ⚡ Sift-rip selection: pick a GROUP of sealed to auto-rip (stops on big-hit packs).
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

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

  // Sections: multi-pack product by set (era product by its series), single loose packs
  // pooled cross-set. Sections sort by total value desc; kept stacks sink inside each.
  const sections = useMemo(() => {
    const bySet = new Map()
    const loose = []
    for (const items of groups) {
      const it = items[0]
      if ((it.product?.packs || 1) === 1) { loose.push(items); continue }
      const key = it.product?.pool?.series ? `era:${it.product.pool.series}` : String(it.setId)
      if (!bySet.has(key)) bySet.set(key, [])
      bySet.get(key).push(items)
    }
    const stackValue = items => sealedValue(items[0]) * items.length
    const sortStacks = gs => gs.sort((a, b) =>
      ((a[0].locked ? 1 : 0) - (b[0].locked ? 1 : 0)) || (stackValue(b) - stackValue(a)))
    const secs = [...bySet.entries()].map(([key, gs]) => {
      const set = key.startsWith('era:') ? null : setById(key)
      return {
        key, logo: set?.logo, name: set?.name || `👑 ${key.slice(4)} era`, showSet: !set,
        groups: sortStacks(gs),
        units: gs.reduce((a, g) => a + g.length, 0),
        value: gs.reduce((a, g) => a + stackValue(g), 0),
      }
    }).sort((a, b) => b.value - a.value)
    if (loose.length) {
      secs.push({
        key: 'loose', logo: null, name: '🃏 Loose packs', showSet: true, loose: true,
        groups: sortStacks(loose),
        units: loose.reduce((a, g) => a + g.length, 0),
        value: loose.reduce((a, g) => a + stackValue(g), 0),
      })
    }
    return secs
  }, [groups])

  if (!inventory.length) {
    return (
      <div className="empty mt-7">
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

  // ⚡ Sift selection helpers. A stack is "in" when all its units are selected; tapping toggles
  // the whole stack (units of one product rip identically, so per-unit granularity adds nothing).
  const selItems = inventory.filter(it => selected.has(it.uid))
  const selPacks = selItems.reduce((a, it) => a + (it.product?.packs || 1), 0)
  function toggleStack(items) {
    setSelected(prev => {
      const n = new Set(prev)
      const allIn = items.every(it => n.has(it.uid))
      items.forEach(it => allIn ? n.delete(it.uid) : n.add(it.uid))
      return n
    })
  }
  function selectAll() {
    setSelected(prev => prev.size === inventory.length ? new Set() : new Set(inventory.map(it => it.uid)))
  }
  function startSift() {
    if (!selItems.length) return
    onSift(selItems)
    setSelecting(false); setSelected(new Set())
  }

  return (
    <>
      <div className="banner mt-6">
        📦 <b>Sealed inventory</b> — {inventory.length} item{inventory.length > 1 ? 's' : ''} ·
        value <b>{fmtMoney(totalValue)}</b> · cost {fmtMoney(totalCost)} ·
        <b style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}> {pl >= 0 ? '+' : ''}{fmtMoney(pl)}</b> unrealized.
        {' '}Sealed rides the market — <b>vintage climbs</b> the longer you hold it.
        {hasStore && <> <b>🏬 This IS your store's sealed stock</b> — walk-ins buy from it unless a unit is 🔒 kept.</>}
      </div>
      <div className="toolbar mt-5">
        {selecting ? (
          <>
            <span className="cap">Tap rows to sift-rip:</span>
            <button className="btn alt btn-fixed"  onClick={selectAll}>{selected.size === inventory.length ? 'Deselect all' : 'Select all'}</button>
            <button className="btn alt btn-fixed"  onClick={() => { setSelecting(false); setSelected(new Set()) }}>Cancel</button>
          </>
        ) : (
          <>
            <span className="cap">Move it all at once:</span>
            <button className="btn alt btn-fixed"  onClick={listAll}>🌐 List all online</button>
            {onSift && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button className="btn alt btn-fixed" onClick={() => setSelecting(true)}>⚡ Sift-rip…</button>
                <Explain label="How Sift-rip works">
                  Auto-rips a group of sealed — churns pack by pack and stops on the big-hit packs so you can rip those by hand.
                </Explain>
              </span>
            )}
          </>
        )}
      </div>
      <div className="mt-5">
        {sections.map(sec => (
          <Collapse key={sec.key} id={`inv-sealed-${sec.key}`} defaultOpen={sections.length <= 3}
            className="wants" headClass="wants-head"
            head={<>{sec.logo && <img src={sec.logo} alt="" style={{ height: 20, objectFit: 'contain', verticalAlign: '-4px', marginRight: 6 }} />}
              {sec.name}</>}
            hint={sec.loose ? 'single packs from every set — rip fuel and trade fodder' : null}
            badge={`${sec.units} · ${fmtMoney(sec.value)}`}>
            <div className="vsealed-list">
              {sec.groups.map(items => (
                <InvSealedRow key={items[0].uid} items={items} showSet={sec.showSet} onRip={onRip}
                  onOpen={() => setSealedView(items)}
                  selecting={selecting}
                  selected={items.every(it => selected.has(it.uid))}
                  onToggleSelect={() => toggleStack(items)} />
              ))}
            </div>
          </Collapse>
        ))}
      </div>
      {/* Sticky launch bar while picking a sift group. */}
      {selecting && (
        <div className="bulk-bar">
          <div className="bulk-bar-summary">
            {selItems.length ? <><b>{selItems.length} item{selItems.length === 1 ? '' : 's'}</b> · {selPacks} pack{selPacks === 1 ? '' : 's'} to sift</> : 'Tap the sealed rows you want to sift-rip'}
          </div>
          <div className="bulk-bar-actions">
            <button className="btn gold" disabled={!selItems.length} onClick={startSift}>⚡ Sift-rip {selPacks || ''} {selPacks ? 'packs' : ''} →</button>
          </div>
        </div>
      )}
      {sealedView && <SealedModal item={sealedView[0]} stack={sealedView} place="inventory"
        onClose={() => setSealedView(null)} onRip={onRip} flash={toast} />}
    </>
  )
}

// One compact row per stack — the same dense .vsealed-row the booth tables use. Rip takes
// ONE unit (the stack decrements); everything else is behind ⋯ / the row tap, which opens
// the product modal with the full action set.
function InvSealedRow({ items, showSet, onRip, onOpen, selecting, selected, onToggleSelect }) {
  useGame(s => s.marketMults) // unit value is market-priced — re-read as the market drifts
  const item = items[0]
  const qty = items.length
  const set = setById(item.setId)
  const unit = sealedValue(item)
  const value = unit * qty
  const cost = items.reduce((a, it) => a + (it.boughtPrice || 0), 0)
  const delta = value - cost
  const pct = cost ? Math.round((delta / cost) * 100) : 0
  const up = delta >= 0
  const rowClick = selecting ? onToggleSelect : onOpen
  return (
    <div className={`vsealed-row inv-sealed-row ${item.vintage ? 'sealed-vintage' : ''} ${selecting && selected ? 'in-stack' : ''}`}
      role="button" tabIndex={0}
      onClick={rowClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowClick() } }}>
      <span className="vsealed-name">
        {selecting && <span className="sift-check" aria-hidden="true">{selected ? '✅' : '⬜'}</span>}
        {item.product.icon || '📦'} {productTypeLabel(item.product)}
        {qty > 1 && <span className="pill vsealed-qty">×{qty}</span>}
        {item.locked && <span className="pill inv-kept" aria-label="Kept — walk-ins can't buy it (rips, streams & repacks still can use it)">🔒</span>}
      </span>
      <span className="vsealed-meta">
        {showSet ? `${item.product.pool?.series ? `${item.product.pool.series} era` : (set?.name || '')} · ` : ''}
        {item.product.packs} pk{item.vintage ? ' · 🗝️' : ''}{qty > 1 ? ` · ${fmtMoney(unit)} ea` : ''} · paid {fmtMoney(cost)}
      </span>
      <span className="vsealed-ask">
        <span className="ask">{fmtMoney(value)}</span>
        <span className="pill sealed-delta" style={{ background: up ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: up ? 'var(--green)' : 'var(--red)' }}>
          {up ? '▲' : '▼'} {up ? '+' : ''}{pct}%
        </span>
      </span>
      <span className="vsealed-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <button className="btn gold" onClick={() => onRip(item.uid)}>📦 Rip{qty > 1 ? ' one' : ''}</button>
        <button className="btn alt" onClick={onOpen} aria-label="All actions — list, keep, break, flip, grade">⋯</button>
      </span>
    </div>
  )
}
