import { useMemo, useState } from 'react'
import { useGame, POST_KINDS, cadenceMult, MAX_LIVE_POSTS } from '../game/store'
import { fmtMoney, cardValue, sealedValue, setById, cardImg, setNameOfCard } from '../game/engine'
import { Modal } from '../ui/Modal'
import { toast } from '../ui/dialog'

// The three platforms are one feed wearing three coats, and that is on purpose.
//
// A moment you film goes out everywhere — that is what a "short" IS — so modelling three
// separate audiences would be three numbers doing one number's job, and it would make the
// player run the same errand three times. What differs is what each platform is FOR, so each
// screen shows the slice of the feed that belongs to it and nothing else.
//
// PLATFORMS names the split. `kinds` selects from posts[], which carries the kind already
// (game/content.js POST_KINDS) — no new state, no per-platform bookkeeping.
export const PLATFORMS = {
  tweeter: {
    id: 'tweeter', name: 'Tweeter', icon: '🐦',
    blurb: 'Where the hobby argues about prices. Short, fast, and it decides what is hot before the boards do.',
    kinds: ['pull', 'gem'],
    empty: 'Nothing posted. Pull something worth arguing about.',
  },
  instantgram: {
    id: 'instantgram', name: 'Instantgram', icon: '📸',
    blurb: 'Pictures of cardboard. Completed pages and clean copies do numbers here; a bent common does not.',
    kinds: ['page', 'haul'],
    empty: 'Nothing posted. Finish a page or take in a collection worth photographing.',
  },
  yourtube: {
    id: 'yourtube', name: 'YourTube', icon: '▶️',
    blurb: 'The long form: rips, hunts, show vlogs — and the place you go live.',
    kinds: ['hunt', 'vlog'],
    empty: 'Nothing posted. Announce a chase or come back from a show with a story.',
  },
}

// One platform's slice of the feed, plus the 🎬 record button. Everything shown is a READOUT
// of what the day tick maintains; recording is the one action, and it goes through the same
// funnel an automatic post does (store/socials.js recordShort).
export default function Feed({ platform }) {
  const p = PLATFORMS[platform] || PLATFORMS.tweeter
  const posts = useGame(s => s.posts || [])
  const queue = useGame(s => s.postQueue || [])
  const streak = useGame(s => s.postStreak || 0)
  const followers = useGame(s => s.followers || 0)
  const subs = useGame(s => s.subs || 0)
  const hasShorts = useGame(s => !!s.upgrades.shortsChannel)
  const shortsLeft = useGame(s => s.shortsLeftToday())
  const [filming, setFilming] = useState(false)

  const mine = useMemo(() => posts.filter(x => p.kinds.includes(x.kind)), [posts, p])
  const cadence = cadenceMult(streak)
  const reach = mine.reduce((a, x) => a + (x.perDay || 0), 0)

  return (
    <>
      <div className="banner mt-3">
        {p.icon} <b>{p.name}</b> — {p.blurb}
      </div>

      <div className="paystatus mt-3">
        <span className="pill">👥 {followers} followers</span>
        {subs > 0 && <span className="pill">❤️ {subs} subs</span>}
        {streak > 0 && <span className="pill">🔁 {streak}-day streak · ×{cadence.toFixed(2)} reach</span>}
        {queue.length > 0 && <span className="pill">🗓️ {queue.length} banked</span>}
        {mine.length > 0 && <span className="pill">≈{Math.round(reach * cadence)}/day from here</span>}
      </div>

      {hasShorts && (
        <button className="btn gold mt-4" style={{ maxWidth: 320 }}
          disabled={shortsLeft <= 0} onClick={() => setFilming(true)}>
          🎬 Record a short{shortsLeft > 0 ? ` · ${shortsLeft} left today` : ' — that is today'}
        </button>
      )}
      {!hasShorts && (
        <p className="cap mt-4">
          Buy the 📱 Shorts Channel upgrade to film and post deliberately. Until then the good
          moments still post themselves — they just choose you rather than the other way round.
        </p>
      )}

      <div className="mt-5">
        <div className="wants-head">📱 Circulating now <span className="muted">({mine.length}/{MAX_LIVE_POSTS} feed slots used across all platforms)</span></div>
        {mine.length === 0 ? (
          <div className="cap">{p.empty}</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginTop: 8 }}>
            {mine.map((x, i) => (
              <div key={i} className="product" style={{ padding: '8px 10px', gap: 2 }}>
                <div className="t-sm" style={{ fontWeight: 700 }}>
                  {POST_KINDS[x.kind]?.icon || '📱'} {x.label}
                  {x.viral && <span className="pill t-xs" style={{ marginLeft: 6 }}>🚀 POPPED</span>}
                </div>
                <div className="cap">≈{x.perDay}/day followers · {x.daysLeft} day{x.daysLeft === 1 ? '' : 's'} left</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {filming && <FilmPicker onClose={() => setFilming(false)} />}
    </>
  )
}

// Pick the thing you are filming. Only stuff you actually own, because a short is a video OF
// something — and value-sorted, because the whole question is "what is worth a video".
function FilmPicker({ onClose }) {
  const collection = useGame(s => s.collection)
  const binder = useGame(s => s.binder || [])
  const sealedInventory = useGame(s => s.sealedInventory)
  const recordShort = useGame(s => s.recordShort)

  const subjects = useMemo(() => {
    const rows = [
      ...[...collection, ...binder].map(c => ({
        kind: 'card', uid: c.uid, img: cardImg(c), value: cardValue(c),
        label: `${c.name}${setNameOfCard(c) ? ` · ${setNameOfCard(c)}` : ''}`,
      })),
      ...(sealedInventory || []).map(it => ({
        kind: 'sealed', uid: it.uid, icon: it.product?.icon || '📦', value: sealedValue(it),
        label: `${it.product?.type || 'Sealed'} · ${setById(it.setId)?.name || 'sealed'}`,
      })),
    ]
    return rows.sort((a, b) => b.value - a.value).slice(0, 40)
  }, [collection, binder, sealedInventory])

  return (
    <Modal onClose={onClose} maxWidth={520} sheet label="Record a short">
      <h3 className="mt-0">🎬 What are you filming?</h3>
      <p className="cap">
        The camera does not make a card interesting. A cheap single is a cheap single on video
        too — the feed only carries things people would actually stop for.
      </p>
      {subjects.length === 0 ? (
        <p className="muted">You own nothing worth filming yet.</p>
      ) : (
        <div className="stock-lines mt-3">
          {subjects.map(sub => (
            <button key={sub.uid} className="trade-line stock-line" style={{ textAlign: 'left', width: '100%' }}
              onClick={() => {
                const r = recordShort(sub)
                if (r.error) return toast(r.error)
                onClose()
                toast(r.banked
                  ? `🎬 Filmed ${sub.label} — banked for the Content Calendar; it goes out when a slot frees up.`
                  : `🎬 Filmed and posted ${sub.label}.`, 5000)
              }}>
              {sub.img ? <img className="tl-thumb" src={sub.img} alt="" loading="lazy" decoding="async" />
                : <span className="tl-icon">{sub.icon}</span>}
              <div className="tl-info">
                <div className="tl-name">{sub.label}</div>
                <div className="tl-sub muted">worth {fmtMoney(sub.value)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
