import { useState } from 'react'
import { useGame, EMPLOYEES, RIVAL_PROMO_GATE, BRANCH_LEASE_PER_DAY, BRANCH_SALE_SHARE, employeeById } from '../game/store'
import { fmtMoney, cardValue, sealedValue } from '../game/engine'

// 🏪 + 🏬 — the two halves of "you are not the only shop in this town".
//
// The rival is a competitor you can actually fight: their heat is a daily tug-of-war you
// move with things you already do. The branch is the other direction — you stop being one
// shop and become two, with all the overhead that implies.
export default function TownRivalry() {
  const rival = useGame(s => s.rival)
  const hasBranchUpgrade = useGame(s => !!s.upgrades.secondLocation)
  if (!rival && !hasBranchUpgrade) return null
  return (
    <>
      {rival && <RivalPanel rival={rival} />}
      {hasBranchUpgrade && <BranchPanel />}
    </>
  )
}

function RivalPanel({ rival }) {
  const heat = Math.round(rival.heat ?? 0)
  // Heat is THEIR share of the town. Green = you're winning it back.
  const tone = heat >= RIVAL_PROMO_GATE ? 'var(--red)' : heat >= 45 ? 'var(--gold)' : 'var(--green)'
  const state = heat >= RIVAL_PROMO_GATE ? 'beating you in town'
    : heat >= 45 ? 'holding their own' : 'losing ground to you'
  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head">
        🏪 {rival.name} <span className="muted">— the shop across town, {state}</span>
      </div>
      <div style={{ padding: '4px 2px 2px' }}>
        <div style={{ background: 'var(--bg)', borderRadius: 8, height: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
          <div style={{ width: `${heat}%`, height: '100%', background: tone, transition: 'width .3s' }} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 11.5 }}>their share of the town: <b style={{ color: tone }}>{heat}%</b></span>
          <span className="muted" style={{ fontSize: 11.5 }}>promotions start at {RIVAL_PROMO_GATE}%</span>
        </div>
        {rival.promo ? (
          <div className="banner" style={{ marginTop: 8, borderColor: 'var(--red)' }}>
            📣 They're running <b>{rival.promo.label}</b> — <b style={{ color: 'var(--red)' }}>−{Math.round((rival.promo.drag || 0) * 100)}% walk-ins</b> for
            you, {rival.promo.daysLeft} more day{rival.promo.daysLeft === 1 ? '' : 's'}. Host a night, run a giveaway, or just be the better-stocked shop.
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 2 }}>
            They gain ground every day you coast. It comes back down when you host events, give cards away,
            post a generous buylist, keep a full shop floor, and build a name — and it climbs when the town
            keeps asking you for things you don't have.
          </p>
        )}
      </div>
    </div>
  )
}

function BranchPanel() {
  const branch = useGame(s => s.secondLoc)
  const openBranch = useGame(s => s.openBranch)
  const sendToBranch = useGame(s => s.sendToBranch)
  const recallFromBranch = useGame(s => s.recallFromBranch)
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const [mgr, setMgr] = useState('manager')
  const [note, setNote] = useState(null)
  const [batch, setBatch] = useState(10)

  // Everything eligible to send: storeroom stock only. Floor stock is what the MAIN shop
  // sells; keepsakes, holds and earmarked special orders are spoken for.
  const eligible = [
    ...collection.filter(c => !c.locked && !c._heldFor && c.loc !== 'floor').map(c => ({ uid: c.uid, v: cardValue(c) })),
    ...(sealedInventory || []).filter(it => !it.locked && !it._heldFor && it.loc !== 'floor' && !it._specialOrder)
      .map(it => ({ uid: it.uid, v: sealedValue(it) })),
  ].sort((a, b) => b.v - a.v)

  if (!branch?.open) {
    const wage = employeeById(mgr)?.wage || 0
    return (
      <div className="market-panel" style={{ marginTop: 12 }}>
        <div className="market-head">🏬 Second location <span className="muted">— closed</span></div>
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 2px 8px' }}>
          A satellite shop run by a manager, trading at about {Math.round(BRANCH_SALE_SHARE * 100)}% of this store's
          daily volume out of stock you send over. It costs <b>{fmtMoney(BRANCH_LEASE_PER_DAY)}/day</b> in lease plus
          the manager's wage <b>whether or not you keep it stocked</b> — an empty branch is just a hole in the floor.
        </p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>Who runs it:</span>
          {EMPLOYEES.map(e => (
            <button key={e.id} className={`btn ${mgr === e.id ? 'gold' : 'alt'}`} style={{ flex: 'none', padding: '4px 10px', fontSize: 12 }}
              title={e.desc} onClick={() => setMgr(e.id)}>{e.title} · ${e.wage}/d</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn gold" style={{ maxWidth: 280 }} onClick={() => {
            const r = openBranch(mgr)
            setNote(r?.error || `Branch open — overhead ${fmtMoney(BRANCH_LEASE_PER_DAY + wage)}/day. Send it stock.`)
          }}>🏬 Open the second location</button>
        </div>
        {note && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{note}</p>}
      </div>
    )
  }

  const stockN = (branch.cards || []).length + (branch.sealed || []).length
  const stockValue = (branch.cards || []).reduce((a, c) => a + cardValue(c), 0)
    + (branch.sealed || []).reduce((a, it) => a + sealedValue(it), 0)
  const wage = employeeById(branch.managerId)?.wage || 0
  const overhead = BRANCH_LEASE_PER_DAY + wage
  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head">
        🏬 Second location <span className="muted">— {employeeById(branch.managerId)?.title || 'manager'} running it, {fmtMoney(overhead)}/day overhead</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '4px 0 8px' }}>
        <span className="pill" style={{ color: stockN ? undefined : 'var(--red)' }}>📦 {stockN} item{stockN === 1 ? '' : 's'} · {fmtMoney(stockValue)}</span>
        <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }}>
          💰 {fmtMoney(branch.revenue || 0)} lifetime · {branch.sold || 0} sold
        </span>
        {(branch.arrears || 0) > 0 && <span className="pill" style={{ color: 'var(--red)' }}>⚠️ {branch.arrears}d behind on overhead</span>}
      </div>
      {!stockN && (
        <div className="banner" style={{ borderColor: 'var(--red)', marginBottom: 8 }}>
          It's open, staffed, and empty. It will keep charging you {fmtMoney(overhead)} a day until you send it something to sell.
        </div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>Send the storeroom's best:</span>
        {[5, 10, 25].map(n => (
          <button key={n} className={`btn ${batch === n ? 'gold' : 'alt'}`} style={{ flex: 'none', padding: '4px 10px', fontSize: 12 }}
            onClick={() => setBatch(n)}>{n}</button>
        ))}
        <button className="btn alt" style={{ flex: 'none', maxWidth: 170 }}
          disabled={!eligible.length}
          title={eligible.length ? 'Sends your highest-value storeroom stock — floor stock, keepsakes and holds stay put' : 'Nothing in the storeroom to send'}
          onClick={() => {
            const r = sendToBranch(eligible.slice(0, batch).map(x => x.uid))
            setNote(r?.error || `Sent ${r.sent} item${r.sent === 1 ? '' : 's'} over.`)
          }}>🚚 Send {Math.min(batch, eligible.length)} over</button>
        <button className="btn alt" style={{ flex: 'none', maxWidth: 150 }} disabled={!stockN}
          onClick={() => { const r = recallFromBranch(); setNote(r?.error || `Recalled ${r.recalled} item${r.recalled === 1 ? '' : 's'}.`) }}>
          ↩︎ Recall all stock
        </button>
      </div>
      {note && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{note}</p>}
    </div>
  )
}
