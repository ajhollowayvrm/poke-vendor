import { useState } from 'react'
import { refreshPrices, FETCHED_AT, SETS } from '../game/engine'
import { useGame } from '../game/store'
import { cloudConfigured, disownLocalSave, pushLocalChange } from '../game/cloudSave'
import { currentUser } from '../game/auth'
import { confirmDialog, toast } from '../ui/dialog'
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
  const revealMode = useGame(s => s.settings.revealMode ?? 'auto')
  const sound = useGame(s => s.settings.sound ?? true)
  const haptics = useGame(s => s.settings.haptics ?? true)
  // Deal detector (needs the 🤝 Dealer Network upgrade to actually show tags on the floor).
  const hasNetwork = useGame(s => !!s.upgrades.network)
  const dealMaxMult = useGame(s => s.settings.dealMaxMult ?? 0.85)
  const dealCondition = useGame(s => s.settings.dealCondition ?? 'any')
  const dealUngradedOnly = useGame(s => s.settings.dealUngradedOnly ?? false)
  const dealMinValue = useGame(s => s.settings.dealMinValue ?? 0)
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

  // Reset is cloud-aware. The old flow left auto-sync armed, so 2.5s after a reset the
  // fresh day-1 save was pushed to the cloud — silently destroying the real save on the
  // account (and, at next boot, on every other device). Now: disown the local game FIRST
  // (kills the pending debounce push + ownership, so nothing touches the cloud), then
  // reset, and only wipe the cloud too if that was the explicit choice — via a force
  // push, which the backend snapshots to a restorable #prev backup before honoring.
  async function doReset() {
    const signedIn = cloudConfigured() && !!currentUser()
    const ok = await confirmDialog({
      title: 'Reset all progress?',
      body: signedIn
        ? 'This wipes the game on THIS device — cash, collection, notoriety, upgrades.\n\nNext you’ll choose whether your account’s cloud save is wiped too, or kept.'
        : 'This wipes your save — cash, collection, notoriety, upgrades. There is no undo.',
      confirmText: 'Reset',
      danger: true,
    })
    if (!ok) return
    let wipeCloud = false
    if (signedIn) {
      wipeCloud = await confirmDialog({
        title: 'Wipe the cloud save too?',
        body: 'KEEP CLOUD SAVE — this device starts fresh; your account keeps its current cloud save, and you can load it back anytime from ⚙️ → Account.\n\nWIPE CLOUD TOO — the account starts over as well. The old cloud save is kept as a one-step backup ("Restore previous cloud version" in Account) in case this was a mistake.',
        confirmText: 'Wipe cloud too',
        cancelText: 'Keep cloud save',
        danger: true,
      })
    }
    disownLocalSave() // must run BEFORE reset(): stops auto-sync pushing the fresh save
    reset()
    if (wipeCloud) {
      try {
        await pushLocalChange({ force: true })
        toast('Cloud save wiped — the previous version is restorable from Account.')
      } catch {
        toast('Couldn’t reach the cloud — your cloud save is untouched. Reconnect from ⚙️ → Account.')
      }
    } else if (signedIn) {
      toast('This device is reset. Your cloud save is untouched — load it anytime from ⚙️ → Account.')
    }
  }

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
          <div style={{ fontWeight: 700 }}>Reveal mode</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {revealMode === 'manual'
              ? 'Manual — cards land face-down; tap each one to flip it yourself. The suspense of the last card is in your hands.'
              : 'Auto — cards flip on their own, best card last. Chase pulls get a suspense beat.'}
          </div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          <button className={`segbtn ${revealMode === 'auto' ? 'on' : ''}`} onClick={() => setSetting('revealMode', 'auto')}>Auto</button>
          <button className={`segbtn ${revealMode === 'manual' ? 'on' : ''}`} onClick={() => setSetting('revealMode', 'manual')}>Manual</button>
        </div>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Rip speed</div>
          <div className="muted" style={{ fontSize: 12 }}>How fast cards reveal during the animated rip{revealMode === 'manual' ? ' (auto mode only)' : ''}.</div>
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
          <div style={{ fontWeight: 700 }}>Rip sound effects</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {sound
              ? 'On — pack tear, card flips, and a rising chime on hits (pitched to rarity).'
              : 'Off — the rip is silent.'}
          </div>
        </div>
        <button className={`btn ${sound ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={sound}
          onClick={() => setSetting('sound', !sound)}>
          {sound ? 'On' : 'Off'}
        </button>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Haptics</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {haptics
              ? 'On — your phone buzzes on the tear and on hits (supported devices only).'
              : 'Off — no vibration.'}
          </div>
        </div>
        <button className={`btn ${haptics ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={haptics}
          onClick={() => setSetting('haptics', !haptics)}>
          {haptics ? 'On' : 'Off'}
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

      <h3 style={{ margin: '18px 0 4px' }}>🤝 Deal detector</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Define what counts as a <b>DEAL</b> on a vendor's singles — the floor flags any card that matches.
        {hasNetwork
          ? ' Tags show at shows now that you own the Dealer Network.'
          : ' Buy the 🤝 Dealer Network upgrade to see the tags at shows; you can still set your preferences here.'}
      </p>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Price vs market</div>
          <div className="muted" style={{ fontSize: 12 }}>How cheap the ask must be to flag. "Around market" catches fair asks; the lower settings only flag real bargains.</div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          {[['15% under', 0.85], ['10% under', 0.9], ['At market', 1.0], ['Around mkt', 1.05]].map(([lbl, v]) => (
            <button key={v} className={`segbtn ${Math.abs(dealMaxMult - v) < 1e-6 ? 'on' : ''}`}
              onClick={() => setSetting('dealMaxMult', v)}>{lbl}</button>
          ))}
        </div>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Condition</div>
          <div className="muted" style={{ fontSize: 12 }}>Only flag raw cards this clean or better (a mint, ungraded card is the classic gem-hunter's buy). Slabs ignore this.</div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          {[['Any', 'any'], ['LP+', 'LP'], ['NM only', 'NM']].map(([lbl, v]) => (
            <button key={v} className={`segbtn ${dealCondition === v ? 'on' : ''}`}
              onClick={() => setSetting('dealCondition', v)}>{lbl}</button>
          ))}
        </div>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Ungraded only</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {dealUngradedOnly ? 'On — only RAW cards flag as deals (graded slabs are skipped).' : 'Off — graded slabs can flag as deals too.'}
          </div>
        </div>
        <button className={`btn ${dealUngradedOnly ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 110 }}
          role="switch" aria-checked={dealUngradedOnly}
          onClick={() => setSetting('dealUngradedOnly', !dealUngradedOnly)}>
          {dealUngradedOnly ? 'On' : 'Off'}
        </button>
      </div>

      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Ignore cheap cards</div>
          <div className="muted" style={{ fontSize: 12 }}>Skip low-value bulk so the tag means something. Only cards worth at least this flag.</div>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          {[['Any', 0], ['$5+', 5], ['$20+', 20], ['$50+', 50]].map(([lbl, v]) => (
            <button key={v} className={`segbtn ${dealMinValue === v ? 'on' : ''}`}
              onClick={() => setSetting('dealMinValue', v)}>{lbl}</button>
          ))}
        </div>
      </div>

      <h3 style={{ margin: '18px 0 4px' }}>Card prices</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Pull the latest TCGplayer market prices for all {SETS.length} loaded sets — instantly from the
        game&#39;s shared daily price cache when you&#39;re signed in, or live from pokemontcg.io otherwise.
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
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Progress auto-saves to this browser{cloudConfigured() ? ' (and to your account when signed in)' : ''}.
        Resetting wipes cash, collection, notoriety, and upgrades.
      </p>
      <button className="btn alt" style={{ maxWidth: 200 }} onClick={doReset}>
        Reset save
      </button>
    </>
  )
}
