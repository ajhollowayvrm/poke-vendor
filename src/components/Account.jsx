import { useEffect, useState } from 'react'
import {
  cloudConfigured, autoSyncOn, setAutoSync, localOwnedByCurrentUser,
  pushLocalChange, loadFromCloud, peekCloud, reconcile,
} from '../game/cloudSave'
import {
  currentUser, onAuthChange, signIn, signUp, confirmSignUp, resendCode,
  signOut, forgotPassword, confirmForgotPassword,
} from '../game/auth'
import { confirmDialog } from '../ui/dialog'

const inputStyle = {
  flex: 1, minWidth: 160, background: 'var(--bg)', border: '1px solid var(--line)',
  color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13,
}

// Settings panel: sign in with an email + password (AWS Cognito) and the game follows
// the account — DynamoDB keeps one cloud save per player, synced as you play.
export default function Account() {
  const [user, setUser] = useState(currentUser())
  const [mode, setMode] = useState('signin') // signin | signup | confirm | forgot | forgotconfirm
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [auto, setAuto] = useState(autoSyncOn())
  const [msg, setMsg] = useState(null)         // { kind:'ok'|'err'|'info', text }
  const [cloudAt, setCloudAt] = useState(null) // when the account's cloud save was last written
  // The local game belongs to a different account (or none) than the one signed in —
  // auto-sync is paused until the player picks a side below.
  const [conflict, setConflict] = useState(() => !!currentUser() && !localOwnedByCurrentUser())

  useEffect(() => onAuthChange(setUser), [])

  // Refresh the cloud timestamp whenever the signed-in account changes (informational).
  useEffect(() => {
    let alive = true
    if (user) peekCloud().then(r => { if (alive) setCloudAt(r?.exists ? r.savedAt : null) })
    else setCloudAt(null)
    return () => { alive = false }
  }, [user])

  if (!cloudConfigured()) {
    return (
      <div className="setting-card">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>👤 Account</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Not set up yet. Deploy the AWS backend (see <code>aws/README.md</code>) and put its
            outputs in <code>src/game/syncConfig.js</code> to enable accounts and cloud saves.
          </div>
        </div>
      </div>
    )
  }

  const flash = (kind, text) => setMsg({ kind, text })
  const cleanEmail = () => email.trim().toLowerCase()

  // After any successful sign-in: line this device up with the account's cloud save.
  async function afterSignIn() {
    setReconciling(true)
    try {
      const r = await reconcile()
      if (r.action === 'conflict') {
        setConflict(true); setCloudAt(r.cloudAt)
        const load = await confirmDialog({
          title: 'Cloud save found',
          body: `Your account has a cloud save from ${new Date(r.cloudAt).toLocaleString()}, but this device has its own game in progress.\n\nLoad the cloud save here? It replaces this device's game. (Or pick "keep this device's game" in the Account panel to overwrite the cloud instead.)`,
          confirmText: 'Load cloud save',
          cancelText: 'Not now',
          danger: true,
        })
        if (load) {
          await loadFromCloud()
          setConflict(false); flash('ok', 'Cloud save loaded — you’re in sync.')
        } else {
          flash('info', 'Cloud sync is paused until you pick which save to keep (below).')
        }
      } else {
        setConflict(false)
        if (r.action === 'pulled') flash('ok', 'Signed in — your cloud save is loaded.')
        else if (r.action === 'pushed') flash('ok', 'Signed in — this game now saves to your account.')
        else if (r.action === 'offline') flash('info', 'Signed in. Couldn’t reach the cloud yet — it’ll sync once you’re back online.')
        else flash('ok', 'Signed in.')
      }
      const peek = await peekCloud()
      setCloudAt(peek?.exists ? peek.savedAt : null)
    } finally { setReconciling(false) }
  }

  async function doSignIn(e) {
    e?.preventDefault()
    const em = cleanEmail()
    if (!em || !password) return flash('err', 'Enter your email and password.')
    setBusy(true)
    try {
      await signIn(em, password)
      setPassword('')
      await afterSignIn()
    } catch (err) {
      if (err.code === 'UserNotConfirmedException') {
        setMode('confirm')
        flash('info', 'Confirm your email first — sending you a fresh code.')
        resendCode(em).catch(() => {})
      } else flash('err', err.message)
    } finally { setBusy(false) }
  }

  async function doSignUp(e) {
    e?.preventDefault()
    const em = cleanEmail()
    if (!em || !password) return flash('err', 'Enter an email and a password (8+ characters).')
    setBusy(true)
    try {
      const r = await signUp(em, password)
      if (r.confirmed) {
        await signIn(em, password); setPassword('')
        await afterSignIn()
      } else {
        setMode('confirm')
        flash('info', `Enter the 6-digit code we emailed to ${em}.`)
      }
    } catch (err) { flash('err', err.message) } finally { setBusy(false) }
  }

  // Confirm sign-up; the password is still in state, so roll straight into sign-in.
  async function doConfirm(e) {
    e?.preventDefault()
    const em = cleanEmail()
    if (!code.trim()) return flash('err', 'Enter the code from the email.')
    setBusy(true)
    try {
      await confirmSignUp(em, code)
      setCode('')
      if (password) {
        await signIn(em, password); setPassword('')
        await afterSignIn()
      } else {
        setMode('signin'); flash('ok', 'Email confirmed — sign in to continue.')
      }
    } catch (err) { flash('err', err.message) } finally { setBusy(false) }
  }

  async function doForgot(e) {
    e?.preventDefault()
    const em = cleanEmail()
    if (!em) return flash('err', 'Enter your account email first.')
    setBusy(true)
    try {
      await forgotPassword(em)
      setMode('forgotconfirm'); setPassword('')
      flash('info', `Reset code sent to ${em} — enter it below with a new password.`)
    } catch (err) { flash('err', err.message) } finally { setBusy(false) }
  }

  async function doForgotConfirm(e) {
    e?.preventDefault()
    const em = cleanEmail()
    if (!code.trim() || !password) return flash('err', 'Enter the emailed code and a new password.')
    setBusy(true)
    try {
      await confirmForgotPassword(em, code, password)
      setCode('')
      await signIn(em, password); setPassword('')
      await afterSignIn()
    } catch (err) { flash('err', err.message) } finally { setBusy(false) }
  }

  async function doSave() {
    setBusy(true)
    try {
      const r = await pushLocalChange()
      setCloudAt(r.savedAt); setConflict(false)
      flash('ok', 'Saved to the cloud.')
    } catch (err) {
      if (err.code === 'stale') flash('err', 'Cloud has a newer save — load it first, then save.')
      else flash('err', err.message)
    } finally { setBusy(false) }
  }

  async function doLoad({ confirmed = false } = {}) {
    if (!confirmed) {
      const ok = await confirmDialog({
        title: 'Load cloud save?',
        body: 'This replaces the game on THIS device with your account’s cloud save. Any local progress not yet synced will be lost.',
        confirmText: 'Load it',
        danger: true,
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = await loadFromCloud()
      setCloudAt(r.savedAt); setConflict(false)
      flash('ok', 'Loaded from the cloud. Your game is now in sync.')
    } catch (err) { flash('err', err.message) } finally { setBusy(false) }
  }

  async function doKeepLocal() {
    const ok = await confirmDialog({
      title: 'Keep this device’s game?',
      body: 'This overwrites your account’s cloud save with the game on THIS device. The old cloud save is gone for good.',
      confirmText: 'Overwrite cloud',
      danger: true,
    })
    if (!ok) return
    await doSave()
  }

  function doSignOut() {
    signOut()
    setMode('signin'); setPassword(''); setCode(''); setConflict(false)
    flash('info', 'Signed out — your game is still on this device.')
  }

  function toggleAuto() {
    const next = !auto
    setAuto(next); setAutoSync(next)
  }

  const note = msg && (
    <div className="muted" style={{ fontSize: 12, color: msg.kind === 'err' ? 'var(--red)' : msg.kind === 'ok' ? 'var(--green)' : 'var(--dim)' }}>
      {msg.text}
    </div>
  )

  // ---- signed in -------------------------------------------------------------
  if (user) {
    return (
      <div className="setting-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="row" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>👤 {user.email}</div>
          {cloudAt && <span className="muted" style={{ fontSize: 11.5 }}>Cloud updated {new Date(cloudAt).toLocaleString()}</span>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Your game is tied to this account — sign in anywhere to keep playing it.
        </div>

        {reconciling ? (
          <div className="muted" style={{ fontSize: 12 }}>Syncing…</div>
        ) : conflict ? (
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              ⚠️ This device’s game isn’t the one saved on your account. Cloud sync is paused — pick which save to keep:
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn gold" style={{ flex: 'none', maxWidth: 170 }} disabled={busy} onClick={() => doLoad()}>Use cloud save</button>
              <button className="btn alt" style={{ flex: 'none', maxWidth: 220 }} disabled={busy} onClick={doKeepLocal}>Keep this device’s game</button>
            </div>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn gold" style={{ flex: 'none', maxWidth: 150 }} disabled={busy} onClick={doSave}>Save to cloud</button>
              <button className="btn alt" style={{ flex: 'none', maxWidth: 170 }} disabled={busy} onClick={() => doLoad()}>Reload from cloud</button>
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
        )}

        {note}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} disabled={busy} onClick={doSignOut}>Sign out</button>
        </div>
      </div>
    )
  }

  // ---- signed out ------------------------------------------------------------
  const tab = (m, label) => (
    <button type="button" className={`segbtn ${mode === m ? 'on' : ''}`}
      onClick={() => { setMode(m); setMsg(null); setCode('') }}>{label}</button>
  )

  return (
    <div className="setting-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>👤 Account</div>
      <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Sign in to save your game to the cloud and play it on any device. No account? The game still saves to this browser.
      </div>

      {(mode === 'signin' || mode === 'signup') && (
        <>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            {tab('signin', 'Sign in')}
            {tab('signup', 'Create account')}
          </div>
          <form onSubmit={mode === 'signin' ? doSignIn : doSignUp}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input style={inputStyle} type="email" autoComplete="email" placeholder="email"
              value={email} onChange={e => setEmail(e.target.value)} />
            <input style={inputStyle} type="password" placeholder={mode === 'signup' ? 'password (8+ characters)' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)} />
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="btn gold" type="submit" style={{ flex: 'none', maxWidth: 170 }} disabled={busy}>
                {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              {mode === 'signin' && (
                <button type="button" className="btn alt" style={{ flex: 'none', maxWidth: 170 }} disabled={busy}
                  onClick={() => { setMode('forgot'); setMsg(null) }}>Forgot password?</button>
              )}
            </div>
          </form>
        </>
      )}

      {mode === 'confirm' && (
        <form onSubmit={doConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="muted" style={{ fontSize: 12 }}>Check <b>{cleanEmail() || 'your email'}</b> for a 6-digit code.</div>
          <input style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
            value={code} onChange={e => setCode(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn gold" type="submit" style={{ flex: 'none', maxWidth: 150 }} disabled={busy}>Confirm</button>
            <button type="button" className="btn alt" style={{ flex: 'none', maxWidth: 150 }} disabled={busy}
              onClick={() => { resendCode(cleanEmail()).then(() => flash('info', 'New code sent.')).catch(err => flash('err', err.message)) }}>
              Resend code
            </button>
            <button type="button" className="btn alt" style={{ flex: 'none', maxWidth: 100 }} disabled={busy}
              onClick={() => { setMode('signin'); setMsg(null) }}>Back</button>
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={doForgot} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="muted" style={{ fontSize: 12 }}>We’ll email a reset code to your account address.</div>
          <input style={inputStyle} type="email" autoComplete="email" placeholder="email"
            value={email} onChange={e => setEmail(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn gold" type="submit" style={{ flex: 'none', maxWidth: 170 }} disabled={busy}>Send reset code</button>
            <button type="button" className="btn alt" style={{ flex: 'none', maxWidth: 100 }} disabled={busy}
              onClick={() => { setMode('signin'); setMsg(null) }}>Back</button>
          </div>
        </form>
      )}

      {mode === 'forgotconfirm' && (
        <form onSubmit={doForgotConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="reset code"
            value={code} onChange={e => setCode(e.target.value)} />
          <input style={inputStyle} type="password" autoComplete="new-password" placeholder="new password (8+ characters)"
            value={password} onChange={e => setPassword(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn gold" type="submit" style={{ flex: 'none', maxWidth: 200 }} disabled={busy}>Set new password</button>
            <button type="button" className="btn alt" style={{ flex: 'none', maxWidth: 100 }} disabled={busy}
              onClick={() => { setMode('signin'); setMsg(null) }}>Back</button>
          </div>
        </form>
      )}

      {note}
    </div>
  )
}
