import { useShallow } from 'zustand/react/shallow'
import { useGame, JOBS, RANKS, DEEDS_NEEDED } from '../game/store'
import { netWorthFull } from '../game/store/helpers'
import { fmtMoney, cardValue, round2 } from '../game/engine'
import { MILESTONES, MILESTONE_GROUPS, milestoneProgress } from '../game/milestones'
import { repSourceLabel } from '../game/rep'
import { Collapse, bigScreen } from '../ui/Collapse'
import { confirmDialog } from '../ui/dialog'
import CreditPanel from './CreditPanel'
import Books from './Books'
import { toast } from '../ui/dialog'

// 👤 You → Career: the money and standing half of the player.
//
// These panels used to live on a Stats tab, which was a screen you READ. That was the whole
// problem with it: your job, your credit line and your reputation are things you ACT on, and
// they sat filed under analytics next to a rip log. They belong with the rest of what is
// yours — so this is where they live now, and the Stats tab is gone.
export default function Career() {
  const cash = useGame(s => s.cash)
  const worth = useGame(s => netWorthFull(s))
  const storeCredit = useGame(s => s.storeCredit || 0)
  const lgsCredit = useGame(s => s.lgsCredit || 0)
  const loan = useGame(s => s.loan)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const milestones = useGame(s => s.milestones || [])

  // 💳 The distributor line. Read-only here — the pay-mode toggle belongs on the Buy tab,
  // where it decides what a buy button charges; here it is simply part of your money.
  const creditBalance = useGame(s => s.credit?.balance || 0)
  const creditFrozen = useGame(s => !!s.credit?.frozen)
  const creditLimitV = useGame(s => s.creditLimit())
  const creditAvail = useGame(s => s.creditAvailable())
  const creditMin = useGame(s => s.creditMinimum())
  const payCredit = useGame(s => s.payCredit)

  return (
    <>
      <div className="stat-group-h">Money</div>
      <div className="statgrid">
        <Stat label="Net worth" v={fmtMoney(worth)} c="var(--green)" />
        <Stat label="Cash on hand" v={fmtMoney(cash)} />
        {lgsCredit > 0 && <Stat label="LGS store credit" v={fmtMoney(lgsCredit)} />}
        {storeCredit > 0 && <Stat label="Credit you've issued" v={fmtMoney(storeCredit)} c="var(--red)" />}
        {loan && <Stat label="Bank note outstanding" v={fmtMoney(loan.balance || 0)} c="var(--red)" />}
      </div>

      <CreditPanel balance={creditBalance} limit={creditLimitV} avail={creditAvail} min={creditMin}
        frozen={creditFrozen} cash={cash} payMode="cash" setPayMode={null}
        onPay={(amt) => { const paid = payCredit(amt); if (paid > 0) toast(`Paid ${fmtMoney(paid)} toward your credit line.`) }} />

      <FinanceCard />
      <RepPanel />
      <MilestoneShelf unlocked={milestones} />
      {/* 🧾 The books are the STORE's ledger once there is a store — they move to
          Store → Financials then, so a shop owner reads their accounts in one place. */}
      {!hasStore && <Books />}
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
  const storage = useGame(s => s.storageStatus())

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
          <div className="cap">
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
      {storage.fee > 0 && (
        <div className="finance-warn" style={{ background: '#ff9f4315', borderColor: '#ff9f4340', color: '#ffcf9e' }}>
          📦 Storage −{fmtMoney(storage.fee)}/day — {storage.units} idle sealed in the back ({storage.free} free). Put it on the floor, list it, rip it, or flip it — only the untouched hoard bleeds.
        </div>
      )}
      {/* Full-time sustainability readout (Phase 3) */}
      <div className="cap" style={{ margin: '6px 0' }}>
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
              onClick={() => takeJob(j.id)}>
              <span className="jobname">{j.title}</span>
              <span className="jobwage">${j.wage}/d{locked ? ` · 🔒${j.minNoto}` : j.start > 0 ? ` · starts in ${j.start}d` : ''}</span>
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
    </div>
  )
}

// Net-worth trend over the recent window (one sample per day-advance). Shows the sparkline
// plus the change across the window — the "am I actually building wealth?" hook.
// ⭐ The reputation panel — the rework's legibility layer. Current rank, the NEXT rank's
// checklist (⭐ threshold + any-2-of-3 deeds, always visible so the climb is a to-do list
// rather than a mystery number), the 🔥 heat meter, the 🎫 clout wallet, and a 7-day
// source-attributed breakdown of where reputation actually came from (repLedger).
function RepPanel() {
  const { notoriety, hype, clout, rank, repLedger } = useGame(useShallow(s => ({
    notoriety: s.notoriety, hype: s.hype || 0, clout: s.clout || 0, rank: s.rank || 0,
    repLedger: s.repLedger || { today: {}, days: [] },
  })))
  const cur = RANKS[Math.min(rank, RANKS.length - 1)]
  const next = RANKS[rank + 1] || null
  // Deed progress for the next rank, selected as raw numbers (useShallow keeps it cheap).
  const deedVals = useGame(useShallow(s => next ? next.deeds.map(d => d.value(s)) : []))
  const deedsHave = next ? next.deeds.filter((d, i) => (deedVals[i] || 0) >= d.goal).length : 0
  const notoPct = next ? Math.min(100, Math.round((notoriety / next.min) * 100)) : 100
  // Roll the week's attribution together: the 7-day ring + today's live map.
  const weekly = {}
  for (const day of (repLedger.days || [])) for (const [tag, v] of Object.entries(day.srcs || {})) weekly[tag] = round2((weekly[tag] || 0) + v)
  for (const [tag, v] of Object.entries(repLedger.today || {})) weekly[tag] = round2((weekly[tag] || 0) + v)
  const weekRows = Object.entries(weekly).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
  const weekTotal = round2(Object.values(weekly).reduce((a, v) => a + v, 0))
  const todayTotal = round2(Object.values(repLedger.today || {}).reduce((a, v) => a + v, 0))
  const sparkPts = [...(repLedger.days || []).map(d => d.total || 0), todayTotal]
  return (
    <Collapse id="rep" defaultOpen={bigScreen()} className="trend-card" headClass="rep-head"
      head="⭐ Reputation"
      badge={`${cur.emoji} ${cur.name} · ⭐ ${Math.round(notoriety)}${hype >= 10 ? ` · 🔥 ${Math.round(hype)}` : ''}${clout >= 1 ? ` · 🎫 ${Math.floor(clout)}` : ''}`}>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 8 }}>
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <div className="t-lg" style={{ fontWeight: 800 }}>{cur.emoji} {cur.name} <span className="cap" style={{ fontWeight: 400 }}>· rank {rank}/{RANKS.length - 1}</span></div>
          {cur.perk && <div className="cap mt-1">Perk held: {cur.perk}</div>}
          {next ? (
            <>
              <div className="t-sm" style={{ marginTop: 10, fontWeight: 700 }}>Next: {next.emoji} {next.name}</div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, height: 10, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ width: notoPct + '%', height: '100%', background: 'linear-gradient(90deg,#5ec98a,var(--gold))', transition: 'width .4s' }} />
              </div>
              <div className="rep-deed mt-3">
                <span>{notoriety >= next.min ? '✅' : '⬜'} Reach ⭐ {next.min}</span>
                <span className="muted">{Math.round(notoriety)} / {next.min}</span>
              </div>
              <div className="cap" style={{ margin: '6px 0 2px' }}>…and any {DEEDS_NEEDED} of these deeds ({deedsHave}/{DEEDS_NEEDED} done):</div>
              {next.deeds.map((d, i) => {
                const have = deedVals[i] || 0
                const done = have >= d.goal
                return (
                  <div className="rep-deed" key={d.label}>
                    <span>{done ? '✅' : '⬜'} {d.label}</span>
                    <span className="muted">{Math.min(have, d.goal).toLocaleString()} / {d.goal.toLocaleString()}</span>
                  </div>
                )
              })}
              {next.perk && <div className="cap mt-3">Rank-up banks: {next.perk} · +{next.clout} 🎫</div>}
            </>
          ) : (
            <div className="cap t-sm mt-5">👑 Top of the ladder — the hobby knows your name.</div>
          )}
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          {hype > 0.5 && (
            <div style={{ marginBottom: 10 }}>
              <div className="t-sm" style={{ fontWeight: 700 }}>🔥 Shop heat <span className="muted" style={{ fontWeight: 400 }}>· {Math.round(hype)}/100</span></div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, height: 8, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: Math.min(100, hype) + '%', height: '100%', background: 'linear-gradient(90deg,#ff9f43,#ff3df0)' }} />
              </div>
              <div className="cap mt-2">Big moments heat the shop — more buyers everywhere while it lasts. Fades over days; a little settles into ⭐.</div>
            </div>
          )}
          <div className="t-sm" style={{ fontWeight: 700 }}>🎫 Clout <span className="muted" style={{ fontWeight: 400 }}>· {Math.floor(clout)} favor{Math.floor(clout) === 1 ? '' : 's'}</span></div>
          <div className="cap mt-2">
            Earned on rank-ups, god packs, big milestones, clean-sweep goal weeks. Spend it where it's needed:
            📦 restock a distributor (Buy tab) · 📰 jump a reprint queue · ⚡ expedite grading (Bench) · 🎪 talk into a bigger show (Calendar) · 📣 boost a stream.
          </div>
          <div className="t-sm" style={{ fontWeight: 700, marginTop: 12 }}>📒 This week <span className="muted" style={{ fontWeight: 400 }}>· {weekTotal >= 0 ? '+' : ''}{weekTotal}⭐</span></div>
          {weekRows.length ? weekRows.map(([tag, v]) => (
            <div className="rep-deed" key={tag}>
              <span>{repSourceLabel(tag)}</span>
              <b style={{ color: v >= 0 ? 'var(--gold)' : 'var(--red)' }}>{v >= 0 ? '+' : ''}{v}</b>
            </div>
          )) : <div className="cap">Nothing yet — sell, stream, host, help.</div>}
          {sparkPts.filter(v => v !== 0).length >= 2 && <Sparkline points={sparkPts} color="var(--gold)" height={34} />}
        </div>
      </div>
    </Collapse>
  )
}

function MilestoneShelf({ unlocked }) {
  const have = new Set(unlocked || [])
  const snap = useGame.getState()
  // Collapsed by default on a phone. This is a 38-tile trophy case across 12 groups — roughly
  // 2.5 screens of mostly-locked tiles — and it sat expanded in the middle of the Stats page,
  // between the cash-flow summary and the by-set table. It pushed everything after it out of
  // reach and made the page 6.4 screens of continuous scroll. Reputation and Luck on this same
  // page are already Collapse sections, so this just follows the page's own idiom rather than
  // inventing a sub-tab. Desktop keeps it open (bigScreen), where the height is free.
  return (
    <Collapse id="milestones" defaultOpen={bigScreen()}
      head="🏅 Milestones"
      badge={`${have.size}/${MILESTONES.length}`}
      hint="Long-run goals — ripping, hits, wealth, grading, the circuit and more.">
      {MILESTONE_GROUPS.map(group => (
        <div key={group} style={{ marginBottom: 12 }}>
          <div className="cap" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>{group}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MILESTONES.filter(m => m.group === group).map(m => {
              const done = have.has(m.id)
              const pct = done ? 1 : milestoneProgress(snap, m)
              return (
                <div key={m.id}
                  style={{
                    width: 132, padding: '7px 9px', borderRadius: 8,
                    border: `1px solid ${done ? 'var(--gold)' : 'rgba(255,255,255,0.10)'}`,
                    background: done ? 'rgba(255,190,60,0.10)' : 'rgba(255,255,255,0.03)',
                    opacity: done ? 1 : 0.62,
                  }}>
                  <div className="t-lg" style={{ lineHeight: 1.2 }}>{done ? m.icon : '🔒'}</div>
                  <div className="t-xs" style={{ fontWeight: 600, color: done ? 'var(--gold)' : 'var(--txt)' }}>{m.name}</div>
                  <div className="cap">{m.desc}</div>
                  {!done && (
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.10)', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'var(--gold)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </Collapse>
  )
}
