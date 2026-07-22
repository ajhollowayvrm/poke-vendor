import { useEffect, useMemo, useRef, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney, packPrice,
  DISTRIBUTORS, RAPPORT_LEVELS, distributorById, distributorCatalog, distributorPrice, distributorCasePrice,
  distributorDiscount, distributorUnlocked, rapportLevel, nextRapport, stockState, daysToRestock, caseLot, round2,
  VINTAGE_SETS, vintageProduct, sealedValue, setById, warmPricesOnBoot, distributorVintageFind } from './game/engine'
import { Modal } from './ui/Modal'
import { useGame } from './game/store'
import { netWorthFull, vintageLeft } from './game/store/helpers'
import { weekIndexOf, weekdayOf, absoluteDay, CREDIT_MONTHLY_RATE } from './game/store/constants'
import { startAutoSync } from './game/cloudSave'
import { encounterStillValid } from './game/shows'
import PackOpening from './components/PackOpening'
import Collection from './components/Collection'
import CardModal from './components/CardModal'
import Bench from './components/Bench'
import Stats from './components/Stats'
import Calendar from './components/Calendar'
import ShowFloor from './components/ShowFloor'
import UpgradeShop from './components/UpgradeShop'
import BoothInbox from './components/BoothInbox'
import Settings from './components/Settings'
import PriceGuide from './components/PriceGuide'
import SealedInventory from './components/SealedInventory'
import ShowPrep from './components/ShowPrep'
import Livestream from './components/Livestream'
import Binder from './components/Binder'
import Regulars from './components/Regulars'
import StoreStock from './components/StoreStock'
import GradeReveal from './components/GradeReveal'
import { DialogHost, ToastHost, toast } from './ui/dialog'
import { configureFeedback } from './game/feedback'
import { AnimatedNumber, CashFlash } from './ui/AnimatedNumber'
import { NotorietyBar } from './components/Calendar'
import { SHOW_TIERS } from './game/shows'
import { milestoneById } from './game/milestones'

// Primary nav: the core loop + Stats (your money/standing matters more than the upgrade
// shop, so Stats gets a top slot and Upgrades moves behind the ⚙️ gear). Reference/meta
// screens (Grader, Prices) live as sub-tabs inside Collection; Settings + Upgrades live
// behind the gear in the top bar.
const TABS = ['shop', 'myshop', 'stream', 'shows', 'stats', 'collection']
const TAB_LABEL = { shop: 'Buy', myshop: 'Store', stream: 'Stream', shows: 'Shows', stats: 'Stats', collection: 'Inventory' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { shop: '🛒', myshop: '🏬', stream: '🔴', shows: '🎪', stats: '📊', collection: '🗂️' }

// The price to re-acquire a product RIGHT NOW (for "Rip another"). Vintage sealed
// appreciates, so it must charge current market via sealedValue — not the price frozen
// at the original buy (`_buyPrice`), which would let you keep buying fresh vintage at a
// stale, cheaper price after the market climbed. Modern product reuses its genuine
// retail/wholesale/case price.
function liveProductPrice(set, product) {
  if (product?.vintage) return sealedValue({ product, setId: set.id })
  return product?._buyPrice ?? product?.price ?? packPrice(set)
}

// The 📦 Inventory items that ARE this product (same set + same type — price and
// provenance vary by where a copy came from, but it's the same thing to rip).
// "Rip another" consumes these before it ever re-buys: you already paid for them.
function heldMatches(state, set, product) {
  return (state.sealedInventory || []).filter(i => i.setId === set?.id && i.product?.type === product?.type)
}

// Can you actually GET another one of these right now? "Rip another" used to ask only "can
// you afford it?", so it stayed lit when your own stock was empty AND nobody had one left to
// sell — the click then bounced off an error toast. This answers the real question, and the
// button now mirrors it exactly:
//   • hold one → yes, and it's free (you already paid for it).
//   • a distributor's product (`_distId`) → only while THEY still have one on the shelf.
//   • vintage → only from that vendor's live weekly find, and only while it's still the same
//     set. Vintage picked up anywhere else (a show, a trade, a DM deal) has no shelf to go
//     back to — it's out of print, so when your stock is gone, it's gone.
//   • anything else with no shop behind it → nowhere to buy a replacement, so no re-rip.
// Returns { held, price, ok, soldOut, broke } — `soldOut` and `broke` drive the button's
// explanation, so a dead button always says WHY it's dead.
function ripAvailability(state, set, product) {
  const held = heldMatches(state, set, product).length
  const price = liveProductPrice(set, product)
  if (held > 0) return { held, price, ok: true, soldOut: false, broke: false }

  let inStock
  if (product?.vintage) {
    inStock = vintageLeft(state, product._distId, set?.id) > 0
  } else if (product?._distId) {
    const dist = distributorById(product._distId)
    const rec = state.distributors?.[product._distId] || { spend: 0, stock: {} }
    inStock = !stockState(dist, rec.stock, set, product, rapportLevel(rec.spend).level).out
  } else {
    inStock = false // no vendor attached — nothing to re-buy from
  }
  const broke = state.cash < price
  return { held, price, ok: inStock && !broke, soldOut: !inStock, broke }
}

export default function App() {
  const [tab, setTab] = useState('shop')
  const [collTab, setCollTab] = useState('cards') // Cards sub-tab: cards | sealed | binder | grader | regulars | prices
  const [settingsPane, setSettingsPane] = useState('settings') // gear sub-pane: settings | upgrades
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  // Where to land when a rip finishes. A rip you START from your collection/store/inbox
  // (via ripFromInventory) should drop you back THERE on Done — not on the Buy tab where the
  // overlay lives. Captured as the tab you launched from; a "Rip another" chain keeps it.
  const [ripReturn, setRipReturn] = useState(null)
  const [picked, setPicked] = useState(null)     // card for modal
  const [preppingShow, setPreppingShow] = useState(null) // show selected; on the prep screen (pick cards/sealed/cash, review who's expecting you)
  const [prepMode, setPrepMode] = useState('shop')       // 'shop' (attend to buy) | 'vendor' (run a booth) — every show goes through prep now
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  // Total net worth: cash + market value of every asset you hold (collection, listings,
  // sealed, cards at the grader, etc.). Shown next to cash so moving value around (grading,
  // buying sealed, listing) doesn't read as your money vanishing/appearing — only real
  // income/spend moves it. Recomputed on any state change; returns a number so it only
  // re-renders the header when the figure actually changes.
  const worth = useGame(s => netWorthFull(s))
  // Whether another copy of the in-progress rip's product can be had at all — from your own
  // 📦 Inventory (free) or, failing that, off the shelf of the vendor it came from. Drives the
  // "Rip another" label AND its gate, so the button is only ever lit when the click will work.
  // Subscribed as separate primitives: a fresh object each render would re-render the app on
  // every unrelated store change.
  const ripStock = useGame(s => ripping ? heldMatches(s, ripping.set, ripping.product).length : 0)
  const ripCanGet = useGame(s => ripping ? ripAvailability(s, ripping.set, ripping.product).ok : false)
  const ripSoldOut = useGame(s => ripping ? ripAvailability(s, ripping.set, ripping.product).soldOut : false)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  const sealedCount = useGame(s => s.sealedInventory.length)
  const regularsCount = useGame(s => (s.regulars || []).filter(r => !r.flags?.burned).length)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  // With a storefront your stock splits into Shop Floor / Storeroom (on the 🏬 Store tab) and
  // the Cards tab becomes your PERSONAL collection. A pre-store flipper keeps the flat "All"
  // cards view + Sealed + Regulars here — the three-inventory world is a storefront feature.
  // Personal keepsakes split into their own Cards / Sealed sub-tabs, so each carries its own badge.
  const personalCardCount = useGame(s => (s.collection || []).filter(c => c.locked).length)
  const personalSealedCount = useGame(s => (s.sealedInventory || []).filter(it => it.locked).length)
  // only count orders still valid (card not since sold) so the tab badge matches the list
  const inboxCount = useGame(s => s.boothInbox.filter(e => encounterStillValid(e, s.collection, s.listings, s.shopDisplay)).length)
  const offerCount = useGame(s => s.listings.filter(l => (l.offers?.length || 0) > 0).length)
  const notoriety = useGame(s => s.notoriety)
  const streamLive = useGame(s => !!s.streamEscrow) // ON AIR — locks tab nav + Next Day
  const [daySummary, setDaySummary] = useState(null) // per-day summary popup after Next Day
  const [gradeReveal, setGradeReveal] = useState(null) // { cards, summary } — click-to-reveal slabs back from grading

  // Lock body scroll while a rip overlay is visible (ripping + on the Buy tab).
  // The overlay itself still scrolls internally (overflow-y:auto). Unlocks on cleanup.
  useEffect(() => {
    if (ripping && tab === 'shop') {
      document.body.classList.add('rip-lock')
      return () => document.body.classList.remove('rip-lock')
    }
    document.body.classList.remove('rip-lock')
  }, [ripping, tab])

  // Publish the top bar's live height as --topbar-h. The bar is sticky and opaque; the
  // fixed rip overlay (and anything else that must clear it) can't otherwise know how
  // tall it is — and it's now variable, since on a narrow/half-width desktop window the
  // tab strip (and, narrower still, the figures) wrap onto extra rows. A stale fixed
  // guess let the taller bar paint over the top of the rip screen's controls.
  const topbarRef = useRef(null)
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const setVar = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    setVar()
    const ro = new ResizeObserver(setVar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // If the page was reloaded while a show was open, the floor view (React state) is
  // gone but show-inventory cards AND sealed may still be stranded on the table — bring
  // them home. (Sealed matters too: a sealed-only booth used to strand showSealed forever.)
  // A show cash wallet (showReserve = the cash you left at home) also settles here: endShow
  // folds it back into spendable cash, so a shopper who brought only cash — no cards/sealed —
  // never has that reserve stranded after a mid-show reload.
  // Same for a livestream that died mid-broadcast: settle its escrow (product back or
  // cracked into the collection, pre-paid spot cash refunded, the day still spent).
  // Also kick off cloud auto-sync (no-ops unless the AWS backend is configured + signed in).
  useEffect(() => {
    const g = useGame.getState()
    if ((g.showInventory || []).length || (g.showSealed || []).length || (g.showReserve || 0) > 0) g.endShow()
    if (g.streamEscrow) {
      const r = g.settleAbandonedStream()
      if (r) toast(`⚠️ Your last stream cut out mid-broadcast — ${[
        r.returned ? `${r.returned} product${r.returned > 1 ? 's' : ''} returned to 📦` : '',
        r.ripped ? `${r.ripped} pack${r.ripped > 1 ? 's' : ''} cracked into your collection` : '',
        r.refund ? `${fmtMoney(r.refund)} refunded to spot buyers` : '',
      ].filter(Boolean).join(', ') || 'settled'}. The day was still spent.`, 7000)
    }
    startAutoSync()
    warmPricesOnBoot().catch(() => {}) // re-apply the last price snapshot (and freshen if stale)
  }, [])

  // Keep the audio/haptics engine in sync with the settings, at boot AND when toggled —
  // feedback defaults ON and only PackOpening synced it before, so GradeReveal/stream sfx
  // could fire with sound turned off until a rip mounted. This effect covers both cases.
  const soundOn = useGame(s => s.settings?.sound ?? true)
  const hapticsOn = useGame(s => s.settings?.haptics ?? true)
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])

  function handleNextDay() {
    const summary = useGame.getState().nextDay()
    if (!summary) return
    // Slabs back from grading get their own click-to-reveal moment FIRST, then the recap.
    if (summary.resolvedGradeCards?.length) setGradeReveal({ cards: summary.resolvedGradeCards, summary })
    else setDaySummary(summary)
  }

  // Announce freshly-unlocked milestones as toasts. The store queues unlock ids in
  // pendingMilestones from wherever they trigger (rips, day-tick, encounters, streams);
  // we drain the queue here so the notification is decoupled from what caused it.
  const pendingMilestones = useGame(s => s.pendingMilestones)
  useEffect(() => {
    if (!pendingMilestones?.length) return
    for (const id of pendingMilestones) {
      const mst = milestoneById(id)
      if (mst) toast(`🏅 Milestone unlocked — ${mst.icon} ${mst.name}: ${mst.desc}${mst.noto ? ` (+${mst.noto}★)` : ''}${mst.cash ? ` (+${fmtMoney(mst.cash)})` : ''}`, 4500)
    }
    useGame.getState().clearPendingMilestones()
  }, [pendingMilestones])

  // Buying STOCKS sealed product into your inventory (hold-first) — you rip, list, or flip
  // it later from the 📦 Inventory tab. Only the dedicated "Rip on buy" setting bypasses
  // that to rip immediately (the old instant-rip behaviour); the "Auto-rip" pacing toggle
  // does NOT, so turning on auto-advance no longer silently skips the inventory.
  function buyProduct(distId, set, product, qty = 1, opts = {}) {
    // The Buy UI passes `_buyPrice` = the actual charged price (the distributor's price
    // at your rapport, a case lot, or a clearance lot), so shown == charged.
    const price = product._buyPrice ?? product.price
    const onCredit = !!opts.onCredit
    const split = !!opts.split // 🔀 cash first, credit for the remainder
    // Credit buys ride the distributor line; a split needs cash + open credit to cover the
    // (single-unit) charge, and the credit leg (if any) needs a non-frozen line.
    if (split) {
      const avail = useGame.getState().creditAvailable()
      if (cash + 1e-9 < price) { // cash alone won't cover it — the rest must ride the line
        if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen — pay it down first (💳 panel on the Buy tab).')
        if (cash + avail + 1e-9 < price) return toast(`Not enough cash + credit for ${product.type}. Pay down your balance or bring more cash.`)
      }
    } else if (onCredit) {
      if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen — pay it down first (💳 panel on the Buy tab).')
      if (useGame.getState().creditAvailable() + 1e-9 < price) return toast(`Not enough credit available for ${product.type}. Pay down your balance or buy with cash.`)
    } else if (cash < price) return toast(`Not enough cash for ${product.type}.`)
    // How the charge broke down, for the toast: cash-first, credit covers any shortfall.
    const splitNote = (cp, xp) => xp > 0 ? ` — ${fmtMoney(cp)} cash + ${fmtMoney(xp)} credit 💳` : ''
    const n = Math.max(1, Math.floor(qty))
    if (n > 1) {
      // Bulk buy: stock N at once into inventory (a stocking action — ignores Rip-on-buy).
      const res = useGame.getState().buyFromDistributorBulk(distId, set, product, price, n, { onCredit, split })
      if (!res) return toast(`${distributorById(distId)?.name || 'They'} can't fill that order right now.`)
      const short = res.bought < n ? ` (only ${res.bought} were available)` : ''
      const pay = onCredit ? ' on credit 💳' : split ? splitNote(res.cashPart, res.creditPart) : ''
      return toast(`Stocked ${res.bought}× ${product.type} of ${set.name} for ${fmtMoney(res.spent)}${pay}${short} — in Inventory → 📦 Sealed.`)
    }
    const item = useGame.getState().buyFromDistributor(distId, set, product, price, { onCredit, split })
    if (!item) return toast(`${distributorById(distId)?.name || 'They'} are out of ${product.type} — check back after it restocks.`)
    if (useGame.getState().settings.ripOnBuy) { ripFromInventory(item.uid); return }
    const cashPart = Math.min(cash, price), creditPart = round2(price - cashPart)
    const pay = onCredit ? ' on credit 💳' : split ? splitNote(cashPart, creditPart) : ''
    toast(`Stocked ${product.type} of ${set.name}${pay} — it's in your ${hasStore ? '🏬 Store → 📦 Storeroom' : 'Inventory → 📦 Sealed'}: rip, list, or flip it whenever.`)
  }

  // Rip a held product from inventory: remove it (no re-charge — already paid) and run
  // the same rip flow as before. A single pack or "one at a time" mode opens the animated
  // overlay; a whole box otherwise rips instantly straight into the collection.
  function ripFromInventory(uid) {
    const item = useGame.getState().ripSealed(uid)
    if (!item) return
    const set = setById(item.setId)
    const product = item.product
    if (!set) return toast('That set is no longer available.')
    const oneByOne = useGame.getState().settings.openSealedOneByOne
    const animated = product.packs === 1 || oneByOne
    if (animated) {
      setRipReturn(tab)     // came from Cards/Store/Inbox → Done should return you here
      setRipping({ set, product })
      setTab('shop')
      return
    }
    const all = openProduct(set, product)
    all.forEach(c => (c._isHit = isHit(c)))
    addPulls(all, `${product.type} · ${set.name}`, product.packs) // counts packs + rip goal
    const hits = all.filter(c => c._isHit || c.foil).length
    setTab('collection')
    toast(`Ripped a ${product.type} of ${set.name} — ${all.length} cards, ${hits} hit${hits===1?'':'s'}! Check your collection.`)
  }

  // Close the rip overlay. If the rip was launched from your collection/store/inbox, land
  // back on that tab (ripReturn) instead of leaving you on Buy where the overlay lived.
  function exitRip() {
    setRipping(null)
    if (ripReturn) { selectTab(ripReturn); setRipReturn(null) }
  }

  // Buy a vintage FIND (or a reserved rapport hold) off a distributor — stocks it to hold
  // (vintage appreciates), builds rapport with them, and clears the hold if it was reserved.
  function buyDistVintage(distId, find, opts = {}) {
    const onCredit = !!opts.onCredit
    const split = !!opts.split // 🔀 cash first, credit for the remainder
    // Vintage sealed can ride the distributor credit line too (the panel promises "buy sealed
    // on credit"), so gate on the line when credit is on, on cash+credit for a split, otherwise
    // on cash — mirrors buyProduct.
    if (split) {
      if (cash + 1e-9 < find.price) {
        if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen — pay it down first (💳 panel on the Buy tab).')
        if (cash + useGame.getState().creditAvailable() + 1e-9 < find.price) return toast(`Not enough cash + credit for the ${find.setName} pack.`)
      }
    } else if (onCredit) {
      if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen — pay it down first (💳 panel on the Buy tab).')
      if (useGame.getState().creditAvailable() + 1e-9 < find.price) return toast(`Not enough credit available for the ${find.setName} pack. Pay down your balance or buy with cash.`)
    } else if (cash < find.price) return toast(`Not enough cash for the ${find.setName} pack (${fmtMoney(find.price)}).`)
    const item = useGame.getState().buyDistributorVintage(distId, find.setId, find.product, find.price, { ...opts, onCredit, split })
    // The weekly find is finite — refuses once their shelf is bare (say the buy raced a click).
    if (!item) return toast(`${distributorById(distId)?.name || 'They'} have no more sealed ${find.setName} — it's out of print. A fresh find turns up next week.`)
    const cashPart = Math.min(cash, find.price), creditPart = round2(find.price - cashPart)
    const pay = onCredit ? ' on credit 💳' : (split && creditPart > 0) ? ` — ${fmtMoney(cashPart)} cash + ${fmtMoney(creditPart)} credit 💳` : ''
    toast(`Stocked a sealed ${find.setName} pack for ${fmtMoney(find.price)}${pay}${opts.fromHold ? ' (they held it for you)' : ''} — it's in Inventory → 📦 Sealed.`)
  }

  // "Rip another" from the end-of-rip summary: keep chasing without going back to the
  // shop. It reconciles with 📦 Inventory first — holding more of the SAME product
  // means the next rip comes from YOUR stock (already paid; no charge). Only when
  // you're out does it re-buy, and a re-buy must come from a REAL shelf: a distributor
  // product (`_distId`) re-buys through that distributor so its STOCK and your RAPPORT
  // stay honest, and vintage re-buys off that vendor's finite weekly find. Both are
  // stocked then immediately pulled back out to rip (no double-charge). A product with
  // no vendor behind it can't be re-bought at all — there's nowhere to buy it from.
  // ripAvailability() gates the button on exactly these rules, so the toasts here are
  // the backstop for a click that raced a state change, not the everyday path.
  function ripAnother(set, product) {
    const held = heldMatches(useGame.getState(), set, product)[0]
    if (held) {
      useGame.getState().ripSealed(held.uid)
      setRipping(r => ({ set, product: held.product, nonce: (r?.nonce ?? 0) + 1 }))
      setTab('shop')
      return
    }
    const price = liveProductPrice(set, product)
    if (cash < price) return toast(`Not enough cash to rip another ${product?.type || 'pack'}.`)

    // Pull one more off a shelf, then rip it. Returns the freshly stocked item, or null if
    // that shelf is bare — vintage and modern differ only in WHICH shelf they come from.
    const restock = () => product.vintage
      ? useGame.getState().buyDistributorVintage(product._distId, set.id, product, price)
      : useGame.getState().buyFromDistributor(product._distId, set, product, price)

    if (!product._distId) {
      return toast(`No shop stocks that ${product?.type || 'pack'} — you'd have to find another one out in the wild.`)
    }
    const who = distributorById(product._distId)?.name || 'They'
    const item = restock()
    if (!item) {
      return toast(product.vintage
        ? `${who} have no more sealed ${set.name} — it's out of print. A fresh find turns up next week.`
        : `${who} are out of ${product.type} — can't rip another right now.`)
    }
    useGame.getState().ripSealed(item.uid) // pull it straight back out to rip; already paid
    setRipping(r => ({ set, product, nonce: (r?.nonce ?? 0) + 1 }))
    setTab('shop')
  }

  // Attend a show in one of two modes — BOTH now open the same prep screen first (pick the
  // cards/sealed to bring, choose how much cash to bring, and review who's expecting you):
  //   'shop'   — pay the entry fee, walk the floor to BUY. No booth.
  //   'vendor' — entry + vendorFee, run a BOOTH to sell. Needs the 🎪 Vendor Setup upgrade.
  // No money/days are spent until you confirm on the prep screen.
  function attendShow(show, mode = 'shop') {
    const tier = SHOW_TIERS[show.tierKey]
    if (mode === 'vendor') {
      if (!useGame.getState().upgrades.vendorSetup) return toast('You need the 🎪 Vendor Setup upgrade to run a booth. Buy it from Upgrades.')
      // 📣 Sponsorship: booth fees are on the sponsor tab — you pay entry only.
      const cost = tier.entryFee + (useGame.getState().upgrades.sponsorship ? 0 : (tier.vendorFee || 0))
      if (useGame.getState().cash < cost) return toast(`Not enough cash for the vendor fee (${'$'+cost}).`)
    } else if (useGame.getState().cash < tier.entryFee) {
      return toast('Not enough cash for the entry fee.')
    }
    setPrepMode(mode)
    setPreppingShow(show) // prep screen: pick stock + cash to bring, review appointments
  }

  // Enter a show as a SHOPPER (confirmed from prep): charge the entry fee, bring any picked
  // cards/sealed to sell/trade on the floor, set your floor cash wallet, then walk in.
  function enterAsShopper(show, payload = {}) {
    const { cardUids, sealedUids, budget, arrival = 'open' } = payload
    const tier = SHOW_TIERS[show.tierKey]
    if (!spend(tier.entryFee)) { setPreppingShow(null); return toast('Not enough cash for the entry fee.') }
    const effDays = Math.max(1, tier.days - (useGame.getState().upgrades.tourVan ? 1 : 0)) // 🚐 the van shaves a day
    useGame.getState().bringToShow(cardUids || [], sealedUids || []) // may be empty — you're mainly here to buy
    useGame.getState().log('show', `Attended ${show.name} as a shopper (${effDays}d, ${arrival === 'late' ? 'arrived late' : 'at open'})`, -tier.entryFee)
    // Claim any pre-show leads for this show (vendor holds + buyer appointments) BEFORE
    // the days advance — the floor works off this copy (state leads expire with the calendar).
    const _leads = useGame.getState().claimShowLeads(show.id)
    // The trip's days pass now (at entry); stash the recap to show when you leave the floor.
    const summary = useGame.getState().attendShowDays(show.day, effDays)
    // Wallet LAST — after entry fee + the days' overhead settle against full cash, stash the
    // rest at home so `cash` on the floor is exactly what you chose to bring.
    if (budget != null) useGame.getState().beginShowWallet(budget)
    setPreppingShow(null)
    setActiveShow({ ...show, _asVendor: false, _arrival: arrival, _summary: summary, _leads })
  }

  // Confirmed from the prep screen (VENDOR mode): charge entry + vendor fee (+ booth-spot
  // fee), move the picked cards onto your booth, advance the calendar past the show, enter
  // as a vendor. `opts` carries the booth spot (traffic mult + fee), arrival, and cash budget.
  function enterShow(show, payload = {}) {
    const { cardUids, sealedUids, budget, ...opts } = payload
    const tier = SHOW_TIERS[show.tierKey]
    const sponsored = !!useGame.getState().upgrades.sponsorship // 📣 booth + spot fees on the sponsor tab
    const spotFee = sponsored ? 0 : (opts.spotFee || 0)
    const cost = tier.entryFee + (sponsored ? 0 : (tier.vendorFee || 0)) + spotFee
    if (!spend(cost)) { setPreppingShow(null); return toast(`Not enough cash for the vendor fee (${'$'+cost}).`) }
    const effDays = Math.max(1, tier.days - (useGame.getState().upgrades.tourVan ? 1 : 0)) // 🚐 the van shaves a day
    useGame.getState().bringToShow(cardUids || [], sealedUids || [])
    const spotNote = spotFee ? ` + ${opts.spotLabel} $${spotFee}` : ''
    useGame.getState().log('show', `Vended at ${show.name} (${effDays}d · entry $${tier.entryFee}${sponsored ? ' · booth sponsored 📣' : ` + booth $${tier.vendorFee}${spotNote}`})`, -cost)
    // Claim any pre-show leads for this show (vendor holds + buyer appointments) BEFORE
    // the days advance — the floor works off this copy (state leads expire with the calendar).
    const _leads = useGame.getState().claimShowLeads(show.id)
    // The trip's days pass now (at entry); stash the recap to show when you leave the floor.
    const summary = useGame.getState().attendShowDays(show.day, effDays)
    if (budget != null) useGame.getState().beginShowWallet(budget) // wallet last (see enterAsShopper)
    setPreppingShow(null)
    setActiveShow({ ...show, _asVendor: true, _boothMult: opts.spotMult || 1, _spotLabel: opts.spotLabel || 'Standard table', _arrival: opts.arrival || 'open', _summary: summary, _leads })
  }

  // Leaving the show: unsold show-inventory cards come back home, then exit the floor.
  // Surface the trip recap (days away, rent/lease paid, orders missed, grades back) that we
  // stashed when the days passed at entry — most useful after a multi-day show.
  function leaveShow(floor) {
    const trip = activeShow?._summary
    const name = activeShow?.name
    useGame.getState().endShow()
    setActiveShow(null)
    // Always show a recap on leave (even a quiet 1-day show), now that the floor recap
    // gives it content: what you spent/earned/gained on the floor, folded in with the
    // days-away home summary.
    const s = { ...(trip || {}), showName: name, floor }
    if (trip?.resolvedGradeCards?.length) setGradeReveal({ cards: trip.resolvedGradeCards, summary: s })
    else setDaySummary(s)
  }

  // Switch tabs. A rip in progress is NOT discarded — its component stays mounted as an
  // overlay (just hidden off the Buy tab), so leaving and coming back resumes exactly where
  // you were (same pack, running tally, unopened packs intact) instead of losing the rip.
  // A LIVE STREAM, though, locks the tab: the session lives in the stream component, so
  // navigating away would kill the broadcast mid-rip (the escrow would settle it as an
  // abandoned stream — refunds, off-camera cracks, day spent). End it on purpose instead.
  function selectTab(t) {
    if (streamLive && t !== 'stream') { toast('🔴 You’re live — end the stream before leaving.'); return }
    setTab(t)
  }

  // Prepping for a show: the pick-your-inventory screen takes over the whole view.
  if (preppingShow) {
    return (
      <div className="app">
        <ShowPrep show={preppingShow} mode={prepMode}
          onConfirm={(payload) => (prepMode === 'vendor' ? enterShow : enterAsShopper)(preppingShow, payload)}
          onCancel={() => setPreppingShow(null)} />
        {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
        <DialogHost />
      <ToastHost />
      </div>
    )
  }

  // If attending a show, the floor takes over the whole view.
  if (activeShow) {
    return (
      <div className="app">
        <ShowFloor show={activeShow} onLeave={leaveShow} />
        {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
        <DialogHost />
      <ToastHost />
      </div>
    )
  }

  return (
    <div className="app">
      <div className={`topbar ${ripping && tab === 'shop' ? 'rip-hide' : ''}`} ref={topbarRef}>
        <div className="brand">Poké<b>Vendor</b></div>
        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => selectTab(t)}>
              {TAB_LABEL[t]}
              {t === 'myshop' && (inboxCount + offerCount) ? ` (${inboxCount + offerCount})` : ''}
              {t === 'collection' && pendingCount ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          <GameClock />
          <button className="btn next-day-btn" disabled={!!activeShow || streamLive}
            title={activeShow ? 'Cannot advance while attending a show' : streamLive ? 'You’re live — end the stream first (it consumes the day itself)' : 'Advance one day'} onClick={handleNextDay}>
            Next Day →
          </button>
          <span className="noto-chip">⭐ <AnimatedNumber value={notoriety} format={(n) => Math.round(n)} /><small>notoriety</small></span>
          <div className="cash" title="Cash on hand — spendable money right now"><AnimatedNumber value={cash} format={fmtMoney} /><small>cash on hand</small><CashFlash value={cash} /></div>
          <div className="worth" title="Net worth — cash + market value of everything you own (collection, listings, sealed, cards at the grader). Moving value around (grading, buying, listing) doesn't change it; only real income or spending does."><AnimatedNumber value={worth} format={fmtMoney} /><small>net worth</small></div>
          <button className={`gear-btn ${tab === 'settings' ? 'active' : ''}`} aria-label="Settings & Stats" title="Settings & Stats" onClick={() => selectTab('settings')}>⚙️</button>
        </div>
      </div>

      {gradeReveal && (
        <GradeReveal cards={gradeReveal.cards} onDone={() => {
          const s = gradeReveal.summary
          setGradeReveal(null)
          if (s) setDaySummary(s)
        }} />
      )}
      {daySummary && <DaySummary summary={daySummary} onClose={() => setDaySummary(null)} />}
      <GameOver />

      {/* A rip is mid-flight but you've stepped away to another tab — a tap brings you back. */}
      {ripping && tab !== 'shop' && (
        <button className="rip-resume-banner" onClick={() => selectTab('shop')}>
          📦 Rip in progress — tap to resume
        </button>
      )}

      {/* the active view fills the space between the top bar and the bottom nav,
          so short pages (empty collection, settings) don't leave dead space */}
      <main className="content">
        {tab === 'shop' && (
          <div className="pane"><Shop cash={cash} onBuy={buyProduct} onBuyVintage={buyDistVintage} /></div>
        )}

        {tab === 'shows' && <div className="pane"><Calendar onAttend={attendShow} /></div>}
        {tab === 'myshop' && <div className="pane"><BoothInbox onRip={ripFromInventory} onPick={setPicked} /></div>}
        {tab === 'stream' && <div className="pane"><Livestream /></div>}
        {tab === 'stats' && <div className="pane"><Stats /></div>}

        {tab === 'collection' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${collTab === 'cards' ? 'active' : ''}`} onClick={() => setCollTab('cards')}>
                {hasStore ? `🗂️ Personal${personalCardCount ? ` (${personalCardCount})` : ''}` : '🗂️ All'}
              </button>
              <button className={`subtab ${collTab === 'sealed' ? 'active' : ''}`} onClick={() => setCollTab('sealed')}>
                📦 Sealed{(hasStore ? personalSealedCount : sealedCount) ? ` (${hasStore ? personalSealedCount : sealedCount})` : ''}
              </button>
              <button className={`subtab ${collTab === 'binder' ? 'active' : ''}`} onClick={() => setCollTab('binder')}>📒 Binder</button>
              <button className={`subtab ${collTab === 'grader' ? 'active' : ''}`} onClick={() => setCollTab('grader')}>🔬 Grader{pendingCount ? ` (${pendingCount})` : ''}</button>
              {!hasStore && <button className={`subtab ${collTab === 'regulars' ? 'active' : ''}`} onClick={() => setCollTab('regulars')}>🤝 Regulars{regularsCount ? ` (${regularsCount})` : ''}</button>}
              <button className={`subtab ${collTab === 'prices' ? 'active' : ''}`} onClick={() => setCollTab('prices')}>🏷️ Prices</button>
            </div>
            <div className="pane" key={collTab}>
              {collTab === 'cards' && (hasStore ? <StoreStock place="personal" only="cards" onRip={ripFromInventory} onPick={setPicked} /> : <Collection onPick={setPicked} />)}
              {collTab === 'sealed' && (hasStore ? <StoreStock place="personal" only="sealed" onRip={ripFromInventory} onPick={setPicked} /> : <SealedInventory onRip={ripFromInventory} />)}
              {collTab === 'binder' && <Binder onPick={setPicked} />}
              {collTab === 'grader' && <Bench />}
              {collTab === 'regulars' && !hasStore && <Regulars />}
              {collTab === 'prices' && <PriceGuide />}
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${settingsPane === 'settings' ? 'active' : ''}`} onClick={() => setSettingsPane('settings')}>⚙️ Settings</button>
              <button className={`subtab ${settingsPane === 'upgrades' ? 'active' : ''}`} onClick={() => setSettingsPane('upgrades')}>⬆️ Upgrades</button>
            </div>
            <div className="pane" key={settingsPane}>
              {settingsPane === 'settings' ? <Settings /> : <UpgradeShop />}
            </div>
          </>
        )}
      </main>

      {/* In-progress rip overlay. Mounted whenever a rip is active so its state survives
          tab switches; hidden (not unmounted) when you're off the Buy tab, so leaving and
          returning resumes the same rip rather than discarding it. */}
      {ripping && (
        <div className={`rip-overlay rip-full ${tab === 'shop' ? '' : 'hidden'}`}>
          <PackOpening
            key={ripping.nonce ?? 0}
            set={ripping.set}
            product={ripping.product}
            paused={tab !== 'shop'}
            onExit={exitRip}
            ripAnotherPrice={liveProductPrice(ripping.set, ripping.product)}
            ripAnotherStock={ripStock}
            canRipAnother={ripCanGet}
            ripAnotherSoldOut={ripSoldOut}
            onRipAnother={() => ripAnother(ripping.set, ripping.product)}
          />
        </div>
      )}

      {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
      <DialogHost />
      <ToastHost />

      {/* Mobile-only floating bottom nav (top tab strip is hidden at <=640px).
          Icon + small label; the 5 core tabs + a gear for Settings/Stats. */}
      <nav className="bottomnav" aria-label="Primary">
        {TABS.map(t => {
          const badge = t === 'myshop' ? inboxCount + offerCount : t === 'collection' ? pendingCount : 0
          return (
            <button key={t} className={`bnav-btn ${tab === t ? 'active' : ''}`} onClick={() => selectTab(t)}>
              <span className="bnav-icon">{TAB_ICON[t]}{badge ? <span className="bnav-badge">{badge}</span> : null}</span>
              <span className="bnav-label">{TAB_LABEL[t]}</span>
            </button>
          )
        })}
        <button className={`bnav-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => selectTab('settings')}>
          <span className="bnav-icon">⚙️</span>
          <span className="bnav-label">More</span>
        </button>
      </nav>
    </div>
  )
}

// Simple day display — no countdown, no real-time timer. The weekday is the store's
// heartbeat: walk-in traffic (and the counter) swells Fri–Sun and thins midweek.
function GameClock() {
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  return (
    <span className="clock-chip">
      📅 {weekdayOf(absoluteDay(currentDay, monthsElapsed))} · Day {currentDay}{monthsElapsed ? ` · M${monthsElapsed + 1}` : ''}
    </span>
  )
}

// Per-day summary — shown after clicking "Next Day". A satisfying end-of-day recap: the
// headline net-cash + net-worth, what actually SOLD (with the biggest sale called out),
// how the market moved, new collectors who found you, and the overhead that hit.
function DaySummary({ summary, onClose }) {
  const { cashDelta, added, listingsSold, listingOffers, premiumOffers, wages, rent, lease, payroll, storage,
    resolvedGrades, binderFiled, binderReserved, wantsBrokered, brokerProceeds, offersAccepted, saleProceeds, notoDelta,
    missedOnline, missedWalkin, days, showName,
    soldNames, bigSale, newWants, regularCalls, regularsWon, marketMovers, netWorth, lifeEvents, counterIncome, suppliesIncome, suppliesSold, machineIncome, machineSold, wholesaleIncome, floor } = summary
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const missed = (missedOnline || 0) + (missedWalkin || 0)
  const movers = marketMovers || []
  const sold = soldNames || []
  const events = lifeEvents || []
  const floorActive = floor && (floor.spent || floor.earned || floor.notoGained || floor.acquired || floor.rapport)
  const hasActivity = added || listingsSold || listingOffers || resolvedGrades || binderFiled || binderReserved || wantsBrokered
    || offersAccepted || wages || rent || lease
    || payroll || storage || saleProceeds || notoDelta || missed || movers.length || newWants || regularCalls || regularsWon || events.length || floorActive
  // A show trip recaps the whole time away ("Back from … · N days"); a single Next Day is
  // just the day you entered.
  const multiDay = days > 1
  return (
    <Modal onClose={onClose} className="recap" maxWidth={430} label="Day summary">
      <>
      {/* recap body */}
        <h2 style={{ marginBottom: 2, textAlign: 'center' }}>{showName ? `🎪 Back from ${showName}` : `📅 ${weekdayOf(absoluteDay(currentDay, monthsElapsed))} · Day ${currentDay}`}</h2>
        {multiDay && <div className="muted" style={{ fontSize: 13, marginBottom: 6, textAlign: 'center' }}>{days} days passed</div>}

        {/* Headline: net cash for the day + current net worth */}
        {cashDelta != null && (
          <div className="recap-headline">
            <div>
              <div className="recap-h-label">Net cash</div>
              <div className="recap-h-val" style={{ color: cashDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {cashDelta >= 0 ? '+' : ''}{fmtMoney(cashDelta)}
              </div>
            </div>
            {netWorth != null && (
              <div style={{ textAlign: 'right' }}>
                <div className="recap-h-label">Net worth</div>
                <div className="recap-h-val" style={{ fontSize: 20 }}>{fmtMoney(netWorth)}</div>
              </div>
            )}
          </div>
        )}

        {!hasActivity ? (
          <p className="muted" style={{ marginTop: 4, textAlign: 'center' }}>{multiDay ? 'Nothing stirred while you were away.' : 'A quiet day. Nothing moved.'}</p>
        ) : (
          <div className="recap-body">
            {/* On the floor — what the show itself did (buying, selling, rep), distinct
                from the days-away home activity below. */}
            {floorActive && (
              <div className="recap-sec">
                <div className="recap-sec-h">🎪 On the floor</div>
                {floor.acquired > 0 && <div className="recap-line"><span className="muted">Items picked up</span><b>{floor.acquired}</b></div>}
                {floor.spent > 0 && <div className="recap-line"><span className="muted">Spent buying</span><span style={{ color: 'var(--red)' }}>−{fmtMoney(floor.spent)}</span></div>}
                {floor.earned > 0 && <div className="recap-line"><span className="muted">Earned selling</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(floor.earned)}</b></div>}
                {(floor.earned > 0 || floor.spent > 0) && (
                  <div className="recap-line"><span>Floor net</span>
                    <b style={{ color: floor.earned - floor.spent >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {floor.earned - floor.spent >= 0 ? '+' : ''}{fmtMoney(round2(floor.earned - floor.spent))}</b></div>
                )}
                {floor.notoGained > 0 && <div className="recap-line"><span className="muted">Notoriety gained</span><b style={{ color: 'var(--gold)' }}>+{floor.notoGained}★</b></div>}
                {floor.rapport > 0 && <div className="recap-line"><span className="muted">🤝 Dealt with vendors</span><span className="muted">{fmtMoney(floor.rapport)}</span></div>}
              </div>
            )}
            {/* What sold */}
            {(saleProceeds > 0 || sold.length > 0 || wantsBrokered > 0 || offersAccepted > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">🧾 Sold</div>
                {wantsBrokered > 0 && <div className="recap-line"><span className="muted">💼 Broker filled {wantsBrokered} want{wantsBrokered === 1 ? '' : 's'}</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(brokerProceeds)}</b></div>}
                {offersAccepted > 0 && <div className="recap-line"><span className="muted">📨 Offer desk closed {offersAccepted} deal{offersAccepted === 1 ? '' : 's'}</span></div>}
                {bigSale && <div className="recap-line"><span>Biggest: <b>{bigSale.name}</b></span><b style={{ color: 'var(--green)' }}>+{fmtMoney(bigSale.net)}</b></div>}
                {sold.filter(s => !bigSale || s.name !== bigSale.name || s.net !== bigSale.net).slice(0, 3).map((s, i) => (
                  <div className="recap-line" key={i}><span className="muted">{s.name}</span><span className="muted">+{fmtMoney(s.net)}</span></div>
                ))}
                {counterIncome > 0 && <div className="recap-line"><span className="muted">🏬 Storefront counter (singles & bulk)</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(counterIncome)}</b></div>}
                {suppliesIncome > 0 && <div className="recap-line"><span className="muted">🧢 Supplies & accessories ({suppliesSold} unit{suppliesSold === 1 ? '' : 's'})</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(suppliesIncome)}</b></div>}
                {machineIncome > 0 && <div className="recap-line"><span className="muted">🎰 Pack Machine ({machineSold} pack{machineSold === 1 ? '' : 's'})</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(machineIncome)}</b></div>}
                {wholesaleIncome > 0 && <div className="recap-line"><span className="muted">📦 Wholesale to other shops (your distribution margin)</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(wholesaleIncome)}</b></div>}
                {saleProceeds > 0 && <div className="recap-line"><span className="muted">Total sales income</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(saleProceeds)}</b></div>}
              </div>
            )}

            {/* Market movers */}
            {movers.length > 0 && (
              <div className="recap-sec">
                <div className="recap-sec-h">📊 Market movers</div>
                {movers.slice(0, 4).map((m, i) => (
                  <div className="recap-line" key={i}>
                    <span>{m.kind === 'hype' ? '📈' : '📉'} <b>{m.setName}</b></span>
                    <b style={{ color: m.kind === 'hype' ? 'var(--green)' : 'var(--red)' }}>{m.pct > 0 ? '+' : ''}{m.pct}%</b>
                  </div>
                ))}
              </div>
            )}

            {/* Inbox / interest */}
            {(added > 0 || listingOffers > 0 || premiumOffers > 0 || newWants > 0 || regularCalls > 0 || regularsWon > 0 || resolvedGrades > 0 || binderFiled > 0 || binderReserved > 0 || notoDelta > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">📬 New</div>
                {newWants > 0 && <div className="recap-line"><span>🐋 {newWants} collector want{newWants === 1 ? '' : 's'} found you</span><span className="muted">Sell tab</span></div>}
                {regularCalls > 0 && <div className="recap-line"><span>📞 {regularCalls} regular{regularCalls === 1 ? '' : 's'} asked you to stock their lane</span><span className="muted">🤝 Regulars</span></div>}
                {regularsWon > 0 && <div className="recap-line"><span style={{ color: 'var(--green)' }}>🤝 You came through for {regularsWon} regular{regularsWon === 1 ? '' : 's'}</span></div>}
                {premiumOffers > 0 && <div className="recap-line"><span style={{ color: 'var(--green)' }}>📈 {premiumOffers} over-market offer{premiumOffers === 1 ? '' : 's'} (hot set)</span></div>}
                {added > 0 && <div className="recap-line"><span className="muted">{added} new order{added === 1 ? '' : 's'} in your inbox</span></div>}
                {listingOffers > 0 && <div className="recap-line"><span className="muted">{listingOffers} new offer{listingOffers === 1 ? '' : 's'} on listings</span></div>}
                {resolvedGrades > 0 && <div className="recap-line"><span className="muted">{resolvedGrades} slab{resolvedGrades === 1 ? '' : 's'} back from grading</span></div>}
                {binderFiled > 0 && <div className="recap-line"><span className="muted">📒 Curator filed {binderFiled} card{binderFiled === 1 ? '' : 's'} into your binder</span></div>}
                {/* Say WHY a slot stayed empty — otherwise the reserve reads as the Curator
                    quietly not doing its job. */}
                {binderReserved > 0 && <div className="recap-line"><span className="muted">🎚️ {binderReserved} slot{binderReserved === 1 ? '' : 's'} left open — top copy reserved to grade & sell</span></div>}
                {notoDelta > 0 && <div className="recap-line"><span className="muted">Notoriety</span><b style={{ color: 'var(--gold)' }}>+{Math.round(notoDelta * 10) / 10}★</b></div>}
              </div>
            )}

            {/* Life events — what happened while time passed */}
            {events.length > 0 && (
              <div className="recap-sec">
                <div className="recap-sec-h">📆 While time passed</div>
                {events.map((e, i) => (
                  <div className="recap-line" key={i}>
                    <span style={{ color: e.cashDelta > 0 ? 'var(--green)' : 'var(--txt)' }}>{e.line}</span>
                    {e.cashDelta ? <b style={{ color: e.cashDelta > 0 ? 'var(--green)' : 'var(--red)' }}>{e.cashDelta > 0 ? '+' : ''}{fmtMoney(e.cashDelta)}</b> : null}
                  </div>
                ))}
              </div>
            )}

            {/* Overhead out */}
            {(wages > 0 || rent > 0 || storage > 0 || lease > 0 || payroll > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">💸 Overhead</div>
                {wages > 0 && <div className="recap-line"><span className="muted">Wages earned</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(wages)}</b></div>}
                {rent > 0 && <div className="recap-line"><span className="muted">Rent</span><span>-{fmtMoney(rent)}</span></div>}
                {storage > 0 && <div className="recap-line"><span className="muted">Inventory storage</span><span>-{fmtMoney(storage)}</span></div>}
                {lease > 0 && <div className="recap-line"><span className="muted">Store lease</span><span>-{fmtMoney(lease)}</span></div>}
                {payroll > 0 && <div className="recap-line"><span className="muted">Staff payroll</span><span>-{fmtMoney(payroll)}</span></div>}
              </div>
            )}

            {missed > 0 && (
              <div className="recap-line" style={{ color: 'var(--red)', marginTop: 4 }}>
                <span>⚠️ Missed {missed} order{missed === 1 ? '' : 's'} while away</span>
                <span className="muted">{missedOnline ? `${missedOnline} online` : ''}{missedOnline && missedWalkin ? ', ' : ''}{missedWalkin ? `${missedWalkin} walk-in` : ''}</span>
              </div>
            )}
          </div>
        )}
        <button className="btn gold" style={{ maxWidth: 160, marginTop: 12, marginLeft: 'auto', marginRight: 'auto', display: 'block' }} onClick={onClose}>Continue</button>
      </>
    </Modal>
  )
}

// Lose screen — shown when you can't make rent and have nothing left to sell.
function GameOver() {
  const gameOver = useGame(s => s.gameOver)
  const reset = useGame(s => s.reset)
  if (!gameOver) return null
  return (
    <Modal dismissable={false} maxWidth={420} zIndex={50} label="Game over"
      style={{ textAlign: 'center' }}>
      <h2 style={{ marginBottom: 6 }}>💸 Game Over</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        You couldn't make rent and had nothing left to sell. The dream's over… for now.
      </p>
      <button className="btn gold" style={{ maxWidth: 200, margin: '8px auto 0' }} onClick={reset}>
        Start over
      </button>
    </Modal>
  )
}

function Shop({ cash, onBuy, onBuyVintage }) {
  const distributors = useGame(s => s.distributors)
  const notoriety = useGame(s => s.notoriety)
  const lgsCredit = useGame(s => s.lgsCredit)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const supplyVendors = useGame(s => s.supplyVendors)
  const supplyChannel = useGame(s => s.supplyChannel || [])
  useGame(s => s.marketMults) // keep strike-through retail honest as the market drifts
  // How many sealed copies of each product you already hold (set + product type), so the
  // buy shelf shows "📦 N" on a line you're already sitting on. Sealed on hand all lives in
  // sealedInventory (personal / storeroom / floor); a piece out at a show or in the pack
  // machine has left that bucket and isn't counted here — this is your buyable-decision stock.
  const sealedInventory = useGame(s => s.sealedInventory)
  const ownedCounts = useMemo(() => {
    const m = new Map()
    for (const it of (sealedInventory || [])) {
      const k = `${it.setId}|${it.product?.type || ''}`
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [sealedInventory])
  const [distId, setDistId] = useState(DISTRIBUTORS[0].id)
  const [toastMsg, setToastMsg] = useState(null)
  const flash = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2600) }
  // Distributor credit line: a global account (not per-distributor) that scales with net worth.
  const creditBalance = useGame(s => s.credit?.balance || 0)
  const creditFrozen = useGame(s => !!s.credit?.frozen)
  const creditLimitV = useGame(s => s.creditLimit())
  const creditAvail = useGame(s => s.creditAvailable())
  const creditMin = useGame(s => s.creditMinimum())
  const payCredit = useGame(s => s.payCredit)
  const [payMode, setPayMode] = useState('cash') // how buys on this tab pay: 'cash' | 'split' (cash+credit) | 'credit'
  // Never leave the toggle stuck on a credit mode the line can't back — fall back to cash.
  const creditUsable = !creditFrozen && creditAvail > 0
  const onCredit = payMode === 'credit' && creditUsable  // pure credit
  const split = payMode === 'split' && creditUsable       // 🔀 cash first, credit for the rest
  // Which distributors have vintage on the shelf this week (a weekly find still in stock, or a
  // rapport hold set aside for you) — drives the 🗝️ marker on their picker chip. Selected as a
  // stable string so the Set below only rebuilds when the actual set of vintage-having stores changes.
  const vintageDistKey = useGame(s => DISTRIBUTORS
    .filter(d => vintageLeft(s, d.id) > 0 || s.distributors?.[d.id]?.hold)
    .map(d => d.id).join(','))
  const vintageDists = useMemo(() => new Set(vintageDistKey ? vintageDistKey.split(',') : []), [vintageDistKey])

  const dist = distributorById(distId) || DISTRIBUTORS[0]
  const rec = distributors[distId] || { spend: 0, stock: {} }
  const lvl = rapportLevel(rec.spend)
  // Week index drives Greg's rotating catalog (month-safe; 30 days/month). Shared with the
  // store so the vintage shelf can't read as in-stock here and sold-out at the buy path.
  const weekIndex = weekIndexOf(currentDay, monthsElapsed)
  const unlocked = distributorUnlocked(dist, notoriety)
  const catalog = distributorCatalog(dist, SHOP_SETS, weekIndex)
  // Greg flags one set's box as a clearance lot each week — a steep, thin-stock steal.
  const clearanceSetId = dist.clearance && catalog.length ? catalog[weekIndex % catalog.length].id : null
  const showSupply = unlocked && dist.supply && lvl.level >= dist.supplyMinLevel

  return (
    <>
      <DistributorPicker distributorState={distributors} notoriety={notoriety} selected={distId} onSelect={setDistId} vintageDists={vintageDists} />

      {!unlocked ? (
        <LockedDistributor dist={dist} notoriety={notoriety} />
      ) : (<>
      <RapportBanner dist={dist} rec={rec} lvl={lvl} />

      {showSupply && (
        <SupplyPanel dist={dist} lvl={lvl} supplyVendors={supplyVendors} supplyChannel={supplyChannel} cash={cash} flash={flash} />
      )}

      <div className="banner" style={{ marginTop: 14 }}>
        {dist.icon} <b style={{ color: dist.color }}>{dist.name}</b> — {dist.blurb}
        {' '}Live <b>TCGplayer sealed prices</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); each product rips into its real pack count.
        {dist.id === 'lgs' && (lgsCredit || 0) > 0 && (
          <> {' '}<span className="pill" title="In-store credit from turning in bulk (5¢/card). Applied automatically at checkout here." style={{ background: '#5ec98a22', color: 'var(--green)' }}>💳 {fmtMoney(lgsCredit)} store credit — spent automatically here</span></>
        )}
      </div>

      <CreditPanel balance={creditBalance} limit={creditLimitV} avail={creditAvail} min={creditMin}
        frozen={creditFrozen} cash={cash} payMode={payMode} setPayMode={setPayMode}
        onPay={(amt) => { const paid = payCredit(amt); if (paid > 0) flash(`Paid ${fmtMoney(paid)} toward your credit line.`) }} />

      {catalog.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>{dist.name} has nothing on the shelf right now — check back next week.</p>
      ) : (
        <div className="shop-list">
          {catalog.map(set => (
            <DistributorSetCard key={set.id} dist={dist} set={set} lvl={lvl} stock={rec.stock}
              cash={cash} onBuy={onBuy} clearance={set.id === clearanceSetId} owned={ownedCounts}
              onCredit={onCredit} split={split} creditAvail={creditAvail} />
          ))}
        </div>
      )}

      <VintageShelf dist={dist} rec={rec} weekIndex={weekIndex} cash={cash} onBuyVintage={onBuyVintage} onCredit={onCredit} split={split} creditAvail={creditAvail} />
      </>)}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}

// The distributor credit line — a single global account (limit scales with net worth). Shows
// the balance / limit / available, a Cash⇄Credit toggle that routes every buy on this tab, and
// pay-down controls. Carrying a balance accrues monthly interest; the minimum auto-pays from
// cash each month, and missing it freezes the line (surfaced here) until you pay it down.
function CreditPanel({ balance, limit, avail, min, frozen, cash, payMode, setPayMode, onPay }) {
  const canUseCredit = !frozen && avail > 0
  const hasBalance = balance > 0.005
  const ratePct = Math.round(CREDIT_MONTHLY_RATE * 100)
  // A credit mode the line can't back reads as Cash (matches the Shop's onCredit/split gating).
  const active = canUseCredit ? payMode : 'cash'
  const creditTitle = frozen ? 'Frozen — pay your balance down to buy on credit again'
    : avail <= 0 ? 'No credit available yet — your line grows with your net worth (and frees up as you pay down the balance)'
    : `up to ${fmtMoney(avail)} available`
  return (
    <div className={`credit-panel ${frozen ? 'frozen' : ''}`}>
      <div className="credit-top">
        <div className="credit-head">💳 Credit line{frozen && <span className="credit-badge">FROZEN</span>}</div>
        <div className="credit-toggle" role="group" aria-label="Pay with">
          <button className={`btn ${active === 'cash' ? 'gold' : 'alt'}`} onClick={() => setPayMode('cash')}
            title="Pay with cash on hand">💵 Cash</button>
          <button className={`btn ${active === 'split' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
            title={canUseCredit ? `Pay cash first, then put the rest on credit (${creditTitle})` : creditTitle}
            onClick={() => setPayMode('split')}>🔀 Cash + Credit</button>
          <button className={`btn ${active === 'credit' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
            title={canUseCredit ? `Charge buys to your credit line (${creditTitle})` : creditTitle}
            onClick={() => setPayMode('credit')}>💳 Credit</button>
        </div>
      </div>
      <div className="credit-stats">
        <span>Balance <b className={hasBalance ? 'credit-owe' : ''}>{fmtMoney(balance)}</b></span>
        <span>Limit <b>{fmtMoney(limit)}</b></span>
        <span>Available <b className="credit-avail">{fmtMoney(avail)}</b></span>
        {hasBalance && <span>Min/mo <b>{fmtMoney(min)}</b></span>}
      </div>
      {hasBalance ? (
        <div className="credit-pay">
          <div className="muted credit-note">~{ratePct}%/mo interest on the balance · the minimum auto-pays from cash each month{frozen ? ' — pay it down to un-freeze the line' : ''}.</div>
          <div className="credit-pay-btns">
            <button className="btn alt" disabled={cash <= 0} onClick={() => onPay(min)}>Pay min {fmtMoney(min)}</button>
            <button className="btn gold" disabled={cash <= 0} onClick={() => onPay(balance)}>
              {cash + 0.005 < balance ? `Pay ${fmtMoney(cash)} (all cash)` : `Pay off ${fmtMoney(balance)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="muted credit-note">Buy sealed on credit and pay it off monthly — your line grows with your net worth. Carry a balance and it accrues ~{ratePct}%/mo.</div>
      )}
    </div>
  )
}

// A distributor that won't open a wholesale account with you yet (notoriety-gated). Shown in
// place of their shelves — states the bar and how far you are from it, so it reads as a goal.
function LockedDistributor({ dist, notoriety }) {
  const need = dist.minNotoriety || 0
  const pct = Math.min(100, Math.round(((notoriety || 0) / need) * 100))
  return (
    <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66', textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: dist.color }}>{dist.icon} {dist.name} isn't taking accounts your size yet</div>
      <p className="muted" style={{ fontSize: 13, margin: '8px auto 12px', maxWidth: 440 }}>
        A hobby giant this size only opens a wholesale account with an established name. Build your
        <b> notoriety</b> — run shows, fill wants, move product — and they'll come to the table.
      </p>
      <div className="distrib-bar" style={{ maxWidth: 320, margin: '0 auto' }}>
        <div style={{ width: pct + '%', background: dist.color }} />
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        <b style={{ color: dist.color }}>{Math.round(notoriety || 0)}</b> / {need} notoriety
        {' '}· {Math.max(0, need - Math.round(notoriety || 0))} to go
      </div>
    </div>
  )
}

// Pick which distributor you're buying from. Each chip shows their icon, name, and your
// rapport (filled stars), tinted with their brand colour.
function DistributorPicker({ distributorState, notoriety, selected, onSelect, vintageDists }) {
  return (
    <div className="distrib-picker">
      {DISTRIBUTORS.map(d => {
        const rec = distributorState[d.id] || { spend: 0 }
        const level = rapportLevel(rec.spend).level
        const max = RAPPORT_LEVELS.length - 1
        const locked = !distributorUnlocked(d, notoriety)
        const hasVintage = !locked && vintageDists?.has(d.id)
        return (
          <button key={d.id} className={`distrib-chip ${selected === d.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
            style={{ '--dc': d.color }} onClick={() => onSelect(d.id)}
            title={locked ? `Locked — reach ${d.minNotoriety} notoriety to open an account`
              : hasVintage ? `${d.name} has vintage sealed on the shelf this week` : undefined}>
            {hasVintage && <span className="dc-vintage" title="Vintage in stock this week" aria-label="Vintage in stock">🗝️</span>}
            <span className="dc-icon">{d.icon}</span>
            <span className="dc-name">{d.name}</span>
            {locked
              ? <span className="dc-rep" aria-label={`Locked — ${d.minNotoriety} notoriety needed`}>🔒 {d.minNotoriety}</span>
              : <span className="dc-rep" aria-label={`${level} of ${max} rapport`}>{'★'.repeat(level)}{'☆'.repeat(max - level)}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Your relationship with the selected distributor: current standing, the discount it
// earns, what perks it unlocks, and progress toward the next rung.
function RapportBanner({ dist, rec, lvl }) {
  const next = nextRapport(rec.spend)
  const disc = distributorDiscount(dist, lvl.level)
  const nextDisc = next ? distributorDiscount(dist, next.level) : disc
  const pct = next ? Math.min(100, Math.round(((rec.spend - lvl.min) / (next.min - lvl.min)) * 100)) : 100
  const levelName = (n) => RAPPORT_LEVELS[n]?.name || ''
  const perks = []
  if (dist.cases) perks.push(lvl.level >= dist.casesMinLevel ? '✓ case lots' : `case lots at ${levelName(dist.casesMinLevel)}`)
  if (dist.supply) perks.push(lvl.level >= dist.supplyMinLevel ? '✓ supply the channel' : `supply the channel at ${levelName(dist.supplyMinLevel)}`)
  if (dist.firstDibs) perks.push('first dibs on new sets')
  if (dist.clearance) perks.push('weekly clearance lots')
  return (
    <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66' }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="pill" style={{ background: lvl.color + '22', color: lvl.color, fontSize: 13 }}>🤝 {lvl.name}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {disc > 0 ? <><b style={{ color: 'var(--green)' }}>{Math.round(disc * 100)}% off</b> their prices</> : 'building rapport unlocks discounts'}
          {perks.length ? ' · ' + perks.join(' · ') : ''}
        </span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Spent with them {fmtMoney(rec.spend)}</span>
      </div>
      {next && (
        <>
          <div className="distrib-bar"><div style={{ width: pct + '%', background: dist.color }} /></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            {fmtMoney(next.min - rec.spend)} more spend → <b style={{ color: next.color }}>{next.name}</b>
            {nextDisc > disc ? ` (${Math.round(nextDisc * 100)}% off` : ' ('}
            {dist.cases && next.level >= dist.casesMinLevel && lvl.level < dist.casesMinLevel ? ', case lots' : ''}
            {dist.supply && next.level >= dist.supplyMinLevel && lvl.level < dist.supplyMinLevel ? ', supply' : ''}
            {', bigger allocation)'}
          </div>
        </>
      )}
    </div>
  )
}

// One set on a distributor's shelf: its products (priced at your rapport), plus a case
// lot (if they sell cases and you've earned it) and a clearance lot (Greg, weekly).
function DistributorSetCard({ dist, set, lvl, stock, cash, onBuy, clearance, owned, onCredit, split, creditAvail }) {
  const products = setProducts(set)
  const showCases = dist.cases && lvl.level >= dist.casesMinLevel
  const lot = showCases ? caseLot(set) : null
  const box = [...products].sort((a, b) => b.packs - a.packs)[0]
  const credit = { onCredit, split, creditAvail }
  // Collapsed by default: the shelf opens as a scannable list of set logos; tap a row to expand
  // its products. Summary on the collapsed row = how many lines and the cheapest one, at rapport.
  const [open, setOpen] = useState(false)
  const count = products.length + (lot ? 1 : 0) + (clearance && box ? 1 : 0)
  const cheapest = products.length ? Math.min(...products.map(p => distributorPrice(dist, p.price, lvl.level))) : 0
  return (
    <div className={`product set-acc ${open ? 'open' : ''}`}>
      <button className="set-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <span className="set-logo-fallback">📦</span>}
        <span className="set-head-info">
          <span className="set-head-name">{set.name}</span>
          <span className="meta">{set.series} · {count} product{count !== 1 ? 's' : ''}{cheapest ? ` · from ${fmtMoney(cheapest)}` : ''}</span>
        </span>
        <span className="set-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="prodlist">
          {products.map(p => (
            <StockButton key={p.type} dist={dist} set={set} product={p} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} owned={owned} {...credit} />
          ))}
          {lot && (
            <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} {...credit}
              product={{ ...lot.unit, type: lot.type, icon: lot.icon, packs: lot.packs, bonus: lot.bonus, boxes: lot.boxes, _retail: lot.retail, _case: true }} owned={owned} />
          )}
          {clearance && box && (
            <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} {...credit}
              product={{ ...box, type: `Clearance ${box.type}`, icon: '🏷️', _clearanceOf: box.price, _clearance: true }} owned={owned} />
          )}
        </div>
      )}
    </div>
  )
}

// A single buyable product line with live stock. Prices at your rapport, draws the stock
// bar, and disables itself when sold out (with a restock ETA) or you can't afford it.
// A quantity stepper lets you buy several at once (type "10" → ten ETBs in one purchase),
// capped to what's in stock and what you can afford.
function StockButton({ dist, set, product, lvl, stock, cash, onBuy, owned, onCredit = false, split = false, creditAvail = 0 }) {
  const ownedN = owned?.get(`${set.id}|${product.type}`) || 0 // sealed copies of this exact line you already hold
  let price
  if (product._case) price = distributorCasePrice(dist, { retail: product._retail }, lvl.level)
  else if (product._clearance) price = round2(distributorPrice(dist, product._clearanceOf, lvl.level) * 0.65)
  else price = distributorPrice(dist, product.price, lvl.level)

  const { q: stockQty, cap, out } = stockState(dist, stock, set, product, lvl.level)
  const days = out ? daysToRestock(dist, stockQty, cap) : 0
  // How many you can buy right now: at least 1 if in stock, capped by stock and your spendable
  // funds — cash, your open credit line (pure credit), or cash + credit together (split).
  const spendable = onCredit ? creditAvail : split ? round2(cash + creditAvail) : cash
  const useCredit = onCredit || split // a credit mode is in play (badge/label/opts)
  const affordable = price > 0 ? Math.floor(spendable / price) : 999
  const maxBuy = out ? 0 : Math.max(0, Math.min(Math.max(1, Math.floor(stockQty)), affordable))

  const [buyQty, setBuyQty] = useState(1)
  const qN = Math.min(Math.max(1, Math.floor(buyQty) || 1), Math.max(1, maxBuy))
  const clampSet = (v) => setBuyQty(Math.min(Math.max(1, Math.floor(v) || 1), Math.max(1, maxBuy)))
  const canBuy = !out && maxBuy >= 1

  const retail = product._clearance ? product._clearanceOf : product._case ? product._retail : product.price
  const showStrike = price < (retail || 0) - 0.005
  const total = round2(price * qN)

  // 📋 Standing order (upgrade): subscribe ONE regular product line to a weekly auto-ship.
  const hasSO = useGame(s => !!s.upgrades.standingOrder)
  const so = useGame(s => s.standingOrder)
  const setSO = useGame(s => s.setStandingOrder)
  const soHere = !!(so && so.distId === dist.id && so.setId === set.id && so.type === product.type)
  const soEligible = hasSO && !product._case && !product._clearance

  return (
    <div className="prodrow">
      <div className="qty-ctl" aria-label="quantity">
        <button type="button" className="qty-step" disabled={!canBuy || qN <= 1} onClick={() => clampSet(qN - 1)} aria-label="fewer">−</button>
        <input type="number" min="1" max={Math.max(1, maxBuy)} value={qN} disabled={!canBuy}
          onChange={e => clampSet(Number(e.target.value))} onFocus={e => e.target.select()} aria-label="quantity" />
        <button type="button" className="qty-step" disabled={!canBuy || qN >= maxBuy} onClick={() => clampSet(qN + 1)} aria-label="more">+</button>
      </div>
      {soEligible && (
        <button type="button" className={`qty-step so-btn ${soHere ? 'active' : ''}`}
          title={soHere ? `📋 Standing order active — ${so.qty}× weekly at your rapport price. Tap to cancel.`
            : `📋 Standing order: auto-buy ${qN}× ${product.type} every week at your rapport price (while stocked & cash allows). One product at a time — setting this moves it here.`}
          onClick={() => setSO(soHere ? null : { distId: dist.id, setId: set.id, type: product.type, qty: qN })}>📋</button>
      )}
      <button className={`prodbtn ${product._case ? 'caselot' : ''} ${product._clearance ? 'clearance' : ''} ${out ? 'out' : ''} ${useCredit && canBuy ? 'on-credit' : ''}`}
        disabled={!canBuy}
        onClick={() => onBuy(dist.id, set, { ...product, _buyPrice: price, _distId: dist.id }, qN, { onCredit, split })}
        title={out ? `Sold out — restocks in ~${days}d` : `${product.packs} pack${product.packs > 1 ? 's' : ''}${product.bonus ? ' + promo' : ''} · ${Math.floor(stockQty)}/${cap} in stock · up to ${maxBuy} buyable now${onCredit ? ' — charged to your 💳 credit line' : split ? ' — cash first, then your 💳 credit line' : ''}`}>
        <span className="prodname">{useCredit ? '💳 ' : ''}{product.icon} {product.type}</span>
        {ownedN > 0 && <span className="prodowned" title={`You already hold ${ownedN} sealed ${product.type} of ${set.name}`}>📦 {ownedN}</span>}
        <span className="prodmeta">{product.packs} pk{product.bonus ? ' +🎁' : ''}{product._case && product.boxes ? ` · ${product.boxes} boxes` : ''}</span>
        <span className="prodprice">{showStrike && <s className="retail">{fmtMoney(retail)}</s>}{qN > 1 ? `${fmtMoney(total)} · ×${qN}` : fmtMoney(price)}</span>
        <StockBar qty={stockQty} cap={cap} out={out} days={days} color={dist.color} />
      </button>
    </div>
  )
}

// Thin per-product stock gauge: fill proportional to qty/cap, red + ETA when sold out.
function StockBar({ qty, cap, out, days, color }) {
  const pct = Math.max(0, Math.min(100, Math.round((qty / cap) * 100)))
  return (
    <span className="stockbar">
      <span className="stockbar-track"><span className="stockbar-fill" style={{ width: pct + '%', background: out ? 'var(--red)' : color }} /></span>
      <span className="stockbar-label" style={out ? { color: 'var(--red)' } : null}>
        {out ? `OUT · restocks ~${days}d` : `${Math.floor(qty)} / ${cap} in stock`}
      </span>
    </span>
  )
}

// Vintage sealed no longer lives at a dedicated Vault — it turns up RANDOMLY on each vendor's
// shelf some weeks (check them regularly), and high-rapport vendors RESERVE a piece for you.
// This panel shows the selected distributor's current vintage: a reserved HOLD (a rapport
// perk that persists until you grab it) and/or a rotating weekly FIND. Re-prices as the market
// drifts (the parent Shop already subscribes to marketMults).
function VintageShelf({ dist, rec, weekIndex, cash, onBuyVintage, onCredit = false, split = false, creditAvail = 0 }) {
  if (!VINTAGE_SETS.length) return null
  const hold = rec?.hold || null
  const hasScout = useGame(s => !!s.upgrades.vintageScout) // 🕵️ scout turns up finds more often
  const find = useMemo(() => distributorVintageFind(dist, weekIndex, hasScout ? 1.5 : 1), [dist, weekIndex, hasScout])
  // The find is FINITE — a pack or two the vendor turned up, not a case they can reorder.
  // Once you've taken them the shelf is bare until next week rotates in a new find.
  const left = useGame(s => vintageLeft(s, dist.id, find?.setId))
  const cleanedOut = !!find && left < 1
  if (!hold && !find) {
    return (
      <div className="market-panel vintage-vault" style={{ marginTop: 18, opacity: 0.8 }}>
        <div className="market-head">🗝️ Vintage <span className="muted">— nothing old on {dist.name}'s shelf this week. It turns up randomly here (check back), and always at shows. Build rapport and they'll hold pieces for you.</span></div>
      </div>
    )
  }
  // `held` = the rapport hold (a separate one-off piece set aside for you, always exactly 1).
  // `n` = how many of the weekly find remain; a bare shelf renders the card greyed and dead.
  const Card = ({ f, held, n }) => {
    const p = sealedValue({ product: f.product, setId: f.setId })
    const up = p >= (f.product.price || 0)
    const out = !held && n < 1
    // Vintage sealed can be bought on credit too — gate affordability on the open credit
    // line (pure credit), cash + credit (split), or cash (matches the modern StockButton path).
    const spendable = onCredit ? creditAvail : split ? round2(cash + creditAvail) : cash
    const broke = spendable < f.price
    const useCredit = (onCredit || split) && !out && !broke
    return (
      <div className={`product ${held ? 'vintage-held' : ''}`} style={out ? { opacity: 0.55 } : undefined} key={(held ? 'h' : 'f') + f.setId}>
        {f.logo && <img className="logo" src={f.logo} alt={f.setName} />}
        <h3>{f.setName}</h3>
        <div className="meta">
          {held ? '🗝️ Reserved for you' : '🗝️ Vintage find'} · sealed {f.product.type}
          {!held && (out
            ? <> · <b style={{ color: 'var(--red)' }}>cleaned out</b></>
            : <> · <b>{n} left</b></>)}
        </div>
        <div className="prodlist">
          <button className={`prodbtn ${useCredit ? 'on-credit' : ''}`} disabled={out || broke}
            onClick={() => onBuyVintage(dist.id, f, { fromHold: held, onCredit, split })}
            title={out
              ? `${dist.name} has no more sealed ${f.setName} — vintage is out of print. A new find turns up next week.`
              : `${f.product.type} · ask ${fmtMoney(f.price)} · current market ${fmtMoney(p)}${onCredit ? ' — charged to your 💳 credit line' : split ? ' — cash first, then your 💳 credit line' : ''}`}>
            <span className="prodname">{useCredit ? '💳 ' : ''}{f.product.icon || '📦'} {f.product.type}</span>
            <span className="prodmeta" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'} mkt {held ? '· held' : ''}</span>
            <span className="prodprice">{out ? '—' : fmtMoney(f.price)}</span>
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="market-panel vintage-vault" style={{ marginTop: 18 }}>
      <div className="market-head">🗝️ Vintage on {dist.name}'s shelf <span className="muted">— old sealed, buy &amp; hold (vintage appreciates) or rip it. It's out of print: what they turn up is all there is, and it rotates weekly. Rapport gets pieces reserved for you.</span></div>
      <div className="grid shop-grid" style={{ marginTop: 10 }}>
        {hold && <Card f={hold} held n={1} />}
        {find && <Card f={find} n={left} />}
      </div>
      {cleanedOut && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          You've cleared {dist.name} out of {find.setName}. Vintage is out of print — check back next week for a fresh find, or hunt the show floor.
        </p>
      )}
    </div>
  )
}

// Supply Vendors: wholesale sealed product into the channel for passive income. Unlocked
// once you hit Trusted+ rapport with Pro Hobby (you buy in at their wholesale price).
function SupplyPanel({ dist, lvl, supplyVendors, supplyChannel, cash, flash }) {
  const [setId, setSetId] = useState(SHOP_SETS[0].id)
  const set = SHOP_SETS.find(s => s.id === setId) || SHOP_SETS[0]
  const products = setProducts(set)
  const [type, setType] = useState(() => products.find(p => p.packs >= 10)?.type || products[0].type)
  const product = products.find(p => p.type === type) || products[0]
  const cost = distributorPrice(dist, product.price, lvl.level)
  const pending = supplyChannel.reduce((a, w) => a + w.net, 0)

  function place() {
    if (cash < cost) return flash('Not enough cash to buy in.')
    const r = supplyVendors(set, product)
    if (r) flash(`Wholesaled ${product.type} of ${set.name} — nets ${fmtMoney(r.net)} in ~${r.daysLeft}d.`)
  }
  return (
    <div className="market-panel" style={{ marginTop: 14 }}>
      <div className="market-head">📦 Supply other vendors <span className="muted">— buy in at {dist.name}'s wholesale, sell through the channel for passive income over a few days</span></div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select value={setId} onChange={e => { const id = e.target.value; setSetId(id); const ps = setProducts(SHOP_SETS.find(s=>s.id===id)); setType(ps.find(p=>p.packs>=10)?.type || ps[0].type) }}>
          {SHOP_SETS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)}>
          {products.map(p => <option key={p.type} value={p.type}>{p.icon} {p.type}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>buy-in {fmtMoney(cost)}</span>
        <button className="btn gold" style={{ flex:'none', maxWidth: 200, marginLeft:'auto' }} disabled={cash < cost} onClick={place}>
          Wholesale it → channel
        </button>
      </div>
      {supplyChannel.length > 0 && (
        <div className="consign-strip" style={{ marginTop: 10 }}>
          <b>📦 In the channel ({supplyChannel.length})</b>
          {supplyChannel.map((w, i) => (
            <span key={i} className="pill" title={`Pays ${fmtMoney(w.net)} when it sells through`}>{w.label} · {fmtMoney(w.net)} · {w.daysLeft}d</span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>— {fmtMoney(pending)} incoming</span>
        </div>
      )}
    </div>
  )
}
