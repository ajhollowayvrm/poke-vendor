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
export function Collapse({ id, head, hint, badge, defaultOpen = false, className = 'wants', headClass = 'wants-head', style, children }) {
  const [open, toggle] = useOpen(`pv-col-${id}`, defaultOpen)
  return (
    <div className={className} style={style}>
      <div className={headClass} role="button" tabIndex={0} aria-expanded={open}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}
        onClick={toggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
        <span>{head}</span>
        {badge != null && badge !== '' && <span className="pill" style={{ fontWeight: 600, fontSize: 12 }}>{badge}</span>}
        {open && hint && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{hint}</span>}
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && children}
    </div>
  )
}
