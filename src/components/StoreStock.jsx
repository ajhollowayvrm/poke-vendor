import { useMemo, useState } from 'react'
import { useGame, floorCapacity, floorCount } from '../game/store'
import { cardValue, sealedValue, setById, setIdOfCard, fmtMoney, round2, cardImg, setNameOfCard } from '../game/engine'
import { groupCardLines, groupLines, sealedSku, skuBadge } from './sku'

// The grouped-by-SET inventory view shared by all three stock places:
//   place='floor'     — what's out on the sales floor (walk-ins & the counter buy this)
//   place='storeroom' — backstock (sells nothing until you move it out front)
//   place='personal'  — your keepsakes (🔒 kept), not for sale
// Singles and sealed appear together under each set header; identical copies collapse into
// one SKU line with a quantity. Every line carries the move + sell actions that make sense
// for its place, so a stack of ETBs simply lists under "Ascended Heroes" and moves as a unit.

const PLACE = {
  floor:     { icon: '🛒', title: 'Shop Floor', empty: 'The floor is empty — stock it from your Storeroom so walk-ins have something to buy.' },
  storeroom: { icon: '📦', title: 'Storeroom', empty: 'Storeroom empty — everything you own is out on the floor (or kept). Buy or rip product to restock.' },
  personal:  { icon: '🗂️', title: 'Personal', empty: 'Nothing kept for yourself yet — hit 🔒 Keep on any stock line to move it here, off the sales floor.' },
}

// Split the raw items into { kind, it } and group them by set, biggest set (by value) first.
function bySet(cards, sealed) {
  const setsMap = new Map() // setId -> { setId, name, items:[{kind,it}], value }
  const push = (setId, kind, it, v) => {
    if (!setsMap.has(setId)) setsMap.set(setId, { setId, name: setById(setId)?.name || setNameOfCard(it) || 'Other', items: [], value: 0 })
    const g = setsMap.get(setId); g.items.push({ kind, it }); g.value += v
  }
  for (const c of cards) push(setIdOfCard(c) || 'other', 'card', c, cardValue(c))
  for (const it of sealed) push(it.setId || 'other', 'sealed', it, sealedValue(it))
  // Within a set, collapse identical copies into SKU lines (cards and sealed separately), value-first.
  const groups = [...setsMap.values()].map(g => {
    const cardItems = g.items.filter(x => x.kind === 'card').map(x => x.it)
    const sealItems = g.items.filter(x => x.kind === 'sealed').map(x => x.it)
    const lines = [
      ...groupCardLines(cardItems, c => round2(cardValue(c))).map(l => ({ ...l, kind: 'card' })),
      ...groupLines(sealItems, it => sealedSku(it.setId, it.product), it => round2(sealedValue(it))).map(l => ({ ...l, kind: 'sealed' })),
    ].sort((a, b) => b.unit - a.unit)
    return { ...g, lines, count: g.items.length }
  })
  return groups.sort((a, b) => b.value - a.value)
}

export default function StoreStock({ place, onRip, onPick, onHold }) {
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  useGame(s => s.marketMults) // re-render on market drift so values stay live
  const cap = useGame(floorCapacity)
  const onFloorNow = useGame(floorCount)
  const restockFloor = useGame(s => s.restockFloor)
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  const { groups, totalValue, totalCount } = useMemo(() => {
    let cards, sealed
    if (place === 'personal') {
      cards = (collection || []).filter(c => c.locked)
      sealed = (sealedInventory || []).filter(it => it.locked)
    } else if (place === 'floor') {
      cards = (collection || []).filter(c => c.loc === 'floor' && !c.locked)
      sealed = (sealedInventory || []).filter(it => it.loc === 'floor' && !it.locked)
    } else { // storeroom: sellable, not out front
      cards = (collection || []).filter(c => c.loc !== 'floor' && !c.locked)
      sealed = (sealedInventory || []).filter(it => it.loc !== 'floor' && !it.locked)
    }
    const groups = bySet(cards, sealed)
    const totalValue = groups.reduce((a, g) => a + g.value, 0)
    const totalCount = groups.reduce((a, g) => a + g.count, 0)
    return { groups, totalValue, totalCount }
  }, [collection, sealedInventory, place])

  const meta = PLACE[place]
  const floorFull = place !== 'personal' && cap > 0 && onFloorNow >= cap

  return (
    <>
      {/* Header: what this place is + the floor capacity meter + restock lever */}
      <div className="banner" style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span>{meta.icon} <b>{meta.title}</b> — {totalCount} item{totalCount === 1 ? '' : 's'} · <b>{fmtMoney(totalValue)}</b>
          {place === 'personal' && <> · <span className="muted">kept for yourself, not for sale</span></>}
          {place === 'floor' && <> · <span className={floorFull ? '' : 'muted'} style={floorFull ? { color: 'var(--gold)' } : undefined}>{onFloorNow}/{cap} floor slots{floorFull ? ' — full' : ''}</span></>}
          {place === 'storeroom' && <> · <span className="muted">backstock (sells nothing until you stock the floor)</span></>}
        </span>
        {place !== 'personal' && (
          <button className="btn" style={{ flex: 'none', marginLeft: 'auto', padding: '5px 12px' }}
            disabled={floorFull || (place === 'floor' && onFloorNow >= cap)}
            title={floorFull ? 'The floor is full — move something off it first' : 'Fill every open floor slot from your storeroom, best product first'}
            onClick={() => { const n = restockFloor(); flash(n ? `Put ${n} item${n === 1 ? '' : 's'} out on the floor.` : 'Nothing to stock (storeroom empty or floor full).') }}>
            🛒 Stock the floor
          </button>
        )}
      </div>

      {place === 'floor' && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 2px 6px' }}>
          Only floor stock sells to walk-ins & the counter. <b>🔒 Keep</b> takes a line home (Personal); <b>📦</b> sends it to the back.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="empty" style={{ marginTop: 12 }}>{meta.empty}</div>
      ) : (
        <div className="store-sets">
          {groups.map(g => (
            <div key={g.setId} className="wants" style={{ marginTop: 10 }}>
              <div className="wants-head">
                {g.name} <span className="muted">— {g.count} item{g.count === 1 ? '' : 's'} · {fmtMoney(g.value)}</span>
              </div>
              <div className="stock-lines">
                {g.lines.map(line => (
                  <StockRow key={`${line.kind}|${line.key}`} line={line} place={place}
                    cap={cap} onFloorNow={onFloorNow} onRip={onRip} onPick={onPick} onHold={onHold} flash={flash} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && <div className="toast" style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>{toast}</div>}
    </>
  )
}

// One SKU line (identical copies stacked) + the actions that fit its place.
function StockRow({ line, place, cap, onFloorNow, onRip, onPick, onHold, flash }) {
  const moveStock = useGame(s => s.moveStock)
  const toggleFeatureCard = useGame(s => s.toggleFeatureCard)
  const quickSell = useGame(s => s.quickSell)
  const listOnSite = useGame(s => s.listOnSite)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const listSealed = useGame(s => s.listSealed)
  const FEATURED_MAX = useGame(s => s.FEATURED_MAX + (s.upgrades.vault ? 4 : 0))
  const featuredTotal = useGame(s => s.collection.filter(c => c._featured).length)

  const { kind, first, items, unit, count } = line
  const set = kind === 'sealed' ? setById(first.setId) : null
  const label = kind === 'card' ? first.name : `${first.product.type} · ${set?.name || 'sealed'}`
  const uids = items.map(x => x.uid)
  const featuredCopy = kind === 'card' ? items.find(x => x._featured) : null
  const floorFull = cap > 0 && onFloorNow >= cap

  const move = (dest, verb) => {
    const r = moveStock(kind, uids, dest)
    if (dest === 'floor' && r.capped) flash(`Floor's full — put out ${r.moved}, ${r.capped} stayed in back.`)
    else flash(`${verb} ${count > 1 ? `${count}× ` : ''}${label}.`)
  }
  function featureToggle() {
    if (featuredCopy) { toggleFeatureCard(featuredCopy.uid); flash(`Unfeatured ${label}.`); return }
    if (featuredTotal >= FEATURED_MAX) { flash(`Display case is full (max ${FEATURED_MAX}).`); return }
    if (toggleFeatureCard(items[0].uid)) flash(`⭐ ${label} is in the display case — whales take notice.`)
  }

  return (
    <div className="trade-line stock-line">
      {kind === 'card'
        ? <img className="tl-thumb" src={cardImg(first)} alt="" loading="lazy" decoding="async"
            onClick={() => onPick && onPick(first)} style={onPick ? { cursor: 'pointer' } : undefined} />
        : <span className="tl-icon">{first.product.icon || '📦'}</span>}
      <div className="tl-info" onClick={() => kind === 'card' && onPick && onPick(first)} style={kind === 'card' && onPick ? { cursor: 'pointer' } : undefined}>
        <div className="tl-name">{featuredCopy ? '⭐ ' : ''}{label}</div>
        <div className="tl-sub muted">
          {kind === 'card' ? skuBadge(first) : `${first.product.packs} pk${first.vintage ? ' · 🗝️ vintage' : ''}`}
        </div>
      </div>
      <span className="tl-unit">{fmtMoney(unit)}</span>
      <span className="tl-count" title={`${count} in stock`}>×{count}</span>

      {/* Move + sell actions per place */}
      {place === 'floor' && <>
        {kind === 'card' && (
          <button className={`stock-act ${featuredCopy ? 'on' : ''}`} title="Feature in the display case — pulls whales" onClick={featureToggle}>{featuredCopy ? '⭐' : '☆'}</button>
        )}
        <button className="stock-act" title="Take it home (Personal) — off the sales floor, not for sale" onClick={() => move('personal', '🔒 Kept')}>🔒</button>
        <button className="stock-act" title="Send to the storeroom (off the floor)" onClick={() => move('storeroom', '📦 Moved to back')}>📦</button>
        {onHold && <button className="stock-act" title="Set one aside for a regular — they come pick it up at a premium" onClick={() => onHold(kind, items[0].uid, label)}>🗝️</button>}
      </>}

      {place === 'storeroom' && <>
        <button className="stock-act" disabled={floorFull} title={floorFull ? 'Floor is full' : 'Put it out on the sales floor'} onClick={() => move('floor', '🛒 Out on the floor')}>🛒</button>
        <button className="stock-act" title="Keep it for yourself (Personal)" onClick={() => move('personal', '🔒 Kept')}>🔒</button>
        {kind === 'card' ? <>
          <button className="stock-act" title="List one online" onClick={() => { if (listOnSite(items[0].uid, 0.9)) flash(`Listed ${label} online.`) }}>🏷️</button>
          <button className="stock-act" title="Quick-sell one now" onClick={() => { quickSell(items[0].uid); flash(`Quick-sold ${label}.`) }}>💵</button>
        </> : <>
          <button className="stock-act" title="Rip one now" onClick={() => onRip && onRip(items[0].uid)}>🎬</button>
          <button className="stock-act" title="List one online" onClick={() => { if (listSealed(items[0].uid, 1.0)) flash(`Listed ${label} online.`) }}>🏷️</button>
          <button className="stock-act" title="Quick-flip one for fast cash" onClick={() => { quickFlipSealed(items[0].uid); flash(`Flipped ${label}.`) }}>💵</button>
        </>}
      </>}

      {place === 'personal' && (
        <button className="stock-act" title="Put it back in the storeroom (makes it sellable again)" onClick={() => move('storeroom', '📦 Back in the storeroom')}>📦</button>
      )}
    </div>
  )
}
