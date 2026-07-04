import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGame, acceptedMethods, PAYMENT_METHODS, INBOX_CAP, INBOUND_NOTORIETY_GATE, BARGAIN_ASK_MULT, HOLD_DAYS_STORE, GIVEAWAY_BUZZ_DAYS } from '../game/store'
import { fmtMoney, cardValue, sealedValue, setById } from '../game/engine'
import { encounterStillValid } from '../game/shows'
import Encounter from './Encounter'
import SealedDealModal from './SealedDealModal'
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
  const forumPosts = useGame(s => s.forumPosts)
  const cardsForForumPost = useGame(s => s.cardsForForumPost)
  const fulfillForumPost = useGame(s => s.fulfillForumPost)
  const dailyGoals = useGame(s => s.dailyGoals)
  const ensureDailyGoals = useGame(s => s.ensureDailyGoals)
  const goalsResetInDays = useGame(s => s.goalsResetInDays)
  const collection = useGame(s => s.collection)
  const listings = useGame(s => s.listings)
  const shopDisplay = useGame(s => s.shopDisplay)
  const pullFromShop = useGame(s => s.pullFromShop)
  const pullAllFromShop = useGame(s => s.pullAllFromShop)
  const setListingEverywhere = useGame(s => s.setListingEverywhere)
  const shopSealed = useGame(s => s.shopSealed)
  const sealedInventory = useGame(s => s.sealedInventory)
  const pullShopSealed = useGame(s => s.pullShopSealed)
  const pullAllShopSealed = useGame(s => s.pullAllShopSealed)
  const stockShopSealed = useGame(s => s.stockShopSealed)
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
  const [toast, setToast] = useState(null)
  useModalEscape(() => { // close the top-most picker on Esc
    if (givePick) setGivePick(false)
    else if (holdPick) setHoldPick(null)
    else if (wantPick) setWantPick(null)
  })
  // Sell splits into sub-tabs: day-to-day Orders, your Shop floor (case, holds,
  // consignment intake, giveaways), the public Forum board, and On the market.
  const [sellTab, setSellTab] = useState('orders') // 'orders' | 'store' | 'forum' | 'market'
  const listingOfferCount = listings.filter(l => (l.offers?.length || 0) > 0).length
  const marketCount = listings.length + consignments.length
  const forumCount = (forumPosts || []).length

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
        {hasStore && (
          <button className={`subtab ${sellTab === 'store' ? 'active' : ''}`} onClick={() => setSellTab('store')}>
            🏬 Shop floor{(storeConsignRequests || []).length ? ` (${storeConsignRequests.length})` : ''}
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
          : <div className="empty">Nothing on the market. List or consign cards from your collection (Cards → Select) to sell them here. 🌐</div>
      ) : sellTab === 'store' ? (
        // ---- 🏬 Shop floor: the physical store, in sections — what's in the case
        // (singles + sealed), holds behind the counter, the consignment case you run
        // for locals, and the in-store giveaway lever.
        (() => {
          const omni = listings.map((l, idx) => ({ l, idx })).filter(({ l }) => l.everywhere && !l.expired && !l.card?._sealed)
          const heldSingles = shopDisplay.filter(c => c._heldFor)
          const heldSealed = shopSealed.filter(x => x._heldFor)
          const activeRegulars = (regulars || []).filter(r => !r.flags?.burned)
          const holdBtnTitle = activeRegulars.length ? 'Set this aside for a regular — they come pick it up at a premium' : 'No regulars yet — treat walk-ins and online buyers well and they\'ll become regulars you can hold items for'
          return (
            <>
              <div className="banner" style={{ marginTop: 16 }}>
                🏬 <b>Your shop floor.</b> Walk-ins buy what's in the case (+12% in person, no fees). Hold pieces behind the
                counter for regulars, carry locals' cards for a commission, and run a 🎁 giveaway when the room needs a jolt.
                {giveawayDaysLeft > 0 && <> <b style={{ color: 'var(--gold)' }}> 🎉 Giveaway buzz live — foot traffic boosted for {giveawayDaysLeft} more day{giveawayDaysLeft > 1 ? 's' : ''}.</b></>}
              </div>

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

              {/* Stocked singles */}
              <div className="wants">
                <div className="wants-head">🃏 Stocked singles <span className="muted">— {shopDisplay.length + omni.length} in the case{omni.length ? ` · ${omni.length} also online` : ''}{heldSingles.length ? ` · ${heldSingles.length} held` : ''}</span>
                  {shopDisplay.length > 0 && (
                    <button className="btn alt" style={{ flex: 'none', maxWidth: 140, marginLeft: 'auto', padding: '4px 10px' }}
                      onClick={() => { const n = pullAllFromShop(); flash(`Cleared ${n} card${n > 1 ? 's' : ''} back into your collection.`) }}>
                      Clear singles
                    </button>
                  )}
                </div>
                {shopDisplay.length === 0 && omni.length === 0 ? (
                  <div className="empty" style={{ marginTop: 4 }}>Case is empty. Stock it from <b>Cards → Select → 🏬 Stock shop</b>, or list cards <b>everywhere</b>. 🛒</div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', marginTop: 4 }}>
                    {[...shopDisplay].sort((a, b) => cardValue(b) - cardValue(a)).map(c => (
                      <div key={c.uid} className="vendoritem">
                        <CardTile card={c} interactive={false} />
                        {c._heldFor ? (
                          <>
                            <span className="pill" style={{ alignSelf: 'center', fontSize: 10.5, background: '#ffcb0522', color: 'var(--gold)' }}
                              title={`Behind the counter for ${c._heldFor.name} — they'll come by within ${c._heldFor.daysLeft}d`}>
                              🔒 held for {c._heldFor.emoji} {c._heldFor.name} · {c._heldFor.daysLeft}d
                            </span>
                            <button className="btn alt" style={{ padding: '4px 10px' }} onClick={() => { releaseHold('card', c.uid); flash(`${c.name} is back on the floor.`) }}>↩ Release hold</button>
                          </>
                        ) : (
                          <div className="row" style={{ gap: 5 }}>
                            <button className="btn alt" style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => { pullFromShop(c.uid); flash(`Took ${c.name} off the shelf.`) }}>
                              ↩ {fmtMoney(cardValue(c))}
                            </button>
                            <button className="btn" style={{ flex: 'none', padding: '4px 8px', fontSize: 12 }} disabled={!activeRegulars.length}
                              title={holdBtnTitle}
                              onClick={() => setHoldPick({ kind: 'card', uid: c.uid, label: c.name })}>🔒 Hold</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {omni.sort((a, b) => cardValue(b.l.card) - cardValue(a.l.card)).map(({ l, idx }) => (
                      <div key={l.card.uid} className="vendoritem" title="Listed everywhere — also up on your site. Whichever channel sells it first takes it.">
                        <CardTile card={l.card} interactive={false} />
                        <span className="pill" style={{ alignSelf: 'center', fontSize: 10.5, background: '#5aa0ff22', color: '#5aa0ff' }}>🌐 also online · {fmtMoney(l.ask)}</span>
                        <button className="btn alt" style={{ padding: '4px 10px' }}
                          onClick={() => { setListingEverywhere(idx, false); flash(`${l.card.name} is online-only now.`) }}>
                          ↩ Online only
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stocked sealed */}
              <div className="wants">
                <div className="wants-head">📦 Stocked sealed <span className="muted">— {shopSealed.length} on the shelf{heldSealed.length ? ` · ${heldSealed.length} held` : ''}</span>
                  {shopSealed.length > 0 && (
                    <button className="btn alt" style={{ flex: 'none', maxWidth: 140, marginLeft: 'auto', padding: '4px 10px' }}
                      onClick={() => { const n = pullAllShopSealed(); flash(`Pulled ${n} sealed back into inventory.`) }}>
                      Pull all sealed
                    </button>
                  )}
                </div>
                {(sealedInventory?.length || 0) > 0 && (
                  <div className="toolbar" style={{ marginTop: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>📦 {sealedInventory.length} sealed in the back —</span>
                    <button className="btn alt" style={{ flex: 'none', padding: '4px 10px' }}
                      onClick={() => { const n = stockShopSealed((sealedInventory || []).map(it => it.uid)); flash(`Stocked ${n} sealed on the shelf.`) }}>
                      🏬 Stock all sealed
                    </button>
                  </div>
                )}
                {shopSealed.length === 0 ? (
                  <div className="empty" style={{ marginTop: 4 }}>No sealed out. Stock it from <b>📦 Inventory → 🏬 Stock</b> (or the button above). </div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', marginTop: 4 }}>
                    {[...shopSealed].sort((a, b) => sealedValue(b) - sealedValue(a)).map(it => {
                      const set = setById(it.setId)
                      return (
                        <div key={it.uid} className="vendoritem">
                          <div className="shelf-sealed">
                            {set?.logo ? <img src={set.logo} alt={set?.name || ''} decoding="async" /> : <span className="shelf-sealed-icon">{it.product.icon || '📦'}</span>}
                            <div className="shelf-sealed-label">{it.product.icon || '📦'} {it.product.type}</div>
                          </div>
                          {it._heldFor ? (
                            <>
                              <span className="pill" style={{ alignSelf: 'center', fontSize: 10.5, background: '#ffcb0522', color: 'var(--gold)' }}>
                                🔒 held for {it._heldFor.emoji} {it._heldFor.name} · {it._heldFor.daysLeft}d
                              </span>
                              <button className="btn alt" style={{ padding: '4px 10px' }} onClick={() => { releaseHold('sealed', it.uid); flash('Back on the shelf.') }}>↩ Release hold</button>
                            </>
                          ) : (
                            <div className="row" style={{ gap: 5 }}>
                              <button className="btn alt" style={{ padding: '4px 8px', fontSize: 12 }}
                                onClick={() => { pullShopSealed(it.uid); flash(`Took a ${it.product.type} off the shelf.`) }}>
                                ↩ {fmtMoney(sealedValue(it))}
                              </button>
                              <button className="btn" style={{ flex: 'none', padding: '4px 8px', fontSize: 12 }} disabled={!activeRegulars.length}
                                title={holdBtnTitle}
                                onClick={() => setHoldPick({ kind: 'sealed', uid: it.uid, label: it.product.type })}>🔒 Hold</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

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
          : (listings.length === 0 && (shopDisplay || []).length === 0)
          // Known vendor, but nothing out for sale → no orders will come. Buyers only
          // message you about cards you've actually listed or put on the shelf.
          ? <>🤫 Your shop's quiet — <b>nothing's up for sale</b>. Buyers only reach out about cards you've <b>listed online</b>{hasStore ? <> or <b>put on the shelf</b></> : ''}. Put something out and orders start arriving (notoriety <b>{Math.round(notoriety)}</b>).</>
          : hasStore
          ? <>🏬 You run a brick-and-mortar shop <b>and</b> sell online. Each day brings orders & walk-ins on what you've put out, scaled by your <b>{Math.round(notoriety)}</b> notoriety.</>
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

      {/* The shop floor (case, holds, consignments, giveaways) lives in its own
          🏬 sub-tab now — Orders stays focused on people to answer. */}
      {hasStore && (shopDisplay.length + shopSealed.length + (storeConsignRequests || []).length) > 0 && (
        <div className="toolbar" style={{ marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            🏬 The case, holds, consignments & giveaways moved to the <b>Shop floor</b> tab
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
