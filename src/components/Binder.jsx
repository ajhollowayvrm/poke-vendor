import { useMemo, useState } from 'react'
import { useGame, absoluteDay } from '../game/store'
import {
  SETS, setCompletion, completionReward, isChaseCard, fmtMoney,
  cardVariant, cardMastersetVariants, setVariantColumns, MASTERSET_VARIANTS, mastersetStats, setIdOfCard, cardImg,
  CUT_ORDER, cardNumber, BINDER_VALUE_CAPS, binderReserveActive,
} from '../game/engine'
import { BINDER_COST } from '../game/store'
import { rarityColor } from './CardTile'
import { toast } from '../ui/dialog'
import { clickable } from '../ui/clickable'
import { Explain } from '../ui/Explain'

// The Binder: a per-set MASTERSET. Every card has a slot for each printing VARIANT it can
// come in — the normal, its reverse holo, and (where the set has them) the Poké Ball and
// Master Ball foils. You physically SLOT copies into the binder: a placed card moves out of
// your sellable collection (safe from bulk actions) and fills that variant slot. "Add
// everything possible" fills every open slot you already own a copy for. Completing the full
// masterset (every variant of every card) is the real flex; a plain set (one of each card)
// still pays its one-time bonus as ownership lands.
//
// A BINDER IS A THING YOU BUY. This screen used to derive a page for all 150+ sets in the
// catalog, which meant the game handed every player a hundred-and-fifty open chases they
// never chose. A masterset you did not decide on is a chore list. Now you buy an empty
// binder and put a set in it, and that — the deciding — is the moment the chase starts.
// `binders` holds those objects; `binder` still holds the cards slotted into their pages.
export default function Binder({ onPick }) {
  const collection = useGame(s => s.collection)
  const binder = useGame(s => s.binder || [])
  const completedSets = useGame(s => s.completedSets)
  const addToBinder = useGame(s => s.addToBinder)
  const addAllToBinder = useGame(s => s.addAllToBinder)
  const removeFromBinder = useGame(s => s.removeFromBinder)
  // Your binder RESERVE — ceilings, not floors. A copy that hits ANY of them is held OUT of the
  // masterset (free to grade & sell); only lesser copies get filed. A raw copy is held by its CUT
  // tier or by its dollar value; a slab by its dollar value, so a five-figure grail never gets
  // buried in a slot just because the slot was open. Applies to the "Add everything possible"
  // sweep AND the 📒 Curator's nightly one — it's a statement about what your masterset is, not
  // which button you pressed.
  const setSetting = useGame(s => s.setSetting)
  const reserveCut = useGame(s => s.settings.binderReserveCut ?? 'off')
  const reserveRawValue = useGame(s => s.settings.binderReserveRawValue ?? 0)
  const reserveGradedValue = useGame(s => s.settings.binderReserveGradedValue ?? 0)
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const reserve = useMemo(() => ({ cut: reserveCut, rawValue: reserveRawValue, gradedValue: reserveGradedValue }),
    [reserveCut, reserveRawValue, reserveGradedValue])
  const reserveActive = binderReserveActive(reserve)
  // Plain-English readback of every ceiling that's on, so the panel says exactly what it does.
  const reserveSummary = useMemo(() => {
    const parts = []
    if (reserveCut !== 'off') parts.push(`raw copies at ${reserveCut} cut or better`)
    if (reserveRawValue > 0) parts.push(`raw copies worth ${capLabel(reserveRawValue)}+`)
    if (reserveGradedValue > 0) parts.push(`slabs worth ${capLabel(reserveGradedValue)}+`)
    return parts.join(' · ')
  }, [reserveCut, reserveRawValue, reserveGradedValue])

  // 🖼️ A collector waiting on a completed page (accept/decline banner below).
  // 🃏 Master set challenge — declared from the set you're looking at.
  const hasChallengeKit = useGame(s => !!s.upgrades.setChallenge)
  const challenge = useGame(s => s.challenge)
  const declareChallenge = useGame(s => s.declareChallenge)

  const binderOffer = useGame(s => s.binderOffer)
  const sellMasterLot = useGame(s => s.sellMasterLot)
  const declineMasterLot = useGame(s => s.declineMasterLot)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)

  // 📒 The binders you own. `assigned` are the ones with a set in them (those have pages);
  // `empty` are bought-and-waiting. One set per binder, enforced in assignBinder.
  const binders = useGame(s => s.binders || [])
  const buyBinder = useGame(s => s.buyBinder)
  const assignBinder = useGame(s => s.assignBinder)
  const cash = useGame(s => s.cash)
  const assigned = useMemo(() => binders.filter(b => b.setId), [binders])
  const empty = useMemo(() => binders.filter(b => !b.setId), [binders])
  const mySetIds = useMemo(() => assigned.map(b => b.setId), [assigned])
  const mySets = useMemo(
    () => mySetIds.map(id => SETS.find(x => x.id === id)).filter(Boolean),
    [mySetIds])

  const [setId, setSetId] = useState(() => mySets[0]?.id || null)
  const [missingOnly, setMissingOnly] = useState(false)
  // Sets you do NOT already have a binder for — the only ones an empty binder can be pointed
  // at, since it is one set per binder.
  const assignable = useMemo(() => SETS.filter(x => !mySetIds.includes(x.id)), [mySetIds])
  // The set chosen for the next empty binder. Held as a value that may fall out of
  // `assignable` (you just used it), so it is always READ through assignable — a <select>
  // whose value is not among its options renders the first option as selected while the state
  // still holds the old one, and the button would then assign a set the player never saw
  // highlighted, or refuse with "you already have a binder for <some other set>".
  const [assignToRaw, setAssignTo] = useState(() => SETS[0].id)
  const assignTo = assignable.some(x => x.id === assignToRaw) ? assignToRaw : (assignable[0]?.id || null)
  // Keep the open page on a set you still have a binder for — selling a master lot never
  // removes a binder, but a save migrated from before binders existed can arrive with none.
  const set = mySets.find(x => x.id === setId) || mySets[0] || null
  const columns = useMemo(() => (set ? setVariantColumns(set) : []), [set])

  // Per-set slot maps: which variants are placed (in the binder) vs. owned loose (in the
  // collection, available to place). Keyed "<cardId>:<variant>".
  const { placed, loose } = useMemo(() => {
    const placed = new Map(), loose = new Map()
    if (!set) return { placed, loose }
    for (const c of binder) if (setIdOfCard(c) === set.id) placed.set(`${c.id}:${cardVariant(c)}`, c)
    for (const c of collection) if (setIdOfCard(c) === set.id) {
      const k = `${c.id}:${cardVariant(c)}`
      if (!loose.has(k)) loose.set(k, c) // first (value-sorted below) copy fills the slot
    }
    return { placed, loose }
  }, [binder, collection, set])

  const ms = useMemo(() => (set ? mastersetStats(set, binder, collection, reserve)
    : { placed: 0, total: 0, pct: 0, complete: false, placeable: 0 }), [set, binder, collection, reserve])
  // Plain set-completion (one of every card, any variant) drives the one-time bonus badge.
  const ownedIds = useMemo(() => {
    const s = new Set()
    for (const c of collection) if (c.id) s.add(c.id)
    for (const c of binder) if (c.id) s.add(c.id)
    return s
  }, [collection, binder])
  const comp = useMemo(() => (set ? setCompletion(set, ownedIds) : { owned: 0, total: 0, pct: 0, complete: false }), [set, ownedIds])
  const reward = useMemo(() => (set ? completionReward(set) : { cash: 0, noto: 0, clout: 0 }), [set])
  const everCompleted = !!set && completedSets.includes(set.id)

  // How many slots we could fill right now from the collection (drives the fill button).
  const placeableNow = ms.placeable

  const cards = useMemo(() => {
    if (!set) return []
    const withState = set.cards.map(c => {
      const variants = cardMastersetVariants(set, c)
      const missing = variants.some(v => !placed.has(`${c.id}:${v}`))
      return { c, variants, missing }
    }).sort((a, b) => numOf(cardNumber(a.c)) - numOf(cardNumber(b.c)))
    return missingOnly ? withState.filter(x => x.missing) : withState
  }, [set, placed, missingOnly])

  function fillAll() {
    const { moved, reserved } = addAllToBinder(set.id)
    const held = reserved ? ` ${reserved} slot${reserved === 1 ? '' : 's'} left open — only copy reserved to grade & sell.` : ''
    toast(moved
      ? `📒 Slotted ${moved} card${moved > 1 ? 's' : ''} into the ${set.name} binder.${held}`
      : reserved
        ? `No slots filled — your only cop${reserved === 1 ? 'y is' : 'ies are'} being reserved to grade & sell. Loosen the reserve to file them, or find lesser copies.`
        : 'No open slots you own a copy for — rip or buy more first.')
  }
  function slotClick(card, variant) {
    const key = `${card.id}:${variant}`
    if (placed.has(key)) { removeFromBinder(placed.get(key).uid); return }
    const copy = loose.get(key)
    if (copy) { addToBinder(copy.uid); return }
  }

  // The shelf itself: what you own, and how to start another chase. Rendered above every
  // page AND on its own when you have no assigned binder yet, because "buy a binder, put a
  // set in it" is the only way onto this screen and it must never be hard to find.
  const shelf = (
    <div className="binder-shelf">
      <div className="binder-shelf-head">
        <b>📒 Your binders</b>
        <span className="cap">
          {assigned.length} in use{empty.length ? ` · ${empty.length} empty` : ''}
        </span>
        <button className="btn alt t-xs btn-fixed" style={{ padding: '3px 10px' }}
          disabled={cash < BINDER_COST}
          onClick={() => { const r = buyBinder(); toast(r.error || `📒 Bought a binder for ${fmtMoney(BINDER_COST)} — put a set in it.`) }}>
          Buy a binder · {fmtMoney(BINDER_COST)}
        </button>
      </div>
      {empty.length > 0 && (
        <div className="binder-assign">
          <span className="cap">Empty binder — which set is it for?</span>
          <select value={assignTo || ''} onChange={e => setAssignTo(e.target.value)}>
            {assignable.map(x => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <button className="btn gold t-xs btn-fixed" style={{ padding: '3px 10px' }}
            disabled={!assignTo}
            onClick={() => {
              const r = assignBinder(empty[0].id, assignTo)
              if (r.error) return toast(r.error)
              setSetId(assignTo)
              toast(`📒 Started a ${SETS.find(x => x.id === assignTo)?.name} masterset. Slot what you already own.`)
            }}>
            Start this masterset
          </button>
        </div>
      )}
    </div>
  )

  // Nothing on the shelf yet. Say what a binder IS and what it costs, rather than showing an
  // empty page for a set the player never chose.
  if (!set) {
    return (
      <>
        {shelf}
        <p className="muted mt-5">
          You have no masterset going. A binder is a physical thing you buy ({fmtMoney(BINDER_COST)})
          and then put a set in — from then on every variant of every card in that set has a slot
          waiting for it, and filling the page is the chase.
        </p>
        <p className="cap">
          Completing a set pays a one-time bonus, and an intact page kept on display draws walk-ins,
          whales and stream viewers for as long as you keep it.
        </p>
      </>
    )
  }

  return (
    <>
      {/* 🖼️ The master-lot offer: a collector wants an intact completed page at a premium
          over book. Selling keeps the badge/deeds/knowledge perks; the showcase draw and the
          cards leave. The offer ages out in a few days if ignored. */}
      {binderOffer && (
        <div className="banner" style={{ marginBottom: 10, borderColor: 'var(--gold)' }}>
          🖼️ <b>{binderOffer.who[0].toUpperCase() + binderOffer.who.slice(1)}</b> wants your completed <b>{binderOffer.setName}</b> master set — the whole page,
          {' '}<b className="pos">{fmtMoney(binderOffer.price)}</b> ({Math.round(binderOffer.mult * 100)}% of book, {binderOffer.count} cards).
          {' '}<span className="muted">Expires in {Math.max(0, binderOffer.expiresDay - absoluteDay(currentDay, monthsElapsed))}d. You keep the 🏆 badge and 🎓 knowledge; the showcase draw leaves with the cards.</span>
          <span className="row" style={{ gap: 6, marginTop: 6, display: 'inline-flex', marginLeft: 8 }}>
            <button className="btn gold t-xs btn-fixed" style={{ padding: '4px 12px' }}
              onClick={() => { const r = sellMasterLot(); toast(r.error || `🖼️ Sold the ${binderOffer.setName} page — +${fmtMoney(r.price)}.`) }}>
              Sell the page · {fmtMoney(binderOffer.price)}
            </button>
            <button className="btn alt t-xs btn-fixed" style={{ padding: '4px 12px' }}
              onClick={() => { declineMasterLot(); toast('🖼️ The page stays on display.') }}>
              Keep it on display
            </button>
          </span>
        </div>
      )}
      {shelf}
      <div className="binder-head">
        <select value={set.id} onChange={e => { setSetId(e.target.value); setMissingOnly(false) }}>
          {mySets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="cap">{set.series}</span>
        {everCompleted && (
          <Explain label="What Set done means" trigger={
            <span className="pill" style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }}>🏆 Set done</span>}>
            You've earned this set's completion bonus — and its 🎓 knowledge perks (rip intel, walk-ins asking for this set, its singles selling faster) are yours forever.
          </Explain>
        )}
        {everCompleted && comp.complete && (
          <Explain label="What On display means" trigger={
            <span className="pill" style={{ background:'color-mix(in srgb, var(--green) 13%, transparent)', color:'var(--green)' }}>🖼️ On display</span>}>
            The intact page is a shop DRAW: more walk-ins, whales come earlier and more often, and streams pull extra tune-ins — for every completed set you keep on display. Collectors may offer to buy the whole page at a premium.
          </Explain>
        )}
        {ms.complete && <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 16%, transparent)', color:'var(--accent-light)' }}>✨ Masterset!</span>}
        {/* 🃏 Declare THIS set as your on-camera chase. Lives here rather than on Socials
            because the decision is "which set", and this is where you look at sets. */}
        {hasChallengeKit && !comp.complete && (
          challenge?.setId === set.id
            ? <Explain label="What Chasing on camera means" trigger={
                <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 16%, transparent)', color:'var(--accent-light)' }}>🃏 Chasing on camera</span>}>
                You announced this chase — dealers surface its singles, every card you land is an episode, and finishing it is the payoff video.
              </Explain>
            : <button className="btn alt t-xs btn-fixed" style={{ padding: '3px 10px' }}
                onClick={() => { const r = declareChallenge(set.id); toast(r.error || `🃏 Announced: chasing the ${set.name} master set.`) }}>
                🃏 Declare challenge
              </button>
        )}
      </div>

      {/* Masterset progress (all variants) + plain set progress */}
      <div className="binder-progress">
        <div className="binder-prog-row">
          <b>Masterset {ms.placed}/{ms.total}</b>
          <span className={`pill ${ms.complete ? 'complete' : ''}`} style={ms.complete ? { background:'color-mix(in srgb, var(--green) 13%, transparent)', color:'var(--green)' } : null}>
            {ms.complete ? '✓ Complete' : `${ms.pct}%`}
          </span>
          <Explain label="What Set tracks" trigger={
            <span className="pill">🗂️ Set {comp.owned}/{comp.total}{comp.complete ? ' ✓' : ` · ${comp.pct}%`}</span>}>
            One of every card (any variant) — separate from the Masterset count above, which needs every variant.
          </Explain>
        </div>
        <div className="binder-bar"><div style={{ width: ms.pct + '%' }} /></div>
        <div className="cap">
          {ms.complete
            ? '✨ Full masterset — every variant slotted. Ultimate flex.'
            : <>
                {ms.total - ms.placed} slot{ms.total - ms.placed === 1 ? '' : 's'} to go
                {!comp.complete && <> · completing the base set pays +{fmtMoney(reward.cash)}, +{reward.noto}★ & +{reward.clout} 🎫 — then the page on display draws walk-ins, whales & viewers</>}
                {placeableNow > 0 && <> · <b className="pos">{placeableNow} ready to slot</b></>}
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

      {/* BINDER RESERVE — CEILINGS, not floors. Your sharpest and your priciest copies are worth
          more graded and sold than buried in a slot, so a copy that hits any ceiling is held OUT
          of the fill (by hand or by the overnight Curator), free to grade & sell. Only lesser
          copies get filed; if a slot's only copy is reserved, it stays open. */}
      <div className="binder-standard">
        <span className="bs-head">🎚️ Binder reserve <span className="muted">— keep your best cuts and priciest cards out to grade &amp; sell</span></span>
        <label className="bs-field">
          <span className="muted">Reserve cut</span>
          <select value={reserveCut} onChange={e => setSetting('binderReserveCut', e.target.value)}>
            <option value="off">Off — any cut</option>
            {CUT_ORDER.slice(1).map(k => (
              <option key={k} value={k}>{k} &amp; up — keep out</option>
            ))}
          </select>
        </label>
        {/* Value ceilings: the grail you just pulled shouldn't vanish into a slot simply because
            the slot was open. Raw and slab prices live on different scales, so they get their own
            ceiling each. */}
        <label className="bs-field">
          <span className="muted">Raw value</span>
          <select value={reserveRawValue} onChange={e => setSetting('binderReserveRawValue', Number(e.target.value))}>
            <option value={0}>Off — any value</option>
            {BINDER_VALUE_CAPS.filter(Boolean).map(v => (
              <option key={v} value={v}>{capLabel(v)} &amp; up — keep out</option>
            ))}
          </select>
        </label>
        <label className="bs-field">
          <span className="muted">Graded value</span>
          <select value={reserveGradedValue} onChange={e => setSetting('binderReserveGradedValue', Number(e.target.value))}>
            <option value={0}>Off — any value</option>
            {BINDER_VALUE_CAPS.filter(Boolean).map(v => (
              <option key={v} value={v}>{capLabel(v)} &amp; up — keep out</option>
            ))}
          </select>
        </label>
        <span className="muted bs-note">
          {ms.reserved > 0
            ? <><b className="warn">{ms.reserved}</b> open slot{ms.reserved === 1 ? '' : 's'} {ms.reserved === 1 ? 'has' : 'have'} only a reserved copy — {ms.reserved === 1 ? 'it stays' : 'they stay'} out to grade &amp; sell.</>
            : reserveActive
              ? <>Held out of the binder: {reserveSummary}.{reserveGradedValue > 0 ? '' : ' Graded slabs are always eligible.'}</>
              : <>Every copy you own is eligible to file. Set a reserve to keep your sharpest cuts — or your priciest cards — out of the binder.</>}
          {!hasLoupe && reserveCut !== 'off' && <><br />🔍 Without the Jeweler's Loupe your own cut read is fuzzy, but your curator measures precisely.</>}
        </span>
      </div>

      <div className="toolbar mt-5">
        <button className="btn gold" style={{ flex:'none' }} aria-disabled={placeableNow === 0}
          onClick={() => { if (placeableNow === 0) { toast('You own no cards for an open slot yet'); return } fillAll() }}>
          📒 Add everything possible{placeableNow ? ` (${placeableNow})` : ''}
        </button>
        <button className={`btn ${missingOnly ? 'gold' : 'alt'}`} style={{ flex:'none' }} onClick={() => setMissingOnly(v => !v)}>
          {missingOnly ? '✓ Incomplete only' : 'Show incomplete only'}
        </button>
        <span className="cap">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
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
                <div className="binder-slot-art"
                  {...(anyOwned ? clickable(() => onPick?.(anyOwned)) : {})}>
                  {art ? <img src={art} alt={c.name} loading="lazy" decoding="async" style={ownsAny ? null : { opacity: 0.22, filter: 'grayscale(1)' }} /> : <span className="binder-slot-name">{c.name}</span>}
                  <span className="binder-num">#{cardNumber(c)}</span>
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
                        aria-label={isPlaced ? `${meta.label} — slotted. Tap to take it out.`
                          : isLoose ? `${meta.label} — you own one. Tap to slot it into the binder.`
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
// A dollar ceiling as a menu label — whole dollars, grouped ($25, $1,000). fmtMoney's cents
// are noise on a round threshold.
function capLabel(v) { return v >= 1000 ? fmtMoney(v) : `$${v}` }
