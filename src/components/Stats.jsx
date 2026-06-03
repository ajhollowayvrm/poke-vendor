import { useGame } from '../game/store'
import { cardValue, fmtMoney } from '../game/engine'

export default function Stats() {
  const { stats, history, collection, cash, notoriety, showsAttended, gradesSubmitted } = useGame(s => ({
    stats: s.stats, history: s.history, collection: s.collection, cash: s.cash,
    notoriety: s.notoriety, showsAttended: s.showsAttended, gradesSubmitted: s.gradesSubmitted,
  }))
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
  const netWorth = cash + collValue
  const pnl = stats.earned - stats.spent

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
