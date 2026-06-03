import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rarityRank, fmtMoney } from '../game/engine'
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
  const [section, setSection] = useState('raw') // raw | graded
  const [sort, setSort] = useState('value')

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
        <button className={`tab ${section==='raw'?'active':''}`} onClick={() => setSection('raw')}>Raw cards ({raw.length})</button>
        <button className={`tab ${section==='graded'?'active':''}`} onClick={() => setSection('graded')}>Graded ({graded.length})</button>
      </div>

      <div className="toolbar">
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="value">Sort: Value</option><option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        {section === 'raw' && buylistBulk.length > 0 && (
          <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }}
            title={`Dump all bulk to a shop's buylist at ${Math.round(buylistRate*100)}% of market — instant cash`}
            onClick={sellToBuylist}>Buylist {buylistBulk.length} → {fmtMoney(buylistVal)}</button>
        )}
        {section === 'raw' && bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: buylistBulk.length ? 0 : 'auto' }}
            title="Quick-sell all raw commons/uncommons (non-hits) instantly"
            onClick={sellAllUngraded}>Sell {bulk.length} raw → {fmtMoney(bulkVal)}</button>
        )}
      </div>

      {view.length === 0 ? (
        <div className="empty">{section === 'graded' ? 'No graded cards yet — send a hit to the Grader. 🏅' : 'No raw cards right now.'}</div>
      ) : (
        <div className="grid coll-grid">
          {view.map(c => <CardTile key={c.uid} card={c} noBorder onClick={() => onPick(c)} />)}
        </div>
      )}
    </>
  )
}
