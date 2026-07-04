import { useState, useRef } from 'react'
import { useGame } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2, GRADING, gradingFee, setById } from '../game/engine'
import { vendorRapport, nextVendorRapport } from '../game/shows'
import CardTile, { rarityColor } from './CardTile'
import Haggle from './Haggle'
import { confirmDialog, useModalEscape } from '../ui/dialog'

export default function VendorBooth({ booth, onClose, flash, onRipSealed, onStockSealed, haggledIds, onHaggled }) {
  if (booth.special === 'kiosk') return <KioskBooth booth={booth} onClose={onClose} flash={flash} />
  return <RegularBooth booth={booth} onClose={onClose} flash={flash} onRipSealed={onRipSealed} onStockSealed={onStockSealed} haggledIds={haggledIds} onHaggled={onHaggled} />
}

// On-site grading kiosk (National+ shows): submit a raw card and it comes back slabbed in
// ~2 days for a premium fee — no mail-in wait. Reuses the normal grading pipeline via the
// `kiosk` tier, so results resolve on the day-advance shortly after the show.
function KioskBooth({ booth, onClose, flash }) {
  const cash = useGame(s => s.cash)
  const collection = useGame(s => s.collection)
  const submitted = useGame(s => s.gradesSubmitted)
  useModalEscape(onClose)
  const raw = [...collection].filter(c => !c.grade).sort((a, b) => cardValue(b) - cardValue(a))
  const days = GRADING.kiosk.days
  const fee = gradingFee('kiosk', submitted)
  function submit(card) {
    if (cash < fee) { flash(`Not enough cash for the ${fmtMoney(fee)} kiosk fee.`); return }
    useGame.getState().submitGrade(card.uid, 'kiosk')
    flash(`Submitted ${card.name} to the on-site grader — slabbed in ~${days} days.`)
  }
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <h2 style={{ marginRight: 'auto' }}>🔬 On-Site Grading Kiosk</h2>
          <span className="pill" style={{ background: '#7cf0ff22', color: '#7cf0ff' }}>~{days}-day turnaround</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>
          Skip the mail-in wait — hand over a raw card and it comes back slabbed in <b>~{days} days</b>, for a
          premium <b>{fmtMoney(fee)}</b> per card. Results land on the next day or two after the show.
        </p>
        {raw.length === 0 ? <p className="muted">You have no raw cards on you to grade.</p> : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
            {raw.slice(0, 30).map(card => {
              const worthIt = cardValue(card) >= fee
              return (
                <div key={card.uid} className="vendoritem">
                  <CardTile card={card} interactive={false} />
                  <div className="muted" style={{ fontSize: 11 }}>mkt {fmtMoney(cardValue(card))}</div>
                  <button className="btn" disabled={cash < fee} onClick={() => submit(card)}
                    title={!worthIt ? 'Grading costs more than this card is worth' : undefined}>
                    Grade {fmtMoney(fee)}{!worthIt ? ' ⚠️' : ''}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function RegularBooth({ booth, onClose, flash, onRipSealed, onStockSealed, haggledIds, onHaggled }) {
  const haggled = haggledIds || new Set()
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const buyFromVendor = useGame(s => s.buyFromVendor)
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const canTrade = collection.length > 0 || (sealedInventory?.length || 0) > 0
  // Recurring-vendor rapport: a familiar dealer cuts you a standing discount on their asks.
  const vendorSpend = useGame(s => booth.vendorId ? (s.vendorSpend?.[booth.vendorId] || 0) : 0)
  const rap = booth.vendorId ? vendorRapport(vendorSpend) : null
  const disc = rap ? rap.disc : 0
  const eff = (ask) => round2((ask || 0) * (1 - disc)) // rapport-discounted asking price
  const nextRap = booth.vendorId ? nextVendorRapport(vendorSpend) : null
  const [stock, setStock] = useState(booth.stock)
  // Sealed is local state so a stocked item disappears from the table after you take it.
  const [sealed, setSealed] = useState(booth.products || [])
  const [tab, setTab] = useState('buy')
  const [haggle, setHaggle] = useState(null) // { side, card, market, start }
  // After agreeing a buy, ask whether to list it at the show or take it home.
  const [pendingBuy, setPendingBuy] = useState(null) // { card, price }
  // Re-entry guard: a fast double-click on List/Keep could otherwise run commitBuy twice
  // on the same pendingBuy (setPendingBuy(null) is async, so the second click still sees a
  // non-null closure) — double-charging and inserting a duplicate-uid card. Stays true once
  // a buy commits; buyAt() resets it when a NEW purchase begins.
  const committingRef = useRef(false)
  // After choosing a sealed product: rip it on the floor now or stock it to hold.
  const [pendingSealed, setPendingSealed] = useState(null) // the sealed entry
  const [mysteryResult, setMysteryResult] = useState(null) // card pulled from a mystery pack
  const [tradeFor, setTradeFor] = useState(null)           // booth card you're offering a trade on
  // Escape closes the top-most layer: a pending prompt if open, else the booth.
  // (Haggle owns its own escape.)
  useModalEscape(() => {
    if (mysteryResult) setMysteryResult(null)
    else if (tradeFor) setTradeFor(null)
    else if (pendingSealed) setPendingSealed(null)
    else if (pendingBuy) setPendingBuy(null)
    else if (!haggle) onClose()
  })

  // Buy & open a mystery pack right here — one random single, revealed on the spot.
  function openMystery(entry) {
    const card = useGame.getState().buyMysteryPack(entry.price, entry.band)
    if (!card) { flash(`Not enough cash for the ${entry.name}.`); return }
    setSealed(s => { const next = s.filter(e => e !== entry); if (!next.length) setTab('buy'); return next })
    setMysteryResult({ card, packName: entry.name })
  }
  // Complete a many-to-many trade: your bundle of cards + sealed (± cash) for the booth's
  // bundle of cards + sealed. Removes every taken booth item from the table afterward.
  function doTrade(payload) {
    const res = useGame.getState().tradeWithVendor({
      giveCardUids: payload.giveCardUids, giveSealedUids: payload.giveSealedUids,
      getCards: payload.getCards, getSealed: payload.getSealed,
      cashDelta: payload.cashDelta, vendorId: booth.vendorId,
    })
    if (res.error) { flash(res.error); return }
    setStock(s => s.filter(c => !payload.takenCardUids.includes(c.uid)))
    setSealed(s => s.filter((_, i) => !payload.takenSealedIdx.includes(i)))
    setTradeFor(null)
    if (payload.takenSealedIdx.length && payload.takenSealedIdx.length >= sealed.length) setTab('buy')
    const giveN = payload.giveCardUids.length + payload.giveSealedUids.length
    const getN = payload.getCards.length + payload.getSealed.length
    flash(`Traded ${giveN} item${giveN !== 1 ? 's' : ''} for ${getN}!`)
  }

  const seeDeals = upgrades.network

  // A buy is agreed (at ask or via haggle) → ask where it goes before committing.
  function buyAt(card, price) {
    committingRef.current = false // arm a fresh commit for this new purchase
    setPendingBuy({ card, price })
  }
  // Commit the agreed buy. `toShowInventory` lists it for sale at your booth;
  // otherwise it goes home to your collection.
  function commitBuy(toShowInventory) {
    if (committingRef.current || !pendingBuy) return // ignore a double-click re-entry
    committingRef.current = true
    const { card, price } = pendingBuy
    setPendingBuy(null)
    if (buyFromVendor(card, price, { toShowInventory, vendorId: booth.vendorId })) {
      setStock(s => s.filter(c => c.uid !== card.uid))
      const deal = price < cardValue(card) * 0.85 ? ' — great deal!' : ''
      flash(`Bought ${card.name} for ${fmtMoney(price)}${deal}${toShowInventory ? ' · listed at your booth' : ' · added to your collection'}`)
    }
  }
  function sellAt(card, price) {
    useGame.getState().resolveEncounter({ type: 'sellOwned', uid: card.uid, price, notoriety: 0, msg: '' })
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, price) // dealing builds rapport
    flash(`Sold ${card.name} to ${booth.name} for ${fmtMoney(price)}`)
  }
  // Picking a sealed product opens a choice: rip it on the floor now, or stock it to hold.
  // Buy a sealed product and crack it on the floor right now (same rip flow as the Vault).
  function ripSealedNow(entry) {
    const ask = eff(entry._ask)
    setPendingSealed(null)
    onClose()
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
    onRipSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
  }
  // Buy a sealed product and stock it in your held inventory (rip/list/flip later). Keeps
  // the booth open and removes the item from the table; the last one closes the Sealed tab.
  function stockSealedNow(entry) {
    const ask = eff(entry._ask)
    setPendingSealed(null)
    if (sealed.length <= 1) setTab('buy')
    setSealed(s => s.filter(e => e !== entry))
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
    onStockSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
  }

  function renderBuy(card, featured) {
    const mkt = cardValue(card) // grade-aware true value
    const ask = eff(card._ask)  // rapport discount applied
    const deal = ask < mkt * 0.85
    return (
      <div key={card.uid} className={`vendoritem ${featured ? 'featured' : ''}`}>
        <CardTile card={card} interactive={false} />
        <div className="askrow">
          {disc > 0 && <s className="retail" style={{ marginRight: 4 }}>{fmtMoney(card._ask)}</s>}
          <span className="ask">{fmtMoney(ask)}</span>
          {seeDeals && deal && <span className="dealtag">DEAL</span>}
          {seeDeals && !deal && ask > mkt*1.2 && <span className="overtag">OVER</span>}
        </div>
        <div className="muted" style={{fontSize:11}}>mkt {fmtMoney(mkt)}</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" disabled={cash < ask} onClick={() => buyAt(card, ask)}>Buy</button>
          <button className="btn alt" style={{ flex:'none', maxWidth: 70 }} disabled={haggled.has(card.uid)}
            title={haggled.has(card.uid) ? 'Already haggled this one — buy it or move on' : undefined}
            onClick={() => setHaggle({ side:'buy', card, market: mkt, start: ask })}>
            {haggled.has(card.uid) ? 'Haggled' : 'Haggle'}
          </button>
          <button className="btn alt" style={{ flex:'none', maxWidth: 70 }} disabled={!canTrade}
            title={canTrade ? 'Build a trade — offer your cards/sealed (± cash) for this and more' : 'You have nothing to trade'}
            onClick={() => setTradeFor({ card, ask })}>Trade</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="row" style={{ alignItems:'baseline' }}>
          <h2 style={{ marginRight:'auto' }}>{booth.recurring ? '🤝 ' : ''}{booth.name}</h2>
          {rap && <span className="pill" title="Your standing with this recurring dealer"
            style={{ background: rap.color + '22', color: rap.color }}>{rap.name}{disc > 0 ? ` · ${Math.round(disc*100)}% off` : ''}</span>}
          <span className="pill">{booth.archLabel}</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>
          This vendor is {booth.vibe}. They pay <b>{Math.round(booth.buyMult*100)}%</b> of market for cards. Try to <b>haggle</b> — but push too hard and they'll walk.
          {booth.recurring && <> <span style={{ color: rap?.color }}>A regular on the circuit — keep dealing with them to grow your discount{nextRap ? ` (${fmtMoney(nextRap.min - vendorSpend)} more of business → ${nextRap.name}, ${Math.round(nextRap.disc*100)}% off)` : ' — you\'re fully Trusted here'}.</span></>}
        </p>

        <div className="tabs" style={{ margin: '10px 0' }}>
          <button className={`tab ${tab==='buy'?'active':''}`} onClick={()=>setTab('buy')}>Their stock ({stock.length})</button>
          {sealed.length > 0 && <button className={`tab ${tab==='sealed'?'active':''}`} onClick={()=>setTab('sealed')}>📦 Sealed ({sealed.length})</button>}
          <button className={`tab ${tab==='sell'?'active':''}`} onClick={()=>setTab('sell')}>Sell to them</button>
        </div>

        {tab === 'sealed' ? (
          <>
            <div className="showcase-head">📦 Sealed & mystery <span className="muted">— sealed rips on the floor or stocks to hold; mystery packs open on the spot (vendor markup applies)</span></div>
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))' }}>
              {sealed.map((entry, idx) => entry.mystery ? (
                <div key={idx} className="vendoritem featured sealed-mystery">
                  <div style={{ fontSize: 34, textAlign: 'center' }}>{entry.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 13, textAlign:'center' }}>{entry.name}</div>
                  <div className="muted" style={{ fontSize: 11.5, textAlign:'center' }}>{entry.blurb}</div>
                  <div className="askrow" style={{ justifyContent:'center' }}>
                    <span className="ask">{fmtMoney(entry.price)}</span>
                  </div>
                  <button className="btn gold" disabled={cash < entry.price} onClick={() => openMystery(entry)}>
                    {cash < entry.price ? `Need ${fmtMoney(entry.price)}` : '❓ Buy & open'}
                  </button>
                </div>
              ) : (
                <div key={idx} className={`vendoritem featured ${entry._origin === 'vintage' ? 'sealed-vintage' : ''} ${entry._origin === 'aftermarket' ? 'sealed-aftermarket' : ''}`}>
                  {entry.set.logo && <img src={entry.set.logo} alt={entry.set.name} style={{ height: 34, objectFit:'contain', alignSelf:'center' }} />}
                  <div style={{ fontWeight: 800, fontSize: 13, textAlign:'center' }}>
                    {entry._origin === 'vintage' ? '🗝️ ' : entry.product.icon + ' '}{entry.product.type}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, textAlign:'center' }}>
                    {entry.set.name} · {entry.product.packs} pk{entry.product.bonus ? ' +🎁' : ''}
                    {entry._origin === 'aftermarket' ? ' · 🕰️ older sealed' : ''}
                  </div>
                  <div className="askrow" style={{ justifyContent:'center' }}>
                    {disc > 0 && <s className="retail" style={{ marginRight: 4 }}>{fmtMoney(entry._ask)}</s>}
                    <span className="ask">{fmtMoney(eff(entry._ask))}</span>
                  </div>
                  <button className="btn gold" disabled={cash < eff(entry._ask)} onClick={() => setPendingSealed(entry)}>
                    {cash < eff(entry._ask) ? `Need ${fmtMoney(eff(entry._ask))}` : 'Buy →'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : tab === 'buy' ? (
          stock.length === 0 ? <p className="muted">Sold out — you cleaned them out!</p> :
          <>
            {stock.some(c => c._highlight) && (
              <>
                <div className="showcase-head">⭐ Showcase case <span className="muted">— this vendor's featured pieces</span></div>
                <div className="grid showcase-grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))' }}>
                  {stock.filter(c => c._highlight).map(card => renderBuy(card, true))}
                </div>
                <div className="showcase-head" style={{ marginTop: 18 }}>🗃️ Bulk bin <span className="muted">— {stock.filter(c=>!c._highlight).length} cards</span></div>
              </>
            )}
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(132px,1fr))' }}>
              {stock.filter(c => !c._highlight).map(card => renderBuy(card, false))}
            </div>
          </>
        ) : (
          collection.length === 0 ? <p className="muted">You have nothing to sell.</p> :
          <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))' }}>
            {[...collection].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 24).map(card => {
              const mkt = cardValue(card)
              const offer = Math.round(mkt * booth.buyMult * 100) / 100
              return (
                <div key={card.uid} className="vendoritem">
                  <CardTile card={card} interactive={false} />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn alt" onClick={() => sellAt(card, offer)}>Sell {fmtMoney(offer)}</button>
                    <button className="btn" style={{ flex:'none', maxWidth: 78 }} disabled={haggled.has(card.uid)}
                      title={haggled.has(card.uid) ? 'Already haggled this one — sell it or move on' : undefined}
                      onClick={() => setHaggle({ side:'sell', card, market: mkt, start: offer })}>
                      {haggled.has(card.uid) ? 'Haggled' : 'Haggle'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={onClose}>Done</button>
      </div>

      {haggle && (
        <Haggle
          side={haggle.side} card={haggle.card} market={haggle.market} start={haggle.start}
          archKey={booth.archetype} vendorName={booth.name}
          onClose={(engaged) => { if (engaged) onHaggled?.(haggle.card.uid); setHaggle(null) }}
          onDeal={(price) => {
            if (haggle.side === 'buy') buyAt(haggle.card, price)
            else sellAt(haggle.card, price)
            onHaggled?.(haggle.card.uid)
            setHaggle(null)
          }}
        />
      )}

      {pendingSealed && (
        <div className="modalbg" style={{ zIndex: 20 }} onClick={() => setPendingSealed(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>
              {pendingSealed._origin === 'vintage' ? '🗝️ ' : (pendingSealed.product.icon || '📦') + ' '}{pendingSealed.product.type}
            </h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {pendingSealed.set.name} · {fmtMoney(eff(pendingSealed._ask))} <span style={{ opacity: 0.8 }}>({disc > 0 ? 'after your rapport discount' : 'vendor markup'})</span>.
              {pendingSealed._origin === 'vintage' ? ' A sealed vintage gamble.' : ''} Rip it now, or stock it to rip/list/flip later?
            </p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" disabled={cash < eff(pendingSealed._ask)} onClick={() => ripSealedNow(pendingSealed)}>
                📦 Rip it here on the floor →
              </button>
              <button className="btn alt" disabled={cash < eff(pendingSealed._ask)} onClick={() => stockSealedNow(pendingSealed)}>
                🗂️ Stock it in your inventory
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Held sealed rides the market — vintage climbs the longer you hold it.
            </p>
          </div>
        </div>
      )}

      {pendingBuy && (
        <div className="modalbg" style={{ zIndex: 20 }} onClick={() => setPendingBuy(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Bought {pendingBuy.card.name}</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              for {fmtMoney(pendingBuy.price)} · market {fmtMoney(cardValue(pendingBuy.card))}.
              What do you want to do with it?
            </p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" onClick={() => commitBuy(true)}>
                🪧 List it at your booth — sell it here
              </button>
              <button className="btn alt" onClick={() => commitBuy(false)}>
                🗂️ Keep it in your collection
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Listed cards are offered to shoppers at your table; unsold ones come home when you leave.
            </p>
          </div>
        </div>
      )}

      {mysteryResult && (
        <MysteryReveal result={mysteryResult} onClose={() => setMysteryResult(null)} />
      )}

      {tradeFor && (
        <TradePanel booth={booth} seedCard={tradeFor.card} boothCards={stock} boothSealed={sealed}
          collection={collection} sealedInventory={sealedInventory} eff={eff}
          onTrade={doTrade} onClose={() => setTradeFor(null)} />
      )}
    </div>
  )
}

// The mystery-pack reveal: flip open the grab-bag to see the one random single you pulled.
function MysteryReveal({ result, onClose }) {
  const { card, packName } = result
  const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
  const val = cardValue(card)
  const hit = card._isHit || !!card.foil || val >= 15
  useModalEscape(onClose)
  return (
    <div className="modalbg" style={{ zIndex: 25 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, textAlign: 'center' }}>
        <h3 style={{ marginTop: 0 }}>{hit ? '🎉 ' : '❓ '}{packName}</h3>
        <div className="vendoritem featured" style={{ '--rarity': edge, maxWidth: 200, margin: '0 auto' }}>
          <img src={card.img} alt={card.name} style={{ width: '100%', borderRadius: 8 }} />
          <div style={{ fontWeight: 800, fontSize: 13 }}>{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
          <div className="muted" style={{ fontSize: 11, color: edge }}>{card.foil ? card.foil.label : card.rarity}</div>
          <div style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtMoney(val)}</div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {hit ? "That's a hit! It's in your collection." : 'Added to your collection.'}
        </p>
        <button className="btn gold" style={{ maxWidth: 160, margin: '4px auto 0' }} onClick={onClose}>Nice →</button>
      </div>
    </div>
  )
}

// Many-to-many trade builder. Assemble a bundle of YOUR cards + held sealed to offer for a
// bundle of the booth's cards + sealed. Your items are valued at the vendor's BUY rate (what
// they'd pay); their items at their (rapport-discounted) ask. Cash closes the gap either way.
function TradePanel({ booth, seedCard, boothCards, boothSealed, collection, sealedInventory, eff, onTrade, onClose }) {
  const cash = useGame(s => s.cash)
  useModalEscape(onClose)
  const buyMult = booth.buyMult || 0.6
  const [giveCards, setGiveCards] = useState(() => new Set())
  const [giveSealed, setGiveSealed] = useState(() => new Set())
  const [getCards, setGetCards] = useState(() => new Set(seedCard ? [seedCard.uid] : []))
  const [getSealedIdx, setGetSealedIdx] = useState(() => new Set())

  const toggle = (setter) => (key) => setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const tCardGive = toggle(setGiveCards), tSealGive = toggle(setGiveSealed)
  const tCardGet = toggle(setGetCards), tSealGet = toggle(setGetSealedIdx)

  // Values: your side at their buy rate; their side at the (discounted) ask.
  const yourVal = round2(
    [...giveCards].reduce((a, uid) => { const c = collection.find(x => x.uid === uid); return a + (c ? cardValue(c) * buyMult : 0) }, 0)
    + [...giveSealed].reduce((a, uid) => { const it = (sealedInventory || []).find(x => x.uid === uid); return a + (it ? sealedValue(it) * buyMult : 0) }, 0))
  const theirVal = round2(
    [...getCards].reduce((a, uid) => { const c = boothCards.find(x => x.uid === uid); return a + (c ? eff(c._ask) : 0) }, 0)
    + [...getSealedIdx].reduce((a, i) => { const e = boothSealed[i]; return a + (e ? eff(e._ask) : 0) }, 0))
  const cashDelta = round2(theirVal - yourVal) // >0 you add cash; <0 they add cash
  const nGive = giveCards.size + giveSealed.size
  const nGet = getCards.size + getSealedIdx.size
  const canDo = nGet > 0 && (nGive > 0 || cashDelta > 0) && (cashDelta <= 0 || cash >= cashDelta)

  const mineCards = [...collection].sort((a, b) => cardValue(b) - cardValue(a))
  const mineSealed = [...(sealedInventory || [])].sort((a, b) => sealedValue(b) - sealedValue(a))
  // Only real (non-mystery) sealed on the booth is tradeable.
  const boothSeal = boothSealed.map((e, i) => ({ e, i })).filter(x => !x.e.mystery)

  function confirm() {
    onTrade({
      giveCardUids: [...giveCards],
      giveSealedUids: [...giveSealed],
      getCards: [...getCards].map(uid => boothCards.find(c => c.uid === uid)).filter(Boolean),
      getSealed: [...getSealedIdx].map(i => { const e = boothSealed[i]; return e ? { set: e.set, product: e.product, ask: eff(e._ask) } : null }).filter(Boolean),
      cashDelta,
      takenCardUids: [...getCards],
      takenSealedIdx: [...getSealedIdx],
    })
  }

  const selStyle = (on) => ({ cursor: 'pointer', outline: on ? '2px solid var(--accent)' : 'none' })
  return (
    <div className="modalbg" style={{ zIndex: 25 }} onClick={onClose}>
      <div className="modal trade-builder" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>🔁 Build a trade with {booth.name}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Pick any mix of your cards + sealed to offer, and any of their table to take. They value your
          side at their buy rate ({Math.round(buyMult * 100)}% of market); cash covers the gap.
        </p>

        <div className="trade-summary">
          <div className="row" style={{ justifyContent: 'center', gap: 18, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11 }}>You give ({nGive})</div>
              <b>{fmtMoney(yourVal)}</b>
              <div className="muted" style={{ fontSize: 11 }}>trade-in value</div>
            </div>
            <div style={{ fontSize: 22 }}>⇄</div>
            <div style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11 }}>You get ({nGet})</div>
              <b>{fmtMoney(theirVal)}</b>
              <div className="muted" style={{ fontSize: 11 }}>their ask</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 800 }}>
            {cashDelta > 0 ? <>You also pay <span style={{ color: 'var(--red)' }}>{fmtMoney(cashDelta)}</span></>
              : cashDelta < 0 ? <>They add <span style={{ color: 'var(--green)' }}>{fmtMoney(-cashDelta)}</span> to you</>
              : nGet > 0 ? 'Straight swap — no cash' : 'Pick something to take'}
          </div>
        </div>

        <div className="trade-builder-cols">
          <div className="trade-builder-col">
            <div className="rip-side-head">📤 Your side</div>
            <div className="trade-pick-grid">
              {mineCards.length === 0 && mineSealed.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Nothing to offer — trade cash only.</div>}
              {mineSealed.map(it => (
                <div key={it.uid} className={`vendoritem ${giveSealed.has(it.uid) ? 'featured' : ''}`} style={selStyle(giveSealed.has(it.uid))} onClick={() => tSealGive(it.uid)}>
                  <SealedThumb item={it} />
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{fmtMoney(sealedValue(it))}</div>
                </div>
              ))}
              {mineCards.slice(0, 40).map(c => (
                <div key={c.uid} className={`vendoritem ${giveCards.has(c.uid) ? 'featured' : ''}`} style={selStyle(giveCards.has(c.uid))} onClick={() => tCardGive(c.uid)}>
                  <CardTile card={c} interactive={false} />
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{fmtMoney(cardValue(c))}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="trade-builder-col">
            <div className="rip-side-head">📥 Their table</div>
            <div className="trade-pick-grid">
              {boothSeal.map(({ e, i }) => (
                <div key={`s${i}`} className={`vendoritem ${getSealedIdx.has(i) ? 'featured' : ''}`} style={selStyle(getSealedIdx.has(i))} onClick={() => tSealGet(i)}>
                  <SealedThumb item={{ setId: e.set?.id, product: e.product }} />
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{fmtMoney(eff(e._ask))}</div>
                </div>
              ))}
              {boothCards.map(c => (
                <div key={c.uid} className={`vendoritem ${getCards.has(c.uid) ? 'featured' : ''}`} style={selStyle(getCards.has(c.uid))} onClick={() => tCardGet(c.uid)}>
                  <CardTile card={c} interactive={false} />
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{fmtMoney(eff(c._ask))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn gold" disabled={!canDo} onClick={confirm}>
            {nGet === 0 ? 'Pick something to take'
              : cashDelta > 0 && cash < cashDelta ? `Need ${fmtMoney(cashDelta)}`
              : 'Make the trade'}
          </button>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Compact sealed-product thumbnail (set logo + type) for the trade builder.
function SealedThumb({ item }) {
  const set = setById(item.setId)
  return (
    <div className="trade-sealed-thumb">
      {set?.logo ? <img src={set.logo} alt={set?.name || ''} decoding="async" /> : <span className="tst-icon">{item.product?.icon || '📦'}</span>}
      <div className="tst-label">{item.product?.icon || '📦'} {item.product?.type}</div>
    </div>
  )
}
