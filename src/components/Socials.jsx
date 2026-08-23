import { useMemo } from 'react'
import {
  useGame, POST_KINDS, cadenceMult, SPONSOR_FEATURE_PACKS, SPONSOR_WINDOW_DAYS,
  CHALLENGE_ABANDON_DING, absoluteDay,
} from '../game/store'
import { fmtMoney } from '../game/engine'
import { Collapse, bigScreen } from '../ui/Collapse'

// 📱 The socials panel — the channel's off-air half, above the go-live screen.
//
// Everything here is a READOUT of state the day tick maintains (posts, the challenge, the
// sponsor's obligation, collab rapport); the only action is dropping a challenge, which lives
// here because it's the one content commitment you can walk away from. Declaring one lives in
// the Binder, next to the set you'd be chasing.
export default function Socials() {
  const upgrades = useGame(s => s.upgrades)
  const followers = useGame(s => s.followers || 0)
  const subs = useGame(s => s.subs || 0)
  const posts = useGame(s => s.posts || [])
  const queue = useGame(s => s.postQueue || [])
  const streak = useGame(s => s.postStreak || 0)
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

  const reach = posts.reduce((a, p) => a + (p.perDay || 0), 0)
  const cadence = cadenceMult(streak)
  // 💰 What the sponsor is still waiting on (they want packs of THEIR set ripped on camera).
  const sponsorDone = sponsor ? (bySet?.[sponsor.setId]?.packsOpened || 0) - (sponsor.packsAt || 0) : 0
  const sponsorLeft = sponsor ? Math.max(0, SPONSOR_FEATURE_PACKS - sponsorDone) : 0
  const sponsorDays = sponsor ? Math.max(0, sponsor.dueDay - absDay) : 0

  const badge = [
    `${followers} followers`,
    posts.length ? `${posts.length} live · ≈${Math.round(reach * cadence)}/day` : null,
    challenge ? '🃏 chasing' : null,
    sponsor ? '💰 sponsored' : null,
  ].filter(Boolean).join(' · ')

  return (
    <Collapse id="socials" className="wants mt-5" 
      head="📱 Socials" badge={badge} defaultOpen={bigScreen()}
      hint="The audience you build off-air — posts, the chase, the sponsor.">

      <div className="paystatus mt-3">
        <span className="pill">👥 {followers} followers</span>
        {subs > 0 && <span className="pill">❤️ {subs} subs</span>}
        {streak > 0 && <span className="pill">🔁 {streak}-day streak · ×{cadence.toFixed(2)} reach</span>}
        {queue.length > 0 && <span className="pill">🗓️ {queue.length} banked</span>}
      </div>

      {/* --- the live feed --- */}
      {upgrades.shortsChannel && (
        <div className="mt-5">
          <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>
            📱 Circulating now
          </div>
          {posts.length === 0 ? (
            <div className="cap">
              Nothing up. Rip something worth filming, get a slab back, or take in a collection —
              the moments post themselves.
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
              {posts.map((p, i) => (
                <div key={i} className="product" style={{ padding: '8px 10px', gap: 2 }}>
                  <div className="t-sm" style={{ fontWeight: 700 }}>
                    {POST_KINDS[p.kind]?.icon || '📱'} {p.label}
                    {p.viral && <span className="pill t-xs" style={{ marginLeft: 6 }}>🚀 POPPED</span>}
                  </div>
                  <div className="cap">
                    ≈{p.perDay}/day followers · {p.daysLeft} day{p.daysLeft === 1 ? '' : 's'} left
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- 🃏 the challenge --- */}
      {upgrades.setChallenge && (
        <div className="mt-5">
          <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>🃏 Master set challenge</div>
          {!challenge ? (
            <div className="cap">
              No chase announced. Pick a set in <b>Cards → Binder</b> and declare it — dealers start
              pulling it out for you, and the completion becomes the payoff video.
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
