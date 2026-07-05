import { Component } from 'react'

const SAVE_KEY = 'poke-vendor-save'

// Last line of defense: a render/effect crash anywhere in the tree used to white-screen
// the PWA with no way back. The save in localStorage is almost always fine — the crash is
// in code, not data — so tell the player that, offer a reload, and offer a one-tap backup
// download of the raw save blob so nothing is ever unrecoverable.
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
    const blob = localStorage.getItem(SAVE_KEY)
    if (!blob) return
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `poke-vendor-save-backup-${new Date().toISOString().slice(0, 10)}.json`
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
