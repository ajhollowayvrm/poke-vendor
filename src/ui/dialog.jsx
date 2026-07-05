import { useEffect, useState } from 'react'

// Imperative in-app confirm dialog — a polished replacement for window.confirm().
// Call `confirmDialog({...})` from anywhere; it returns a Promise<boolean> that
// resolves true (confirmed) or false (cancelled/dismissed). A single <DialogHost/>
// mounted in App renders whatever's pending. No prop-drilling, no extra deps.
let _listener = null
let _current = null

// Push a dialog request. opts: { title, body, confirmText, cancelText, danger }.
export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    _current = {
      title: opts.title || 'Are you sure?',
      body: opts.body || '',
      confirmText: opts.confirmText || 'Confirm',
      cancelText: opts.cancelText || 'Cancel',
      danger: !!opts.danger,
      resolve,
    }
    _listener?.()
  })
}

// Renders the pending confirm dialog (if any). Mount once near the app root.
export function DialogHost() {
  const [, force] = useState(0)
  useEffect(() => { _listener = () => force(n => n + 1); return () => { _listener = null } }, [])
  const d = _current
  // Escape cancels, Enter confirms — keyboard parity with the buttons.
  useEffect(() => {
    if (!d) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false)
      else if (e.key === 'Enter') finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [d])
  if (!d) return null

  function finish(ok) { const r = d.resolve; _current = null; _listener?.(); r(ok) }

  return (
    <div className="modalbg" style={{ zIndex: 100 }} onClick={() => finish(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}
        role="alertdialog" aria-modal="true" aria-label={d.title}>
        <h2 style={{ marginBottom: 6 }}>{d.title}</h2>
        {d.body && <p className="muted" style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{d.body}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className={`btn ${d.danger ? '' : 'gold'}`} style={d.danger ? { background: 'var(--red)', color: '#fff' } : null}
            autoFocus onClick={() => finish(true)}>{d.confirmText}</button>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 140 }} onClick={() => finish(false)}>{d.cancelText}</button>
        </div>
      </div>
    </div>
  )
}

// --- Global toast -----------------------------------------------------------
// A transient bottom-of-screen message, callable from anywhere (replaces the
// informational window.alert() calls). `toast('Saved!')` — auto-dismisses.
// Optional `action` = { label, onClick }: renders a button inside the toast
// (e.g. "↩︎ Undo" on a bulk sale) that runs onClick and dismisses the toast.
let _toastListener = null
let _toasts = []
let _toastSeq = 0
export function toast(message, ms = 3000, action = null) {
  const id = ++_toastSeq
  _toasts = [..._toasts, { id, message, leaving: false, action }]
  _toastListener?.()
  setTimeout(() => dismissToast(id), ms)
}
// Flag the toast as leaving so it plays the exit animation, then remove it once the
// ~260ms toastOut keyframe has finished. Safe to call twice (action click + timer).
function dismissToast(id) {
  const t = _toasts.find(x => x.id === id)
  if (!t || t.leaving) return
  _toasts = _toasts.map(x => x.id === id ? { ...x, leaving: true } : x)
  _toastListener?.()
  setTimeout(() => { _toasts = _toasts.filter(x => x.id !== id); _toastListener?.() }, 260)
}
export function ToastHost() {
  const [, force] = useState(0)
  useEffect(() => { _toastListener = () => force(n => n + 1); return () => { _toastListener = null } }, [])
  if (!_toasts.length) return null
  return (
    <div className="toast-stack">
      {_toasts.map(t => (
        <div key={t.id} className={`toast${t.leaving ? ' leaving' : ''}`} role="status">
          {t.message}
          {t.action && !t.leaving && (
            <button className="toast-action"
              onClick={() => { dismissToast(t.id); t.action.onClick() }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  )
}

// Close a modal on Escape. Pass the close handler; wires/unwires a keydown listener.
// Gives every modal keyboard parity with backdrop-click (CardModal already did this).
export function useModalEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
