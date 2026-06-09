import { useEffect, useState } from 'react'
import {
  cloudConfigured, getGameId, newGameId,
  pushLocalChange, loadFromCloud, peekCloud, autoSyncOn, setAutoSync,
} from '../game/cloudSave'
import { confirmDialog } from '../ui/dialog'

// Settings panel: cloud save by a per-game UUID (AWS DynamoDB behind a Lambda Function URL).
// Carry the ID to another device and Load to continue the same game there.
export default function CloudSave() {
  const [id, setId] = useState(getGameId())
  const [input, setInput] = useState('')
  const [auto, setAuto] = useState(autoSyncOn())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)        // { kind:'ok'|'err'|'info', text }
  const [cloudAt, setCloudAt] = useState(null) // cloud save timestamp for the current id

  // Peek at the cloud copy's timestamp whenever we have an id (informational).
  useEffect(() => {
    let alive = true
    if (id) peekCloud(id).then(r => { if (alive) setCloudAt(r?.savedAt || null) })
    else setCloudAt(null)
    return () => { alive = false }
  }, [id])

  if (!cloudConfigured()) {
    return (
      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>☁️ Cloud save</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Not set up yet. Deploy the AWS backend (see <code>aws/README.md</code>) and paste the
            Function URL into <code>src/game/syncConfig.js</code> to sync this game across devices.
          </div>
        </div>
      </div>
    )
  }

  const flash = (kind, text) => setMsg({ kind, text })

  async function doCreate() {
    const newId = newGameId()
    setId(newId)
    setBusy(true)
    try { await pushLocalChange(); flash('ok', 'Game ID created and saved to the cloud.') }
    catch (e) { flash('err', e.message) }
    finally { setBusy(false) }
  }

  async function doSave() {
    setBusy(true)
    try {
      const r = await pushLocalChange()
      setCloudAt(r.savedAt)
      flash('ok', 'Saved to the cloud.')
    } catch (e) {
      if (e.code === 'stale') flash('err', 'Cloud has a newer save — load it first, then save.')
      else flash('err', e.message)
    } finally { setBusy(false) }
  }

  async function doLoad(targetId) {
    const wanted = (targetId ?? input).trim()
    if (!wanted) return flash('err', 'Paste a game ID to load.')
    const ok = await confirmDialog({
      title: 'Load cloud save?',
      body: 'This replaces the game on THIS device with the cloud save. Any local progress not yet synced will be lost.',
      confirmText: 'Load it',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await loadFromCloud(wanted)
      setId(wanted); setInput(''); setCloudAt(r.savedAt)
      flash('ok', 'Loaded from the cloud. Your game is now in sync.')
    } catch (e) {
      flash('err', e.message)
    } finally { setBusy(false) }
  }

  async function copyId() {
    try { await navigator.clipboard.writeText(id); flash('info', 'Game ID copied.') }
    catch { flash('info', id) }
  }

  function toggleAuto() {
    const next = !auto
    setAuto(next); setAutoSync(next)
  }

  return (
    <>
      <div className="setting-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="row" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>☁️ Cloud save</div>
          {cloudAt && <span className="muted" style={{ fontSize: 11.5 }}>Cloud updated {new Date(cloudAt).toLocaleString()}</span>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Sync this game across devices with a private game ID. Keep it secret — anyone with the ID can load your game.
        </div>

        {id ? (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ flex: 1, minWidth: 160, fontSize: 12, background: '#0c0f1a', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 9px', overflowWrap: 'anywhere' }}>{id}</code>
              <button className="btn alt" style={{ flex: 'none', maxWidth: 90 }} onClick={copyId}>Copy</button>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn gold" style={{ flex: 'none', maxWidth: 150 }} disabled={busy} onClick={doSave}>Save to cloud</button>
              <button className="btn alt" style={{ flex: 'none', maxWidth: 150 }} disabled={busy} onClick={() => doLoad(id)}>Reload from cloud</button>
            </div>
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {auto ? 'Auto-sync on — saves to the cloud as you play.' : 'Auto-sync off — save manually.'}
              </div>
              <button className={`btn ${auto ? 'gold' : 'alt'}`} style={{ flex: 'none', maxWidth: 90 }}
                role="switch" aria-checked={auto} onClick={toggleAuto}>
                {auto ? 'On' : 'Off'}
              </button>
            </div>
          </>
        ) : (
          <button className="btn gold" style={{ flex: 'none', maxWidth: 200 }} disabled={busy} onClick={doCreate}>
            Create a game ID
          </button>
        )}

        {/* Load a DIFFERENT game by its ID (e.g. moving from another device). */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Continue a game from another device — paste its ID:</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: 1, minWidth: 160, background: '#0c0f1a', border: '1px solid var(--line)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
              placeholder="game ID (UUID)" value={input} onChange={e => setInput(e.target.value)} />
            <button className="btn" style={{ flex: 'none', maxWidth: 120 }} disabled={busy || !input.trim()} onClick={() => doLoad()}>Load</button>
          </div>
        </div>

        {msg && (
          <div className="muted" style={{ fontSize: 12, color: msg.kind === 'err' ? 'var(--red)' : msg.kind === 'ok' ? 'var(--green)' : 'var(--dim)' }}>
            {msg.text}
          </div>
        )}
      </div>
    </>
  )
}
