import { useState } from 'react'
import { refreshPrices, FETCHED_AT, SETS } from '../game/engine'
import { useGame } from '../game/store'

export default function Settings() {
  const reset = useGame(s => s.reset)
  const log = useGame(s => s.log)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function doRefresh() {
    if (status === 'running') return
    setStatus('running'); setResult(null); setProgress(null)
    try {
      const r = await refreshPrices(p => setProgress(p))
      setResult(r)
      setLastRefreshed(r.fetchedAt)
      setStatus('done')
      log('refresh', `Refreshed prices — ${r.updated} cards updated`, 0)
    } catch (e) {
      setResult({ error: e.message || 'Network error' })
      setStatus('error')
    }
  }

  const built = new Date(FETCHED_AT)

  return (
    <>
      <h3 style={{ margin: '18px 0 4px' }}>Card prices</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Pull the latest TCGplayer market prices for all {SETS.length} loaded sets, live from pokemontcg.io.
        Updates values across the shop, your collection, vendor booths, and offers. No rebuild needed.
      </p>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Market prices</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Bundled snapshot from {built.toLocaleDateString()}
            {lastRefreshed && <> · last refreshed {new Date(lastRefreshed).toLocaleTimeString()}</>}
          </div>
          {status === 'running' && progress && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Fetching {progress.setName}… ({progress.index + 1}/{progress.count})
            </div>
          )}
          {status === 'done' && result && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--green)' }}>
              ✓ Updated {result.updated} of {result.total} cards.
            </div>
          )}
          {status === 'error' && result?.error && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--red)' }}>
              Couldn't refresh: {result.error}
            </div>
          )}
        </div>
        <button className="btn gold" style={{ flex: 'none', maxWidth: 180 }} disabled={status === 'running'} onClick={doRefresh}>
          {status === 'running' ? 'Refreshing…' : '↻ Refresh prices'}
        </button>
      </div>

      <h3 style={{ margin: '28px 0 4px' }}>Save</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Progress auto-saves to this browser. Resetting wipes cash, collection, notoriety, and upgrades.</p>
      <button className="btn alt" style={{ maxWidth: 200 }}
        onClick={() => { if (confirm('Reset all progress? This wipes your save.')) reset() }}>
        Reset save
      </button>
    </>
  )
}
