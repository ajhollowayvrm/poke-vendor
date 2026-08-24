import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from '../ui/dialog'
import { useGame, acceptedMethods, PAYMENT_METHODS, INBOX_CAP, INBOUND_NOTORIETY_GATE, BARGAIN_ASK_MULT, HOLD_DAYS_STORE, GIVEAWAY_BUZZ_DAYS,
  STORE_EVENTS, STORE_CREDIT_BONUS, EVENT_COOLDOWN_DAYS, SUPPLIES, SUPPLY_CASE, BUYLIST_POLICIES, absoluteDay, RANKS } from '../game/store'
import { fmtMoney, cardValue, sealedValue, setById, setNameOfCard, setIdOfCard, round2, cardImg, shopName, shopIcon } from '../game/engine'
import { encounterStillValid, cardMatchesFocus } from '../game/shows'
import Encounter from './Encounter'
import QuoteCounter from './QuoteCounter'
import SealedDealModal from './SealedDealModal'
import CardTile from './CardTile'
import SellStrips from './SellStrips'
import TownRivalry from './TownRivalry'
import MysteryPacks from './MysteryPacks'
import PackMachine from './PackMachine'
import BulkBin from './BulkBin'
import StoreStock from './StoreStock'
import Regulars from './Regulars'
import { Modal } from '../ui/Modal'
import { Collapse } from '../ui/Collapse'
import { clickable } from '../ui/clickable'

const CHANNEL_BADGE = { online: { label: 'Online', icon: '🌐', color: '#5aa0ff' },
  walkin: { label: 'Walk-in', icon: '🏬', color: '#ffcb05' } }

// Your storefront. Orders accrue per game-DAY — pass a day (here or by attending
// a show) to generate them. While you're away at a show, online orders need a
// Smartphone and walk-ins need a Shop Assistant, or they're missed.
export default function BoothInbox({ onRip, onSift, onPick }) {
  const inbox = useGame(s => s.boothInbox)
  const notoriety = useGame(s => s.notoriety)
  const rank = useGame(s => s.rank || 0) // 🏅 banked ladder rank — gates the tournament night
  const upgrades = useGame(s => s.upgrades)
  const currentDay = useGame(s => s.currentDay)
  const clearItem = useGame(s => s.clearInboxItem)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  const wantList = useGame(s => s.wantList)
  const cardsForWant = useGame(s => s.cardsForWant)
  const fulfillWant = useGame(s => s.fulfillWant)
  const forumPosts = useGame(s => s.forumPosts)
  const cardsForForumPost = useGame(s => s.cardsForForumPost)
  const fulfillForumPost = useGame(s => s.fulfillForumPost)
  const dailyGoals = useGame(s => s.dailyGoals)
  const ensureDailyGoals = useGame(s => s.ensureDailyGoals)
  const goalsResetInDays = useGame(s => s.goalsResetInDays)
  const collection = useGame(s => s.collection)
  const listings = useGame(s => s.listings)
  const shopDisplay = useGame(s => s.shopDisplay) // legacy bucket — read only for inbox validation
  const setListingEverywhere = useGame(s => s.setListingEverywhere)
  const sealedInventory = useGame(s => s.sealedInventory)
  const store = useGame(s => s.store)
  const FEATURED_MAX = useGame(s => s.FEATURED_MAX + (s.upgrades.vault ? 4 : 0)) // 🏛️ vault doubles the case
  // In-store services: holds for regulars, the consignment case, giveaways.
  const regulars = useGame(s => s.regulars)
  const storeConsignRequests = useGame(s => s.storeConsignRequests)
  const storeConsignments = useGame(s => s.storeConsignments)
  const giveawayDaysLeft = useGame(s => s.giveawayDaysLeft)
  const holdShelfItem = useGame(s => s.holdShelfItem)
  const releaseHold = useGame(s => s.releaseHold)
  const runGiveaway = useGame(s => s.runGiveaway)
  const acceptConsignRequest = useGame(s => s.acceptConsignRequest)
  const declineConsignRequest = useGame(s => s.declineConsignRequest)
  // Buy-ins (locals selling to you), store credit, and hosted events.
  const cash = useGame(s => s.cash)
  const buyinOffers = useGame(s => s.buyinOffers)
  const demandLog = useGame(s => s.demandLog)
  const specialOrders = useGame(s => s.specialOrders || [])
  const today = useGame(st => absoluteDay(st.currentDay, st.monthsElapsed))
  const supplies = useGame(s => s.supplies)
  const suppliesStats = useGame(s => s.suppliesStats)
  const buySupplies = useGame(s => s.buySupplies)
  const storeCredit = useGame(s => s.storeCredit)
  const storeEventPlanned = useGame(s => s.storeEventPlanned)
  const eventCooldownLeft = useGame(s => s.eventCooldownLeft)
  const acceptBuyin = useGame(s => s.acceptBuyin)
  const declineBuyin = useGame(s => s.declineBuyin)
  const counterBuyin = useGame(s => s.counterBuyin)
  const buylistPolicy = useGame(s => s.buylistPolicy)
  const setBuylistPolicy = useGame(s => s.setBuylistPolicy)
  const [haggleId, setHaggleId] = useState(null) // buy-in offer with the haggle strip open
  const [haggleVal, setHaggleVal] = useState('')
  const planStoreEvent = useGame(s => s.planStoreEvent)
  const cancelStoreEvent = useGame(s => s.cancelStoreEvent)
  const weeklyEvent = useGame(s => s.weeklyEvent)     // 🎪 the coordinator's standing night
  const setWeeklyEvent = useGame(s => s.setWeeklyEvent)
  useEffect(() => { ensureDailyGoals() }, [ensureDailyGoals])
  // Drop orders whose card you no longer own (e.g. sold it at a show) — keep the
  // original index so clearing/responding still targets the right inbox slot.
  // A card that's listed/tweeted still counts as owned (online offers target listings).
  const validInbox = useMemo(
    () => inbox.map((enc, i) => ({ enc, i })).filter(({ enc }) => encounterStillValid(enc, collection, listings, shopDisplay)),
    [inbox, collection, listings, shopDisplay])
  const consignments = useGame(s => s.consignments)
  const [active, setActive] = useState(null) // {enc, id}
  const [wantPick, setWantPick] = useState(null) // a want/forum post being fulfilled {kind:'want'|'forum', item}
  const [holdPick, setHoldPick] = useState(null) // shelf item being held for a regular {kind, uid, label}
  const [givePick, setGivePick] = useState(false) // picking a card for the in-store giveaway
  const [rafflePick, setRafflePick] = useState(false) // picking the raffle prize card
  const [buyinReveal, setBuyinReveal] = useState(null) // the lot you just bought: {cards, market, paid, method}
  const toggleFeatureCard = useGame(s => s.toggleFeatureCard)
  const toggleFeatureSealed = useGame(s => s.toggleFeatureSealed)
  // Sell splits into sub-tabs: day-to-day Orders, your Shop floor (case, holds,
  // consignment intake, giveaways), your Mystery pack line, the public Forum board,
  // and On the market.
  const [sellTab, setSellTab] = useState('orders') // 'orders' | 'store' (floor) | 'storeroom' | 'regulars' | 'packs' | 'forum' | 'market'
  const listingOfferCount = listings.filter(l => (l.offers?.length || 0) > 0).length
  const marketCount = listings.length + consignments.length
  const forumCount = (forumPosts || []).length
  const regularsCount = (regulars || []).filter(r => !r.flags?.burned).length
  const builtPackCount = useGame(s => (s.builtPacks || []).length)
  const machineStock = useGame(s => (s.packMachine?.stock || []).length)

  const hasStore = !!upgrades.storefront
  const accepted = acceptedMethods(upgrades)
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
      <div className="subtabs">
        <button className={`subtab ${sellTab === 'orders' ? 'active' : ''}`} onClick={() => setSellTab('orders')}
          title="People who want to deal with you — online buyers messaging in, and (with a store) walk-ins at the counter. They arrive as game-days pass, so hit Next Day to bring more in. The number is how many are waiting on an answer; ignored ones eventually give up and drop off.">
          📨 Orders{validInbox.length ? ` (${validInbox.length})` : ''}
        </button>
        {hasStore && (() => {
          const waiting = (storeConsignRequests || []).length + (buyinOffers || []).length
          return (
            <button className={`subtab ${sellTab === 'store' ? 'active' : ''}`} onClick={() => setSellTab('store')}>
              🛒 Floor{waiting ? ` (${waiting})` : ''}
            </button>
          )
        })()}
        {hasStore && (
          <button className={`subtab ${sellTab === 'storeroom' ? 'active' : ''}`} onClick={() => setSellTab('storeroom')}>
            📦 Storeroom
          </button>
        )}
        {hasStore && (
          <button className={`subtab ${sellTab === 'regulars' ? 'active' : ''}`} onClick={() => setSellTab('regulars')}>
            🤝 Regulars{regularsCount ? ` (${regularsCount})` : ''}
          </button>
        )}
        <button className={`subtab ${sellTab === 'packs' ? 'active' : ''}`} onClick={() => setSellTab('packs')}>
          ❓ Packs{builtPackCount ? ` (${builtPackCount})` : ''}
        </button>
        {hasStore && (
          <button className={`subtab ${sellTab === 'machine' ? 'active' : ''}`} onClick={() => setSellTab('machine')}>
            🎰 Machine{machineStock ? ` (${machineStock})` : ''}
          </button>
        )}
        <button className={`subtab ${sellTab === 'forum' ? 'active' : ''}`} onClick={() => setSellTab('forum')}>
          📋 Forum{forumCount ? ` (${forumCount})` : ''}
        </button>
        <button className={`subtab ${sellTab === 'market' ? 'active' : ''}`} onClick={() => setSellTab('market')}>
          🌐 On the market{marketCount ? ` (${marketCount}${listingOfferCount ? ` · ${listingOfferCount} to review` : ''})` : ''}
        </button>
      </div>

      {sellTab === 'market' ? (
        // Cards you've put up for sale: listed on your own site / consigned. Moved to
        // its own tab so a long listings panel doesn't bury the day-to-day orders.
        (listings.length || consignments.length)
          ? <SellStrips />
          : <div className="empty">Nothing on the market. List or consign cards from your collection (Inventory → Select) to sell them here. 🌐</div>
      ) : sellTab === 'packs' ? (
        // Your custom mystery-pack product line: tiers, the builder, and built stock.
        <MysteryPacks />
      ) : sellTab === 'machine' ? (
        // 🎰 The Pack Machine: load real single booster packs, set one flat price, vend random.
        <PackMachine />
      ) : sellTab === 'storeroom' ? (
        // 📦 Backstock — everything sellable that ISN'T out on the floor, plus the
        // "saved for regulars" holds. Stock the floor from here (only floor stock sells
        // to walk-ins & the counter).
        (() => {
          const activeRegulars = (regulars || []).filter(r => !r.flags?.burned)
          const heldItems = [
            ...collection.filter(c => c._heldFor).map(it => ({ kind: 'card', it })),
            ...(sealedInventory || []).filter(x => x._heldFor).map(it => ({ kind: 'sealed', it })),
          ]
          return (
            <>
              {/* 🗝️ Saved for regulars — a hold sits here until they come pick it up */}
              {heldItems.length > 0 && (
                <div className="wants mt-6">
                  <div className="wants-head">🗝️ Saved for regulars <span className="muted">— held off the floor; they come in within a few days and pay a premium</span></div>
                  <div className="stock-lines">
                    {heldItems.map(({ kind, it }) => (
                      <div key={it.uid} className="trade-line stock-line" style={{ cursor: 'default' }}>
                        {kind === 'card'
                          ? <img className="tl-thumb" src={cardImg(it)} alt="" loading="lazy" decoding="async" />
                          : <span className="tl-icon">{it.product.icon || '📦'}</span>}
                        <div className="tl-info">
                          <div className="tl-name">{kind === 'card' ? `${it.name}${setNameOfCard(it) ? ` · ${setNameOfCard(it)}` : ''}` : `${it.product.type} · ${setById(it.setId)?.name || 'sealed'}`}</div>
                          <div className="tl-sub muted">held for {it._heldFor.emoji} {it._heldFor.name} · {it._heldFor.daysLeft}d left</div>
                        </div>
                        <span className="tl-unit">{fmtMoney(kind === 'card' ? cardValue(it) : sealedValue(it))}</span>
                        <button className="stock-act" title="Drop the hold — it becomes ordinary backstock" onClick={() => { releaseHold(kind, it.uid); flash('Hold dropped — back in the storeroom.') }}>↩ Release</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <StoreStock place="storeroom" split onRip={onRip} onSift={onSift} onPick={onPick}
                onHold={activeRegulars.length ? (kind, uid, label) => setHoldPick({ kind, uid, label }) : undefined} />
            </>
          )
        })()
      ) : sellTab === 'regulars' ? (
        // 🤝 Your persistent named customers — moved onto the Store tab where the shop lives.
        <Regulars />
      ) : sellTab === 'store' ? (
        // ---- 🏬 Shop floor: the physical store, in sections — what's in the case
        // (singles + sealed), holds behind the counter, the consignment case you run
        // for locals, and the in-store giveaway lever.
        (() => {
          const omni = listings.map((l, idx) => ({ l, idx })).filter(({ l }) => l.everywhere && !l.expired && !l.card?._sealed)
          const activeRegulars = (regulars || []).filter(r => !r.flags?.burned)
          // Demand board: missed walk-in requests, tallied by item (a fortnight's worth).
          const demandTop = Object.entries((demandLog || []).reduce((m, e) => {
            m[e.what] = (m[e.what] || 0) + 1; return m
          }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8)
          // Featured display-case picks (singles AND sealed share the case) — the floor stock
          // list itself renders via <StoreStock place="floor">; holds live in the Storeroom tab.
          const featured = collection.filter(c => c._featured)
          const featuredSealed = (sealedInventory || []).filter(it => it._featured)
          return (
            <>
              <div className="banner mt-6">
                🏬 <b>Only your Shop Floor sells to walk-ins</b> (+12% in person, no fees) — stock it from the
                📦 <b>Storeroom</b> and restock as it sells. <b>⭐ Feature</b> your best floor pieces — that's what
                whales come in for. Buy collections off locals, hold pieces for regulars, carry consignments,
                host events, and run a 🎁 giveaway when the room needs a jolt.
                {giveawayDaysLeft > 0 && <> <b className="warn"> 🎉 Buzz live — foot traffic boosted for {giveawayDaysLeft} more day{giveawayDaysLeft > 1 ? 's' : ''}.</b></>}
                {(storeCredit || 0) > 0 && <> <span className="pill" title="Outstanding store credit you've issued — locals spend it down at your counter over the coming days; a little never gets redeemed at all." style={{ background: '#5aa0ff22', color: '#5aa0ff' }}>💳 {fmtMoney(storeCredit)} credit outstanding</span></>}
              </div>

              {/* 🛍️ The sign on the counter: posted buylist rate — always visible, it's the
                  shop's standing posture (volume vs margin on walk-in collections). */}
              <div className="toolbar" style={{ marginTop: 10, gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="cap">🛍️ Buylist sign:</span>
                {Object.entries(BUYLIST_POLICIES).map(([k, p]) => (
                  <button key={k} className={`btn ${buylistPolicy === k ? 'gold' : 'alt'}`}
                    style={{ flex: 'none', padding: '4px 10px', fontSize: 12 }}
                    title={p.blurb} onClick={() => { setBuylistPolicy(k); flash(`Sign changed — "${p.label} on collections."`) }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 🏪 Who else the town can shop at, and 🏬 the branch you run yourself. */}
              <TownRivalry />

              {/* 📇 The Special Orders Book: promises you've taken deposits on. Open by default —
                  every row here is a customer expecting a phone call, and the date matters. */}
              {specialOrders.length > 0 && (
                <Collapse id="store-special-orders" defaultOpen head="📇 Special orders"
                  badge={`${specialOrders.length} on the book`}
                  hint="— deposits taken; sourced automatically from your distributors, collected on the due date">
                  <div className="market-list">
                    {specialOrders.map(so => {
                      const left = (so.dueDay ?? 0) - today
                      const balance = Math.max(0, (so.price || 0) - (so.deposit || 0))
                      return (
                        <div className={`listing-row ${!so.sourced && left <= 1 ? 'stale' : ''}`} key={so.id}>
                          <div className="listing-main">
                            <div className="listing-info">
                              <div className="listing-name">{so.what}</div>
                              <div className="cap">
                                {fmtMoney(so.deposit)} deposit down · {fmtMoney(balance)} due at pickup
                              </div>
                              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                <span className="pill" style={{ color: so.sourced ? 'var(--green)' : 'var(--gold)' }}>
                                  {so.sourced ? '📦 In and held for them' : '🔎 Still sourcing'}
                                </span>
                                <span className="pill" style={{ color: left < 0 ? 'var(--red)' : left <= 1 ? 'var(--gold)' : undefined }}>
                                  {left < 0 ? `${-left}d overdue` : left === 0 ? 'due today' : `due in ${left}d`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="cap mt-3">
                    Sourcing buys from the cheapest distributor that has it, and never spends the till below a day's lease.
                    A promise you can't fill costs the deposit back, 3★, and a line on the demand board.
                  </p>
                </Collapse>
              )}

              {/* Collection buy-ins: locals selling YOU their cards — pending decisions, so open */}
              {(buyinOffers || []).length > 0 && (
                <Collapse id="store-buyins" defaultOpen head="🛍️ Collection buy-ins"
                  badge={`${buyinOffers.length} waiting`}
                  hint={`— locals selling to you: appraise the lot, pay cash or store credit (+${Math.round(STORE_CREDIT_BONUS * 100)}%, they spend it back at your counter)`}>
                  <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))' }}>
                    {buyinOffers.map(o => {
                      const est = upgrades.loupe ? o.estimateTight : o.estimate
                      const credit = Math.round(o.askCash * (1 + STORE_CREDIT_BONUS) * 100) / 100
                      const stuff = o.sealedCount ? 'of cards & sealed' : 'of cards'
                      return (
                        <div key={o.id} className={`product ${o.estate ? 'estate-lot' : ''} ${o.jewel ? 'jewel-lot' : ''}`}>
                          <h3 className="t-md" style={{ margin: 0 }}>{o.jewel ? '🗝️ ' : o.estate ? '📦 ' : ''}{o.who.charAt(0).toUpperCase() + o.who.slice(1)}</h3>
                          <div className="meta" style={{ flex: 1 }}>
                            A lot of <b>{o.count} cards</b>{o.sealedCount ? <> + <b>{o.sealedCount} sealed</b></> : ''} — {o.hint}.<br />
                            {o.jewel && <><b style={{ color: 'var(--gold, #ffd45e)' }}>🗝️ A sealed vintage pack is in this lot</b> — worth more unopened than the rip, and it climbs while you hold it.<br /></>}
                            Your read: <b title={upgrades.loupe ? 'Loupe appraisal — tight (±8%)' : 'Eyeball estimate (±25%) — the 🔍 Jeweler\'s Loupe reads lots much tighter'}>
                              ~{fmtMoney(est)} {stuff} {upgrades.loupe ? '🔍' : '👁️'}</b>
                            <br />{o.free
                              ? <b className="pos">Free — they just want it gone</b>
                              : <>Asking <b>{fmtMoney(o.askCash)}</b> cash</>} · they'll wait {o.pendingDays}d
                          </div>
                          <div className="row" style={{ gap: 5 }}>
                            <button className="btn gold t-xs" style={{ padding: '6px 8px' }} disabled={!o.free && cash < o.askCash}
                              title={o.free ? 'Take the whole collection — they\'re giving it away' : 'Pay their ask in cash — done and dusted'}
                              onClick={() => { const r = acceptBuyin(o.id, 'cash'); if (r.error) flash(r.error); else setBuyinReveal(r) }}>
                              {o.free ? '🎁 Take it — FREE' : `💵 ${fmtMoney(o.askCash)}`}
                            </button>
                            {!o.free && (
                              <button className="btn t-xs" style={{ padding: '6px 8px' }}
                                title={`No cash down — issue ${fmtMoney(credit)} store credit instead. They spend it back at your counter over time (and some never gets redeemed). Credit sellers tend to become regulars.`}
                                onClick={() => { const r = acceptBuyin(o.id, 'credit'); if (r.error) flash(r.error); else setBuyinReveal(r) }}>
                                💳 {fmtMoney(credit)}
                              </button>
                            )}
                            <button className="btn alt t-xs btn-fixed" style={{ maxWidth: 70, padding: '6px 8px' }}
                              onClick={() => { declineBuyin(o.id); flash('Passed on the lot.') }}>Pass</button>
                          </div>
                          {/* 🤝 Haggle the ask: their hidden floor was rolled when they walked in — the
                              hint line is your tell. Push too hard and the whole lot walks. */}
                          {!o.free && !o.haggled && (o.haggleRounds || 0) < 2 && (haggleId === o.id ? (
                            <div className="row" style={{ gap: 5, marginTop: 4, alignItems: 'center' }}>
                              <input className="t-xs" type="number" min="1" step="1" value={haggleVal} onChange={e => setHaggleVal(e.target.value)}
                                style={{ width: 84, padding: '5px 6px' }} aria-label="Your counter-offer" />
                              <button className="btn t-xs btn-fixed" style={{ padding: '6px 10px' }} onClick={() => {
                                const r = counterBuyin(o.id, Number(haggleVal))
                                if (r.error) flash(r.error)
                                else if (r.walked) { flash('They took the lowball badly — packed it all up and walked.'); setHaggleId(null) }
                                else if (r.accepted) { flash(`🤝 Deal — they'll take ${fmtMoney(r.price)}. Pay to close it.`); setHaggleId(null) }
                                else flash(`They countered at ${fmtMoney(r.counter)}${(o.haggleRounds || 0)>= 1 ? " — that's their final round" : ''}.`)
                              }}>Offer</button>
                              <span className="cap">{2 - (o.haggleRounds || 0)} round{2 - (o.haggleRounds || 0) > 1 ? 's' : ''} left · walk risk rises the lower you go</span>
                            </div>
                          ) : (
                            <button className="btn alt t-xs" style={{ padding: '4px 8px', marginTop: 4, alignSelf: 'flex-start' }}
                              title="Counter their ask. Estate sellers usually have room ('just wants it gone'); comp-checkers barely budge — and pushing too hard loses the whole lot."
                              onClick={() => { setHaggleId(o.id); setHaggleVal(String(Math.max(1, Math.round(o.askCash * 0.85)))) }}>
                              🤝 Haggle
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </Collapse>
              )}

              {/* 📊 Demand board: what walk-ins hunted for and left without — stock it */}
              {demandTop.length > 0 && (
                <Collapse id="store-demand" head="📊 What the town's asking for"
                  badge={`${demandTop.length}`}
                  hint="— walk-ins who left empty-handed this fortnight; stock it to catch the sale">
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {demandTop.map(([what, n]) => (
                      <span key={what} className="pill" style={{ background: '#ffcb0522', color: 'var(--gold, #ffd45e)' }}>
                        {what}{n > 1 ? <b> ×{n}</b> : ''}
                      </span>
                    ))}
                  </div>
                </Collapse>
              )}

              {/* 🧢 Supplies rack: the accessory margin engine — wholesale in, retail out */}
              <Collapse id="store-supplies" head="🧢 Supplies rack"
                badge={`${Object.values(supplies || {}).reduce((a, b) => a + b, 0)} in stock`}
                hint="— sleeves & accessories sell across the counter at ~50% margin (league nights clear the rack); buy wholesale by the case">
                <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', marginTop: 4 }}>
                  {SUPPLIES.map(it => {
                    const qty = supplies?.[it.id] || 0
                    const caseCost = it.cost * SUPPLY_CASE
                    return (
                      <div key={it.id} className="product">
                        <h3 className="t-sm" style={{ margin: 0 }}>{it.icon} {it.name}</h3>
                        <div className="meta" style={{ flex: 1 }}>
                          In stock: <b style={{ color: qty ? 'var(--green)' : 'var(--red)' }}>{qty}</b> · retails at <b>{fmtMoney(it.retail)}</b>
                        </div>
                        <button className="btn t-xs" style={{ padding: '6px 8px' }} disabled={cash < caseCost}
                          title={`Wholesale a case of ${SUPPLY_CASE} at ${fmtMoney(it.cost)}/unit — sells through at ${fmtMoney(it.retail)}`}
                          onClick={() => { if (buySupplies(it.id, 1)) flash(`🧢 Stocked ${SUPPLY_CASE}× ${it.name}.`) }}>
                          Case of {SUPPLY_CASE} · {fmtMoney(caseCost)}
                        </button>
                      </div>
                    )
                  })}
                </div>
                {(suppliesStats?.sold || 0) > 0 && (
                  <div className="cap" style={{ margin: '6px 2px 0' }}>
                    Lifetime: <b>{suppliesStats.sold}</b> sold · <b className="pos">{fmtMoney(suppliesStats.revenue)}</b> rung up
                  </div>
                )}
              </Collapse>

              {/* 🗑️ Bulk bin: the quarter box — chaff in, foot-traffic cash out */}
              <BulkBin />

              {/* Consignment intake: locals waiting on a yes/no — pending decisions, so open */}
              {(storeConsignRequests || []).length > 0 && (
                <Collapse id="store-consign-intake" defaultOpen head="🧾 Consignment intake"
                  badge={`${storeConsignRequests.length} waiting`}
                  hint="— locals want YOU to sell their card; you keep a cut, zero cash down">
                  <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
                    {storeConsignRequests.map(r => (
                      <div key={r.id} className="product">
                        {cardImg(r.card) && <img src={cardImg(r.card)} alt="" style={{ width: 56, borderRadius: 8, alignSelf: 'center' }} />}
                        <h3 className="t-md" style={{ margin: 0 }}>{r.who} brings a {r.card.name}</h3>
                        {setNameOfCard(r.card) && <div className="cap">{setNameOfCard(r.card)}</div>}
                        <div className="meta" style={{ flex: 1 }}>
                          Their ask <b>{fmtMoney(r.ask)}</b> · your cut <b className="pos">{Math.round(r.commissionPct * 100)}% ({fmtMoney(r.ask * r.commissionPct)})</b>
                          <br />Carry it ~{r.days}d · they'll wait {r.pendingDays}d for an answer
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn gold" onClick={() => { acceptConsignRequest(r.id); flash(`${r.card.name} is in your case — ${Math.round(r.commissionPct * 100)}% is yours when it sells.`) }}>Take it in</button>
                          <button className="btn alt btn-fixed" style={{ maxWidth: 80 }} onClick={() => { declineConsignRequest(r.id); flash('Passed — they took it elsewhere.') }}>Pass</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapse>
              )}

              {/* ⭐ Display case features — the whale bait */}
              <Collapse id="store-featured" head="⭐ Display case"
                badge={`${featured.length + featuredSealed.length}/${FEATURED_MAX}`}
                hint={`— feature up to ${FEATURED_MAX} pieces (singles or sealed); featured pieces are what deep-pocketed whales come in for (they show up earlier and pay 1.15–1.6×)`}>
                {featured.length + featuredSealed.length === 0 ? (
                  <div className="cap" style={{ margin: '6px 2px' }}>Nothing featured yet — hit <b>⭐</b> on a stock line below to spotlight your best pieces.</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', marginTop: 4 }}>
                    {featured.map(c => (
                      <div key={c.uid} className="vendoritem featured">
                        <CardTile card={c} interactive={false} />
                        <button className="btn alt t-xs" style={{ padding: '4px 8px' }}
                          onClick={() => toggleFeatureCard(c.uid)}>☆ Unfeature</button>
                      </div>
                    ))}
                    {featuredSealed.map(it => {
                      const fset = setById(it.setId)
                      return (
                        <div key={it.uid} className="vendoritem featured">
                          <div className="cardtile no-edge sealed-tile">
                            {fset?.logo
                              ? <img className="sealed-tile-logo" src={fset.logo} alt={fset.name} loading="lazy" decoding="async" />
                              : <span className="sealed-ico">{it.product.icon || '📦'}</span>}
                            <div className="sealed-name">{it.product.icon || '📦'} {it.product.type}</div>
                            {fset && <div className="sealed-set" title={fset.name}>{fset.name}</div>}
                            <div className="sealed-sub muted">{it.product.packs} pk{it.vintage ? ' · 🗝️ vintage' : ''}</div>
                            <span className="price">{fmtMoney(sealedValue(it))}</span>
                          </div>
                          <button className="btn alt t-xs" style={{ padding: '4px 8px' }}
                            onClick={() => toggleFeatureSealed(it.uid)}>☆ Unfeature</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Collapse>

              {/* 🛒 Shop floor stock — singles and sealed on separate shelves, only this sells to
                  walk-ins & the counter */}
              <StoreStock place="floor" split onRip={onRip} onSift={onSift} onPick={onPick}
                onHold={activeRegulars.length ? (kind, uid, label) => setHoldPick({ kind, uid, label }) : undefined} />
              {omni.length > 0 && (
                <div className="toolbar mt-4">
                  <span className="cap">🌐 {omni.length} listed-everywhere card{omni.length > 1 ? 's' : ''} also in the case:</span>
                  {omni.sort((a, b) => cardValue(b.l.card) - cardValue(a.l.card)).map(({ l, idx }) => (
                    <span key={l.card.uid} className="pill" style={{ background: '#5aa0ff22', color: '#5aa0ff' }}
                      title="Listed everywhere — also up on your site. Whichever channel sells it first takes it. Tap to make it online-only.">
                      {l.card.name} · {fmtMoney(l.ask)}
                      <button className="btn alt t-xs" style={{ marginLeft: 6, padding: '1px 6px' }}
                        onClick={() => { setListingEverywhere(idx, false); flash(`${l.card.name} is online-only now.`) }}>↩</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Consignment case: locals' cards you're carrying */}
              {(storeConsignments || []).length > 0 && (
                <Collapse id="store-consigncase" head="🤝 Consignment case"
                  badge={`${storeConsignments.length}`}
                  hint="— locals' cards you're selling for a cut (not yours; unsold goes home)">
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                    {storeConsignments.map(c => (
                      <div key={c.id} className="vendoritem">
                        <CardTile card={c.card} interactive={false} />
                        <div className="cap" style={{ textAlign: 'center' }}>
                          {c.who} · ask {fmtMoney(c.ask)}<br />your cut <b className="pos">{fmtMoney(c.ask * c.commissionPct)}</b> · {c.daysLeft}d left
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapse>
              )}

              {/* Giveaway */}
              <Collapse id="store-giveaway" head="🎁 In-store giveaway"
                badge={giveawayDaysLeft > 0 ? `🎉 buzz ${giveawayDaysLeft}d` : null}
                hint={`— give a card to the locals: goodwill, reputation, and a ${GIVEAWAY_BUZZ_DAYS}-day foot-traffic buzz`}>
                <div className="toolbar mt-2">
                  <button className="btn gold btn-fixed"  disabled={!collection.length}
                    onClick={() => setGivePick(true)}>🎁 Pick a card to give away</button>
                  {giveawayDaysLeft > 0
                    ? <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>🎉 Buzz live · {giveawayDaysLeft}d left</span>
                    : <span className="cap">Pricier card → bigger pop. Regulars warm up (+trust); the 🎗️ Charity Banner boosts the reputation.</span>}
                </div>
              </Collapse>

              {/* Hosted events: plan tonight, it happens when the day turns */}
              <Collapse id="store-events" head="🎪 Host an event"
                badge={storeEventPlanned ? `tonight: ${STORE_EVENTS[storeEventPlanned.type]?.icon || '🎪'}` : weeklyEvent ? '📆 weekly set' : eventCooldownLeft > 0 ? `resting ${eventCooldownLeft}d` : null}
                hint="— recurring nights are what real shops run on: traffic, community, and money at the door">
                {storeEventPlanned ? (
                  <div className="banner mt-2">
                    {STORE_EVENTS[storeEventPlanned.type]?.icon} <b>Tonight: {STORE_EVENTS[storeEventPlanned.type]?.name}</b>
                    {storeEventPlanned.prizeCard ? <> · prize: <b>{storeEventPlanned.prizeCard.name}</b></> : ''} — it happens when you hit <b>Next Day</b>.
                    <button className="btn alt btn-fixed" style={{ maxWidth: 120, marginLeft: 10, padding: '4px 10px' }}
                      onClick={() => { cancelStoreEvent(); flash('Called it off — refunded.') }}>Call it off</button>
                  </div>
                ) : eventCooldownLeft > 0 ? (
                  <div className="cap" style={{ margin: '6px 2px' }}>😮‍💨 The room needs a breather — you can host again in <b>{eventCooldownLeft} day{eventCooldownLeft > 1 ? 's' : ''}</b>.</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', marginTop: 4 }}>
                    {Object.entries(STORE_EVENTS).map(([key, ev]) => {
                      const locked = ev.minRank != null ? rank < ev.minRank : notoriety < (ev.minNoto || 0)
                      const lockRank = locked && ev.minRank != null ? RANKS[ev.minRank] : null
                      const cantAfford = cash < ev.cost
                      const isWeekly = weeklyEvent?.type === key
                      return (
                        <div key={key} className="product">
                          <h3 className="t-md" style={{ margin: 0 }}>{ev.icon} {ev.name}{isWeekly ? <span className="pill t-xs" style={{ marginLeft: 6 }}>📆 weekly</span> : null}</h3>
                          <div className="meta" style={{ flex: 1 }}>{ev.desc}</div>
                          <button className="btn" disabled={locked || cantAfford}
                            title={lockRank ? `Needs the ${lockRank.emoji} ${lockRank.name} rank (see the Stats tab)` : locked ? `Needs ${ev.minNoto} reputation` : ev.needsPrize ? 'Pick the prize card next' : undefined}
                            onClick={() => {
                              if (ev.needsPrize) { setRafflePick(true); return }
                              const r = planStoreEvent(key)
                              flash(r.error || `${ev.icon} ${ev.name} is on tonight — hit Next Day to run it.`)
                            }}>
                            {lockRank ? `🔒 ${lockRank.emoji} ${lockRank.name}` : locked ? `🔒 ${ev.minNoto}★` : `Host tonight · $${ev.cost}`}
                          </button>
                          {/* 🎪 Events Coordinator: flag ONE event as the standing weekly night (raffles
                              can't recur — they need a prize picked each time). */}
                          {upgrades.eventsCoordinator && !ev.needsPrize && !locked && (
                            <button className="btn alt t-xs" style={{ marginTop: 6, padding: '4px 10px' }}
                              onClick={() => {
                                const r = setWeeklyEvent(isWeekly ? null : key)
                                flash(r.error || (isWeekly ? '📆 Standing night cleared.' : `📆 ${ev.name} runs weekly now — the coordinator books it and pays from the till.`))
                              }}>
                              {isWeekly ? '📆 Stop weekly nights' : '📆 Make it weekly'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Collapse>
            </>
          )
        })()
      ) : sellTab === 'forum' ? (
        // The public WTB board: anyone-can-fill wanted ads. Your early-game demand engine
        // before strangers start DMing you directly (see INBOUND_NOTORIETY_GATE).
        <>
          <div className="banner mt-6">
            📋 The community <b>forum</b> — collectors post cards they're hunting for. Fill a request from your
            collection for an <b>above-market premium</b> (+ a little reputation). The way to drum up business before
            you've made a name. Go rip or buy what they want, then fulfill it here.
          </div>
          {forumCount === 0 ? (
            <div className="empty mt-6">The board's quiet right now — let a day pass for new posts. 📭</div>
          ) : (
            <div className="grid stagger-grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', marginTop: 14 }}>
              {forumPosts.map(p => {
                const matches = cardsForForumPost(p)
                return (
                  <div key={p.id} className={`product want ${matches.length ? 'fillable' : ''}`}>
                    {p.img && <img src={p.img} alt="" style={{ width: 56, borderRadius: 8, alignSelf:'center' }} />}
                    <h3 className="t-md" style={{ margin: 0 }}>📋 WTB: {p.desc.replace(/^.*? wants /, '')}</h3>
                    <div className="meta" style={{ flex:1 }}>
                      <span className="muted">— {p.who}</span><br/>
                      Pays <b className="pos">+{Math.round((p.premiumMult-1)*100)}%</b> over market · +{p.notoriety}★ · expires in {p.daysLeft}d
                    </div>
                    {matches.length
                      ? <button className="btn gold" onClick={() => setWantPick({ kind: 'forum', item: p })}>Fill it ({matches.length} match{matches.length>1?'es':''})</button>
                      : <button className="btn" disabled>Don't have it — go find one</button>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
      <>
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
            🏬 Your store stock, holds, consignments & giveaways live on the <b>Shop floor</b> tab
            {(storeConsignRequests || []).length ? <b> — {storeConsignRequests.length} consignment ask{storeConsignRequests.length > 1 ? 's' : ''} waiting</b> : ''}.
          </span>
          <button className="btn alt btn-fixed" style={{ padding: '4px 10px' }} onClick={() => setSellTab('store')}>Open →</button>
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

      {validInbox.length === 0 ? (
        <div className="empty">No orders waiting. Let a day pass (or attend a show) to bring customers in. 📨</div>
      ) : (() => {
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
          const items = validInbox.filter(x => !used.has(x.i) && sec.match(x))
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
                        : enc.kind === 'quote' ? '🗣️ Name your price →'
                        : enc.channel === 'online' ? 'Respond →' : 'Help customer →'}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      })()}
      </>
      )}

      {active && (active.enc.kind === 'sealedDeal' && active.enc.deal
        ? <SealedDealModal enc={active.enc} id={active.id} flash={flash}
            onDone={() => setActive(null)} onCancel={() => setActive(null)} />
        /* 🗣️ A quote walk-up is not a pick-an-option encounter — it is a negotiation where YOU
           name the number, so it gets the same dedicated screen the show floor uses. Closing it
           clears the inbox entry the way pick() does, because the deal is done either way and a
           settled seller must not still be standing at the counter tomorrow. */
        : active.enc.kind === 'quote'
        ? <QuoteCounter req={active.enc} onDone={(msg) => { if (msg) flash(msg); clearItem(active.id); setActive(null) }} />
        : <Encounter data={active.enc} onPick={pick} onClose={() => setActive(null)} />)}

      {/* Hold picker: choose WHICH regular you're saving the item for — only regulars who
          actually collect this item/set are shown, so you never hold a Perfect Order pack
          for someone building Generations. */}
      {holdPick && (() => {
        // The item being held, so we can match it against each regular's focus (collecting lane).
        const item = holdPick.kind === 'sealed'
          ? (sealedInventory || []).find(x => x.uid === holdPick.uid)
          : collection.find(c => c.uid === holdPick.uid)
        const itemSetId = item ? (holdPick.kind === 'sealed' ? item.setId : setIdOfCard(item)) : null
        // For a card, reuse cardMatchesFocus (respects rarity-rank lanes); for a sealed pack,
        // a set/rarity focus for that set matches, and an 'any' focus always matches.
        const wants = (r) => {
          const f = r.focus
          if (!f) return false
          if (f.kind === 'any') return true
          if (holdPick.kind === 'card') return item ? cardMatchesFocus(item, f) : false
          return f.setId === itemSetId
        }
        const candidates = (regulars || []).filter(r => !r.flags?.burned && wants(r))
        return (
          <Modal onClose={() => setHoldPick(null)} maxWidth={480} label="Hold for regular">
              <h2 className="t-xl" style={{ marginBottom: 2 }}>🔒 Save {holdPick.label} for…</h2>
              <p className="cap t-sm mt-0">
                It goes to the storeroom's "saved for regulars" shelf (off the sellable floor) for
                ~{HOLD_DAYS_STORE} days. The more they trust you, the sooner they come in — and they
                pay a small premium for the favor.
              </p>
              {candidates.length === 0 ? (
                <div className="empty">No regular is collecting this{itemSetId ? ' set' : ''} right now — holds only make sense for someone who wants it.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {candidates.map(r => (
                    <button key={r.id} className="encbtn" onClick={() => {
                      if (holdShelfItem(holdPick.kind, holdPick.uid, r.id)) flash(`Saved ${holdPick.label} for ${r.emoji} ${r.name}.`)
                      setHoldPick(null)
                    }}>
                      {r.emoji} <b>{r.name}</b> · {r.channel === 'walkin' ? '🏬 store regular' : '🌐 online regular'} · trust {Math.round(r.trust || 0)}{r.focus?.label ? ` · ${r.focus.label}` : ''}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setHoldPick(null)}>Cancel</button>
          </Modal>
        )
      })()}

      {/* Giveaway picker: choose the card to give away — value drives the pop. */}
      {givePick && (
        <Modal onClose={() => setGivePick(false)} maxWidth={680} label="Giveaway pick">
            <h2 className="t-xl" style={{ marginBottom: 2 }}>🎁 In-store giveaway</h2>
            <p className="cap t-sm mt-0">
              Pick the prize. A pricier card makes a bigger splash — more reputation, and a
              {' '}{GIVEAWAY_BUZZ_DAYS}-day walk-in buzz either way. Every regular warms up a little.
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
              {collection.filter(c => !c.locked && !c._heldFor).sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 60).map(c => {
                const pop = Math.min(15, Math.round(2 + Math.sqrt(cardValue(c))))
                return (
                  <div key={c.uid} className="vendoritem">
                    <CardTile card={c} interactive={false} />
                    <button className="btn gold t-xs" style={{ padding: '4px 8px' }} onClick={() => {
                      const r = runGiveaway(c.uid)
                      if (r) flash(`🎁 Gave away ${c.name} — the room went nuts! (+${r.noto}★, ${GIVEAWAY_BUZZ_DAYS}-day buzz)`)
                      setGivePick(false)
                    }}>Give · +{pop}★</button>
                  </div>
                )
              })}
            </div>
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setGivePick(false)}>Cancel</button>
        </Modal>
      )}

      {/* Buy-in reveal: the lot you just bought — was your appraisal right? */}
      {buyinReveal && (
        <Modal onClose={() => setBuyinReveal(null)} maxWidth={680} label="Buy-in reveal">
            <h2 className="t-xl" style={{ marginBottom: 2 }}>
              {buyinReveal.market >= buyinReveal.paid * 1.3 ? '🤑' : buyinReveal.market >= buyinReveal.paid ? '🙂' : '😬'} The lot, flipped through
            </h2>
            <p className="cap t-sm mt-0">
              {buyinReveal.free
                ? <><b className="pos">Free</b> — the whole collection, no charge · </>
                : <>Paid <b>{buyinReveal.method === 'credit' ? `${fmtMoney(buyinReveal.paid)} store credit` : `${fmtMoney(buyinReveal.paid)} cash`}</b> · </>}
              market value <b style={{ color: buyinReveal.market >= buyinReveal.paid ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(buyinReveal.market)}</b>
              {buyinReveal.method === 'credit' && !buyinReveal.free ? ' · no cash left the till — they\'ll spend the credit back at your counter.' : ''} All {buyinReveal.cards.length} cards are in your collection{buyinReveal.sealed?.length ? `; ${buyinReveal.sealed.length} sealed went to your 📦 storeroom` : ''}.
            </p>
            {buyinReveal.sealed?.length > 0 && (
              <div className="wants mt-2">
                <div className="wants-head t-sm">📦 Sealed in the lot <span className="muted">— now in your storeroom to rip, list, flip, or hold</span></div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {buyinReveal.sealed.map(it => (
                    <span key={it.uid} className="pill" style={it.vintage
                      ? { background: '#ffd45e22', color: '#ffd45e', fontSize: 12, boxShadow: '0 0 0 1px #ffd45e55 inset' }
                      : { background: '#5aa0ff22', color: '#9dc3ff', fontSize: 12 }}>
                      {it.vintage ? '🗝️' : (it.product.icon || '📦')} {it.product.type}{setById(it.setId)?.name ? ` · ${setById(it.setId).name}` : ''} · <b className="pos">{fmtMoney(sealedValue(it))}</b>
                    </span>
                  ))}
                </div>
                {buyinReveal.sealed.some(it => it.vintage) && (
                  <p className="cap" style={{ margin: '6px 2px 0' }}>
                    🗝️ That vintage pack is worth <b>more sealed than the rip</b> — and vintage sealed <b>appreciates</b> while it sits. Cracking it is the gamble; holding (or flipping) is the sure thing. Your call in the storeroom.
                  </p>
                )}
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', marginTop: 8 }}>
              {[...buyinReveal.cards].sort((a, b) => cardValue(b) - cardValue(a)).map(c => (
                <div key={c.uid} className="vendoritem">
                  <CardTile card={c} interactive={false} />
                </div>
              ))}
            </div>
            <button className="btn gold" style={{ marginTop: 14, maxWidth: 160 }} onClick={() => setBuyinReveal(null)}>Nice →</button>
        </Modal>
      )}

      {/* Raffle prize picker: the card that goes home with a winner tonight. */}
      {rafflePick && (
        <Modal onClose={() => setRafflePick(false)} maxWidth={680} label="Raffle prize">
            <h2 className="t-xl" style={{ marginBottom: 2 }}>🎟️ Raffle Night — pick the prize</h2>
            <p className="cap t-sm mt-0">
              A flashier prize sells more tickets worth of goodwill — bigger reputation pop when it's drawn.
              Costs ${STORE_EVENTS.raffle.cost} to run; ticket money comes in when the night happens.
            </p>
            {collection.filter(c => !c.locked && !c._heldFor).length === 0 ? <div className="empty">No cards to raffle (🔒 keepsakes are excluded).</div> : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                {collection.filter(c => !c.locked && !c._heldFor).sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 60).map(c => (
                  <div key={c.uid} className="vendoritem">
                    <CardTile card={c} interactive={false} />
                    <button className="btn gold t-xs" style={{ padding: '4px 8px' }} onClick={() => {
                      const r = planStoreEvent('raffle', c.uid)
                      flash(r.error || `🎟️ Raffle Night is on — ${c.name} is the prize. Hit Next Day to run it.`)
                      setRafflePick(false)
                    }}>Prize · {fmtMoney(cardValue(c))}</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setRafflePick(false)}>Cancel</button>
        </Modal>
      )}

      {wantPick && (() => {
        // One picker for both collector wants and forum WTB posts (same matcher/payout).
        const item = wantPick.item
        const isForum = wantPick.kind === 'forum'
        const matches = isForum ? cardsForForumPost(item) : cardsForWant(item)
        return (
        <Modal onClose={() => setWantPick(null)} maxWidth={640} label="Pick a card">
            <h2 className="t-xl" style={{ marginBottom: 2 }}>{isForum ? 'Fill forum WTB' : 'Fill'}: {item.desc}</h2>
            <p className="cap t-sm mt-0">Pick which copy to hand over — {isForum ? 'the poster' : 'they'} pay {Math.round(item.premiumMult*100)}% of its market value, +{item.notoriety}★ reputation.</p>
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))' }}>
              {matches.map(c => (
                <div key={c.uid} className="vendoritem">
                  <CardTile card={c} interactive={false} />
                  <button className="btn gold" onClick={() => {
                    const r = isForum ? fulfillForumPost(item.id, c.uid) : fulfillWant(item.id, c.uid)
                    if (r) flash(`${isForum ? 'Filled a forum request' : 'Filled the want'} — earned ${fmtMoney(r.payout)} (+${item.notoriety}★)`)
                    setWantPick(null)
                  }}>Give · {fmtMoney(cardValue(c) * item.premiumMult)}</button>
                </div>
              ))}
            </div>
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setWantPick(null)}>Cancel</button>
        </Modal>
        )
      })()}
    </>
  )
}

