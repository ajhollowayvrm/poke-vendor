import { useState } from 'react'
import { cardValue, rawValue, fmtMoney, GRADING, setNameOfCard, slabLabel } from '../game/engine'
import HiResImg from './HiResImg'
import { gradeLabel, rarityColor } from './CardTile'
import Burst from './Burst'
import { primeAudio, sfxHit, sfxGod, sfxTension } from '../game/feedback'

// The grade-reveal moment: when slabs come back from grading, you don't just get a number in
// a recap — you flip each slab yourself. Tap a face-down slab to reveal its PSA grade with a
// suspense flip; a 10 pops confetti, a 9 shimmers. This is the payoff for the grading gamble.
export default function GradeReveal({ cards, onDone }) {
  const [revealed, setRevealed] = useState(() => new Set())
  const [burst, setBurst] = useState(false)
  const allRevealed = revealed.size >= cards.length

  function fireFor(grade) {
    if (grade >= 10) { setBurst(true); sfxGod(); setTimeout(() => setBurst(false), 2400) }
    else if (grade >= 9) { setBurst(true); sfxHit(3, true); setTimeout(() => setBurst(false), 1400) }
    else if (grade >= 7) sfxHit(1, false)
    else sfxTension()
  }
  function reveal(card) {
    if (revealed.has(card.uid)) return
    primeAudio()
    setRevealed(r => { const n = new Set(r); n.add(card.uid); return n })
    fireFor(card.grade.overall)
  }
  function revealAll() {
    primeAudio()
    setRevealed(new Set(cards.map(c => c.uid)))
    const best = cards.reduce((m, c) => Math.max(m, c.grade.overall), 0)
    fireFor(best)
  }

  return (
    <div className="modalbg grade-reveal-bg" style={{ zIndex: 45 }}>
      {burst && <Burst />}
      <div className="modal grade-reveal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 2 }}>🔬 Back from grading!</h2>
        <p className="cap t-sm" style={{ textAlign: 'center', marginTop: 0 }}>
          {cards.length} slab{cards.length > 1 ? 's' : ''} just arrived. <b>Tap each one</b> to reveal its grade.
        </p>

        <div className="grade-reveal-grid">
          {cards.map(card => {
            const g = card.grade
            const isRevealed = revealed.has(card.uid)
            const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
            const gain = round(cardValue(card) - rawValue(card))
            return (
              <button key={card.uid} className={`grade-reveal-card ${isRevealed ? 'flipped' : ''} grade-${g.overall} ${g.overall >= 10 ? 'gem' : ''}`}
                style={{ '--rarity': edge }} onClick={() => reveal(card)} aria-label={isRevealed ? `${card.name} graded ${slabLabel(g)}` : 'Reveal slab'}>
                <div className="gr-flip">
                  {/* face-down: sealed grading return */}
                  <div className="gr-back">
                    <div className="gr-back-brand">PSA</div>
                    <div className="gr-back-q">?</div>
                    <div className="gr-back-name">{card.name}{setNameOfCard(card) ? ` · ${setNameOfCard(card)}` : ''}</div>
                    <div className="gr-back-hint">tap to reveal</div>
                  </div>
                  {/* revealed: the graded slab */}
                  <div className={`gr-front cardtile slab grade-${g.overall} ${g.overall >= 10 ? 'slab-gem' : ''}`}>
                    <div className="slab-shine" aria-hidden="true" />
                    <div className="slab-label">
                      <div className="slab-brand">PSA</div>
                      <div className="slab-grade"><b>{g.overall}</b><span>{gradeLabel(g.overall)}</span></div>
                      <div className="slab-cert">{card.name}{setNameOfCard(card) ? ` · ${setNameOfCard(card)}` : ''}</div>
                    </div>
                    <div className="slab-window"><HiResImg card={card} alt={card.name} decoding="async" /></div>
                    <div className="gr-val">
                      {fmtMoney(cardValue(card))}
                      {gain > 0.5 && <span className="gr-gain"> ▲{fmtMoney(gain)}</span>}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          {!allRevealed && (
            <button className="btn alt btn-fixed" style={{ maxWidth: 160 }} onClick={revealAll}>👁 Reveal all</button>
          )}
          <button className="btn gold btn-fixed" style={{ maxWidth: 200 }} onClick={onDone}>
            {allRevealed ? 'Continue →' : 'Skip & continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function round(n) { return Math.round(n * 100) / 100 }
