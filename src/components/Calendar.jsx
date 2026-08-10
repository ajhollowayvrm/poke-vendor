import { useMemo } from 'react'
import { useGame, dayOrderRate, monthName, yearOf, RANKS } from '../game/store'
import { generateCalendar, SHOW_TIERS } from '../game/shows'
import { fmtMoney } from '../game/engine'

export default function Calendar({ onAttend }) {
  const notoriety = useGame(s => s.notoriety)
  const rank = useGame(s => s.rank || 0) // 🏅 banked ladder rank — the door for show tiers
  const clout = useGame(s => s.clout || 0) // 🎫 spendable favors — can talk you into the next tier up
  const showSeed = useGame(s => s.showSeed)
  const cash = useGame(s => s.cash)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const upgrades = useGame(s => s.upgrades)
  const showLeads = useGame(s => s.showLeads)

  const allShows = useMemo(() => generateCalendar(notoriety, showSeed, rank), [notoriety, showSeed, rank])
  // Only shows on or after today are attendable; earlier ones have passed.
  const shows = allShows.filter(s => s.day >= currentDay)
  const missedToday = allShows.filter(s => s.day < currentDay).length

  return (
    <>
      <div className="toolbar">
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>📅 Day {currentDay} / 30 · {monthName(monthsElapsed)}{yearOf(monthsElapsed) > 1 ? ` Y${yearOf(monthsElapsed)}` : ''}</span>
        {/* keep the Notoriety label and its bar together as one unit so they don't
            split across rows when the toolbar wraps on a phone. */}
        <span className="noto-group">
          <span className="pill">Notoriety {Math.round(notoriety)}</span>
          <NotorietyBar n={notoriety} />
        </span>
      </div>

      <div className="banner" style={{ marginTop: 10 }}>
        🗓️ Attending a show costs <b>time</b>: it runs for its full length and the calendar jumps past it.
        Any shows on those days are <b>missed</b> — a 4-day Worlds skips everything in that window. Pick wisely.
      </div>

      {(showLeads || []).length > 0 && (
        <div className="banner lead-banner" style={{ marginTop: 8 }}>
          📬 <b>{showLeads.length} appointment{showLeads.length > 1 ? 's' : ''} lined up</b> — people reached out ahead of
          upcoming shows (marked below). A held item or a premium buyer is waiting if you make the trip; skip the show and it's gone.
        </div>
      )}

      <div className="tierlegend">
        {Object.entries(SHOW_TIERS).map(([k, t]) => (
          <span key={k} className="legend" style={{ borderColor: t.color }}>
            <i style={{ background: t.color }} /> {t.name} <em>· {Math.max(1, t.days - (upgrades.tourVan ? 1 : 0))}d{upgrades.tourVan && t.days > 1 ? ' 🚐' : ''}</em>
            {rank < (t.minRank ?? 0) && <em> · needs {RANKS[t.minRank]?.emoji} {RANKS[t.minRank]?.name}</em>}
          </span>
        ))}
      </div>

      {shows.length === 0 && <div className="empty">No more shows this month — rolling into the next…</div>}

      <div className="calgrid">
        {shows.map(show => {
          const tier = SHOW_TIERS[show.tierKey]
          const canAfford = cash >= tier.entryFee
          const vendorCost = tier.entryFee + (upgrades.sponsorship ? 0 : (tier.vendorFee || 0)) // 📣 booth fee sponsored
          const canVendor = !!upgrades.vendorSetup
          const tripDays = Math.max(1, tier.days - (upgrades.tourVan ? 1 : 0)) // 🚐 the van shaves a day
          const canAffordVendor = cash >= vendorCost
          const endsDay = Math.min(30, show.day + tripDays - 1)
          const leads = (showLeads || []).filter(l => l.showId === show.id)
          // Expected online orders during the show's run (rough), and whether the
          // player would MISS them (no Smartphone to manage online while away).
          // dayOrderRate is a true expected COUNT per day, so this figure is now honest at
          // high fame (where several orders a day can arrive) instead of capping out at 1/day.
          const expOnline = dayOrderRate('online', notoriety) * tripDays
          const onlineCovered = !!upgrades.smartphone
          return (
            <div key={show.id} className={`calcard ${show.locked ? 'locked' : ''} ${show.day === currentDay ? 'today' : ''} ${leads.length ? 'has-leads' : ''}`} style={{ borderLeftColor: tier.color }}>
              <div className="calday">
                {show.day === currentDay ? 'TODAY' : `Day ${show.day}`}
                {tripDays > 1 && <span className="dur"> · {tripDays} days (thru {endsDay})</span>}
              </div>
              <h4>{show.name}</h4>
              <div className="muted" style={{ fontSize: 12 }}>{show.tier} · {tier.booths} booths</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Cards ~{fmtMoney(tier.valueBand[0])}–{fmtMoney(tier.valueBand[1])} · {Math.round(tier.traffic * 100)}% traffic
              </div>
              {leads.map(l => (
                <div key={l.id} className="cal-lead" title={l.text}>
                  {l.kind === 'vendor'
                    ? <>🗝️ <b>{l.vendorName}</b> is holding a {l.productType} of {l.setName} for you · {fmtMoney(l.price)}</>
                    : <>🤝 <b>{l.who}</b> wants {l.desc} · pays {Math.round(l.premiumMult * 100)}%</>}
                </div>
              ))}
              {!show.locked && (
                <div className="muted" style={{ fontSize: 11.5, color: onlineCovered ? 'var(--green)' : '#ff9f43' }}>
                  {onlineCovered
                    ? `📱 ~${expOnline.toFixed(expOnline < 1 ? 1 : 0)} online order${expOnline >= 1.5 ? 's' : ''} handled while away`
                    : `⚠️ ~${expOnline.toFixed(expOnline < 1 ? 1 : 0)} online order${expOnline >= 1.5 ? 's' : ''} may arrive home — missed without a 📱 Smartphone`}
                </div>
              )}
              <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {show.locked ? (
                  <>
                    <button className="btn" disabled title={`Unlocks at rank ${tier.minRank}: reach ⭐ ${tier.minNotoriety} and prove yourself (see the reputation panel on the Stats tab)`}>
                      🔒 {RANKS[tier.minRank]?.emoji} {RANKS[tier.minRank]?.name}
                    </button>
                    {/* 🎫 Waiver: exactly one tier above your rank, a favor gets you a shopper
                        ticket — 3 clout + double the door price. No booth at a show that
                        doesn't know you. */}
                    {tier.minRank === rank + 1 && (
                      <button className="btn alt" disabled={clout < 3 || cash < tier.entryFee * 2}
                        title={clout < 3 ? 'Needs 3 🎫 clout (rank-ups, god packs, clean-sweep goal weeks)' : `Spend 3 🎫 clout and pay double entry ($${tier.entryFee * 2}) to walk a floor above your rank — shopper ticket only`}
                        onClick={() => onAttend({ ...show, _waiver: true }, 'shop')}>
                        🎫 Talk your way in · 3 🎫 + ${tier.entryFee * 2}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn gold" disabled={!canAfford} onClick={() => onAttend(show, 'shop')}
                      title="Shopper ticket — walk the floor and buy. No booth.">
                      🛍️ Attend · ${tier.entryFee}{tripDays > 1 ? ` · ${tripDays}d` : ''}
                    </button>
                    <button className="btn" disabled={!canVendor || !canAffordVendor} onClick={() => onAttend(show, 'vendor')}
                      title={canVendor
                        ? `Run a booth to sell your cards. Entry $${tier.entryFee}${upgrades.sponsorship ? ' — booth fee sponsored 📣' : ` + booth $${tier.vendorFee}`}.`
                        : 'Requires the 🎪 Vendor Setup upgrade'}>
                      {canVendor ? `🎪 Vendor · $${vendorCost}` : '🎪 Vendor · 🔒 needs setup'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function NotorietyBar({ n }) {
  const tiers = Object.values(SHOW_TIERS)
  // Scale the whole bar to the highest tier requirement so every unlock marker
  // (Invitational, Worlds) is visible and proportional — not all pinned at 100%.
  const scale = Math.max(100, ...tiers.map(t => t.minNotoriety)) || 100
  const pct = Math.min(100, (n / scale) * 100)
  return (
    <div style={{ flex: 1, minWidth: 90, maxWidth: 360 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, height: 12, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#5ec98a,#ff9f43,#ff3df0)', transition: 'width .4s' }} />
        {tiers.map(t => t.minNotoriety > 0 && (
          <span key={t.name} title={t.name} style={{ position: 'absolute', top: -2, left: `${Math.min(100, (t.minNotoriety / scale) * 100)}%`, width: 2, height: 16, background: n >= t.minNotoriety ? '#fff' : '#ffffff44' }} />
        ))}
      </div>
    </div>
  )
}
