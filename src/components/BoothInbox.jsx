import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGame, acceptedMethods, PAYMENT_METHODS, INBOX_CAP, INBOUND_NOTORIETY_GATE, BARGAIN_ASK_MULT, HOLD_DAYS_STORE, GIVEAWAY_BUZZ_DAYS,
  STORE_EVENTS, STORE_CREDIT_BONUS, EVENT_COOLDOWN_DAYS } from '../game/store'
import { fmtMoney, cardValue, sealedValue, setById, round2 } from '../game/engine'
import { encounterStillValid } from '../game/shows'
import { groupCardLines, groupLines, sealedSku, skuBadge } from './sku'
import Encounter from './Encounter'
import SealedDealModal from './SealedDealModal'
import CardTile from './CardTile'
import SellStrips from './SellStrips'
import MysteryPacks from './MysteryPacks'
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
  const FEATURED_MAX = useGame(s => s.FEATURED_MAX)
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
  const storeCredit = useGame(s => s.storeCredit)
  const storeEventPlanned = useGame(s => s.storeEventPlanned)
  const eventCooldownLeft = useGame(s => s.eventCooldownLeft)
  const acceptBuyin = useGame(s => s.acceptBuyin)
  const declineBuyin = useGame(s => s.declineBuyin)
  const planStoreEvent = useGame(s => s.planStoreEvent)
  const cancelStoreEvent = useGame(s => s.cancelStoreEvent)
  useEffect(() => { ensureDailyGoals() }, [ensureDailyGoals])
  // Drop orders whose card you no longer own (e.g. sold it at a show) — keep the
  // original index so clearing/responding still targets the right inbox slot.
  // A card that's listed/tweeted still counts as owned (online offers target listings).
  const validInbox = useMemo(
    () => inbox.map((enc, i) => ({ enc, i })).filter(({ enc }) => encounterStillValid(enc, collection, listings, shopDisplay)),
    [inbox, collection, listings, shopDisplay])
  const consignments = useGame(s => s.consignments)
  const [active, setActive] = useState(null) // {enc, idx}
  const [wantPick, setWantPick] = useState(null) // a want/forum post being fulfilled {kind:'want'|'forum', item}
  const [holdPick, setHoldPick] = useState(null) // shelf item being held for a regular {kind, uid, label}
  const [givePick, setGivePick] = useState(false) // picking a card for the in-store giveaway
  const [rafflePick, setRafflePick] = useState(false) // picking the raffle prize card
  const [buyinReveal, setBuyinReveal] = useState(null) // the lot you just bought: {cards, market, paid, method}
  const [showAllStock, setShowAllStock] = useState(false) // store-stock SKU list: show past the first 60 lines
  const toggleFeatureCard = useGame(s => s.toggleFeatureCard)
  const [toast, setToast] = useState(null)
  useModalEscape(() => { // close the top-most picker on Esc
    if (buyinReveal) setBuyinReveal(null)
    else if (rafflePick) setRafflePick(false)
    else if (givePick) setGivePick(false)
    else if (holdPick) setHoldPick(null)
    else if (wantPick) setWantPick(null)
  })
  // Sell splits into sub-tabs: day-to-day Orders, your Shop floor (case, holds,
  // consignment intake, giveaways), your Mystery pack line, the public Forum board,
  // and On the market.
  const [sellTab, setSellTab] = useState('orders') // 'orders' | 'store' | 'packs' | 'forum' | 'market'
  const listingOfferCount = listings.filter(l => (l.offers?.length || 0) > 0).length
  const marketCount = listings.length + consignments.length
  const forumCount = (forumPosts || []).length
  const builtPackCount = useGame(s => (s.builtPacks || []).length)

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
        {hasStore && (() => {
          const waiting = (storeConsignRequests || []).length + (buyinOffers || []).length
          return (
            <button className={`subtab ${sellTab === 'store' ? 'active' : ''}`} onClick={() => setSellTab('store')}>
              🏬 Shop floor{waiting ? ` (${waiting})` : ''}
            </button>
          )
        })()}
        <button className={`subtab ${sellTab === 'packs' ? 'active' : ''}`} onClick={() => setSellTab('packs')}>
          ❓ Packs{builtPackCount ? ` (${builtPackCount})` : ''}
        </button>
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
          : <div className="empty">Nothing on the market. List or consign cards from your collection (Cards → Select) to sell them here. 🌐</div>
      ) : sellTab === 'packs' ? (
        // Your custom mystery-pack product line: tiers, the builder, and built stock.
        <MysteryPacks />
      ) : sellTab === 'store' ? (
        // ---- 🏬 Shop floor: the physical store, in sections — what's in the case
        // (singles + sealed), holds behind the counter, the consignment case you run
        // for locals, and the in-store giveaway lever.
        (() => {
          const omni = listings.map((l, idx) => ({ l, idx })).filter(({ l }) => l.everywhere && !l.expired && !l.card?._sealed)
          const activeRegulars = (regulars || []).filter(r => !r.flags?.burned)
          const holdBtnTitle = activeRegulars.length ? 'Set one aside for a regular — they come pick it up at a premium' : 'No regulars yet — treat walk-ins and online buyers well and they\'ll become regulars you can hold items for'
          // ONE inventory: every collection card + held sealed IS the store stock. Grouped
          // into SKU lines (identical copies stack into one row with a quantity).
          const heldItems = [
            ...collection.filter(c => c._heldFor).map(it => ({ kind: 'card', it })),
            ...(sealedInventory || []).filter(x => x._heldFor).map(it => ({ kind: 'sealed', it })),
          ]
          const featured = collection.filter(c => c._featured)
          const stockCards = collection.filter(c => !c._heldFor)
          const stockSealed = (sealedInventory || []).filter(it => !it._heldFor)
          const lines = [
            ...groupCardLines(stockCards, c => round2(cardValue(c))).map(l => ({ ...l, kind: 'card' })),
            ...groupLines(stockSealed, it => sealedSku(it.setId, it.product), it => round2(sealedValue(it))).map(l => ({ ...l, kind: 'sealed' })),
          ].sort((a, b) => b.unit - a.unit)
          const stockValue = lines.reduce((a, l) => a + l.unit * l.count, 0)
          const keptCount = stockCards.filter(c => c.locked).length + stockSealed.filter(it => it.locked).length
          const shownLines = showAllStock ? lines : lines.slice(0, 60)
          return (
            <>
              <div className="banner" style={{ marginTop: 16 }}>
                🏬 <b>Your store IS your inventory.</b> Everything you own is out on the floor for walk-ins
                (+12% in person, no fees) unless you <b>🔒 Keep</b> it. <b>⭐ Feature</b> your best pieces —
                that's what whales come in for. Buy collections off locals, hold pieces for regulars, carry
                consignments, host events, and run a 🎁 giveaway when the room needs a jolt.
                {giveawayDaysLeft > 0 && <> <b style={{ color: 'var(--gold)' }}> 🎉 Buzz live — foot traffic boosted for {giveawayDaysLeft} more day{giveawayDaysLeft > 1 ? 's' : ''}.</b></>}
                {(storeCredit || 0) > 0 && <> <span className="pill" title="Outstanding store credit you've issued — locals spend it down at your counter over the coming days; a little never gets redeemed at all." style={{ background: '#5aa0ff22', color: '#5aa0ff' }}>💳 {fmtMoney(storeCredit)} credit outstanding</span></>}
              </div>

              {/* Collection buy-ins: locals selling YOU their cards */}
              {(buyinOffers || []).length > 0 && (
                <div className="wants">
                  <div className="wants-head">🛍️ Collection buy-ins <span className="muted">— locals selling to you: appraise the lot, pay cash or store credit (+{Math.round(STORE_CREDIT_BONUS * 100)}%, they spend it back at your counter)</span></div>
                  <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))' }}>
                    {buyinOffers.map(o => {
                      const est = upgrades.loupe ? o.estimateTight : o.estimate
                      const credit = Math.round(o.askCash * (1 + STORE_CREDIT_BONUS) * 100) / 100
                      return (
                        <div key={o.id} className="product">
                          <h3 style={{ fontSize: 14, margin: 0 }}>{o.who.charAt(0).toUpperCase() + o.who.slice(1)}</h3>
                          <div className="meta" style={{ flex: 1 }}>
                            A lot of <b>{o.count} cards</b> — {o.hint}.<br />
                            Your read: <b title={upgrades.loupe ? 'Loupe appraisal — tight (±8%)' : 'Eyeball estimate (±25%) — the 🔍 Jeweler\'s Loupe reads lots much tighter'}>
                              ~{fmtMoney(est)} of cards {upgrades.loupe ? '🔍' : '👁️'}</b>
                            <br />Asking <b>{fmtMoney(o.askCash)}</b> cash · they'll wait {o.pendingDays}d
                          </div>
                          <div className="row" style={{ gap: 5 }}>
                            <button className="btn gold" style={{ padding: '6px 8px', fontSize: 12 }} disabled={cash < o.askCash}
                              title="Pay their ask in cash — done and dusted"
                              onClick={() => { const r = acceptBuyin(o.id, 'cash'); if (r.error) flash(r.error); else setBuyinReveal(r) }}>
                              💵 {fmtMoney(o.askCash)}
                            </button>
                            <button className="btn" style={{ padding: '6px 8px', fontSize: 12 }}
                              title={`No cash down — issue ${fmtMoney(credit)} store credit instead. They spend it back at your counter over time (and some never gets redeemed). Credit sellers tend to become regulars.`}
                              onClick={() => { const r = acceptBuyin(o.id, 'credit'); if (r.error) flash(r.error); else setBuyinReveal(r) }}>
                              💳 {fmtMoney(credit)}
                            </button>
                            <button className="btn alt" style={{ flex: 'none', maxWidth: 70, padding: '6px 8px', fontSize: 12 }}
                              onClick={() => { declineBuyin(o.id); flash('Passed on the lot.') }}>Pass</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Consignment intake: locals waiting on a yes/no */}
              {(storeConsignRequests || []).length > 0 && (
                <div className="wants">
                  <div className="wants-head">🧾 Consignment intake <span className="muted">— locals want YOU to sell their card; you keep a cut, zero cash down</span></div>
                  <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
                    {storeConsignRequests.map(r => (
                      <div key={r.id} className="product">
                        {r.card.img && <img src={r.card.img} alt="" style={{ width: 56, borderRadius: 8, alignSelf: 'center' }} />}
                        <h3 style={{ fontSize: 14, margin: 0 }}>{r.who} brings a {r.card.name}</h3>
                        <div className="meta" style={{ flex: 1 }}>
                          Their ask <b>{fmtMoney(r.ask)}</b> · your cut <b style={{ color: 'var(--green)' }}>{Math.round(r.commissionPct * 100)}% ({fmtMoney(r.ask * r.commissionPct)})</b>
                          <br />Carry it ~{r.days}d · they'll wait {r.pendingDays}d for an answer
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn gold" onClick={() => { acceptConsignRequest(r.id); flash(`${r.card.name} is in your case — ${Math.round(r.commissionPct * 100)}% is yours when it sells.`) }}>Take it in</button>
                          <button className="btn alt" style={{ flex: 'none', maxWidth: 80 }} onClick={() => { declineConsignRequest(r.id); flash('Passed — they took it elsewhere.') }}>Pass</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ⭐ Display case features — the whale bait */}
              <div className="wants">
                <div className="wants-head">⭐ Display case <span className="muted">— feature up to {FEATURED_MAX} pieces; featured cards are what deep-pocketed whales come in for (they show up earlier and pay 1.15–1.6×)</span></div>
                {featured.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, margin: '6px 2px' }}>Nothing featured yet — hit <b>⭐</b> on a stock line below to spotlight your best pieces.</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', marginTop: 4 }}>
                    {featured.map(c => (
                      <div key={c.uid} className="vendoritem featured">
                        <CardTile card={c} interactive={false} />
                        <button className="btn alt" style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => toggleFeatureCard(c.uid)}>☆ Unfeature</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 🏪 Store stock — the ONE inventory, one line per SKU */}
              <div className="wants">
                <div className="wants-head">🏪 Store stock <span className="muted">— {stockCards.length} card{stockCards.length === 1 ? '' : 's'} + {stockSealed.length} sealed · {fmtMoney(stockValue)} on the floor{keptCount ? ` · ${keptCount} kept back` : ''}</span></div>
                <p className="muted" style={{ fontSize: 12, margin: '2px 2px 4px' }}>
                  Your whole collection & sealed inventory is the store's stock — identical copies stack into one
                  line. <b>🔒 Keep</b> a line to take it off sale (streams, rips, shows & repacks can still use it).
                </p>
                {lines.length === 0 ? (
                  <div className="empty" style={{ marginTop: 4 }}>Nothing in stock — rip product, buy collections, or hit the Buy tab. 🛒</div>
                ) : (
                  <div className="stock-lines">
                    {shownLines.map(line => (
                      <StockLine key={`${line.kind}|${line.key}`} line={line}
                        holdEnabled={!!activeRegulars.length} holdTitle={holdBtnTitle}
                        onHold={(kind, uid, label) => setHoldPick({ kind, uid, label })} flash={flash} />
                    ))}
                    {lines.length > shownLines.length && (
                      <button className="btn alt" style={{ marginTop: 4 }} onClick={() => setShowAllStock(true)}>
                        Show all {lines.length} lines ({lines.length - shownLines.length} more)
                      </button>
                    )}
                  </div>
                )}
                {omni.length > 0 && (
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>🌐 {omni.length} listed-everywhere card{omni.length > 1 ? 's' : ''} also in the case:</span>
                    {omni.sort((a, b) => cardValue(b.l.card) - cardValue(a.l.card)).map(({ l, idx }) => (
                      <span key={l.card.uid} className="pill" style={{ background: '#5aa0ff22', color: '#5aa0ff' }}
                        title="Listed everywhere — also up on your site. Whichever channel sells it first takes it. Tap to make it online-only.">
                        {l.card.name} · {fmtMoney(l.ask)}
                        <button className="btn alt" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }}
                          onClick={() => { setListingEverywhere(idx, false); flash(`${l.card.name} is online-only now.`) }}>↩</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 🔒 Behind the counter — holds for regulars */}
              {heldItems.length > 0 && (
                <div className="wants">
                  <div className="wants-head">🗝️ Behind the counter <span className="muted">— held for regulars; they come in within a few days and pay a premium</span></div>
                  <div className="stock-lines">
                    {heldItems.map(({ kind, it }) => (
                      <div key={it.uid} className="trade-line stock-line" style={{ cursor: 'default' }}>
                        {kind === 'card'
                          ? <img className="tl-thumb" src={it.img} alt="" loading="lazy" decoding="async" />
                          : <span className="tl-icon">{it.product.icon || '📦'}</span>}
                        <div className="tl-info">
                          <div className="tl-name">{kind === 'card' ? it.name : `${it.product.type} · ${setById(it.setId)?.name || 'sealed'}`}</div>
                          <div className="tl-sub muted">held for {it._heldFor.emoji} {it._heldFor.name} · {it._heldFor.daysLeft}d left</div>
                        </div>
                        <span className="tl-unit">{fmtMoney(kind === 'card' ? cardValue(it) : sealedValue(it))}</span>
                        <button className="stock-act" onClick={() => { releaseHold(kind, it.uid); flash('Back on the floor.') }}>↩ Release</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Consignment case: locals' cards you're carrying */}
              {(storeConsignments || []).length > 0 && (
                <div className="wants">
                  <div className="wants-head">🤝 Consignment case <span className="muted">— locals' cards you're selling for a cut (not yours; unsold goes home)</span></div>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                    {storeConsignments.map(c => (
                      <div key={c.id} className="vendoritem">
                        <CardTile card={c.card} interactive={false} />
                        <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                          {c.who} · ask {fmtMoney(c.ask)}<br />your cut <b style={{ color: 'var(--green)' }}>{fmtMoney(c.ask * c.commissionPct)}</b> · {c.daysLeft}d left
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Giveaway */}
              <div className="wants">
                <div className="wants-head">🎁 In-store giveaway <span className="muted">— give a card to the locals: goodwill, notoriety, and a {GIVEAWAY_BUZZ_DAYS}-day foot-traffic buzz</span></div>
                <div className="toolbar" style={{ marginTop: 4 }}>
                  <button className="btn gold" style={{ flex: 'none' }} disabled={!collection.length}
                    onClick={() => setGivePick(true)}>🎁 Pick a card to give away</button>
                  {giveawayDaysLeft > 0
                    ? <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>🎉 Buzz live · {giveawayDaysLeft}d left</span>
                    : <span className="muted" style={{ fontSize: 12 }}>Pricier card → bigger pop. Regulars warm up (+trust); the 🎗️ Charity Banner boosts the notoriety.</span>}
                </div>
              </div>

              {/* Hosted events: plan tonight, it happens when the day turns */}
              <div className="wants">
                <div className="wants-head">🎪 Host an event <span className="muted">— recurring nights are what real shops run on: traffic, community, and money at the door</span></div>
                {storeEventPlanned ? (
                  <div className="banner" style={{ marginTop: 4 }}>
                    {STORE_EVENTS[storeEventPlanned.type]?.icon} <b>Tonight: {STORE_EVENTS[storeEventPlanned.type]?.name}</b>
                    {storeEventPlanned.prizeCard ? <> · prize: <b>{storeEventPlanned.prizeCard.name}</b></> : ''} — it happens when you hit <b>Next Day</b>.
                    <button className="btn alt" style={{ flex: 'none', maxWidth: 120, marginLeft: 10, padding: '4px 10px' }}
                      onClick={() => { cancelStoreEvent(); flash('Called it off — refunded.') }}>Call it off</button>
                  </div>
                ) : eventCooldownLeft > 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, margin: '6px 2px' }}>😮‍💨 The room needs a breather — you can host again in <b>{eventCooldownLeft} day{eventCooldownLeft > 1 ? 's' : ''}</b>.</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', marginTop: 4 }}>
                    {Object.entries(STORE_EVENTS).map(([key, ev]) => {
                      const locked = notoriety < (ev.minNoto || 0)
                      const cantAfford = cash < ev.cost
                      return (
                        <div key={key} className="product">
                          <h3 style={{ fontSize: 14, margin: 0 }}>{ev.icon} {ev.name}</h3>
                          <div className="meta" style={{ flex: 1 }}>{ev.desc}</div>
                          <button className="btn" disabled={locked || cantAfford}
                            title={locked ? `Needs ${ev.minNoto} notoriety` : ev.needsPrize ? 'Pick the prize card next' : undefined}
                            onClick={() => {
                              if (ev.needsPrize) { setRafflePick(true); return }
                              const r = planStoreEvent(key)
                              flash(r.error || `${ev.icon} ${ev.name} is on tonight — hit Next Day to run it.`)
                            }}>
                            {locked ? `🔒 ${ev.minNoto}★` : `Host tonight · $${ev.cost}`}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )
        })()
      ) : sellTab === 'forum' ? (
        // The public WTB board: anyone-can-fill wanted ads. Your early-game demand engine
        // before strangers start DMing you directly (see INBOUND_NOTORIETY_GATE).
        <>
          <div className="banner" style={{ marginTop: 16 }}>
            📋 The community <b>forum</b> — collectors post cards they're hunting for. Fill a request from your
            collection for an <b>above-market premium</b> (+ a little notoriety). The way to drum up business before
            you've made a name. Go rip or buy what they want, then fulfill it here.
          </div>
          {forumCount === 0 ? (
            <div className="empty" style={{ marginTop: 14 }}>The board's quiet right now — let a day pass for new posts. 📭</div>
          ) : (
            <div className="grid stagger-grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', marginTop: 14 }}>
              {forumPosts.map(p => {
                const matches = cardsForForumPost(p)
                return (
                  <div key={p.id} className={`product want ${matches.length ? 'fillable' : ''}`}>
                    {p.img && <img src={p.img} alt="" style={{ width: 56, borderRadius: 8, alignSelf:'center' }} />}
                    <h3 style={{ fontSize: 14, margin: 0 }}>📋 WTB: {p.desc.replace(/^.*? wants /, '')}</h3>
                    <div className="meta" style={{ flex:1 }}>
                      <span className="muted">— {p.who}</span><br/>
                      Pays <b style={{ color:'var(--green)' }}>+{Math.round((p.premiumMult-1)*100)}%</b> over market · +{p.notoriety}★ · expires in {p.daysLeft}d
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
      <div className="banner" style={{ marginTop: 16 }}>
        {notoriety < INBOUND_NOTORIETY_GATE
          // Unknown vendor: no unsolicited orders from reputation yet. Tell the truth and
          // point at the two ways to drum up demand — the Forum, or a bargain listing.
          ? (() => {
              const hasBargain = (listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
              return <>🪧 You're an <b>unknown vendor</b> (notoriety <b>{Math.round(notoriety)}</b>) — strangers don't seek you out yet. Fill <b>Forum</b> wanted-ads to build a name{hasBargain
                ? <>, and your bargain listing (≤{Math.round(BARGAIN_ASK_MULT*100)}% of market) is already drawing online deal-hunters.</>
                : <>, or list a card at <b>≤{Math.round(BARGAIN_ASK_MULT*100)}% of market</b> to pull in online deal-hunters.</>}</>
            })()
          : (listings.length === 0 && (!hasStore || (collection.length === 0 && (sealedInventory || []).length === 0)))
          // Known vendor, but nothing out for sale → no orders will come. Buyers only
          // message you about cards you've actually listed (or, with a store, stock on your floor).
          ? <>🤫 Your shop's quiet — <b>nothing's up for sale</b>. Buyers only reach out about cards you've <b>listed online</b>{hasStore ? <> or have <b>in stock at the store</b></> : ''}. Put something out and orders start arriving (notoriety <b>{Math.round(notoriety)}</b>).</>
          : hasStore
          ? <>🏬 You run a brick-and-mortar shop <b>and</b> sell online. Your whole stock is on the floor for walk-ins (🔒 keep anything that isn't); online orders come on what you've listed. Scaled by your <b>{Math.round(notoriety)}</b> notoriety.</>
          : <>🏠 You're flipping cards online from home. Each day brings marketplace/DM orders on what you've <b>listed</b> (notoriety <b>{Math.round(notoriety)}</b>). Open a <b>Brick-and-Mortar Store</b> for in-person walk-ins too.</>}
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>📅 Day {currentDay}</span>
        {/* Inbox fill indicator — the inbox holds INBOX_CAP orders; once full, the
            oldest unanswered orders drop off, so flag when it's getting close. */}
        <span className="pill" style={inbox.length >= INBOX_CAP - 1
          ? { background:'#ff9f4322', color:'#ff9f43' }
          : { background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>
          📨 Inbox {inbox.length}/{INBOX_CAP}{inbox.length >= INBOX_CAP ? ' · full!' : inbox.length >= INBOX_CAP - 1 ? ' · nearly full' : ''}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>Orders arrive as days pass — attend a show to bring in several at once.</span>
      </div>

      {dailyGoals.length > 0 && (() => {
        const resetIn = goalsResetInDays()
        return (
        <div className="goals">
          <div className="goals-head">🎯 This week's goals
            <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
              {resetIn <= 0 ? 'refreshes next day' : `refreshes in ${resetIn} day${resetIn === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="goals-row">
            {dailyGoals.map((g, i) => (
              <div key={i} className={`goal ${g.done ? 'done' : ''}`}>
                <div className="goal-label">{g.done ? '✓ ' : ''}{g.label}</div>
                <div className="goal-bar"><div style={{ width: `${Math.min(100, 100*g.progress/g.target)}%` }} /></div>
                <div className="goal-reward">{g.progress}/{g.target} · {g.cash ? fmtMoney(g.cash) : ''}{g.cash && g.noto ? ' + ' : ''}{g.noto ? `${g.noto}★` : ''}</div>
              </div>
            ))}
          </div>
        </div>
        )
      })()}

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

      {/* The shop floor (stock, holds, consignments, giveaways) lives in its own
          🏬 sub-tab now — Orders stays focused on people to answer. */}
      {hasStore && (collection.length + (sealedInventory || []).length + (storeConsignRequests || []).length) > 0 && (
        <div className="toolbar" style={{ marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            🏬 Your store stock, holds, consignments & giveaways live on the <b>Shop floor</b> tab
            {(storeConsignRequests || []).length ? <b> — {storeConsignRequests.length} consignment ask{storeConsignRequests.length > 1 ? 's' : ''} waiting</b> : ''}.
          </span>
          <button className="btn alt" style={{ flex: 'none', padding: '4px 10px' }} onClick={() => setSellTab('store')}>Open →</button>
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
                  <h3 style={{ fontSize: 14, margin: 0 }}>{w.desc}</h3>
                  <div className="meta" style={{ flex:1 }}>
                    Pays <b style={{ color:'var(--green)' }}>+{Math.round((w.premiumMult-1)*100)}%</b> over market · +{w.notoriety}★ · expires in {w.daysLeft}d
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
          { key: 'requests', title: '🙋 Walk-in requests', hint: 'someone came in hunting a specific item', match: x => x.enc.kind === 'request' },
          { key: 'offers', title: '💰 Offers & browsers', hint: 'offers on your stock, browsers, and inbound deals', match: () => true },
        ]
        const used = new Set()
        return sections.map(sec => {
          const items = validInbox.filter(x => !used.has(x.i) && sec.match(x))
          items.forEach(x => used.add(x.i))
          if (!items.length) return null
          return (
            <div key={sec.key} style={{ marginTop: 14 }}>
              <div className="wants-head">{sec.title} <span className="muted">({items.length}) — {sec.hint}</span></div>
              <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', marginTop: 8 }}>
                {items.map(({ enc, i }) => {
                  const badge = CHANNEL_BADGE[enc.channel] || CHANNEL_BADGE.online
                  // Key on stable per-encounter content, NOT the array index — clearing an item
                  // shifts indices and would make React reconcile tiles to the wrong encounter.
                  const key = enc.card?.uid || enc.ownedUid || `${enc.channel || 'c'}:${enc.title}`
                  return (
                    <div key={key} className="product" style={{ cursor: 'pointer' }} onClick={() => setActive({ enc, idx: i })}>
                      <span className="chanbadge" style={{ color: badge.color, borderColor: badge.color }}>{badge.icon} {badge.label}</span>
                      {enc.card && <img src={enc.card.img} alt="" style={{ width: 64, borderRadius: 8, alignSelf: 'center' }} />}
                      <h3 style={{ fontSize: 15, margin: 0 }}>{enc.title}</h3>
                      <div className="meta" style={{ flex: 1 }}>{enc.body.slice(0, 90)}…</div>
                      <button className="btn">{enc.kind === 'sealedDeal' ? '📦 View deal →' : enc.channel === 'online' ? 'Respond →' : 'Help customer →'}</button>
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

      {toast && <div className="toast">{toast}</div>}
      {active && (active.enc.kind === 'sealedDeal' && active.enc.deal
        ? <SealedDealModal enc={active.enc} idx={active.idx} flash={flash}
            onDone={() => setActive(null)} onCancel={() => setActive(null)} />
        : <Encounter data={active.enc} onPick={pick} onClose={() => setActive(null)} />)}

      {/* Hold picker: choose WHICH regular you're setting the item aside for. */}
      {holdPick && (() => {
        const activeRegulars = (regulars || []).filter(r => !r.flags?.burned)
        return (
          <div className="modalbg" onClick={() => setHoldPick(null)}>
            <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: 18, marginBottom: 2 }}>🔒 Hold {holdPick.label} for…</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                It goes behind the counter (off the sellable floor) for ~{HOLD_DAYS_STORE} days. The more they
                trust you, the sooner they come in — and they pay a small premium for the favor.
              </p>
              {activeRegulars.length === 0 ? (
                <div className="empty">No regulars yet — great deals turn walk-ins into regulars.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeRegulars.map(r => (
                    <button key={r.id} className="encbtn" onClick={() => {
                      if (holdShelfItem(holdPick.kind, holdPick.uid, r.id)) flash(`Holding ${holdPick.label} for ${r.emoji} ${r.name}.`)
                      setHoldPick(null)
                    }}>
                      {r.emoji} <b>{r.name}</b> · {r.channel === 'walkin' ? '🏬 store regular' : '🌐 online regular'} · trust {Math.round(r.trust || 0)}{r.focus?.label ? ` · ${r.focus.label}` : ''}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setHoldPick(null)}>Cancel</button>
            </div>
          </div>
        )
      })()}

      {/* Giveaway picker: choose the card to give away — value drives the pop. */}
      {givePick && (
        <div className="modalbg" onClick={() => setGivePick(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>🎁 In-store giveaway</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Pick the prize. A pricier card makes a bigger splash — more notoriety, and a
              {' '}{GIVEAWAY_BUZZ_DAYS}-day walk-in buzz either way. Every regular warms up a little.
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
              {[...collection].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 60).map(c => {
                const pop = Math.min(15, Math.round(2 + Math.sqrt(cardValue(c))))
                return (
                  <div key={c.uid} className="vendoritem">
                    <CardTile card={c} interactive={false} />
                    <button className="btn gold" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => {
                      const r = runGiveaway(c.uid)
                      if (r) flash(`🎁 Gave away ${c.name} — the room went nuts! (+${r.noto}★, ${GIVEAWAY_BUZZ_DAYS}-day buzz)`)
                      setGivePick(false)
                    }}>Give · +{pop}★</button>
                  </div>
                )
              })}
            </div>
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setGivePick(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Buy-in reveal: the lot you just bought — was your appraisal right? */}
      {buyinReveal && (
        <div className="modalbg" onClick={() => setBuyinReveal(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>
              {buyinReveal.market >= buyinReveal.paid * 1.3 ? '🤑' : buyinReveal.market >= buyinReveal.paid ? '🙂' : '😬'} The lot, flipped through
            </h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Paid <b>{buyinReveal.method === 'credit' ? `${fmtMoney(buyinReveal.paid)} store credit` : `${fmtMoney(buyinReveal.paid)} cash`}</b> ·
              market value <b style={{ color: buyinReveal.market >= buyinReveal.paid ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(buyinReveal.market)}</b>
              {buyinReveal.method === 'credit' ? ' · no cash left the till — they\'ll spend the credit back at your counter.' : ''} All {buyinReveal.cards.length} cards are in your collection.
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
              {[...buyinReveal.cards].sort((a, b) => cardValue(b) - cardValue(a)).map(c => (
                <div key={c.uid} className="vendoritem">
                  <CardTile card={c} interactive={false} />
                </div>
              ))}
            </div>
            <button className="btn gold" style={{ marginTop: 14, maxWidth: 160 }} onClick={() => setBuyinReveal(null)}>Nice →</button>
          </div>
        </div>
      )}

      {/* Raffle prize picker: the card that goes home with a winner tonight. */}
      {rafflePick && (
        <div className="modalbg" onClick={() => setRafflePick(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>🎟️ Raffle Night — pick the prize</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              A flashier prize sells more tickets worth of goodwill — bigger notoriety pop when it's drawn.
              Costs ${STORE_EVENTS.raffle.cost} to run; ticket money comes in when the night happens.
            </p>
            {collection.length === 0 ? <div className="empty">No cards to raffle.</div> : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                {[...collection].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 60).map(c => (
                  <div key={c.uid} className="vendoritem">
                    <CardTile card={c} interactive={false} />
                    <button className="btn gold" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => {
                      const r = planStoreEvent('raffle', c.uid)
                      flash(r.error || `🎟️ Raffle Night is on — ${c.name} is the prize. Hit Next Day to run it.`)
                      setRafflePick(false)
                    }}>Prize · {fmtMoney(cardValue(c))}</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setRafflePick(false)}>Cancel</button>
          </div>
        </div>
      )}

      {wantPick && (() => {
        // One picker for both collector wants and forum WTB posts (same matcher/payout).
        const item = wantPick.item
        const isForum = wantPick.kind === 'forum'
        const matches = isForum ? cardsForForumPost(item) : cardsForWant(item)
        return (
        <div className="modalbg" onClick={() => setWantPick(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>{isForum ? 'Fill forum WTB' : 'Fill'}: {item.desc}</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Pick which copy to hand over — {isForum ? 'the poster' : 'they'} pay {Math.round(item.premiumMult*100)}% of its market value, +{item.notoriety} notoriety.</p>
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
          </div>
        </div>
        )
      })()}
    </>
  )
}

// One STORE STOCK line: a SKU (identical copies stacked) with its quantity and the three
// per-item levers — ⭐ Feature (cards; whale bait, capped), 🔒 Keep (not for sale; applies
// to every copy on the line), and 🗝️ Hold (set one copy aside for a regular).
function StockLine({ line, holdEnabled, holdTitle, onHold, flash }) {
  const toggleFeatureCard = useGame(s => s.toggleFeatureCard)
  const toggleLockSealed = useGame(s => s.toggleLockSealed)
  const lockMany = useGame(s => s.lockMany)
  const FEATURED_MAX = useGame(s => s.FEATURED_MAX)
  const featuredTotal = useGame(s => s.collection.filter(c => c._featured).length)
  const { kind, first, items, unit, count } = line
  const keptN = items.filter(x => x.locked).length
  const allKept = keptN === count
  const featuredCopy = kind === 'card' ? items.find(x => x._featured) : null
  const set = kind === 'sealed' ? setById(first.setId) : null
  const label = kind === 'card' ? first.name : `${first.product.type} · ${set?.name || 'sealed'}`
  const sellable = items.find(x => !x.locked)
  const capFull = !featuredCopy && featuredTotal >= FEATURED_MAX

  function keepToggle() {
    if (kind === 'card') {
      lockMany(items.map(x => x.uid), !allKept)
    } else {
      for (const it of items) if (!!it.locked === allKept) toggleLockSealed(it.uid)
    }
    flash(allKept ? `${label} is back up for sale.` : `🔒 Keeping ${count > 1 ? `all ${count}× ` : ''}${label} — off the sales floor.`)
  }
  function featureToggle() {
    if (featuredCopy) { toggleFeatureCard(featuredCopy.uid); return }
    if (capFull) { flash(`Display case is full — unfeature something first (max ${FEATURED_MAX}).`); return }
    const target = sellable || items[0]
    if (toggleFeatureCard(target.uid)) flash(`⭐ ${label} is in the display case — whales take notice.`)
  }

  return (
    <div className={`trade-line stock-line ${allKept ? 'kept' : ''}`}>
      {kind === 'card'
        ? <img className="tl-thumb" src={first.img} alt="" loading="lazy" decoding="async" />
        : <span className="tl-icon">{first.product.icon || '📦'}</span>}
      <div className="tl-info">
        <div className="tl-name">{featuredCopy ? '⭐ ' : ''}{label}</div>
        <div className="tl-sub muted">
          {kind === 'card' ? skuBadge(first) : `${first.product.packs} pk${first.vintage ? ' · 🗝️ vintage' : ''}`}
          {allKept ? ' · 🔒 kept (not for sale)' : keptN ? ` · ${keptN}/${count} kept` : ''}
        </div>
      </div>
      <span className="tl-unit">{fmtMoney(unit)}</span>
      <span className="tl-count" title={`${count} identical cop${count === 1 ? 'y' : 'ies'} in stock`}>×{count}</span>
      {kind === 'card' && (
        <button className={`stock-act ${featuredCopy ? 'on' : ''}`} disabled={!featuredCopy && !sellable}
          title={featuredCopy ? 'Featured in the display case — tap to unfeature'
            : !sellable ? 'Kept items can\'t be featured — put one up for sale first'
            : capFull ? `Display case is full (max ${FEATURED_MAX})`
            : 'Feature in the display case — featured pieces pull deep-pocketed whales'}
          onClick={featureToggle}>{featuredCopy ? '⭐' : '☆'}</button>
      )}
      <button className={`stock-act ${allKept ? 'on' : ''}`}
        title={allKept ? 'Kept — not for sale. Tap to put the line back on the floor.' : 'Keep this line — walk-ins can\'t buy it (you can still rip, stream, show, or repack it)'}
        onClick={keepToggle}>{allKept ? '🔒' : '🔓'}</button>
      <button className="stock-act" disabled={!holdEnabled || !sellable} title={holdTitle}
        onClick={() => sellable && onHold(kind, sellable.uid, label)}>🗝️</button>
    </div>
  )
}
