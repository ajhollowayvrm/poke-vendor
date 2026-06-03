import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rawValue, rarityRank, fmtMoney, GRADING, gradingFee, bulkDiscount } from '../game/engine'
import CardTile from './CardTile'

export default function Collection({ onPick }) {
  const collection = useGame(s => s.collection)
  const sellAllUngraded = useGame(s => s.sellAllUngraded)
  const sellToBuylist = useGame(s => s.sellToBuylist)
  const buylistRate = useGame(s => s.buylistRate)
  const consignments = useGame(s => s.consignments)
  const listings = useGame(s => s.listings)
  const relistListing = useGame(s => s.relistListing)
  const pullListing = useGame(s => s.pullListing)
  const submitted = useGame(s => s.gradesSubmitted)
  // bulk action handlers
  const submitGradesBulk = useGame(s => s.submitGradesBulk)
  const quickSellMany = useGame(s => s.quickSellMany)
  const listManyOnSite = useGame(s => s.listManyOnSite)
  const consignMany = useGame(s => s.consignMany)

  const [section, setSection] = useState('raw') // raw | graded
  const [sort, setSort] = useState('value')
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [listMult, setListMult] = useState(1.1) // ask multiplier for bulk "list on site"
  const [gradeTier, setGradeTier] = useState('economy') // service tier for bulk grading
  const [toast, setToast] = useState(null)

  const raw = useMemo(() => collection.filter(c => !c.grade), [collection])
  const graded = useMemo(() => collection.filter(c => c.grade), [collection])

  const view = useMemo(() => {
    const base = section === 'graded' ? graded : raw
    return [...base].sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
  }, [raw, graded, section, sort])

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

  // Selected cards (in the current section) + derived totals for the action bar.
  const selCards = useMemo(() => view.filter(c => picked.has(c.uid)), [view, picked])
  const selValue = selCards.reduce((a, c) => a + cardValue(c), 0)
  const count = selCards.length
  // grading is raw-only; selecting graded cards just can't be graded
  const rawSelected = selCards.filter(c => !c.grade)
  const gradeFeePer = gradingFee(gradeTier, submitted, rawSelected.length || 1)
  const gradeTotal = +(gradeFeePer * rawSelected.length).toFixed(2)
  const gradeBulk = bulkDiscount(rawSelected.length)

  const nothing = !collection.length && !consignments.length && !listings.length
  if (nothing)
    return <div className="empty">No cards yet — head to the Shop and rip a pack. 📦</div>

  return (
    <>
      {/* In-transit: cards you've listed on your own site (sell over time) */}
      {listings.length > 0 && (
        <div className="consign-strip">
          <b>🌐 Listed on your site ({listings.length})</b>
          {listings.map((l, i) => (
            <span key={i} className={`pill ${l.expired ? 'expired' : ''}`}
              title={l.expired ? 'Priced too high — it sat unsold' : `Sells for ${fmtMoney(l.net)} net in ~${l.daysLeft}d`}>
              {l.card.name} · {fmtMoney(l.ask)}
              {l.expired
                ? <> · <button className="linkbtn" onClick={() => relistListing(i)}>relist</button> / <button className="linkbtn" onClick={() => pullListing(i)}>pull</button></>
                : ` · ${l.daysLeft}d`}
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>— pays out on Next Day / when you attend a show</span>
        </div>
      )}

      {consignments.length > 0 && (
        <div className="consign-strip">
          <b>↗ Consigned ({consignments.length})</b>
          {consignments.map((c, i) => (
            <span key={i} className="pill" title={`Pays ${fmtMoney(c.net)} when it sells`}>
              {c.card.name} · {fmtMoney(c.net)} · {c.daysLeft}d
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>— pays out on Next Day / when you attend a show</span>
        </div>
      )}

      <div className="tabs" style={{ margin: '8px 0 4px' }}>
        <button className={`tab ${section==='raw'?'active':''}`} onClick={() => { setSection('raw'); clearSel() }}>Raw cards ({raw.length})</button>
        <button className={`tab ${section==='graded'?'active':''}`} onClick={() => { setSection('graded'); clearSel() }}>Graded ({graded.length})</button>
      </div>

      <div className="toolbar">
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
        {!selectMode && section === 'raw' && buylistBulk.length > 0 && (
          <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }}
            title={`Dump all bulk to a shop's buylist at ${Math.round(buylistRate*100)}% of market — instant cash`}
            onClick={sellToBuylist}>Buylist {buylistBulk.length} → {fmtMoney(buylistVal)}</button>
        )}
        {!selectMode && section === 'raw' && bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: buylistBulk.length ? 0 : 'auto' }}
            title="Quick-sell all raw commons/uncommons (non-hits) instantly"
            onClick={sellAllUngraded}>Sell {bulk.length} raw → {fmtMoney(bulkVal)}</button>
        )}
      </div>

      {view.length === 0 ? (
        <div className="empty">{section === 'graded' ? 'No graded cards yet — send a hit to the Grader. 🏅' : 'No raw cards right now.'}</div>
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
