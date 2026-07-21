import { useEffect, useRef } from 'react'

// Shared modal shell: backdrop + centered panel with real dialog semantics that the
// hand-rolled bare-div modals never had — role="dialog", aria-modal, Escape to close,
// initial focus moved into the dialog, focus restored to the trigger on close, and a
// focus trap so Tab can't wander behind the backdrop. Backdrop click closes unless
// `dismissable={false}` (e.g. a forced choice). `labelledBy`/`label` name it for a11y.
//
// Styling reuses the existing .modalbg / .modal classes so every migrated modal looks
// identical to before — this only adds behavior. Pass className/style/maxWidth to tune.
export function Modal({ children, onClose, dismissable = true, label, labelledBy,
  className = '', style, maxWidth = 460, zIndex }) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    restoreRef.current = document.activeElement
    // Move focus into the dialog (first focusable, else the panel itself).
    const panel = panelRef.current
    const focusable = panel?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ;(focusable || panel)?.focus?.()
    function onKey(e) {
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
      restoreRef.current?.focus?.() // restore focus to whatever opened the modal
    }
  }, [onClose, dismissable])

  return (
    <div className="modalbg" style={zIndex != null ? { zIndex } : undefined}
      onClick={dismissable ? onClose : undefined}>
      <div ref={panelRef} className={`modal ${className}`.trim()} onClick={e => e.stopPropagation()}
        style={{ maxWidth, ...style }} role="dialog" aria-modal="true"
        aria-label={label} aria-labelledby={labelledBy} tabIndex={-1}>
        {dismissable && <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>}
        {children}
      </div>
    </div>
  )
}
