import { useEffect, useState } from 'react'
import { useGame } from '../game/store'
import { fmtMoney } from '../game/engine'

// 🎓 First-run guide.
//
// The playtest note was blunt: there is no onboarding. A new player lands in a game with a
// dozen tabs and no idea that the loop is buy → rip → sell → next day, and the tutorial
// answer to that is usually a modal that stops you playing until you've clicked through it.
//
// This isn't that. It's a small dismissible card that watches the SAVE, not the player:
// each step completes when you've actually done the thing, in whatever order you found it,
// and the card retires itself for good the moment the loop is closed. You can dismiss it at
// any point and it never comes back. Nothing here blocks a click.
const STEPS = [
  { key: 'buy',  icon: '🛒', title: 'Buy some sealed',
    hint: 'The Buy tab sells every set\'s real product at live market prices. A single booster is the cheapest way in.',
    done: s => (s.stats?.spent || 0) > 0 || (s.sealedInventory || []).length > 0 || (s.stats?.packsOpened || 0) > 0 },
  { key: 'rip',  icon: '🎴', title: 'Rip a pack',
    hint: 'Open it from 📦 Inventory. Ripping sealed is deliberately -EV — the chase is the point, not the margin.',
    done: s => (s.stats?.packsOpened || 0) > 0 },
  { key: 'sell', icon: '💵', title: 'Sell a card',
    hint: 'Tap any card in your collection. Quick sell is instant at 50% of market; listing it takes days but pays properly.',
    done: s => (s.stats?.earned || 0) > (s.cumWages || 0) },
  { key: 'day',  icon: '📅', title: 'End the day',
    hint: 'Next Day → is what makes the world move: orders arrive, listings get browsed, rent comes due. Nothing happens until you do.',
    done: s => (s.currentDay || 1) > 1 || (s.monthsElapsed || 0) > 0 },
]

const DISMISS_KEY = 'pv-firstrun-done'

export default function FirstRun() {
  const state = useGame(s => s)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const done = STEPS.map(st => { try { return !!st.done(state) } catch { return false } })
  const allDone = done.every(Boolean)

  // Retire permanently the moment the loop is closed — a guide that lingers after you've
  // learned the thing is just clutter.
  useEffect(() => {
    if (!allDone || hidden) return
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }, [allDone, hidden])

  if (hidden || allDone) return null
  const next = done.findIndex(d => !d)

  return (
    <div className="firstrun">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b>🎓 Getting started</b>
        <button className="linkbtn t-xs"
          onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }; setHidden(true) }}>
          Dismiss ✕
        </button>
      </div>
      <p className="cap" style={{ margin: '2px 0 8px' }}>
        The whole game is one loop. You have {fmtMoney(state.cash)} — the rest is up to you.
      </p>
      <div className="firstrun-steps">
        {STEPS.map((st, i) => (
          <div key={st.key} className={`firstrun-step ${done[i] ? 'done' : i === next ? 'now' : ''}`}>
            <span className="fr-icon">{done[i] ? '✓' : st.icon}</span>
            <div>
              <div className="fr-title">{st.title}</div>
              {i === next && <div className="fr-hint muted">{st.hint}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// The "?" next to the reputation star. The playtest asked for one specific thing —
// an explanation of what the number actually DRIVES — because it's on screen from
// minute one and nothing says why you'd want it. Now covers the two-speed model.
export function NotorietyHelp() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="noto-help" aria-label="What does reputation do?"
        onClick={() => setOpen(o => !o)}>?</button>
      {open && (
        <div className="noto-pop" role="dialog" onClick={() => setOpen(false)}>
          <b>⭐ Reputation is your permanent standing</b>
          <p>The whole game reads off it — how many orders and walk-ins you get, how rich the
            collector wants are, how far buyers stretch, how good a table you get at a show.
            It never fades. Earn it doing right by people; lose it letting them down.</p>
          <p><b>🏅 Ranks</b> — reputation plus <i>deeds</i> unlock named ranks (Weekend Flipper →
            Known Local → … → Hobby Legend). Ranks open the doors: bigger shows, big-league
            distributors, sanctioned tournaments. Once earned, a rank is yours for good — the
            checklist lives on the <b>Stats</b> tab.</p>
          <p><b>🔥 Hype</b> — big moments (god packs, grail pulls, great streams, giveaways,
            events) heat the shop up. While hot, more buyers show up <i>everywhere</i>. It fades
            over a few days, and a little of every hot streak settles into permanent ⭐.</p>
          <p><b>🎫 Clout</b> — rank-ups and big moments also earn spendable favors: restock a
            distributor, jump a reprint queue, expedite grading, talk into a bigger show, boost
            a stream.</p>
        </div>
      )}
    </>
  )
}
