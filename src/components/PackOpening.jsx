import { useEffect, useRef, useState } from 'react'
import { openPack, openProduct, makeProductPromo, isHit, cardValue, psa10Value, packPrice, fmtMoney, rarityRank, preloadCardImages } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'
import Burst from './Burst'

// Opens sealed product with the animated rip. For a single booster this rips one
// pack. For a multi-pack product (when "open one at a time" is on) it rips each
// pack in sequence — "Pack 3 of 9" — and you can fast-forward the rest anytime.
// Phases: idle -> shaking -> revealing -> done (per pack) -> finished (whole product)
export default function PackOpening({ set, product, onExit, singleNoReRip = false }) {
  const totalPacks = product?.packs ?? 1
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const [packNo, setPackNo] = useState(1)        // 1-based, which pack we're on
  const [phase, setPhase] = useState('idle')
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
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
  const committed = useRef(false)
  const autoRipped = useRef(false)                 // did we already auto-rip the current idle pack?
  const speed = Math.max(0.25, ripSpeed)           // guard against absurd values
  const ms = (n) => n / speed                      // scale a delay by rip speed

  const last = packNo >= totalPacks

  function rip() {
    if (phase !== 'idle') return
    const cards = openPack(set)
    preloadCardImages(cards) // warm the CDN cache so cards don't pop in slowly mid-reveal
    cards.forEach(c => { c._isHit = isHit(c) })
    const god = !!cards._god
    const demigod = !!cards._demigod
    setIsGod(god)
    setIsDemigod(demigod)
    setCurrent(null)
    setPulls(cards)
    setPhase('shaking')
    setTimeout(() => { setPhase('revealing'); revealNext(cards, 0) }, ms(god ? 1500 : demigod ? 1200 : 900))
  }

  function revealNext(cards, i) {
    if (i >= cards.length) {
      if (!committed.current) {
        committed.current = true
        addPulls(cards, set.name)
        // fold this pack into the running rip tally (value-per-rip)
        setRipValue(v => v + cards.reduce((a, c) => a + cardValue(c), 0))
        setPacksOpened(n => n + 1)
      }
      if (cards._god) { setBurst(true); setTimeout(() => setBurst(false), 3000) } // big finale
      else if (cards._demigod) { setBurst(true); setTimeout(() => setBurst(false), 1800) }
      setPhase('done'); return
    }
    setShown(i + 1)
    const c = cards[i]
    const special = c._isHit || c.foil
    if (special) { setBurst(true); setTimeout(() => setBurst(false), ms(1200)) }
    // Side callout: name every card as it lands, and accumulate hits/foils.
    setCurrent(c)
    if (special) setHits(h => [c, ...h])
    const delay = special ? 1100 : 520
    setTimeout(() => revealNext(cards, i + 1), ms(delay))
  }

  // Reset reveal state for the next pack in the sequence.
  // Keeps `hits` — they accumulate across the whole product, not per pack.
  function resetForNext() {
    committed.current = false
    autoRipped.current = false
    setPhase('idle'); setShown(0); setPulls([]); setIsGod(false); setIsDemigod(false); setCurrent(null)
  }

  // Move to the next pack (or finish if that was the last one).
  function nextPack() {
    if (last) { addBonusAndFinish(); return }
    setPackNo(n => n + 1)
    resetForNext()
  }

  // Auto-advance: in one-by-one mode, after a pack finishes wait ~3s then move on;
  // when that lands us on a fresh idle pack, auto-rip it. The user can still click
  // through manually — any manual nextPack/rip just pre-empts the timer.
  useEffect(() => {
    if (!autoAdvance || totalPacks <= 1) return
    if (phase === 'done' && !last) {
      const t = setTimeout(() => nextPack(), ms(3000))
      return () => clearTimeout(t)
    }
    if (phase === 'idle' && packNo > 1 && !autoRipped.current) {
      autoRipped.current = true
      const t = setTimeout(() => rip(), ms(600))
      return () => clearTimeout(t)
    }
  }, [phase, packNo, autoAdvance, last, totalPacks, speed])

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
    fast.forEach(c => { c._isHit = isHit(c) })
    if (fast.length) addPulls(fast, set.name, remaining)
    setExtra(e => [...e, ...fast])
    // fold the fast-forwarded packs into the running rip tally
    setRipValue(v => v + fast.reduce((a, c) => a + cardValue(c), 0))
    setPacksOpened(n => n + remaining)
    const fastHits = fast.filter(c => c._isHit || c.foil)
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
              {hits.length ? `Hits (${hits.length})` : 'Hits'}
            </div>
            {hits.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>No hits this time — better luck next rip. 🤞</p>
            ) : (
              <div className="rip-summary-hits-grid">
                {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  return (
                    <div key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}>
                      <img src={c.img} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>
                          {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                        </div>
                      </div>
                      <div className="rip-hit-val">
                        {fmtMoney(cardValue(c))}
                        {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10">💎 {fmtMoney(psa10Value(c))}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn gold" style={{ maxWidth: 200 }} onClick={onExit}>Done →</button>
          </div>
        </div>
      </div>
    )
  }

  const packTotal = pulls.reduce((a, c) => a + cardValue(c), 0)
  const profit = packTotal - packPrice(set)
  const multi = totalPacks > 1
  // packs still un-opened: the current one counts only while it's idle (not yet ripped)
  const remainingToOpen = totalPacks - packNo + (phase === 'idle' ? 1 : 0)

  return (
    <div className="stage">
      {burst && <Burst />}

      {multi && (
        <div className="pack-progress">
          <span className="pill" style={{ background: '#3b6cff22', color: '#9db8ff' }}>📦 Pack {packNo} of {totalPacks}</span>
          {packsOpened > 0 && (
            <span className="pill" style={{ background: '#36d39922', color: 'var(--green)' }}
              title={`${fmtMoney(ripValue)} pulled vs ${fmtMoney(ripCost)} spent`}>
              💰 Rip {fmtMoney(ripValue)} <span style={{ color: ripProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>({ripProfit >= 0 ? '+' : ''}{fmtMoney(ripProfit)})</span>
            </span>
          )}
          {product?.bonus && <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>🎁 + promo at the end</span>}
          {(phase === 'idle' || phase === 'done') && remainingToOpen >= 2 && (
            <button className="btn alt" style={{ flex: 'none', maxWidth: 190 }} onClick={skipRest}>⏩ Skip rest ({remainingToOpen} left)</button>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <>
          <div className="pack-wrap">
            <div className="pack3d" onClick={rip} role="button" tabIndex={0} aria-label="Rip the pack"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rip() } }}>
              <div className="foil" />
              {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <b>{set.name}</b>}
              <span className="hint">▶ Click to rip</span>
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
                  <button className="btn gold" style={{ maxWidth: 190 }} onClick={resetForNext}>
                    Rip another ({fmtMoney(packPrice(set))})
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
              <div className={`reveal-row ${isGod ? 'god' : isDemigod ? 'demigod' : ''}`}>
                {pulls.map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  const chase = c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare')
                  return (
                    <HoloCard key={c.uid} card={c} extraStyle={{ '--rarity': edge }}
                      className={`reveal-card ${i < shown ? 'shown' : ''} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                      <img src={c.img} alt={c.name} decoding="async" fetchpriority="high" />
                    </HoloCard>
                  )
                })}
              </div>
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
        const showPsa10 = !card.grade && (card._isHit || card.foil)
        return (
          <div className="rip-now-card" style={{ '--rarity': edge }}>
            <img src={card.img} alt={card.name} decoding="async" fetchpriority="high" />
            <div className="rip-now-name">{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
            <div className="rip-now-meta" style={{ color: edge }}>{label}</div>
            <div className="rip-now-val">{fmtMoney(cardValue(card))}</div>
            {showPsa10 && (
              <div className="rip-now-psa10" title="What this card would be worth graded PSA 10">
                💎 PSA 10 <b>{fmtMoney(psa10Value(card))}</b>
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
  return (
    <aside className="rip-side rip-hits rip-hits-top">
      <div className="rip-side-head">Hits {hits.length ? `(${hits.length})` : ''}</div>
      {hits.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No hits yet — fingers crossed. 🤞</div>
      ) : (
        <div className="rip-hits-list">
          {[...hits].sort((a, b) => cardValue(b) - cardValue(a)).map((c, i) => {
            const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
            return (
              <div key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }}>
                <img src={c.img} alt="" />
                <div className="rip-hit-info">
                  <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                  <div className="rip-hit-meta" style={{ color: edge }}>
                    {c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}
                  </div>
                </div>
                <div className="rip-hit-val">
                  {fmtMoney(cardValue(c))}
                  {!c.grade && <div className="rip-hit-psa10" title="Value if graded PSA 10">💎 {fmtMoney(psa10Value(c))}</div>}
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

