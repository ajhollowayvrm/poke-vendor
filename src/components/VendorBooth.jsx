import { useState, useRef } from 'react'
import { useGame } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2, GRADING, gradingFee, setById } from '../game/engine'
import { vendorRapport, nextVendorRapport } from '../game/shows'
import CardTile, { rarityColor } from './CardTile'
import CardModal from './CardModal'
import Haggle from './Haggle'
import { confirmDialog, useModalEscape } from '../ui/dialog'
import { cardSku, skuBadge, groupLines, groupCardLines, sealedSku } from './sku'

export default function VendorBooth({ booth, onClose, flash, onRipSealed, onStockSealed, haggledIds, onHaggled, takenIds, onTaken, tillLeft, onTillSpend }) {
  if (booth.special === 'kiosk') return <KioskBooth booth={booth} onClose={onClose} flash={flash} />
  return <RegularBooth booth={booth} onClose={onClose} flash={flash} onRipSealed={onRipSealed} onStockSealed={onStockSealed} haggledIds={haggledIds} onHaggled={onHaggled} takenIds={takenIds} onTaken={onTaken} tillLeft={tillLeft} onTillSpend={onTillSpend} />
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

function RegularBooth({ booth, onClose, flash, onRipSealed, onStockSealed, haggledIds, onHaggled, takenIds, onTaken, tillLeft = Infinity, onTillSpend }) {
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
  // Local working copies, seeded MINUS everything already taken this show (takenIds
  // lives in ShowFloor): booth stock used to reset on every close/reopen, re-serving
  // bought items at the same uid — infinite rebuy plus uid-duplication corruption.
  const [stock, setStock] = useState(() => (booth.stock || []).filter(c => !takenIds?.has(c.uid)))
  const [sealed, setSealed] = useState(() => (booth.products || []).filter(e => !takenIds?.has(e._tk)))
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
  // Tap any card to open its page: { card, ask } for THEIR stock (read-only inspect —
  // PSA-if-graded values + cut read, the gem-hunter's tools), { card, owned:true } for yours.
  const [inspect, setInspect] = useState(null)
  // Escape closes the top-most layer: a pending prompt if open, else the booth.
  // (Haggle owns its own escape; the card page also closes itself.)
  useModalEscape(() => {
    if (mysteryResult) setMysteryResult(null)
    else if (inspect) setInspect(null)
    else if (tradeFor) setTradeFor(null)
    else if (pendingSealed) setPendingSealed(null)
    else if (pendingBuy) setPendingBuy(null)
    else if (!haggle) onClose()
  })

  // Buy & open a mystery pack right here — one random pull (a single, or sometimes a
  // sealed product), revealed on the spot.
  function openMystery(entry) {
    const res = useGame.getState().buyMysteryPack(entry.price, entry.band)
    if (!res) { flash(`Not enough cash for the ${entry.name}.`); return }
    setSealed(s => { const next = s.filter(e => e !== entry); if (!next.length) setTab('buy'); return next })
    if (entry._tk) onTaken?.([entry._tk])
    setMysteryResult({ ...res, packName: entry.name })
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
    const sealedKeys = payload.takenSealedIdx.map(i => sealed[i]?._tk).filter(Boolean)
    onTaken?.([...payload.takenCardUids, ...sealedKeys])
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
      onTaken?.([card.uid]) // off the table for good — reopening the booth can't re-serve it
      setStock(s => s.filter(c => c.uid !== card.uid))
      const deal = price < cardValue(card) * 0.85 ? ' — great deal!' : ''
      flash(`Bought ${card.name} for ${fmtMoney(price)}${deal}${toShowInventory ? ' · listed at your booth' : ' · added to your collection'}`)
    }
  }
  function sellAt(card, price) {
    // The vendor pays from a finite till — they can't buy what they can't cover.
    if (price > tillLeft + 0.001) { flash(`${booth.name} is tapped out — only ${fmtMoney(tillLeft)} left in their till.`); return }
    // atVendor: this is the vendor's buylist price — the Glass Cases display bump doesn't apply
    useGame.getState().resolveEncounter({ type: 'sellOwned', uid: card.uid, price, notoriety: 0, msg: '', atVendor: true })
    onTillSpend?.(price)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, price) // dealing builds rapport
    flash(`Sold ${card.name} to ${booth.name} for ${fmtMoney(price)}`)
  }
  // Sell copies on a SKU line at the vendor's per-copy offer, up to what their till covers.
  function sellGroup(g, offerEach) {
    const affordable = offerEach > 0 ? Math.floor((tillLeft + 0.001) / offerEach) : g.items.length
    const n = Math.min(g.items.length, affordable)
    if (n <= 0) { flash(`${booth.name} can't cover even one — only ${fmtMoney(tillLeft)} left in their till.`); return }
    for (let i = 0; i < n; i++) {
      useGame.getState().resolveEncounter({ type: 'sellOwned', uid: g.items[i].uid, price: offerEach, notoriety: 0, msg: '', atVendor: true })
    }
    const gross = round2(offerEach * n)
    onTillSpend?.(gross)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, gross)
    flash(n < g.items.length
      ? `Sold ${n} of ${g.items.length} × ${g.first.name} for ${fmtMoney(gross)} — ${booth.name}'s till is empty now.`
      : `Sold ${n} × ${g.first.name} to ${booth.name} for ${fmtMoney(gross)}`)
  }
  // Picking a sealed product opens a choice: rip it on the floor now, or stock it to hold.
  // Buy a sealed product and crack it on the floor right now (same rip flow as the Vault).
  function ripSealedNow(entry) {
    const ask = eff(entry._ask)
    setPendingSealed(null)
    onClose()
    // Only on a SUCCESSFUL buy: mark the entry taken + build rapport. (Rapport used to
    // bump — and the item used to stay re-buyable — even when the purchase failed.)
    const ok = onRipSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
    if (!ok) return
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
    if (entry._tk) onTaken?.([entry._tk])
  }
  // Buy a sealed product and stock it in your held inventory (rip/list/flip later). Keeps
  // the booth open and removes the item from the table; the last one closes the Sealed tab.
  function stockSealedNow(entry) {
    const ask = eff(entry._ask)
    setPendingSealed(null)
    const ok = onStockSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
    if (!ok) return // buy failed (cash) — leave the item on the table
    if (sealed.length <= 1) setTab('buy')
    setSealed(s => s.filter(e => e !== entry))
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
    if (entry._tk) onTaken?.([entry._tk])
  }

  function renderBuy(card, featured) {
    const mkt = cardValue(card) // grade-aware true value
    const ask = eff(card._ask)  // rapport discount applied
    const deal = ask < mkt * 0.85
    return (
      <div key={card.uid} className={`vendoritem ${featured ? 'featured' : ''}`}>
        {/* Tap the card itself to open its page — PSA-if-graded values, the cut/centering
            read, and price history. How you shop for gem-10 candidates. */}
        <div style={{ cursor: 'zoom-in' }} title="Tap to inspect — grade upside, cut read, price history"
          onClick={() => setInspect({ card, ask })}>
          <CardTile card={card} interactive={false} />
        </div>
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
                  {entry._lead && (
                    <span className="pill" style={{ alignSelf: 'center', fontSize: 10.5, background: '#ffcb0522', color: 'var(--gold)' }}
                      title="They set this aside for you before the show — at the price they quoted.">
                      🤝 set aside for you
                    </span>
                  )}
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
          <>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              One line per SKU — identical copies (same card, condition, grade) are stacked, so you can move duplicates in one tap.
              {Number.isFinite(tillLeft) && <> This vendor has <b style={{ color: tillLeft < 50 ? 'var(--red)' : 'var(--gold)' }}>{fmtMoney(tillLeft)}</b> left to spend today.</>}
            </p>
            <div className="trade-line-list sell-lines">
              {groupCardLines(collection, c => round2(cardValue(c))).slice(0, 30).map(g => {
                const offer = round2(g.unit * booth.buyMult)
                const rep = g.first
                return (
                  <div key={g.key} className="trade-line" style={{ cursor: 'default' }}>
                    <img className="tl-thumb" src={rep.img} alt="" style={{ cursor: 'zoom-in' }}
                      title="Tap to open this card — check its PSA upside before selling it away"
                      onClick={() => setInspect({ card: rep, owned: true })} />
                    <div className="tl-info">
                      <div className="tl-name">{rep.foil ? `${rep.foil.badge} ` : rep.reverse ? '✨ ' : ''}{rep.name}</div>
                      <div className="tl-sub muted">{skuBadge(rep)} · mkt {fmtMoney(g.unit)} · they pay {fmtMoney(offer)} each{g.count > 1 ? ` · ×${g.count}` : ''}</div>
                    </div>
                    <div className="row" style={{ gap: 5, flex: 'none', width: 'auto' }}>
                      <button className="btn alt" style={{ flex: 'none', padding: '5px 9px', fontSize: 12 }}
                        onClick={() => sellAt(rep, offer)}>Sell 1</button>
                      {g.count > 1 && (
                        <button className="btn" style={{ flex: 'none', padding: '5px 9px', fontSize: 12 }}
                          title={`Sell all ${g.count} copies at ${fmtMoney(offer)} each`}
                          onClick={() => sellGroup(g, offer)}>All {g.count} · {fmtMoney(round2(offer * g.count))}</button>
                      )}
                      <button className="btn" style={{ flex: 'none', padding: '5px 9px', fontSize: 12 }} disabled={haggled.has(rep.uid)}
                        title={haggled.has(rep.uid) ? 'Already haggled this one — sell it or move on' : 'Haggle one copy up from their offer'}
                        onClick={() => setHaggle({ side: 'sell', card: rep, market: g.unit, start: offer })}>
                        {haggled.has(rep.uid) ? 'Haggled' : 'Haggle'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
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

      {/* The card page — read-only inspect for their stock, full actions for yours. */}
      {inspect && (
        <CardModal card={inspect.card} inspect={!inspect.owned} ask={inspect.ask ?? null}
          onClose={() => setInspect(null)} />
      )}

      {tradeFor && (
        <TradePanel booth={booth} seedCard={tradeFor.card} boothCards={stock} boothSealed={sealed}
          collection={collection} sealedInventory={sealedInventory} eff={eff}
          onTrade={doTrade} onClose={() => setTradeFor(null)} />
      )}
    </div>
  )
}

// The mystery-pack reveal: flip open the grab-bag to see what you pulled — usually one
// random single, but some repacks hide a whole sealed product (it stocks to inventory).
function MysteryReveal({ result, onClose }) {
  const { card, sealed, set, packName } = result
  useModalEscape(onClose)
  if (sealed) {
    const val = sealedValue(sealed)
    return (
      <div className="modalbg" style={{ zIndex: 25 }} onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, textAlign: 'center' }}>
          <h3 style={{ marginTop: 0 }}>📦 {packName}</h3>
          <div className="vendoritem featured" style={{ maxWidth: 200, margin: '0 auto' }}>
            {set?.logo && <img src={set.logo} alt={set?.name || ''} style={{ height: 44, objectFit: 'contain', alignSelf: 'center' }} />}
            <div style={{ fontSize: 30 }}>{sealed.product.icon || '📦'}</div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{sealed.product.type}</div>
            <div className="muted" style={{ fontSize: 11 }}>{set?.name}</div>
            <div style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtMoney(val)}</div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Sealed product inside! It's stocked in <b>Cards → 📦 Sealed</b> — rip, list, or flip it.
          </p>
          <button className="btn gold" style={{ maxWidth: 160, margin: '4px auto 0' }} onClick={onClose}>Nice →</button>
        </div>
      </div>
    )
  }
  const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
  const val = cardValue(card)
  const hit = card._isHit || !!card.foil || val >= 15
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

// SKU grouping lives in ./sku (shared with the store-stock view).

// One SKU line in a picker: thumbnail + name + details, and a − qty + stepper.
// Tapping the line body adds one (the fast path); the − backs one off.
function QtyLine({ thumb, name, sub, count, qty, onAdd, onSub }) {
  return (
    <div className={`trade-line ${qty > 0 ? 'on' : ''}`} onClick={() => qty < count && onAdd()}>
      {thumb}
      <div className="tl-info">
        <div className="tl-name">{name}</div>
        <div className="tl-sub muted">{sub}</div>
      </div>
      <div className="qty-ctl" onClick={e => e.stopPropagation()}>
        <button className="qty-step" disabled={qty <= 0} onClick={onSub} aria-label="one less">−</button>
        <span className="tl-qty">{qty}{count > 1 ? <span className="tl-of">/{count}</span> : ''}</span>
        <button className="qty-step" disabled={qty >= count} onClick={onAdd} aria-label="one more">+</button>
      </div>
    </div>
  )
}

// Many-to-many trade builder. Assemble a bundle of YOUR cards + held sealed to offer for a
// bundle of the booth's cards + sealed. Your items are valued at the vendor's BUY rate (what
// they'd pay); their items at their (rapport-discounted) ask. Cash closes the gap either way.
// Every SKU is one line — duplicates stack, and you dial in how many with the stepper.
function TradePanel({ booth, seedCard, boothCards, boothSealed, collection, sealedInventory, eff, onTrade, onClose }) {
  const cash = useGame(s => s.cash)
  useModalEscape(onClose)
  const buyMult = booth.buyMult || 0.6

  // SKU lines per side. Yours priced at market (× buy rate at the summary); theirs at
  // the rapport-discounted ask. Only real (non-mystery) booth sealed is tradeable.
  const mineCardLines = groupCardLines(collection, c => round2(cardValue(c)))
  const mineSealedLines = groupLines(sealedInventory || [], it => sealedSku(it.setId, it.product), it => round2(sealedValue(it)))
  const theirCardLines = groupCardLines(boothCards, c => eff(c._ask))
  const theirSealedLines = groupLines(
    boothSealed.map((e, i) => ({ e, i })).filter(x => !x.e.mystery),
    x => sealedSku(x.e.set?.id, x.e.product), x => eff(x.e._ask))

  // qty per line key, per side. The booth card you tapped "Trade" on seeds its line at 1.
  const [giveQty, setGiveQty] = useState({})
  const [giveSealQty, setGiveSealQty] = useState({})
  const [getQty, setGetQty] = useState(() => seedCard ? { [`${cardSku(seedCard)}|${eff(seedCard._ask).toFixed(2)}`]: 1 } : {})
  const [getSealQty, setGetSealQty] = useState({})
  const bump = (setter, key, delta, max) => setter(prev => {
    const n = Math.max(0, Math.min(max, (prev[key] || 0) + delta))
    const next = { ...prev }
    if (n > 0) next[key] = n; else delete next[key]
    return next
  })

  const total = (lines, qmap) => lines.reduce((a, g) => a + g.unit * (qmap[g.key] || 0), 0)
  const countOf = (qmap) => Object.values(qmap).reduce((a, n) => a + n, 0)
  const yourVal = round2((total(mineCardLines, giveQty) + total(mineSealedLines, giveSealQty)) * buyMult)
  const theirVal = round2(total(theirCardLines, getQty) + total(theirSealedLines, getSealQty))
  const cashDelta = round2(theirVal - yourVal) // >0 you add cash; <0 they add cash
  const nGive = countOf(giveQty) + countOf(giveSealQty)
  const nGet = countOf(getQty) + countOf(getSealQty)
  const canDo = nGet > 0 && (nGive > 0 || cashDelta > 0) && (cashDelta <= 0 || cash >= cashDelta)

  const MAX_LINES = 60 // a huge collection still renders snappily; highest value first

  function confirm() {
    const takeCards = theirCardLines.flatMap(g => g.items.slice(0, getQty[g.key] || 0))
    const takeSealed = theirSealedLines.flatMap(g => g.items.slice(0, getSealQty[g.key] || 0))
    onTrade({
      giveCardUids: mineCardLines.flatMap(g => g.items.slice(0, giveQty[g.key] || 0).map(c => c.uid)),
      giveSealedUids: mineSealedLines.flatMap(g => g.items.slice(0, giveSealQty[g.key] || 0).map(it => it.uid)),
      getCards: takeCards,
      getSealed: takeSealed.map(({ e }) => ({ set: e.set, product: e.product, ask: eff(e._ask) })),
      cashDelta,
      takenCardUids: takeCards.map(c => c.uid),
      takenSealedIdx: takeSealed.map(({ i }) => i),
    })
  }

  return (
    <div className="modalbg" style={{ zIndex: 25 }} onClick={onClose}>
      <div className="modal trade-builder" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>🔁 Build a trade with {booth.name}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          One line per SKU — duplicates stack, tap a line (or +) to add copies. They value your
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
            <div className="trade-line-list">
              {mineCardLines.length === 0 && mineSealedLines.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Nothing to offer — trade cash only.</div>}
              {mineSealedLines.map(g => (
                <QtyLine key={g.key}
                  thumb={<span className="tl-icon">{g.first.product?.icon || '📦'}</span>}
                  name={`${g.first.product?.type || 'Sealed'} — ${setById(g.first.setId)?.name || 'sealed'}`}
                  sub={`${fmtMoney(round2(g.unit * buyMult))} trade-in each${g.count > 1 ? ` · have ${g.count}` : ''}`}
                  count={g.count} qty={giveSealQty[g.key] || 0}
                  onAdd={() => bump(setGiveSealQty, g.key, +1, g.count)}
                  onSub={() => bump(setGiveSealQty, g.key, -1, g.count)} />
              ))}
              {mineCardLines.slice(0, MAX_LINES).map(g => (
                <QtyLine key={g.key}
                  thumb={<img className="tl-thumb" src={g.first.img} alt="" loading="lazy" />}
                  name={`${g.first.foil ? `${g.first.foil.badge} ` : g.first.reverse ? '✨ ' : ''}${g.first.name}`}
                  sub={`${skuBadge(g.first)} · ${fmtMoney(round2(g.unit * buyMult))} trade-in each${g.count > 1 ? ` · have ${g.count}` : ''}`}
                  count={g.count} qty={giveQty[g.key] || 0}
                  onAdd={() => bump(setGiveQty, g.key, +1, g.count)}
                  onSub={() => bump(setGiveQty, g.key, -1, g.count)} />
              ))}
              {mineCardLines.length > MAX_LINES && (
                <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                  +{mineCardLines.length - MAX_LINES} more lines (highest value shown)
                </div>
              )}
            </div>
          </div>
          <div className="trade-builder-col">
            <div className="rip-side-head">📥 Their table</div>
            <div className="trade-line-list">
              {theirSealedLines.map(g => (
                <QtyLine key={g.key}
                  thumb={<span className="tl-icon">{g.first.e.product?.icon || '📦'}</span>}
                  name={`${g.first.e.product?.type || 'Sealed'} — ${g.first.e.set?.name || 'sealed'}`}
                  sub={`${fmtMoney(g.unit)} each${g.count > 1 ? ` · ${g.count} on the table` : ''}`}
                  count={g.count} qty={getSealQty[g.key] || 0}
                  onAdd={() => bump(setGetSealQty, g.key, +1, g.count)}
                  onSub={() => bump(setGetSealQty, g.key, -1, g.count)} />
              ))}
              {theirCardLines.map(g => (
                <QtyLine key={g.key}
                  thumb={<img className="tl-thumb" src={g.first.img} alt="" loading="lazy" />}
                  name={`${g.first.foil ? `${g.first.foil.badge} ` : g.first.reverse ? '✨ ' : ''}${g.first.name}`}
                  sub={`${skuBadge(g.first)} · ${fmtMoney(g.unit)} each${g.count > 1 ? ` · ${g.count} on the table` : ''}`}
                  count={g.count} qty={getQty[g.key] || 0}
                  onAdd={() => bump(setGetQty, g.key, +1, g.count)}
                  onSub={() => bump(setGetQty, g.key, -1, g.count)} />
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

