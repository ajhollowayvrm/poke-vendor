import { useCallback, useState } from 'react'
import { useModalEscape } from './dialog'

// A "?" that reveals an explanation, for prose that is worth reading ONCE.
//
// Every panel in this app opened with a paragraph explaining itself, printed at the same weight
// as the data below it — the auction house spent 44 words above the lots, the credit line and the
// distributor shelf each spent another. Read once, that copy is genuinely useful. Printed on every
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
export function Explain({ label = 'More about this', children }) {
  const [open, setOpen] = useState(false)
  // Escape closes it. Without this the ONLY way out is a mouse click on the popover itself — the
  // pattern this generalises (NotorietyHelp) has that gap, and copying a gap into a shared
  // component multiplies it by every future call site.
  useModalEscape(useCallback(() => setOpen(false), []))
  return (
    <span className="explain-wrap">
      <button className="noto-help" aria-label={label} title={label} aria-expanded={open}
        onClick={() => setOpen(o => !o)}>?</button>
      {open && (
        <span className="noto-pop" role="dialog" aria-label={label} onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  )
}
