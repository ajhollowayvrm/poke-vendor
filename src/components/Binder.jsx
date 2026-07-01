import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { SETS, ownedIdSet, setCompletion, completionReward, isChaseCard, fmtMoney, rarityRank } from '../game/engine'
import { rarityColor } from './CardTile'

// The Binder: a master-set completion tracker. Pick a set; see every card as a binder
// slot — owned cards show their art, missing cards are dim numbered placeholders (your
// shopping list). Completing a set (one of every card) pays a one-time bonus; the 🏆
// reflects current ownership. A separate "chase" goal tracks the expensive top rarities.
export default function Binder({ onPick }) {
  const collection = useGame(s => s.collection)
  const completedSets = useGame(s => s.completedSets)
  const ownedIds = useMemo(() => ownedIdSet(collection), [collection])

  const [setId, setSetId] = useState(SETS[0].id)
  const [missingOnly, setMissingOnly] = useState(false)
  const set = SETS.find(s => s.id === setId) || SETS[0]

  const comp = useMemo(() => setCompletion(set, ownedIds), [set, ownedIds])
  const reward = useMemo(() => completionReward(set), [set])
  const everCompleted = completedSets.includes(set.id)

  // cards in collector-number order; optionally just the missing ones
  const cards = useMemo(() => {
    const list = missingOnly ? set.cards.filter(c => !ownedIds.has(c.id)) : set.cards
    return [...list].sort((a, b) => numOf(a.number) - numOf(b.number))
  }, [set, ownedIds, missingOnly])

  // value still needed to finish the set (sum of missing cards' market price)
  const missingValue = comp.missing.reduce((a, c) => a + (c.price ?? 0), 0)

  return (
    <>
      <div className="binder-head">
        <select value={setId} onChange={e => { setSetId(e.target.value); setMissingOnly(false) }}>
          {SETS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>{set.series}</span>
        {everCompleted && <span className="pill" style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }} title="You've earned this set's completion bonus">🏆 Completed</span>}
      </div>

      {/* Set completion progress */}
      <div className="binder-progress">
        <div className="binder-prog-row">
          <b>Set {comp.owned}/{comp.total}</b>
          <span className={`pill ${comp.complete ? 'complete' : ''}`} style={comp.complete ? { background:'color-mix(in srgb, var(--green) 13%, transparent)', color:'var(--green)' } : null}>
            {comp.complete ? '✓ Complete' : `${comp.pct}%`}
          </span>
          {comp.chaseTotal > 0 && (
            <span className="pill" style={comp.chaseComplete ? { background:'#ff3df022', color:'#ff79c6' } : null}
              title="The set's top-rarity chase cards (SIR+, special foils)">
              💎 Chase {comp.chaseOwned}/{comp.chaseTotal}{comp.chaseComplete ? ' ✓' : ''}
            </span>
          )}
        </div>
        <div className="binder-bar"><div style={{ width: comp.pct + '%' }} /></div>
        <div className="muted" style={{ fontSize: 12 }}>
          {comp.complete
            ? (everCompleted ? '🏆 Master of this set — bonus earned.' : 'Complete! The bonus pays as soon as the last card lands.')
            : <>{comp.missing.length} missing · ~{fmtMoney(missingValue)} to finish{everCompleted ? ' · (bonus already earned — you sold a card)' : ` · completing pays +${fmtMoney(reward.cash)} & +${reward.noto}★`}</>}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className={`btn ${missingOnly ? 'gold' : 'alt'}`} style={{ flex:'none' }} onClick={() => setMissingOnly(v => !v)}>
          {missingOnly ? '✓ Missing only' : 'Show missing only'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>{missingOnly ? `${cards.length} to collect` : `${comp.total} cards`}</span>
      </div>

      {cards.length === 0 ? (
        <div className="empty">{missingOnly ? '🎉 You own every card in this set!' : 'No cards in this set.'}</div>
      ) : (
        <div className="grid coll-grid binder-grid">
          {cards.map(c => {
            const owned = ownedIds.has(c.id)
            const edge = rarityColor(c.rarity)
            const chase = isChaseCard(c)
            if (owned) {
              return (
                <div key={c.id} className="coll-cell binder-slot owned" onClick={() => onPick?.(collection.find(x => x.id === c.id))}>
                  <div className="cardtile no-edge"><img src={c.img} alt={c.name} loading="lazy" decoding="async" /></div>
                  <span className="binder-num">#{c.number}</span>
                </div>
              )
            }
            return (
              <div key={c.id} className={`binder-slot missing ${chase ? 'chase' : ''}`} title={`${c.name} · ${c.rarity}${c.price ? ` · ${fmtMoney(c.price)}` : ''}`}>
                <span className="binder-slot-num">#{c.number}</span>
                <span className="binder-slot-name">{c.name}</span>
                {chase && <span className="binder-slot-chase">💎</span>}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function numOf(n) { const m = String(n).match(/\d+/); return m ? parseInt(m[0], 10) : 0 }
