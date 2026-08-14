import { useRef, useState } from 'react'
import { cardValue, psaValueAt, fmtMoney, cutEstimate, cardImg, isChase, slabLabel } from '../game/engine'
import { rarityColor } from './CardTile'

// The reveal, as a hand you riffle through: you hold the whole pack stacked, the current card
// face-up on top, and pull it off to the side to get to the next one. The unseen cards behind it
// peek their border edges — a rainbow-bordered chase (SIR/hyper) telegraphs itself as a rainbow
// sliver before you reach it. Manual: swipe the top card away (tap works too); press-and-hold to
// riffle the stack and peek further ahead. Auto: the same hand advances on the reveal timers.
//
// Shared by the normal rip (PackOpening) and the sift (AutoRip) so the two genuinely ARE the same
// UI — the sift just drives `shown` on a much faster clock, and hands you the controls (manual
// mode) the moment it stops on a pack worth ripping yourself.
export default function HandReveal({ pulls, shown, awaiting, revealMode, setLogo, hasLoupe, onTapNext, onInspect, suspense = false }) {
  const n = pulls.length
  const manual = revealMode === 'manual'
  // `shown === n` still advances: that final tap is what closes the pack out to the summary,
  // so the last card sits there until you're done looking at it (see PackOpening step()).
  const canAdvance = manual && awaiting
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
  // Keyboard advance. The hand is driven by pointer events, so Enter/Space did nothing here even
  // though the sealed pack itself takes both — manual mode was a dead end without a mouse or a
  // touchscreen. preventDefault stops the button's synthesized click from advancing twice.
  const onKey = (e) => {
    if (!canAdvance || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    advance()
  }

  const edgeOf = (c) => c.foil ? c.foil.color : rarityColor(c.rarity)
  return (
    <div className="hand-wrap">
      {/* `suspense` = the very next card is a grail and the beat before it is running. The rest of
          the hand dims and that card's edge glows. The caller owns the timing: auto mode holds it
          for 850ms on a timer, manual mode holds it until you actually tap. */}
      <div className={`hand-stage ${riffle ? 'riffle' : ''} ${suspense ? 'suspense' : ''}`}>
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
          const teased = isChase(c) // rainbow/foil border (IR+ or a special foil) — worth telegraphing
          return (
            <div key={c.uid} className={`hand-up ${teased ? 'teased' : ''} ${suspense && k === 0 ? 'teased-now' : ''}`} aria-hidden="true"
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
            onKeyDown={onKey}
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
            : shown >= n ? `👆 That's the last card (${n}/${n}) — take your time, then tap to close the pack`
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
          {card.foil ? card.foil.label : card.grade ? slabLabel(card.grade) : `${card.reverse ? 'Reverse · ' : ''}${card.rarity}`}
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
