import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { startUpdateChecks } from './game/appUpdate'
import { autoLoginIfConfigured } from './game/autoLogin'
import { isNativeShell } from './game/native'
import { useGame, flushSaveNow } from './game/store'
import './styles.css'

// Watch for new builds. An installed PWA resumes instead of reloading, so without this a
// shipped change can sit live on the server while the home-screen app renders last week's.
//
// Skipped inside the iOS shell, and not merely because it would fail. A service worker does not
// run under a custom URL scheme at all, so there is no worker to update FROM — and a native app
// ships new code as a new binary, which means an in-app "Update ready, reload?" prompt would be
// offering something that cannot happen. Wrong, not just broken.
if (!isNativeShell) startUpdateChecks()

// The one line that makes the whole :active press layer in styles.css exist on iOS.
//
// WebKit applies :active on touch ONLY while a touch listener is registered somewhere up the
// tree from the element. With no listener anywhere, every :active rule in the stylesheet is
// silently dead on iPhone — the CSS is valid, the selector matches, and nothing happens.
//
// The listener body is deliberately empty; it is registered for its existence, not its effect.
// `passive` so it can never block scrolling, and `capture` so it still counts for elements that
// stop propagation on their own touch handlers (the pack drag-to-rip does exactly that).
//
// Worth stating plainly because it is a trap: EVERY DESKTOP BROWSER APPLIES :active WITHOUT
// THIS. Removing it looks completely fine in Chrome, in the Playwright audit, and in a
// simulator screenshot — and kills press feedback across the entire app on a real phone.
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', () => {}, { passive: true, capture: true })
  // Lets the stylesheet target the shell. Used for the bottom nav's home-indicator inset, which
  // the browser build deliberately skips to save vertical space — a trade the shell does not
  // need to make and cannot afford, since the bottom 34pt is the system swipe-up strip.
  if (isNativeShell) document.documentElement.classList.add('native-shell')
}

// 🔑 Personal iOS build only: sign in without being asked, so the phone never shows a login.
// No-ops everywhere else — the web build compiles in production mode, which never loads the env
// file the credentials live in, so there is literally nothing here to find. game/autoLogin.js
// documents exactly where they DO end up and why that is the accepted trade.
// Fire-and-forget: cloudSave's sync loop picks the session up whenever it lands, so no part of
// boot waits on the network for it.
autoLoginIfConfigured()

// The save lives in IndexedDB, which is asynchronous — so on boot the store briefly holds a
// BRAND NEW GAME before the real one arrives. Rendering through that window is not merely
// ugly: App's effects act on the state they see, and a day tick or an auto-sync push fired
// against an empty store could overwrite the actual save. So hold the first paint until
// persist says it has hydrated.
//
// The timeout is the important half. If hydration never resolves — a corrupt row, a browser
// that opens IndexedDB and then refuses to read it — a gate with no escape is a permanently
// blank app, which is worse than the problem it prevents. Render anyway after 6s; the store
// falls back to a new game, and the cloud save is still there to pull.
function Boot() {
  const [ready, setReady] = useState(() => useGame.persist.hasHydrated())
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (ready) return
    const un = useGame.persist.onFinishHydration(() => setReady(true))
    const t = setTimeout(() => setTimedOut(true), 6000)
    return () => { un?.(); clearTimeout(t) }
  }, [ready])
  if (!ready && !timedOut) {
    return (
      <div className="boot-splash">
        <div className="boot-logo">🃏</div>
        <div className="boot-text">Opening the shop…</div>
      </div>
    )
  }
  return <App />
}

// 🔬 TEST SEAM — the one way an automated driver reaches real game state.
//
// Gated behind VITE_TEST_SEAM so it is absent from the shipped bundle (verify with
// `grep __PV__ dist/assets/*.js` after a normal build — it must find nothing).
//
// It exists because the two audit loops need ONE way in that works in BOTH engines. The
// browser driver could `import('/src/game/store')` through Vite's module graph, but the shell
// runs a production bundle with no module graph at all — and importing the store fresh gives
// you a SECOND store that has not hydrated yet, so it reads every value as its initial state
// and quietly lies. Exporting the app's own live instance is the only thing true in both.
// `flush` is not a convenience. Persist writes are debounced 400ms and IndexedDB is async, so a
// driver that changes state and immediately reloads races the write and reads back the PREVIOUS
// state — which looks exactly like the feature under test being broken. Await this before any
// reload-and-verify.
if (import.meta.env.VITE_TEST_SEAM) {
  window.__PV__ = { useGame, store: useGame.getState, flush: flushSaveNow }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Boot />
  </ErrorBoundary>,
)
