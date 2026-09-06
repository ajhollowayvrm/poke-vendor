import { useState, useMemo, useCallback, useEffect } from 'react'
import { useGame, acceptedMethods, PAYMENT_METHODS, INBOX_CAP, INBOUND_NOTORIETY_GATE,
  BARGAIN_ASK_MULT } from '../game/store'
import { fmtMoney, cardImg, setNameOfCard, shopName, shopIcon } from '../game/engine'
import { encounterStillValid } from '../game/shows'
import { toast } from '../ui/dialog'
import { Explain } from '../ui/Explain'
import { clickable } from '../ui/clickable'
import Encounter from './Encounter'
import QuoteCounter from './QuoteCounter'
import CardModal from './CardModal'
import SealedDealModal from './SealedDealModal'
import WantFulfill from './WantFulfill'

const CHANNEL_BADGE = { online: { label: 'Online', icon: '🌐', color: '#5aa0ff' },
  walkin: { label: 'Walk-in', icon: '🏬', color: '#ffcb05' } }

// 💬 The inbox: people who want to deal with you.
//
// Its own screen now, rather than one group inside a 1,100-line Sell component. With a
// storefront this IS a whole job — you open it, you work through it, you close it — and it
// deserved a tab rather than a segment on a strip. Without one it is still the Sell tab's
// first screen, because a flipper's whole business is answering messages.
//
// WALK-INS AND ONLINE ORDERS ARE KEPT APART. Somebody standing at your counter is a
// conversation you are having now; an online order is a queue you work through. They arrive on
// separate rates in the day tick and they used to land in one undifferentiated list, so a shop
// owner could not tell "four people are in the store" from "four emails". Only a storefront has
// walk-ins worth separating, so the toggle appears with the lease.
export default function StoreMessages({ onRip, onSift, onPick, onOpenInventory }) {
  const inbox = useGame(s => s.boothInbox)
  const notoriety = useGame(s => s.notoriety)
  const upgrades = useGame(s => s.upgrades)
  const currentDay = useGame(s => s.currentDay)
  const clearItem = useGame(s => s.clearInboxItem)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  const wantList = useGame(s => s.wantList)
  const cardsForWant = useGame(s => s.cardsForWant)
  const dailyGoals = useGame(s => s.dailyGoals)
  const ensureDailyGoals = useGame(s => s.ensureDailyGoals)
  const goalsResetInDays = useGame(s => s.goalsResetInDays)
  const collection = useGame(s => s.collection)
  const listings = useGame(s => s.listings)
  const consignments = useGame(s => s.consignments)
  const shopDisplay = useGame(s => s.shopDisplay) // legacy bucket — read only for inbox validation
  const sealedInventory = useGame(s => s.sealedInventory)
  const storeConsignRequests = useGame(s => s.storeConsignRequests)
  const store = useGame(s => s.store)
  const cash = useGame(s => s.cash)
  const hasStore = !!upgrades.storefront
  // Which payment rails you can take. A buyer who cannot pay the way they want walks, so the
  // strip below shows the locked ones too — it is a shopping list, not a status light.
  const accepted = acceptedMethods(upgrades)

  useEffect(() => { ensureDailyGoals() }, [ensureDailyGoals])

  // Drop orders whose card you no longer own (e.g. sold it at a show) — keep the original
  // index so clearing/responding still targets the right inbox slot. A card that's listed or
  // on the shop floor still counts as owned (online offers target listings).
  const validInbox = useMemo(
    () => inbox.map((enc, i) => ({ enc, i })).filter(({ enc }) => encounterStillValid(enc, collection, listings, shopDisplay)),
    [inbox, collection, listings, shopDisplay])
  // An encounter with no channel is an online one (that was the only kind when the field was
  // added) — never drop it out of both lists over a missing tag.
  const walkinInbox = useMemo(() => validInbox.filter(x => x.enc.channel === 'walkin'), [validInbox])
  const onlineInbox = useMemo(() => validInbox.filter(x => x.enc.channel !== 'walkin'), [validInbox])

  // Which half you are looking at. Device-local like every other view preference (see pv.tab).
  const [msgChannel, setMsgChannelRaw] = useState(() => {
    try { const v = localStorage.getItem('pv.msgchannel'); return v === 'online' || v === 'walkin' ? v : 'walkin' } catch { return 'walkin' }
  })
  const setMsgChannel = (v) => {
    setMsgChannelRaw(v)
    try { localStorage.setItem('pv.msgchannel', v) } catch { /* private mode */ }
  }

  const [active, setActive] = useState(null)        // {enc, id}
  const [wantPick, setWantPick] = useState(null)    // a want being fulfilled {kind, item}
  // A card tapped from inside a quote/trade encounter — {card, owned}. `owned` gates
  // CardModal's inspect mode: their side of a trade isn't in your collection yet, so it opens
  // read-only (no sell/list/grade buttons for a card you don't actually have).
  const [tradeInspect, setTradeInspect] = useState(null)
  const flash = useCallback(m => toast(m, 3000), [])

  function pick(opt) {
    const msg = resolveEncounter(opt.effect)
    flash(msg)
    // Clear by stable id: resolveEncounter may prune the inbox (a sold card's orders drop),
    // shifting indices — an index captured at open time would now clear the wrong order.
    if (active) clearItem(active.id)
    setActive(null)
  }

  return (
    <>
      {/* 🏬 The counter and the inbox, kept apart. Only a storefront has walk-ins worth
          separating — before that everything arrives online and a toggle would be theatre. */}
      {hasStore && (
        <div className="seg sell-seg mt-4" role="group" aria-label="Messages view">
          <button className={`segbtn ${msgChannel === 'walkin' ? 'active' : ''}`} onClick={() => setMsgChannel('walkin')}>
            🏬 Walk-ins{walkinInbox.length ? ` (${walkinInbox.length})` : ''}
          </button>
          <button className={`segbtn ${msgChannel === 'online' ? 'active' : ''}`} onClick={() => setMsgChannel('online')}>
            🌐 Online orders{onlineInbox.length ? ` (${onlineInbox.length})` : ''}
          </button>
        </div>
      )}

      <div className="banner mt-6">
        {notoriety < INBOUND_NOTORIETY_GATE
          // Unknown vendor: no unsolicited orders from reputation yet. Tell the truth and
          // point at the two ways to drum up demand — the Forum, or a bargain listing.
          ? (() => {
              const hasBargain = (listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
              return <>🪧 You're an <b>unknown vendor</b> (⭐ <b>{Math.round(notoriety)}</b> reputation) — strangers don't seek you out yet. Fill <b>Forum</b> wanted-ads to build a name{hasBargain
                ? <>, and your bargain listing (≤{Math.round(BARGAIN_ASK_MULT*100)}% of market) is already drawing online deal-hunters.</>
                : <>, or list a card at <b>≤{Math.round(BARGAIN_ASK_MULT*100)}% of market</b> to pull in online deal-hunters.</>}</>
            })()
          : (listings.length === 0 && (!hasStore || (collection.length === 0 && (sealedInventory || []).length === 0)))
          // Known vendor, but nothing out for sale → no orders will come. Buyers only
          // message you about cards you've actually listed (or, with a store, stock on your floor).
          ? <>🤫 Your shop's quiet — <b>nothing's up for sale</b>. Buyers only reach out about cards you've <b>listed online</b>{hasStore ? <> or have <b>in stock at the store</b></> : ''}. Put something out and orders start arriving (⭐ <b>{Math.round(notoriety)}</b> reputation).</>
          : hasStore
          ? <>{shopIcon(store)} <b>{shopName(store)}</b> is open — your brick-and-mortar shop <b>and</b> online counter. Your whole stock is on the floor for walk-ins (🔒 keep anything that isn't); online orders come on what you've listed. Scaled by your <b>⭐ {Math.round(notoriety)}</b> reputation.</>
          : <>🏠 You're flipping cards online from home. Each day brings marketplace/DM orders on what you've <b>listed</b> (⭐ <b>{Math.round(notoriety)}</b> reputation). Open a <b>Brick-and-Mortar Store</b> for in-person walk-ins too.</>}
      </div>

      <div className="toolbar mt-5">
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>📅 Day {currentDay}</span>
        {/* Inbox fill indicator — the inbox holds INBOX_CAP orders; once full, the
            oldest unanswered orders drop off, so flag when it's getting close. */}
        <span className="pill" style={inbox.length >= INBOX_CAP - 1
          ? { background:'#ff9f4322', color:'#ff9f43' }
          : { background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>
          📨 Inbox {inbox.length}/{INBOX_CAP}{inbox.length >= INBOX_CAP ? ' · full!' : inbox.length >= INBOX_CAP - 1 ? ' · nearly full' : ''}
        </span>
        <Explain label="Who lands in your inbox">
          People who want to deal with you — online buyers messaging in, and (with a store)
          walk-ins at the counter. They arrive as game-days pass, so hit Next Day to bring more
          in. The number is how many are waiting on an answer; ignored ones eventually give up
          and drop off.
        </Explain>
        <span className="cap">Orders arrive as days pass — attend a show to bring in several at once.</span>
      </div>

      {dailyGoals.length > 0 && (() => {
        const resetIn = goalsResetInDays()
        return (
        <div className="goals">
          <div className="goals-head">🎯 This week's goals
            <span className="cap" style={{ fontWeight: 400, marginLeft: 8 }}>
              {resetIn <= 0 ? 'refreshes next day' : `refreshes in ${resetIn} day${resetIn === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="goals-row">
            {dailyGoals.map((g, i) => (
              <div key={i} className={`goal ${g.done ? 'done' : ''}`}>
                <div className="goal-label">{g.done ? '✓ ' : ''}{g.label}</div>
                <div className="goal-bar"><div style={{ width: `${Math.min(100, 100*g.progress/g.target)}%` }} /></div>
                <div className="goal-reward">{g.key === 'profit' ? `${fmtMoney(g.progress)}/${fmtMoney(g.target)}` : `${g.progress}/${g.target}`} · {g.cash ? fmtMoney(g.cash) : ''}{g.cash && g.noto ? ' + ' : ''}{g.noto ? `${g.noto}★` : ''}</div>
              </div>
            ))}
          </div>
        </div>
        )
      })()}

      <div className="toolbar mt-2">
        <span className="cap t-sm">You accept:</span>
        {Object.entries(PAYMENT_METHODS)
          // Cash is an in-person-only method (unlocked by the storefront). Online
          // buyers never hand you cash, so don't show it as a locked rail here
          // until you actually have a physical store.
          .filter(([k]) => k !== 'cash' || hasStore)
          .map(([k, m]) => (
          <span key={k} className={`pill ${accepted.has(k) ? '' : 'off'}`}>
            {m.icon} {m.short}{accepted.has(k) ? '' : ' 🔒'}
          </span>
        ))}
        {!(accepted.has('paypal') && accepted.has('card')) && <span className="muted rownote t-xs">Buyers who can't use what you accept walk away.</span>}
      </div>

      {/* remote-management status */}
      <div className="toolbar mt-2">
        <span className="cap t-sm">While at a show:</span>
        <span className={`pill ${upgrades.smartphone ? '' : 'off'}`}>📱 Online {upgrades.smartphone ? 'covered' : 'missed 🔒'}</span>
        <span className={`pill ${upgrades.staff ? '' : 'off'}`}>🧑‍💼 Walk-ins {upgrades.staff ? 'covered' : 'missed 🔒'}</span>
      </div>

      {/* The shop floor (stock, holds, consignments, giveaways) lives in its own
          🏬 sub-tab now — Orders stays focused on people to answer. */}
      {hasStore && (collection.length + (sealedInventory || []).length + (storeConsignRequests || []).length) > 0 && (
        <div className="toolbar mt-2">
          <span className="cap">
            🏬 Your store stock, holds, consignments & giveaways live on the <b>📦 Inventory</b> tab
            {(storeConsignRequests || []).length ? <b> — {storeConsignRequests.length} consignment ask{storeConsignRequests.length > 1 ? 's' : ''} waiting</b> : ''}.
          </span>
          {/* The pointer has to be a real button. This screen used to be a pane INSIDE the Sell
              component and could switch its own sibling; it is its own tab now, so the jump
              belongs to whoever owns the tabs (App). Without the callback the copy still names
              the destination, which is the worst case rather than a dead control. */}
          {onOpenInventory && (
            <button className="btn alt btn-fixed" style={{ padding: '4px 10px' }} onClick={onOpenInventory}>Open →</button>
          )}
        </div>
      )}

      {wantList.length > 0 && (
        <div className="wants">
          <div className="wants-head">⭐ Collectors seeking you <span className="muted">— your reputation drew these requests; fill one for an above-market premium</span></div>
          <div className="grid stagger-grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))' }}>
            {wantList.map(w => {
              const matches = cardsForWant(w)
              return (
                <div key={w.id} className={`product want ${matches.length ? 'fillable' : ''}`}>
                  {w.img && <img src={w.img} alt="" style={{ width: 56, borderRadius: 8, alignSelf:'center' }} />}
                  <h3 className="t-md" style={{ margin: 0 }}>{w.desc}</h3>
                  <div className="meta" style={{ flex:1 }}>
                    Pays <b className="pos">+{Math.round((w.premiumMult-1)*100)}%</b> over market · +{w.notoriety}★ · expires in {w.daysLeft}d
                  </div>
                  {matches.length
                    ? <button className="btn gold" onClick={() => setWantPick({ kind: 'want', item: w })}>Fill it ({matches.length} match{matches.length>1?'es':''})</button>
                    : <button className="btn" disabled>You don't have it</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(() => {
        // Without a storefront there is one list; with one, the toggle above chooses which.
        const shown = !hasStore ? validInbox : msgChannel === 'walkin' ? walkinInbox : onlineInbox
        if (shown.length === 0) {
          return (
            <div className="empty">
              {!hasStore ? 'No orders waiting. Let a day pass (or attend a show) to bring customers in. 📨'
                : msgChannel === 'walkin' ? 'Nobody in the shop right now. Keep the floor stocked and let a day pass. 🏬'
                : 'No online orders waiting. List stock and let a day pass. 🌐'}
            </div>
          )
        }
        return (() => {
        // Group the inbox into readable sections: trades to weigh, walk-in requests
        // to fill, then everything else (offers, browsers, sealed deals). Each order
        // matches the FIRST section it fits, so nothing renders twice.
        const sections = [
          { key: 'trades', title: '🔁 Trade offers', hint: 'bundles offered for your cards — weigh both sides', match: x => (x.enc.options || []).some(o => o.effect?.type === 'trade') },
          // 🗣️ Its own section, above the requests. This is the only encounter where YOU set the
          // price, so it is a different job from the rest of the list and worth finding fast.
          { key: 'quotes', title: '🗣️ Price my cards', hint: 'they want a number from you — cash or store credit', match: x => x.enc.kind === 'quote' },
          { key: 'requests', title: '🙋 Walk-in requests', hint: 'someone came in hunting a specific item', match: x => x.enc.kind === 'request' },
          { key: 'offers', title: '💰 Offers & browsers', hint: 'offers on your stock, browsers, and inbound deals', match: () => true },
        ]
        const used = new Set()
        return sections.map(sec => {
          const items = shown.filter(x => !used.has(x.i) && sec.match(x))
          items.forEach(x => used.add(x.i))
          if (!items.length) return null
          return (
            <div className="mt-6" key={sec.key}>
              <div className="wants-head">{sec.title} <span className="muted">({items.length}) — {sec.hint}</span></div>
              <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', marginTop: 8 }}>
                {items.map(({ enc, i }) => {
                  const badge = CHANNEL_BADGE[enc.channel] || CHANNEL_BADGE.online
                  // Key on stable per-encounter content, NOT the array index — clearing an item
                  // shifts indices and would make React reconcile tiles to the wrong encounter.
                  const key = enc.id || enc.card?.uid || enc.ownedUid || `${enc.channel || 'c'}:${enc.title}`
                  return (
                    // The inbox list is the store's main interaction, and every row was a bare
                    // clickable div: no tab stop, nothing for the focus ring to paint on, and
                    // outside the (pointer: coarse) 44px floor, which names [role=button].
                    <div key={key} className="product"
                      {...clickable(() => setActive({ enc, id: enc.id }), { style: { cursor: 'pointer' } })}>
                      <span className="chanbadge" style={{ color: badge.color, borderColor: badge.color }}>{badge.icon} {badge.label}</span>
                      {enc.card && <img src={cardImg(enc.card)} alt="" style={{ width: 64, borderRadius: 8, alignSelf: 'center' }} />}
                      {enc.card && setNameOfCard(enc.card) && <div className="cap" style={{ textAlign: 'center' }}>{setNameOfCard(enc.card)}</div>}
                      <h3 className="t-lg" style={{ margin: 0 }}>{enc.title}</h3>
                      {/* Defensive on body: an encounter kind that arrives without one used to
                          take the whole inbox down with a TypeError rather than render plainly. */}
                      <div className="meta" style={{ flex: 1 }}>{(enc.body || '').slice(0, 90)}…</div>
                      <button className="btn">{enc.kind === 'sealedDeal' ? '📦 View deal →'
                        : enc.kind === 'scalperOffer' ? '💰 View offer →'
                        : enc.kind === 'quote' ? '🗣️ Name your price →'
                        : enc.channel === 'online' ? 'Respond →' : 'Help customer →'}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
        })()
      })()}

      {active && ((active.enc.kind === 'sealedDeal' || active.enc.kind === 'scalperOffer') && active.enc.deal
        ? <SealedDealModal enc={active.enc} id={active.id} flash={flash}
            onDone={() => setActive(null)} onCancel={() => setActive(null)} />
        /* 🗣️ A quote walk-up is not a pick-an-option encounter — it is a negotiation where YOU
           name the number, so it gets the same dedicated screen the show floor uses. Closing it
           clears the inbox entry the way pick() does, because the deal is done either way and a
           settled seller must not still be standing at the counter tomorrow. */
        : active.enc.kind === 'quote'
        ? <QuoteCounter req={active.enc} onDone={(msg) => { if (msg) flash(msg); clearItem(active.id); setActive(null) }}
            onInspect={(card, owned) => setTradeInspect({ card, owned })} />
        : <Encounter data={active.enc} onPick={pick} onClose={() => setActive(null)}
            onInspect={(card, owned) => setTradeInspect({ card, owned })} />)}

      {tradeInspect && <CardModal card={tradeInspect.card} inspect={!tradeInspect.owned} onClose={() => setTradeInspect(null)} />}

      <WantFulfill pick={wantPick} onClose={() => setWantPick(null)} onInspect={onPick} flash={flash} />
    </>
  )
}
