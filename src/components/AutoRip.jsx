import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPack, openProduct, makeProductPromo, isHit, isChase, cardValue, fmtMoney, rarityRank,
  preloadCardImages, cutEstimate, HIT_THRESHOLD, cardImg, setById } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import CardModal from './CardModal'
import HoloCard from './HoloCard'
import HandReveal from './HandReveal'
import Burst from './Burst'
import { configureFeedback, primeAudio, sfxTear, sfxFlip, sfxHit, sfxGod } from '../game/feedback'

// "Big hit" thresholds — how good a card has to be for the sifter to STOP and hand you the
// pack to rip yourself. Chase-only sets the value bar to infinity, so only a Master Ball / SIR+
// (or a want-fill / god pack) breaks the churn.
const STOP_LEVELS = [
  { key: 25,  label: '$25+',  blurb: 'Stop on anything $25 or up' },
  { key: 50,  label: '$50+',  blurb: 'Only bigger hits break the churn' },
  { key: 150, label: '$150+', blurb: 'Chase-money only' },
  { key: Infinity, label: 'Chase only', blurb: 'Only a Master Ball / SIR+ stops it' },
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
  const ripSealed = useGame(s => s.ripSealed)
  const wantList = useGame(s => s.wantList)
  const forumPosts = useGame(s => s.forumPosts)
  const activeWants = useMemo(() => [...(wantList || []), ...(forumPosts || [])], [wantList, forumPosts])

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
  function tagCards(cards) {
    cards.forEach(c => { c._isHit = isHit(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    return cards
  }
  function bigHitIn(cards) {
    if (cards._god) return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), null)
    return cards.find(c => c._fillsWant || isChase(c) || cardValue(c) >= minRef.current) || null
  }
  function pickBest(best, cards) { return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), best) }
  // Bank a pack to the collection AND fold it into the on-screen tally.
  function bankPack(cards, set) {
    addPulls(cards, set.name, 1)
    const v = cards.reduce((a, c) => a + cardValue(c), 0)
    const newHits = cards.filter(c => c._isHit || c.foil)
    setStats(s => ({ ...s, packs: s.packs + 1, value: s.value + v, best: pickBest(s.best, cards), hits: newHits.length ? [...newHits, ...s.hits] : s.hits }))
  }
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
      cur.current = { set, product: it.product, packsLeft: it.product?.packs || 1, promo: it.product?.bonus === 'promo' }
    }
    const c = cur.current
    if (!c.set) { cur.current = null; pump(); return }    // unknown set — skip it defensively
    if (c.packsLeft > 0) {
      const cards = tagCards(openPack(c.set))
      // Look BEFORE we animate: a pack worth stopping for must never flash its cards past you
      // on the churn clock. It goes back in your hands sealed instead.
      if (bigHitIn(cards)) {
        setPending({ set: c.set, product: c.product, cards })
        setStack(null); setShown(0); setSettled(false); setAwaiting(false)
        setTear(0); setPhase('hit')
        setStats(s => ({ ...s, hitPacks: s.hitPacks + 1 }))
        pushFeed(`🔥 ${c.set.name} — the sifter stopped on this one. Rip it yourself →`)
        return
      }
      churnPack(cards, c.set)
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
  // churn clock. Banked only once every card has landed, so the tally never runs ahead of what
  // you've watched go by.
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
      inflight.current = null
      if (cur.current) cur.current.packsLeft--
      after(() => { running.current = false; pump() }, fast(320))
      return
    }
    setShown(i + 1)
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
      bankPack(p.cards, p.set)                             // the rip IS the acquisition
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
    const special = c._isHit || c.foil || c._fillsWant
    if (special) {
      setBurst(true); after(() => setBurst(false), ms(1200))
      sfxHit(rarityRank(c.rarity) - HIT_THRESHOLD, isChase(c))
    } else {
      sfxFlip()
    }
    if (i + 1 < cards.length) { setAwaiting(true); return }
    after(() => revealStep(cards, i + 1), ms(700))         // last card seen — let it land, then settle
  }
  function advanceManual() {
    if (phase !== 'reveal' || !awaiting || !stack) return
    primeAudio()
    setAwaiting(false)
    revealStep(stack.cards, shown)
  }

  function continueSift() {
    setPending(null); setStack(null); setShown(0); setSettled(false); setAwaiting(false)
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
  flush.current = () => {
    if (flushed.current) return                          // idempotent — never bank the remainder twice
    flushed.current = true
    // A pack caught mid-animation is already OUT of the wrapper — bank the exact cards that were
    // on screen rather than re-rolling a fresh pack for it.
    if (inflight.current) { addPulls(inflight.current.cards, inflight.current.set.name, 1); if (cur.current) cur.current.packsLeft--; inflight.current = null }
    if (pending) { addPulls(tagCards(pending.cards), pending.set.name, 1); if (cur.current) cur.current.packsLeft--; }
    if (cur.current && cur.current.set) {
      for (let i = 0; i < cur.current.packsLeft; i++) addPulls(tagCards(openPack(cur.current.set)), cur.current.set.name, 1)
      if (cur.current.promo) { const p = makeProductPromo(cur.current.set, cur.current.product); if (p) { p._isHit = isHit(p); addPulls([p], '', 0) } }
    }
    cur.current = null
    while (queue.current.length) {
      const it = queue.current.shift(); const removed = ripSealed(it.uid); if (!removed) continue
      const set = setById(it.setId); if (!set) continue
      const all = openProduct(set, it.product); all.forEach(c => (c._isHit = isHit(c))); addPulls(all, set.name, it.product?.packs || 1)
    }
  }
  useEffect(() => () => { cancelTimers(); flush.current() }, [])

  // "Skip & bank the rest": stop sifting, sweep everything left straight into the collection.
  // Kill the in-flight reveal timers FIRST — flush banks the pack that's mid-animation, so a
  // surviving churn timer would land the same ten cards in your collection twice.
  function finishRest() { cancelTimers(); running.current = false; flush.current(); setPhase('done') }

  const totalPacks = useMemo(() => items.reduce((a, it) => a + (it.product?.packs || 1), 0), [items])
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
      <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }} title="Everything pulled so far this sift">💰 {fmtMoney(stats.value)} pulled</span>
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
                        <div className="rip-hit-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}</div>
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
                      <div className="rc-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : `${c.reverse ? 'Reverse · ' : ''}${c.rarity}`}</div>
                      <div className="rc-val">{fmtMoney(cardValue(c))}</div>
                      {(cut || c._fillsWant) && (
                        <div className="rc-badges">
                          {cut && <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>👁️ {cut.short}</span>}
                          {c._fillsWant && <span className="rc-want">⭐ Want</span>}
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
            setLogo={stack.set.logo} hasLoupe={hasLoupe} onTapNext={advanceManual} onInspect={setModalCard} />
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
