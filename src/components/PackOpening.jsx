import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPack, openPackFor, openProduct, makeProductPromo, isHit, isChase, isGrail, cardValue, psa10Value, psaValueAt, packPrice, fmtMoney, rarityRank, preloadCardImages, cutEstimate, HIT_THRESHOLD, cardImg, slabLabel, ownedIdSet, setIdOfCard, needTierFor, drawPackSets, setById, productTypeLabel } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import CardModal from './CardModal'
import HoloCard from './HoloCard'
import HandReveal, { NeedBadge } from './HandReveal'
import Burst from './Burst'
import { configureFeedback, primeAudio, sfxTear, sfxFlip, sfxHit, sfxWant, sfxTension, sfxGod } from '../game/feedback'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { Explain } from '../ui/Explain'

// Opens sealed product with the animated rip. For a single booster this rips one
// pack. For a multi-pack product (when "open one at a time" is on) it rips each
// pack in sequence — "Pack 3 of 9" — and you can fast-forward the rest anytime.
// Phases: idle -> shaking -> revealing -> done (per pack) -> finished (whole product)
// `ripAnotherStock` is the single gate for "Rip another": it rips from 📦 Inventory only and
// never buys, so holding none means there is no action to offer. The old price/sold-out/
// can-afford props existed only to describe a re-BUY that no longer happens.
export default function PackOpening({ set, product, uid, onExit, singleNoReRip = false, onRipAnother, ripAnotherStock = 0, paused = false, costBasis = null }) {
  const canRipAnother = !!onRipAnother && ripAnotherStock > 0
  const totalPacks = product?.packs ?? 1
  // 📦 A cross-set product (an Ultra Premium Collection) holds packs from a whole era, so the
  // set changes from pack to pack. Derived from the unit's uid — the same box always holds the
  // same packs. Memoised so a re-render can never reshuffle the lineup mid-rip.
  const packSets = useMemo(() => drawPackSets(product, uid), [product, uid])
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const revealMode = useGame(s => s.settings.revealMode ?? 'auto')
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const [packNo, setPackNo] = useState(1)        // 1-based, which pack we're on
  // The set THIS pack came from. For an ordinary product that's the product's own set and
  // nothing below changes; for a UPC it's whichever set the draw dealt into this slot, and it
  // is what the wrapper, the logo and the progress pill must say.
  const packSet = (packSets && setById(packSets[packNo - 1])) || set
  const [phase, setPhase] = useState('idle')
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
  const [awaiting, setAwaiting] = useState(false) // manual mode: waiting for a tap to flip the next card
  const [suspenseIdx, setSuspenseIdx] = useState(-1) // auto mode: index of the chase card being teased pre-flip
  const [tear, setTear] = useState(0)            // drag-to-rip progress 0..1 on the idle pack
  const [burst, setBurst] = useState(false)
  const [searched, setSearched] = useState(false)  // 🔦 this pack had already been gone through
  const [isGod, setIsGod] = useState(false)
  const [isDemigod, setIsDemigod] = useState(false)
  const [hits, setHits] = useState([])            // every hit/foil pulled this whole rip (Hits tab)
  const [tab, setTab] = useState('cards')         // rip screen: 'cards' (the reveal grid) | 'hits'
  const [modalCard, setModalCard] = useState(null) // a revealed card tapped for its full read-only card page
  const [finished, setFinished] = useState(false) // whole product done
  const [extra, setExtra] = useState([])          // promo + fast-forwarded packs (for the summary)
  const [ripValue, setRipValue] = useState(0)     // cumulative card value across the WHOLE rip
  const [ripBest, setRipBest] = useState(null)    // best single card across the WHOLE rip (for the 📜 log)
  const [packsOpened, setPacksOpened] = useState(0) // how many packs we've fully opened this rip
  const addPulls = useGame(s => s.addPulls)
  const logRip = useGame(s => s.logRip)
  const hasLoupe = useGame(s => !!s.upgrades.loupe) // 🔍 precise cut read vs a fuzzy eyeball one
  const wantList = useGame(s => s.wantList)
  const forumPosts = useGame(s => s.forumPosts)
  const activeWants = useMemo(() => [...(wantList || []), ...(forumPosts || [])], [wantList, forumPosts])
  // 🃏 Your OWN wants: cards missing from a set you're building. Rebuilt when the collection
  // changes — i.e. once per pack banked, not once per card — so a 36-pack box knows what pack 12
  // put in your hands by the time pack 13 lands.
  const collection = useGame(s => s.collection)
  const binder = useGame(s => s.binder)
  const challengeSetId = useGame(s => s.challenge?.setId || null)
  const ownedIds = useMemo(() => ownedIdSet([...(collection || []), ...(binder || [])]), [collection, binder])
  const binderSets = useMemo(() => new Set((binder || []).map(c => setIdOfCard(c)).filter(Boolean)), [binder])
  function needOf(card) { return needTierFor(card, ownedIds, challengeSetId, binderSets) }
  const [autoLeft, setAutoLeft] = useState(0)     // seconds left on the auto-advance countdown
  const [held, setHeld] = useState(false)         // you pressed Hold — this pack won't auto-advance
  const committed = useRef(false)
  const autoRipped = useRef(false)                 // did we already auto-rip the current idle pack?
  const pausedRef = useRef(paused)                 // read inside timer callbacks, which don't re-close over props
  const resumeRef = useRef(null)                   // the reveal step parked because you left the tab
  const packSeq = useRef(0)                        // bumped to abandon an in-flight reveal chain
  const speed = Math.max(0.25, ripSpeed)           // guard against absurd values
  const ms = (n) => n / speed                      // scale a delay by rip speed
  // Track reveal/burst timers so they can be cancelled on unmount — exiting (Done / "Rip
  // another" remount) mid-reveal would otherwise leave timers calling setState after unmount.
  const timersRef = useRef([])
  const after = (fn, delay) => {
    const id = setTimeout(() => { timersRef.current = timersRef.current.filter(t => t !== id); fn() }, delay)
    timersRef.current.push(id)
    return id
  }
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }, [])
  // Keep the feedback module's sound/haptics gates in sync with the user's settings.
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])
  // Leaving the Buy tab has to stop the REVEAL, not just stop the next pack from auto-starting.
  // An in-flight step() chain used to keep flipping cards — and firing hit stings — at a hidden
  // screen, so you'd come back to a pack that had already happened without you. step() parks its
  // continuation here instead, and coming back picks up on the exact card it stopped at.
  useEffect(() => {
    pausedRef.current = paused
    if (paused || !resumeRef.current) return
    const go = resumeRef.current
    resumeRef.current = null
    go()
  }, [paused])
  // 📜 One log line per RIP — written from an EFFECT rather than from finish(), so it reads the
  // settled totals instead of the mid-update values a call inside the state updater would see.
  // Two shapes reach "the whole product is done": a multi-pack product goes through
  // addBonusAndFinish (`finished`), a single loose pack simply closes out its one pack. The ref
  // keeps it to exactly one entry per product, and resetForNext clears it for an in-place re-rip.
  const ripLogged = useRef(false)
  useEffect(() => {
    const productDone = finished || (totalPacks === 1 && phase === 'done')
    if (!productDone || ripLogged.current) return
    ripLogged.current = true
    logRip({
      // A cross-set product is logged under its ERA and how many sets it actually dealt —
      // "16 packs · 5 sets" — because no single set name would be true of the rip.
      setId: set.id,
      name: packSets ? `${product.pool.series} era` : set.name,
      setCount: packSets ? new Set(packSets).size : undefined,
      type: product?.type || 'Booster Pack',
      // What you PAID when the caller knows it (a held unit's boughtPrice), not what the
      // product lists at today — so a log line's net is a real P/L and the sift's lines,
      // which read boughtPrice straight off the inventory row, mean the same thing.
      packs: packsOpened || totalPacks, cost: costBasis ?? ripCost, pulled: ripValue, best: ripBest,
      special: isGod ? 'god' : isDemigod ? 'demigod' : null,
    })
  }, [finished, phase, totalPacks])

  // When a pack finishes, snap the self-scrolling overlay back to the top so the pack-done
  // controls (Next pack / Rip another / Done) — which sit at the top of the stage — are always
  // in view. Without this, finishing a rip while scrolled down through the reveal grid leaves
  // the finish button off-screen up top (the bug the old sticky pin tried, and failed, to fix).
  useEffect(() => {
    if (phase !== 'done') return
    const ov = document.querySelector('.rip-overlay')
    if (ov) ov.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phase])

  const last = packNo >= totalPacks

  function wantFor(card) { return activeWants.find(w => cardMatchesWant(card, w)) }
  const better = (b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b)

  function rip() {
    if (phase !== 'idle') return
    primeAudio() // this click/drag is our chance to start audio under the autoplay policy
    setTear(0)
    const cards = openPackFor(packSet, product)
    preloadCardImages(cards) // warm the CDN cache so cards don't pop in slowly mid-reveal
    cards.forEach(c => { c._isHit = isHit(c); c._needFor = needOf(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    const god = !!cards._god
    const demigod = !!cards._demigod
    setSearched(!!cards._searched)
    setIsGod(god)
    setIsDemigod(demigod)
    setAwaiting(false)
    setSuspenseIdx(-1)
    setPulls(cards)
    setPhase('shaking')
    sfxTear()
    after(() => {
      setPhase('revealing')
      // Manual mode: land the pack as a stack of face-down cards and wait for the
      // first tap. Auto mode: start the timed reveal immediately.
      if (revealMode === 'manual') { setAwaiting(true); teaseNext(cards, 0) }
      else step(cards, 0)
    }, ms(god ? 1500 : demigod ? 1200 : 900))
  }

  function finish(cards) {
    if (!committed.current) {
      committed.current = true
      addPulls(cards, packSet.name)
      // NB: the rip tally is NOT folded in here — step() adds each card's value as it lands,
      // so by the time we get here the pack is already counted (see the note on step()).
      setPacksOpened(n => n + 1)
    }
    if (cards._god) { setBurst(true); after(() => setBurst(false), 3000); sfxGod() } // big finale
    else if (cards._demigod) { setBurst(true); after(() => setBurst(false), 1800); sfxGod() }
    setPhase('done')
  }

  // Reveal card i, fire its feedback, then decide how to reach i+1: in auto mode we
  // schedule the next reveal on a timer; in manual mode we stop and wait for a tap.
  // A GRAIL card in auto mode gets a short suspense beat (dim the row, tease the
  // face-down card) before it actually flips. The beat is pinned to the narrow bar, not the
  // wider isChase one: Poké Ball foils land in one pack in three, and an 850ms hold that
  // often stops reading as suspense and starts reading as lag.
  function step(cards, i, seq = packSeq.current) {
    if (seq !== packSeq.current) return   // this pack was skipped past — abandon the chain
    if (i >= cards.length) { finish(cards); return }
    // Off the Buy tab: park here rather than reveal to a screen nobody's looking at. Sits BELOW
    // the finish() branch on purpose — a pack that already turned its last card still commits to
    // the collection, so pausing can never strand cards.
    if (pausedRef.current) { resumeRef.current = () => step(cards, i, seq); return }
    const c = cards[i]
    const grail = isGrail(c)
    if (grail && revealMode !== 'manual' && !c._peeked) {
      c._peeked = true
      setSuspenseIdx(i)
      sfxTension()
      after(() => { setSuspenseIdx(-1); step(cards, i, seq) }, ms(850))
      return
    }
    setShown(i + 1)
    setSuspenseIdx(-1)
    // The running tally climbs a CARD at a time, not a pack at a time. Banking the whole pack in
    // one lump made the number itself the spoiler: a $400 jump the instant the wrapper came off
    // (or the moment the last card landed) told you what the pack held before you'd looked at it.
    // Each index reaches this line exactly once — the grail suspense beat re-enters step() with
    // the same i but returns above, and manual taps are gated on `awaiting` — so no double count.
    setRipValue(v => v + cardValue(c))
    setRipBest(b => better(b, c))
    const special = c._isHit || c.foil || c._fillsWant
    if (special) {
      setBurst(true); after(() => setBurst(false), ms(1200))
      setHits(h => [c, ...h])
      // A want-fill has its own sound now. It used to route through sfxHit, so a $2 common that
      // someone had asked for rang like a chase pull — and a chase that ALSO filled a want said
      // nothing extra. Both: the hit sting first, the want chime layered behind it.
      if (c._isHit || c.foil) { sfxHit(rarityRank(c.rarity) - HIT_THRESHOLD, grail); if (c._fillsWant) sfxWant(0.3) }
      else sfxWant()
    } else {
      sfxFlip()
    }
    const isLast = i + 1 >= cards.length
    // Manual mode owns the pace — INCLUDING the last card. This used to read `&& !isLast`, so a
    // player tapping through at their own speed had the payoff card snatched away to the pack
    // summary 520ms after it flipped. Now the final card waits for a tap like every other one;
    // advanceManual() then calls step() with i === length, which falls through to finish().
    if (revealMode === 'manual') { setAwaiting(true); teaseNext(cards, i + 1); return }
    // Auto mode: the last card is the one you actually want to look at, and the moment it lands
    // the whole screen changes (phase 'done' swaps in the summary and scrolls the stage to top).
    // Give it a real beat instead of the same 520ms as a card that's followed by another flip.
    const delay = isLast ? (special ? 2200 : 1600) : (special ? 1100 : 520)
    after(() => step(cards, i + 1, seq), ms(delay))
  }

  // Manual mode's suspense beat. Auto mode holds the row for 850ms before a grail flips; manual
  // had nothing, because the tap is yours and a timed hold would just be lag. So the hold lasts
  // exactly as long as you take: the card you're about to turn glows, the rest of the hand dims,
  // and it stays that way until you turn it. `_peeked` is the same once-per-card flag auto uses.
  function teaseNext(cards, i) {
    const c = cards[i]
    if (!c || !isGrail(c) || c._peeked) { setSuspenseIdx(-1); return }
    c._peeked = true
    setSuspenseIdx(i)
    if (!pausedRef.current) sfxTension() // the glow can wait for you; a swell at a hidden screen can't
  }

  // "Show the rest of this pack": you've seen the card you stopped for and the remaining flips are
  // a formality — land them all and close the pack out. Distinct from "Skip rest", which fast-
  // forwards whole packs you never see at all. Bumping packSeq abandons the in-flight chain so a
  // timer already in the air can't reveal a card into a pack that's now finished.
  function revealRest() {
    if (phase !== 'revealing') return
    const cards = pulls
    packSeq.current++
    resumeRef.current = null
    setSuspenseIdx(-1); setAwaiting(false)
    const rest = cards.slice(shown)
    if (rest.length) {
      setRipValue(v => v + rest.reduce((a, c) => a + cardValue(c), 0))
      setRipBest(b => rest.reduce(better, b))
      const restHits = rest.filter(c => c._isHit || c.foil || c._fillsWant)
      // reversed, so the Hits list keeps the same newest-first order a real reveal builds
      if (restHits.length) setHits(h => [...restHits].reverse().concat(h))
      setShown(cards.length)
    }
    finish(cards)
  }

  // Manual mode: a tap on the next face-down card flips it (and queues the wait for
  // the one after). `shown` is the index of the next card to reveal.
  function advanceManual() {
    if (phase !== 'revealing' || !awaiting) return
    primeAudio()
    setAwaiting(false)
    step(pulls, shown)
  }

  // Drag-to-rip: dragging down across the sealed pack tears it open. A downward drag
  // grows a glowing seam; crossing the threshold fires the rip. A plain click still
  // works (rip()'s phase guard keeps the two from double-firing).
  const dragRef = useRef({ active: false, startY: 0 })
  const RIP_DRAG = 130 // px of downward drag to tear it open
  function onPackDown(e) {
    if (phase !== 'idle') return
    dragRef.current = { active: true, startY: e.clientY }
    primeAudio()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  function onPackMove(e) {
    if (!dragRef.current.active) return
    const dy = e.clientY - dragRef.current.startY
    const p = Math.max(0, Math.min(1, dy / RIP_DRAG))
    setTear(p)
    if (dy >= RIP_DRAG) { dragRef.current.active = false; rip() }
  }
  function onPackUp() {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    if (phase === 'idle') setTear(0) // released before tearing — snap the seam shut
  }

  // Reset reveal state for the next pack in the sequence.
  // Keeps `hits` — they accumulate across the whole product, not per pack.
  function resetForNext() {
    committed.current = false
    autoRipped.current = false
    packSeq.current++            // nothing from the last pack gets to fire into this one
    resumeRef.current = null
    setPhase('idle'); setShown(0); setPulls([]); setIsGod(false); setIsDemigod(false)
    setAwaiting(false); setSuspenseIdx(-1); setTear(0); setTab('cards')
    setHeld(false); setAutoLeft(0)   // Hold is per-pack: it means "wait, I'm looking at THIS one"
    ripLogged.current = false        // an in-place re-rip is a NEW rip and earns its own log line
  }

  // Move to the next pack (or finish if that was the last one).
  function nextPack() {
    if (last) { addBonusAndFinish(); return }
    setPackNo(n => n + 1)
    resetForNext()
  }

  // Auto-advance ("Auto-open next pack"): when on, auto-rip whatever idle pack we're
  // sitting on — including the FIRST pack right after a buy and the fresh pack after a
  // "Rip another" remount — and, mid-box, wait a beat after a pack finishes then move on.
  // The user can still click through manually; any manual nextPack/rip pre-empts the timer.
  useEffect(() => {
    if (!autoAdvance) return
    // Don't auto-rip while the overlay is hidden (you've left the Buy tab). It stays
    // mounted so you can resume, but the banner says "Rip in progress — tap to resume",
    // so it must actually PAUSE — not keep cracking packs invisibly. Resumes on return
    // (`paused` is in the deps).
    if (paused) return
    if (phase === 'done' && !last) {
      // The gap used to be a bare 3s timer with nothing on screen: if you wanted a moment longer
      // with the grid, your only option was to be quick. Now it counts down out loud and you can
      // stop it — Hold cancels this pack's advance and hands you the Next button.
      if (held) return
      const total = ms(3000)
      setAutoLeft(Math.ceil(total / 1000))
      const tick = setInterval(() => setAutoLeft(s => (s > 0 ? s - 1 : 0)), 1000)
      const t = setTimeout(() => nextPack(), total)
      return () => { clearInterval(tick); clearTimeout(t); setAutoLeft(0) }
    }
    if (phase === 'idle' && !autoRipped.current) {
      autoRipped.current = true
      const t = setTimeout(() => rip(), ms(600))
      return () => clearTimeout(t)
    }
  }, [phase, packNo, autoAdvance, last, totalPacks, speed, paused, held])

  // Mint the product's guaranteed promo (if any), add it, and finish.
  function addBonusAndFinish() {
    const promo = makeProductPromo(set, product || { bonus: null })
    if (promo) {
      promo._isHit = isHit(promo)
      promo._needFor = needOf(promo)
      addPulls([promo], `${product.type} promo · ${set.name}`, 0) // promo isn't a pack
      setExtra(e => [...e, promo])
      setRipValue(v => v + cardValue(promo)) // promo counts toward the rip's total value
      setRipBest(b => better(b, promo))
      if (promo._isHit || promo.foil) setHits(h => [promo, ...h])
    }
    setFinished(true)
  }

  // Fast-forward: instantly rip every UN-ripped pack (+ promo) into the collection.
  // If the current pack hasn't been ripped yet (idle), it counts as remaining too;
  // if it's already revealed (done), only the packs after it remain.
  function skipRest() {
    packSeq.current++; resumeRef.current = null   // nothing in flight gets to land after this
    const remaining = totalPacks - packNo + (phase === 'idle' ? 1 : 0)
    // Where the un-ripped packs start: on 'idle' the current pack is still sealed, otherwise
    // it's already been opened and the remainder begins after it. Skipping must deal the SAME
    // sets the slow path would have — fast-forwarding is not a different box.
    const startIdx = packNo - 1 + (phase === 'idle' ? 0 : 1)
    const fast = []
    for (let i = 0; i < remaining; i++) {
      const from = (packSets && setById(packSets[startIdx + i])) || set
      const pack = openPack(from)
      if (pack._god) pack.forEach(c => { c._fromGod = true })
      if (pack._demigod) pack.forEach(c => { c._fromDemigod = true })
      fast.push(...pack)
    }
    fast.forEach(c => { c._isHit = isHit(c); c._needFor = needOf(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    if (fast.length) addPulls(fast, packSets ? `${product.pool.series} era` : set.name, remaining)
    setExtra(e => [...e, ...fast])
    // fold the fast-forwarded packs into the running rip tally
    setRipValue(v => v + fast.reduce((a, c) => a + cardValue(c), 0))
    setRipBest(b => fast.reduce(better, b))
    setPacksOpened(n => n + remaining)
    const fastHits = fast.filter(c => c._isHit || c.foil || c._fillsWant)
    if (fastHits.length) setHits(h => [...fastHits, ...h])
    addBonusAndFinish()
  }

  // Running value-per-rip: what the whole product cost vs what's come out so far.
  // (Hoisted above the `finished` return so the summary screen can use it too.)
  const ripCost = product?.price ?? packPrice(set) * totalPacks
  const ripProfit = ripValue - ripCost

  // Tapping any revealed card (in the grid, the Hits tab, or the finished summary) opens its
  // full card page — read-only, since mid-rip you're studying the pull, not selling it. It's
  // portalled to <body> so it escapes the rip overlay's stacking context and paints over the
  // top bar like every other modal (the overlay itself sits below the bar at z-25).
  const modalEl = modalCard && createPortal(
    <CardModal card={modalCard} readOnly onClose={() => setModalCard(null)} />, document.body)

  if (finished) {
    const promo = extra.find(c => c._promo)
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          {/* The header names what you BOUGHT; the breakdown below names what you GOT. */}
          <h2 style={{ marginBottom: 6 }}>✓ Opened {product?.type || 'pack'} — {packSets ? (product.name || `${product.pool.series} era`) : set.name}</h2>
          <p className="cap t-sm mt-0">
            All {totalPacks} pack{totalPacks > 1 ? 's' : ''}{promo ? ' + promo' : ''} are in your collection.
          </p>
          {packSets && (
            <p className="cap" style={{ margin: '2px 0 8px' }}>
              {[...packSets.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map())]
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => `${n}× ${setById(id)?.name || id}`)
                .join(' · ')}
            </p>
          )}
          <p className="t-lg" style={{ margin: '6px 0' }}>
            Total pulled <b className="pos">{fmtMoney(ripValue)}</b>{' '}
            <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
              ({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)} vs {fmtMoney(ripCost)} spent)
            </span>
          </p>
          {promo && (
            <p className="cap t-sm">
              {promo._stamp === 'pc' ? '🏬 Pokémon Center stamped promo' : '🎁 Bonus promo'}: <b style={{ color: rarityColor(promo.rarity) }}>{promo.name}</b> · {fmtMoney(cardValue(promo))}
            </p>
          )}
          <div className="rip-summary-hits">
            <div className="rip-side-head" style={{ textAlign: 'center' }}>
              {/* Count true rarity/foil hits only; wanted cards also appear in the list
                  (with their own ⭐ badge) but don't inflate the "Hits" tally. */}
              {(() => { const n = hits.filter(c => c._isHit || c.foil).length; return n ? `Hits (${n})` : 'Hits' })()}
            </div>
            {hits.length === 0 ? (
              <p className="cap t-sm" style={{ margin: '4px 0' }}>No hits this time — better luck next rip. 🤞</p>
            ) : (
              <div className="rip-summary-hits-grid">
                {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  // The cut read sits next to the PSA-10 number on purpose: together they're
                  // the "is this worth grading?" call, made right here instead of card-by-card.
                  const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
                  return (
                    <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}
                      onClick={() => setModalCard(c)}>
                      <img src={cardImg(c)} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>
                          {c.foil ? c.foil.label : c.grade ? slabLabel(c.grade) : c.rarity}
                        </div>
                        {cut && (
                          <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>
                            👁️ {cut.short}
                          </span>
                        )}
                      </div>
                      <div className="rip-hit-val">
                        {fmtMoney(cardValue(c))}
                        {!c.grade && <div className="rip-hit-psa10">💎 10 {fmtMoney(psaValueAt(c, 10))} · 9 {fmtMoney(psaValueAt(c, 9))}</div>}
                        {c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {modalEl}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            {/* Only rendered while you HOLD another one. It rips from 📦 Inventory and never
                buys, so with nothing held there is no action left to offer — the button is
                absent rather than present-but-dead. */}
            {canRipAnother && (
              <button className="btn gold" style={{ maxWidth: 220 }} onClick={onRipAnother}>
                Rip another (📦 {ripAnotherStock} held) ↻
              </button>
            )}
            <button className={`btn ${canRipAnother ? 'alt' : 'gold'}`} style={{ maxWidth: 200 }} onClick={onExit}>Done →</button>
          </div>
        </div>
      </div>
    )
  }

  const packTotal = pulls.reduce((a, c) => a + cardValue(c), 0)
  const profit = packTotal - packPrice(set)
  const multi = totalPacks > 1
  // Count true rarity/foil hits only for the tab badge; wanted cards still list on the Hits
  // tab (with their ⭐) but don't inflate the tally — matches the game's "hit" meaning.
  const hitCount = hits.filter(c => c._isHit || c.foil).length
  // packs still un-opened: the current one counts only while it's idle (not yet ripped)
  const remainingToOpen = totalPacks - packNo + (phase === 'idle' ? 1 : 0)

  return (
    <div className="stage">
      {burst && <Burst />}

      {/* A loose single pack draws this bar too, from its first card. It used to be multi-only, so
          the one rip where the running total is the ONLY money on screen was the one without it. */}
      {(multi || shown > 0) && (
        <div className="pack-progress">
          {/* On a cross-set product the set name is the whole point of the pill — you need to
              know it's a Brilliant Stars pack BEFORE you tear it, not after. */}
          {multi && <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>📦 Pack {packNo} of {totalPacks}{packSets ? ` · ${packSet.name}` : ''}</span>}
          {/* Live from the very first card of the very first pack — it ticks up as cards land, so
              there's no reason to hold it back until a pack has closed out. */}
          {(packsOpened > 0 || shown > 0) && (
            <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }}>
              {/* Tweened, not snapped: now that it climbs a card at a time, the climb is the
                  point — the number counting up IS the "what did that card just earn me". */}
              💰 Rip <AnimatedNumber value={ripValue} format={fmtMoney} /> <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)})</span>
            </span>
          )}
          {product?.bonus && <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 13%, transparent)', color: 'var(--gold)' }}>🎁 + promo at the end</span>}
          {(phase === 'idle' || phase === 'done') && remainingToOpen >= 2 && (
            <button className="btn alt btn-fixed" style={{ maxWidth: 190 }} onClick={skipRest}>⏩ Skip rest ({remainingToOpen} left)</button>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <>
          <div className="pack-wrap">
            <div className="pack3d" onClick={rip} role="button" tabIndex={0} aria-label="Rip the pack"
              style={{ '--tear': tear }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rip() } }}
              onPointerDown={onPackDown} onPointerMove={onPackMove}
              onPointerUp={onPackUp} onPointerCancel={onPackUp}>
              <div className="foil" />
              <div className="tear" aria-hidden="true" />
              {packSet.logo ? <img className="logo" src={packSet.logo} alt={packSet.name} /> : <b>{packSet.name}</b>}
              {/* Out of a mixed product the wrapper alone is the reveal — name it in words too,
                  because a logo you half-recognise isn't the same as being told. */}
              {packSets && <span className="pack-set-name">{packSet.name}</span>}
              <span className="hint">▶ Tap or drag down to rip</span>
            </div>
          </div>
          {!multi && <button className="btn alt" style={{ maxWidth: 160 }} onClick={onExit}>← Back to shop</button>}
        </>
      )}

      {(phase === 'shaking') && (
        <div className="pack-wrap">
          <div className="pack3d shake">
            <div className="foil" />
            {packSet.logo ? <img className="logo" src={packSet.logo} alt={packSet.name} /> : <b>{packSet.name}</b>}
            {packSets && <span className="pack-set-name">{packSet.name}</span>}
          </div>
        </div>
      )}

      {(phase === 'revealing' || phase === 'done') && (
        <>
          {/* Held to 'done' — the same reason the tally counts a card at a time. This used to fly
              the moment the wrapper came off, so the banner announced a god pack over a stack of
              face-down cards and every flip after it was a formality. The finale belongs on the
              last card, where finish() already fires the burst. (The sift does this too.) */}
          {phase === 'done' && isGod && <div className="godbanner">✨🎉 GOD PACK!! 🎉✨<small>Every card is a hit — one in thousands.</small></div>}
          {phase === 'done' && isDemigod && <div className="demigodbanner">{(pulls._specialLabel || 'DEMIGOD PACK!')} <small>Most of the pack is a hit.</small></div>}

          {/* TOP — pack-done controls surface here so the next-pack button is up top, not below the cards */}
          {phase === 'done' && (
            <div className="rip-top-actions">
              {multi ? (
                <>
                  <button className="btn gold" style={{ maxWidth: 220 }} onClick={nextPack}>
                    {last ? (product?.bonus ? 'Open promo & finish →' : 'Finish →') : `Next pack (${packNo + 1}/${totalPacks}) →`}
                  </button>
                  {/* The auto-advance gap, out loud and stoppable. */}
                  {autoAdvance && !last && !paused && (held ? (
                    <p className="rip-auto-note">⏸️ Auto-advance held — take your time, then hit “Next pack”.</p>
                  ) : autoLeft > 0 ? (
                    <button className="btn alt btn-fixed" style={{ maxWidth: 200 }} onClick={() => setHeld(true)}>
                      ⏸️ Hold ({autoLeft}s) — still looking
                    </button>
                  ) : null)}
                </>
              ) : singleNoReRip ? (
                <button className="btn gold" style={{ maxWidth: 180 }} onClick={onExit}>Done →</button>
              ) : (
                <>
                  {/* Straight into the next one you already OWN — it comes out of 📦 Inventory
                      and costs nothing. With none held there is nothing to offer, so the
                      button goes away and "Done" becomes the primary action. */}
                  {canRipAnother && (
                    <button className="btn gold" style={{ maxWidth: 200 }} onClick={onRipAnother}>
                      Rip another (📦 {ripAnotherStock} held)
                    </button>
                  )}
                  <button className={`btn ${canRipAnother ? 'alt' : 'gold'}`}
                    style={{ flex: 'none', maxWidth: canRipAnother ? 140 : 180 }} onClick={onExit}>Done →</button>
                </>
              )}
              {/* Out of this product: say so plainly, and point at the one place that sells it.
                  This used to be a dead greyed button with an explanation underneath; buying
                  more is now a deliberate trip to the Buy tab, not a tap inside the rip. */}
              {onRipAnother && !multi && !singleNoReRip && !canRipAnother && (
                <p className="cap" style={{ margin: '6px 0 0', width: '100%', textAlign: 'center' }}>
                  That was your last {product ? productTypeLabel(product) : 'pack'} — pick up more on the 🛒 Buy tab.
                </p>
              )}
            </div>
          )}

          {/* Two views of the same rip: the reveal grid, and a running Hits list on its own
              tab (kept off the reveal so it doesn't crowd the cards). */}
          <div className="rip-tabs">
            <button className={`rip-tab ${tab === 'cards' ? 'active' : ''}`} onClick={() => setTab('cards')}>🎴 Cards</button>
            <button className={`rip-tab ${tab === 'hits' ? 'active' : ''}`} onClick={() => setTab('hits')}>
              ✨ Hits{hitCount ? ` (${hitCount})` : ''}
            </button>
          </div>

          {tab === 'cards' ? (
            <div className="rip-cards-pane">
              {/* Every card gets the star treatment: a big tile that lands with its own name +
                  value, and opens its full card page on tap. A card being teased (the grail
                  suspense beat, or the next manual tap) dims the rest of the grid to spotlight it. */}
              {phase === 'revealing' ? (
                /* The reveal itself: you hold the pack as a stack, the current card face-up on top;
                   pull it off to the side to reach the next, with upcoming border edges peeking
                   (a rainbow chase telegraphs itself). When the pack finishes it settles into the grid. */
                <>
                  <HandReveal pulls={pulls} shown={shown} awaiting={awaiting} revealMode={revealMode}
                    setLogo={packSet.logo} hasLoupe={hasLoupe} onTapNext={advanceManual} onInspect={setModalCard}
                    suspense={suspenseIdx === shown} />
                  {/* An escape hatch for the flips that no longer matter. Deliberately quiet, and
                      gone once the last card is up (that tap closes the pack anyway). */}
                  {shown < pulls.length && (
                    <button className="btn alt rip-reveal-rest" onClick={revealRest}>
                      ⏭️ Show the rest of this pack ({pulls.length - shown} left)
                    </button>
                  )}
                </>
              ) : (
                /* Done: the fan settles into a readable 2-up grid — every card big, with its name
                   + value, opening its full card page on tap. */
                <div className={`reveal-row rip-reveal-grid ${isGod ? 'god' : isDemigod ? 'demigod' : ''}`}>
                  {pulls.map((c) => {
                    const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                    const chase = isChase(c)
                    const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
                    return (
                      <div key={c.uid} className="rip-cell">
                        <HoloCard card={c} interactive onClick={() => setModalCard(c)}
                          extraStyle={{ '--rarity': edge }}
                          className={`reveal-card shown ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                          <div className="flip">
                            <div className="flip-back" aria-hidden="true">{packSet.logo && <img src={packSet.logo} alt="" />}</div>
                            <div className="flip-front"><img src={cardImg(c)} alt={c.name} decoding="async" fetchpriority="high" /></div>
                          </div>
                        </HoloCard>
                        <button className="rip-cell-foot" onClick={() => setModalCard(c)}>
                          <div className="rc-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                          <div className="rc-meta" style={{ color: edge }}>
                            {c.foil ? c.foil.label : c.grade ? slabLabel(c.grade) : `${c.reverse ? 'Reverse · ' : ''}${c.rarity}`}
                          </div>
                          <div className="rc-val">{fmtMoney(cardValue(c))}</div>
                          {(cut || c._fillsWant || c._needFor) && (
                            <div className="rc-badges">
                              {cut && <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>👁️ {cut.short}</span>}
                              {c._fillsWant && <span className="rc-want">⭐ Want</span>}
                              <NeedBadge card={c} compact />
                            </div>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {phase === 'done' && (
                <div className="rip-pack-summary" style={{ textAlign: 'center' }}>
                  {/* 🔦 Told only AFTER the reveal — the gut-punch is realising nothing good was
                      ever coming, which is exactly how buying a searched pack feels. It used to
                      live in the multi-pack progress bar, where it could never appear: only a
                      LOOSE single pack can be searched (openPackFor bails on packs !== 1), and a
                      single pack doesn't render that bar. So the whole payoff was dead. It sits
                      with the pack summary now, which both single and multi rips draw. */}
                  {searched && (
                    <div style={{ marginBottom: 8 }}>
                      <Explain label="What does searched mean?" trigger={
                        <span className="pill" style={{ background: 'color-mix(in srgb, var(--red) 15%, transparent)', color: 'var(--red)' }}>
                          🔦 Searched — the hit was already gone
                        </span>
                      }>
                        Someone weighed or candled this pack and pulled the hit before resealing it. Loose
                        out-of-print packs carry that risk — worst on a show floor, least from a shop, and
                        never from a box you broke yourself.
                      </Explain>
                    </div>
                  )}
                  <div className="t-lg" style={{ marginBottom: multi ? 4 : 8 }}>
                    Pack value <b className="pos">{fmtMoney(packTotal)}</b>{' '}
                    <span style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      ({profit >= 0 ? '+' : ''}{fmtMoney(profit)} vs {fmtMoney(packPrice(set))} cost)
                    </span>
                  </div>
                  {multi && (
                    <div className="t-md" style={{ marginBottom: 8 }}>
                      Rip so far <b className="pos">{fmtMoney(ripValue)}</b>{' '}
                      <span className="muted">across {packsOpened} pack{packsOpened === 1 ? '' : 's'}</span>{' '}
                      <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        ({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)} vs {fmtMoney(ripCost)} spent)
                      </span>
                    </div>
                  )}
                  {/* Ten per-card badges is the detail; THIS is the takeaway — did the pack move
                      the set forward. Counted off the same _needFor stamp the badges read. */}
                  {(() => {
                    const need = pulls.filter(c => c._needFor).length
                    const chal = pulls.filter(c => c._needFor === 'challenge').length
                    if (!need) return null
                    return (
                      <div className="t-sm" style={{ marginBottom: 6, color: chal ? 'var(--gold)' : 'var(--accent-light)', fontWeight: 700 }}>
                        {chal ? `🃏 ${chal} new for your challenge set` : `📒 ${need} you didn't own yet`}
                      </div>
                    )
                  })()}
                  <p className="cap mt-3">
                    Cards added to your collection. Best pull:{' '}
                    <b style={{ color: rarityColor(best(pulls).rarity) }}>{best(pulls).name}</b> · {fmtMoney(cardValue(best(pulls)))}
                  </p>
                  <p className="cap mt-1">👆 Tap any card for its full details — cut, PSA-if-graded values, and price history.</p>
                </div>
              )}
            </div>
          ) : (
            <HitsPane hits={hits} hitCount={hitCount} hasLoupe={hasLoupe} onInspect={setModalCard} />
          )}
        </>
      )}
      {modalEl}
    </div>
  )
}

// The Hits tab: a full-width panel listing every hit/foil/wanted card pulled this rip, biggest
// value first. Each row opens that card's full page (tap `onInspect`). Lives on its own tab so
// it never crowds the reveal grid.
function HitsPane({ hits, hitCount, hasLoupe, onInspect }) {
  return (
    <div className="rip-hits-pane">
      <div className="rip-side-head">✨ Hits this rip {hitCount ? `(${hitCount})` : ''}</div>
      {hits.length === 0 ? (
        <p className="cap t-sm" style={{ margin: '6px 0 2px' }}>
          No hits yet — every foil, rare hit, and wanted card lands here as you rip. 🤞
        </p>
      ) : (
        <div className="rip-hits-panel-list">
          {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
            const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
            const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
            return (
              <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}
                onClick={() => onInspect(c)}>
                <img src={cardImg(c)} alt="" />
                <div className="rip-hit-info">
                  <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                  <div className="rip-hit-meta" style={{ color: edge }}>
                    {c.foil ? c.foil.label : c.grade ? slabLabel(c.grade) : c.rarity}
                  </div>
                  {cut && (
                    <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>
                      👁️ {cut.short}
                    </span>
                  )}
                </div>
                <div className="rip-hit-val">
                  {fmtMoney(cardValue(c))}
                  {!c.grade && <div className="rip-hit-psa10">💎 {fmtMoney(psa10Value(c))}</div>}
                  {c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function best(cards) { return cards.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, cards[0]) }

