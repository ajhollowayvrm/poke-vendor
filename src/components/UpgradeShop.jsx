import { useState, useCallback, useMemo } from 'react'
import { toast } from '../ui/dialog'
import { useGame, UPGRADES, PAYMENT_METHODS, acceptedMethods } from '../game/store'
import { fmtMoney } from '../game/engine'
import { Collapse } from '../ui/Collapse'

// The catalog is 50+ cards now — far too much to scroll flat, especially on a phone.
// Grouped into themed collapsible sections; each header shows owned/total plus the
// cheapest still-buyable item so a closed group still tells you if it's worth opening.
// Any UPGRADES key missing from the map lands in "More" so a new upgrade can never
// silently vanish from the shop.
const GROUPS = [
  { id: 'major', name: '⭐ Major upgrades', open: true,
    keys: ['storefront', 'importLicense', 'sponsorship', 'vault'] },
  { id: 'store', name: '🏬 Store & floor',
    keys: ['staff', 'signage', 'cases', 'packBin', 'packWall', 'vendUnit', 'secondBin', 'binKeeper',
      'snackCooler', 'giftWrap', 'eventsCoordinator', 'newsletter', 'security', 'consignCase', 'autoHold'] },
  { id: 'sell', name: '💸 Selling & payments',
    keys: ['payPaypal', 'payCard', 'payTap', 'shipStation', 'smartphone', 'autoSell', 'offerDesk', 'repricer', 'wantBroker'] },
  { id: 'source', name: '📦 Sourcing & finance',
    keys: ['network', 'vintageScout', 'standingOrder', 'purchasingAgent', 'preferredAccount', 'buyAd',
      'appraisalDesk', 'authkit', 'storageUnit', 'hobbyWire', 'almanac'] },
  { id: 'grade', name: '🔍 Grading & collection',
    keys: ['loupe', 'gradescope', 'graderAccount', 'submissionRunner', 'autoBinder'] },
  { id: 'stream', name: '🔴 Stream & repacks',
    keys: ['streaming', 'ripService', 'clipEditor', 'modTeam', 'wrapPress'] },
  { id: 'content', name: '📱 Content & audience',
    keys: ['shortsChannel', 'contentCalendar', 'setChallenge', 'showVlog', 'discord',
      'collabs', 'podcast', 'brandDeals'] },
  { id: 'shows', name: '🎪 Shows & community',
    keys: ['vendorSetup', 'ticker', 'tourVan', 'banner'] },
]

export default function UpgradeShop() {
  const cash = useGame(s => s.cash)
  const owned = useGame(s => s.upgrades)
  const buy = useGame(s => s.buyUpgrade)
  const accepted = acceptedMethods(owned)
  const flash = useCallback(m => toast(m, 2800), [])

  function purchase(key, u) {
    if (buy(key)) flash(`${u.icon} ${u.name} unlocked — ${fmtMoney(u.cost)} spent.`)
  }

  // Resolve the groups against the live catalog; sweep unmapped keys into "More".
  const groups = useMemo(() => {
    const mapped = new Set(GROUPS.flatMap(g => g.keys))
    const extra = Object.keys(UPGRADES).filter(k => !mapped.has(k))
    const all = extra.length ? [...GROUPS, { id: 'more', name: '🧰 More', keys: extra }] : GROUPS
    return all.map(g => ({ ...g, keys: g.keys.filter(k => UPGRADES[k]) })).filter(g => g.keys.length)
  }, [])

  return (
    <>
      <p className="muted mt-6">Permanent upgrades — buy once, keep forever. The big ones change how you do business.</p>

      <div className="paystatus">
        <span className="cap t-sm" style={{ fontWeight: 700 }}>Payments accepted:</span>
        {Object.entries(PAYMENT_METHODS).map(([k, m]) => (
          <span key={k} className="pill" style={{ opacity: accepted.has(k) ? 1 : 0.4 }}>
            {m.icon} {m.short}{accepted.has(k) ? '' : ' 🔒'}
            {m.feePct > 0 && <small style={{ opacity: .7 }}> · {(m.feePct*100).toFixed(1)}%{m.feeFlat ? `+$${m.feeFlat.toFixed(2)}` : ''}</small>}
          </span>
        ))}
        <span className="cap">· card rails skim a processing fee; cash & Venmo are free</span>
      </div>

      {groups.map(g => {
        const nOwned = g.keys.filter(k => owned[k]).length
        // Cheapest still-buyable line (prereqs met) — the closed header's "worth opening?" read.
        const next = g.keys
          .filter(k => !owned[k] && (!UPGRADES[k].needs || owned[UPGRADES[k].needs]))
          .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
        return (
          <Collapse key={g.id} id={`upg-${g.id}`} className="wants mt-6" 
            head={g.name} defaultOpen={!!g.open}
            badge={`${nOwned}/${g.keys.length}${next ? ` · next ${UPGRADES[next].icon} ${fmtMoney(UPGRADES[next].cost)}` : nOwned === g.keys.length ? ' ✓' : ''}`}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', marginTop: 6 }}>
              {g.keys.map(key => {
                const u = UPGRADES[key]
                const have = owned[key]
                const needsUnmet = u.needs && !owned[u.needs]
                return (
                  <div key={key} className={`product ${have?'owned':''} ${u.tier==='big'?'upgrade-big':''}`}>
                    {u.tier === 'big' && <span className="bigtag">MAJOR UPGRADE</span>}
                    <div style={{ fontSize: 34 }}>{u.icon}</div>
                    <h3 style={{ margin: 0 }}>{u.name}</h3>
                    <div className="meta" style={{ flex: 1 }}>{u.desc}</div>
                    {have ? <button className="btn" disabled>✓ Owned</button>
                      : needsUnmet ? <button className="btn" disabled>🔒 Needs {UPGRADES[u.needs].name}</button>
                      : <button className="btn gold" disabled={cash < u.cost} onClick={() => purchase(key, u)}>Buy · {fmtMoney(u.cost)}</button>}
                  </div>
                )
              })}
            </div>
          </Collapse>
        )
      })}
    </>
  )
}
