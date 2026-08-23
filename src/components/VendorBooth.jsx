import { useState, useRef } from 'react'
import { useGame } from '../game/store'
import { cardValue, rawValue, sealedValue, fmtMoney, round2, GRADING, gradingFee, overTierValue, DEFAULT_GRADER, setById, cardImg, isCardDeal, setNameOfCard, rarityRank } from '../game/engine'
import { vendorRapport, nextVendorRapport, boothItemKey } from '../game/shows'
import { seedSealedLines, consumeLine, sameLine } from '../game/boothstock'
import CardTile, { rarityColor } from './CardTile'
// (Collapse is already imported below for the sealed tab)
import CardModal from './CardModal'
import Haggle from './Haggle'
import { confirmDialog, useModalEscape } from '../ui/dialog'
import { Collapse } from '../ui/Collapse'
import { cardSku, skuBadge, groupLines, groupCardLines, sealedSku } from './sku'

export default function VendorBooth({ booth, onClose, flash, onRipSealed, onRipSealedStack, onStockSealed, haggledIds, onHaggled, takenIds, onTaken, tillLeft, onTillSpend, asVendor = false, starredKeys, onToggleStar }) {
  if (booth.special === 'kiosk') return <KioskBooth booth={booth} onClose={onClose} flash={flash} />
  return <RegularBooth booth={booth} onClose={onClose} flash={flash} onRipSealed={onRipSealed} onRipSealedStack={onRipSealedStack} onStockSealed={onStockSealed} haggledIds={haggledIds} onHaggled={onHaggled} takenIds={takenIds} onTaken={onTaken} tillLeft={tillLeft} onTillSpend={onTillSpend} asVendor={asVendor} starredKeys={starredKeys} onToggleStar={onToggleStar} />
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
  // Per card now: the kiosk prices a card above its declared-value ceiling off what the card is
  // WORTH, so a four-figure chase can't be slabbed on the flat sticker. `fee` stays the sticker
  // for the blurb; every actual charge goes through feeFor.
  const feeFor = (card) => gradingFee('kiosk', submitted, 1, DEFAULT_GRADER, rawValue(card))
  const fee = gradingFee('kiosk', submitted)
  function submit(card) {
    const f = feeFor(card)
    if (cash < f) { flash(`Not enough cash for the ${fmtMoney(f)} kiosk fee.`); return }
    useGame.getState().submitGrade(card.uid, 'kiosk')
    flash(`Submitted ${card.name} to the on-site grader — slabbed in ~${days} days.`)
  }
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
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
              const f = feeFor(card)
              const worthIt = cardValue(card) >= f
              const byValue = overTierValue('kiosk', rawValue(card))
              return (
                <div key={card.uid} className="vendoritem">
                  <CardTile card={card} interactive={false} />
                  <div className="muted" style={{ fontSize: 11 }}>mkt {fmtMoney(cardValue(card))}</div>
                  <button className="btn" disabled={cash < f} onClick={() => submit(card)}
                    title={byValue ? "Above the kiosk's declared-value ceiling — priced off what the card is worth, not the sticker"
                      : !worthIt ? 'Grading costs more than this card is worth' : undefined}>
                    Grade {fmtMoney(f)}{byValue ? ' 📈' : !worthIt ? ' ⚠️' : ''}
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

function RegularBooth({ booth, onClose, flash, onRipSealed, onRipSealedStack, onStockSealed, haggledIds, onHaggled, takenIds, onTaken, tillLeft = Infinity, onTillSpend, asVendor = false, starredKeys, onToggleStar }) {
  const haggled = haggledIds || new Set()
  // "Come back to this" stars, keyed by item (card uid / sealed `_tk`). isStarred reads the
  // set ShowFloor passes for THIS booth; a tap toggles it and highlights the booth in the
  // directory so you can find your way back after a lap of the floor.
  const starSet = starredKeys || new Set()
  const StarBtn = ({ k }) => onToggleStar ? (
    <button type="button" className={`booth-star ${starSet.has(k) ? 'on' : ''}`}
      title={starSet.has(k) ? 'Starred — come back for it (tap to unstar)' : 'Star it — come back to this booth later'}
      aria-pressed={starSet.has(k)}
      onClick={(e) => { e.stopPropagation(); onToggleStar(k) }}>{starSet.has(k) ? '★' : '☆'}</button>
  ) : null
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const settings = useGame(s => s.settings) // deal-detector config (what YOU count as a deal)
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
  // Keyed by boothItemKey, NOT the uid: the uid is re-minted whenever the floor rebuilds,
  // so a uid key survived a reopened booth but not a reopened APP. See game/shows.js.
  const [stock, setStock] = useState(() => (booth.stock || []).filter(c => !takenIds?.has(boothItemKey(c))))
  // Sealed lines carry a qty (a stack of the same SKU). Units taken are recorded as
  // `${_tk}#u<n>` keys in takenIds, so a close/reopen re-seeds each line at its remaining
  // depth instead of either re-serving bought units or nuking the whole stack. The depth
  // rules live in game/boothstock.js — see there for why they are not inlined here.
  const [sealed, setSealed] = useState(() => seedSealedLines(booth.products, takenIds))
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
  // Haggled-down sealed prices, keyed by the line's reload-stable `_tk`. Sealed haggling is
  // one-per-line (same haggledIds set the singles use — `_tk` strings can't collide with card
  // uids), and the agreed unit price flows through every buy path via askOf().
  const [agreedPrices, setAgreedPrices] = useState(() => new Map())
  const askOf = (entry) => (entry._tk != null && agreedPrices.has(entry._tk)) ? agreedPrices.get(entry._tk) : eff(entry._ask)
  const [mysteryResult, setMysteryResult] = useState(null) // card pulled from a mystery pack
  const [tradeFor, setTradeFor] = useState(null)           // booth card you're offering a trade on
  // 🧺 Stack deal: multi-select singles, one checkout, a volume discount — the "gather a few
  // cards and make one offer for the lot" that every card-show buying guide teaches. 3+ cards
  // 8% off, 6+ 12%, 10+ 15% (inside the 10-20% real vendors concede on volume).
  const [stackIds, setStackIds] = useState(() => new Set())
  const stackDisc = (n) => n >= 10 ? 0.15 : n >= 6 ? 0.12 : n >= 3 ? 0.08 : 0
  const toggleStack = (uid) => setStackIds(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  function buyStack() {
    const cards = stock.filter(c => stackIds.has(c.uid))
    if (cards.length < 3) return
    const disc = stackDisc(cards.length)
    const total = round2(cards.reduce((a, c) => a + eff(c._ask), 0) * (1 - disc))
    const g = useGame.getState()
    if (g.cash < total) { flash(`Not enough cash — the stack runs ${fmtMoney(total)}.`); return }
    let bought = 0, spent = 0
    for (const c of cards) {
      const each = round2(eff(c._ask) * (1 - disc))
      if (!buyFromVendor(c, each, { vendorId: booth.vendorId })) break
      bought++; spent = round2(spent + each)
      onTaken?.([boothItemKey(c)])
    }
    if (!bought) return
    setStock(s => s.filter(c => !stackIds.has(c.uid) || !cards.slice(0, bought).some(x => x.uid === c.uid)))
    setStackIds(new Set())
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, spent)
    flash(`🧺 Deal done — ${bought} cards for ${fmtMoney(spent)} (${Math.round(disc * 100)}% off the stack).`)
  }
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
    // The cards leave the table under their reload-stable keys; takenCardUids stays a uid
    // list because it only filters THIS booth's local copy, which never outlives the mount.
    onTaken?.(payload.getCards.map(boothItemKey))
    setStock(s => s.filter(c => !payload.takenCardUids.includes(c.uid)))
    // A trade takes ONE unit off each sealed line (the picker offers one per SKU), so consume
    // it the same way a purchase does. This used to drop the whole line — trade for one box
    // off a stack of four and the other three vanished off the table with it.
    for (const i of payload.takenSealedIdx) { if (sealed[i]) consumeSealed(sealed[i], 1) }
    setTradeFor(null)
    const giveN = payload.giveCardUids.length + payload.giveSealedUids.length
    const getN = payload.getCards.length + payload.getSealed.length
    flash(`Traded ${giveN} item${giveN !== 1 ? 's' : ''} for ${getN}!`)
  }

  // A dealer's table carries a real spread now, so the sealed tab groups BY SET and collapses —
  // a flat grid of 20+ cards was a wall you had to scroll past rather than read. `_idx` keeps
  // each entry's identity from the original array so buy/trade still act on the right one.
  const sealedBySet = (() => {
    const bySet = new Map()
    sealed.forEach((entry, i) => {
      if (entry.mystery) return
      const id = entry.set?.id || 'other'
      if (!bySet.has(id)) bySet.set(id, { setId: id, name: entry.set?.name || 'Other', logo: entry.set?.logo, items: [] })
      bySet.get(id).items.push({ ...entry, _idx: i })
    })
    // Cheapest line first inside a set; sets ordered by their best price, so the affordable
    // end of the table is what you see first.
    const groups = [...bySet.values()]
    for (const g of groups) g.items.sort((a, b) => eff(a._ask) - eff(b._ask))
    return groups.sort((a, b) => eff(a.items[0]._ask) - eff(b.items[0]._ask))
  })()

  const seeDeals = upgrades.network
  // Deal/OVER read for a sealed entry, mirroring the singles logic in renderBuy: compare the
  // (rapport-discounted) ask against the product's live market value. Vendor markups on sealed —
  // especially vintage, which can ask 2×+ market — used to be totally opaque here: no mkt line,
  // no OVER flag, so nothing stopped you paying $1,500 for a $700 pack. { mkt, ask, deal, over }.
  const sealedRead = (entry) => {
    const mkt = sealedValue({ product: entry.product, setId: entry.set?.id })
    const ask = askOf(entry) // rapport-discounted ask, or the haggled-down price once agreed
    // Sealed has no condition/grade, so only the price ceiling of your deal config applies here.
    return { mkt, ask, deal: mkt > 0 && ask <= mkt * (settings?.dealMaxMult ?? 0.85), over: mkt > 0 && ask > mkt * 1.2 }
  }

  // 🔎 Deal finder, at the binder level. The DEAL tags only exist once a section is OPEN, so a
  // table with a dozen collapsed sets hid every underpriced card behind a tap-and-look sweep —
  // the finder telling you nothing until you'd already done the searching by hand. A section
  // holding at least one deal now says so on its closed header: the set's NAME goes green.
  // Same test the row tags use, so the header can't disagree with what's inside it.
  const dealsIn = (cards) => cards.filter(c => isCardDeal(c, eff(c._ask), settings)).length
  // Green only with the finder unlocked — without it you're meant to do your own appraising.
  const dealName = (n, node) => (
    seeDeals && n > 0
      ? <span className="deal-set" title={`🔎 ${n} deal${n > 1 ? 's' : ''} spotted in here — priced at or under your bar`}>{node}</span>
      : node
  )

  // A buy is agreed (at ask or via haggle) → ask where it goes before committing.
  function buyAt(card, price) {
    committingRef.current = false // arm a fresh commit for this new purchase
    setPendingBuy({ card, price })
  }
  // Commit the agreed buy. `toShowInventory` lists it for sale at your booth;
  // otherwise it goes home to your collection. Listing needs a booth at THIS show
  // (asVendor) — a shopper has no table, so a buy can only go to the collection.
  function commitBuy(toShowInventory) {
    if (committingRef.current || !pendingBuy) return // ignore a double-click re-entry
    committingRef.current = true
    const { card, price } = pendingBuy
    setPendingBuy(null)
    const list = toShowInventory && asVendor
    if (buyFromVendor(card, price, { toShowInventory: list, vendorId: booth.vendorId })) {
      onTaken?.([boothItemKey(card)]) // off the table for good — reopening the booth OR the app can't re-serve it
      setStock(s => s.filter(c => c.uid !== card.uid))
      const deal = isCardDeal(card, price, settings) ? ' — great deal!' : ''
      flash(`Bought ${card.name} for ${fmtMoney(price)}${deal}${list ? ' · listed at your booth' : ' · added to your collection'}`)
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
  // --- The vendor's sealed stack is FINITE ------------------------------------------------
  // The live line behind a (possibly stale) clicked copy — the authority on how many are
  // actually left. The rows a player clicks are COPIES: sealedBySet groups the table by set
  // and spreads each entry to stamp `_idx`, so a copy is never reference-equal to the line it
  // came from. Every buy path resolves through this before charging anyone.
  const liveLine = (entry) => sealed.find(e => sameLine(e, entry)) || null

  // Picking a sealed product opens a choice: rip it on the floor now, or stock it to hold.
  // Buy a sealed product and crack it on the floor right now (same rip flow as the Vault).
  // Consume `n` units off a sealed line: record per-unit taken keys (so a reopen re-seeds the
  // remaining stack), decrement or drop the local line, and close the Sealed tab on the last one.
  function consumeSealed(entry, n = 1) {
    const { keys } = consumeLine(sealed, entry, n)
    if (keys.length) onTaken?.(keys)
    setSealed(s => {
      const { lines } = consumeLine(s, entry, n)
      if (!lines.length) setTab('buy')
      return lines
    })
  }
  // The volume concession on a stack off ONE line — the same 8/12/15% whether you're taking
  // it home sealed or tearing into all of it at the table.
  const lotDisc = (n) => n >= 5 ? 0.15 : n >= 3 ? 0.12 : 0.08
  // One quote for "the whole stack off this line": the volume discount on the (possibly
  // haggled) unit price. On a HAGGLED line the lot price floors at 93% of market — the two
  // concessions don't stack into below-market boxes, which would quietly make ripping +EV.
  function lotQuote(entry, n) {
    const disc = lotDisc(n)
    let each = round2(askOf(entry) * (1 - disc))
    if (entry._tk != null && agreedPrices.has(entry._tk)) {
      const mkt = sealedValue({ product: entry.product, setId: entry.set?.id })
      if (mkt > 0) each = Math.max(each, round2(mkt * 0.93))
    }
    return { disc, each, total: round2(each * n) }
  }
  function ripSealedNow(entry) {
    if (!liveLine(entry)) { setPendingSealed(null); return flash(`${booth.name} has none of those left.`) }
    const ask = askOf(entry)
    setPendingSealed(null)
    // The booth STAYS OPEN — the floor-rip overlay paints above this modal, so when the rip's
    // Done lands you're back at the table you bought from, stack decremented, ready to keep
    // shopping. (It used to onClose() here, dumping you back to the directory after every rip.)
    const ok = onRipSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
    if (!ok) return
    consumeSealed(entry, 1)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
  }
  // Buy a sealed product and stock it in your held inventory (rip/list/flip later). Keeps
  // the booth open and removes the item from the table; the last one closes the Sealed tab.
  function stockSealedNow(entry) {
    if (!liveLine(entry)) { setPendingSealed(null); return flash(`${booth.name} has none of those left.`) }
    const ask = askOf(entry)
    setPendingSealed(null)
    const ok = onStockSealed?.({ set: entry.set, product: entry.product, ask, vendorName: booth.name })
    if (!ok) return // buy failed (cash) — leave the item on the table
    consumeSealed(entry, 1)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, ask)
  }
  // Buy the whole stack off this line and rip EVERY unit right here at the table, back to
  // back — the lot discount applies exactly as it does when you take them home sealed. The
  // booth stays open behind the rip, so you're back at their table when the last one lands.
  function ripStackNow(entry) {
    // Size the lot off the LIVE line, not the clicked copy: the copy's qty is whatever the row
    // said when it rendered, and charging for a stack deeper than the vendor still has is how
    // you pay for four boxes and take home product they never brought.
    const cur = liveLine(entry)
    if (!cur) { setPendingSealed(null); return flash(`${booth.name} has none of those left.`) }
    const n = cur.qty || 1
    const { disc, each } = lotQuote(entry, n)
    setPendingSealed(null)
    const ok = onRipSealedStack?.({ set: entry.set, product: entry.product, each, n, vendorName: booth.name })
    if (!ok) return
    consumeSealed(entry, n)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, round2(each * n))
    flash(`🧺 Took all ${n} at ${fmtMoney(each)} each (${Math.round(disc * 100)}% off) — ripping them here.`)
  }
  // 🧺 Take the remaining STACK of one line at a volume discount — the "do a deal on the lot"
  // every real vendor loves (fewer transactions, less to pack up). Stocks to inventory.
  function takeStack(entry) {
    const cur = liveLine(entry)               // the lot is what's left on the table, not what the row said
    if (!cur) { setPendingSealed(null); return flash(`${booth.name} has none of those left.`) }
    const n = cur.qty || 1
    const { disc, each, total } = lotQuote(entry, n)
    const g = useGame.getState()
    if (g.cash < total) { flash(`Not enough cash — the lot of ${n} runs ${fmtMoney(total)}.`); return }
    setPendingSealed(null) // may have been launched from the buy dialog
    let bought = 0
    for (let i = 0; i < n; i++) {
      if (!onStockSealed?.({ set: entry.set, product: entry.product, ask: each, vendorName: booth.name })) break
      bought++
    }
    if (!bought) return
    consumeSealed(entry, bought)
    if (booth.vendorId) useGame.getState().bumpVendorRapport(booth.vendorId, round2(each * bought))
    flash(`🧺 Took the stack — ${bought}× ${entry.product.type} at ${fmtMoney(each)} each (${Math.round(disc * 100)}% off the lot).`)
  }

  // Compact list row for the set-grouped bins — rarity chip, name, ask vs market, actions.
  // Tap the name to inspect (full card page); the checkbox feeds the 🧺 stack deal.
  function renderRow(card) {
    const mkt = cardValue(card)
    const ask = eff(card._ask)
    const deal = isCardDeal(card, ask, settings)
    const inStack = stackIds.has(card.uid)
    return (
      <div key={card.uid} className={`vsingle-row ${inStack ? 'in-stack' : ''} ${starSet.has(card.uid) ? 'starred' : ''}`}>
        <button type="button" className={`stack-check ${inStack ? 'on' : ''}`} onClick={() => toggleStack(card.uid)}
          title="Add to a stack — 3+ cards gets a volume deal on the lot" aria-pressed={inStack}>{inStack ? '✓' : '+'}</button>
        <span className="vsingle-rarity" style={{ '--rarity': card.foil ? card.foil.color : rarityColor(card.rarity) }}
          title={card.rarity + (card.foil ? ` · ${card.foil.label}` : card.reverse ? ' · Reverse Holo' : '')} />
        <span className="vsingle-name" style={{ cursor: 'zoom-in' }} title="Tap to inspect — grade upside, cut read, price history"
          onClick={() => setInspect({ card, ask })}>
          {card.grade ? `🔬${card.grade.overall} ` : ''}{card.name}
          {card._mispriced && seeDeals ? ' 💎' : ''}
        </span>
        <span className="vsingle-meta">{card.condition && card.condition !== 'NM' ? card.condition + ' · ' : ''}mkt {fmtMoney(mkt)}</span>
        <span className="vsingle-ask">
          {disc > 0 && <s className="retail">{fmtMoney(card._ask)}</s>}
          <span className="ask">{fmtMoney(ask)}</span>
          {seeDeals && deal && <span className="dealtag">DEAL</span>}
          {seeDeals && !deal && ask > mkt * 1.2 && <span className="overtag">OVER</span>}
        </span>
        <span className="vsingle-act">
          <button className="btn" disabled={cash < ask} onClick={() => buyAt(card, ask)}>Buy</button>
          <button className="btn alt" disabled={haggled.has(card.uid)}
            onClick={() => setHaggle({ side: 'buy', card, market: mkt, start: ask })}>{haggled.has(card.uid) ? '—' : 'Haggle'}</button>
        </span>
      </div>
    )
  }

  function renderBuy(card, featured) {
    const mkt = cardValue(card) // grade-aware true value
    const ask = eff(card._ask)  // rapport discount applied
    const deal = isCardDeal(card, ask, settings)
    return (
      <div key={card.uid} className={`vendoritem ${featured ? 'featured' : ''} ${starSet.has(card.uid) ? 'starred' : ''}`}>
        <StarBtn k={card.uid} />
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
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="row" style={{ alignItems:'baseline' }}>
          <h2 style={{ marginRight:'auto' }}>{booth.recurring ? '🤝 ' : ''}{booth.name}</h2>
          {rap && <span className="pill" title="Your standing with this recurring dealer"
            style={{ background: rap.color + '22', color: rap.color }}>{rap.name}{disc > 0 ? ` · ${Math.round(disc*100)}% off` : ''}</span>}
          <span className="pill">{booth.archLabel}</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>
          This vendor is {booth.vibe}. They pay <b>{Math.round(booth.buyMult*100)}%</b> cash{booth.tradeMult ? <> · <b style={{ color: 'var(--gold)' }}>{Math.round(booth.tradeMult*100)}%</b> in trade</> : null} for yours. Try to <b>haggle</b> — but push too hard and they'll walk.
          {booth.recurring && <> <span style={{ color: rap?.color }}>A regular on the circuit — keep dealing with them to grow your discount{nextRap ? ` (${fmtMoney(nextRap.min - vendorSpend)} more of business → ${nextRap.name}, ${Math.round(nextRap.disc*100)}% off)` : ' — you\'re fully Trusted here'}.</span></>}
        </p>

        <div className="tabs" style={{ margin: '10px 0' }}>
          <button className={`tab ${tab==='buy'?'active':''}`} onClick={()=>setTab('buy')}>Their stock ({stock.length})</button>
          {sealed.length > 0 && <button className={`tab ${tab==='sealed'?'active':''}`} onClick={()=>setTab('sealed')}>📦 Sealed ({sealed.reduce((a, e) => a + (e.mystery ? 1 : (e.qty || 1)), 0)})</button>}
          <button className={`tab ${tab==='sell'?'active':''}`} onClick={()=>setTab('sell')}>Sell to them</button>
        </div>

        {tab === 'sealed' ? (
          <>
            <div className="showcase-head">📦 Sealed & mystery <span className="muted">— sealed rips on the floor or stocks to hold; mystery packs open on the spot (vendor markup applies)</span></div>
            {/* A dealer's table now carries a proper spread rather than one or two items, so the
                real sealed is grouped BY SET and collapsed. Mystery packs stay a small grid up
                top: they're not set-based and there are only ever a couple. */}
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))' }}>
              {sealed.filter(e => e.mystery).map((entry, idx) => (
                <div key={idx} className={`vendoritem featured sealed-mystery ${entry._tk && starSet.has(entry._tk) ? 'starred' : ''}`}>
                  {entry._tk && <StarBtn k={entry._tk} />}
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
              ))}
            </div>
            {sealedBySet.length === 0 && sealed.some(e => e.mystery) && (
              <p className="muted">Their sealed is gone — you cleared the table. Only the mystery packs are left.</p>
            )}
            {sealedBySet.map(g => (
              <Collapse key={g.setId} id={`booth-sealed-${g.setId}`} defaultOpen={sealedBySet.length <= 3}
                className="wants" headClass="wants-head"
                head={<>{g.logo && <img src={g.logo} alt="" style={{ height: 20, objectFit: 'contain', verticalAlign: '-4px', marginRight: 6 }} />}
                  {dealName(g.items.filter(x => sealedRead(x).deal).length, g.name)}</>}
                badge={`${g.items.reduce((a, x) => a + (x.qty || 1), 0)} · from ${fmtMoney(Math.min(...g.items.map(x => eff(x._ask))))}`}>
                <div className="vsealed-list">
                  {g.items.map((entry) => {
                    const idx = entry._idx
                    const { mkt, ask, deal, over } = sealedRead(entry)
                    return (
                      <div key={idx} className={`vsealed-row ${entry._origin === 'vintage' ? 'sealed-vintage' : ''} ${entry._origin === 'aftermarket' ? 'sealed-aftermarket' : ''}`}>
                        <span className="vsealed-name">
                          {entry._origin === 'vintage' ? '🗝️ ' : entry._origin === 'aftermarket' ? '🕰️ ' : entry._origin === 'import' ? '🎌 ' : (entry.product.icon || '📦') + ' '}
                          {entry.product.type}
                          {(entry.qty || 1) > 1 && <span className="pill vsealed-qty" title={`They brought a stack — ${entry.qty} of these on the table.`}>×{entry.qty}</span>}
                          {entry._lead && <span className="pill" style={{ marginLeft: 6, fontSize: 10, background: '#ffcb0522', color: 'var(--gold)' }} title="They set this aside for you before the show — at the price they quoted.">🤝 held</span>}
                        </span>
                        <span className="vsealed-meta">
                          {entry.product.packs} pk{entry.product.bonus ? ' +🎁' : ''}{mkt > 0 ? ` · mkt ${fmtMoney(mkt)}` : ''}
                        </span>
                        <span className="vsealed-ask">
                          {ask < entry._ask && <s className="retail" style={{ marginRight: 4 }}>{fmtMoney(entry._ask)}</s>}
                          <span className="ask">{fmtMoney(ask)}</span>
                          {seeDeals && deal && <span className="dealtag">DEAL</span>}
                          {seeDeals && over && <span className="overtag">OVER</span>}
                        </span>
                        <span className="vsealed-act">
                          <button className="btn gold" disabled={cash < ask} onClick={() => setPendingSealed(entry)}>
                            {cash < ask ? 'Need' : 'Buy'}
                          </button>
                          {/* 🗣️ Sealed haggles too — "I bought 6 Sun & Moon packs off a guy and
                              negotiated the price." Same one-haggle-per-line rule as singles,
                              keyed by the line's _tk; the agreed price feeds every buy path. */}
                          <button className="btn alt" disabled={!entry._tk || haggled.has(entry._tk) || mkt <= 0}
                            title={haggled.has(entry._tk) ? 'Already haggled this line — buy it or move on' : 'Haggle on the price'}
                            onClick={() => setHaggle({ side: 'buy', card: { name: `${entry.set?.name || ''} ${entry.product.type}`.trim() }, market: mkt, start: ask, sealedEntry: entry })}>
                            {haggled.has(entry._tk) ? '—' : '🗣️'}
                          </button>
                          {(entry.qty || 1) >= 2 && (
                            <button className="btn alt" disabled={cash < ask * entry.qty * 0.85}
                              title={`Take all ${entry.qty} at ${entry.qty >= 5 ? 15 : entry.qty >= 3 ? 12 : 8}% off the lot — straight to your inventory. Vendors love volume.`}
                              onClick={() => takeStack(entry)}>🧺 ×{entry.qty}</button>
                          )}
                          <button className="btn alt" disabled={!canTrade}
                            title={canTrade ? 'Build a trade — offer your cards/sealed (± cash) for this sealed and more' : 'You have nothing to trade'}
                            onClick={() => setTradeFor({ sealed: entry })}>🔄</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Collapse>
            ))}
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
              </>
            )}
            {/* 📒 The binders: singles grouped BY SET, rarity-sorted inside — the way a real
                table organizes them — with the sub-$2 stuff in its own dollar bin. Compact
                rows instead of a tile wall, so a deep bin browses fast; tap a name for the
                full card page. The + on each row builds a 🧺 stack for a volume deal. */}
            {(() => {
              const rest = stock.filter(c => !c._highlight)
              const bin = rest.filter(c => eff(c._ask) < 2)
              const bySet = new Map()
              for (const c of rest) {
                if (eff(c._ask) < 2) continue
                const sn = setNameOfCard(c) || 'Other'
                if (!bySet.has(sn)) bySet.set(sn, [])
                bySet.get(sn).push(c)
              }
              const groups = [...bySet.entries()].map(([name, cards]) => {
                cards.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || eff(b._ask) - eff(a._ask))
                return { name, cards, top: Math.max(...cards.map(c => eff(c._ask))), deals: dealsIn(cards) }
              }).sort((a, b) => b.top - a.top)
              const binDeals = dealsIn(bin)
              return (
                <>
                  {groups.map(g => (
                    <Collapse key={g.name} id={`booth-bin-${booth.id}-${g.name}`} defaultOpen={groups.length <= 3}
                      className="wants" headClass="wants-head"
                      head={<>📒 {dealName(g.deals, g.name)}</>} badge={`${g.cards.length} · to ${fmtMoney(g.top)}`}>
                      <div className="vsingle-list">{g.cards.map(renderRow)}</div>
                    </Collapse>
                  ))}
                  {bin.length > 0 && (
                    <Collapse id={`booth-bin-${booth.id}-dollar`} defaultOpen={false}
                      className="wants" headClass="wants-head"
                      head={<>🗃️ {dealName(binDeals, 'Dollar bin')}</>} badge={`${bin.length} cards`}>
                      <div className="vsingle-list">{bin.sort((a, b) => eff(b._ask) - eff(a._ask)).map(renderRow)}</div>
                    </Collapse>
                  )}
                </>
              )
            })()}
            {stackIds.size > 0 && (() => {
              const cards = stock.filter(c => stackIds.has(c.uid))
              const disc = stackDisc(cards.length)
              const sum = round2(cards.reduce((a, c) => a + eff(c._ask), 0))
              const total = round2(sum * (1 - disc))
              return (
                <div className="stack-bar">
                  <span><b>🧺 {cards.length}</b> picked{disc > 0 ? <> · <b>{Math.round(disc * 100)}% off</b></> : <> · pick {3 - cards.length} more for a deal</>}</span>
                  <span>{disc > 0 && <s className="retail" style={{ marginRight: 4 }}>{fmtMoney(sum)}</s>}<b className="ask">{fmtMoney(total)}</b></span>
                  <button className="btn gold" disabled={cards.length < 3 || cash < total} onClick={buyStack}>Do the deal</button>
                  <button className="btn alt" style={{ flex: 'none', maxWidth: 60 }} onClick={() => setStackIds(new Set())}>✕</button>
                </div>
              )
            })()}
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
                    <img className="tl-thumb" src={cardImg(rep)} alt="" style={{ cursor: 'zoom-in' }}
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
          onClose={(engaged) => { if (engaged) onHaggled?.(haggle.sealedEntry ? haggle.sealedEntry._tk : haggle.card.uid); setHaggle(null) }}
          onDeal={(price) => {
            // A sealed haggle doesn't buy anything yet — it locks the agreed unit price on the
            // line (askOf reads it) and opens the usual rip/stock choice at that price.
            if (haggle.sealedEntry) {
              const e = haggle.sealedEntry
              if (e._tk != null) setAgreedPrices(m => { const next = new Map(m); next.set(e._tk, round2(price)); return next })
              onHaggled?.(e._tk)
              setHaggle(null)
              setPendingSealed(e)
              return
            }
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
            <button className="modal-close" aria-label="Close" onClick={() => setPendingSealed(null)}>✕</button>
            <h3 style={{ marginTop: 0 }}>
              {pendingSealed._origin === 'vintage' ? '🗝️ ' : (pendingSealed.product.icon || '📦') + ' '}{pendingSealed.product.type}
            </h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {pendingSealed.set.name} · {fmtMoney(sealedRead(pendingSealed).ask)} <span style={{ opacity: 0.8 }}>({agreedPrices.has(pendingSealed._tk) ? 'the price you haggled' : disc > 0 ? 'after your rapport discount' : 'vendor markup'})</span>.
              {(() => { const { mkt } = sealedRead(pendingSealed); return mkt > 0 ? <> Market is <b>{fmtMoney(mkt)}</b>.</> : null })()}
              {pendingSealed._origin === 'vintage' ? ' A sealed vintage gamble.' : ''} Rip it now, or stock it to rip/list/flip later?
            </p>
            {(() => { const { mkt, ask, over } = sealedRead(pendingSealed); return over ? (
              <p style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700, marginTop: -4 }}>
                ⚠️ You're paying {fmtMoney(ask)} for a {fmtMoney(mkt)} product — {Math.round((ask / mkt - 1) * 100)}% over market.
              </p>
            ) : null })()}
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" disabled={cash < sealedRead(pendingSealed).ask} onClick={() => ripSealedNow(pendingSealed)}>
                📦 Rip {(pendingSealed.qty || 1) > 1 ? 'one' : 'it'} here on the floor →
              </button>
              {/* They brought a stack: buy the lot and open ALL of it at the table, one after
                  another. Same volume discount as taking it home sealed. */}
              {(pendingSealed.qty || 1) > 1 && (() => {
                const n = pendingSealed.qty
                const { disc, total } = lotQuote(pendingSealed, n)
                return (
                  <button className="btn gold" disabled={cash < total} onClick={() => ripStackNow(pendingSealed)}
                    title={`Buy all ${n} at ${Math.round(disc * 100)}% off the lot and rip them back-to-back right here`}>
                    🧺 Rip all {n} here — {fmtMoney(total)} <span style={{ opacity: 0.85, fontWeight: 600 }}>({Math.round(disc * 100)}% off)</span>
                  </button>
                )
              })()}
              <button className="btn alt" disabled={cash < sealedRead(pendingSealed).ask} onClick={() => stockSealedNow(pendingSealed)}>
                🗂️ Stock {(pendingSealed.qty || 1) > 1 ? 'one' : 'it'} in your inventory
              </button>
              {(pendingSealed.qty || 1) > 1 && (() => {
                const n = pendingSealed.qty
                const { disc: ldisc, total } = lotQuote(pendingSealed, n)
                return (
                  <button className="btn alt" disabled={cash < total} onClick={() => takeStack(pendingSealed)}
                    title={`Take all ${n} home sealed at ${Math.round(ldisc * 100)}% off the lot`}>
                    🧺 Take all {n} sealed — {fmtMoney(total)}
                  </button>
                )
              })()}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Held sealed rides the market — vintage climbs the longer you hold it. Anything you
              stock here shows up in your <b>🎒 haul</b>, so you can still rip it before you leave.
            </p>
          </div>
        </div>
      )}

      {pendingBuy && (
        <div className="modalbg" style={{ zIndex: 20 }} onClick={() => setPendingBuy(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <button className="modal-close" aria-label="Close" onClick={() => setPendingBuy(null)}>✕</button>
            <h3 style={{ marginTop: 0 }}>Bought {pendingBuy.card.name}</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              for {fmtMoney(pendingBuy.price)} · market {fmtMoney(cardValue(pendingBuy.card))}.
              What do you want to do with it?
            </p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              {/* Listing at your booth needs a booth at THIS show. Without the 🎪 Vendor Setup
                  upgrade you can only attend to shop, so there's no table to list on — disable it. */}
              <button className={`btn ${asVendor ? 'gold' : 'alt'}`} disabled={!asVendor}
                title={asVendor ? undefined : "You're not running a booth at this show — attend as a vendor (needs the 🎪 Vendor Setup upgrade) to sell cards at your own table."}
                onClick={() => commitBuy(true)}>
                🪧 List it at your booth — sell it here
              </button>
              <button className={`btn ${asVendor ? 'alt' : 'gold'}`} onClick={() => commitBuy(false)}>
                🗂️ Keep it in your collection
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              {asVendor
                ? 'Listed cards are offered to shoppers at your table; unsold ones come home when you leave.'
                : "You're here to shop, not vend — it goes to your collection. Run a booth (🎪 Vendor Setup) to flip buys at your own table."}
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
        <TradePanel booth={booth} seedCard={tradeFor.card} seedSealed={tradeFor.sealed} boothCards={stock} boothSealed={sealed}
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
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
          <h3 style={{ marginTop: 0 }}>📦 {packName}</h3>
          <div className="vendoritem featured" style={{ maxWidth: 200, margin: '0 auto' }}>
            {set?.logo && <img src={set.logo} alt={set?.name || ''} style={{ height: 44, objectFit: 'contain', alignSelf: 'center' }} />}
            <div style={{ fontSize: 30 }}>{sealed.product.icon || '📦'}</div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{sealed.product.type}</div>
            <div className="muted" style={{ fontSize: 11 }}>{set?.name}</div>
            <div style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtMoney(val)}</div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Sealed product inside! It's stocked in <b>Inventory → 📦 Sealed</b> — rip, list, or flip it.
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
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h3 style={{ marginTop: 0 }}>{hit ? '🎉 ' : '❓ '}{packName}</h3>
        <div className="vendoritem featured" style={{ '--rarity': edge, maxWidth: 200, margin: '0 auto' }}>
          <img src={cardImg(card)} alt={card.name} style={{ width: '100%', borderRadius: 8 }} />
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
function TradePanel({ booth, seedCard, seedSealed, boothCards, boothSealed, collection, sealedInventory, eff, onTrade, onClose }) {
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
  // Tapping "Trade" on a sealed item seeds its line at 1 on the get side (mirror of seedCard).
  const [getSealQty, setGetSealQty] = useState(() => seedSealed
    ? { [`${sealedSku(seedSealed.set?.id, seedSealed.product)}|${eff(seedSealed._ask).toFixed(2)}`]: 1 } : {})
  const bump = (setter, key, delta, max) => setter(prev => {
    const n = Math.max(0, Math.min(max, (prev[key] || 0) + delta))
    const next = { ...prev }
    if (n > 0) next[key] = n; else delete next[key]
    return next
  })

  const total = (lines, qmap) => lines.reduce((a, g) => a + g.unit * (qmap[g.key] || 0), 0)
  const countOf = (qmap) => Object.values(qmap).reduce((a, n) => a + n, 0)
  // --- The trade-vs-cash split ------------------------------------------------------------
  // Your side earns the TRADE rate only against what you're actually taking; any overflow
  // comes back as cash at the (lower) buy rate. Without the split, loading your side and
  // taking one cheap card would launder your whole collection to cash at the trade rate.
  // The HOT trade rate applies when most (by value) of what you take is their sealed —
  // dealers sweeten swaps that move their own product.
  const tradeMult = Math.max(buyMult, booth.tradeMult || buyMult)
  const tradeMultHot = Math.max(tradeMult, booth.tradeMultHot || tradeMult)
  const yourMarket = total(mineCardLines, giveQty) + total(mineSealedLines, giveSealQty)
  const theirVal = round2(total(theirCardLines, getQty) + total(theirSealedLines, getSealQty))
  const theirSealedVal = total(theirSealedLines, getSealQty)
  const hot = theirVal > 0 && theirSealedVal / theirVal >= 0.5
  const effTrade = hot ? tradeMultHot : tradeMult
  const credit = round2(Math.min(theirVal, yourMarket * effTrade))
  const cashBack = round2(Math.max(0, (yourMarket - credit / effTrade) * buyMult))
  const yourVal = round2(credit + cashBack) // what your side nets in this deal (credit + cash)
  const cashDelta = round2(theirVal - credit - cashBack) // >0 you add cash; <0 they add cash
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
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h3 style={{ marginTop: 0 }}>🔁 Build a trade with {booth.name}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          One line per SKU — duplicates stack, tap a line (or +) to add copies. They credit your side
          at <b>{Math.round(effTrade * 100)}% of market in trade</b>{hot ? ' (sweetened — you\'re taking their sealed off their hands)' : ''} up
          to what you take; anything beyond comes back as cash at their {Math.round(buyMult * 100)}% buy rate.
        </p>

        <div className="trade-summary">
          <div className="row" style={{ justifyContent: 'center', gap: 18, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11 }}>You give ({nGive})</div>
              <b>{fmtMoney(yourVal)}</b>
              <div className="muted" style={{ fontSize: 11 }}>at {Math.round(effTrade * 100)}% in trade{cashBack > 0 ? ` (${fmtMoney(cashBack)} of it cash-out at ${Math.round(buyMult * 100)}%)` : ''}</div>
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
                  sub={`${fmtMoney(round2(g.unit * effTrade))} trade-in each${g.count > 1 ? ` · have ${g.count}` : ''}`}
                  count={g.count} qty={giveSealQty[g.key] || 0}
                  onAdd={() => bump(setGiveSealQty, g.key, +1, g.count)}
                  onSub={() => bump(setGiveSealQty, g.key, -1, g.count)} />
              ))}
              {mineCardLines.slice(0, MAX_LINES).map(g => (
                <QtyLine key={g.key}
                  thumb={<img className="tl-thumb" src={cardImg(g.first)} alt="" loading="lazy" />}
                  name={`${g.first.foil ? `${g.first.foil.badge} ` : g.first.reverse ? '✨ ' : ''}${g.first.name}`}
                  sub={`${skuBadge(g.first)} · ${fmtMoney(round2(g.unit * effTrade))} trade-in each${g.count > 1 ? ` · have ${g.count}` : ''}`}
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
                  thumb={<img className="tl-thumb" src={cardImg(g.first)} alt="" loading="lazy" />}
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

