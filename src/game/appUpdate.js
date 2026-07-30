// App updates — making a new build actually reach a phone.
//
// This app is an installed PWA, and an installed PWA on iOS does not reload. You tap the
// icon, the process is still resident, and you resume the exact JavaScript you were running
// last week. The service worker can quietly fetch a whole new build into its cache and the
// page in front of you never learns about it.
//
// That is precisely what happened: a shipped change sat live on the server for hours while
// the home-screen app kept rendering the old build, because the only thing registering the
// worker was vite-plugin-pwa's injected one-liner —
//
//     navigator.serviceWorker.register('./sw.js')
//
// which installs updates and never tells anybody. So: register it ourselves, actively CHECK
// for new builds (on a timer, and every time the app comes back to the foreground, which is
// the moment a resumed PWA would otherwise miss), and when one is ready say so.
//
// Deliberately a prompt, not an auto-reload. Reloading out from under someone mid-pack-rip
// to install a copy tweak is worse than the staleness — and this game has long sessions. You
// get a pill; you take the update when you're between things.
import { registerSW } from 'virtual:pwa-register'
import { flushSaveWrite } from './store'

const CHECK_EVERY_MS = 15 * 60 * 1000

let waiting = false            // a new build is downloaded and ready to take over
const listeners = new Set()
let applyUpdate = () => window.location.reload()

function announce() { for (const fn of listeners) { try { fn(waiting) } catch { /* a bad listener isn't our problem */ } } }

// Subscribe to "is there an update waiting?" — returns an unsubscribe.
export function onUpdateReady(fn) {
  listeners.add(fn)
  fn(waiting)
  return () => listeners.delete(fn)
}

export function updateReady() { return waiting }

// Take the update: flush the pending save FIRST (writes are debounced ~400ms, and a reload
// that beat the flush would drop the last few seconds of play), then swap in the new worker
// and reload onto it.
export function applyAppUpdate() {
  flushSaveWrite()
  applyUpdate(true)
}

export function startUpdateChecks() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() { waiting = true; announce() },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { reg.update().catch(() => { /* offline, or the server's asleep */ }) }
      setInterval(check, CHECK_EVERY_MS)
      // The one that actually matters for a home-screen app: it never reloads, it RESUMES.
      // Checking on resume is how a week-old session finds out there's a new build at all.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      window.addEventListener('online', check)
    },
  })
}
