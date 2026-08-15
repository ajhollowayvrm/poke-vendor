import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPackFor, openProduct, makeProductPromo, isHit, isChase, isChaseOrEx, isGrail, cardValue, fmtMoney, rarityRank,
  preloadCardImages, cutEstimate, HIT_THRESHOLD, cardImg, slabLabel, setById,
  ownedIdSet, setIdOfCard, needTierFor, drawPackSets } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import CardModal from './CardModal'
import HoloCard from './HoloCard'
import HandReveal, { NeedBadge } from './HandReveal'
import Burst from './Burst'
import { configureFeedback, primeAudio, sfxTear, sfxFlip, sfxHit, sfxWant, sfxTension, sfxGod } from '../game/feedback'
import { AnimatedNumber } from '../ui/AnimatedNumber'

// "Big hit" thresholds — how good a card has to be for the sifter to STOP and hand you the
// pack to rip yourself. The three money bars are pure VALUE bars; "Chase" is a RARITY bar
// instead (see bigHitIn), because the card you want in your own hands isn't always the
// expensive one — a $6 Illustration Rare is still an alt art you'd rather pull than watch
// blur past, and the ex is the card the pack is *about* whatever it books at. Whatever the
// setting, a grail (Master Ball foil / SIR+), a want-fill or a god pack always breaks the churn.
//
// Note the rarity bar is the SLOWEST setting on a phone-friendly set: including the ex roughly
// doubles the stop rate (Ascended Heroes 20.5% of packs → 38.0%, Prismatic 37.4% → 48.6%), so a
// box hands back a lot of packs. That's the setting doing what it says; the money bars sift fast.
const CHASE_LEVEL = Infinity   // the rarity-bar sentinel: no value ever clears it
const STOP_LEVELS = [
  { key: 25,  label: '$25+',  blurb: 'Stop on anything $25 or up' },
  { key: 50,  label: '$50+',  blurb: 'Only bigger hits break the churn' },
  { key: 150, label: '$150+', blurb: 'Chase-money only' },
  { key: CHASE_LEVEL, label: 'Chase only', blurb: 'Any ex, IR+ or special foil, at any price' },
]

// How much faster than a normal rip the churn runs. The sift shows the REAL rip — pack tears,
// cards land in the hand one by one — just wound right up: a ~10-card pack goes by in about
// eight tenths of a second instead of six seconds, so a booster box takes ~30s rather than
// four minutes. Multiplies with the player's own rip-speed setting, so Turbo sifts a box in
// well under ten seconds.
const SIFT_SPEED = 8

// AUTO-RIP / "sift": churn through a whole GROUP of sealed, speeding through the full rip
// animation pack after pack and STOPPING on any pack holding something big — which it hands
// you sealed, to tear open and reveal a card at a time yourself. `items` are sealed inventory
// rows; each is consumed (ripSealed) as its turn comes up, its packs banked as they're opened —
// so backing out never loses product.
//
// What it deliberately does NOT do is tell you what it found. The sifter knows (it looked at the
// pack to decide), but naming the card before you've torn the wrap is handing you the punchline
// first. You get "something's in this one" and the pack; the rest is yours to pull.
export default function AutoRip({ items, onExit }) {
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const addPulls = useGame(s => s.addPulls)
  const logRip = useGame(s => s.logRip)
  const ripSealed = useGame(s => s.ripSealed)
  const wantList = useGame(s => s.wantList)
  const forumPosts = useGame(s => s.forumPosts)
  const activeWants = useMemo(() => [...(wantList || []), ...(forumPosts || [])], [wantList, forumPosts])
  // 🃏 Holes in a set you're building — the same read the normal rip does, so a card badges the
  // same whether you turned it yourself or watched it go past on the churn.
  const collection = useGame(s => s.collection)
  const binder = useGame(s => s.binder)
  const challengeSetId = useGame(s => s.challenge?.setId || null)
  const ownedIds = useMemo(() => ownedIdSet([...(collection || []), ...(binder || [])]), [collection, binder])
  const binderSets = useMemo(() => new Set((binder || []).map(c => setIdOfCard(c)).filter(Boolean)), [binder])

  const [phase, setPhase] = useState('intro')   // intro | sifting | hit | reveal | done
  const [minValue, setMinValue] = useState(25)
  const [feed, setFeed] = useState([])
  const [stats, setStats] = useState({ packs: 0, value: 0, hitPacks: 0, best: null, hits: [] })
  const [pending, setPending] = useState(null)   // { set, product, cards } awaiting a manual rip
  // The pack currently on screen — the same shape in both modes, because it IS the same UI:
  // the churn drives `shown` on a timer, the manual rip drives it off your taps.
  const [stack, setStack] = useState(null)       // { set, cards }
  const [shown, setShown] = useState(0)          // how many of its cards are face-up
  const [shaking, setShaking] = useState(false)  // the tear beat before cards start landing
  const [awaiting, setAwaiting] = useState(false)// manual rip: waiting for your tap
  const [settled, setSettled] = useState(false)  // manual rip: last card seen → the grid
  const [suspense, setSuspense] = useState(false)// the next card is a grail — hold the beat
  const [swept, setSwept] = useState(0)          // packs banked unwatched by "skip & bank the rest"
  const [tear, setTear] = useState(0)
  const [burst, setBurst] = useState(false)
  const [modalCard, setModalCard] = useState(null)

  const speed = Math.max(0.25, ripSpeed)
  const ms = (n) => n / speed
  const fast = (n) => ms(n) / SIFT_SPEED   // churn pacing: a real rip, wound up
  const timers = useRef([])
  const after = (fn, d) => { const id = setTimeout(() => { timers.current = timers.current.filter(t => t !== id); fn() }, d); timers.current.push(id); return id }
  const cancelTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])

  // Work state lives in refs (the sift loop reads/advances it outside React's render cycle).
  const queue = useRef([...items])   // sealed rows not yet started (still in inventory)
  const cur = useRef(null)           // { set, product, packsLeft, promo }
  const running = useRef(false)      // a pack is mid-animation — don't double-pump
  const inflight = useRef(null)      // { set, cards } opened and animating, not yet banked
  const minRef = useRef(minValue)
  minRef.current = minValue

  function wantFor(card) { return activeWants.find(w => cardMatchesWant(card, w)) }
  function needOf(card) { return needTierFor(card, ownedIds, challengeSetId, binderSets) }
  function tagCards(cards) {
    cards.forEach(c => { c._isHit = isHit(c); c._needFor = needOf(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    return cards
  }
  // Does this pack hold something worth handing back sealed? A want-fill or a grail always
  // does. Past that it's the chosen bar: "Chase" asks the RARITY question (the ex, any IR/UR/
  // SIR+, or a Poké/Master Ball foil, however little it's worth), the money levels ask VALUE.
  function bigHitIn(cards) {
    if (cards._god) return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), null)
    const min = minRef.current
    const clears = min === CHASE_LEVEL ? isChaseOrEx : (c) => cardValue(c) >= min
    return cards.find(c => c._fillsWant || isGrail(c) || clears(c)) || null
  }
  function pickBest(best, cards) { return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), best) }
  // Bank a pack to the collection AND fold it into the on-screen tally — everything EXCEPT the
  // money, which accrues a card at a time as each one lands (see revealCard). `best` and `hits`
  // are safe to bank up front: neither shows until the sift-complete screen.
  function bankPack(cards, set) {
    addPulls(cards, set.name, 1)
    const newHits = cards.filter(c => c._isHit || c.foil)
    setStats(s => ({ ...s, packs: s.packs + 1, best: pickBest(s.best, cards), hits: newHits.length ? [...newHits, ...s.hits] : s.hits }))
  }
  // One card just turned face-up: that — and only that — is what the "💰 pulled" tally counts.
  // Adding a pack's whole value in one lump handed you the punchline: on the flagged pack it
  // jumped the moment you tore the wrapper, so the tally announced the hit the sifter had just
  // gone to the trouble of not naming. Called exactly once per card in both reveal paths.
  function revealCard(card) { setStats(s => ({ ...s, value: s.value + cardValue(card) })) }
  function pushFeed(line, key) { setFeed(f => [{ line, key: key || `${f.length}-${line}` }, ...f].slice(0, 10)) }

  // The heart of the sift: advance until we hit a big-hit pack (then stop for you) or run dry.
  function pump() {
    if (running.current || flushed.current) return    // flushed = the rest was swept in; the sift is over
    if (!cur.current) {
      if (!queue.current.length) { setPhase('done'); return }
      const it = queue.current.shift()
      const removed = ripSealed(it.uid)                   // consume this unit from inventory now
      if (!removed) { pump(); return }                    // already gone (sold/moved) — skip it, don't rip a phantom
      const set = setById(it.setId)
      // A cross-set product deals a different set into every slot. Drawn from THIS unit's uid,
      // so sifting five identical UPCs gives five different lineups.
      cur.current = { set, product: it.product, packsLeft: it.product?.packs || 1,
        promo: it.product?.bonus === 'promo', packSets: drawPackSets(it.product, it.uid) }
    }
    const c = cur.current
    if (!c.set) { cur.current = null; pump(); return }    // unknown set — skip it defensively
    // Which set this particular pack came out of (the anchor set for an ordinary product).
    const packSetOf = i => (c.packSets && setById(c.packSets[i])) || c.set
    const from = packSetOf((c.product?.packs || 1) - c.packsLeft)
    if (c.packsLeft > 0) {
      // openPackFor, not openPack: a 🔦 searched loose pack has to come out gutted here too.
      // Sifting one used to launder it — the churn rolled it at full odds while "skip & bank the
      // rest" (flush → openProduct) honoured the strip, so the same pack paid differently
      // depending on how you opened it.
      const cards = tagCards(openPackFor(from, c.product))
      // Look BEFORE we animate: a pack worth stopping for must never flash its cards past you
      // on the churn clock. It goes back in your hands sealed instead.
      if (bigHitIn(cards)) {
        // `from`, not c.set — the paused pack must hand over showing the set it really is.
        setPending({ set: from, product: c.product, cards })
        setStack(null); setShown(0); setSettled(false); setAwaiting(false)
        setTear(0); setPhase('hit')
        setStats(s => ({ ...s, hitPacks: s.hitPacks + 1 }))
        pushFeed(`🔥 ${from.name} — the sifter stopped on this one. Rip it yourself →`)
        return
      }
      churnPack(cards, from)
      return
    }
    if (c.promo) {
      c.promo = false
      const promo = makeProductPromo(c.set, c.product)
      if (promo) {
        promo._isHit = isHit(promo)
        addPulls([promo], `${c.product.type} promo · ${c.set.name}`, 0)
        setStats(s => ({ ...s, value: s.value + cardValue(promo), best: pickBest(s.best, [promo]), hits: (promo._isHit || promo.foil) ? [promo, ...s.hits] : s.hits }))
        pushFeed(`${promo._stamp === 'pc' ? '🏬 PC stamped promo' : '🎁 Promo'}: ${promo.name} (${fmtMoney(cardValue(promo))})`)
        setStack({ set: c.set, cards: [promo] }); setShown(1); setShaking(false)  // it gets its beat in the hand too
      }
      running.current = true
      after(() => { running.current = false; pump() }, fast(900))
      return
    }
    cur.current = null                                    // this item is done — on to the next
    running.current = true
    after(() => { running.current = false; pump() }, fast(400))
  }

  // Speed through one forgettable pack: the same tear + hand-reveal as a normal rip, on the
  // churn clock. Banked to the collection only once every card has landed, and the money tally
  // climbs card by card, so neither ever runs ahead of what you've watched go by.
  function churnPack(cards, set) {
    running.current = true
    inflight.current = { cards, set }
    preloadCardImages(cards)   // the hand shows one card at a time; warm them all during the tear
    setStack({ set, cards }); setShown(0); setShaking(true)
    after(() => { setShaking(false); churnStep(cards, set, 0) }, fast(900))
  }
  function churnStep(cards, set, i) {
    // "Skip & bank the rest" flushes the remainder synchronously — including this pack, which is
    // already out of its wrapper. Any reveal timer still in flight must NOT then bank it a second
    // time. (finishRest cancels them; this is the belt to that pair of braces.)
    if (flushed.current) return
    if (i >= cards.length) {
      bankPack(cards, set)
      // …and only now, once it's gone by, does it say the pack was gutted before you bought it.
      if (cards._searched) pushFeed(`🔦 ${set.name} — that one was searched. The hit was long gone.`)
      inflight.current = null
      if (cur.current) cur.current.packsLeft--
      after(() => { running.current = false; pump() }, fast(320))
      return
    }
    setShown(i + 1)
    revealCard(cards[i])
    // Hits under your stop bar still linger a beat longer than filler — the churn has a rhythm,
    // not a metronome. No burst or sound down here: at better than a pack a second that's a strobe.
    after(() => churnStep(cards, set, i + 1), fast((cards[i]._isHit || cards[i].foil) ? 1100 : 520))
  }

  function start() { primeAudio(); setPhase('sifting'); after(() => pump(), ms(300)) }

  // Tear open the flagged pack yourself — and from here it's a normal manual rip: the pack lands
  // as a face-down stack in your hand and every card waits for your tap.
  function ripPending() {
    if (!pending || phase !== 'hit') return
    primeAudio()
    preloadCardImages(pending.cards)
    const p = pending
    setPhase('reveal')
    setStack({ set: p.set, cards: p.cards }); setShown(0); setSettled(false); setAwaiting(false); setShaking(true)
    sfxTear()
    after(() => {
      setShaking(false)
      setAwaiting(true)                                    // your tap turns the first card
      teaseNext(p.cards, 0)                                // …and if card one is a grail, it says so
      bankPack(p.cards, p.set)                             // the rip IS the acquisition (money accrues per card)
      if (cur.current) cur.current.packsLeft--
      setPending(null)                                     // banked now — flush must not re-bank it
    }, ms(650))
  }

  // Reveal card i and fire its feedback, then wait for the next tap. Mirrors the normal rip's
  // manual mode exactly, finale included — the god/demigod payoff lands on the last card, not
  // the moment the wrapper comes off.
  function revealStep(cards, i) {
    if (i >= cards.length) {
      if (cards._god) { setBurst(true); after(() => setBurst(false), 3000); sfxGod() }
      else if (cards._demigod) { setBurst(true); after(() => setBurst(false), 1800); sfxGod() }
      setSettled(true)
      return
    }
    const c = cards[i]
    setShown(i + 1)
    setSuspense(false)
    revealCard(c)
    const special = c._isHit || c.foil || c._fillsWant
    if (special) {
      setBurst(true); after(() => setBurst(false), ms(1200))
      // Same split as the normal rip: a want-fill is spoken for, not rarer, so it gets its own
      // chime — layered behind the hit sting when the card happens to be both.
      if (c._isHit || c.foil) { sfxHit(rarityRank(c.rarity) - HIT_THRESHOLD, isGrail(c)); if (c._fillsWant) sfxWant(0.3) }
      else sfxWant()
    } else {
      sfxFlip()
    }
    teaseNext(cards, i + 1)
    // The last card waits for your tap too, exactly like every card before it. A timer here
    // used to settle the pack 700ms after the final flip, and settling swaps the hand out for
    // the grid — so the one card you stopped the whole sift to see got yanked off screen.
    setAwaiting(true)
  }
  // The suspense beat for the pack the sifter handed you — it's a manual rip, so the hold lasts as
  // long as you take: the next card glows, the rest of the hand dims, until you turn it.
  function teaseNext(cards, i) {
    const c = cards[i]
    if (!c || !isGrail(c) || c._peeked) { setSuspense(false); return }
    c._peeked = true
    setSuspense(true)
    sfxTension()
  }
  function advanceManual() {
    if (phase !== 'reveal' || !awaiting || !stack) return
    primeAudio()
    setAwaiting(false)
    revealStep(stack.cards, shown)
  }

  function continueSift() {
    setPending(null); setStack(null); setShown(0); setSettled(false); setAwaiting(false); setSuspense(false)
    setPhase('sifting'); after(() => pump(), ms(150))
  }

  // Drag-to-rip on the flagged pack (mirrors the main opener's feel).
  const dragRef = useRef({ active: false, startY: 0 })
  const RIP_DRAG = 130
  function onPackDown(e) { if (phase !== 'hit') return; dragRef.current = { active: true, startY: e.clientY }; primeAudio(); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
  function onPackMove(e) { if (!dragRef.current.active) return; const dy = e.clientY - dragRef.current.startY; setTear(Math.max(0, Math.min(1, dy / RIP_DRAG))); if (dy >= RIP_DRAG) { dragRef.current.active = false; ripPending() } }
  function onPackUp() { if (!dragRef.current.active) return; dragRef.current.active = false; if (phase === 'hit') setTear(0) }

  // Bank everything still un-ripped WITHOUT touching React state — safe to run on unmount so
  // backing out (or navigating away) never strands product you already pulled from inventory.
  const flush = useRef(() => {})
  const flushed = useRef(false)
  // Returns what it swept — { packs, value, best, hits } — so a MOUNTED caller (finishRest) can
  // fold it into the tally. The done screen used to read "Sifted 12 packs · pulled $88" after
  // sweeping thirty more: flush banked them to the collection but told the tally nothing, so the
  // headline number quietly excluded most of what you'd just opened. Unmount ignores the return.
  flush.current = () => {
    if (flushed.current) return null                     // idempotent — never bank the remainder twice
    flushed.current = true
    const swept = { packs: 0, value: 0, best: null, hits: [] }
    // `from` skips cards already counted card-by-card by revealCard, so the pack caught
    // mid-animation contributes only the part you never saw.
    const take = (cards, packs = 1, from = 0) => {
      swept.packs += packs
      swept.value += cards.slice(from).reduce((a, c) => a + cardValue(c), 0)
      swept.best = pickBest(swept.best, cards)
      swept.hits.push(...cards.filter(c => c._isHit || c.foil))
    }
    // A pack caught mid-animation is already OUT of the wrapper — bank the exact cards that were
    // on screen rather than re-rolling a fresh pack for it.
    if (inflight.current) { addPulls(inflight.current.cards, inflight.current.set.name, 1); take(inflight.current.cards, 1, shown); if (cur.current) cur.current.packsLeft--; inflight.current = null }
    if (pending) { addPulls(tagCards(pending.cards), pending.set.name, 1); take(pending.cards); if (cur.current) cur.current.packsLeft--; }
    if (cur.current && cur.current.set) {
      const cu = cur.current
      // Sweeping the remainder must deal the SAME sets the churn would have — a bank-the-rest
      // is a shortcut through the animation, not a different box. Start where the churn stopped.
      const total = cu.product?.packs || 1
      for (let i = 0; i < cu.packsLeft; i++) {
        const from = (cu.packSets && setById(cu.packSets[total - cu.packsLeft + i])) || cu.set
        const cards = tagCards(openPackFor(from, cu.product))
        addPulls(cards, from.name, 1); take(cards)
      }
      // The promo stays pinned to the product's own set — a Charizard UPC ships a Charizard
      // promo no matter which packs fell in.
      if (cu.promo) { const p = makeProductPromo(cu.set, cu.product); if (p) { p._isHit = isHit(p); addPulls([p], '', 0); take([p], 0) } }
    }
    cur.current = null
    while (queue.current.length) {
      const it = queue.current.shift(); const removed = ripSealed(it.uid); if (!removed) continue
      const set = setById(it.setId); if (!set) continue
      const all = openProduct(set, it.product, { uid: it.uid }); all.forEach(c => (c._isHit = isHit(c)))
      addPulls(all, it.product?.pool?.series ? `${it.product.pool.series} era` : set.name, it.product?.packs || 1)
      take(all, it.product?.packs || 1)
    }
    return swept
  }
  useEffect(() => () => { cancelTimers(); flush.current() }, [])

  // "Skip & bank the rest": stop sifting, sweep everything left straight into the collection.
  // Kill the in-flight reveal timers FIRST — flush banks the pack that's mid-animation, so a
  // surviving churn timer would land the same ten cards in your collection twice.
  function finishRest() {
    cancelTimers(); running.current = false
    const swept = flush.current()
    if (swept && (swept.packs || swept.value)) {
      setStats(s => ({ ...s,
        packs: s.packs + swept.packs,
        value: s.value + swept.value,
        best: swept.best ? pickBest(s.best, [swept.best]) : s.best,
        hits: swept.hits.length ? [...swept.hits, ...s.hits] : s.hits }))
      setSwept(swept.packs)
    }
    setPhase('done')
  }

  const totalPacks = useMemo(() => items.reduce((a, it) => a + (it.product?.packs || 1), 0), [items])
  // 📜 One log line for the whole sift session. Unlike the opener, this path has the REAL cost
  // basis to hand — these are inventory rows, so `boughtPrice` is what you actually paid rather
  // than what the product lists at today. Written from an effect on the done screen so it reads
  // the settled tally, including anything "skip & bank the rest" swept in.
  const sessionCost = useMemo(() => items.reduce((a, it) => a + (it.boughtPrice || 0), 0), [items])
  const sessionLogged = useRef(false)
  useEffect(() => {
    if (phase !== 'done' || sessionLogged.current || !stats.packs) return
    sessionLogged.current = true
    const one = items.length === 1 ? items[0] : null
    logRip({
      setId: one ? one.setId : (setById(items[0]?.setId)?.id || null),
      name: one ? (setById(one.setId)?.name || '') : `${items.length} items`,
      type: one ? (one.product?.type || 'sealed') : '⚡ sift',
      packs: stats.packs, cost: sessionCost, pulled: stats.value, best: stats.best,
    })
  }, [phase, stats.packs, stats.value])
  const remainingItems = () => queue.current.length + (cur.current ? 1 : 0)
  const modalEl = modalCard && createPortal(<CardModal card={modalCard} readOnly onClose={() => setModalCard(null)} />, document.body)

  // ---- INTRO: pick the group + the "big hit" bar --------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <h2 style={{ marginBottom: 4 }}>⚡ Sift-rip</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
            Rips <b>{items.length} item{items.length === 1 ? '' : 's'}</b> — <b>{totalPacks} pack{totalPacks === 1 ? '' : 's'}</b>, speeding
            through the rip pack after pack and <b>stopping on any pack with something big</b>, which it hands you sealed to open
            a card at a time. It won't say what's in there.
          </p>
          <div className="sift-levels">
            <div className="rip-side-head">Stop the sifter on…</div>
            <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              {STOP_LEVELS.map(l => (
                <button key={l.label} className={`chip-btn ${minValue === l.key ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
                  onClick={() => setMinValue(l.key)} title={l.blurb}>
                  <b>{l.label}</b><small>{l.blurb}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18, gap: 10 }}>
            <button className="btn gold" style={{ maxWidth: 240 }} onClick={start}>⚡ Start sifting {totalPacks} packs →</button>
            <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} onClick={onExit}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // Plain JSX values (not inline components) so frequent re-renders during the churn reconcile
  // by key instead of remounting — the feed rows keep their identity and don't re-animate.
  const tally = (
    <div className="pack-progress">
      <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>📦 {stats.packs} sifted{remainingItems() ? ` · ${remainingItems()} item${remainingItems() === 1 ? '' : 's'} left` : ''}</span>
      {/* Short tween + no flash during the churn: at ~15 cards a second a 450ms flash is a strobe,
          not a cue. Your own pack (phase 'reveal') gets the flash back, one card at a time. */}
      <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }} title="Everything pulled so far this sift">
        💰 <AnimatedNumber value={stats.value} format={fmtMoney} duration={phase === 'reveal' ? 450 : 260} flash={phase === 'reveal'} /> pulled
      </span>
      {stats.hitPacks > 0 && <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 13%, transparent)', color: 'var(--gold)' }}>🔥 {stats.hitPacks} big hit{stats.hitPacks === 1 ? '' : 's'}</span>}
    </div>
  )
  const feedEl = (
    <div className="sift-feed">
      {feed.map(f => <div key={f.key} className="sift-feed-row">{f.line}</div>)}
    </div>
  )
  // The sealed pack, mid-tear. Same element the normal opener shakes, so the churn and the
  // hand-off look like one continuous rip.
  const shakingPack = (logo, name) => (
    <div className="pack-wrap">
      <div className="pack3d shake">
        <div className="foil" />
        {logo ? <img className="logo" src={logo} alt="" /> : <b>{name}</b>}
      </div>
    </div>
  )

  // ---- DONE ---------------------------------------------------------------------------------
  if (phase === 'done') {
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 560 }}>
          <h2 style={{ marginBottom: 6 }}>✓ Sift complete</h2>
          <p style={{ fontSize: 15, margin: '4px 0' }}>
            Sifted <b>{stats.packs}</b> pack{stats.packs === 1 ? '' : 's'} · pulled <b style={{ color: 'var(--green)' }}>{fmtMoney(stats.value)}</b>
            {stats.hitPacks > 0 && <> · <b style={{ color: 'var(--gold)' }}>{stats.hitPacks}</b> big hit{stats.hitPacks === 1 ? '' : 's'}</>}
          </p>
          {/* The number now includes what you skipped, so say so — otherwise it reads as if you
              watched thirty packs go by. */}
          {swept > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 6px' }}>
              ⏭️ {swept} of those went straight to the collection unwatched.
            </p>
          )}
          {stats.best && <p className="muted" style={{ fontSize: 13 }}>Best pull: <b style={{ color: rarityColor(stats.best.rarity) }}>{stats.best.name}</b> · {fmtMoney(cardValue(stats.best))}</p>}
          {stats.hits.length > 0 && (
            <div className="rip-summary-hits" style={{ marginTop: 10 }}>
              <div className="rip-side-head" style={{ textAlign: 'center' }}>Hits ({stats.hits.filter(c => c._isHit || c.foil).length})</div>
              <div className="rip-summary-hits-grid">
                {[...stats.hits].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 24).map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  return (
                    <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }} onClick={() => setModalCard(c)} title="Tap for the full card details">
                      <img src={cardImg(c)} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? slabLabel(c.grade) : c.rarity}</div>
                      </div>
                      <div className="rip-hit-val">{fmtMoney(cardValue(c))}{c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {modalEl}
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn gold" style={{ maxWidth: 200 }} onClick={() => onExit && onExit()}>Done →</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- HIT: the flagged pack, sealed, waiting for you to tear it open ------------------------
  // No card name, no value, no rarity colour: the sifter had to look inside to decide, but
  // telling you would spend the pull before you've opened it.
  if (phase === 'hit') {
    return (
      <div className="stage">
        {tally}
        <div className="banner" style={{ maxWidth: 460, textAlign: 'center' }}>
          🔥 <b>Something's in this one.</b> The sifter stopped on a {pending?.set?.name} pack and left it sealed —
          rip it yourself and find out.
        </div>
        <div className="pack-wrap">
          <div className="pack3d" onClick={ripPending} role="button" tabIndex={0} aria-label="Rip the pack" style={{ '--tear': tear }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ripPending() } }}
            onPointerDown={onPackDown} onPointerMove={onPackMove} onPointerUp={onPackUp} onPointerCancel={onPackUp}>
            <div className="foil" />
            <div className="tear" aria-hidden="true" />
            {pending?.set?.logo ? <img className="logo" src={pending.set.logo} alt={pending.set.name} /> : <b>{pending?.set?.name}</b>}
            <span className="hint">▶ Click or drag down to rip</span>
          </div>
        </div>
        <button className="btn alt" style={{ maxWidth: 220 }} onClick={finishRest}>⏭️ Skip &amp; bank the rest</button>
        {feedEl}
      </div>
    )
  }

  // ---- REVEAL: your pack, one card at a time, then the grid ----------------------------------
  if (phase === 'reveal') {
    return (
      <div className="stage">
        {burst && <Burst />}
        {tally}
        {shaking || !stack ? shakingPack(stack?.set?.logo, stack?.set?.name) : settled ? (
          <>
            {/* The normal rip flies this the moment the wrapper comes off — which here would be the
                sifter telling you what it found. It waits until you've turned the last card. */}
            {stack.cards._god && <div className="godbanner">✨🎉 GOD PACK!! 🎉✨<small>Every card is a hit — one in thousands.</small></div>}
            {stack.cards._demigod && <div className="demigodbanner">{(stack.cards._specialLabel || 'DEMIGOD PACK!')} <small>Most of the pack is a hit.</small></div>}
            <div className="rip-top-actions">
              <button className="btn gold" style={{ maxWidth: 240 }} onClick={continueSift}>{remainingItems() ? 'Keep sifting →' : 'Finish →'}</button>
            </div>
            <div className="reveal-row rip-reveal-grid">
              {stack.cards.map(c => {
                const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
                return (
                  <div key={c.uid} className="rip-cell">
                    <HoloCard card={c} interactive onClick={() => setModalCard(c)} extraStyle={{ '--rarity': edge }}
                      className={`reveal-card shown ${(c._isHit || c.foil) ? 'hit' : ''} ${isChase(c) ? 'chase' : ''}`}>
                      <div className="flip">
                        <div className="flip-back" aria-hidden="true">{stack.set.logo && <img src={stack.set.logo} alt="" />}</div>
                        <div className="flip-front"><img src={cardImg(c)} alt={c.name} decoding="async" fetchpriority="high" /></div>
                      </div>
                    </HoloCard>
                    <button className="rip-cell-foot" onClick={() => setModalCard(c)} title="Tap for the full card details">
                      <div className="rc-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                      <div className="rc-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? slabLabel(c.grade) : `${c.reverse ? 'Reverse · ' : ''}${c.rarity}`}</div>
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
          </>
        ) : (
          <HandReveal pulls={stack.cards} shown={shown} awaiting={awaiting} revealMode="manual"
            setLogo={stack.set.logo} hasLoupe={hasLoupe} onTapNext={advanceManual} onInspect={setModalCard}
            suspense={suspense} />
        )}
        {modalEl}
      </div>
    )
  }

  // ---- SIFTING: the real rip, wound right up -------------------------------------------------
  return (
    <div className="stage">
      {tally}
      {shaking || !stack ? shakingPack(stack?.set?.logo, stack?.set?.name || '📦') : (
        <HandReveal pulls={stack.cards} shown={shown} awaiting={false} revealMode="auto"
          setLogo={stack.set.logo} hasLoupe={hasLoupe} onTapNext={() => {}} onInspect={() => {}} />
      )}
      <div className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
        ⚡ Sifting — it'll stop on its own when a pack is worth your hands.
      </div>
      <button className="btn alt" style={{ maxWidth: 220 }} onClick={finishRest}>⏭️ Skip &amp; bank the rest</button>
      {feedEl}
    </div>
  )
}
