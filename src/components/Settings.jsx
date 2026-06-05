import { useState } from 'react'
import { refreshPrices, FETCHED_AT, SETS } from '../game/engine'
import { useGame } from '../game/store'

const RIP_SPEEDS = [
  { v: 0.5, label: 'Slow' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Fast' }, { v: 4, label: 'Turbo' },
]
// Real minutes per game-day — the master clock rate. Lower = the world moves faster.
const DAY_LENGTHS = [
  { v: 5, label: '5 min' }, { v: 15, label: '15 min' }, { v: 30, label: '30 min' }, { v: 60, label: '1 hr' },
]

export default function Settings() {
  const reset = useGame(s => s.reset)
  const log = useGame(s => s.log)
  const onPricesRefreshed = useGame(s => s.onPricesRefreshed)
  const openSealedOneByOne = useGame(s => s.settings.openSealedOneByOne)
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const dayMinutes = useGame(s => s.settings.dayMinutes ?? 15)
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
          <div style={{ fontWeight: 700 }}>Day length</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Real time per game-day. The world runs on its own — orders, sales, and grading all
            advance at this rate, even while the app is closed.
          </div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          {DAY_LENGTHS.map(d => (
            <button key={d.v} className={`segbtn ${dayMinutes === d.v ? 'on' : ''}`}
              onClick={() => setSetting('dayMinutes', d.v)}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Auto-open next pack</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {!openSealedOneByOne
              ? 'Only applies in one-at-a-time mode (turn that on above).'
              : autoAdvance
                ? 'On — after a pack finishes it waits a few seconds, then rips the next one for you.'
                : 'Off — you click “Next pack” yourself between packs.'}
          </div>
        </div>
        <button className={`btn ${autoAdvance ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={autoAdvance} disabled={!openSealedOneByOne}
          onClick={() => setSetting('autoAdvance', !autoAdvance)}>
          {autoAdvance ? 'On' : 'Off'}
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
