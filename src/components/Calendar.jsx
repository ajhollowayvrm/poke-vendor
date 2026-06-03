import { useMemo } from 'react'
import { useGame } from '../game/store'
import { generateCalendar, SHOW_TIERS } from '../game/shows'
import { fmtMoney } from '../game/engine'

export default function Calendar({ onAttend }) {
  const notoriety = useGame(s => s.notoriety)
  const showSeed = useGame(s => s.showSeed)
  const cash = useGame(s => s.cash)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)

  const allShows = useMemo(() => generateCalendar(notoriety, showSeed), [notoriety, showSeed])
  // Only shows on or after today are attendable; earlier ones have passed.
  const shows = allShows.filter(s => s.day >= currentDay)
  const missedToday = allShows.filter(s => s.day < currentDay).length

  return (
    <>
      <div className="toolbar">
        <span className="pill" style={{ background:'#3b6cff22', color:'#9db8ff' }}>📅 Day {currentDay} / 30{monthsElapsed ? ` · Month ${monthsElapsed + 1}` : ''}</span>
        <span className="pill">Notoriety {Math.round(notoriety)}</span>
        <NotorietyBar n={notoriety} />
      </div>

      <div className="banner" style={{ marginTop: 4 }}>
        🗓️ Attending a show costs <b>time</b>: it runs for its full length and the calendar jumps past it.
        Any shows on those days are <b>missed</b> — a 4-day Worlds skips everything in that window. Pick wisely.
      </div>

      <div className="tierlegend">
        {Object.entries(SHOW_TIERS).map(([k, t]) => (
          <span key={k} className="legend" style={{ borderColor: t.color }}>
            <i style={{ background: t.color }} /> {t.name} <em>· {t.days}d</em>
            {notoriety < t.minNotoriety && <em> · unlock @ {t.minNotoriety}</em>}
          </span>
        ))}
      </div>

      {shows.length === 0 && <div className="empty">No more shows this month — rolling into the next…</div>}

      <div className="calgrid">
        {shows.map(show => {
          const tier = SHOW_TIERS[show.tierKey]
          const canAfford = cash >= tier.entryFee
          const endsDay = Math.min(30, show.day + tier.days - 1)
          return (
            <div key={show.id} className={`calcard ${show.locked ? 'locked' : ''} ${show.day === currentDay ? 'today' : ''}`} style={{ borderLeftColor: tier.color }}>
              <div className="calday">
                {show.day === currentDay ? 'TODAY' : `Day ${show.day}`}
                {tier.days > 1 && <span className="dur"> · {tier.days} days (thru {endsDay})</span>}
              </div>
              <h4>{show.name}</h4>
              <div className="muted" style={{ fontSize: 12 }}>{show.tier} · {tier.booths} booths</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Cards ~{fmtMoney(tier.valueBand[0])}–{fmtMoney(tier.valueBand[1])} · {Math.round(tier.traffic * 100)}% traffic
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 10 }}>
                {show.locked ? (
                  <button className="btn" disabled>🔒 Notoriety {tier.minNotoriety}</button>
                ) : (
                  <button className="btn gold" disabled={!canAfford} onClick={() => onAttend(show)}>
                    Attend · ${tier.entryFee}{tier.days > 1 ? ` · ${tier.days}d` : ''}
                  </button>
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
  const pct = Math.min(100, n)
  return (
    <div style={{ flex: 1, minWidth: 160, maxWidth: 360 }}>
      <div style={{ background: '#0c0f1a', border: '1px solid var(--line)', borderRadius: 999, height: 12, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#5ec98a,#ff9f43,#ff3df0)', transition: 'width .4s' }} />
        {tiers.map(t => t.minNotoriety > 0 && (
          <span key={t.name} title={t.name} style={{ position: 'absolute', top: -2, left: `${Math.min(100, t.minNotoriety)}%`, width: 2, height: 16, background: n >= t.minNotoriety ? '#fff' : '#ffffff44' }} />
        ))}
      </div>
    </div>
  )
}
