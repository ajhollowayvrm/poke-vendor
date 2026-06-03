import { useGame, UPGRADES, PAYMENT_METHODS, acceptedMethods } from '../game/store'

export default function UpgradeShop() {
  const cash = useGame(s => s.cash)
  const owned = useGame(s => s.upgrades)
  const buy = useGame(s => s.buyUpgrade)
  const accepted = acceptedMethods(owned)

  return (
    <>
      <p className="muted" style={{ marginTop: 16 }}>Permanent upgrades — buy once, keep forever. The big ones change how you do business.</p>

      <div className="paystatus">
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Payments accepted:</span>
        {Object.entries(PAYMENT_METHODS).map(([k, m]) => (
          <span key={k} className="pill" style={{ opacity: accepted.has(k) ? 1 : 0.4 }}>
            {m.icon} {m.short}{accepted.has(k) ? '' : ' 🔒'}
            {m.feePct > 0 && <small style={{ opacity: .7 }}> · {(m.feePct*100).toFixed(1)}%{m.feeFlat ? `+$${m.feeFlat.toFixed(2)}` : ''}</small>}
          </span>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>· card rails skim a processing fee; cash & Venmo are free</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))' }}>
        {Object.entries(UPGRADES).map(([key, u]) => {
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
                : <button className="btn gold" disabled={cash < u.cost} onClick={() => buy(key)}>Buy · ${u.cost}</button>}
            </div>
          )
        })}
      </div>
    </>
  )
}
