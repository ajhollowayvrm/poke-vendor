import { useState, useCallback } from 'react'
import { useGame, acceptedMethods, PAYMENT_METHODS } from '../game/store'
import Encounter from './Encounter'

const CHANNEL_BADGE = { online: { label: 'Online', icon: '🌐', color: '#5aa0ff' },
  walkin: { label: 'Walk-in', icon: '🏬', color: '#ffcb05' } }

// Your storefront. Orders accrue per game-DAY — pass a day (here or by attending
// a show) to generate them. While you're away at a show, online orders need a
// Smartphone and walk-ins need a Shop Assistant, or they're missed.
export default function BoothInbox() {
  const inbox = useGame(s => s.boothInbox)
  const notoriety = useGame(s => s.notoriety)
  const upgrades = useGame(s => s.upgrades)
  const currentDay = useGame(s => s.currentDay)
  const clearItem = useGame(s => s.clearInboxItem)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  const nextDay = useGame(s => s.nextDay)
  const [active, setActive] = useState(null) // {enc, idx}
  const [toast, setToast] = useState(null)

  const hasStore = !!upgrades.storefront
  const accepted = acceptedMethods(upgrades)
  const flash = useCallback(m => { setToast(m); setTimeout(()=>setToast(null), 3000) }, [])

  function pick(opt) {
    const msg = resolveEncounter(opt.effect)
    flash(msg)
    if (active) clearItem(active.idx)
    setActive(null)
  }

  function passDay() {
    const r = nextDay()
    if (r.added) flash(`A day passes — ${r.added} new order${r.added>1?'s':''} came in.`)
    else flash('A quiet day — no new orders.')
  }

  return (
    <>
      <div className="banner" style={{ marginTop: 16 }}>
        {hasStore
          ? <>🏬 You run a brick-and-mortar shop <b>and</b> sell online. Each day brings orders & walk-ins, scaled by your <b>{Math.round(notoriety)}</b> notoriety.</>
          : <>🏠 You're flipping cards online from home. Each day brings marketplace/DM orders (notoriety <b>{Math.round(notoriety)}</b>). Open a <b>Brick-and-Mortar Store</b> for in-person walk-ins too.</>}
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <span className="pill" style={{ background:'#3b6cff22', color:'#9db8ff' }}>📅 Day {currentDay}</span>
        <button className="btn" style={{ flex:'none', maxWidth: 150 }} onClick={passDay}>⏭️ Next day</button>
        <span className="muted" style={{ fontSize: 12 }}>Pass a day to bring in orders (attending a show passes several at once).</span>
      </div>

      <div className="toolbar" style={{ marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 13 }}>You accept:</span>
        {Object.entries(PAYMENT_METHODS).map(([k, m]) => (
          <span key={k} className="pill" style={{ opacity: accepted.has(k) ? 1 : 0.35 }}>
            {m.icon} {m.short}{accepted.has(k) ? '' : ' 🔒'}
          </span>
        ))}
        {!(accepted.has('paypal') && accepted.has('card')) && <span className="muted" style={{ fontSize: 12 }}>· buyers who can't use what you accept walk away</span>}
      </div>

      {/* remote-management status */}
      <div className="toolbar" style={{ marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 13 }}>While at a show:</span>
        <span className="pill" style={{ opacity: upgrades.smartphone ? 1 : 0.35 }}>📱 Online {upgrades.smartphone ? 'covered' : 'missed 🔒'}</span>
        <span className="pill" style={{ opacity: upgrades.staff ? 1 : 0.35 }}>🧑‍💼 Walk-ins {upgrades.staff ? 'covered' : 'missed 🔒'}</span>
      </div>

      {inbox.length === 0 ? (
        <div className="empty">No orders waiting. Hit <b>Next day</b> (or attend a show) to bring customers in. 📨</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', marginTop: 14 }}>
          {inbox.map((enc, i) => {
            const badge = CHANNEL_BADGE[enc.channel] || CHANNEL_BADGE.online
            return (
              <div key={i} className="product" style={{ cursor:'pointer' }} onClick={() => setActive({ enc, idx: i })}>
                <span className="chanbadge" style={{ color: badge.color, borderColor: badge.color }}>{badge.icon} {badge.label}</span>
                {enc.card && <img src={enc.card.img} alt="" style={{ width: 64, borderRadius: 8, alignSelf:'center' }} />}
                <h3 style={{ fontSize: 15, margin: 0 }}>{enc.title}</h3>
                <div className="meta" style={{ flex:1 }}>{enc.body.slice(0, 90)}…</div>
                <button className="btn">{enc.channel === 'online' ? 'Respond →' : 'Help customer →'}</button>
              </div>
            )
          })}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {active && <Encounter data={active.enc} onPick={pick} />}
    </>
  )
}
