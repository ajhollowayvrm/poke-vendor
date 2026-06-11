import { useState } from 'react'
import { refreshPrices, FETCHED_AT, SETS } from '../game/engine'
import { useGame } from '../game/store'
import Account from './Account'

const RIP_SPEEDS = [
  { v: 0.5, label: 'Slow' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Fast' }, { v: 4, label: 'Turbo' },
]

export default function Settings() {
  const reset = useGame(s => s.reset)
  const log = useGame(s => s.log)
  const onPricesRefreshed = useGame(s => s.onPricesRefreshed)
  const openSealedOneByOne = useGame(s => s.settings.openSealedOneByOne)
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const ripOnBuy = useGame(s => s.settings.ripOnBuy ?? false)
  const setSetting = useGame(s => s.setSetting)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function doRefresh() {
    if (status === 'running') return
    setStatus('running'); setResult(null); setProgress(null)
    try {
      const r = await refreshPrices(p => setProgress(p))
      if (r.marketReset) onPricesRefreshed() // a fresh snapshot resets the living-market drift
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
      <h3 style={{ margin: '4px 0 4px' }}>Account &amp; cloud save</h3>
      <Account />

      <h3 style={{ margin: '18px 0 4px' }}>Gameplay</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        How sealed product with multiple packs (booster boxes, bundles, ETBs…) opens.
      </p>
      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Open multi-pack product one pack at a time</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {openSealedOneByOne
              ? 'On — each pack rips with the full animation; you can fast-forward the rest anytime.'
              : 'Off — the whole box rips instantly into your collection (faster).'}
          </div>
        </div>
        <button className={`btn ${openSealedOneByOne ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={openSealedOneByOne}
          onClick={() => setSetting('openSealedOneByOne', !openSealedOneByOne)}>
          {openSealedOneByOne ? 'On' : 'Off'}
        </button>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Rip speed</div>
          <div className="muted" style={{ fontSize: 12 }}>How fast cards reveal during the animated rip.</div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          {RIP_SPEEDS.map(s => (
            <button key={s.v} className={`segbtn ${ripSpeed === s.v ? 'on' : ''}`}
              onClick={() => setSetting('ripSpeed', s.v)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Auto-rip</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {autoAdvance
              ? 'On — once a rip is underway it auto-starts each reveal, and (in one-at-a-time mode) rolls through the rest of a box for you. Pacing only — it doesn’t change where a buy goes.'
              : 'Off — you click to start each reveal yourself.'}
          </div>
        </div>
        <button className={`btn ${autoAdvance ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={autoAdvance}
          onClick={() => setSetting('autoAdvance', !autoAdvance)}>
          {autoAdvance ? 'On' : 'Off'}
        </button>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Rip on buy</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {ripOnBuy
              ? 'On — buying sealed rips it immediately instead of stocking it. You skip the 📦 Inventory step.'
              : 'Off — buying sealed stocks it into your 📦 Inventory to rip, list, or flip later.'}
          </div>
        </div>
        <button className={`btn ${ripOnBuy ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={ripOnBuy}
          onClick={() => setSetting('ripOnBuy', !ripOnBuy)}>
          {ripOnBuy ? 'On' : 'Off'}
        </button>
      </div>

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

      <h3 style={{ margin: '18px 0 4px' }}>Save</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Progress auto-saves to this browser. Resetting wipes cash, collection, notoriety, and upgrades.</p>
      <button className="btn alt" style={{ maxWidth: 200 }}
        onClick={() => { if (confirm('Reset all progress? This wipes your save.')) reset() }}>
        Reset save
      </button>
    </>
  )
}
