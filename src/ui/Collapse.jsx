import { useState } from 'react'

// Shared collapsible-section idiom for decluttering dense tabs (esp. mobile).
//
// Sticky open/closed per panel via localStorage — a UI preference, deliberately NOT part
// of the game save (same idiom MarketIntel/StoreStock already used). First-visit default
// comes from the caller; after the first toggle the user's choice wins forever.
export function useOpen(key, dflt) {
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? dflt : v === '1' } catch { return dflt }
  })
  const toggle = () => setOpen(o => { try { localStorage.setItem(key, o ? '0' : '1') } catch { /* private mode */ }; return !o })
  return [open, toggle]
}

// Small screens default secondary panels CLOSED; a desktop can afford them open.
export function bigScreen() {
  try { return window.innerWidth >= 700 } catch { return true }
}

// A collapsible section. The header stays visible with the title and an optional summary
// `badge` (the "what's in here" count/figure, so a closed panel still informs); the muted
// `hint` copy and the children render only while open — closed panels read as one line.
//   id          — stable key for the sticky state (localStorage `pv-col-<id>`)
//   head        — title node (icon + name; keep it short — it's the tap target)
//   hint        — muted explainer, shown only while open (the copy is noise when closed)
//   badge       — always-visible summary chip (string/node); null/'' hides it
//   defaultOpen — first-visit state (pass bigScreen() for "open on desktop only")
//   className / headClass — panel & header styling (defaults match the .wants sections)
//   as          — element for the title text. Defaults to 'h3', because a titled, collapsible
//                 panel IS a section of the page; pass 'span' for the rare one that is not.
//
// On `as`: the app had ZERO h1-h6 elements in the entire document. Every panel title was a styled
// div, so a screen reader got one flat list of generic containers with no way to skim, and the
// screens read flat visually for the same reason — nothing declared a level. Defaulting to h3
// (rather than making 20+ call sites opt in) is what makes that true everywhere at once; the
// heading reset in styles.css means it renders identically to the span it replaced.
//
// STRUCTURE — heading OUTSIDE, button INSIDE. This is the W3C disclosure pattern, and the order
// matters for the reason the whole change exists. The first attempt put the <h3> inside the
// clickable row, which carried role="button" — and `button` is children-presentational in ARIA,
// so the heading was swallowed and heading navigation still found nothing. The markup gained an
// h3 and assistive tech gained nothing.
//
// Wrapping a real <button> in the heading fixes that and pays twice more: a native button gets
// Enter AND Space for free (deleting the hand-rolled role/tabIndex/onKeyDown), and it is a real
// tab stop without being talked into one. The button is width:100% so the whole header row stays
// the tap target it was.
export function Collapse({ id, head, hint, badge, defaultOpen = false, className = 'wants', headClass = 'wants-head', as: Title = 'h3', style, children }) {
  const [open, toggle] = useOpen(`pv-col-${id}`, defaultOpen)
  return (
    <div className={className} style={style}>
      <Title className={headClass}>
        <button type="button" className="collapse-btn" aria-expanded={open} onClick={toggle}>
          <span className="collapse-title">{head}</span>
          {badge != null && badge !== '' && <span className="pill t-xs" style={{ fontWeight: 600 }}>{badge}</span>}
          {open && hint && <span className="cap" style={{ fontWeight: 400 }}>{hint}</span>}
          {/* Decoration only — aria-expanded on the button already states open/closed. Left
              audible it lands in both the button's and the heading's accessible name, so every
              panel announced a trailing "▸" and heading navigation read it out. */}
          <span className="muted collapse-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      </Title>
      {open && children}
    </div>
  )
}
