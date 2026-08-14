import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, JOBS, RENT_PER_DAY, STORE_LEASE_PER_DAY, STORE_GRACE_DAYS, EMPLOYEES, employeeById,
  RANKS, DEEDS_NEEDED, repSourceLabel } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2, SETS, shopName, shopIcon,
  pullOdds, luckTierLabel, setById } from '../game/engine'
import { MILESTONES, MILESTONE_GROUPS, milestoneProgress } from '../game/milestones'
import { Collapse, bigScreen } from '../ui/Collapse'
import { confirmDialog } from '../ui/dialog'

const SET_NAME = Object.fromEntries(SETS.map(s => [s.id, s.name]))

export default function Stats() {
  // useShallow: this selector builds a fresh object, which under plain Object.is meant
  // EVERY store write re-rendered Stats (and re-reduced the whole collection + ledger)
  // while the tab was open. Shallow-compared, it only re-renders when a selected slice
  // actually changes.
  const { stats, history, collection, cash, notoriety, showsAttended, gradesSubmitted, bySet,
    listings, consignments, shopDisplay, showInventory, pendingGrades, sealedInventory,
    showSealed, shopSealed, milestones, worthHistory, binder, ripLog } = useGame(useShallow(s => ({
    stats: s.stats, history: s.history, collection: s.collection, cash: s.cash,
    notoriety: s.notoriety, showsAttended: s.showsAttended, gradesSubmitted: s.gradesSubmitted,
    bySet: s.bySet || {},
    listings: s.listings, consignments: s.consignments, shopDisplay: s.shopDisplay,
    showInventory: s.showInventory, pendingGrades: s.pendingGrades, sealedInventory: s.sealedInventory,
    showSealed: s.showSealed, shopSealed: s.shopSealed,
    milestones: s.milestones || [], worthHistory: s.worthHistory || [], binder: s.binder || [],
    ripLog: s.ripLog || [],
  })))
  const collValue = collection.reduce((a, c) => a + cardValue(c), 0)
    + (binder || []).reduce((a, c) => a + cardValue(c), 0)
  // Cards/products held in the IN-FLIGHT buckets are moved OUT of `collection` but are still
  // your assets — count them so listing, consigning, stocking, or grading a card doesn't make
  // net worth visibly drop with no offsetting gain.
  const onMarket =
    (listings || []).reduce((a, l) => a + cardValue(l.card), 0) +
    (consignments || []).reduce((a, c) => a + (c.net || 0), 0) +
    (shopDisplay || []).reduce((a, c) => a + cardValue(c), 0) +
    (showInventory || []).reduce((a, c) => a + cardValue(c), 0) +
    (pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0) +
    (sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0) +
    (showSealed || []).reduce((a, it) => a + sealedValue(it), 0) +
    (shopSealed || []).reduce((a, it) => a + sealedValue(it), 0)
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
      <RepPanel />
      <FinanceCard />
      <div className="statgrid">
        <Stat label="Net worth" v={fmtMoney(netWorth)} c="var(--green)" />
        <Stat label="Cash" v={fmtMoney(cash)} />
        <Stat label="Collection value" v={fmtMoney(collValue)} />
        <Stat label="Realized P/L" v={`${pnl>=0?'+':''}${fmtMoney(pnl)}`} c={pnl>=0?'var(--green)':'var(--red)'} />
        <Stat label="Reputation" v={Math.round(notoriety)} c="var(--gold)" />
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

      <NetWorthTrend worthHistory={worthHistory} netWorth={netWorth} />
      <IncomeBreakdown history={history} />

      <MilestoneShelf unlocked={milestones} />

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

      <RipLogPanel log={ripLog} />
      <LuckPanel bySet={bySet} />

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

// Tiny dependency-free SVG sparkline. Scales the series to fit; optional soft area fill.
function Sparkline({ points, color = 'var(--green)', height = 46 }) {
  const vals = (points || []).filter(v => typeof v === 'number' && isFinite(v))
  if (vals.length < 2) return null
  const w = 260, h = height, pad = 3
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const X = i => pad + (i / (vals.length - 1)) * (w - pad * 2)
  const Y = v => pad + (1 - (v - min) / range) * (h - pad * 2)
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${X(vals.length - 1).toFixed(1)},${h - pad} L${X(0).toFixed(1)},${h - pad} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <path d={area} fill={color} opacity="0.13" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
      head={<h3 style={{ margin: 0, display: 'inline' }}>⭐ Reputation</h3>}
      badge={`${cur.emoji} ${cur.name} · ⭐ ${Math.round(notoriety)}${hype >= 10 ? ` · 🔥 ${Math.round(hype)}` : ''}${clout >= 1 ? ` · 🎫 ${Math.floor(clout)}` : ''}`}>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 8 }}>
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{cur.emoji} {cur.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· rank {rank}/{RANKS.length - 1}</span></div>
          {cur.perk && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Perk held: {cur.perk}</div>}
          {next ? (
            <>
              <div style={{ marginTop: 10, fontWeight: 700, fontSize: 13 }}>Next: {next.emoji} {next.name}</div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, height: 10, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ width: notoPct + '%', height: '100%', background: 'linear-gradient(90deg,#5ec98a,var(--gold))', transition: 'width .4s' }} />
              </div>
              <div className="rep-deed" style={{ marginTop: 6 }}>
                <span>{notoriety >= next.min ? '✅' : '⬜'} Reach ⭐ {next.min}</span>
                <span className="muted">{Math.round(notoriety)} / {next.min}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '6px 0 2px' }}>…and any {DEEDS_NEEDED} of these deeds ({deedsHave}/{DEEDS_NEEDED} done):</div>
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
              {next.perk && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Rank-up banks: {next.perk} · +{next.clout} 🎫</div>}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>👑 Top of the ladder — the hobby knows your name.</div>
          )}
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          {hype > 0.5 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🔥 Shop heat <span className="muted" style={{ fontWeight: 400 }}>· {Math.round(hype)}/100</span></div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, height: 8, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: Math.min(100, hype) + '%', height: '100%', background: 'linear-gradient(90deg,#ff9f43,#ff3df0)' }} />
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Big moments heat the shop — more buyers everywhere while it lasts. Fades over days; a little settles into ⭐.</div>
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: 13 }}>🎫 Clout <span className="muted" style={{ fontWeight: 400 }}>· {Math.floor(clout)} favor{Math.floor(clout) === 1 ? '' : 's'}</span></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
            Earned on rank-ups, god packs, big milestones, clean-sweep goal weeks. Spend it where it's needed:
            📦 restock a distributor (Buy tab) · 📰 jump a reprint queue · ⚡ expedite grading (Bench) · 🎪 talk into a bigger show (Calendar) · 📣 boost a stream.
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 12 }}>📒 This week <span className="muted" style={{ fontWeight: 400 }}>· {weekTotal >= 0 ? '+' : ''}{weekTotal}⭐</span></div>
          {weekRows.length ? weekRows.map(([tag, v]) => (
            <div className="rep-deed" key={tag}>
              <span>{repSourceLabel(tag)}</span>
              <b style={{ color: v >= 0 ? 'var(--gold)' : 'var(--red)' }}>{v >= 0 ? '+' : ''}{v}</b>
            </div>
          )) : <div className="muted" style={{ fontSize: 12 }}>Nothing yet — sell, stream, host, help.</div>}
          {sparkPts.filter(v => v !== 0).length >= 2 && <Sparkline points={sparkPts} color="var(--gold)" height={34} />}
        </div>
      </div>
    </Collapse>
  )
}

function NetWorthTrend({ worthHistory, netWorth }) {
  const pts = (worthHistory || []).map(p => p.worth)
  const enough = pts.length >= 2
  const delta = enough ? round2(pts[pts.length - 1] - pts[0]) : 0
  const up = delta >= 0
  return (
    <div className="trend-card">
      <div className="row" style={{ alignItems: 'baseline', marginBottom: enough ? 6 : 0 }}>
        <h3 style={{ margin: 0, marginRight: 'auto' }}>📈 Net worth trend</h3>
        {enough
          ? <span className="pill" style={{ background: (up ? 'var(--green)' : 'var(--red)') + '22', color: up ? 'var(--green)' : 'var(--red)' }}>
              {up ? '▲' : '▼'} {fmtMoney(Math.abs(delta))} over {pts.length}d
            </span>
          : <span className="muted" style={{ fontSize: 12 }}>Advance a few days to chart your trend.</span>}
      </div>
      {enough
        ? <Sparkline points={pts} color={up ? 'var(--green)' : 'var(--red)'} />
        : <p className="muted" style={{ fontSize: 12, margin: 0 }}>Currently {fmtMoney(netWorth)}.</p>}
    </div>
  )
}

// Where the money came from (and went) over the recent ledger. Buckets each entry by its
// log `type` — a reliable signal (not string-parsing) — so you can see at a glance whether
// your profit is rips, sales, wants, or your day job, and what's bleeding it out.
const INCOME_SOURCES = { sell: 'Sales', want: 'Collector wants', forum: 'Forum fills',
  supply: 'Supply channel', wage: 'Wages', goal: 'Goals', complete: 'Set bonuses' }
const EXPENSE_SOURCES = { buy: 'Product', 'grade-submit': 'Grading', rent: 'Rent',
  store: 'Store overhead', hire: 'Payroll', upgrade: 'Upgrades', scam: 'Scams' }
function IncomeBreakdown({ history }) {
  const income = {}, expense = {}
  for (const h of history || []) {
    if (h.amount > 0) { const k = INCOME_SOURCES[h.type] || 'Other'; income[k] = round2((income[k] || 0) + h.amount) }
    else if (h.amount < 0) { const k = EXPENSE_SOURCES[h.type] || 'Other'; expense[k] = round2((expense[k] || 0) + -h.amount) }
  }
  const inRows = Object.entries(income).sort((a, b) => b[1] - a[1])
  const exRows = Object.entries(expense).sort((a, b) => b[1] - a[1])
  if (!inRows.length && !exRows.length) return null
  return (
    <>
      <h3 style={{ margin: '24px 0 6px' }}>Cash flow <span className="muted" style={{ fontSize: 13, fontWeight: 'normal' }}>· recent activity</span></h3>
      <div className="cashflow">
        <BreakdownCol title="💰 Income" rows={inRows} color="var(--green)" />
        <BreakdownCol title="💸 Expenses" rows={exRows} color="var(--red)" />
      </div>
    </>
  )
}
function BreakdownCol({ title, rows, color }) {
  const total = rows.reduce((a, [, v]) => a + v, 0)
  const max = rows.length ? rows[0][1] : 1
  return (
    <div className="cashflow-col">
      <div className="cashflow-head" style={{ color }}>{title}<span className="muted" style={{ float: 'right' }}>{fmtMoney(total)}</span></div>
      {rows.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nothing yet.</p> : rows.map(([label, v]) => (
        <div className="cashflow-row" key={label}>
          <span className="cashflow-label">{label}</span>
          <div className="cashflow-bar"><div style={{ width: `${Math.round((v / max) * 100)}%`, background: color }} /></div>
          <span className="cashflow-amt">{fmtMoney(v)}</span>
        </div>
      ))}
    </div>
  )
}

// Achievement badges. Unlocked ones light up gold; locked ones dim to a 🔒 with a progress
// bar toward their goal. Grouped by theme. Progress reads a live state snapshot (the panel
// re-renders as stats change, so bars stay current).
// 📜 The rip log — every rip you've done, newest first. The By-set table above answers "is this
// set good to me"; this answers "how did THAT box go", which an average can't. One line per rip
// (a 36-pack box is one line), so it reads as a history rather than a firehose.
function RipLogPanel({ log }) {
  const rows = log || []
  if (!rows.length) return null
  const wins = rows.filter(r => r.pulled >= r.cost).length
  const net = rows.reduce((a, r) => a + (r.pulled - r.cost), 0)
  return (
    <Collapse id="riplog" defaultOpen={bigScreen()}
      head={<h3 style={{ margin: 0, display: 'inline' }}>📜 Rip log</h3>}
      badge={`${wins}/${rows.length} up`}
      hint="Every rip, newest first — the boxes an average hides.">
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
        Last <b>{rows.length}</b> rip{rows.length === 1 ? '' : 's'}: <b>{wins}</b> came out ahead,{' '}
        <b style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{net >= 0 ? '+' : ''}{fmtMoney(net)}</b> across the lot.
        {net < 0 && ' That gap is the hobby working as intended — the chase is the product.'}
      </p>
      <div className="setanalytics">
        <div className="set-row set-head">
          <span>Rip</span><span>Day</span><span>Cost</span><span>Pulled</span><span>Net</span><span>Best</span>
        </div>
        {rows.map((r, i) => {
          const rnet = round2((r.pulled || 0) - (r.cost || 0))
          return (
            <div className="set-row" key={`${r.day}-${i}`}>
              <span className="set-name">
                {r.special === 'god' ? '✨ ' : r.special === 'demigod' ? '🌟 ' : ''}
                {r.name || r.setId} <span className="muted" style={{ fontWeight: 400 }}>· {r.type}{r.packs > 1 ? ` ×${r.packs}` : ''}</span>
              </span>
              <span className="muted">{r.day}</span>
              <span>{fmtMoney(r.cost || 0)}</span>
              <span style={{ color: 'var(--green)' }}>{fmtMoney(r.pulled || 0)}</span>
              <span style={{ color: rnet >= 0 ? 'var(--green)' : 'var(--red)' }}>{rnet >= 0 ? '+' : ''}{fmtMoney(rnet)}</span>
              <span className="muted" title={r.best?.name || ''}>{r.best ? fmtMoney(r.best.value) : '—'}</span>
            </div>
          )
        })}
      </div>
    </Collapse>
  )
}

// 🎲 Luck vs the odds. The game has always shown what you PULLED; this shows what the packs
// owed you. Expectation comes from engine.pullOdds() — the same tables openPack rolls against —
// times the packs you've actually opened per set, so it moves with the real rates instead of a
// second copy of them. Purely a readout: nothing here touches the economy.
//
// Two honesty rules the numbers live by. It counts from the day tracking started (`luckPacks`),
// never from lifetime packsOpened, so an old save doesn't open on a fake cold streak. And a
// verdict only appears once a tier expects 3+ — below that the ratio is noise wearing a colour.
function LuckPanel({ bySet }) {
  const luck = useMemo(() => {
    const exp = {}, obs = {}
    let packs = 0
    for (const [id, d] of Object.entries(bySet || {})) {
      const n = d.luckPacks || 0
      if (!n) continue
      const set = setById(id)
      if (!set) continue
      const odds = pullOdds(set)
      if (!Object.keys(odds).length) continue      // JP / Celebrations run their own structure
      packs += n
      for (const [t, p] of Object.entries(odds)) exp[t] = (exp[t] || 0) + p * n
      for (const [t, c] of Object.entries(d.tiers || {})) obs[t] = (obs[t] || 0) + c
    }
    const rows = [...new Set([...Object.keys(exp), ...Object.keys(obs)])]
      .map(t => ({ t, exp: exp[t] || 0, obs: obs[t] || 0 }))
      .filter(r => r.exp > 0.05 || r.obs > 0)
      .sort((a, b) => a.exp - b.exp)               // rarest first — the interesting end
    return { packs, rows, totExp: rows.reduce((a, r) => a + r.exp, 0), totObs: rows.reduce((a, r) => a + r.obs, 0) }
  }, [bySet])

  if (!luck.packs) return null
  const ratio = luck.totExp > 0 ? luck.totObs / luck.totExp : null
  const pct = ratio == null ? 0 : Math.round((ratio - 1) * 100)
  const solid = luck.totExp >= 8      // enough expected pulls for the headline to mean anything

  return (
    <Collapse id="luck" defaultOpen={bigScreen()}
      head={<h3 style={{ margin: 0, display: 'inline' }}>🎲 Luck vs the odds</h3>}
      badge={solid ? (pct === 0 ? 'dead on' : `${pct > 0 ? '+' : ''}${pct}%`) : `${luck.packs} packs`}
      hint="What you pulled against what the real pull rates owed you.">
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
        {solid
          ? <>Across <b>{luck.packs}</b> tracked pack{luck.packs === 1 ? '' : 's'} you've pulled <b>{luck.totObs}</b> chase
              card{luck.totObs === 1 ? '' : 's'} where the odds owed <b>{luck.totExp.toFixed(1)}</b> —{' '}
              <b style={{ color: pct > 0 ? 'var(--green)' : pct < 0 ? 'var(--red)' : 'var(--dim)' }}>
                {pct > 0 ? `running ${pct}% hot` : pct < 0 ? `running ${-pct}% cold` : 'dead on the odds'}</b>.
            </>
          : <>Only <b>{luck.packs}</b> tracked pack{luck.packs === 1 ? '' : 's'} so far — pull rates need a few hundred
              before a hot or cold streak means anything. Keep ripping.</>}
      </p>
      <div className="lucktable">
        <div className="luck-row luck-head"><span>Tier</span><span>Pulled</span><span>Owed</span><span>Run</span></div>
        {luck.rows.map(r => {
          const rr = r.exp > 0 ? r.obs / r.exp : null
          const judge = r.exp >= 3 && rr != null
          const col = !judge ? 'var(--dim)' : rr >= 1.15 ? 'var(--green)' : rr <= 0.85 ? 'var(--red)' : 'var(--fg)'
          return (
            <div className="luck-row" key={r.t}>
              <span className="luck-tier">{luckTierLabel(r.t)}</span>
              <span style={{ fontWeight: 800 }}>{r.obs}</span>
              <span className="muted">{r.exp < 1 ? r.exp.toFixed(2) : r.exp.toFixed(1)}</span>
              <span style={{ color: col, fontWeight: judge ? 800 : 400 }}>
                {!judge ? '—' : `${Math.round(rr * 100)}%`}
              </span>
            </div>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Counted from the day this panel arrived, so packs you ripped before it aren't in here. A “—” means
        that tier hasn't been offered enough times yet to judge.
      </p>
    </Collapse>
  )
}

function MilestoneShelf({ unlocked }) {
  const have = new Set(unlocked || [])
  const snap = useGame.getState()
  return (
    <>
      <h3 style={{ margin: '24px 0 6px' }}>
        Milestones <span className="muted" style={{ fontSize: 13, fontWeight: 'normal' }}>· {have.size}/{MILESTONES.length}</span>
      </h3>
      {MILESTONE_GROUPS.map(group => (
        <div key={group} style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>{group}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MILESTONES.filter(m => m.group === group).map(m => {
              const done = have.has(m.id)
              const pct = done ? 1 : milestoneProgress(snap, m)
              return (
                <div key={m.id}
                  title={done ? `${m.name} — ${m.desc} ✓` : `${m.desc} · ${Math.round(pct * 100)}%`}
                  style={{
                    width: 132, padding: '7px 9px', borderRadius: 8,
                    border: `1px solid ${done ? 'var(--gold)' : 'rgba(255,255,255,0.10)'}`,
                    background: done ? 'rgba(255,190,60,0.10)' : 'rgba(255,255,255,0.03)',
                    opacity: done ? 1 : 0.62,
                  }}>
                  <div style={{ fontSize: 17, lineHeight: 1.2 }}>{done ? m.icon : '🔒'}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: done ? 'var(--gold)' : 'var(--txt)' }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{m.desc}</div>
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
    </>
  )
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
      {storage.fee > 0 && (
        <div className="finance-warn" style={{ background: '#ff9f4315', borderColor: '#ff9f4340', color: '#ffcf9e' }}>
          📦 Storage −{fmtMoney(storage.fee)}/day — {storage.units} idle sealed in the back ({storage.free} free). Put it on the floor, list it, rip it, or flip it — only the untouched hoard bleeds.
        </div>
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
              title={locked ? `Unlocks at ⭐ ${j.minNoto} reputation` : `$${j.wage}/day${j.start>0?` · starts in ${j.start}d`:''}`}
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
      <StoreBranding />
      <div className="store-head">
        <StoreSign /> <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
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

// A shop's palette + emoji set for branding. Cosmetic only — chosen from a curated list so
// the sign always reads well against the panel.
const SHOP_ICONS = ['🏬', '🏪', '🎴', '🃏', '💎', '🔥', '⭐', '👑', '🎯', '🐉', '⚡', '🧧']
const SHOP_ACCENTS = ['#e5484d', '#f5a524', '#ffcb05', '#30a46c', '#3e63dd', '#8e4ec6', '#e93d82', '#00b8d9']

// The store's marquee — icon + name (+ tagline). Falls back to the generic "Your Store" until
// the owner names the place (shopName/shopIcon live in engine.js, shared across components).
function StoreSign() {
  const store = useGame(s => s.store)
  const accent = (store?.accent || '').trim()
  return (
    <>
      <span style={{ fontSize: 18 }}>{shopIcon(store)}</span>{' '}
      <b style={accent ? { color: accent } : undefined}>{shopName(store)}</b>
      {store?.tagline?.trim() ? <span className="muted" style={{ fontSize: 12, fontWeight: 600, fontStyle: 'italic' }}> — “{store.tagline.trim()}”</span> : null}
    </>
  )
}

// Editor: name the shop, give it a motto, pick an icon + accent color. All cosmetic; surfaces
// on this panel, the walk-in customer feed, and your show-booth table sign.
function StoreBranding() {
  const store = useGame(s => s.store) || {}
  const setStoreIdentity = useGame(s => s.setStoreIdentity)
  const [open, setOpen] = useState(false)
  const accent = (store.accent || '').trim()
  return (
    <div className="store-branding">
      <button className="store-branding-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        🎨 Storefront branding <span className="muted" style={{ fontWeight: 600 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="store-branding-body">
          <label className="store-branding-field">
            <span>Shop name</span>
            <input type="text" value={store.name || ''} maxLength={40} placeholder="Your Store"
              onChange={e => setStoreIdentity({ name: e.target.value })} />
          </label>
          <label className="store-branding-field">
            <span>Tagline</span>
            <input type="text" value={store.tagline || ''} maxLength={60} placeholder="Gotta sell ’em all"
              onChange={e => setStoreIdentity({ tagline: e.target.value })} />
          </label>
          <div className="store-branding-field">
            <span>Shop icon</span>
            <div className="store-branding-swatches">
              {SHOP_ICONS.map(ic => (
                <button key={ic} className={`store-icon-chip ${shopIcon(store) === ic ? 'active' : ''}`}
                  onClick={() => setStoreIdentity({ icon: ic })} title="Set shop icon">{ic}</button>
              ))}
            </div>
          </div>
          <div className="store-branding-field">
            <span>Accent</span>
            <div className="store-branding-swatches">
              <button className={`store-accent-chip ${!accent ? 'active' : ''}`} onClick={() => setStoreIdentity({ accent: '' })}
                title="Default accent" style={{ fontSize: 10 }}>Default</button>
              {SHOP_ACCENTS.map(col => (
                <button key={col} className={`store-accent-chip ${accent === col ? 'active' : ''}`}
                  onClick={() => setStoreIdentity({ accent: col })} title={col}
                  style={{ background: col }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
