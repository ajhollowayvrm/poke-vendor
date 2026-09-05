import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Shared modal shell: backdrop + centered panel with real dialog semantics that the
// hand-rolled bare-div modals never had — role="dialog", aria-modal, Escape to close,
// initial focus moved into the dialog, focus restored to the trigger on close, and a
// focus trap so Tab can't wander behind the backdrop. Backdrop click closes unless
// `dismissable={false}` (e.g. a forced choice). `labelledBy`/`label` name it for a11y.
//
// Styling reuses the existing .modalbg / .modal classes so every migrated modal looks
// identical to before — this only adds behavior. Pass className/style/maxWidth to tune.
//
// `sheet`: opt-in phone presentation. On ≤640px the panel rises from the bottom edge as a
// bottom sheet (rounded top, 85dvh cap, safe-area padding); on desktop it stays a normal
// centered modal. Use it for tall content (detail views, pickers), not short confirms.

// --- Layer stack ------------------------------------------------------------
// Modals stack (a booth opens a confirm over a picker over a detail). Every keydown
// listener here is document-capture, so with two Modals mounted BOTH used to see Escape
// and the bottom one — mounted first, listener registered first — closed instead of the
// top. Each layer registers on mount; only the top of the stack answers Escape and owns
// the Tab trap. DialogHost joins the same stack so a pending confirm outranks the modal
// beneath it.
const _layers = []
export function pushLayer(token) { _layers.push(token) }
// How many layers are already open when this one mounts. Every Modal is portalled to <body>,
// so a stacked Modal is a SIBLING of the one beneath it, not a child of it — it no longer
// inherits the parent panel's stacking context, and a literal z-index on it competes directly
// with `--z-modal` (80) on the backdrop below. That is how a booth's "Confirm buy" sheet, which
// carried the local z-index 20 it needed back when it rendered inline, ended up painted BEHIND
// the booth's own backdrop: visible to the accessibility tree, unreachable by a tap. Each layer
// now takes `--z-modal + depth`, so a stacked Modal always outranks its opener by construction
// and no caller has to pick a number. The `zIndex` prop stays for a layer that is deliberately
// somewhere else on the global ladder (GradeReveal sits at --z-reveal, below every modal).
export function layerDepth() { return _layers.length }
export function popLayer(token) {
  const i = _layers.lastIndexOf(token)
  if (i !== -1) _layers.splice(i, 1)
}
export function isTopLayer(token) { return _layers[_layers.length - 1] === token }

export function Modal({ children, onClose, dismissable = true, label, labelledBy,
  className = '', bgClassName = '', style, maxWidth = 460, zIndex, sheet = false }) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  // Read once, at first render: how deep in the modal stack this layer sits. See layerDepth().
  const [depth] = useState(layerDepth)

  useEffect(() => {
    restoreRef.current = document.activeElement
    const token = {}
    pushLayer(token)
    // Move focus onto the PANEL (tabIndex=-1), not the first control. Focusing a control
    // paints a focus ring the moment the dialog opens — on the card page that ringed the
    // artwork itself. The panel is a valid initial target (ARIA dialog pattern); the first
    // Tab lands on the first control and the trap below takes it from there.
    const panel = panelRef.current
    panel?.focus?.()
    function onKey(e) {
      if (!isTopLayer(token)) return // a modal/confirm is stacked above this one — its turn
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); onClose?.() }
      else if (e.key === 'Tab') {
        const items = panel?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!items || !items.length) return
        const list = Array.from(items).filter(el => !el.disabled && el.offsetParent !== null)
        if (!list.length) return
        const first = list[0], last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      popLayer(token)
      restoreRef.current?.focus?.() // restore focus to whatever opened the modal
    }
  }, [onClose, dismissable])

  // Portalled straight to <body> — NOT rendered in place. `.modalbg` is `position:fixed;
  // inset:0`, which is supposed to cover the whole viewport, but a fixed-position element
  // only does that relative to its nearest ancestor that establishes a containing block —
  // and any ancestor with a running (or, on iOS WebKit, even a merely-declared) CSS
  // animation/transition on `transform` counts as one. `.pane` animates in with a
  // translateY on every tab switch, so a modal rendered inline inside it (any tab's own
  // BoothInbox/VendorBooth/ShowFloor popups, all of which live under `.pane`) had its
  // backdrop and sizing computed against `.pane`'s box instead of the real screen: it
  // filled the content area and stopped dead at `.pane`'s bottom edge, which sits right
  // above the bottom nav — so the nav showed through and anything past that edge (a
  // sheet's close button, the last row of a tall grid) was unreachable. Escaping to
  // `document.body` removes `.pane` from the ancestor chain entirely, so `inset:0` means
  // the actual viewport again, regardless of what any future ancestor's CSS does.
  return createPortal(
    <div className={`modalbg ${bgClassName}`.trim()}
      style={{ zIndex: zIndex != null ? zIndex : `calc(var(--z-modal) + ${depth})` }}
      onClick={dismissable ? onClose : undefined}>
      <div ref={panelRef} className={`modal ${sheet ? 'modal-sheet ' : ''}${className}`.trim()} onClick={e => e.stopPropagation()}
        style={{ maxWidth, ...style }} role="dialog" aria-modal="true"
        aria-label={label} aria-labelledby={labelledBy} tabIndex={-1}>
        {dismissable && <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>}
        {children}
      </div>
    </div>,
    document.body
  )
}
