import { useMemo, useState } from 'react'
import { useGame, floorCount, floorSkuCap, floorItemCap, floorSkuCounts, floorSkuKey, isVintageFloorItem } from '../game/store'
import { cardValue, sealedValue, setById, setIdOfCard, fmtMoney, round2, cardImg, setNameOfCard, GRADING, gradingFee, cutEstimate, cutRank, CONDITIONS, breakOptions, psaValueAt, rarityRank } from '../game/engine'
import { groupCardLines, groupLines, sealedSku } from './sku'
import CardTile from './CardTile'
import SealedModal from './SealedModal'

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
  personal:  { icon: '🗂️', title: 'Personal', empty: 'Nothing here yet — everything you rip lands here first. Send singles out to the floor 🛒 or storeroom 📦 when you want to sell them.' },
}

// Split the raw items into { kind, it } and group them by set, newest set first (release date,
// then name — a stable order, so groups don't reshuffle as the market drifts).
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
  return groups.sort((a, b) => {
    const da = setById(a.setId)?.releaseDate || ''
    const db = setById(b.setId)?.releaseDate || ''
    return db.localeCompare(da) || a.name.localeCompare(b.name)
  })
}

// One centering read for a whole SKU line. Copies on a line share id/condition/price but NOT
// cut — that varies copy to copy — so a stack reads as a worst–best range and a single copy as
// its plain read. The chip takes the BEST copy's colour: "is there a grading candidate in this
// stack?" is the question the row scan answers. Fuzzy (no loupe) wording stays coarse.
function lineCutSummary(items, precise) {
  const ranked = [...items].sort((a, b) => cutRank(a) - cutRank(b))
  const worst = cutEstimate(ranked[0], precise)
  const best = cutEstimate(ranked[ranked.length - 1], precise)
  const lo = precise ? worst.abbr : worst.short
  const hi = precise ? best.abbr : best.short
  return {
    icon: precise ? '🔍' : '👁️',
    text: lo === hi ? (precise ? best.label : best.short) : `${lo}–${hi}`,
    color: best.color,
    title: precise
      ? (lo === hi
          ? `Centering: ${best.label}${best.detail ? ` — ${best.detail}` : ''}`
          : `Centering varies copy to copy: ${worst.label} → ${best.label} (chip coloured by the best copy)`)
      : "Eyeball read of the centering — the 🔍 Jeweler's Loupe reads it precisely.",
  }
}

export default function StoreStock({ place, onRip, onSift, onPick, onHold, only, split }) {
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  useGame(s => s.marketMults) // re-render on market drift so values stay live
  const skuCap = useGame(floorSkuCap)          // max copies of ONE thing on the floor
  const packCap = useGame(s => floorItemCap(s, 'sealed', { product: { packs: 1 } })) // the deeper loose-pack bin
  const onFloorNow = useGame(floorCount)       // total items out front (for the readout)
  const floorSkus = useMemo(() => floorSkuCounts({ collection, sealedInventory }), [collection, sealedInventory])
  const restockFloor = useGame(s => s.restockFloor)
  const moveStock = useGame(s => s.moveStock)
  const breakSealed = useGame(s => s.breakSealed)
  const submitGradesBulk = useGame(s => s.submitGradesBulk)
  const gradesSubmitted = useGame(s => s.gradesSubmitted)
  const hasLoupe = useGame(s => !!s.upgrades.loupe) // 🔍 precise centering read vs a fuzzy eyeball one
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }
  // Tapping a sealed line/tile opens its detail modal — the "what is this?" read the tiny
  // set-symbol thumbnail can't give. Lives here (not routed through onPick, which is card-only).
  const [sealedView, setSealedView] = useState(null)

  // Per-tile quick actions for the grid — the same moves the table rows offer, so switching to
  // the tile view isn't a dead end. move out of Personal un-keeps the item (moveStock strips the
  // kept flag); break/rip are sealed-only.
  function tileMove(kind, uid, dest) {
    const r = moveStock(kind, [uid], dest)
    if (dest === 'floor' && r.capped) return flash("Floor's full for that one — still in back.")
    flash(dest === 'floor' ? '🛒 Out on the floor.' : '📦 Moved to the storeroom.')
  }
  function tileBreak(it) {
    const opt = breakOptions(it)[0]
    if (!opt) return
    const r = breakSealed(it.uid, opt.product.type)
    if (r?.error) return flash(r.error)
    flash(`🔨 Broke into ${r.count}× ${r.type} (in the Storeroom).`)
  }

  // Personal keepsakes can be browsed as the SKU table (default) or as a big-art grid — the
  // grid is where you eyeball centering + condition before picking a batch to grade. Sticky
  // per-place via localStorage so the choice survives a reload without touching the save.
  const gridOK = place === 'personal'
  const [viewMode, setViewMode] = useState(() => (gridOK && localStorage.getItem('pv-personal-view')) || 'table')
  function setView(v) {
    setViewMode(v)
    if (gridOK) localStorage.setItem('pv-personal-view', v)
    setSelectMode(false); setPicked(new Set()); setPickedUids(new Set()) // selection semantics differ per view
  }

  // Personal keepsakes get the same sort options as the no-storefront Collection view —
  // Value / PSA-10 upside / Rarity / Name. Sorting is a flat-list idea, so choosing one drops
  // the set grouping and drives the grid. Sticky per localStorage like the view mode.
  const [sortMode, setSortMode] = useState(() => (gridOK && localStorage.getItem('pv-personal-sort')) || 'value')
  function setSort(v) {
    setSortMode(v)
    if (gridOK) localStorage.setItem('pv-personal-sort', v)
    if (viewMode !== 'grid') setView('grid') // sorting only reads in the flat grid, so switch to it
  }

  // Multi-select: table picks whole SKU lines; grid picks individual cards (so you can grade
  // by centering, which varies copy-to-copy and is hidden inside a collapsed SKU line).
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState(() => new Set()) // table: set of line keys
  const [pickedUids, setPickedUids] = useState(() => new Set()) // grid: set of card/sealed uids
  const [gradeTier, setGradeTier] = useState('economy')

  // Click a set's title to collapse its lines (the header keeps showing count + value, so a
  // collapsed set still reads at a glance). Sticky per-place via localStorage so folding a set
  // away survives a reload. Keyed by setId within this place.
  const collapseKey = `pv-collapsed-${place}`
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(collapseKey) || '[]')) } catch { return new Set() }
  })
  function toggleCollapse(setId) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(setId) ? next.delete(setId) : next.add(setId)
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }
  function setAllCollapsed(fold) {
    setCollapsed(prev => {
      // Touch only the sections in this view — collapse state for sets not currently stocked survives.
      const next = new Set(prev)
      collapseIds.forEach(id => (fold ? next.add(id) : next.delete(id)))
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }

  const { groups, totalValue, totalCount, cards, sealed, cardGroups, sealedGroups } = useMemo(() => {
    let cards, sealed
    if (place === 'personal') {
      cards = (collection || []).filter(c => c.locked)
      sealed = (sealedInventory || []).filter(it => it.locked)
    } else if (place === 'floor') {
      cards = (collection || []).filter(c => c.loc === 'floor' && !c.locked)
      sealed = (sealedInventory || []).filter(it => it.loc === 'floor' && !it.locked)
    } else { // storeroom: sellable backstock, not out front and not held for a regular
      cards = (collection || []).filter(c => c.loc !== 'floor' && !c.locked && !c._heldFor)
      sealed = (sealedInventory || []).filter(it => it.loc !== 'floor' && !it.locked && !it._heldFor)
    }
    // `only` narrows the view to one kind — used to give Personal separate Cards / Sealed tabs.
    if (only === 'cards') sealed = []
    else if (only === 'sealed') cards = []
    const groups = bySet(cards, sealed)
    const totalValue = groups.reduce((a, g) => a + g.value, 0)
    const totalCount = groups.reduce((a, g) => a + g.count, 0)
    // `split` renders singles and sealed as two separate shelves (real-shop feel). Each is the
    // same set-grouped list, just filtered to one kind. Selection still runs off `groups`, whose
    // line keys are identical, so nothing else needs to know about the split.
    const cardGroups = split ? bySet(cards, []) : null
    const sealedGroups = split ? bySet([], sealed) : null
    return { groups, totalValue, totalCount, cards, sealed, cardGroups, sealedGroups }
  }, [collection, sealedInventory, place, only, split])

  // Every collapsible section's id. In the split view the SAME set appears as two independent
  // sections (Singles + Sealed shelves), so ids carry the shelf prefix ('c'/'s') — folding one
  // shelf's section must not fold the other's. Non-split sections keep the bare setId.
  const collapseIds = useMemo(() => (
    split
      ? [...(cardGroups || []).map(g => 'c' + g.setId), ...(sealedGroups || []).map(g => 's' + g.setId)]
      : groups.map(g => g.setId)
  ), [split, cardGroups, sealedGroups, groups])

  const meta = PLACE[place]
  // Kind-scoped empty copy so a Personal ▸ Sealed tab doesn't show the cards blurb.
  const emptyMsg = only === 'sealed'
    ? 'No sealed keepsakes — 🔒 Keep a box or pack (from the Store floor or storeroom) to stash it here.'
    : only === 'cards'
    ? 'No kept cards yet — 🔒 Keep a single to set it aside here, off the sales floor.'
    : meta.empty

  // Grid view shows every copy on its own tile (uncollapsed), value-first, so per-card
  // centering is meaningful. Only built when the grid is actually up.
  const gridItems = useMemo(() => {
    if (!(gridOK && viewMode === 'grid')) return []
    const arr = [
      ...cards.map(it => ({ kind: 'card', it, v: cardValue(it) })),
      ...sealed.map(it => ({ kind: 'sealed', it, v: sealedValue(it) })),
    ]
    // Sort keys mirror Collection's. PSA-10 upside and rarity are card-only concepts, so sealed
    // keepsakes fall back to their market value on those and simply sort among themselves by worth.
    const keyOf = {
      value: x => -x.v,
      psa10: x => -(x.kind === 'card' ? psaValueAt(x.it, 10) : x.v),
      rarity: x => -(x.kind === 'card' ? rarityRank(x.it.rarity) : -1),
      name: x => (x.kind === 'card' ? x.it.name : x.it.product.type).toLowerCase(),
    }[sortMode] || (x => -x.v)
    return arr.sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); return ka < kb ? -1 : ka > kb ? 1 : 0 })
  }, [cards, sealed, gridOK, viewMode, sortMode])

  const gridMode = gridOK && viewMode === 'grid'

  // Flatten to lines for select-all + the selection's derived totals (table view).
  const allLines = useMemo(() => groups.flatMap(g => g.lines), [groups])
  const selectedLines = useMemo(() => allLines.filter(l => picked.has(l.key)), [allLines, picked])
  const sel = useMemo(() => {
    const cardUids = [], sealedUids = [], rawCardUids = []
    let value = 0, count = 0
    const add = (kind, it) => {
      count += 1
      value += kind === 'sealed' ? sealedValue(it) : cardValue(it)
      if (kind === 'sealed') sealedUids.push(it.uid)
      else { cardUids.push(it.uid); if (!it.grade) rawCardUids.push(it.uid) }
    }
    if (gridMode) {
      for (const { kind, it } of gridItems) if (pickedUids.has(it.uid)) add(kind, it)
    } else {
      for (const l of selectedLines) for (const it of l.items) add(l.kind, it)
    }
    return { cardUids, sealedUids, rawCardUids, value, count }
  }, [gridMode, gridItems, pickedUids, selectedLines])
  const gradeTotal = round2(gradingFee(gradeTier, gradesSubmitted, sel.rawCardUids.length || 1) * sel.rawCardUids.length)

  // Render a set-grouped list of SKU lines. `kp` prefixes React keys so the same set can appear in
  // both the Singles and Sealed shelves (split view) without a key collision.
  const renderGroups = (list, kp) => list.map(g => {
    const cid = `${kp}${g.setId}` // shelf-prefixed in split view so Singles/Sealed fold independently
    const isCollapsed = collapsed.has(cid)
    return (
      <div key={cid} className="wants" style={{ marginTop: 10 }}>
        <div className="wants-head" role="button" tabIndex={0} aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Show this set' : 'Hide this set'}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => toggleCollapse(cid)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(cid) } }}>
          <span aria-hidden style={{ display: 'inline-block', width: 12, fontSize: 10, opacity: 0.7, transition: 'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
          {' '}{g.name} <span className="muted">— {g.count} item{g.count === 1 ? '' : 's'} · {fmtMoney(g.value)}</span>
        </div>
        {!isCollapsed && (
          <div className="stock-lines">
            {g.lines.map(line => (
              <StockRow key={`${line.kind}|${line.key}`} line={line} place={place}
                floorSkus={floorSkus} onRip={onRip} onPick={onPick} onInspect={setSealedView} onHold={onHold} flash={flash}
                selectMode={selectMode} selected={picked.has(line.key)} onToggle={() => toggleLine(line.key)} />
            ))}
          </div>
        )}
      </div>
    )
  })

  function toggleLine(key) { setPicked(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }) }
  function toggleUid(uid) { setPickedUids(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n }) }
  function selectAll() {
    if (gridMode) setPickedUids(p => (p.size === gridItems.length ? new Set() : new Set(gridItems.map(x => x.it.uid))))
    else setPicked(p => (p.size === allLines.length ? new Set() : new Set(allLines.map(l => l.key))))
  }
  const allPicked = gridMode ? (gridItems.length > 0 && pickedUids.size === gridItems.length) : (picked.size === allLines.length)
  const selectableCount = gridMode ? gridItems.length : allLines.length
  function exitSelect() { setSelectMode(false); setPicked(new Set()); setPickedUids(new Set()) }
  function bulkMove(dest, verb) {
    let moved = 0, capped = 0
    if (sel.cardUids.length) { const r = moveStock('card', sel.cardUids, dest); moved += r.moved; capped += r.capped || 0 }
    if (sel.sealedUids.length) { const r = moveStock('sealed', sel.sealedUids, dest); moved += r.moved; capped += r.capped || 0 }
    flash(capped ? `${verb} ${moved} — ${capped} didn't fit the floor (per-line cap).` : `${verb} ${moved} item${moved === 1 ? '' : 's'}.`)
    exitSelect()
  }
  // ⚡ Hand the selected sealed to the auto-ripper (churns pack by pack, stops on big hits).
  function bulkSift() {
    if (!onSift || !sel.sealedUids.length) return
    const ids = new Set(sel.sealedUids)
    const items = (sealedInventory || []).filter(it => ids.has(it.uid))
    if (items.length) onSift(items)
    exitSelect()
  }
  function bulkGrade() {
    if (!sel.rawCardUids.length || sel.sealedUids.length) return // mixed picks — the button is locked
    const n = sel.rawCardUids.length
    submitGradesBulk(sel.rawCardUids, gradeTier)
    flash(`Submitted ${n} card${n === 1 ? '' : 's'} to ${GRADING[gradeTier].name} grading.`)
    exitSelect()
  }

  return (
    <>
      {/* Header: what this place is + the floor depth readout + restock lever */}
      <div className="banner" style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span>{meta.icon} <b>{meta.title}</b> — {totalCount} item{totalCount === 1 ? '' : 's'} · <b>{fmtMoney(totalValue)}</b>
          {place === 'personal' && <> · <span className="muted">yours first — not for sale except to fill a want</span></>}
          {place === 'floor' && <> · <span className="muted">{onFloorNow} out front · up to {skuCap} of each ({packCap} for loose packs) · 🗝️ vintage unlimited</span></>}
          {place === 'storeroom' && <> · <span className="muted">backstock — sells routine counter orders; stock the floor for walk-ins & whales</span></>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {gridOK && totalCount > 0 && (
            <select value={sortMode} onChange={e => setSort(e.target.value)} title="Sort your keepsakes (switches to the grid)">
              <option value="value">Sort: Value</option>
              <option value="psa10">Sort: PSA 10 price</option>
              <option value="rarity">Sort: Rarity</option>
              <option value="name">Sort: Name</option>
            </select>
          )}
          {gridOK && totalCount > 0 && (
            <span className="view-toggle" role="group" aria-label="View">
              <button className={`vt-btn ${!gridMode ? 'on' : ''}`} title="Table — SKU list with prices" onClick={() => setView('table')}>☰</button>
              <button className={`vt-btn ${gridMode ? 'on' : ''}`} title="Grid — big card art with centering + condition at a glance" onClick={() => setView('grid')}>🔲</button>
            </span>
          )}
          {place !== 'personal' && collapseIds.length > 1 && (() => {
            const allFolded = collapseIds.every(id => collapsed.has(id))
            return (
              <button className="btn alt" style={{ flex: 'none', padding: '5px 12px' }}
                title={allFolded ? 'Open every set section' : 'Fold every set down to its header'}
                onClick={() => setAllCollapsed(!allFolded)}>
                {allFolded ? '▸ Expand all' : '▾ Collapse all'}
              </button>
            )
          })()}
          {totalCount > 0 && (
            <button className={`btn ${selectMode ? 'gold' : 'alt'}`} style={{ flex: 'none', padding: '5px 12px' }}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
              {selectMode ? '✕ Cancel' : '☑️ Select'}
            </button>
          )}
          {selectMode && selectableCount > 0 && (
            <button className="btn alt" style={{ flex: 'none', padding: '5px 12px' }} onClick={selectAll}>
              {allPicked ? 'Deselect all' : `Select all (${selectableCount})`}
            </button>
          )}
          {!selectMode && place !== 'personal' && (
            <button className="btn" style={{ flex: 'none', padding: '5px 12px' }}
              title={`Fill each line up to ${skuCap} out front — ${packCap} for loose packs (vintage unlimited), best product first`}
              onClick={() => { const n = restockFloor(); flash(n ? `Put ${n} item${n === 1 ? '' : 's'} out on the floor.` : 'Nothing to stock (storeroom empty or every line already out).') }}>
              🛒 Stock the floor
            </button>
          )}
        </span>
      </div>
      {selectMode && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 2px 6px' }}>Tap {gridMode ? 'cards' : 'lines'} to select, then choose a bulk action below.</p>
      )}

      {place === 'floor' && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 2px 6px' }}>
          Only floor stock sells to walk-ins & the counter. <b>🔒 Keep</b> takes a line home (Personal); <b>📦</b> sends it to the back.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="empty" style={{ marginTop: 12 }}>{emptyMsg}</div>
      ) : gridMode ? (
        <div className="grid coll-grid" style={{ marginTop: 12 }}>
          {gridItems.map(({ kind, it }) => {
            // Centering read sits under the art next to the on-tile condition chip — together
            // they're the "is this worth grading?" call. Fuzzy without the 🔍 loupe.
            const cut = kind === 'card' && !it.grade ? cutEstimate(it, hasLoupe) : null
            const isPicked = pickedUids.has(it.uid)
            const sealedSet = kind === 'sealed' ? setById(it.setId) : null
            const canBreak = kind === 'sealed' && breakOptions(it).length > 0
            return (
              <div key={it.uid} className={`coll-cell ${selectMode ? 'selectable' : ''} ${isPicked ? 'picked' : ''}`}
                onClick={() => (selectMode ? toggleUid(it.uid) : (kind === 'card' ? (onPick && onPick(it)) : setSealedView(it)))}
                style={selectMode || kind === 'sealed' || (kind === 'card' && onPick) ? { cursor: 'pointer' } : undefined}>
                {kind === 'card'
                  ? <CardTile card={it} noBorder interactive={!selectMode} />
                  : <div className="cardtile no-edge sealed-tile">
                      {sealedSet?.logo
                        ? <img className="sealed-tile-logo" src={sealedSet.logo} alt={sealedSet.name} loading="lazy" decoding="async" />
                        : <span className="sealed-ico">{it.product.icon || '📦'}</span>}
                      <div className="sealed-name">{it.product.icon || '📦'} {it.product.type}</div>
                      {sealedSet && <div className="sealed-set" title={sealedSet.name}>{sealedSet.name}</div>}
                      <div className="sealed-sub muted">{it.product.packs} pk{it.vintage ? ' · 🗝️ vintage' : ''}</div>
                      <span className="price">{fmtMoney(sealedValue(it))}</span>
                    </div>}
                {cut && (
                  <div className="cut-row">
                    <span className="cut-chip" style={{ color: cut.color, background: cut.color + '22' }}
                      title={hasLoupe ? `Centering: ${cut.label}${cut.detail ? ` — ${cut.detail}` : ''}` : "Eyeball read of the centering — the 🔍 Jeweler's Loupe reads it precisely."}>
                      {hasLoupe ? '🔍' : '👁️'} {cut.short}
                    </span>
                  </div>
                )}
                {/* Quick actions per tile so the grid keeps the table's reach. Stop propagation so a
                    button tap doesn't also open the card modal / toggle selection. */}
                {!selectMode && (
                  <div className="tile-acts" onClick={e => e.stopPropagation()}>
                    {canBreak && <button className="stock-act" title="Break down a tier (box → loose packs)" onClick={() => tileBreak(it)}>🔨</button>}
                    {kind === 'sealed' && <button className="stock-act" title="Rip it now" onClick={() => onRip && onRip(it.uid)}>🎬</button>}
                    <button className="stock-act" title="Put it out on the sales floor" onClick={() => tileMove(kind, it.uid, 'floor')}>🛒</button>
                    <button className="stock-act" title="Send it to the storeroom" onClick={() => tileMove(kind, it.uid, 'storeroom')}>📦</button>
                  </div>
                )}
                {selectMode && isPicked && <span className="coll-check">✓</span>}
              </div>
            )
          })}
        </div>
      ) : split ? (
        // Two shelves — singles and sealed kept apart, like a real shop's case vs its wall.
        // Used by the floor AND the storeroom, so the empty copy is place-aware.
        <>
          <div className="floor-sec-h">🃏 Singles <span className="muted">— {cards.length} item{cards.length === 1 ? '' : 's'} · {fmtMoney(cardGroups.reduce((a, g) => a + g.value, 0))}</span></div>
          {cardGroups.length
            ? <div className="store-sets">{renderGroups(cardGroups, 'c')}</div>
            : <div className="floor-sec-empty muted">{place === 'floor'
                ? 'No singles out on the floor — stock some from the 📦 Storeroom.'
                : 'No singles in the back — rip product or buy a collection to restock.'}</div>}
          <div className="floor-sec-h">📦 Sealed <span className="muted">— {sealed.length} item{sealed.length === 1 ? '' : 's'} · {fmtMoney(sealedGroups.reduce((a, g) => a + g.value, 0))}</span></div>
          {sealedGroups.length
            ? <div className="store-sets">{renderGroups(sealedGroups, 's')}</div>
            : <div className="floor-sec-empty muted">{place === 'floor'
                ? 'No sealed out on the floor — stock boxes & packs from the 📦 Storeroom.'
                : 'No sealed in the back — order from a distributor to restock.'}</div>}
        </>
      ) : (
        <div className="store-sets">{renderGroups(groups, '')}</div>
      )}
      {/* Floating bulk-action bar — appears when lines are selected. Actions are place-aware. */}
      {selectMode && sel.count > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-summary"><b>{sel.count} selected</b> · {fmtMoney(sel.value)} market</div>
          <div className="bulk-bar-actions">
            {place !== 'floor' && (
              <button className="btn" onClick={() => bulkMove('floor', '🛒 Out on the floor —')}>🛒 To floor</button>
            )}
            {place !== 'storeroom' && (
              <button className="btn alt" onClick={() => bulkMove('storeroom', '📦 To the storeroom —')}>📦 To storeroom</button>
            )}
            {place !== 'personal' && (
              <button className="btn alt" onClick={() => bulkMove('personal', '🔒 Kept —')}>🔒 Keep (Personal)</button>
            )}
            {onSift && sel.sealedUids.length > 0 && (
              <button className="btn gold" onClick={bulkSift}
                title="Auto-rip these sealed — churns pack by pack and stops on the big-hit packs so you can rip those by hand">
                ⚡ Sift-rip {sel.sealedUids.length}
              </button>
            )}
            {sel.rawCardUids.length > 0 && (
              // Grading is a singles-only pipeline: with sealed in the same selection the
              // button locks rather than silently submitting half the picks — deselect the
              // sealed (or grade first, move second) and it lights back up.
              <div className="bulk-grade-group">
                <select value={gradeTier} disabled={sel.sealedUids.length > 0} onClick={e => e.stopPropagation()} onChange={e => setGradeTier(e.target.value)}>
                  {/* Mail-in tiers only — the On-Site Kiosk (onSite) is a show-floor service. */}
                  {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([key, t]) => (
                    <option key={key} value={key}>{t.name} · ~{t.days}d</option>
                  ))}
                </select>
                <button className="btn alt" disabled={sel.sealedUids.length > 0}
                  title={sel.sealedUids.length ? "Sealed can't be graded — deselect the sealed items to submit these singles." : undefined}
                  onClick={bulkGrade}>🔬 Grade {sel.rawCardUids.length} ({fmtMoney(gradeTotal)})</button>
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast" style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>{toast}</div>}
      {sealedView && <SealedModal item={sealedView} place={place} onClose={() => setSealedView(null)} onRip={onRip} flash={flash} />}
    </>
  )
}

// One SKU line (identical copies stacked) + the actions that fit its place.
function StockRow({ line, place, floorSkus, onRip, onPick, onInspect, onHold, flash, selectMode, selected, onToggle }) {
  const moveStock = useGame(s => s.moveStock)
  const hasLoupe = useGame(s => !!s.upgrades.loupe) // 🔍 exact centering read vs a fuzzy eyeball one
  const toggleFeatureCard = useGame(s => s.toggleFeatureCard)
  const toggleFeatureSealed = useGame(s => s.toggleFeatureSealed)
  const quickSell = useGame(s => s.quickSell)
  const listOnSite = useGame(s => s.listOnSite)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const listSealed = useGame(s => s.listSealed)
  const breakSealed = useGame(s => s.breakSealed)
  const FEATURED_MAX = useGame(s => s.FEATURED_MAX + (s.upgrades.vault ? 4 : 0))
  // Featured singles + featured sealed share the one display case, so the "full" check counts both.
  const featuredTotal = useGame(s => s.collection.filter(c => c._featured).length + (s.sealedInventory || []).filter(it => it._featured).length)
  // This line's own floor depth cap — loose booster packs get a much deeper bin than everything else.
  const lineCap = useGame(s => floorItemCap(s, line.kind, line.first))

  const { kind, first, items, unit, count } = line
  const set = kind === 'sealed' ? setById(first.setId) : null
  const label = kind === 'card' ? first.name : `${first.product.type} · ${set?.name || 'sealed'}`
  const uids = items.map(x => x.uid)
  const featuredCopy = kind === 'card' ? items.find(x => x._featured) : null
  const featuredSealed = kind === 'sealed' ? items.find(x => x._featured) : null // showpiece under glass
  // Per-SKU floor depth: how many of THIS line are already out front (vintage is uncapped).
  const vintageLine = isVintageFloorItem(kind, first)
  const onFloorForSku = floorSkus.get(floorSkuKey(kind, first)) || 0
  const skuFull = !vintageLine && lineCap > 0 && onFloorForSku >= lineCap
  // What one unit of this sealed line splits into — a case → boxes, a box → its loose packs.
  // Empty for a single pack (already atomic) or for cards. breakOptions[0] is the "one tier
  // down" split (box → packs), which is exactly what a box wants.
  const breaks = useMemo(() => (kind === 'sealed' ? breakOptions(first) : []), [kind, first])
  const breakOpt = breaks[0] || null

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
  function featureSealedToggle() {
    if (featuredSealed) { toggleFeatureSealed(featuredSealed.uid); flash(`Unfeatured ${label}.`); return }
    if (featuredTotal >= FEATURED_MAX) { flash(`Display case is full (max ${FEATURED_MAX}).`); return }
    if (toggleFeatureSealed(items[0].uid)) flash(`⭐ ${label} is under glass — a showpiece whales come in for.`)
  }
  // Crack ONE unit of this line down a tier (box → loose packs). Breaks a single unit at a
  // time — a mis-tap on a whole stack of boxes would be an expensive, un-undoable mistake.
  // The packs land in the Storeroom (no floor loc); Stock the Floor puts them out.
  function doBreak() {
    if (!breakOpt) return
    const r = breakSealed(items[0].uid, breakOpt.product.type)
    if (r?.error) return flash(r.error)
    // Broken packs inherit the parent's kept flag: a kept (Personal) box → kept packs stay in
    // Personal; anything else lands in the Storeroom, ready to stock the floor.
    const dest = first.locked ? 'Personal' : 'the Storeroom — stock the floor to sell them'
    flash(`🔨 Broke a ${label} into ${r.count}× ${r.type} (in ${dest}).`)
  }

  return (
    <div className={`trade-line stock-line ${selectMode ? 'selectable' : ''} ${selected ? 'picked' : ''}`}
      onClick={selectMode ? onToggle : undefined} style={selectMode ? { cursor: 'pointer' } : undefined}>
      {selectMode && <span className={`stock-check ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</span>}
      {kind === 'card'
        ? <img className="tl-thumb" src={cardImg(first)} alt="" loading="lazy" decoding="async"
            onClick={selectMode ? undefined : () => onPick && onPick(first)} style={!selectMode && onPick ? { cursor: 'pointer' } : undefined} />
        : (set?.logo
            ? <img className="tl-thumb sealed-thumb" src={set.logo} alt={set.name} loading="lazy" decoding="async"
                title={`${first.product.type} · ${set.name} — tap for details`}
                onClick={selectMode ? undefined : () => onInspect && onInspect(first)} style={!selectMode && onInspect ? { cursor: 'pointer' } : undefined} />
            : <span className="tl-icon" title="Tap for details"
                onClick={selectMode ? undefined : () => onInspect && onInspect(first)} style={!selectMode && onInspect ? { cursor: 'pointer' } : undefined}>{first.product.icon || '📦'}</span>)}
      <div className="tl-info"
        onClick={selectMode ? undefined : () => (kind === 'card' ? (onPick && onPick(first)) : (onInspect && onInspect(first)))}
        style={!selectMode && (kind === 'card' ? onPick : onInspect) ? { cursor: 'pointer' } : undefined}>
        <div className="tl-name">{(featuredCopy || featuredSealed) ? '⭐ ' : ''}{label}</div>
        {/* Card rows sit under their set's header, so the sub line spends its (mobile-tight)
            width on the grading read instead of repeating the set: condition + centering
            chips for raw cards, the PSA grade for slabs, and the finish if it's special. */}
        <div className="tl-sub muted">
          {kind === 'card' ? <>
            {first.grade
              ? <span className="tl-chip" style={{ color: 'var(--gold)', background: '#ffcb0518' }}>PSA {first.grade.overall}</span>
              : (() => {
                  const cond = CONDITIONS[first.condition] || CONDITIONS.NM
                  const cut = lineCutSummary(items, hasLoupe)
                  return <>
                    <span className="tl-chip" style={{ color: cond.color, background: cond.color + '22' }} title={cond.label}>{cond.short}</span>
                    <span className="tl-chip" style={{ color: cut.color, background: cut.color + '22' }} title={cut.title}>{cut.icon} {cut.text}</span>
                  </>
                })()}
            {(first.foil || first.reverse) && (
              <span className="tl-chip" style={first.foil ? { color: first.foil.color } : undefined}>
                {first.foil ? (first.foil.badge || first.foil.label || 'FOIL') : 'RH'}
              </span>
            )}
          </> : `${first.product.packs} pk${first.vintage ? ' · 🗝️ vintage' : ''}`}
        </div>
      </div>
      <span className="tl-unit">{fmtMoney(unit)}</span>
      <span className="tl-count" title={`${count} in stock`}>×{count}</span>

      {/* Move + sell actions per place (hidden in select mode — use the bulk bar). Grouped in
          one strip so phones can drop it to its own line instead of squeezing the name +
          condition/centering chips — the at-a-glance read is the row's whole job. */}
      {!selectMode && <span className="tl-acts">
      {place === 'floor' && <>
        {kind === 'card' && (
          <button className={`stock-act ${featuredCopy ? 'on' : ''}`} title="Feature in the display case — pulls whales" onClick={featureToggle}>{featuredCopy ? '⭐' : '☆'}</button>
        )}
        {kind === 'sealed' && (
          <button className={`stock-act ${featuredSealed ? 'on' : ''}`} title="Feature in the display case — pulls whales" onClick={featureSealedToggle}>{featuredSealed ? '⭐' : '☆'}</button>
        )}
        {kind === 'sealed' && (
          <button className="stock-act" title="Rip one now — cracks it right off the floor" onClick={() => onRip && onRip(items[0].uid)}>🎬</button>
        )}
        <button className="stock-act" title="Take it home (Personal) — off the sales floor, not for sale" onClick={() => move('personal', '🔒 Kept')}>🔒</button>
        <button className="stock-act" title="Send to the storeroom (off the floor)" onClick={() => move('storeroom', '📦 Moved to back')}>📦</button>
        {onHold && <button className="stock-act" title="Set one aside for a regular — they come pick it up at a premium" onClick={() => onHold(kind, items[0].uid, label)}>🗝️</button>}
      </>}

      {place === 'storeroom' && <>
        <button className="stock-act" disabled={skuFull} title={skuFull ? `Already ${lineCap} of this out front — the floor's full for this line` : 'Put it out on the sales floor'} onClick={() => move('floor', '🛒 Out on the floor')}>🛒</button>
        {onHold && <button className="stock-act" title="Save one for a regular — pick who from those who want it" onClick={() => onHold(kind, items[0].uid, label)}>🗝️</button>}
        <button className="stock-act" title="Keep it for yourself (Personal)" onClick={() => move('personal', '🔒 Kept')}>🔒</button>
        {kind === 'card' ? <>
          <button className="stock-act" title="List one online" onClick={() => { if (listOnSite(items[0].uid, 0.9)) flash(`Listed ${label} online.`) }}>🏷️</button>
          <button className="stock-act" title="Quick-sell one now" onClick={() => { quickSell(items[0].uid); flash(`Quick-sold ${label}.`) }}>💵</button>
        </> : <>
          {breakOpt && <button className="stock-act" title={`Break one into ${breakOpt.count}× ${breakOpt.product.type} (lands in the Storeroom)`} onClick={doBreak}>🔨</button>}
          <button className="stock-act" title="Rip one now" onClick={() => onRip && onRip(items[0].uid)}>🎬</button>
          <button className="stock-act" title="List one online" onClick={() => { if (listSealed(items[0].uid, 1.0)) flash(`Listed ${label} online.`) }}>🏷️</button>
          <button className="stock-act" title="Quick-flip one for fast cash" onClick={() => { quickFlipSealed(items[0].uid); flash(`Flipped ${label}.`) }}>💵</button>
        </>}
      </>}

      {place === 'personal' && <>
        {kind === 'sealed' && breakOpt && (
          <button className="stock-act" title={`Break one into ${breakOpt.count}× ${breakOpt.product.type} (kept, stays in Personal)`} onClick={doBreak}>🔨</button>
        )}
        {kind === 'sealed' && (
          <button className="stock-act" title="Rip one now — opening a keepsake pack doesn't put it up for sale" onClick={() => onRip && onRip(items[0].uid)}>🎬</button>
        )}
        <button className="stock-act" disabled={skuFull} title={skuFull ? `Already ${lineCap} of this out front — the floor's full for this line` : 'Put it out on the sales floor (for sale to walk-ins)'} onClick={() => move('floor', '🛒 Out on the floor')}>🛒</button>
        <button className="stock-act" title="Move to the storeroom — sellable backstock, but not yet on the floor" onClick={() => move('storeroom', '📦 To the storeroom')}>📦</button>
      </>}
      </span>}
    </div>
  )
}
