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
  const [sort, setSort] = useState('value')
  const [filter, setFilter] = useState('all')

  const view = useMemo(() => {
    let v = [...collection]
    if (filter === 'graded') v = v.filter(c => c.grade)
    if (filter === 'hits') v = v.filter(c => c._isHit)
    if (filter === 'raw') v = v.filter(c => !c.grade)
    v.sort((a, b) => sort === 'value' ? cardValue(b) - cardValue(a)
      : sort === 'rarity' ? rarityRank(b.rarity) - rarityRank(a.rarity)
      : a.name.localeCompare(b.name))
    return v
  }, [collection, sort, filter])

  const bulk = collection.filter(c => !c.grade && !c._isHit)
  const bulkVal = bulk.reduce((a, c) => a + cardValue(c), 0)
  const buylistBulk = collection.filter(c => !c.grade && !c._isHit && !c.foil && rarityRank(c.rarity) < rarityRank('Double Rare'))
  const buylistVal = buylistBulk.reduce((a, c) => a + cardValue(c) * buylistRate, 0)

  if (!collection.length && !consignments.length)
    return <div className="empty">No cards yet — head to the Shop and rip a pack. 📦</div>

  return (
    <>
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

      <div className="toolbar">
        <span className="pill">{collection.length} cards</span>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All</option><option value="hits">Hits only</option>
          <option value="graded">Graded</option><option value="raw">Raw</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="value">Sort: Value</option><option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
        {buylistBulk.length > 0 && (
          <button className="btn alt" style={{ flex: 'none', marginLeft: 'auto' }}
            title={`Dump all bulk to a shop's buylist at ${Math.round(buylistRate*100)}% of market — instant cash`}
            onClick={sellToBuylist}>Buylist {buylistBulk.length} → {fmtMoney(buylistVal)}</button>
        )}
        {bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: buylistBulk.length ? 0 : 'auto' }}
            title="Sell all raw commons/uncommons at full market"
            onClick={sellAllUngraded}>Sell {bulk.length} raw → {fmtMoney(bulkVal)}</button>
        )}
      </div>
      <div className="grid coll-grid">
        {view.map(c => <CardTile key={c.uid} card={c} onClick={() => onPick(c)} />)}
      </div>
    </>
  )
}
