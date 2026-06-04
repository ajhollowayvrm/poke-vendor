import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rawValue, rarityRank, fmtMoney, GRADING, gradingFee, bulkDiscount } from '../game/engine'
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

  const [sort, setSort] = useState('value')
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [listMult, setListMult] = useState(1.1) // ask multiplier for bulk "list on site"
  const [gradeTier, setGradeTier] = useState('economy') // service tier for bulk grading
  const [toast, setToast] = useState(null)

  const raw = useMemo(() => collection.filter(c => !c.grade), [collection])

  // One unified list of EVERYTHING — raw cards and graded slabs mixed together
  // (the slab look already distinguishes graded at a glance). Value-sort floats
  // the slabs up naturally by their graded value.
  const view = useMemo(() => {
    return [...collection].sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
  }, [collection, sort])

  const quickSellRate = useGame(s => s.quickSellRate)
  const bulk = raw.filter(c => !c._isHit)
  const bulkVal = bulk.reduce((a, c) => a + cardValue(c) * quickSellRate, 0)
  const buylistBulk = raw.filter(c => !c._isHit && !c.foil && rarityRank(c.rarity) < rarityRank('Double Rare'))
  const buylistVal = buylistBulk.reduce((a, c) => a + cardValue(c) * buylistRate, 0)

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2800) }
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
        <span className="pill" style={{ background:'#3b6cff22', color:'#9db8ff' }}>{collection.length} card{collection.length === 1 ? '' : 's'}</span>
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
        {!selectMode && buylistBulk.length > 0 && (
          <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }}
            title={`Dump all bulk to a shop's buylist at ${Math.round(buylistRate*100)}% of market — instant cash`}
            onClick={sellToBuylist}>Buylist {buylistBulk.length} → {fmtMoney(buylistVal)}</button>
        )}
        {!selectMode && bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: buylistBulk.length ? 0 : 'auto' }}
            title="Quick-sell all raw commons/uncommons (non-hits) instantly"
            onClick={sellAllUngraded}>Sell {bulk.length} raw → {fmtMoney(bulkVal)}</button>
        )}
      </div>

      {view.length === 0 ? (
        <div className="empty">No cards yet — head to Buy and rip a pack. 📦</div>
      ) : (
        <div className="grid coll-grid">
          {view.map(c => (
            <div key={c.uid} className={`coll-cell ${selectMode ? 'selectable' : ''} ${picked.has(c.uid) ? 'picked' : ''}`} onClick={() => onTile(c)}>
              <CardTile card={c} noBorder />
              {selectMode && picked.has(c.uid) && <span className="coll-check">✓</span>}
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
              <button className="btn" onClick={() => {
                const n = listManyOnSite(selCards.map(c => c.uid), listMult)
                flash(`Listed ${n} card${n>1?'s':''} at ${Math.round(listMult*100)}% of market.`)
                exitSelect()
              }}>🌐 List @ {Math.round(listMult*100)}%</button>
              <input type="range" min="0.8" max="2" step="0.05" value={listMult}
                onClick={e => e.stopPropagation()} onChange={e => setListMult(parseFloat(e.target.value))} />
              {listHint && <span className={`list-hint ${listHint.cls}`}>{listHint.txt}</span>}
            </div>
            <button className="btn alt" onClick={() => {
              const n = consignMany(selCards.map(c => c.uid))
              flash(`Consigned ${n} card${n>1?'s':''}.`)
              exitSelect()
            }}>↗ Consign</button>
            <button className="btn alt" onClick={() => {
              const n = count
              const got = quickSellMany(selCards.map(c => c.uid))
              flash(`Quick-sold ${n} card${n>1?'s':''} for ${fmtMoney(got)}.`)
              exitSelect()
            }}>💸 Quick-sell {fmtMoney(selValue * quickSellRate)}</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
