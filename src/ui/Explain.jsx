import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalEscape } from './dialog'

// A "?" that reveals an explanation, for prose that is worth reading ONCE.
//
// Every panel in this app opened with a paragraph explaining itself, printed at the same weight
// as the data below it — the credit line spent 44 words above the balance, and the distributor
// shelf spent another. Read once, that copy is genuinely useful. Printed on every
// visit forever, it is what makes a screen read as a wall: the eye cannot tell the thing it needs
// now from the thing it needed the first time.
//
// The pattern is not new — NotorietyHelp (components/FirstRun.jsx) has done exactly this for the
// reputation star since before this file existed, and .noto-help / .noto-pop are its styles. This
// generalises it so a panel does not have to hand-roll the fourth copy.
//
//   <Explain label="How this shelf is priced">…prose…</Explain>
//
// The trigger paints as a 15px dot and taps as 44px (.noto-help::after), so it can sit inline in a
// sentence without becoming the loudest thing in it.
//
// `trigger`: pass a node to make the WHOLE thing the tap target instead of the "?" dot — a
// header chip, a stat pill. The phone has no hover, so any chip that used to explain itself
// through title= wraps itself in an Explain instead. The trigger node must not contain a
// button (the wrapper IS the button).
export function Explain({ label = 'More about this', trigger = null, triggerClass = '', align = 'left', children }) {
  const [open, setOpen] = useState(false)
  const popRef = useRef(null)
  // Clamp the open popover inside the viewport. `align` picks the anchor edge, but a chip in
  // the middle of a wrapped header can push either alignment off-screen on a 440px display —
  // measure once on open and nudge it back inside.
  useEffect(() => {
    if (!open) return
    const el = popRef.current
    if (!el) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    let dx = 0
    if (r.left < 8) dx = 8 - r.left
    else if (r.right > window.innerWidth - 8) dx = (window.innerWidth - 8) - r.right
    if (dx) el.style.transform = `translateX(${dx}px)`
  }, [open])
  // Escape closes it. Without this the ONLY way out is a mouse click on the popover itself — the
  // pattern this generalises (NotorietyHelp) has that gap, and copying a gap into a shared
  // component multiplies it by every future call site.
  useModalEscape(useCallback(() => setOpen(false), []))
  return (
    <span className={`explain-wrap ${align === 'right' ? 'explain-right' : ''}`.trim()}>
      {trigger
        ? <button className={`explain-trigger ${triggerClass}`.trim()} aria-label={label} aria-expanded={open}
            onClick={() => setOpen(o => !o)}>{trigger}</button>
        : <button className="noto-help" aria-label={label} aria-expanded={open}
            onClick={() => setOpen(o => !o)}>?</button>}
      {open && (
        <span ref={popRef} className="noto-pop" role="dialog" aria-label={label} onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  )
}
