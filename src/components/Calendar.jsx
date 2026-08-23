import { useMemo, useState } from 'react'
import { useGame, dayOrderRate, monthName, yearOf, RANKS } from '../game/store'
import { generateCalendar, SHOW_TIERS } from '../game/shows'
import { fmtMoney } from '../game/engine'
import ShowDMs from './ShowDMs'

// How close a show must be before the pre-show DM circuit lights up (mirrors the
// daytick lead window — dealers finalize their tables a few days out).
const DM_WINDOW = 4

export default function Calendar({ onAttend }) {
  const [dmShow, setDmShow] = useState(null) // the show whose dealer DMs are open
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
          <span className="pill">⭐ {Math.round(notoriety)} · {RANKS[rank]?.emoji} {RANKS[rank]?.name}</span>
          <NotorietyBar n={notoriety} rank={rank} />
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
          // At ⭐0 this expectation is a rounding error, and the line rendered as
          // "⚠️ ~0.0 online order may arrive home" — a warning about nothing, with a spurious
          // decimal and a singular noun (the old plural test was `>= 1.5`, so 0.0 read as one
          // order). Below a twentieth of an order there is nothing at stake, so say nothing;
          // above it, show a figure and pluralise off what is actually PRINTED.
          const ordersShown = expOnline < 1 ? expOnline.toFixed(1) : String(Math.round(expOnline))
          const ordersNoun = ordersShown === '1' ? 'order' : 'orders'
          const ordersWorthMentioning = expOnline >= 0.05
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
                    : l.kind === 'purchase'
                    ? <>💳 <b>Paid</b> — {l.vendorName}'s {l.productType} of {l.setName} ships home after the show</>
                    : <>🤝 <b>{l.who}</b> wants {l.desc} · pays {Math.round(l.premiumMult * 100)}%</>}
                </div>
              ))}
              {/* 💬 The pre-show circuit: for a close-enough show, see which dealers you know
                  are going, catch the crowd gossip, and deal with them before doors. */}
              {!show.locked && show.day - currentDay <= DM_WINDOW && (
                <button className="btn alt" style={{ marginTop: 6 }} onClick={() => setDmShow(show)}
                  title="Which dealers you know are setting up, what they're hauling, and what the crowd's looking like — deal with them before doors open.">
                  💬 Who's going?
                </button>
              )}
              {!show.locked && ordersWorthMentioning && (
                <div className="muted" style={{ fontSize: 11.5, color: onlineCovered ? 'var(--green)' : '#ff9f43' }}>
                  {onlineCovered
                    ? `📱 ~${ordersShown} online ${ordersNoun} handled while away`
                    : `⚠️ ~${ordersShown} online ${ordersNoun} may arrive home — missed without a 📱 Smartphone`}
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

      {dmShow && <ShowDMs show={dmShow} onClose={() => setDmShow(null)} />}
    </>
  )
}

// The rank-ladder bar: ⭐ progress with a tick per RANK threshold (which are the show-tier
// thresholds by design). A tick lights up once the rank is actually HELD (banked), not just
// when the number is passed — deeds matter now, so the bar tells the truth about access.
export function NotorietyBar({ n, rank = 0 }) {
  const scale = Math.max(100, ...RANKS.map(r => r.min)) || 100
  const pct = Math.min(100, (n / scale) * 100)
  return (
    <div style={{ flex: 1, minWidth: 90, maxWidth: 360 }}>
      {/* The track was var(--bg) — the page's own near-black — so an early-game bar (⭐4 of a
          280 scale = 1.4%) was a bare outline with five faint ticks and read as an unloaded
          widget rather than "you are at the start". A lighter groove makes an EMPTY meter still
          look like a meter, and any non-zero progress gets a visible minimum sliver. */}
      <div style={{ background: '#ffffff14', border: '1px solid var(--line)', borderRadius: 999, height: 12, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: pct > 0 ? `max(3px, ${pct}%)` : 0, height: '100%', background: 'linear-gradient(90deg,#5ec98a,#ff9f43,#ff3df0)', transition: 'width .4s' }} />
        {RANKS.map((r, i) => r.min > 0 && (
          <span key={r.name} title={`${r.emoji} ${r.name} — ⭐ ${r.min} + deeds`}
            style={{ position: 'absolute', top: -2, left: `${Math.min(100, (r.min / scale) * 100)}%`, width: 2, height: 16, background: rank >= i ? '#fff' : '#ffffff44' }} />
        ))}
      </div>
    </div>
  )
}
