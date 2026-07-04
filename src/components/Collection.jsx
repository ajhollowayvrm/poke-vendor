import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rarityRank, fmtMoney, GRADING, gradingFee, bulkDiscount, isBulkCard, bulkSellableUids } from '../game/engine'
import CardTile from './CardTile'

export default function Collection({ onPick }) {
  const collection = useGame(s => s.collection)
  const sellAllUngraded = useGame(s => s.sellAllUngraded)
  const sellToBuylist = useGame(s => s.sellToBuylist)
  const buylistRate = useGame(s => s.buylistRate)
  const submitted = useGame(s => s.gradesSubmitted)
  // bulk action handlers
  const submitGradesBulk = useGame(s => s.submitGradesBulk)
  const quickSellMany = useGame(s => s.quickSellMany)
  const listManyOnSite = useGame(s => s.listManyOnSite)
  const consignMany = useGame(s => s.consignMany)
  const listingQuote = useGame(s => s.listingQuote)
  const stockShop = useGame(s => s.stockShop)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  // Master-set protection: keep-one-of-each guard + per-card locks.
  const keepOne = useGame(s => s.settings.keepOne)
  const setSetting = useGame(s => s.setSetting)
  const toggleLock = useGame(s => s.toggleLock)
  const lockMany = useGame(s => s.lockMany)

  const [sort, setSort] = useState('value')
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [listPct, setListPct] = useState(90) // ask % of market for bulk "list on site"
  // Bulk-list channel: with a storefront, default to EVERYWHERE (online + store case) —
  // walk-ins buy fee-free at a premium; online pays the marketplace fee + shipping.
  const [listEverywhere, setListEverywhere] = useState(true)
  const [gradeTier, setGradeTier] = useState('economy') // service tier for bulk grading
  const [toast, setToast] = useState(null)
  const listMult = (parseFloat(listPct) || 0) / 100

  // One unified list of EVERYTHING — raw cards and graded slabs mixed together
  // (the slab look already distinguishes graded at a glance). Value-sort floats
  // the slabs up naturally by their graded value.
  const view = useMemo(() => {
    return [...collection].sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
  }, [collection, sort])

  const quickSellRate = useGame(s => s.quickSellRate)
  // "Bulk" by live attributes (raw, unfoiled, below the hit threshold) — matches the
  // store's isBulkCard exactly, so the button counts/value reflect what actually sells
  // and never sweeps a MEGA_ATTACK / SIR / foil that happens to lack the _isHit flag.
  // Route it through the protection net so the labels reflect exactly what the action
  // will sell (locks + keep-one held back), and we can surface how many are protected.
  const { bulk, bulkVal, buylistVal, bulkKept } = useMemo(() => {
    const bulkAll = collection.filter(isBulkCard)
    const { sell, kept } = bulkSellableUids(collection, bulkAll.map(c => c.uid), { keepOne })
    const sellSet = new Set(sell)
    const toSell = bulkAll.filter(c => sellSet.has(c.uid))
    return {
      bulk: toSell,
      bulkVal: toSell.reduce((a, c) => a + cardValue(c) * quickSellRate, 0),
      buylistVal: toSell.reduce((a, c) => a + cardValue(c) * buylistRate, 0),
      bulkKept: kept.length,
    }
  }, [collection, keepOne, quickSellRate, buylistRate])
  const buylistBulk = bulk

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2800) }
  // Appended to a bulk-action toast when the protection net held cards back.
  function keptNote(kept) { return kept ? ` 🔒 Kept ${kept} you need.` : '' }
  function clearSel() { setPicked(new Set()) }
  function exitSelect() { setSelectMode(false); clearSel() }

  function onTile(c) {
    if (!selectMode) { onPick(c); return }
    setPicked(p => { const n = new Set(p); n.has(c.uid) ? n.delete(c.uid) : n.add(c.uid); return n })
  }
  // Select-all toggles every card in the current view.
  function selectAllInView() {
    setPicked(p => p.size === view.length ? new Set() : new Set(view.map(c => c.uid)))
  }

  // Selected cards + derived totals for the action bar.
  const selCards = useMemo(() => view.filter(c => picked.has(c.uid)), [view, picked])
  const selValue = selCards.reduce((a, c) => a + cardValue(c), 0)
  const count = selCards.length
  // grading is raw-only; selecting graded cards just can't be graded
  const rawSelected = selCards.filter(c => !c.grade)
  const gradeFeePer = gradingFee(gradeTier, submitted, rawSelected.length || 1)
  const gradeTotal = +(gradeFeePer * rawSelected.length).toFixed(2)
  const gradeBulk = bulkDiscount(rawSelected.length)

  // Live demand hint for the "List @ X%" slider — how much of the browsing pool
  // would buy at this ask (sampled on the first selected card). Higher % = sells faster.
  const listHint = useMemo(() => {
    if (!selCards.length) return null
    const q = listingQuote(selCards[0], listMult)
    const share = Math.round((q.buyShare || 0) * 100)
    if (share >= 60) return { txt: `most buyers will take this`, cls: 'good' }
    if (share >= 25) return { txt: `some buyers will bite — slower`, cls: 'ok' }
    if (share > 0)   return { txt: `only bargain-blind buyers — sits a while`, cls: 'warn' }
    return { txt: `no one will pay this — it'll just sit`, cls: 'bad' }
  }, [selCards, listMult, listingQuote])

  if (!collection.length)
    return <div className="empty">No cards yet — head to Buy and rip a pack. 📦</div>

  return (
    <>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>{collection.length} card{collection.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="value">Sort: Value</option><option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        <button className={`btn ${selectMode ? 'gold' : 'alt'}`} style={{ flex: 'none' }}
          onClick={() => selectMode ? exitSelect() : setSelectMode(true)}>
          {selectMode ? '✕ Cancel select' : '☑️ Select'}
        </button>
        {selectMode && (
          <button className="btn alt" style={{ flex: 'none' }} onClick={selectAllInView}>
            {picked.size === view.length && view.length ? 'Deselect all' : `Select all (${view.length})`}
          </button>
        )}
        {/* Master-set safety net: when on, no bulk sell ever dumps your last copy of a card. */}
        <button className={`btn ${keepOne ? 'gold' : 'alt'}`} style={{ flex: 'none' }}
          title="Protect set singles: bulk sells skip your last copy of each card, so a sweep only dumps duplicates. Locked cards (🔒) are always kept."
          onClick={() => setSetting('keepOne', !keepOne)}>
          {keepOne ? '🔒 Keeping singles' : '🔓 Keep singles'}
        </button>
        {!selectMode && buylistBulk.length > 0 && (
          <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }}
            title={`Dump all bulk to a shop's buylist at ${Math.round(buylistRate*100)}% of market — instant cash${bulkKept ? ` · ${bulkKept} protected card${bulkKept>1?'s':''} held back` : ''}`}
            onClick={sellToBuylist}>Buylist {buylistBulk.length} → {fmtMoney(buylistVal)}</button>
        )}
        {!selectMode && bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: buylistBulk.length ? 0 : 'auto' }}
            title={`Quick-sell all raw commons/uncommons (non-hits) instantly${bulkKept ? ` · ${bulkKept} protected card${bulkKept>1?'s':''} held back` : ''}`}
            onClick={sellAllUngraded}>Sell {bulk.length} raw → {fmtMoney(bulkVal)}</button>
        )}
      </div>
      {!selectMode && bulkKept > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '6px 2px 0' }}>
          🔒 {bulkKept} card{bulkKept>1?'s':''} protected from the bulk sweep — {keepOne ? 'set singles + locked' : 'locked'}.
        </p>
      )}

      {view.length === 0 ? (
        <div className="empty">No cards yet — head to Buy and rip a pack. 📦</div>
      ) : (
        <div className="grid coll-grid">
          {view.map(c => (
            <div key={c.uid} className={`coll-cell ${selectMode ? 'selectable' : ''} ${picked.has(c.uid) ? 'picked' : ''} ${c.locked ? 'locked' : ''}`} onClick={() => onTile(c)}>
              <CardTile card={c} noBorder />
              {selectMode && picked.has(c.uid) && <span className="coll-check">✓</span>}
              {/* Per-card lock: a hard "never bulk-sell this" toggle. Hidden in select mode
                  (locking there is a bulk action); always shown otherwise so it works on touch. */}
              {!selectMode && (
                <button className={`coll-lock ${c.locked ? 'on' : ''}`}
                  title={c.locked ? 'Locked — never included in a bulk sell. Tap to unlock.' : 'Lock this card — protect it from bulk sells.'}
                  onClick={e => { e.stopPropagation(); toggleLock(c.uid) }}>{c.locked ? '🔒' : '🔓'}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating bulk-action bar — appears when cards are selected. */}
      {selectMode && count > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-summary">
            <b>{count} selected</b> · {fmtMoney(selValue)} market
          </div>
          <div className="bulk-bar-actions">
            {rawSelected.length > 0 && (
              <div className="bulk-grade-group">
                <select value={gradeTier} onClick={e => e.stopPropagation()} onChange={e => setGradeTier(e.target.value)}>
                  {Object.entries(GRADING).map(([key, t]) => (
                    <option key={key} value={key}>{t.name} · ~{t.days}d</option>
                  ))}
                </select>
                <button className="btn alt" onClick={() => {
                  const n = rawSelected.length
                  submitGradesBulk(rawSelected.map(c => c.uid), gradeTier)
                  flash(`Submitted ${n} card${n>1?'s':''} to ${GRADING[gradeTier].name} grading${gradeBulk ? ` (${Math.round(gradeBulk*100)}% bulk off)` : ''}.`)
                  exitSelect()
                }}>
                  🔬 Grade ({fmtMoney(gradeTotal)}{gradeBulk ? `, −${Math.round(gradeBulk*100)}%` : ''})
                </button>
              </div>
            )}
            <div className="bulk-list-group">
              <div className="list-pct-row">
                <span className="muted" style={{ fontSize: 12 }}>Ask</span>
                {[80, 90, 100, 110].map(p => (
                  <button key={p} className={`pctbtn ${Math.round(listMult*100) === p ? 'on' : ''}`}
                    onClick={e => { e.stopPropagation(); setListPct(p) }}>{p}%</button>
                ))}
                <input className="pctinput" type="number" min="50" max="300" step="5" value={listPct}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setListPct(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))} />
                <span className="muted" style={{ fontSize: 12 }}>%</span>
              </div>
              {hasStore && (
                <button className={`btn ${listEverywhere ? 'gold' : 'alt'}`} style={{ flex: 'none' }}
                  title={listEverywhere
                    ? 'Everywhere: also out in your store case — walk-ins buy fee-free at the +12% in-person premium; whichever channel sells first takes it. Tap for online-only.'
                    : 'Online only: web listing, pays the 5% fee + shipping per sale. Tap to also put them in your store case.'}
                  onClick={() => setListEverywhere(v => !v)}>
                  {listEverywhere ? '🏬+🌐 Everywhere' : '🌐 Online only'}
                </button>
              )}
              <button className="btn" disabled={!listMult} onClick={() => {
                const { sold, kept } = listManyOnSite(selCards.map(c => c.uid), listMult, { everywhere: hasStore && listEverywhere })
                flash(`Listed ${sold} card${sold>1?'s':''} at ${Math.round(listMult*100)}% of market${hasStore && listEverywhere ? ' — online + store case' : ''}.${keptNote(kept)}`)
                exitSelect()
              }}>{hasStore && listEverywhere ? '🏬+🌐' : '🌐'} List @ {Math.round(listMult*100)}%</button>
              {listHint && <span className={`list-hint ${listHint.cls}`}>{listHint.txt}</span>}
            </div>
            <button className="btn alt" onClick={() => {
              const { sold, kept } = consignMany(selCards.map(c => c.uid))
              flash(`Consigned ${sold} card${sold>1?'s':''}.${keptNote(kept)}`)
              exitSelect()
            }}>↗ Consign</button>
            {hasStore && (
              <button className="btn alt" onClick={() => {
                const { sold, kept } = stockShop(selCards.map(c => c.uid))
                flash(`Put ${sold} card${sold>1?'s':''} out on the shop shelf — walk-ins can buy them now.${keptNote(kept)}`)
                exitSelect()
              }}>🏬 Stock shop</button>
            )}
            {/* Lock/unlock the selection — a hard bulk-sell guard for specific keepers. */}
            <button className="btn alt" onClick={() => {
              const lock = !selCards.every(c => c.locked)
              const n = lockMany(selCards.map(c => c.uid), lock)
              flash(`${lock ? '🔒 Locked' : '🔓 Unlocked'} ${n} card${n>1?'s':''}.`)
              exitSelect()
            }}>{selCards.every(c => c.locked) ? '🔓 Unlock' : '🔒 Lock'}</button>
            <button className="btn alt" onClick={() => {
              const { got, sold, kept } = quickSellMany(selCards.map(c => c.uid))
              flash(`Quick-sold ${sold} card${sold>1?'s':''} for ${fmtMoney(got)}.${keptNote(kept)}`)
              exitSelect()
            }}>💸 Quick-sell {fmtMoney(selValue * quickSellRate)}</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
