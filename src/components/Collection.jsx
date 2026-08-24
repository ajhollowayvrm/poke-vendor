import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rarityRank, fmtMoney, psaValueAt, GRADING, gradingFee, gradingFeeTotal, bulkDiscount, isBulkCard, bulkSellableUids, BULK_CREDIT_PER_CARD } from '../game/engine'
import { toast as notify } from '../ui/dialog'
import { AskPicker } from '../ui/AskPicker'
import CardTile from './CardTile'

// Shared Undo affordance for the bulk-sale toasts: reverses the sale atomically
// (cards back, cash/credit/stats/rep unwound) while the toast is up.
const undoAction = { label: '↩︎ Undo', onClick: () => { if (useGame.getState().undoBulkSale()) notify('↩︎ Undone — cards restored.') } }

export default function Collection({ onPick }) {
  const collection = useGame(s => s.collection)
  const turnInBulk = useGame(s => s.turnInBulk)
  const stockBinBulk = useGame(s => s.stockBinBulk)
  const lgsCredit = useGame(s => s.lgsCredit)
  const submitted = useGame(s => s.gradesSubmitted)
  // bulk action handlers
  const submitGradesBulk = useGame(s => s.submitGradesBulk)
  const quickSellMany = useGame(s => s.quickSellMany)
  const listManyOnSite = useGame(s => s.listManyOnSite)
  const consignMany = useGame(s => s.consignMany)
  const listingQuote = useGame(s => s.listingQuote)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const upgrades = useGame(s => s.upgrades)   // freight on a grading submission
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
  const listMult = (parseFloat(listPct) || 0) / 100

  // One unified list of EVERYTHING — raw cards and graded slabs mixed together
  // (the slab look already distinguishes graded at a glance). Value-sort floats
  // the slabs up naturally by their graded value.
  const view = useMemo(() => {
    return [...collection].sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'psa10' ? psaValueAt(b, 10) - psaValueAt(a, 10) // rank by gem-mint upside
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
  }, [collection, sort])

  // Render the grid incrementally: with value-sort the interesting cards are at the top
  // and the long tail is bulk — mounting 500+ tilt-wrapped tiles at once is the main
  // collection-tab jank on iPhone. "Show more" pages the tail in on demand.
  const PAGE = 120
  const [shown, setShown] = useState(PAGE)
  useEffect(() => { setShown(PAGE) }, [sort]) // new ordering → back to the top slice

  const quickSellRate = useGame(s => s.quickSellRate)
  // "Bulk" by live WORTH (raw, under a dollar) — matches the store's isBulkCard exactly, so
  // the button counts/value reflect what actually sells and never sweeps a card worth real
  // money. Route it through the protection net so the labels reflect exactly what the action
  // will sell (locks + keep-one held back), and we can surface how many are protected.
  const { bulk, creditVal, bulkKept } = useMemo(() => {
    const bulkAll = collection.filter(isBulkCard)
    const { sell, kept } = bulkSellableUids(collection, bulkAll.map(c => c.uid), { keepOne })
    const sellSet = new Set(sell)
    const toSell = bulkAll.filter(c => sellSet.has(c.uid))
    return {
      bulk: toSell,
      creditVal: toSell.length * BULK_CREDIT_PER_CARD, // flat 5¢/card, in LGS store credit
      bulkKept: kept.length,
    }
  }, [collection, keepOne])

  function flash(m) { notify(m, 2800) }
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
  // Summed per card — a batch holding a four-figure chase is priced off its value, not the
  // tier sticker, so a multiply here would quote a number the store won't charge.
  const gradeTotal = gradingFeeTotal(rawSelected, gradeTier, submitted, undefined, upgrades)
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
      <div className="toolbar mt-4">
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>{collection.length} card{collection.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="value">Sort: Value</option><option value="psa10">Sort: PSA 10 price</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        <button className={`btn ${selectMode ? 'gold' : 'alt'}`} style={{  flex: 'none' }}
          onClick={() => selectMode ? exitSelect() : setSelectMode(true)}>
          {selectMode ? '✕ Cancel select' : '☑️ Select'}
        </button>
        {selectMode && (
          <button className="btn alt btn-fixed"  onClick={selectAllInView}>
            {picked.size === view.length && view.length ? 'Deselect all' : `Select all (${view.length})`}
          </button>
        )}
        {/* Master-set safety net: when on, no bulk sell ever dumps your last copy of a card. */}
        <button className={`btn ${keepOne ? 'gold' : 'alt'}`} style={{  flex: 'none' }}
          title="Protect set singles: bulk sells skip your last copy of each card, so a sweep only dumps duplicates. Locked cards (🔒) are always kept."
          onClick={() => setSetting('keepOne', !keepOne)}>
          {keepOne ? '🔒 Keeping singles' : '🔓 Keep singles'}
        </button>
        {/* Bulk exits: with a storefront YOU are the shop — the primary move is tossing bulk
            in your own quarter bin (retails at ~5× the LGS rate, paid as it drains); the LGS
            turn-in stays as the smaller instant-credit path. No store → LGS only, as ever. */}
        {!selectMode && bulk.length > 0 && hasStore && (
          <button className="btn alt btn-fixed" 
            title={`Toss every raw card worth under a dollar into your store's bulk bin — kids dig them out at your bin price as foot traffic passes (manage it on the Shop floor tab)${bulkKept ? ` · ${bulkKept} protected card${bulkKept>1?'s':''} held back` : ''}`}
            onClick={() => {
              const { tossed, kept } = stockBinBulk()
              if (tossed) notify(`🗑️ Tossed ${tossed} bulk card${tossed> 1 ? 's' : ''} in the quarter bin.${kept ? ` ${kept} protected.` : ''}`, 6000)
            }}>🗑️ Toss {bulk.length} bulk in the bin</button>
        )}
        {/* Neutral, and in the flow. As `gold` + `marginLeft:auto` this was a full-width
            right-aligned bar on its own toolbar row — the loudest control on the Inventory
            screen — to turn 19 commons into 95 cents. Gold is the primary action; disposing
            of bulk is a utility. */}
        {!selectMode && bulk.length > 0 && (
          <button className="btn alt btn-fixed" 
            title={`Turn in every raw card worth under a dollar at the Local Game Store for in-store credit — a flat 5¢ a card, spent automatically on your next LGS order${bulkKept ? ` · ${bulkKept} protected card${bulkKept>1?'s':''} held back` : ''}`}
            onClick={() => {
              const { credit, sold } = turnInBulk()
              if (sold) notify(`📦 Turned in ${sold} bulk card${sold> 1 ? 's' : ''} for ${fmtMoney(credit)} LGS credit.`, 6000, undoAction)
            }}>📦 {hasStore ? 'LGS credit' : `Turn in ${bulk.length} bulk → ${fmtMoney(creditVal)} credit`}</button>
        )}
      </div>
      {!selectMode && (lgsCredit || 0) > 0 && (
        <p className="cap" style={{ margin: '6px 2px 0' }}>
          💳 <b className="pos">{fmtMoney(lgsCredit)}</b> Local Game Store credit — applied automatically when you buy from the LGS.
        </p>
      )}
      {!selectMode && bulkKept > 0 && (
        <p className="cap" style={{ margin: '6px 2px 0' }}>
          🔒 {bulkKept} card{bulkKept>1?'s':''} protected from the bulk sweep — {keepOne ? 'set singles + locked' : 'locked'}.
        </p>
      )}

      {view.length === 0 ? (
        <div className="empty">No cards yet — head to Buy and rip a pack. 📦</div>
      ) : (
        <>
          <div className="grid coll-grid">
            {view.slice(0, shown).map(c => (
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
          {view.length > shown && (
            <button className="btn alt" style={{ margin: '12px auto 0', display: 'block', maxWidth: 260 }}
              onClick={() => setShown(s => s + PAGE * 2)}>
              Show more ({view.length - shown} hidden)
            </button>
          )}
        </>
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
                  {/* Mail-in tiers only — the On-Site Kiosk (onSite) is a show-floor service. */}
                  {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([key, t]) => (
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
              <AskPicker pct={listPct} onChange={setListPct}>
                <span className="cap">%</span>
              </AskPicker>
              {hasStore && (
                <button className={`btn ${listEverywhere ? 'gold' : 'alt'}`} style={{  flex: 'none' }}
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
            {/* Lock/unlock the selection — a hard bulk-sell guard; with a store it also
                means "not for sale" (kept off the walk-in floor). */}
            <button className="btn alt" onClick={() => {
              const lock = !selCards.every(c => c.locked)
              const n = lockMany(selCards.map(c => c.uid), lock)
              flash(`${lock ? `🔒 ${hasStore ? 'Keeping' : 'Locked'}` : '🔓 Unlocked'} ${n} card${n>1?'s':''}${lock && hasStore ? ' — off the store floor' : ''}.`)
              exitSelect()
            }}>{selCards.every(c => c.locked) ? '🔓 Unlock' : hasStore ? '🔒 Keep' : '🔒 Lock'}</button>
            <button className="btn alt" onClick={() => {
              const { got, sold, kept } = quickSellMany(selCards.map(c => c.uid))
              if (sold) notify(`Quick-sold ${sold} card${sold>1?'s':''} for ${fmtMoney(got)}.${keptNote(kept)}`, 6000, undoAction)
              else flash(`Nothing sold — all protected.${keptNote(kept)}`)
              exitSelect()
            }}>💸 Quick-sell {fmtMoney(selValue * quickSellRate)}</button>
          </div>
        </div>
      )}

    </>
  )
}
