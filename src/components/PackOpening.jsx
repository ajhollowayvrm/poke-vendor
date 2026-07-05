import { useEffect, useMemo, useRef, useState } from 'react'
import { openPack, openProduct, makeProductPromo, isHit, cardValue, psa10Value, psaValueAt, packPrice, fmtMoney, rarityRank, preloadCardImages, HIT_THRESHOLD, cardImg } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
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
export default function PackOpening({ set, product, onExit, singleNoReRip = false, onRipAnother, canRipAnother = false, ripAnotherPrice, ripAnotherStock = 0, paused = false }) {
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
  const [current, setCurrent] = useState(null)    // the card being revealed right now (side callout)
  const [hits, setHits] = useState([])            // every hit/foil pulled this whole rip (right list)
  const [finished, setFinished] = useState(false) // whole product done
  const [extra, setExtra] = useState([])          // promo + fast-forwarded packs (for the summary)
  const [ripValue, setRipValue] = useState(0)     // cumulative card value across the WHOLE rip
  const [packsOpened, setPacksOpened] = useState(0) // how many packs we've fully opened this rip
  const addPulls = useGame(s => s.addPulls)
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

  const last = packNo >= totalPacks

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
    setCurrent(null)
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
    setCurrent(c) // side callout names every card as it lands
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
    setPhase('idle'); setShown(0); setPulls([]); setIsGod(false); setIsDemigod(false); setCurrent(null)
    setAwaiting(false); setSuspenseIdx(-1); setTear(0)
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
                  return (
                    <div key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}>
                      <img src={cardImg(c)} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>
                          {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                        </div>
                      </div>
                      <div className="rip-hit-val">
                        {fmtMoney(cardValue(c))}
                        {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10 / PSA 9">💎 10 {fmtMoney(psaValueAt(c, 10))} · 9 {fmtMoney(psaValueAt(c, 9))}</div>}
                        {c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            {onRipAnother && (
              <button
                className="btn gold"
                style={{ maxWidth: 220 }}
                disabled={!canRipAnother}
                title={canRipAnother ? '' : 'Not enough cash'}
                onClick={onRipAnother}>
                {/* Held stock rips free (already paid) — only an empty 📦 shows a price */}
                Rip another{ripAnotherStock > 0 ? ` (📦 ${ripAnotherStock} held)` : ripAnotherPrice != null ? ` (${fmtMoney(ripAnotherPrice)})` : ''} ↻
              </button>
            )}
            <button className={`btn ${onRipAnother ? 'alt' : 'gold'}`} style={{ maxWidth: 200 }} onClick={onExit}>Done →</button>
          </div>
          {onRipAnother && !canRipAnother && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Not enough cash to rip another.</p>
          )}
        </div>
      </div>
    )
  }

  const packTotal = pulls.reduce((a, c) => a + cardValue(c), 0)
  const profit = packTotal - packPrice(set)
  const multi = totalPacks > 1
  // packs still un-opened: the current one counts only while it's idle (not yet ripped)
  const remainingToOpen = totalPacks - packNo + (phase === 'idle' ? 1 : 0)
  // manual mode: is the next card to flip a chase? (drives the spotlight + tap hint)
  const nextCard = pulls[shown]
  const nextIsChase = phase === 'revealing' && awaiting && !!nextCard && isChase(nextCard)

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
                    title={onRipAnother && !canRipAnother ? 'Not enough cash' : ''}
                    onClick={onRipAnother || resetForNext}>
                    Rip another ({onRipAnother && ripAnotherStock > 0
                      ? `📦 ${ripAnotherStock} held`
                      : fmtMoney(onRipAnother && ripAnotherPrice != null ? ripAnotherPrice : packPrice(set))})
                  </button>
                  <button className="btn alt" style={{ flex: 'none', maxWidth: 140 }} onClick={onExit}>Done →</button>
                </>
              )}
            </div>
          )}

          {/* TOP — running list of hits for the whole rip (horizontal strip above the reveal) */}
          <HitList hits={hits} />

          <div className="rip-layout">
            {/* LEFT — live callout naming every card as it reveals */}
            <NowRevealing card={current} />

            {/* CENTER — the reveal row + pack-value summary */}
            <div className="rip-center">
              {/* a chase card being teased (auto suspense beat, or the next manual tap)
                  dims the rest of the row to spotlight it */}
              <div className={`reveal-row ${isGod ? 'god' : isDemigod ? 'demigod' : ''} ${(suspenseIdx >= 0 || nextIsChase) ? 'focus' : ''}`}>
                {pulls.map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  const chase = isChase(c)
                  const isShown = i < shown
                  const isNext = phase === 'revealing' && awaiting && i === shown // the card a manual tap will flip
                  const peek = chase && (suspenseIdx === i || isNext)
                  return (
                    <HoloCard key={c.uid} card={c} interactive={isShown}
                      onClick={isNext ? advanceManual : undefined}
                      extraStyle={{ '--rarity': edge }}
                      className={`reveal-card ${isShown ? 'shown' : 'facedown'} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''} ${peek ? 'peek' : ''} ${isNext ? 'tappable' : ''}`}>
                      <div className="flip">
                        <div className="flip-back" aria-hidden="true">{set.logo && <img src={set.logo} alt="" />}</div>
                        {/* decoding="async": never decode on the main thread mid-flip —
                            a sync decode here stalls the compositor and leaves cards frozen
                            face-down mid-reveal. preloadCardImages() already warms the decoded
                            bitmap (img.decode()), so the front still paints whole and instant. */}
                        <div className="flip-front"><img src={cardImg(c)} alt={isShown ? c.name : ''} decoding="async" fetchpriority="high" /></div>
                      </div>
                    </HoloCard>
                  )
                })}
              </div>
              {phase === 'revealing' && awaiting && (
                <p className="rip-tap-hint">👆 Tap the {nextIsChase ? 'glowing ' : ''}card to reveal it</p>
              )}
              {phase === 'done' && (
                <div style={{ textAlign: 'center' }}>
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
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Left-side callout: names the card currently being revealed, tinted by rarity.
function NowRevealing({ card }) {
  return (
    <aside className="rip-side rip-now">
      <div className="rip-side-head">Now revealing</div>
      {card ? (() => {
        const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
        const label = card.foil ? card.foil.label
          : card.grade ? `PSA ${card.grade.overall} · ${card.rarity}`
          : `${card.reverse ? 'Reverse Holo · ' : ''}${card.rarity}`
        return (
          <div className="rip-now-card" style={{ '--rarity': edge }}>
            <img src={cardImg(card)} alt={card.name} decoding="async" fetchpriority="high" />
            <div className="rip-now-name">{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
            <div className="rip-now-meta" style={{ color: edge }}>{label}</div>
            <div className="rip-now-val">{fmtMoney(cardValue(card))}</div>
            {!card.grade && (
              <div className="rip-now-psa10" title="Market value if this card graded PSA 10 / PSA 9">
                💎 PSA 10 <b>{fmtMoney(psaValueAt(card, 10))}</b> · 9 <b>{fmtMoney(psaValueAt(card, 9))}</b>
              </div>
            )}
            {card._fillsWant && (
              <div className="rip-now-want">
                ⭐ Fills a want!
                <div className="rip-now-want-note">
                  {card._wantForum
                    ? `+${Math.round((card._wantPremium - 1) * 100)}% on the forum`
                    : `${card._wantWho} wants this`}
                </div>
              </div>
            )}
          </div>
        )
      })() : <div className="muted" style={{ fontSize: 12 }}>Tearing it open…</div>}
    </aside>
  )
}

// Running tally of every hit/foil pulled this rip — a horizontal strip above the reveal.
function HitList({ hits }) {
  // Count true rarity/foil hits only; wanted cards still render in the list (with their
  // ⭐ badge) but aren't counted as "Hits" so the tally matches the game's hit meaning.
  const hitCount = hits.filter(c => c._isHit || c.foil).length
  return (
    <aside className="rip-side rip-hits rip-hits-top">
      <div className="rip-side-head">Hits {hitCount ? `(${hitCount})` : ''}</div>
      {hits.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No hits yet — fingers crossed. 🤞</div>
      ) : (
        <div className="rip-hits-list">
          {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
            const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
            return (
              <div key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}>
                <img src={cardImg(c)} alt="" />
                <div className="rip-hit-info">
                  <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                  <div className="rip-hit-meta" style={{ color: edge }}>
                    {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                  </div>
                </div>
                <div className="rip-hit-val">
                  {fmtMoney(cardValue(c))}
                  {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10">💎 {fmtMoney(psa10Value(c))}</div>}
                  {c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}

function best(cards) { return cards.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, cards[0]) }

