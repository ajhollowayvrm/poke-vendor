import { useShallow } from 'zustand/react/shallow'
import { useGame, STORE_LEASE_PER_DAY, RENT_PER_DAY } from '../game/store'
import { netWorthFull } from '../game/store/helpers'
import { fmtMoney, cardValue, sealedValue, round2 } from '../game/engine'
import Books from './Books'

// 🏬 Store → Financials: what the business is worth, what it costs to keep open, and the
// bills with a clock on them.
//
// This used to be the Money half of a Stats tab that also carried a rip log, a luck-vs-odds
// panel and per-set ROI tables. Those reported on the past and could not be acted on, so they
// went; what is left is the part a shop owner actually opens the books for.
export default function StoreFinancials() {
  const { cash, stats, collection, binder, listings, consignments, showInventory,
    pendingGrades, sealedInventory, showSealed } = useGame(useShallow(s => ({
      cash: s.cash, stats: s.stats, collection: s.collection, binder: s.binder || [],
      listings: s.listings, consignments: s.consignments, showInventory: s.showInventory,
      pendingGrades: s.pendingGrades, sealedInventory: s.sealedInventory, showSealed: s.showSealed,
    })))
  const worth = useGame(s => netWorthFull(s))
  const burn = useGame(s => s.dailyBurn())
  const cardPerDay = useGame(s => s.cardIncomePerDay())
  const storage = useGame(s => s.storageStatus())
  const storeArrears = useGame(s => s.storeArrears || 0)
  const rentArrears = useGame(s => s.rentArrears || 0)

  // What is tied up in stock rather than sitting in the till. A shop's cash and a shop's
  // WORTH move in opposite directions all week — buying stock spends one and not the other —
  // and reading them side by side is the whole point of keeping books.
  const onHand = collection.reduce((a, c) => a + cardValue(c), 0)
    + binder.reduce((a, c) => a + cardValue(c), 0)
    + (sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0)
  const inFlight = (listings || []).reduce((a, l) => a + cardValue(l.card), 0)
    + (consignments || []).reduce((a, c) => a + (c.net || 0), 0)
    + (showInventory || []).reduce((a, c) => a + cardValue(c), 0)
    + (pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0)
    + (showSealed || []).reduce((a, it) => a + sealedValue(it), 0)
  const pnl = round2((stats.earned || 0) - (stats.spent || 0))
  const netDay = round2(cardPerDay - burn)

  return (
    <>
      <div className="stat-group-h">The business</div>
      <div className="statgrid">
        <Fig label="Net worth" v={fmtMoney(worth)} c="var(--green)" />
        <Fig label="Cash on hand" v={fmtMoney(cash)} />
        <Fig label="Stock on hand" v={fmtMoney(onHand)} />
        <Fig label="Out working" v={fmtMoney(inFlight)} />
        <Fig label="Realized P/L" v={`${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}`}
          c={pnl >= 0 ? 'var(--green)' : 'var(--red)'} />
      </div>

      <div className="stat-group-h">Every day, whether you open or not</div>
      <div className="statgrid">
        <Fig label="Daily burn" v={`−${fmtMoney(burn)}`} c="var(--red)" />
        <Fig label="Card income" v={`+${fmtMoney(cardPerDay)}`} c="var(--green)" />
        <Fig label="Net per day" v={`${netDay >= 0 ? '+' : ''}${fmtMoney(netDay)}`}
          c={netDay >= 0 ? 'var(--green)' : 'var(--red)'} />
        {netDay < 0 && <Fig label="Cash runway" v={`${Math.floor(cash / -netDay)} days`} />}
      </div>
      <p className="cap">
        Rent {fmtMoney(RENT_PER_DAY)} + lease {fmtMoney(STORE_LEASE_PER_DAY)} a day, plus payroll and
        storage. The lease is charged whether the shop had a good week or not — that is what makes
        it the commitment it is.
      </p>
      {(rentArrears > 0 || storeArrears > 0) && (
        <div className="finance-warn">
          ⚠️ Behind on {rentArrears > 0 ? `rent (${rentArrears}d)` : ''}
          {rentArrears > 0 && storeArrears > 0 ? ' and ' : ''}
          {storeArrears > 0 ? `the lease (${storeArrears}d)` : ''}. Sell stock or cut costs.
        </div>
      )}
      {storage.fee > 0 && (
        <div className="finance-warn" style={{ background: '#ff9f4315', borderColor: '#ff9f4340', color: '#ffcf9e' }}>
          📦 Storage −{fmtMoney(storage.fee)}/day — {storage.units} idle sealed in the back
          ({storage.free} free). Put it on the floor, list it, rip it, or flip it.
        </div>
      )}

      <Books />
    </>
  )
}

function Fig({ label, v, c }) {
  return <div className="stat"><div className="statv" style={c ? { color: c } : null}>{v}</div><div className="statl">{label}</div></div>
}
