import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGame, acceptedMethods, PAYMENT_METHODS, INBOX_CAP } from '../game/store'
import { fmtMoney, cardValue } from '../game/engine'
import { encounterStillValid } from '../game/shows'
import Encounter from './Encounter'
import CardTile from './CardTile'
import SellStrips from './SellStrips'
import { useModalEscape } from '../ui/dialog'

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
  const wantList = useGame(s => s.wantList)
  const cardsForWant = useGame(s => s.cardsForWant)
  const fulfillWant = useGame(s => s.fulfillWant)
  const dailyGoals = useGame(s => s.dailyGoals)
  const ensureDailyGoals = useGame(s => s.ensureDailyGoals)
  const collection = useGame(s => s.collection)
  const listings = useGame(s => s.listings)
  const shopDisplay = useGame(s => s.shopDisplay)
  const pullFromShop = useGame(s => s.pullFromShop)
  const pullAllFromShop = useGame(s => s.pullAllFromShop)
  useEffect(() => { ensureDailyGoals() }, [ensureDailyGoals])
  // Drop orders whose card you no longer own (e.g. sold it at a show) — keep the
  // original index so clearing/responding still targets the right inbox slot.
  // A card that's listed/tweeted still counts as owned (online offers target listings).
  const validInbox = useMemo(
    () => inbox.map((enc, i) => ({ enc, i })).filter(({ enc }) => encounterStillValid(enc, collection, listings, shopDisplay)),
    [inbox, collection, listings, shopDisplay])
  const consignments = useGame(s => s.consignments)
  const [active, setActive] = useState(null) // {enc, idx}
  const [wantPick, setWantPick] = useState(null) // a want being fulfilled
  const [toast, setToast] = useState(null)
  useModalEscape(() => { if (wantPick) setWantPick(null) }) // close the want-fill picker on Esc
  // Sell splits into two sub-tabs: day-to-day Orders, and the cards you've put
  // On the market (listings + consignments) — the latter used to push the orders
  // way down the page, so it gets its own tab.
  const [sellTab, setSellTab] = useState('orders') // 'orders' | 'market'
  const marketCount = listings.length + consignments.length

  const hasStore = !!upgrades.storefront
  const accepted = acceptedMethods(upgrades)
  const flash = useCallback(m => { setToast(m); setTimeout(()=>setToast(null), 3000) }, [])

  function pick(opt) {
    const msg = resolveEncounter(opt.effect)
    flash(msg)
    if (active) clearItem(active.idx)
    setActive(null)
  }

  return (
    <>
      <div className="subtabs">
        <button className={`subtab ${sellTab === 'orders' ? 'active' : ''}`} onClick={() => setSellTab('orders')}>
          📨 Orders{validInbox.length ? ` (${validInbox.length})` : ''}
        </button>
        <button className={`subtab ${sellTab === 'market' ? 'active' : ''}`} onClick={() => setSellTab('market')}>
          🌐 On the market{marketCount ? ` (${marketCount})` : ''}
        </button>
      </div>

      {sellTab === 'market' ? (
        // Cards you've put up for sale: listed on your own site / consigned. Moved to
        // its own tab so a long listings panel doesn't bury the day-to-day orders.
        (listings.length || consignments.length)
          ? <SellStrips />
          : <div className="empty">Nothing on the market. List or consign cards from your collection (Cards → Select) to sell them here. 🌐</div>
      ) : (
      <>
      <div className="banner" style={{ marginTop: 16 }}>
        {hasStore
          ? <>🏬 You run a brick-and-mortar shop <b>and</b> sell online. Each day brings orders & walk-ins, scaled by your <b>{Math.round(notoriety)}</b> notoriety.</>
          : <>🏠 You're flipping cards online from home. Each day brings marketplace/DM orders (notoriety <b>{Math.round(notoriety)}</b>). Open a <b>Brick-and-Mortar Store</b> for in-person walk-ins too.</>}
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <span className="pill" style={{ background:'#3b6cff22', color:'#9db8ff' }}>📅 Day {currentDay}</span>
        {/* Inbox fill indicator — the inbox holds INBOX_CAP orders; once full, the
            oldest unanswered orders drop off, so flag when it's getting close. */}
        <span className="pill" style={inbox.length >= INBOX_CAP - 1
          ? { background:'#ff9f4322', color:'#ff9f43' }
          : { background:'#3b6cff22', color:'#9db8ff' }}>
          📨 Inbox {inbox.length}/{INBOX_CAP}{inbox.length >= INBOX_CAP ? ' · full!' : inbox.length >= INBOX_CAP - 1 ? ' · nearly full' : ''}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>Orders arrive as days pass — attend a show to bring in several at once.</span>
      </div>

      {dailyGoals.length > 0 && (
        <div className="goals">
          <div className="goals-head">🎯 Today's goals</div>
          <div className="goals-row">
            {dailyGoals.map((g, i) => (
              <div key={i} className={`goal ${g.done ? 'done' : ''}`}>
                <div className="goal-label">{g.done ? '✓ ' : ''}{g.label}</div>
                <div className="goal-bar"><div style={{ width: `${Math.min(100, 100*g.progress/g.target)}%` }} /></div>
                <div className="goal-reward">{g.progress}/{g.target} · {g.cash ? `$${g.cash}` : ''}{g.cash && g.noto ? ' + ' : ''}{g.noto ? `${g.noto}★` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 13 }}>You accept:</span>
        {Object.entries(PAYMENT_METHODS)
          // Cash is an in-person-only method (unlocked by the storefront). Online
          // buyers never hand you cash, so don't show it as a locked rail here
          // until you actually have a physical store.
          .filter(([k]) => k !== 'cash' || hasStore)
          .map(([k, m]) => (
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

      {/* Store shelf (display case): the cards walk-in customers can actually buy.
          You stock it from Cards → Select → 🏬 Stock shop. Pull cards back anytime. */}
      {hasStore && (
        <div className="wants">
          <div className="wants-head">🏬 On the shelf <span className="muted">— walk-in customers only buy what you've put out here ({shopDisplay.length})</span>
            {shopDisplay.length > 0 && (
              <button className="btn alt" style={{ flex:'none', maxWidth: 150, marginLeft: 'auto', padding: '4px 10px' }}
                onClick={() => { const n = pullAllFromShop(); flash(`Cleared the shelf — ${n} card${n>1?'s':''} back in your collection.`) }}>
                Clear shelf
              </button>
            )}
          </div>
          {shopDisplay.length === 0 ? (
            <div className="empty" style={{ marginTop: 4 }}>Nothing on display. Put cards out from <b>Cards → Select → 🏬 Stock shop</b> so walk-ins have something to buy. 🛒</div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', marginTop: 4 }}>
              {[...shopDisplay].sort((a, b) => cardValue(b) - cardValue(a)).map(c => (
                <div key={c.uid} className="vendoritem">
                  <CardTile card={c} interactive={false} />
                  <button className="btn alt" style={{ padding: '4px 10px' }}
                    onClick={() => { pullFromShop(c.uid); flash(`Took ${c.name} off the shelf.`) }}>
                    ↩ Pull · {fmtMoney(cardValue(c))}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {wantList.length > 0 && (
        <div className="wants">
          <div className="wants-head">📋 Want list <span className="muted">— collectors looking for cards; fill one for an above-market premium</span></div>
          <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))' }}>
            {wantList.map(w => {
              const matches = cardsForWant(w)
              return (
                <div key={w.id} className={`product want ${matches.length ? 'fillable' : ''}`}>
                  {w.img && <img src={w.img} alt="" style={{ width: 56, borderRadius: 8, alignSelf:'center' }} />}
                  <h3 style={{ fontSize: 14, margin: 0 }}>{w.desc}</h3>
                  <div className="meta" style={{ flex:1 }}>
                    Pays <b style={{ color:'var(--green)' }}>+{Math.round((w.premiumMult-1)*100)}%</b> over market · +{w.notoriety}★ · expires in {w.daysLeft}d
                  </div>
                  {matches.length
                    ? <button className="btn gold" onClick={() => setWantPick(w)}>Fill it ({matches.length} match{matches.length>1?'es':''})</button>
                    : <button className="btn" disabled>You don't have it</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {validInbox.length === 0 ? (
        <div className="empty">No orders waiting. Let a day pass (or attend a show) to bring customers in. 📨</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', marginTop: 14 }}>
          {validInbox.map(({ enc, i }) => {
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
      </>
      )}

      {toast && <div className="toast">{toast}</div>}
      {active && <Encounter data={active.enc} onPick={pick} onClose={() => setActive(null)} />}

      {wantPick && (
        <div className="modalbg" onClick={() => setWantPick(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>Fill: {wantPick.desc}</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Pick which copy to hand over — they pay {Math.round(wantPick.premiumMult*100)}% of its market value, +{wantPick.notoriety} notoriety.</p>
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))' }}>
              {cardsForWant(wantPick).map(c => (
                <div key={c.uid} className="vendoritem">
                  <CardTile card={c} interactive={false} />
                  <button className="btn gold" onClick={() => {
                    const r = fulfillWant(wantPick.id, c.uid)
                    if (r) flash(`Filled the want — earned ${fmtMoney(r.payout)} (+${wantPick.notoriety}★)`)
                    setWantPick(null)
                  }}>Give · {fmtMoney(cardValue(c) * wantPick.premiumMult)}</button>
                </div>
              ))}
            </div>
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setWantPick(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
