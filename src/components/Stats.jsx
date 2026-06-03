import { useGame } from '../game/store'
import { cardValue } from '../game/engine'

export default function Stats() {
  const { stats, history, collection, cash } = useGame(s => ({
    stats: s.stats, history: s.history, collection: s.collection, cash: s.cash,
  }))
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
  const netWorth = cash + collValue
  const pnl = stats.earned - stats.spent

  return (
    <>
      <div className="statgrid">
        <Stat label="Net worth" v={`$${netWorth.toFixed(2)}`} c="var(--green)" />
        <Stat label="Cash" v={`$${cash.toFixed(2)}`} />
        <Stat label="Collection value" v={`$${collValue.toFixed(2)}`} />
        <Stat label="Realized P/L" v={`${pnl>=0?'+':''}$${pnl.toFixed(2)}`} c={pnl>=0?'var(--green)':'var(--red)'} />
        <Stat label="Packs opened" v={stats.packsOpened} />
        <Stat label="Cards pulled" v={stats.cardsPulled} />
        <Stat label="Hits pulled" v={stats.hits} c="var(--gold)" />
        <Stat label="Best pull" v={stats.bestPull ? `$${cardValue(stats.bestPull).toFixed(2)}` : '—'} />
      </div>

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
