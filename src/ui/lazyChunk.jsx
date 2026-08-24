import { lazy, Suspense } from 'react'
import { flushSaveWrite } from '../game/store'

// Code-splitting helper for the tab-gated screens.
//
// Boot used to parse the WHOLE app — every tab, every modal, the 104 KB livestream screen —
// before it could paint the Buy tab. Most of that is never touched in a session. These
// helpers push each heavy screen into its own chunk, fetched the first time you open the tab
// that needs it (and then cached by the service worker, so it is a one-time cost).
//
// GUARDED, and that guard is not optional. This game redeploys on every push, so a session
// left open across a deploy asks the server for the OLD hashed chunk — which is gone (404) —
// and a bare lazy() would throw all the way to the crash screen. A missing chunk means "the
// game updated under you", so say that and offer a reload. SealedModal has carried a
// one-off version of this since the price sheet was split out; this is that pattern, shared.

export function StaleChunk() {
  return (
    <div className="empty mt-5">
      📵 The game <b>updated since you opened it</b>, so this screen couldn't load.
      Your save is safe — reload to pick up the new version.
      <div className="mt-5">
        <button className="btn gold" style={{ maxWidth: 200, margin: '0 auto' }}
          onClick={() => { try { flushSaveWrite() } catch { /* best effort */ } location.reload() }}>
          🔄 Reload the game
        </button>
      </div>
    </div>
  )
}

// lazy(), with the stale-chunk fallback already attached.
export function lazyChunk(loader) {
  return lazy(() => loader().catch(() => ({ default: StaleChunk })))
}

// The fallback shown while a chunk is in flight. Deliberately plain and short: on a warm
// cache these resolve in a frame or two, and a spinner that flashes is worse than a word.
export function ChunkFallback({ label = 'Loading…' }) {
  return <div className="empty mt-5">{label}</div>
}

// Wrap a lazily-loaded screen. One import instead of remembering Suspense every time.
export function Chunk({ children, label }) {
  return <Suspense fallback={<ChunkFallback label={label} />}>{children}</Suspense>
}
