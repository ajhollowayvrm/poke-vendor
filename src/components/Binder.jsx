import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import {
  SETS, setCompletion, completionReward, isChaseCard, fmtMoney,
  cardVariant, cardMastersetVariants, setVariantColumns, MASTERSET_VARIANTS, mastersetStats, setIdOfCard, cardImg,
  CONDITIONS, CONDITION_ORDER, CUT_ORDER,
} from '../game/engine'
import { rarityColor } from './CardTile'
import { toast } from '../ui/dialog'

// The Binder: a per-set MASTERSET. Every card has a slot for each printing VARIANT it can
// come in — the normal, its reverse holo, and (where the set has them) the Poké Ball and
// Master Ball foils. You physically SLOT copies into the binder: a placed card moves out of
// your sellable collection (safe from bulk actions) and fills that variant slot. "Add
// everything possible" fills every open slot you already own a copy for. Completing the full
// masterset (every variant of every card) is the real flex; a plain set (one of each card)
// still pays its one-time bonus as ownership lands.
export default function Binder({ onPick }) {
  const collection = useGame(s => s.collection)
  const binder = useGame(s => s.binder || [])
  const completedSets = useGame(s => s.completedSets)
  const addToBinder = useGame(s => s.addToBinder)
  const addAllToBinder = useGame(s => s.addAllToBinder)
  const removeFromBinder = useGame(s => s.removeFromBinder)
  // Your binder's quality bar. Applies to the "Add everything possible" sweep AND the 📒 Binder
  // Curator's nightly one — it's a statement about what your masterset is, not about which
  // button you pressed. Graded slabs are exempt (their grade is the bar).
  const setSetting = useGame(s => s.setSetting)
  const minCondition = useGame(s => s.settings.binderMinCondition ?? 'DMG')
  const minCut = useGame(s => s.settings.binderMinCut ?? 'Rough')
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const standard = useMemo(() => ({ minCondition, minCut }), [minCondition, minCut])

  const [setId, setSetId] = useState(SETS[0].id)
  const [missingOnly, setMissingOnly] = useState(false)
  const set = SETS.find(s => s.id === setId) || SETS[0]
  const columns = useMemo(() => setVariantColumns(set), [set])

  // Per-set slot maps: which variants are placed (in the binder) vs. owned loose (in the
  // collection, available to place). Keyed "<cardId>:<variant>".
  const { placed, loose } = useMemo(() => {
    const placed = new Map(), loose = new Map()
    for (const c of binder) if (setIdOfCard(c) === set.id) placed.set(`${c.id}:${cardVariant(c)}`, c)
    for (const c of collection) if (setIdOfCard(c) === set.id) {
      const k = `${c.id}:${cardVariant(c)}`
      if (!loose.has(k)) loose.set(k, c) // first (value-sorted below) copy fills the slot
    }
    return { placed, loose }
  }, [binder, collection, set.id])

  const ms = useMemo(() => mastersetStats(set, binder, collection, standard), [set, binder, collection, standard])
  // Plain set-completion (one of every card, any variant) drives the one-time bonus badge.
  const ownedIds = useMemo(() => {
    const s = new Set()
    for (const c of collection) if (c.id) s.add(c.id)
    for (const c of binder) if (c.id) s.add(c.id)
    return s
  }, [collection, binder])
  const comp = useMemo(() => setCompletion(set, ownedIds), [set, ownedIds])
  const reward = useMemo(() => completionReward(set), [set])
  const everCompleted = completedSets.includes(set.id)

  // How many slots we could fill right now from the collection (drives the fill button).
  const placeableNow = ms.placeable

  const cards = useMemo(() => {
    const withState = set.cards.map(c => {
      const variants = cardMastersetVariants(set, c)
      const missing = variants.some(v => !placed.has(`${c.id}:${v}`))
      return { c, variants, missing }
    }).sort((a, b) => numOf(a.c.number) - numOf(b.c.number))
    return missingOnly ? withState.filter(x => x.missing) : withState
  }, [set, placed, missingOnly])

  function fillAll() {
    const { moved, heldBack } = addAllToBinder(set.id)
    const held = heldBack ? ` ${heldBack} ${heldBack === 1 ? 'copy' : 'copies'} didn't meet your standard.` : ''
    toast(moved
      ? `📒 Slotted ${moved} card${moved > 1 ? 's' : ''} into the ${set.name} binder.${held}`
      : heldBack
        ? `No slots filled — ${heldBack} ${heldBack === 1 ? 'copy was' : 'copies were'} below your binder standard. Loosen it, or find nicer copies.`
        : 'No open slots you own a copy for — rip or buy more first.')
  }
  function slotClick(card, variant) {
    const key = `${card.id}:${variant}`
    if (placed.has(key)) { removeFromBinder(placed.get(key).uid); return }
    const copy = loose.get(key)
    if (copy) { addToBinder(copy.uid); return }
  }

  return (
    <>
      <div className="binder-head">
        <select value={setId} onChange={e => { setSetId(e.target.value); setMissingOnly(false) }}>
          {SETS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>{set.series}</span>
        {everCompleted && <span className="pill" style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }} title="You've earned this set's completion bonus">🏆 Set done</span>}
        {ms.complete && <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 16%, transparent)', color:'var(--accent-light)' }} title="Every variant of every card is slotted">✨ Masterset!</span>}
      </div>

      {/* Masterset progress (all variants) + plain set progress */}
      <div className="binder-progress">
        <div className="binder-prog-row">
          <b>Masterset {ms.placed}/{ms.total}</b>
          <span className={`pill ${ms.complete ? 'complete' : ''}`} style={ms.complete ? { background:'color-mix(in srgb, var(--green) 13%, transparent)', color:'var(--green)' } : null}>
            {ms.complete ? '✓ Complete' : `${ms.pct}%`}
          </span>
          <span className="pill" title="One of every card (any variant)">
            🗂️ Set {comp.owned}/{comp.total}{comp.complete ? ' ✓' : ` · ${comp.pct}%`}
          </span>
        </div>
        <div className="binder-bar"><div style={{ width: ms.pct + '%' }} /></div>
        <div className="muted" style={{ fontSize: 12 }}>
          {ms.complete
            ? '✨ Full masterset — every variant slotted. Ultimate flex.'
            : <>
                {ms.total - ms.placed} slot{ms.total - ms.placed === 1 ? '' : 's'} to go
                {!comp.complete && <> · completing the base set pays +{fmtMoney(reward.cash)} & +{reward.noto}★</>}
                {placeableNow > 0 && <> · <b style={{ color: 'var(--green)' }}>{placeableNow} ready to slot</b></>}
              </>}
        </div>
      </div>

      {/* Variant legend */}
      <div className="binder-legend">
        {columns.map(v => (
          <span key={v} className="binder-legend-chip" style={{ '--vc': MASTERSET_VARIANTS[v].color }}>
            <span className="vbadge">{MASTERSET_VARIANTS[v].badge}</span> {MASTERSET_VARIANTS[v].label}
          </span>
        ))}
      </div>

      {/* BINDER STANDARD — the bar a raw copy must clear to be filed, by hand or by the
          overnight Curator. A masterset is a display piece; for a lot of collectors a beaten,
          off-centre copy in a slot is worse than an empty one. */}
      <div className="binder-standard">
        <span className="bs-head">🎚️ Binder standard <span className="muted">— what's good enough to slot</span></span>
        <label className="bs-field">
          <span className="muted">Min condition</span>
          <select value={minCondition} onChange={e => setSetting('binderMinCondition', e.target.value)}>
            {CONDITION_ORDER.map(k => (
              <option key={k} value={k}>{k === 'DMG' ? 'Any condition' : `${CONDITIONS[k].label} (${k}) or better`}</option>
            ))}
          </select>
        </label>
        <label className="bs-field">
          <span className="muted">Min cut</span>
          <select value={minCut} onChange={e => setSetting('binderMinCut', e.target.value)}>
            {CUT_ORDER.map(k => (
              <option key={k} value={k}>{k === 'Rough' ? 'Any cut' : `${k} or better`}</option>
            ))}
          </select>
        </label>
        <span className="muted bs-note">
          {ms.belowBar > 0
            ? <><b style={{ color: 'var(--gold)' }}>{ms.belowBar}</b> open slot{ms.belowBar === 1 ? '' : 's'} you own a copy for {ms.belowBar === 1 ? 'is' : 'are'} below this bar — {ms.belowBar === 1 ? 'it stays' : 'they stay'} out.</>
            : <>Graded slabs always qualify — their grade is the bar.</>}
          {!hasLoupe && minCut !== 'Rough' && <><br />🔍 Without the Jeweler's Loupe your own cut read is fuzzy, but your curator measures precisely.</>}
        </span>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="btn gold" style={{ flex:'none' }} disabled={placeableNow === 0} onClick={fillAll}
          title={placeableNow ? `Move ${placeableNow} owned card${placeableNow>1?'s':''} out of your collection into their binder slots` : 'You own no cards for an open slot yet'}>
          📒 Add everything possible{placeableNow ? ` (${placeableNow})` : ''}
        </button>
        <button className={`btn ${missingOnly ? 'gold' : 'alt'}`} style={{ flex:'none' }} onClick={() => setMissingOnly(v => !v)}>
          {missingOnly ? '✓ Incomplete only' : 'Show incomplete only'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>{cards.length} card{cards.length === 1 ? '' : 's'}</span>
      </div>

      {cards.length === 0 ? (
        <div className="empty">{missingOnly ? '🎉 Every slot in this set is filled!' : 'No cards in this set.'}</div>
      ) : (
        <div className="grid coll-grid binder-grid">
          {cards.map(({ c, variants }) => {
            // pick art from any owned copy (placed first), else the set's card art (faded)
            const anyOwned = variants.map(v => placed.get(`${c.id}:${v}`) || loose.get(`${c.id}:${v}`)).find(Boolean)
            const ownsAny = !!anyOwned
            const chase = isChaseCard(c)
            const art = cardImg(anyOwned) || cardImg(c)
            return (
              <div key={c.id} className={`binder-slot masterset ${ownsAny ? 'owned' : 'missing'} ${chase ? 'chase' : ''}`}>
                <div className="binder-slot-art" onClick={() => anyOwned && onPick?.(anyOwned)} title={anyOwned ? c.name : `${c.name} · ${c.rarity}`}>
                  {art ? <img src={art} alt={c.name} loading="lazy" decoding="async" style={ownsAny ? null : { opacity: 0.22, filter: 'grayscale(1)' }} /> : <span className="binder-slot-name">{c.name}</span>}
                  <span className="binder-num">#{c.number}</span>
                  {chase && <span className="binder-slot-chase">💎</span>}
                </div>
                <div className="variant-chips">
                  {variants.map(v => {
                    const key = `${c.id}:${v}`
                    const isPlaced = placed.has(key)
                    const isLoose = !isPlaced && loose.has(key)
                    const meta = MASTERSET_VARIANTS[v]
                    const cls = isPlaced ? 'placed' : isLoose ? 'loose' : 'empty'
                    return (
                      <button key={v} className={`vchip ${cls}`} style={{ '--vc': meta.color }}
                        disabled={cls === 'empty'}
                        onClick={() => slotClick(c, v)}
                        title={isPlaced ? `${meta.label} — slotted. Click to take it out.`
                          : isLoose ? `${meta.label} — you own one. Click to slot it into the binder.`
                          : `${meta.label} — not yet owned.`}>
                        <span className="vbadge">{meta.badge}</span>
                        {isPlaced ? '✓' : isLoose ? '+' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function numOf(n) { const m = String(n).match(/\d+/); return m ? parseInt(m[0], 10) : 0 }
