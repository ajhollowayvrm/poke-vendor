import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPack, openProduct, makeProductPromo, isHit, cardValue, psa10Value, psaValueAt, packPrice, fmtMoney, rarityRank, preloadCardImages, cutEstimate, HIT_THRESHOLD, cardImg } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import CardModal from './CardModal'
import HoloCard from './HoloCard'
import Burst from './Burst'
import { configureFeedback, primeAudio, sfxTear, sfxFlip, sfxHit, sfxTension, sfxGod } from '../game/feedback'

// Chase-tier = the cards worth a suspense beat: Master Ball foils and anything
// Special Illustration Rare or above.
function isChase(c) { return c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare') }

// Opens sealed product with the animated rip. For a single booster this rips one
// pack. For a multi-pack product (when "open one at a time" is on) it rips each
// pack in sequence — "Pack 3 of 9" — and you can fast-forward the rest anytime.
// Phases: idle -> shaking -> revealing -> done (per pack) -> finished (whole product)
export default function PackOpening({ set, product, onExit, singleNoReRip = false, onRipAnother, canRipAnother = false, ripAnotherSoldOut = false, ripAnotherPrice, ripAnotherStock = 0, paused = false }) {
  const totalPacks = product?.packs ?? 1
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const revealMode = useGame(s => s.settings.revealMode ?? 'auto')
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const [packNo, setPackNo] = useState(1)        // 1-based, which pack we're on
  const [phase, setPhase] = useState('idle')
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
  const [awaiting, setAwaiting] = useState(false) // manual mode: waiting for a tap to flip the next card
  const [suspenseIdx, setSuspenseIdx] = useState(-1) // auto mode: index of the chase card being teased pre-flip
  const [tear, setTear] = useState(0)            // drag-to-rip progress 0..1 on the idle pack
  const [burst, setBurst] = useState(false)
  const [isGod, setIsGod] = useState(false)
  const [isDemigod, setIsDemigod] = useState(false)
  const [hits, setHits] = useState([])            // every hit/foil pulled this whole rip (Hits tab)
  const [tab, setTab] = useState('cards')         // rip screen: 'cards' (the reveal grid) | 'hits'
  const [modalCard, setModalCard] = useState(null) // a revealed card tapped for its full read-only card page
  const [finished, setFinished] = useState(false) // whole product done
  const [extra, setExtra] = useState([])          // promo + fast-forwarded packs (for the summary)
  const [ripValue, setRipValue] = useState(0)     // cumulative card value across the WHOLE rip
  const [packsOpened, setPacksOpened] = useState(0) // how many packs we've fully opened this rip
  const addPulls = useGame(s => s.addPulls)
  const hasLoupe = useGame(s => !!s.upgrades.loupe) // 🔍 precise cut read vs a fuzzy eyeball one
  const wantList = useGame(s => s.wantList)
  const forumPosts = useGame(s => s.forumPosts)
  const activeWants = useMemo(() => [...(wantList || []), ...(forumPosts || [])], [wantList, forumPosts])
  const committed = useRef(false)
  const autoRipped = useRef(false)                 // did we already auto-rip the current idle pack?
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

  // Why "Rip another" is dead, when it is. It's gated on whether you can actually GET one —
  // from your own 📦 stock or off a shelf that still has it — so an empty shelf and an empty
  // wallet are different problems and get different words. Both buttons below share this.
  const ripBlockedWhy = ripAnotherSoldOut
    ? `You're out of ${product?.type || 'packs'} and no shop has one left to sell.`
    : 'Not enough cash to rip another.'

  function wantFor(card) { return activeWants.find(w => cardMatchesWant(card, w)) }

  function rip() {
    if (phase !== 'idle') return
    primeAudio() // this click/drag is our chance to start audio under the autoplay policy
    setTear(0)
    const cards = openPack(set)
    preloadCardImages(cards) // warm the CDN cache so cards don't pop in slowly mid-reveal
    cards.forEach(c => { c._isHit = isHit(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    const god = !!cards._god
    const demigod = !!cards._demigod
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
      if (revealMode === 'manual') setAwaiting(true)
      else step(cards, 0)
    }, ms(god ? 1500 : demigod ? 1200 : 900))
  }

  function finish(cards) {
    if (!committed.current) {
      committed.current = true
      addPulls(cards, set.name)
      // fold this pack into the running rip tally (value-per-rip)
      setRipValue(v => v + cards.reduce((a, c) => a + cardValue(c), 0))
      setPacksOpened(n => n + 1)
    }
    if (cards._god) { setBurst(true); after(() => setBurst(false), 3000); sfxGod() } // big finale
    else if (cards._demigod) { setBurst(true); after(() => setBurst(false), 1800); sfxGod() }
    setPhase('done')
  }

  // Reveal card i, fire its feedback, then decide how to reach i+1: in auto mode we
  // schedule the next reveal on a timer; in manual mode we stop and wait for a tap.
  // A chase card in auto mode gets a short suspense beat (dim the row, tease the
  // face-down card) before it actually flips.
  function step(cards, i) {
    if (i >= cards.length) { finish(cards); return }
    const c = cards[i]
    const chase = isChase(c)
    if (chase && revealMode !== 'manual' && !c._peeked) {
      c._peeked = true
      setSuspenseIdx(i)
      sfxTension()
      after(() => { setSuspenseIdx(-1); step(cards, i) }, ms(850))
      return
    }
    setShown(i + 1)
    const special = c._isHit || c.foil || c._fillsWant
    if (special) {
      setBurst(true); after(() => setBurst(false), ms(1200))
      setHits(h => [c, ...h])
      sfxHit(rarityRank(c.rarity) - HIT_THRESHOLD, chase)
    } else {
      sfxFlip()
    }
    const isLast = i + 1 >= cards.length
    if (revealMode === 'manual' && !isLast) { setAwaiting(true); return }
    const delay = special ? 1100 : 520
    after(() => step(cards, i + 1), ms(delay))
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
    setPhase('idle'); setShown(0); setPulls([]); setIsGod(false); setIsDemigod(false)
    setAwaiting(false); setSuspenseIdx(-1); setTear(0); setTab('cards')
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
      const t = setTimeout(() => nextPack(), ms(3000))
      return () => clearTimeout(t)
    }
    if (phase === 'idle' && !autoRipped.current) {
      autoRipped.current = true
      const t = setTimeout(() => rip(), ms(600))
      return () => clearTimeout(t)
    }
  }, [phase, packNo, autoAdvance, last, totalPacks, speed, paused])

  // Mint the product's guaranteed promo (if any), add it, and finish.
  function addBonusAndFinish() {
    const promo = makeProductPromo(set, product || { bonus: null })
    if (promo) {
      promo._isHit = isHit(promo)
      addPulls([promo], `${product.type} promo · ${set.name}`, 0) // promo isn't a pack
      setExtra(e => [...e, promo])
      setRipValue(v => v + cardValue(promo)) // promo counts toward the rip's total value
      if (promo._isHit || promo.foil) setHits(h => [promo, ...h])
    }
    setFinished(true)
  }

  // Fast-forward: instantly rip every UN-ripped pack (+ promo) into the collection.
  // If the current pack hasn't been ripped yet (idle), it counts as remaining too;
  // if it's already revealed (done), only the packs after it remain.
  function skipRest() {
    const remaining = totalPacks - packNo + (phase === 'idle' ? 1 : 0)
    const fast = []
    for (let i = 0; i < remaining; i++) {
      const pack = openPack(set)
      if (pack._god) pack.forEach(c => { c._fromGod = true })
      if (pack._demigod) pack.forEach(c => { c._fromDemigod = true })
      fast.push(...pack)
    }
    fast.forEach(c => { c._isHit = isHit(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    if (fast.length) addPulls(fast, set.name, remaining)
    setExtra(e => [...e, ...fast])
    // fold the fast-forwarded packs into the running rip tally
    setRipValue(v => v + fast.reduce((a, c) => a + cardValue(c), 0))
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
          <h2 style={{ marginBottom: 6 }}>✓ Opened {product?.type || 'pack'} — {set.name}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            All {totalPacks} pack{totalPacks > 1 ? 's' : ''}{promo ? ' + promo' : ''} are in your collection.
          </p>
          <p style={{ fontSize: 15, margin: '6px 0' }}>
            Total pulled <b style={{ color: 'var(--green)' }}>{fmtMoney(ripValue)}</b>{' '}
            <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
              ({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)} vs {fmtMoney(ripCost)} spent)
            </span>
          </p>
          {promo && (
            <p className="muted" style={{ fontSize: 13 }}>
              🎁 Bonus promo: <b style={{ color: rarityColor(promo.rarity) }}>{promo.name}</b> · {fmtMoney(cardValue(promo))}
            </p>
          )}
          <div className="rip-summary-hits">
            <div className="rip-side-head" style={{ textAlign: 'center' }}>
              {/* Count true rarity/foil hits only; wanted cards also appear in the list
                  (with their own ⭐ badge) but don't inflate the "Hits" tally. */}
              {(() => { const n = hits.filter(c => c._isHit || c.foil).length; return n ? `Hits (${n})` : 'Hits' })()}
            </div>
            {hits.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>No hits this time — better luck next rip. 🤞</p>
            ) : (
              <div className="rip-summary-hits-grid">
                {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  // The cut read sits next to the PSA-10 number on purpose: together they're
                  // the "is this worth grading?" call, made right here instead of card-by-card.
                  const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
                  return (
                    <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}
                      onClick={() => setModalCard(c)} title="Tap for the full card details">
                      <img src={cardImg(c)} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>
                          {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                        </div>
                        {cut && (
                          <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>
                            👁️ {cut.short}
                          </span>
                        )}
                      </div>
                      <div className="rip-hit-val">
                        {fmtMoney(cardValue(c))}
                        {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10 / PSA 9">💎 10 {fmtMoney(psaValueAt(c, 10))} · 9 {fmtMoney(psaValueAt(c, 9))}</div>}
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
            {onRipAnother && (
              <button
                className="btn gold"
                style={{ maxWidth: 220 }}
                disabled={!canRipAnother}
                title={canRipAnother ? '' : ripBlockedWhy}
                onClick={onRipAnother}>
                {/* Held stock rips free (already paid) — only an empty 📦 shows a price */}
                Rip another{ripAnotherStock > 0 ? ` (📦 ${ripAnotherStock} held)` : ripAnotherPrice != null ? ` (${fmtMoney(ripAnotherPrice)})` : ''} ↻
              </button>
            )}
            <button className={`btn ${onRipAnother ? 'alt' : 'gold'}`} style={{ maxWidth: 200 }} onClick={onExit}>Done →</button>
          </div>
          {onRipAnother && !canRipAnother && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{ripBlockedWhy}</p>
          )}
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

      {multi && (
        <div className="pack-progress">
          <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>📦 Pack {packNo} of {totalPacks}</span>
          {packsOpened > 0 && (
            <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }}
              title={`${fmtMoney(ripValue)} pulled vs ${fmtMoney(ripCost)} spent`}>
              💰 Rip {fmtMoney(ripValue)} <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)})</span>
            </span>
          )}
          {product?.bonus && <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 13%, transparent)', color: 'var(--gold)' }}>🎁 + promo at the end</span>}
          {(phase === 'idle' || phase === 'done') && remainingToOpen >= 2 && (
            <button className="btn alt" style={{ flex: 'none', maxWidth: 190 }} onClick={skipRest}>⏩ Skip rest ({remainingToOpen} left)</button>
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
              {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <b>{set.name}</b>}
              <span className="hint">▶ Click or drag down to rip</span>
            </div>
          </div>
          {!multi && <button className="btn alt" style={{ maxWidth: 160 }} onClick={onExit}>← Back to shop</button>}
        </>
      )}

      {(phase === 'shaking') && (
        <div className="pack-wrap">
          <div className="pack3d shake">
            <div className="foil" />
            {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <b>{set.name}</b>}
          </div>
        </div>
      )}

      {(phase === 'revealing' || phase === 'done') && (
        <>
          {isGod && <div className="godbanner">✨🎉 GOD PACK!! 🎉✨<small>Every card is a hit — one in thousands.</small></div>}
          {isDemigod && <div className="demigodbanner">{(pulls._specialLabel || 'DEMIGOD PACK!')} <small>Most of the pack is a hit.</small></div>}

          {/* TOP — pack-done controls surface here so the next-pack button is up top, not below the cards */}
          {phase === 'done' && (
            <div className="rip-top-actions">
              {multi ? (
                <button className="btn gold" style={{ maxWidth: 220 }} onClick={nextPack}>
                  {last ? (product?.bonus ? 'Open promo & finish →' : 'Finish →') : `Next pack (${packNo + 1}/${totalPacks}) →`}
                </button>
              ) : singleNoReRip ? (
                <button className="btn gold" style={{ maxWidth: 180 }} onClick={onExit}>Done →</button>
              ) : (
                <>
                  {/* Re-rip a single pack. When a paid re-rip path is wired (the shop/Buy
                      flow), route through it so another pack is CHARGED + opened fresh.
                      Without it, fall back to the in-place reset. */}
                  <button
                    className="btn gold"
                    style={{ maxWidth: 200 }}
                    disabled={onRipAnother ? !canRipAnother : false}
                    title={onRipAnother && !canRipAnother ? ripBlockedWhy : ''}
                    onClick={onRipAnother || resetForNext}>
                    Rip another ({onRipAnother && ripAnotherStock > 0
                      ? `📦 ${ripAnotherStock} held`
                      : fmtMoney(onRipAnother && ripAnotherPrice != null ? ripAnotherPrice : packPrice(set))})
                  </button>
                  <button className="btn alt" style={{ flex: 'none', maxWidth: 140 }} onClick={onExit}>Done →</button>
                </>
              )}
              {/* A dead "Rip another" always says why — an empty shelf reads very differently
                  from an empty wallet, and silently greying the button explains neither. */}
              {onRipAnother && !multi && !singleNoReRip && !canRipAnother && (
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0', width: '100%', textAlign: 'center' }}>{ripBlockedWhy}</p>
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
                  value, and opens its full card page on tap. A chase card being teased (auto
                  suspense beat, or the next manual tap) dims the rest of the grid to spotlight it. */}
              {phase === 'revealing' ? (
                /* The reveal itself: you hold the pack as a stack, the current card face-up on top;
                   pull it off to the side to reach the next, with upcoming border edges peeking
                   (a rainbow chase telegraphs itself). When the pack finishes it settles into the grid. */
                <HandReveal pulls={pulls} shown={shown} awaiting={awaiting} revealMode={revealMode}
                  setLogo={set.logo} hasLoupe={hasLoupe} onTapNext={advanceManual} onInspect={setModalCard} />
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
                            <div className="flip-back" aria-hidden="true">{set.logo && <img src={set.logo} alt="" />}</div>
                            <div className="flip-front"><img src={cardImg(c)} alt={c.name} decoding="async" fetchpriority="high" /></div>
                          </div>
                        </HoloCard>
                        <button className="rip-cell-foot" onClick={() => setModalCard(c)} title="Tap for the full card details">
                          <div className="rc-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                          <div className="rc-meta" style={{ color: edge }}>
                            {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : `${c.reverse ? 'Reverse · ' : ''}${c.rarity}`}
                          </div>
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
              )}
              {phase === 'done' && (
                <div className="rip-pack-summary" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, marginBottom: multi ? 4 : 8 }}>
                    Pack value <b style={{ color: 'var(--green)' }}>{fmtMoney(packTotal)}</b>{' '}
                    <span style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      ({profit >= 0 ? '+' : ''}{fmtMoney(profit)} vs {fmtMoney(packPrice(set))} cost)
                    </span>
                  </div>
                  {multi && (
                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                      Rip so far <b style={{ color: 'var(--green)' }}>{fmtMoney(ripValue)}</b>{' '}
                      <span className="muted">across {packsOpened} pack{packsOpened === 1 ? '' : 's'}</span>{' '}
                      <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        ({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)} vs {fmtMoney(ripCost)} spent)
                      </span>
                    </div>
                  )}
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Cards added to your collection. Best pull:{' '}
                    <b style={{ color: rarityColor(best(pulls).rarity) }}>{best(pulls).name}</b> · {fmtMoney(cardValue(best(pulls)))}
                  </p>
                  <p className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>👆 Tap any card for its full details — cut, PSA-if-graded values, and price history.</p>
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

// The reveal, as a hand you riffle through: you hold the whole pack stacked, the current card
// face-up on top, and pull it off to the side to get to the next one. The unseen cards behind it
// peek their border edges — a rainbow-bordered chase (SIR/hyper) telegraphs itself as a rainbow
// sliver before you reach it. Manual: swipe the top card away (tap works too); press-and-hold to
// riffle the stack and peek further ahead. Auto: the same hand advances on the reveal timers.
function HandReveal({ pulls, shown, awaiting, revealMode, setLogo, hasLoupe, onTapNext, onInspect }) {
  const n = pulls.length
  const manual = revealMode === 'manual'
  const canAdvance = manual && awaiting && shown < n
  const curIdx = shown - 1
  const current = curIdx >= 0 ? pulls[curIdx] : null   // face-up card on top of the hand
  const upcoming = pulls.slice(shown)                  // still unseen — only their edges peek
  const seenN = Math.max(0, shown - 1)                 // cards already pulled off to the side
  const UP_MAX = 5, SEEN_MAX = 3
  const DISCARD = 84                                   // px of drag that commits the pull-off

  const [drag, setDrag] = useState(0)                  // live x-offset of the top card (manual drag)
  const [riffle, setRiffle] = useState(false)          // press-and-hold fans the hand to peek ahead
  const g = useRef({ active: false, startX: 0, dx: 0, moved: false, riffled: false, holdT: null })
  const clearHold = () => { if (g.current.holdT) { clearTimeout(g.current.holdT); g.current.holdT = null } }
  const advance = () => { setDrag(0); onTapNext() }
  const onDown = (e) => {
    if (!canAdvance) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older browsers */ }
    g.current = { active: true, startX: e.clientX, dx: 0, moved: false, riffled: false,
      holdT: setTimeout(() => { if (g.current.active && !g.current.moved) { g.current.riffled = true; setRiffle(true) } }, 165) }
  }
  const onMove = (e) => {
    if (!g.current.active) return
    const dx = e.clientX - g.current.startX
    if (!g.current.moved && Math.abs(dx) > 6) { g.current.moved = true; clearHold(); if (g.current.riffled) { g.current.riffled = false; setRiffle(false) } }
    if (g.current.moved) { g.current.dx = dx; setDrag(dx) }
  }
  const onUp = () => {
    if (!g.current.active) return
    clearHold(); g.current.active = false
    const { dx, moved, riffled } = g.current
    if (moved && Math.abs(dx) >= DISCARD) { setDrag(Math.sign(dx) * 560); setTimeout(advance, 170) } // flung → pull off + reveal next
    else if (moved) setDrag(0)          // partial drag → snap back
    else if (riffled) setRiffle(false)  // was a peek-riffle → just close it
    else advance()                      // quick tap → advance (the fallback)
  }
  const onCancel = () => { clearHold(); g.current.active = false; setRiffle(false); setDrag(0) }

  const edgeOf = (c) => c.foil ? c.foil.color : rarityColor(c.rarity)
  return (
    <div className="hand-wrap">
      <div className={`hand-stage ${riffle ? 'riffle' : ''}`}>
        {/* Set aside: the cards you've already pulled off, stacked to the side. */}
        {seenN > 0 && Array.from({ length: Math.min(seenN, SEEN_MAX) }).map((_, k) => (
          <div key={`seen${k}`} className="hand-seen" aria-hidden="true"
            style={{ transform: `translate(calc(-50% - ${92 + k * 5}px), ${30 + k * 3}px) rotate(${-9 - k}deg) scale(.6)`, zIndex: k }}>
            <span className="hand-face back">{setLogo ? <img src={setLogo} alt="" /> : null}</span>
          </div>
        ))}
        {/* The rest of the hand behind the current card — edges peek; a chase border shows rainbow. */}
        {upcoming.slice(0, UP_MAX).map((c, k) => {
          const depth = k + 1
          const teased = !!c.foil || isChase(c) // rainbow/foil border — worth telegraphing
          return (
            <div key={c.uid} className={`hand-up ${teased ? 'teased' : ''}`} aria-hidden="true"
              style={{ transform: `translate(calc(-50% + ${depth * 3}px), ${-depth * (riffle ? 17 : 10)}px) rotate(${depth * 0.8}deg)`,
                       zIndex: 40 - depth, '--rarity': edgeOf(c) }}>
              <span className="hand-face back" />
            </div>
          )
        })}
        {/* The active top card: the face-up current card (or the face-down top before card 1 —
            shown in both modes so the pack reads as a held stack even while auto-revealing). */}
        {(current || upcoming.length > 0) && (
          <button type="button" key={current ? current.uid : 'top-back'}
            className={`hand-current ${current ? '' : 'facedown'} ${drag ? 'dragging' : ''}${current && (current._isHit || current.foil || current._fillsWant) ? ' hit' : ''}${current && isChase(current) ? ' chase' : ''}`}
            style={{ transform: `translate(calc(-50% + ${drag}px), 0) rotate(${drag * 0.03}deg)`, zIndex: 60,
                     '--rarity': current ? edgeOf(current) : 'var(--line)', cursor: canAdvance ? 'grab' : 'default' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
            aria-label={current ? current.name : 'Reveal the first card'}>
            <span className="hand-face">
              {current ? <img src={cardImg(current)} alt={current.name} decoding="async" fetchpriority="high" />
                       : (setLogo ? <img src={setLogo} alt="" className="hand-back-logo" /> : null)}
            </span>
          </button>
        )}
      </div>
      {current && <FanCaption card={current} hasLoupe={hasLoupe} />}
      {canAdvance && (
        <p className="rip-tap-hint">
          {shown === 0 ? '👆 Swipe or tap to reveal your first card'
                       : `👆 Swipe the card away — or tap — for the next (${shown}/${n}) · hold to peek ahead`}
        </p>
      )}
    </div>
  )
}

// The spotlight caption under the fan: names the card that just landed, its rarity/foil + value,
// and its cut read — the "what did I just pull" line, tinted by rarity.
function FanCaption({ card, hasLoupe }) {
  const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
  const cut = !card.grade ? cutEstimate(card, hasLoupe) : null
  return (
    <div className="fan-caption" style={{ '--rarity': edge }}>
      <div className="fan-cap-name">{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
      <div className="fan-cap-meta">
        <span style={{ color: edge, fontWeight: 800 }}>
          {card.foil ? card.foil.label : card.grade ? `PSA ${card.grade.overall}` : `${card.reverse ? 'Reverse · ' : ''}${card.rarity}`}
        </span>
        {' · '}<b style={{ color: 'var(--green)' }}>{fmtMoney(cardValue(card))}</b>
      </div>
      {!card.grade && (
        <div className="fan-cap-psa" title="What this raw card would be worth if it graded">
          💎 PSA 10 <b>{fmtMoney(psaValueAt(card, 10))}</b> · 9 <b>{fmtMoney(psaValueAt(card, 9))}</b>
        </div>
      )}
      {(cut || card._fillsWant) && (
        <div className="fan-cap-badges">
          {cut && <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>👁️ {cut.short}</span>}
          {card._fillsWant && <span className="rc-want">⭐ Fills a want!</span>}
        </div>
      )}
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
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 2px' }}>
          No hits yet — every foil, rare hit, and wanted card lands here as you rip. 🤞
        </p>
      ) : (
        <div className="rip-hits-panel-list">
          {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
            const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
            const cut = !c.grade ? cutEstimate(c, hasLoupe) : null
            return (
              <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}
                onClick={() => onInspect(c)} title="Tap for the full card details">
                <img src={cardImg(c)} alt="" />
                <div className="rip-hit-info">
                  <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                  <div className="rip-hit-meta" style={{ color: edge }}>
                    {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                  </div>
                  {cut && (
                    <span className="rip-cut-pill" style={{ color: cut.color, background: cut.color + '22' }}>
                      👁️ {cut.short}
                    </span>
                  )}
                </div>
                <div className="rip-hit-val">
                  {fmtMoney(cardValue(c))}
                  {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10">💎 {fmtMoney(psa10Value(c))}</div>}
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

