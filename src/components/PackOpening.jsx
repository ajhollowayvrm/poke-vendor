import { useEffect, useRef, useState } from 'react'
import { openPack, openProduct, makeProductPromo, isHit, cardValue, packPrice, fmtMoney, rarityRank } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'

// Opens sealed product with the animated rip. For a single booster this rips one
// pack. For a multi-pack product (when "open one at a time" is on) it rips each
// pack in sequence — "Pack 3 of 9" — and you can fast-forward the rest anytime.
// Phases: idle -> shaking -> revealing -> done (per pack) -> finished (whole product)
export default function PackOpening({ set, product, onExit }) {
  const totalPacks = product?.packs ?? 1
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const [packNo, setPackNo] = useState(1)        // 1-based, which pack we're on
  const [phase, setPhase] = useState('idle')
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
  const [burst, setBurst] = useState(false)
  const [isGod, setIsGod] = useState(false)
  const [foilAlert, setFoilAlert] = useState(null) // {label, color} for a Poké/Master Ball callout
  const [finished, setFinished] = useState(false) // whole product done
  const [extra, setExtra] = useState([])          // promo + fast-forwarded packs (for the summary)
  const addPulls = useGame(s => s.addPulls)
  const committed = useRef(false)
  const autoRipped = useRef(false)                 // did we already auto-rip the current idle pack?
  const speed = Math.max(0.25, ripSpeed)           // guard against absurd values
  const ms = (n) => n / speed                      // scale a delay by rip speed

  const last = packNo >= totalPacks

  function rip() {
    if (phase !== 'idle') return
    const cards = openPack(set)
    cards.forEach(c => { c._isHit = isHit(c) })
    const god = !!cards._god
    setIsGod(god)
    setFoilAlert(null)
    setPulls(cards)
    setPhase('shaking')
    setTimeout(() => { setPhase('revealing'); revealNext(cards, 0) }, ms(god ? 1500 : 900))
  }

  function revealNext(cards, i) {
    if (i >= cards.length) {
      if (!committed.current) { committed.current = true; addPulls(cards, set.name) }
      if (cards._god) { setBurst(true); setTimeout(() => setBurst(false), 3000) } // big finale
      setPhase('done'); return
    }
    setShown(i + 1)
    const c = cards[i]
    const special = c._isHit || c.foil
    if (special) { setBurst(true); setTimeout(() => setBurst(false), ms(1200)) }
    // Call out a special-finish pull (Poké Ball / Master Ball) as it lands.
    if (c.foil) setFoilAlert({ label: c.foil.label, badge: c.foil.badge, color: c.foil.color, name: c.name })
    const delay = special ? 1100 : 520
    setTimeout(() => revealNext(cards, i + 1), ms(delay))
  }

  // Reset reveal state for the next pack in the sequence.
  function resetForNext() {
    committed.current = false
    autoRipped.current = false
    setPhase('idle'); setShown(0); setPulls([]); setIsGod(false); setFoilAlert(null)
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
      fast.push(...pack)
    }
    fast.forEach(c => { c._isHit = isHit(c) })
    if (fast.length) addPulls(fast, set.name, remaining)
    setExtra(e => [...e, ...fast])
    addBonusAndFinish()
  }

  if (finished) {
    const promo = extra.find(c => c._promo)
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <h2 style={{ marginBottom: 6 }}>✓ Opened {product?.type || 'pack'} — {set.name}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            All {totalPacks} pack{totalPacks > 1 ? 's' : ''}{promo ? ' + promo' : ''} are in your collection.
          </p>
          {promo && (
            <p className="muted" style={{ fontSize: 13 }}>
              🎁 Bonus promo: <b style={{ color: rarityColor(promo.rarity) }}>{promo.name}</b> · {fmtMoney(cardValue(promo))}
            </p>
          )}
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
          {product?.bonus && <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>🎁 + promo at the end</span>}
          {(phase === 'idle' || phase === 'done') && remainingToOpen >= 2 && (
            <button className="btn alt" style={{ flex: 'none', maxWidth: 190 }} onClick={skipRest}>⏩ Skip rest ({remainingToOpen} left)</button>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <>
          <div className="pack-wrap">
            <div className="pack3d" onClick={rip}>
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
          {foilAlert && !isGod && (
            <div className="foilbanner" style={{ '--foil': foilAlert.color }}>
              {foilAlert.badge} — <b>{foilAlert.name}</b>!
              <small>You pulled a {foilAlert.label} ✨</small>
            </div>
          )}
          <div className={`reveal-row ${isGod ? 'god' : ''}`}>
            {pulls.map((c, i) => {
              const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
              const chase = c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare')
              return (
                <HoloCard key={c.uid} card={c} extraStyle={{ '--rarity': edge }}
                  className={`reveal-card ${i < shown ? 'shown' : ''} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                  <img src={c.img} alt={c.name} />
                </HoloCard>
              )
            })}
          </div>
          {phase === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, marginBottom: 8 }}>
                Pack value <b style={{ color: 'var(--green)' }}>{fmtMoney(packTotal)}</b>{' '}
                <span style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  ({profit >= 0 ? '+' : ''}{fmtMoney(profit)} vs {fmtMoney(packPrice(set))} cost)
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {multi ? (
                  <button className="btn gold" style={{ maxWidth: 200 }} onClick={nextPack}>
                    {last ? (product?.bonus ? 'Open promo & finish →' : 'Finish →') : `Next pack (${packNo + 1}/${totalPacks}) →`}
                  </button>
                ) : (
                  <>
                    <button className="btn gold" style={{ maxWidth: 180 }} onClick={resetForNext}>
                      Rip another ({fmtMoney(packPrice(set))})
                    </button>
                    <button className="btn alt" style={{ maxWidth: 160 }} onClick={onExit}>Done →</button>
                  </>
                )}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Cards added to your collection. Best pull:{' '}
                <b style={{ color: rarityColor(best(pulls).rarity) }}>{best(pulls).name}</b> · {fmtMoney(cardValue(best(pulls)))}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function best(cards) { return cards.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, cards[0]) }

function Burst() {
  const bits = Array.from({ length: 40 })
  return (
    <div className="hitburst">
      {bits.map((_, i) => {
        const left = Math.random() * 100, dur = 1 + Math.random(), delay = Math.random() * 0.2
        const colors = ['#ffcb05', '#ff3df0', '#3b6cff', '#36d399', '#fff']
        return <span key={i} style={{
          position: 'absolute', top: '-10px', left: left + '%', width: 9, height: 9,
          background: colors[i % colors.length], borderRadius: 2,
          animation: `fall ${dur}s ${delay}s ease-in forwards`,
        }} />
      })}
      <style>{`@keyframes fall{to{transform:translateY(105vh) rotate(540deg);opacity:0}}`}</style>
    </div>
  )
}
