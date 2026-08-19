import { Component } from 'react'
import { flushSaveWrite, currentSaveBlob } from '../game/store'
import { nativeSaveFile } from '../game/native'

// Last line of defense: a render/effect crash anywhere in the tree used to white-screen
// the PWA with no way back. The saved game is almost always fine — the crash is in code,
// not data — so tell the player that, offer a reload, and offer a one-tap backup download
// of the raw save blob so nothing is ever unrecoverable.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('PokeVendor crashed:', error, info?.componentStack)
  }
  downloadSave = () => {
    try { flushSaveWrite() } catch {} // persist writes are debounced — capture the latest
    // Read the in-memory mirror, not the store: the save lives in IndexedDB now, and a crash
    // screen can't await anything. The mirror is set the moment persist serializes, so it is
    // if anything FRESHER than what's on disk.
    const blob = currentSaveBlob()
    if (!blob) return
    const name = `poke-vendor-save-backup-${new Date().toISOString().slice(0, 10)}.json`
    // `a.download` with a blob URL is INERT in a WKWebView — the click lands, nothing happens, and
    // there is no error to notice. That is bad anywhere and worst here, because this button is the
    // escape hatch on the crash screen. In the shell it goes to the system share sheet instead.
    if (nativeSaveFile(name, blob)) return
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  render() {
    if (!this.state.error) return this.props.children
    const msg = String(this.state.error?.message || this.state.error)
    return (
      <div style={{ maxWidth: 480, margin: '15vh auto 0', padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>💥</div>
        <h2 style={{ margin: '10px 0 6px' }}>Something crashed</h2>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 4px' }}>
          Your save is still safe in this browser — this is a bug in the game, not your data.
        </p>
        <p className="muted" style={{ fontSize: 11.5, wordBreak: 'break-word', margin: '0 0 16px' }}>{msg}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn gold" style={{ flex: 'none', maxWidth: 160 }}
            onClick={() => location.reload()}>Reload the game</button>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 200 }}
            onClick={this.downloadSave}>Download save backup</button>
        </div>
      </div>
    )
  }
}
