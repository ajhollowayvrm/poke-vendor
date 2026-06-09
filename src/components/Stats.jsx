import { useGame, JOBS, RENT_PER_DAY, STORE_LEASE_PER_DAY, STORE_GRACE_DAYS, EMPLOYEES, employeeById } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2, SETS } from '../game/engine'
import { confirmDialog } from '../ui/dialog'

const SET_NAME = Object.fromEntries(SETS.map(s => [s.id, s.name]))

export default function Stats() {
  const { stats, history, collection, cash, notoriety, showsAttended, gradesSubmitted, bySet,
    listings, consignments, shopDisplay, showInventory, pendingGrades, sealedInventory } = useGame(s => ({
    stats: s.stats, history: s.history, collection: s.collection, cash: s.cash,
    notoriety: s.notoriety, showsAttended: s.showsAttended, gradesSubmitted: s.gradesSubmitted,
    bySet: s.bySet || {},
    listings: s.listings, consignments: s.consignments, shopDisplay: s.shopDisplay,
    showInventory: s.showInventory, pendingGrades: s.pendingGrades, sealedInventory: s.sealedInventory,
  }))
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
  // Cards/products held in the IN-FLIGHT buckets are moved OUT of `collection` but are still
  // your assets — count them so listing, consigning, stocking, or grading a card doesn't make
  // net worth visibly drop with no offsetting gain.
  const onMarket =
    (listings || []).reduce((a, l) => a + cardValue(l.card), 0) +
    (consignments || []).reduce((a, c) => a + (c.net || 0), 0) +
    (shopDisplay || []).reduce((a, c) => a + cardValue(c), 0) +
    (showInventory || []).reduce((a, c) => a + cardValue(c), 0) +
    (pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0) +
    (sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0)
  const netWorth = cash + collValue + onMarket
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
      <FinanceCard />
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
        <Stat label="Demigod packs" v={stats.demigodPacks || 0} c="#7dd3fc" />
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

// Survival economy panel: job + wage vs rent, net daily, cash runway, and the job picker.
function FinanceCard() {
  const job = useGame(s => s.job)
  const pendingJob = useGame(s => s.pendingJob)
  const cash = useGame(s => s.cash)
  const notoriety = useGame(s => s.notoriety)
  const rentArrears = useGame(s => s.rentArrears || 0)
  const collection = useGame(s => s.collection)
  const takeJob = useGame(s => s.takeJob)
  const quitJob = useGame(s => s.quitJob)
  const cardPerDay = useGame(s => s.cardIncomePerDay())
  const burn = useGame(s => s.dailyBurn())

  const wage = job?.wage || 0
  // The real question: does income (wage + card profit) cover the daily burn (rent + store)?
  const income = wage + cardPerDay
  const netDay = round2(income - burn)
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
  const runway = netDay >= 0 ? null : Math.floor(cash / -netDay)
  // Can you survive WITHOUT the wage? (the "make it" test) — card income alone vs burn.
  const sustainable = cardPerDay >= burn

  return (
    <div className="finance-card">
      <div className="finance-head">
        <div>
          <div className="finance-title">💼 {pendingJob ? `${pendingJob.job.title} (starts day ${pendingJob.startsOnDay})` : (job ? job.title : '🃏 Full-time vendor')}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {job ? `Wage +$${wage}/day` : 'No paycheck'} · Cards ≈ +{fmtMoney(cardPerDay)}/day · Burn −{fmtMoney(burn)}/day
          </div>
        </div>
        <div className="finance-net" style={{ color: netDay >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {netDay >= 0 ? '+' : ''}{fmtMoney(netDay)}<small>net/day</small>
        </div>
      </div>
      {rentArrears > 0 && (
        <div className="finance-warn">⚠️ Behind on rent ({rentArrears} day{rentArrears>1?'s':''}). Sell cards or take a job before you're out.</div>
      )}
      {/* Full-time sustainability readout (Phase 3) */}
      <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
        {job
          ? (sustainable
              ? `📈 Your cards alone (~${fmtMoney(cardPerDay)}/day) already cover your ${fmtMoney(burn)}/day burn — you could quit and make it.`
              : `Your job covers the bills; cards add ~${fmtMoney(cardPerDay)}/day. Get card income above ${fmtMoney(burn)}/day to go full-time for good.`)
          : (sustainable
              ? `🔥 Sustainable! Cards (~${fmtMoney(cardPerDay)}/day) beat your ${fmtMoney(burn)}/day burn. This is the dream.`
              : runway != null
                ? `⏳ Living on cards: ~${fmtMoney(cardPerDay)}/day vs ${fmtMoney(burn)}/day burn. Cash lasts ~${runway} day${runway===1?'':'s'} — sell cards (≈ ${fmtMoney(collValue)}) or take a job.`
                : `Cards cover the burn for now.`)}
      </div>
      <div className="finance-jobs">
        {JOBS.filter(j => j.id !== 'none').map(j => {
          const locked = notoriety + 1e-9 < j.minNoto
          const current = job?.id === j.id && !pendingJob
          return (
            <button key={j.id} className={`jobbtn ${current ? 'on' : ''}`} disabled={locked || current}
              title={locked ? `Unlocks at ${j.minNoto} notoriety` : `$${j.wage}/day${j.start>0?` · starts in ${j.start}d`:''}`}
              onClick={() => takeJob(j.id)}>
              <span className="jobname">{j.title}</span>
              <span className="jobwage">${j.wage}/d{locked ? ` · 🔒${j.minNoto}` : ''}</span>
            </button>
          )
        })}
      </div>
      {job && (
        <button className="btn alt" style={{ maxWidth: 200, marginTop: 8 }}
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Quit ${job.title}?`,
              body: `You'll lose the $${wage}/day wage and live on card profit. Rent${useGame.getState().upgrades.storefront ? ' + store overhead' : ''} still applies.`,
              confirmText: 'Quit — go full-time', cancelText: 'Keep the job', danger: true,
            })
            if (ok) quitJob()
          }}>
          Quit — go full-time
        </button>
      )}

      <StorePanel />
    </div>
  )
}

// Brick & mortar panel (Phase 4): store status, daily overhead, employee hiring.
function StorePanel() {
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const employees = useGame(s => s.employees || [])
  const storeArrears = useGame(s => s.storeArrears || 0)
  const hire = useGame(s => s.hireEmployee)
  const fire = useGame(s => s.fireEmployee)

  if (!hasStore) {
    return (
      <div className="store-panel muted" style={{ fontSize: 12 }}>
        🏬 No storefront yet. Open one from the <b>Upgrades</b> tab to unlock walk-in customers,
        Cash payments, and employees — it adds a daily lease (${STORE_LEASE_PER_DAY}/day) you must keep funded.
      </div>
    )
  }
  const payroll = employees.map(employeeById).filter(Boolean).reduce((a, e) => a + e.wage, 0)
  const counts = employees.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {})
  return (
    <div className="store-panel">
      <div className="store-head">🏬 Your Store <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        — lease ${STORE_LEASE_PER_DAY}/day{payroll ? ` + payroll $${payroll}/day` : ''}</span></div>
      {storeArrears > 0 && (
        <div className="finance-warn">⚠️ Behind on store overhead ({storeArrears}/{STORE_GRACE_DAYS} days). Cover it or you'll lose the shop.</div>
      )}
      <div className="muted" style={{ fontSize: 12, margin: '4px 0 6px' }}>
        Employees boost order throughput (and mind the shop while you're at shows) — but each is daily payroll. Balance it.
      </div>
      <div className="emp-grid">
        {EMPLOYEES.map(e => (
          <div className="emp-row" key={e.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{e.title} {counts[e.id] ? <span className="emp-count">×{counts[e.id]}</span> : null}</div>
              <div className="muted" style={{ fontSize: 11 }}>${e.wage}/day · +{Math.round(e.throughput*100)}% orders</div>
            </div>
            {counts[e.id] ? <button className="btn alt" style={{ flex:'none', maxWidth: 64 }} onClick={() => fire(e.id)}>Fire</button> : null}
            <button className="btn" style={{ flex:'none', maxWidth: 64 }} onClick={() => hire(e.id)}>Hire</button>
          </div>
        ))}
      </div>
    </div>
  )
}
