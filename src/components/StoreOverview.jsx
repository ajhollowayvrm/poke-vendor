import { useState } from 'react'
import { useGame, EMPLOYEES, employeeById, STORE_LEASE_PER_DAY, STORE_GRACE_DAYS } from '../game/store'
import { fmtMoney, shopName, shopIcon } from '../game/engine'
import { floorCapacity, floorCount } from '../game/store/constants'
import TownRivalry from './TownRivalry'
import { Collapse, bigScreen } from '../ui/Collapse'

// 🏬 Store → Overview: the front of house at a glance.
//
// The Sell tab used to be one screen whether you were a flipper with a phone or the owner of
// a shop with a lease, a floor and a payroll. Once there IS a shop, the first thing it should
// answer is "how is my store doing" — the sign over the door, what the lease and the payroll
// cost, how full the floor is, and who is competing for the same walk-ins. Everything you DO
// moved to its own sub-tab; this is the one you land on.
export default function StoreOverview() {
  const store = useGame(s => s.store)
  const capacity = useGame(s => floorCapacity(s))
  const onFloor = useGame(s => floorCount(s))
  const giveawayDaysLeft = useGame(s => s.giveawayDaysLeft || 0)
  const weeklyEvent = useGame(s => s.weeklyEvent)
  const storeEventPlanned = useGame(s => s.storeEventPlanned)
  const demandLog = useGame(s => s.demandLog || [])

  return (
    <>
      <div className="finance-card">
        <div className="finance-head">
          <div><div className="finance-title"><StoreSign /></div>
            <div className="cap">
              Floor {onFloor}/{capacity} · lease {fmtMoney(STORE_LEASE_PER_DAY)}/day
            </div>
          </div>
        </div>
        <div className="paystatus mt-3">
          {giveawayDaysLeft > 0 && <span className="pill">🎁 Buzz — {giveawayDaysLeft}d left</span>}
          {weeklyEvent && <span className="pill">🎪 {weeklyEvent.name || 'Weekly night'} booked</span>}
          {storeEventPlanned && <span className="pill">📅 {storeEventPlanned.name} planned</span>}
          {onFloor === 0 && <span className="pill" style={{ color: 'var(--red)' }}>Nothing on the floor</span>}
        </div>
      </div>

      <StorePanel />
      <StoreBranding />
      <TownRivalry />

      {/* What people came in ASKING for and you did not have. The single most actionable
          thing the shop tells you, so it sits on the screen you land on. */}
      {demandLog.length > 0 && (
        <Collapse id="store-demand" defaultOpen={bigScreen()} className="wants mt-5"
          head="🔎 Asked for and missed" badge={`${demandLog.length}`}
          hint="Walk-ins who wanted something you had no copy of. Stock it and they come back.">
          <div className="paystatus">
            {demandLog.slice(0, 20).map((d, i) => (
              <span key={i} className="pill">{d.what || d.setName || 'something'}</span>
            ))}
          </div>
        </Collapse>
      )}
    </>
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
      <div className="store-panel muted t-xs">
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
        <StoreSign /> <span className="cap" style={{ fontWeight: 600 }}>
        — lease ${STORE_LEASE_PER_DAY}/day{payroll ? ` + payroll $${payroll}/day` : ''}</span></div>
      {storeArrears > 0 && (
        <div className="finance-warn">⚠️ Behind on store overhead ({storeArrears}/{STORE_GRACE_DAYS} days). Cover it or you'll lose the shop.</div>
      )}
      <div className="cap" style={{ margin: '4px 0 6px' }}>
        Employees boost order throughput (and mind the shop while you're at shows) — but each is daily payroll. Balance it.
      </div>
      <div className="emp-grid">
        {EMPLOYEES.map(e => (
          <div className="emp-row" key={e.id}>
            <div style={{ flex: 1 }}>
              <div className="t-sm" style={{ fontWeight: 700 }}>{e.title} {counts[e.id] ? <span className="emp-count">×{counts[e.id]}</span> : null}</div>
              <div className="cap">${e.wage}/day · +{Math.round(e.throughput*100)}% orders</div>
            </div>
            {counts[e.id] ? <button className="btn alt btn-fixed" style={{ maxWidth: 64 }} onClick={() => fire(e.id)}>Fire</button> : null}
            <button className="btn btn-fixed" style={{ maxWidth: 64 }} onClick={() => hire(e.id)}>Hire</button>
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
      <span className="t-xl">{shopIcon(store)}</span>{' '}
      <b style={accent ? { color: accent } : undefined}>{shopName(store)}</b>
      {store?.tagline?.trim() ? <span className="cap" style={{ fontWeight: 600, fontStyle: 'italic' }}> — “{store.tagline.trim()}”</span> : null}
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
                  onClick={() => setStoreIdentity({ icon: ic })} aria-label={`Use ${ic} as shop icon`}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="store-branding-field">
            <span>Accent</span>
            <div className="store-branding-swatches">
              <button className={`store-accent-chip ${!accent ? 'active' : ''}`} onClick={() => setStoreIdentity({ accent: '' })}
                style={{ fontSize: 'var(--fs-xs)' }}>Default</button>
              {SHOP_ACCENTS.map(col => (
                <button key={col} className={`store-accent-chip ${accent === col ? 'active' : ''}`}
                  onClick={() => setStoreIdentity({ accent: col })} aria-label={`Accent ${col}`}
                  style={{ background: col }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
