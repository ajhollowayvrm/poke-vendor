import { useMemo } from 'react'
import { useGame } from '../game/store'
import { trustTier, cardMatchesFocus } from '../game/shows'
import { fmtMoney, cardValue } from '../game/engine'

// The customer rolodex. Your persistent, named buyers — each with what they collect,
// how much they trust you, and how much you've sold them over time. Regulars form on
// their own when you treat anonymous walk-ups/online buyers well; tend the relationship
// (fair deals, fill their lane) and they pay better and come back more.
const CHANNEL = { online: { icon: '💬', label: 'Online buyer' }, walkin: { icon: '🏪', label: 'In-store regular' } }
const TIER_COLOR = { VIP: '#ffd700', Friend: '#7cf0ff', Regular: '#5ec98a', Acquaintance: '#9aa3b2', 'New face': '#9aa3b2' }

export default function Regulars() {
  const regulars = useGame(s => s.regulars) || []
  const collection = useGame(s => s.collection)
  const listings = useGame(s => s.listings)
  const hasStore = useGame(s => !!s.upgrades.storefront)

  // The cards a regular could actually buy from you right now: online buyers shop your
  // LISTINGS, in-store regulars shop your whole STORE STOCK (everything not 🔒 kept or
  // held). Surfaces "you're holding what they want."
  const poolFor = useMemo(() => ({
    online: (listings || []).map(l => l.card),
    walkin: hasStore ? (collection || []).filter(c => !c.locked && !c._heldFor) : [],
  }), [listings, collection, hasStore])

  const sorted = useMemo(() => [...regulars].sort((a, b) =>
    (a.flags?.burned ? 1 : 0) - (b.flags?.burned ? 1 : 0) || (b.trust || 0) - (a.trust || 0)
  ), [regulars])

  if (!regulars.length) {
    return (
      <div className="empty mt-7">
        <p className="t-lg">🤝 No regulars yet</p>
        <p className="muted">Treat your walk-in and online customers well — fair deals, filling what they
          collect, the odd act of generosity — and some of them will start coming back. Your regulars
          will show up here, each with what they collect and how much they trust you.</p>
      </div>
    )
  }

  return (
    <div className="regulars-wrap">
      <p className="cap" style={{ margin: '4px 2px 12px' }}>
        Your repeat customers. The more they trust you, the better they pay — and the more often it's a
        familiar face at the counter instead of a stranger. Neglect them and the relationship cools.
      </p>
      <div className="regulars-grid stagger-grid">
        {sorted.map(r => {
          const tier = trustTier(r.trust)
          const ch = CHANNEL[r.channel] || CHANNEL.online
          const matches = (poolFor[r.channel] || []).filter(c => cardMatchesFocus(c, r.focus))
          const matchVal = matches.reduce((a, c) => a + cardValue(c), 0)
          const color = TIER_COLOR[tier.label] || '#9aa3b2'
          return (
            <div key={r.id} className={`regular-card ${r.flags?.burned ? 'burned' : ''}`}>
              <div className="reg-top">
                <span className="reg-avatar lg" aria-hidden>{r.emoji}</span>
                <div className="reg-id">
                  <div className="reg-name">{r.name}{r.flags?.burned && <span className="reg-burned"> · lost</span>}</div>
                  <div className="cap">{ch.icon} {ch.label} · {r.archLabel}</div>
                </div>
                <span className="reg-tier-pill" style={{ color, borderColor: color + '66' }}>{tier.label}</span>
              </div>

              <div className="reg-trust">
                <div className="reg-trust-bar"><div style={{ width: Math.round(r.trust || 0) + '%', background: color }} /></div>
                <span className="cap">Trust {Math.round(r.trust || 0)}</span>
              </div>

              <div className="reg-focus-line">🎯 {r.focus?.label || 'hunting good deals'}</div>

              <div className="reg-stats">
                <span>🛒 {fmtMoney(r.spentTotal || 0)} spent</span>
                <span>👋 {r.visits || 0} visit{r.visits === 1 ? '' : 's'}</span>
              </div>

              {!r.flags?.burned && r.request && !matches.length && (
                <div className="reg-hint call">📞 Called you — asked you to stock {r.request.line}</div>
              )}
              {!r.flags?.burned && (
                matches.length
                  ? <div className="reg-hint hot">📦 You're holding {matches.length} {matches.length === 1 ? 'card' : 'cards'} they want (~{fmtMoney(matchVal)})</div>
                  : <div className="reg-hint">Nothing in their lane {r.channel === 'online' ? 'listed' : 'on the shelf'} right now</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
