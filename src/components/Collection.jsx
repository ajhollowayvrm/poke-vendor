import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, rarityRank } from '../game/engine'
import CardTile from './CardTile'

export default function Collection({ onPick }) {
  const collection = useGame(s => s.collection)
  const sellAllUngraded = useGame(s => s.sellAllUngraded)
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

  if (!collection.length) return <div className="empty">No cards yet — head to the Shop and rip a pack. 📦</div>

  return (
    <>
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
        {bulk.length > 0 && (
          <button className="btn gold" style={{ flex: 'none', marginLeft: 'auto' }}
            onClick={sellAllUngraded}>Bulk-sell {bulk.length} commons → ${bulkVal.toFixed(2)}</button>
        )}
      </div>
      <div className="grid coll-grid">
        {view.map(c => <CardTile key={c.uid} card={c} onClick={() => onPick(c)} />)}
      </div>
    </>
  )
}
