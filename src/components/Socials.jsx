import { useMemo } from 'react'
import {
  useGame, SPONSOR_FEATURE_PACKS, SPONSOR_WINDOW_DAYS,
  CHALLENGE_ABANDON_DING, absoluteDay,
} from '../game/store'
import { fmtMoney } from '../game/engine'
import { Collapse, bigScreen } from '../ui/Collapse'

// 📌 The channel's standing commitments — the chase, the sponsor, the creators you know.
//
// The FEED moved to the per-platform screens (Feed.jsx); what is left here is the part that is
// true across all of them: what you announced you were doing, what a brand is waiting on, and
// who you have worked with. Everything is a READOUT of state the day tick maintains; the only
// action is dropping a challenge, because it's the one content commitment you can walk away
// from. Declaring one lives in 👤 You → Binders, next to the page you'd be filling.
export default function Socials() {
  const upgrades = useGame(s => s.upgrades)
  const challenge = useGame(s => s.challenge)
  const sponsor = useGame(s => s.sponsor)
  const collab = useGame(s => s.collab)
  const bySet = useGame(s => s.bySet)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const abandonChallenge = useGame(s => s.abandonChallenge)
  const challengeProgress = useGame(s => s.challengeProgress)

  const absDay = absoluteDay(currentDay, monthsElapsed)
  // Nothing in this batch owned yet → don't put an empty panel on the tab at all.
  const anyContent = upgrades.shortsChannel || upgrades.showVlog || upgrades.podcast
    || upgrades.collabs || upgrades.brandDeals || upgrades.discord
  const prog = useMemo(() => (challenge ? challengeProgress() : null), [challenge, challengeProgress])
  if (!anyContent) return null

  // 💰 What the sponsor is still waiting on (they want packs of THEIR set ripped on camera).
  const sponsorDone = sponsor ? (bySet?.[sponsor.setId]?.packsOpened || 0) - (sponsor.packsAt || 0) : 0
  const sponsorLeft = sponsor ? Math.max(0, SPONSOR_FEATURE_PACKS - sponsorDone) : 0
  const sponsorDays = sponsor ? Math.max(0, sponsor.dueDay - absDay) : 0

  const badge = [
    challenge ? '🃏 chasing' : null,
    sponsor ? '💰 sponsored' : null,
    Object.keys(collab?.rapport || {}).length ? `🤝 ${Object.keys(collab.rapport).length}` : null,
  ].filter(Boolean).join(' · ') || 'nothing announced'

  return (
    <Collapse id="socials" className="wants mt-5" 
      head="📌 Standing commitments" badge={badge} defaultOpen={bigScreen()}
      hint="What you have announced, what a brand is waiting on, and who you have worked with.">

      {/* --- 🃏 the challenge --- */}
      {upgrades.setChallenge && (
        <div className="mt-5">
          <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>🃏 Master set challenge</div>
          {!challenge ? (
            <div className="cap">
              No chase announced. Start a binder in <b>👤 You → Binders</b> and declare that set —
              dealers start pulling it out for you, and the completion becomes the payoff video.
            </div>
          ) : (
            <div className="product" style={{ padding: '10px 12px', gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{challenge.setName}</div>
              <div className="cap">
                {prog ? `${prog.placed}/${prog.total} — ${prog.remaining} to go` : '—'}
                {' · '}started at {challenge.startPlaced}/{challenge.total}
                {' · '}payoff ×{(challenge.scale ?? 1).toFixed(2)}
                {challenge.episodes > 0 && ` · ${challenge.episodes} episode${challenge.episodes === 1 ? '' : 's'} out`}
              </div>
              <button className="btn" style={{ alignSelf: 'flex-start' }}
                onClick={() => abandonChallenge()}>
                Drop the challenge (−{CHALLENGE_ABANDON_DING}★)
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- 💰 the sponsor --- */}
      {upgrades.brandDeals && (
        <div className="mt-5">
          <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>💰 Brand deal</div>
          {!sponsor ? (
            <div className="cap">
              Nobody's calling yet — brands want an audience first. Keep posting.
            </div>
          ) : (
            <div className="product" style={{ padding: '10px 12px', gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{sponsor.icon} {sponsor.brand} · {fmtMoney(sponsor.monthly)}/month</div>
              <div className="cap">
                {sponsor.featured
                  ? `Feature delivered — the next check is on its way.`
                  : `Owes you nothing until you deliver: rip ${sponsorLeft} more pack${sponsorLeft === 1 ? '' : 's'} of ${sponsor.setName} on camera, ${sponsorDays} day${sponsorDays === 1 ? '' : 's'} left of the ${SPONSOR_WINDOW_DAYS}.`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- 🤝 collabs --- */}
      {upgrades.collabs && Object.keys(collab?.rapport || {}).length > 0 && (
        <div className="mt-5">
          <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>🤝 Creators you've worked with</div>
          <div className="paystatus">
            {Object.entries(collab.rapport).sort((a, b) => b[1] - a[1]).map(([who, n]) => (
              <span key={who} className="pill">{who} ×{n}</span>
            ))}
          </div>
        </div>
      )}
    </Collapse>
  )
}
