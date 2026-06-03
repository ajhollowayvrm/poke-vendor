import { useEffect, useRef, useState } from 'react'
import { openPack, isHit, cardValue, packPrice, fmtMoney } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'

// Phases: idle -> shaking -> revealing -> done
export default function PackOpening({ set, onExit }) {
  const [phase, setPhase] = useState('idle')
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
  const [burst, setBurst] = useState(false)
  const [isGod, setIsGod] = useState(false)
  const addPulls = useGame(s => s.addPulls)
  const committed = useRef(false)

  function rip() {
    if (phase !== 'idle') return
    const cards = openPack(set)
    cards.forEach(c => { c._isHit = isHit(c) })
    const god = !!cards._god
    setIsGod(god)
    setPulls(cards)
    setPhase('shaking')
    // god pack shakes longer for suspense
    setTimeout(() => { setPhase('revealing'); revealNext(cards, 0) }, god ? 1500 : 900)
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
    if (special) { setBurst(true); setTimeout(() => setBurst(false), 1200) }
    const delay = special ? 1100 : 520
    setTimeout(() => revealNext(cards, i + 1), delay)
  }

  const packTotal = pulls.reduce((a, c) => a + cardValue(c), 0)
  const profit = packTotal - packPrice(set)

  return (
    <div className="stage">
      {burst && <Burst />}
      {phase === 'idle' && (
        <>
          <div className="pack-wrap">
            <div className="pack3d" onClick={rip}>
              <div className="foil" />
              {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <b>{set.name}</b>}
              <span className="hint">▶ Click to rip</span>
            </div>
          </div>
          <button className="btn alt" style={{maxWidth:160}} onClick={onExit}>← Back to shop</button>
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
          <div className={`reveal-row ${isGod ? 'god' : ''}`}>
            {pulls.map((c, i) => (
              <HoloCard key={c.uid} card={c} className={`reveal-card ${i < shown ? 'shown' : ''} ${(c._isHit||c.foil) ? 'hit' : ''}`}>
                <img src={c.img} alt={c.name} />
              </HoloCard>
            ))}
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
                <button className="btn gold" style={{maxWidth:180}} onClick={() => { committed.current=false; setPhase('idle'); setShown(0); setPulls([]); setIsGod(false) }}>
                  Rip another ({fmtMoney(packPrice(set))})
                </button>
                <button className="btn alt" style={{maxWidth:160}} onClick={onExit}>Done →</button>
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
