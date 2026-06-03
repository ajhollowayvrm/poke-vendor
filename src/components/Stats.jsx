import { useGame } from '../game/store'
import { cardValue, fmtMoney, round2, SETS } from '../game/engine'

const SET_NAME = Object.fromEntries(SETS.map(s => [s.id, s.name]))

export default function Stats() {
  const { stats, history, collection, cash, notoriety, showsAttended, gradesSubmitted, bySet } = useGame(s => ({
    stats: s.stats, history: s.history, collection: s.collection, cash: s.cash,
    notoriety: s.notoriety, showsAttended: s.showsAttended, gradesSubmitted: s.gradesSubmitted,
    bySet: s.bySet || {},
  }))
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
  const netWorth = cash + collValue
  const pnl = stats.earned - stats.spent

  // Per-set analytics: spent on sealed vs market value pulled, sorted by net (most
  // lucrative first). ROI = pulled / spent. Only sets you've actually ripped show.
  const setRows = Object.entries(bySet)
    .map(([id, d]) => ({
      id, name: SET_NAME[id] || id,
      spent: d.spent || 0, pulled: d.pulledValue || 0,
      packs: d.packsOpened || 0, hits: d.hits || 0,
      net: round2((d.pulledValue || 0) - (d.spent || 0)),
      roi: d.spent > 0 ? (d.pulledValue || 0) / d.spent : null,
    }))
    .filter(r => r.spent > 0 || r.pulled > 0)
    .sort((a, b) => b.net - a.net)
  const best = setRows[0]

  return (
    <>
      <div className="statgrid">
        <Stat label="Net worth" v={fmtMoney(netWorth)} c="var(--green)" />
        <Stat label="Cash" v={fmtMoney(cash)} />
        <Stat label="Collection value" v={fmtMoney(collValue)} />
        <Stat label="Realized P/L" v={`${pnl>=0?'+':''}${fmtMoney(pnl)}`} c={pnl>=0?'var(--green)':'var(--red)'} />
        <Stat label="Notoriety" v={Math.round(notoriety)} c="var(--gold)" />
        <Stat label="Packs opened" v={stats.packsOpened} />
        <Stat label="Cards pulled" v={stats.cardsPulled} />
        <Stat label="Hits pulled" v={stats.hits} c="var(--gold)" />
        <Stat label="Best pull" v={stats.bestPull ? fmtMoney(cardValue(stats.bestPull)) : '—'} />
        <Stat label="Best foil" v={stats.bestFoil ? fmtMoney(cardValue(stats.bestFoil)) : '—'} c="#a06bff" />
        <Stat label="God packs hit" v={stats.godPacks || 0} c="#ff3df0" />
        <Stat label="Cards graded" v={gradesSubmitted} />
        <Stat label="Shows attended" v={showsAttended} />
        <Stat label="Wants filled" v={stats.wantsFilled || 0} />
        <Stat label="Goals completed" v={stats.goalsCompleted || 0} />
        <Stat label="Cards owned" v={collection.length} />
      </div>
      {stats.bestPull && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          🏆 Best pull ever: <b style={{ color: 'var(--gold)' }}>{stats.bestPull.name}</b> · {fmtMoney(cardValue(stats.bestPull))}
          {stats.bestFoil && <> · ✨ Best foil: <b style={{ color:'#a06bff' }}>{stats.bestFoil.name}</b> ({stats.bestFoil.foil?.label})</>}
        </p>
      )}

      <h3 style={{ margin: '24px 0 6px' }}>By set</h3>
      {setRows.length === 0 ? (
        <p className="muted">Rip some sealed product to see which sets pay off. 📦</p>
      ) : (
        <>
          {best && best.net !== 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {best.net > 0
                ? <>🏆 Most lucrative: <b style={{ color: 'var(--green)' }}>{best.name}</b> — {fmtMoney(best.net)} net{best.roi != null ? ` (${Math.round(best.roi*100)}% ROI)` : ''}</>
                : <>📉 Every set's underwater so far — that's the chase. Best of the bunch: <b>{best.name}</b> ({fmtMoney(best.net)}).</>}
            </p>
          )}
          <div className="setanalytics">
            <div className="set-row set-head">
              <span>Set</span><span>Spent</span><span>Pulled</span><span>Net</span><span>ROI</span><span>Packs</span>
            </div>
            {setRows.map(r => (
              <div className="set-row" key={r.id}>
                <span className="set-name">{r.name}</span>
                <span>{fmtMoney(r.spent)}</span>
                <span style={{ color: 'var(--green)' }}>{fmtMoney(r.pulled)}</span>
                <span style={{ color: r.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.net >= 0 ? '+' : ''}{fmtMoney(r.net)}</span>
                <span style={{ color: r.roi == null ? 'var(--dim)' : r.roi >= 1 ? 'var(--green)' : 'var(--red)' }}>{r.roi == null ? '—' : `${Math.round(r.roi*100)}%`}</span>
                <span className="muted">{r.packs}{r.hits ? ` · ${r.hits}🌟` : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ margin: '24px 0 6px' }}>Ledger</h3>
      <div>
        {history.length === 0 && <p className="muted">No activity yet.</p>}
        {history.map((h, i) => (
          <div className="hist" key={i}>
            <span className="muted">{new Date(h.t).toLocaleTimeString()}</span>
            <span>{h.detail}</span>
            {h.amount !== 0 && <span className={`amt ${h.amount > 0 ? 'pos' : 'neg'}`}>{h.amount > 0 ? '+' : ''}${h.amount.toFixed(2)}</span>}
          </div>
        ))}
      </div>
    </>
  )
}
function Stat({ label, v, c }) {
  return <div className="stat"><b style={{ color: c || 'var(--txt)' }}>{v}</b><span>{label}</span></div>
}
