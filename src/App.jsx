import { useEffect, useMemo, useRef, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney,
  DISTRIBUTORS, RAPPORT_LEVELS, distributorById, distributorCatalog, distributorPrice, distributorCasePrice,
  distributorDiscount, distributorUnlocked, rapportLevel, nextRapport, stockState, daysToRestock, caseLot, round2,
  VINTAGE_SETS, JP_SHOP_SETS, vintageProduct, sealedValue, setById, warmPricesOnBoot, distributorVintageFind,
  hypeSurge, cardValue, ERA_PRODUCTS, eraAnchorSet, drawPackSets, productTypeLabel } from './game/engine'
import { Modal } from './ui/Modal'
import { Collapse, useOpen, bigScreen } from './ui/Collapse'
import { useGame, repSourceLabel, RANKS, DEEDS_NEEDED, deedsDone } from './game/store'
import { netWorthFull, vintageLeft } from './game/store/helpers'
import { weekIndexOf, weekdayOf, absoluteDay, monthName, yearOf, CREDIT_MONTHLY_RATE, creditMonthlyRate, UPGRADES } from './game/store/constants'
import { startAutoSync } from './game/cloudSave'
import { encounterStillValid } from './game/shows'
import FirstRun, { NotorietyHelp } from './components/FirstRun'
import { HobbyWire, BreakersAlmanac } from './components/MarketIntel'
import AuctionHouse from './components/AuctionHouse'
import LocalMarket from './components/LocalMarket'
import { shelfProducts, shelfEraProducts, shelfBlurb } from './game/shelf'
import { Chunk, lazyChunk } from './ui/lazyChunk'
import { DialogHost, ToastHost, toast } from './ui/dialog'
import { configureFeedback } from './game/feedback'
import { AnimatedNumber, CashFlash } from './ui/AnimatedNumber'
import { SHOW_TIERS } from './game/shows'
import { milestoneById } from './game/milestones'

// Primary nav: the core loop + Stats (your money/standing matters more than the upgrade
// shop, so Stats gets a top slot and Upgrades moves behind the ⚙️ gear). Reference/meta
// screens (Grader, Prices) live as sub-tabs inside Collection; Settings + Upgrades live
// behind the gear in the top bar.
// Tab-gated screens, split out of the boot chunk. None of these paint on the first render
// (the Buy tab), and together they were ~500 KB of source that WebKit had to parse before it
// could show anything. lazyChunk() carries the stale-chunk guard — see src/ui/lazyChunk.jsx.
const PackOpening = lazyChunk(() => import('./components/PackOpening'))
const Collection = lazyChunk(() => import('./components/Collection'))
const CardModal = lazyChunk(() => import('./components/CardModal'))
const Bench = lazyChunk(() => import('./components/Bench'))
const Stats = lazyChunk(() => import('./components/Stats'))
const Books = lazyChunk(() => import('./components/Books'))
const Calendar = lazyChunk(() => import('./components/Calendar'))
const ShowFloor = lazyChunk(() => import('./components/ShowFloor'))
const UpgradeShop = lazyChunk(() => import('./components/UpgradeShop'))
const BoothInbox = lazyChunk(() => import('./components/BoothInbox'))
const Settings = lazyChunk(() => import('./components/Settings'))
const PriceGuide = lazyChunk(() => import('./components/PriceGuide'))
const Marketplace = lazyChunk(() => import('./components/Marketplace'))
const SealedInventory = lazyChunk(() => import('./components/SealedInventory'))
const AutoRip = lazyChunk(() => import('./components/AutoRip'))
const ShowPrep = lazyChunk(() => import('./components/ShowPrep'))
const Livestream = lazyChunk(() => import('./components/Livestream'))
const Socials = lazyChunk(() => import('./components/Socials'))
const Binder = lazyChunk(() => import('./components/Binder'))
const Regulars = lazyChunk(() => import('./components/Regulars'))
const StoreStock = lazyChunk(() => import('./components/StoreStock'))
const GradeReveal = lazyChunk(() => import('./components/GradeReveal'))

const TABS = ['shop', 'myshop', 'stream', 'shows', 'stats', 'collection']
// Device-local, deliberately NOT part of the saved game. See the useState that reads it.
const TAB_KEY = 'pv.tab'
const TAB_LABEL = { shop: 'Buy', myshop: 'Store', stream: 'Stream', shows: 'Shows', stats: 'Stats', collection: 'Inventory' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { shop: '🛒', myshop: '🏬', stream: '🔴', shows: '🎪', stats: '📊', collection: '🗂️' }

// The 📦 Inventory items that ARE this product (same set + same product — price and
// provenance vary by where a copy came from, but it's the same thing to rip).
// This is the ONLY source "Rip another" draws from — see ripAnother().
function heldMatches(state, set, product) {
  return (state.sealedInventory || []).filter(i => i.setId === set?.id && sameProduct(i.product, product))
}

// Same PRODUCT, not merely the same TYPE. The shop used to carry one product per type per set,
// which made those the same question; now that it carries the full lineup, Prismatic alone has
// eight different Mini Tins. Matching on type would let "rip another" hand you the Flareon tin
// when you asked for the Umbreon one — wrong price, wrong promo. tcgId is TCGplayer's
// per-product id; fall back to type for synthesized products (JP, vintage) that have none.
function sameProduct(a, b) {
  if (a?.tcgId && b?.tcgId) return a.tcgId === b.tcgId
  return a?.type === b?.type
}

export default function App() {
  // Which tab is open is a property of this DEVICE, not of the career — so it lives in
  // localStorage rather than in the saved game, and syncing a save between devices never drags
  // one device's screen position onto another.
  //
  // It matters most in the shell: iOS jettisons a backgrounded WKWebView under memory pressure
  // and silently reloads it on return, and coming back on Buy after ten minutes on Shows reads
  // as "it lost my place" even though nothing was lost. The save was never at risk here (it is
  // in IndexedDB and gated on hydration in main.jsx) — the screen position was.
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem(TAB_KEY)
      return t && TABS.includes(t) ? t : 'shop'
    } catch { return 'shop' }
  })
  const [collTab, setCollTab] = useState('cards') // Cards sub-tab: cards | sealed | binder | grader | regulars | prices
  const [shopTab, setShopTab] = useState('sealed') // Buy sub-tab: sealed | market
  const [settingsPane, setSettingsPane] = useState('settings') // gear sub-pane: settings | upgrades
  const [statsPane, setStatsPane] = useState('stats')           // Stats sub-pane: stats | books
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [sifting, setSifting] = useState(null)   // array of sealed items being auto-ripped ("sift")
  // Where to land when a rip finishes. A rip you START from your collection/store/inbox
  // (via ripFromInventory) should drop you back THERE on Done — not on the Buy tab where the
  // overlay lives. Captured as the tab you launched from; a "Rip another" chain keeps it.
  const [ripReturn, setRipReturn] = useState(null)
  const [picked, setPicked] = useState(null)     // card for modal
  const [preppingShow, setPreppingShow] = useState(null) // show selected; on the prep screen (pick cards/sealed/cash, review who's expecting you)
  const [prepMode, setPrepMode] = useState('shop')       // 'shop' (attend to buy) | 'vendor' (run a booth) — every show goes through prep now
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  const hype = useGame(s => s.hype || 0)
  // Total net worth: cash + market value of every asset you hold (collection, listings,
  // sealed, cards at the grader, etc.). Shown next to cash so moving value around (grading,
  // buying sealed, listing) doesn't read as your money vanishing/appearing — only real
  // income/spend moves it. Recomputed on any state change; returns a number so it only
  // re-renders the header when the figure actually changes.
  const worth = useGame(s => netWorthFull(s))
  // How many more of the in-progress rip's product you HOLD. This is the whole gate for
  // "Rip another" — the button exists only while you have another one already paid for, and
  // disappears when you don't. Subscribed as a plain number: a fresh object each render would
  // re-render the app on every unrelated store change.
  const ripStock = useGame(s => ripping ? heldMatches(s, ripping.set, ripping.product).length : 0)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  // Cards at the card grader plus product at the sealed grader — one badge, because from the
  // player's side it is one queue: things that are away being graded.
  const pendingCount = useGame(s => s.pendingGrades.length + (s.pendingSealed || []).length)
  const sealedCount = useGame(s => s.sealedInventory.length)
  const taxOwed = useGame(s => s.books?.owed || 0)
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
    // 🎪 WALK BACK IN. If the save says you were standing in a show, go back to it rather than
    // settling up. Entering already spent the entry fee, advanced the calendar past the show
    // days and claimed the pre-show leads — so ending the trip here charged you in full for a
    // show you never got to walk. Resuming is the only outcome that matches what you paid for.
    const resume = g.resumeShow()
    if (resume?.show) {
      setActiveShow(resume.show)
      toast(`🎪 Back on the floor at ${resume.show.name} — the app closed while you were there.`, 6000)
    } else if ((g.showInventory || []).length || (g.showSealed || []).length || (g.showReserve || 0) > 0) {
      // No resume record: a save from before this existed, or a trip whose record was cleared.
      // Fall back to the old rescue so stock and the at-home reserve still come home — but SAY
      // so. This used to happen in total silence, which is how "where did my cards go?" starts.
      g.endShow()
      toast('⚠️ Your last show ended unexpectedly — your stock and the cash you left at home are back in your inventory.', 7000)
    }
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

  // 🏅 Rank-up celebrations ride the same queue pattern as milestones: the store banks the
  // promotion wherever it lands (day-tick, a rip's milestone sweep) and we toast it here.
  const pendingRanks = useGame(s => s.pendingRanks)
  useEffect(() => {
    if (!pendingRanks?.length) return
    for (const idx of pendingRanks) {
      const r = RANKS[idx]
      if (r) toast(`🏅 Rank up — you're now a ${r.emoji} ${r.name}!${r.clout ? ` +${r.clout} 🎫 clout to spend.` : ''}${r.perk ? ` New perk: ${r.perk}` : ''}`, 6000)
    }
    useGame.getState().clearPendingRanks()
  }, [pendingRanks])

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
        if (cash + avail + 1e-9 < price) return toast(`Not enough cash + credit for ${productTypeLabel(product)}. Pay down your balance or bring more cash.`)
      }
    } else if (onCredit) {
      if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen — pay it down first (💳 panel on the Buy tab).')
      if (useGame.getState().creditAvailable() + 1e-9 < price) return toast(`Not enough credit available for ${productTypeLabel(product)}. Pay down your balance or buy with cash.`)
    } else if (cash < price) return toast(`Not enough cash for ${productTypeLabel(product)}.`)
    // How the charge broke down, for the toast: cash-first, credit covers any shortfall.
    const splitNote = (cp, xp) => xp > 0 ? ` — ${fmtMoney(cp)} cash + ${fmtMoney(xp)} credit 💳` : ''
    const n = Math.max(1, Math.floor(qty))
    const distName = distributorById(distId)?.name || 'They'
    // What to call where this came from. A cross-set product has an ANCHOR set for bookkeeping,
    // but naming it would be a lie — "Ultra Premium Collection of Phantasmal Flames" claims
    // 18 Phantasmal Flames packs. Name the era instead.
    const origin = product.pool?.series ? `the ${product.pool.series} era` : set.name
    if (n > 1) {
      // Bulk buy: stock N at once into inventory (a stocking action — ignores Rip-on-buy).
      const limB = useGame.getState().purchaseLimitFor(distId, set, product)
      if (limB.left <= 0) return toast(`${distName} limit ${productTypeLabel(product)} to ${limB.limit} per customer a day — you've had yours. Back tomorrow.`)
      const res = useGame.getState().buyFromDistributorBulk(distId, set, product, price, n, { onCredit, split })
      if (!res) return toast(`${distName} can't fill that order right now.`)
      const short = res.bought < n ? ` (only ${res.bought} were available)` : ''
      const pay = onCredit ? ' on credit 💳' : split ? splitNote(res.cashPart, res.creditPart) : ''
      if (res.inTransit) return toast(`🚢 Import order placed — ${res.bought}× ${productTypeLabel(product)} of ${origin} for ${fmtMoney(res.spent)}${pay}${short}. It's crossing the Pacific; watch the Buy tab for the landing.`)
      return toast(`Stocked ${res.bought}× ${productTypeLabel(product)} of ${origin} for ${fmtMoney(res.spent)}${pay}${short} — in Inventory → 📦 Sealed.`)
    }
    // 🚫 Check the ration BEFORE blaming the shelf — "sold out" and "you have had your one"
    // need different answers from the player.
    const lim = useGame.getState().purchaseLimitFor(distId, set, product)
    if (lim.left <= 0) {
      return toast(`${distName} limit ${productTypeLabel(product)} to ${lim.limit} per customer a day — you've had yours. Back tomorrow${lim.limit < 4 ? ', or keep spending here and they\u2019ll let you take more' : ''}.`)
    }
    const item = useGame.getState().buyFromDistributor(distId, set, product, price, { onCredit, split })
    if (!item) return toast(`${distName} are out of ${productTypeLabel(product)} — check back after it restocks.`)
    // 🚢 An import buy is on the water — nothing to rip yet, whatever the Rip-on-buy setting says.
    if (item._inTransit) return toast(`🚢 Import order placed — ${productTypeLabel(product)} of ${origin} is crossing the Pacific (lands in a few days).`)
    if (useGame.getState().settings.ripOnBuy) { ripFromInventory(item.uid); return }
    const cashPart = Math.min(cash, price), creditPart = round2(price - cashPart)
    const pay = onCredit ? ' on credit 💳' : split ? splitNote(cashPart, creditPart) : ''
    toast(`Stocked ${productTypeLabel(product)} of ${origin}${pay} — it's in your ${hasStore ? '🏬 Store → 📦 Storeroom' : 'Inventory → 📦 Sealed'}: rip, list, or flip it whenever.`)
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
      // cost: what you ACTUALLY paid for this unit, not what it lists at today — the 📜 rip log
      // records a real P/L, and the sift (which reads boughtPrice directly) must agree with it.
      // uid identifies the physical unit: a cross-set product derives its pack lineup from it,
      // so two of the same UPC rip different sets. See drawPackSets in engine.js.
      setRipping({ set, product, cost: item.boughtPrice, uid: item.uid })
      setTab('shop')
      return
    }
    // A cross-set product rips packs from several sets, so name the ERA in the log and the
    // toast rather than pretending every card came from the anchor set.
    const packSets = drawPackSets(product, item.uid)
    const eraName = product.pool?.series
    const originLabel = eraName ? `${eraName} era` : set.name
    const all = openProduct(set, product, { uid: item.uid, packSets })
    all.forEach(c => (c._isHit = isHit(c)))
    addPulls(all, `${productTypeLabel(product)} · ${originLabel}`, product.packs) // counts packs + rip goal
    // 📜 The instant path skips PackOpening entirely, so it has to write its own log line —
    // otherwise ripping a box with "one at a time" off would leave no trace in the history.
    useGame.getState().logRip({
      setId: set.id, name: originLabel, type: product.type, packs: product.packs,
      // How many distinct sets the packs actually came from — the 📜 log shows "16 packs · 5 sets".
      setCount: packSets ? new Set(packSets).size : undefined,
      cost: item.boughtPrice, pulled: all.reduce((a, c) => a + cardValue(c), 0),
      best: all.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), null),
    })
    const hits = all.filter(c => c._isHit || c.foil).length
    const across = packSets ? ` across ${new Set(packSets).size} sets` : ''
    setTab('collection')
    toast(`Ripped a ${productTypeLabel(product)} of ${originLabel}${across} — ${all.length} cards, ${hits} hit${hits===1?'':'s'}! Check your collection.`)
  }

  // ⚡ Sift-rip: hand a GROUP of sealed to the auto-ripper — it churns pack by pack, banks the
  // forgettable ones, and stops on any pack with a big hit so you can rip that one by hand.
  function startSift(items) {
    if (!items?.length) return
    setSifting(items)
  }
  function exitSift() { setSifting(null) }

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

  // "Rip another" from the end-of-rip summary: keep going straight into the next one you
  // ALREADY OWN. It draws only from 📦 Inventory and never spends money — no re-buy, no
  // restock, no credit. When your stock of this product runs out the button is gone, and
  // buying more is a deliberate trip back to the Buy tab.
  //
  // It used to re-buy off the vendor's shelf once your own stock was empty, which put a
  // one-tap purchase inside the moment you are least inclined to stop and count. Spending
  // money should never be the path of least resistance out of a rip.
  function ripAnother(set, product) {
    const held = heldMatches(useGame.getState(), set, product)[0]
    if (!held) return // out of stock — the button is not rendered in this state anyway
    useGame.getState().ripSealed(held.uid)
    // A different held unit → a different uid → a different pack lineup for a cross-set
    // product. Ripping three UPCs in a row must not deal the same sets three times.
    setRipping(r => ({ set, product: held.product, cost: held.boughtPrice, uid: held.uid, nonce: (r?.nonce ?? 0) + 1 }))
    setTab('shop')
  }

  // Attend a show in one of two modes — BOTH now open the same prep screen first (pick the
  // cards/sealed to bring, choose how much cash to bring, and review who's expecting you):
  //   'shop'   — pay the entry fee, walk the floor to BUY. No booth.
  //   'vendor' — entry + vendorFee, run a BOOTH to sell. Needs the 🎪 Vendor Setup upgrade.
  // No money/days are spent until you confirm on the prep screen.
  function attendShow(show, mode = 'shop') {
    const tier = SHOW_TIERS[show.tierKey]
    // 🎫 Show waiver: a locked show one tier above your rank, talked into as a SHOPPER —
    // 3 clout + double the door price. Validated here; spent at entry (enterAsShopper).
    if (show._waiver) {
      if ((useGame.getState().clout || 0) < 3) return toast('Not enough clout — talking your way in costs 3 🎫.')
      if (useGame.getState().cash < tier.entryFee * 2) return toast(`Not enough cash — the door wants double (${'$' + tier.entryFee * 2}) to look the other way.`)
      mode = 'shop'
    }
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
    // 🎫 Waived entry: 3 clout + double the door price (validated back in attendShow).
    const entryCost = show._waiver ? tier.entryFee * 2 : tier.entryFee
    if (show._waiver && !useGame.getState().spendClout(3)) { setPreppingShow(null); return toast('Not enough clout — talking your way in costs 3 🎫.') }
    if (!spend(entryCost)) { setPreppingShow(null); return toast('Not enough cash for the entry fee.') }
    const effDays = Math.max(1, tier.days - (useGame.getState().upgrades.tourVan ? 1 : 0)) // 🚐 the van shaves a day
    useGame.getState().bringToShow(cardUids || [], sealedUids || []) // may be empty — you're mainly here to buy
    useGame.getState().log('show', `Attended ${show.name} as a shopper (${effDays}d, ${arrival === 'late' ? 'arrived late' : 'at open'})${show._waiver ? ' — 🎫 talked past the rank gate (−3 clout, double entry)' : ''}`, -entryCost)
    // Claim any pre-show leads for this show (vendor holds + buyer appointments) BEFORE
    // the days advance — the floor works off this copy (state leads expire with the calendar).
    const _leads = useGame.getState().claimShowLeads(show.id)
    // The trip's days pass now (at entry); stash the recap to show when you leave the floor.
    const summary = useGame.getState().attendShowDays(show.day, effDays, show.tierKey)
    // Wallet LAST — after entry fee + the days' overhead settle against full cash, stash the
    // rest at home so `cash` on the floor is exactly what you chose to bring.
    if (budget != null) useGame.getState().beginShowWallet(budget)
    setPreppingShow(null)
    const entered = { ...show, _asVendor: false, _arrival: arrival, _summary: summary, _leads }
    useGame.getState().beginShow(entered) // persist it — a crash must not forfeit a paid trip
    setActiveShow(entered)
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
    const summary = useGame.getState().attendShowDays(show.day, effDays, show.tierKey)
    if (budget != null) useGame.getState().beginShowWallet(budget) // wallet last (see enterAsShopper)
    setPreppingShow(null)
    const entered = { ...show, _asVendor: true, _boothMult: opts.spotMult || 1, _spotLabel: opts.spotLabel || 'Standard table', _arrival: opts.arrival || 'open', _summary: summary, _leads }
    useGame.getState().beginShow(entered) // persist it — a crash must not forfeit a paid trip
    setActiveShow(entered)
  }

  // Leaving the show: unsold show-inventory cards come back home, then exit the floor.
  // Surface the trip recap (days away, rent/lease paid, orders missed, grades back) that we
  // stashed when the days passed at entry — most useful after a multi-day show.
  function leaveShow(floor) {
    const trip = activeShow?._summary
    const name = activeShow?.name
    // 🎥 Hand the trip to the vlog kit: which hall, and the best thing that came home with you.
    useGame.getState().endShow({
      tierKey: activeShow?.tierKey, showName: name,
      bestValue: floor?.bestPickup?.value || 0, bestName: floor?.bestPickup?.name || null,
    })
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
    // Re-tapping the tab you are already on scrolls that tab back to the top, which is what every
    // native tab bar on the platform does — and the fastest way out of a long Inventory or Shows
    // list without dragging. Only for a genuine re-tap; a tab CHANGE keeps its own scroll.
    if (t === tab) {
      // `.content` is the real scroll container on mobile — with a bottom nav present, styles.css
      // locks html/body to height:100%/overflow:hidden and `.content` does the scrolling
      // (styles.css:1314). Scrolling document.scrollingElement there moves nothing at all, so it
      // is the FALLBACK for the desktop layout rather than the first choice.
      const pane = document.querySelector('.content') || document.scrollingElement || document.documentElement
      pane.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setTab(t)
    try { localStorage.setItem(TAB_KEY, t) } catch { /* private mode / quota — not worth failing a tap over */ }
  }

  // Prepping for a show: the pick-your-inventory screen takes over the whole view.
  if (preppingShow) {
    return (
      <div className="app">
        <Chunk label="Packing for the show…">
          <ShowPrep show={preppingShow} mode={prepMode}
            onConfirm={(payload) => (prepMode === 'vendor' ? enterShow : enterAsShopper)(preppingShow, payload)}
            onCancel={() => setPreppingShow(null)} />
          {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
        </Chunk>
        <DialogHost />
      <ToastHost />
      </div>
    )
  }

  // If attending a show, the floor takes over the whole view.
  if (activeShow) {
    return (
      <div className="app">
        <Chunk label="Walking into the hall…">
          <ShowFloor show={activeShow} onLeave={leaveShow} />
          {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
        </Chunk>
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
          <span className="noto-chip">⭐ <AnimatedNumber value={notoriety} format={(n) => Math.round(n)} /><small>reputation</small><NotorietyHelp /></span>
          {hype >= 10 && (
            <span className="hype-chip" title={`🔥 Shop heat ${Math.round(hype)}/100 — big moments (god packs, grails, streams, giveaways, events) heat the shop up. While hot, more buyers come through everywhere; it fades over a few days and a little settles into permanent reputation.`}>
              🔥 <AnimatedNumber value={hype} format={(n) => Math.round(n)} /><small>hype</small>
            </span>
          )}
          <div className="cash" title="Cash on hand — spendable money right now"><AnimatedNumber value={cash} format={fmtMoney} /><small>cash on hand</small><CashFlash value={cash} /></div>
          <div className="worth" title="Net worth — cash + market value of everything you own (collection, listings, sealed, cards at the grader). Moving value around (grading, buying, listing) doesn't change it; only real income or spending does."><AnimatedNumber value={worth} format={fmtMoney} /><small>net worth</small></div>
          <button className={`gear-btn ${tab === 'settings' ? 'active' : ''}`} aria-label="Settings & Stats" title="Settings & Stats" onClick={() => selectTab('settings')}>⚙️</button>
        </div>
      </div>

      {gradeReveal && (
        <Chunk label="Opening the return package…">
          <GradeReveal cards={gradeReveal.cards} onDone={() => {
            const s = gradeReveal.summary
            setGradeReveal(null)
            if (s) setDaySummary(s)
          }} />
        </Chunk>
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
        {/* Buy tab ONLY. Sitting outside the tab switch, this checklist painted on all six
            screens at once — ~230px of a 676px phone viewport (34%) repeated on Store, Stream,
            Shows, Stats and Inventory, where none of its steps live. Buy is where you land by
            default and where step one ("buy some sealed") happens, so it's the one screen the
            onboarding belongs on; it still dismisses globally. */}
        {tab === 'shop' && <FirstRun />}
        {/* ONE Suspense for the whole tab area: every screen inside is a lazy chunk, and a
            per-tab boundary would just mean the same fallback written fourteen times. */}
        <Chunk>
        {tab === 'shop' && (
          <div className="pane">
            <div className="subtabs">
              <button className={`subtab ${shopTab === 'sealed' ? 'active' : ''}`} onClick={() => setShopTab('sealed')}>📦 Sealed</button>
              <button className={`subtab ${shopTab === 'market' ? 'active' : ''}`} onClick={() => setShopTab('market')}>🛍️ Marketplace</button>
            </div>
            {shopTab === 'sealed' && <Shop cash={cash} onBuy={buyProduct} onBuyVintage={buyDistVintage} />}
            {shopTab === 'market' && <Marketplace />}
          </div>
        )}

        {tab === 'shows' && <div className="pane"><Calendar onAttend={attendShow} /></div>}
        {tab === 'myshop' && <div className="pane"><BoothInbox onRip={ripFromInventory} onSift={startSift} onPick={setPicked} /></div>}
        {/* 📱 The off-air half of the channel sits above the go-live screen — hidden while
            you're actually broadcasting, so a live session keeps the whole view. */}
        {tab === 'stream' && <div className="pane">{!streamLive && <Socials />}<Livestream /></div>}
        {tab === 'stats' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${statsPane === 'stats' ? 'active' : ''}`} onClick={() => setStatsPane('stats')}>📊 Stats</button>
              {/* 🧾 The books sit beside the stats because they read the same way: what the
                  business did, rather than what you can do next. The tax due chip is on the
                  tab itself so a bill can never quietly go unpaid. */}
              <button className={`subtab ${statsPane === 'books' ? 'active' : ''}`} onClick={() => setStatsPane('books')}>
                🧾 Books{taxOwed > 0 ? ` (${fmtMoney(taxOwed)})` : ''}
              </button>
            </div>
            <div className="pane" key={statsPane}>
              {statsPane === 'stats' ? <Stats /> : <Books />}
            </div>
          </>
        )}

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
              {collTab === 'sealed' && (hasStore ? <StoreStock place="personal" only="sealed" onRip={ripFromInventory} onSift={startSift} onPick={setPicked} /> : <SealedInventory onRip={ripFromInventory} onSift={startSift} />)}
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
        </Chunk>
      </main>

      {/* In-progress rip overlay. Mounted whenever a rip is active so its state survives
          tab switches; hidden (not unmounted) when you're off the Buy tab, so leaving and
          returning resumes the same rip rather than discarding it. */}
      {ripping && (
        <div className={`rip-overlay rip-full ${tab === 'shop' ? '' : 'hidden'}`}>
          <Chunk label="Tearing the wrapper…">
          <PackOpening
            key={ripping.nonce ?? 0}
            set={ripping.set}
            product={ripping.product}
            uid={ripping.uid}
            paused={tab !== 'shop'}
            costBasis={ripping.cost}
            onExit={exitRip}
            ripAnotherStock={ripStock}
            onRipAnother={() => ripAnother(ripping.set, ripping.product)}
          />
          </Chunk>
        </div>
      )}

      {/* ⚡ Sift-rip overlay — churns a group of sealed, stopping on big-hit packs. Visible on
          whatever tab you launched it from (it owns the whole flow, so no tab gating). */}
      {sifting && (
        <div className="rip-overlay rip-full">
          <Chunk label="Opening the box…"><AutoRip items={sifting} onExit={exitSift} /></Chunk>
        </div>
      )}

      {picked && <Chunk><CardModal card={picked} onClose={() => setPicked(null)} /></Chunk>}
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
// heartbeat (Fri–Sun swells, midweek thins) and the month is the season's: December is
// the gift rush (🎁), January the lull, summer belongs to the kids.
function GameClock() {
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const mon = monthName(monthsElapsed)
  const yr = yearOf(monthsElapsed)
  return (
    <span className="clock-chip">
      📅 {weekdayOf(absoluteDay(currentDay, monthsElapsed))} · Day {currentDay} · {mon}{yr > 1 ? ` Y${yr}` : ''}{mon === 'Dec' ? ' 🎁' : ''}
    </span>
  )
}

// Per-day summary — shown after clicking "Next Day". A satisfying end-of-day recap: the
// headline net-cash + net-worth, what actually SOLD (with the biggest sale called out),
// how the market moved, new collectors who found you, and the overhead that hit.
function DaySummary({ summary, onClose }) {
  const { cashDelta, added, listingsSold, listingOffers, premiumOffers, wages, rent, lease, payroll, storage,
    resolvedGrades, binderFiled, binderReserved, wantsBrokered, brokerProceeds, offersAccepted, keeperStocked, keeperBroke, saleProceeds, notoDelta,
    missedOnline, missedWalkin, days, showName,
    soldNames, bigSale, newWants, regularCalls, regularsWon, marketMovers, netWorth, lifeEvents, counterIncome, suppliesIncome, suppliesSold, machineIncome, machineSold, binIncome, binSold, binTurnedAway, wholesaleIncome, floor, hype, hypeDelta, notoBySrc } = summary
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const missed = (missedOnline || 0) + (missedWalkin || 0)
  const movers = marketMovers || []
  const sold = soldNames || []
  const events = lifeEvents || []
  // !! matters: this is an || chain over NUMBERS, so a floor where you bought and sold nothing
  // evaluates to the last operand — the number 0, not false — and `{floorActive && …}` below
  // rendered a bare "0" into the recap.
  const floorActive = !!(floor && (floor.spent || floor.earned || floor.notoGained || floor.acquired || floor.rapport))
  const hasActivity = added || listingsSold || listingOffers || resolvedGrades || binderFiled || binderReserved || wantsBrokered
    || offersAccepted || keeperStocked || wages || rent || lease
    || payroll || storage || saleProceeds || notoDelta || missed || binTurnedAway || movers.length || newWants || regularCalls || regularsWon || events.length || floorActive
  // A show trip recaps the whole time away ("Back from … · N days"); a single Next Day is
  // just the day you entered.
  const multiDay = days > 1
  return (
    <Modal onClose={onClose} className="recap" maxWidth={430} label="Day summary">
      <>
      {/* recap body */}
        <h2 style={{ marginBottom: 2, textAlign: 'center' }}>{showName ? `🎪 Back from ${showName}` : `📅 ${weekdayOf(absoluteDay(currentDay, monthsElapsed))} · Day ${currentDay} · ${monthName(monthsElapsed)}`}</h2>
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
                {binIncome > 0 && <div className="recap-line"><span className="muted">🗑️ Bulk bin ({binSold} card{binSold === 1 ? '' : 's'})</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(binIncome)}</b></div>}
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
            {(added > 0 || listingOffers > 0 || premiumOffers > 0 || newWants > 0 || regularCalls > 0 || regularsWon > 0 || resolvedGrades > 0 || binderFiled > 0 || binderReserved > 0 || keeperStocked > 0 || notoDelta > 0) && (
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
                {keeperStocked > 0 && <div className="recap-line"><span className="muted">🪓 Bin Keeper stocked {keeperStocked} pack{keeperStocked === 1 ? '' : 's'}{keeperBroke > 0 ? ` (broke ${keeperBroke} product${keeperBroke === 1 ? '' : 's'} down)` : ' from backstock'}</span></div>}
                {/* Say WHY a slot stayed empty — otherwise the reserve reads as the Curator
                    quietly not doing its job. */}
                {binderReserved > 0 && <div className="recap-line"><span className="muted">🎚️ {binderReserved} slot{binderReserved === 1 ? '' : 's'} left open — only copy reserved to grade & sell</span></div>}
                {notoDelta > 0 && (
                  <div className="recap-line">
                    <span className="muted">⭐ Reputation{(notoBySrc || []).length > 0 && (
                      <span className="muted" style={{ fontSize: 12 }}> ({notoBySrc.map(([tag, d]) => `${repSourceLabel(tag).split(' ')[0]} ${d > 0 ? '+' : ''}${d}`).join(' · ')})</span>
                    )}</span>
                    <b style={{ color: 'var(--gold)' }}>+{Math.round(notoDelta * 10) / 10}★</b>
                  </div>
                )}
                {hype >= 10 && <div className="recap-line"><span className="muted">🔥 Shop heat</span><b style={{ color: 'var(--orange, #ff9f43)' }}>{Math.round(hype)}{hypeDelta > 0 ? ` (+${Math.round(hypeDelta)})` : ' (fading)'}</b></div>}
              </div>
            )}

            {/* Life events — what happened while time passed */}
            {events.length > 0 && (
              <div className="recap-sec">
                <div className="recap-sec-h">📆 While time passed</div>
                {events.map((e, i) => (
                  <div className="recap-line recap-event" key={i}>
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

            {/* Kids who walked up to an empty quarter box. A miss, not a sale — so it sits
                with the other misses rather than hiding under the bin's income line. */}
            {binTurnedAway > 0 && (
              <div className="recap-line" style={{ color: 'var(--red)', marginTop: 4 }}>
                <span>🗑️ {binTurnedAway} kid{binTurnedAway === 1 ? '' : 's'} found the quarter box empty</span>
                <span className="muted">stock the bulk bin</span>
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
  const rank = useGame(s => s.rank || 0) // 🏅 banked ladder rank — the door for rank-gated accounts
  const clout = useGame(s => s.clout || 0) // 🎫 spendable favors (restock calls live here on the Buy tab)
  const cloutRestock = useGame(s => s.cloutRestock)
  const upgrades = useGame(s => s.upgrades) // ⛩️ Import License gates the Japan Direct account
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
  const unlocked = distributorUnlocked(dist, notoriety, upgrades, rank)
  const catalog = distributorCatalog(dist, SHOP_SETS, weekIndex)
  // Greg flags one set's box as a clearance lot each week — a steep, thin-stock steal.
  const clearanceSetId = dist.clearance && catalog.length ? catalog[weekIndex % catalog.length].id : null
  const showSupply = unlocked && dist.supply && lvl.level >= dist.supplyMinLevel

  return (
    <>
      <DistributorPicker distributorState={distributors} notoriety={notoriety} upgrades={upgrades} rank={rank} selected={distId} onSelect={setDistId} vintageDists={vintageDists} />

      {/* 🚢 Import orders still crossing the Pacific — visible whichever shelf you're browsing */}
      <ImportsInTransit />

      {/* 🔨 The auction house: the buy side of the hammer, alongside the wholesale shelves */}
      <AuctionHouse />

      {/* 📰 Reprint wave: industry news — shows whichever storefront is selected */}
      <ReprintWaveBanner cash={cash} flash={flash} />

      {/* Buy-tab intel (each self-gates on its upgrade): 📈 demand + movers · 📐 rip EV */}
      <HobbyWire />
      <BreakersAlmanac />

      {/* 🧮 Purchasing Agent's reorder-points ledger (self-gates on the upgrade) */}
      <ReorderPanel />

      {!unlocked ? (
        <LockedDistributor dist={dist} notoriety={notoriety} rank={rank} />
      ) : dist.marketplace ? (
        /* 📱 A listings channel, not a shelf: no catalog, no stock, no rapport, no credit
           line. Individuals do not extend you net terms. */
        <LocalMarket />
      ) : (<>
      <RapportBanner dist={dist} rec={rec} lvl={lvl} />
      {/* 🎫 Clout spend: something on this shelf sold out — a favor gets the truck there early. */}
      {rank >= 1 && Object.values(rec.stock || {}).some(v => (v?.q ?? 1) <= 0) && (
        <div style={{ margin: '8px 0' }}>
          <button className="btn alt" style={{ padding: '4px 10px', fontSize: 12 }} disabled={clout < 2}
            title={clout < 2 ? 'Needs 2 🎫 clout (rank-ups, god packs, clean-sweep goal weeks)' : `Spend 2 🎫 clout — ${dist.name} finds you a delivery and the whole shelf refills today`}
            onClick={() => { const r = cloutRestock(distId); flash(r.error || `📦 ${dist.name} took the call — shelf's full again.`) }}>
            📦 Call in a favor — restock {dist.name} · 2 🎫 (you have {Math.floor(clout)})
          </button>
        </div>
      )}

      {showSupply && (
        <SupplyPanel dist={dist} lvl={lvl} supplyVendors={supplyVendors} supplyChannel={supplyChannel} cash={cash} flash={flash} />
      )}

      <div className="banner" style={{ marginTop: 14 }}>
        {dist.icon} <b style={{ color: dist.color }}>{dist.name}</b> — {dist.blurb}
        {dist.japanese
          ? <>{' '}Sealed priced off the <b>real JP singles market</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); JP boosters rip 5 cards on their own hit ladder. 🚢 Orders land in ~{dist.leadDays} days.</>
          : <>{' '}Live <b>TCGplayer sealed prices</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); each product rips into its real pack count.</>}
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
          {groupByEra(catalog).map(era => (
            <DistributorEraCard key={era.series} era={era} dist={dist} lvl={lvl} stock={rec.stock}
              cash={cash} onBuy={onBuy} clearanceSetId={clearanceSetId} owned={ownedCounts}
              onCredit={onCredit} split={split} creditAvail={creditAvail} weekIndex={weekIndex} />
          ))}
        </div>
      )}

      <VintageShelf dist={dist} rec={rec} weekIndex={weekIndex} cash={cash} onBuyVintage={onBuyVintage} onCredit={onCredit} split={split} creditAvail={creditAvail} />
      </>)}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}

// 📰 The reprint-wave preorder banner (Buy tab). Shows the active wave: what's restocking,
// days to drop, your allocation at the locked unit price, and how many locals have paid
// deposits at your counter. The lifecycle itself lives in the day-tick; committing here
// goes through sourcing.preorderWave (prepaid — stock lands in the storeroom on drop day).
function ReprintWaveBanner({ cash, flash }) {
  const wave = useGame(s => s.reprintWave)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const preorderWave = useGame(s => s.preorderWave)
  const rank = useGame(s => s.rank || 0)
  const clout = useGame(s => s.clout || 0)
  const cloutJumpAllocation = useGame(s => s.cloutJumpAllocation)
  useGame(s => s.marketMults) // the announcement dip moves the strike-through retail
  const [qty, setQty] = useState(1)
  if (!wave || wave.doneDay != null) return null
  const absNow = absoluteDay(currentDay, monthsElapsed)
  if (absNow >= wave.dropDay) return null
  const daysLeft = wave.dropDay - absNow
  const room = Math.max(0, (wave.allocCap || 0) - (wave.preordered || 0))
  const q = Math.max(1, Math.min(qty, Math.max(1, room)))
  const cost = round2(q * wave.unit)
  const waveSet = setById(wave.setId)
  return (
    <div className="banner" style={{ marginTop: 12, borderColor: 'var(--gold, #ffd45e)' }}>
      📰 <b>Reprint wave</b> — <b>{wave.label}</b> restocks in <b>{daysLeft} day{daysLeft > 1 ? 's' : ''}</b>.
      {' '}Allocation via {wave.distName}: <b>{wave.preordered}/{wave.allocCap}</b> committed at <b>{fmtMoney(wave.unit)}</b> each
      {waveSet ? <> (retail ~{fmtMoney((waveSet.products || []).find(p => p.type === wave.productType)?.price || 0)})</> : null}.
      {(wave.custPreorders || 0) > 0 && <> <span className="pill" style={{ background: '#ffd45e22', color: 'var(--gold, #ffd45e)' }}
        title="Locals who paid deposits at your counter — they pick up (and pay the balance at retail + a premium) on drop day. Short them and it's refunds + a grudge.">
        🧾 {wave.custPreorders} local deposit{wave.custPreorders > 1 ? 's' : ''} riding on it</span></>}
      {room > 0 ? (
        <span className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center', display: 'inline-flex', marginLeft: 8 }}>
          <button className="btn alt" style={{ flex: 'none', padding: '2px 9px' }} onClick={() => setQty(v => Math.max(1, v - 1))}>−</button>
          <b>{q}</b>
          <button className="btn alt" style={{ flex: 'none', padding: '2px 9px' }} onClick={() => setQty(v => Math.min(room, v + 1))}>+</button>
          <button className="btn gold" style={{ flex: 'none', padding: '4px 10px', fontSize: 12 }} disabled={cash < cost}
            onClick={() => { const r = preorderWave(q); flash(r.error || `📰 Preordered ${r.bought} — lands on drop day.`); if (!r.error) setQty(1) }}>
            Preorder {q} · {fmtMoney(cost)}
          </button>
        </span>
      ) : <b style={{ marginLeft: 8 }}> Allocation fully committed.</b>}
      {/* 🎫 Clout spend: argue your way into a bigger slice of the wave (once per wave). */}
      {!wave.allocBonus && rank >= 2 && (
        <button className="btn alt" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }} disabled={clout < 3}
          title={clout < 3 ? 'Needs 3 🎫 clout' : `Spend 3 🎫 clout — your rep argues the rep into a bigger slice (cap ${wave.allocCap} → ${Math.ceil(wave.allocCap * 1.5)})`}
          onClick={() => { const r = cloutJumpAllocation(); flash(r.error || `📰 Queue jumped — your cap is now ${r.allocCap}.`) }}>
          🎫 Jump the queue · 3 🎫
        </button>
      )}
    </div>
  )
}

// The distributor credit line — a single global account (limit scales with net worth). Shows
// the balance / limit / available, a Cash⇄Credit toggle that routes every buy on this tab, and
// pay-down controls. Carrying a balance accrues monthly interest; the minimum auto-pays from
// cash each month, and missing it freezes the line (surfaced here) until you pay it down.
function CreditPanel({ balance, limit, avail, min, frozen, cash, payMode, setPayMode, onPay }) {
  const canUseCredit = !frozen && avail > 0
  const hasBalance = balance > 0.005
  // 🏦 Preferred Account shows its cheaper carry — the panel must quote the real rate.
  const preferred = useGame(s => !!s.upgrades.preferredAccount)
  const ratePct = +( (preferred ? creditMonthlyRate({ preferredAccount: true }) : CREDIT_MONTHLY_RATE) * 100).toFixed(1)
  // A credit mode the line can't back reads as Cash (matches the Shop's onCredit/split gating).
  const active = canUseCredit ? payMode : 'cash'
  const creditTitle = frozen ? 'Frozen — pay your balance down to buy on credit again'
    : avail <= 0 ? 'No credit available yet — your line grows with your net worth (and frees up as you pay down the balance)'
    : `up to ${fmtMoney(avail)} available`
  // Collapsible (mobile declutter): the header always shows the load-bearing numbers —
  // balance owed + open credit + the active pay mode — so closed still informs; the mode
  // toggle and pay-down buttons live in the body. Sticky open state, desktop-open default.
  const [openPanel, togglePanel] = useOpen('pv-col-credit', bigScreen())
  return (
    <div className={`credit-panel ${frozen ? 'frozen' : ''}`}>
      <div className="credit-top" role="button" tabIndex={0} aria-expanded={openPanel}
        style={{ cursor: 'pointer', userSelect: 'none' }} onClick={togglePanel}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel() } }}>
        <div className="credit-head">💳 Credit line{frozen && <span className="credit-badge">FROZEN</span>}</div>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {hasBalance ? <><b className="credit-owe">{fmtMoney(balance)}</b> owed · </> : null}
          <b className="credit-avail">{fmtMoney(avail)}</b> open
          {active !== 'cash' && <> · paying {active === 'split' ? '🔀 cash+credit' : '💳 credit'}</>}
        </span>
        <span className="muted" style={{ marginLeft: 'auto' }}>{openPanel ? '▾' : '▸'}</span>
      </div>
      {openPanel && (<>
      <div className="credit-toggle" role="group" aria-label="Pay with" style={{ marginTop: 8 }}>
        <button className={`btn ${active === 'cash' ? 'gold' : 'alt'}`} onClick={() => setPayMode('cash')}
          title="Pay with cash on hand">💵 Cash</button>
        <button className={`btn ${active === 'split' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          title={canUseCredit ? `Pay cash first, then put the rest on credit (${creditTitle})` : creditTitle}
          onClick={() => setPayMode('split')}>🔀 Cash + Credit</button>
        <button className={`btn ${active === 'credit' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          title={canUseCredit ? `Charge buys to your credit line (${creditTitle})` : creditTitle}
          onClick={() => setPayMode('credit')}>💳 Credit</button>
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
      </>)}
    </div>
  )
}

// 🧮 The Purchasing Agent's reorder-points ledger: one stepper per product TYPE across the
// buyable shop list (incl. the 🎌 import shelf once licensed). The agent tops every set that
// carries the type up to the minimum overnight — see the day tick for the buying rules.
function ReorderPanel() {
  const owned = useGame(s => !!s.upgrades.purchasingAgent)
  const pointsRaw = useGame(s => s.reorderPoints)
  const setReorderPoint = useGame(s => s.setReorderPoint)
  const hasImport = useGame(s => !!s.upgrades.importLicense)
  const types = useMemo(() => {
    const m = new Map() // type -> { icon, sets }
    for (const st of [...SHOP_SETS, ...(hasImport ? JP_SHOP_SETS : [])]) {
      for (const p of setProducts(st)) {
        const cur = m.get(p.type) || { icon: p.icon || '📦', sets: 0 }
        cur.sets++
        m.set(p.type, cur)
      }
    }
    return [...m.entries()].sort((a, b) => b[1].sets - a[1].sets)
  }, [hasImport])
  if (!owned) return null
  const points = pointsRaw || {}
  const nActive = Object.values(points).filter(v => v > 0).length
  return (
    <Collapse id="reorder" className="market-panel" headClass="market-head" style={{ marginTop: 12 }}
      head="🧮 Reorder points" defaultOpen={bigScreen()}
      badge={nActive > 0 ? `${nActive} active` : 'off'}
      hint="— the Purchasing Agent restocks every set to these minimums overnight: cheapest unlocked distributor first at your rapport price, counting stock on hand, at shows, and 🚢 in transit.">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {types.map(([type, info]) => {
          const q = points[type] || 0
          return (
            <span key={type} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: q > 0 ? 1 : 0.65 }}>
              {info.icon} {type} <small className="muted">· {info.sets} set{info.sets > 1 ? 's' : ''}</small>
              <button className="btn alt" style={{ flex: 'none', padding: '0 8px' }} disabled={q <= 0}
                onClick={() => setReorderPoint(type, q - 1)} aria-label={`Lower ${type} minimum`}>−</button>
              <b style={{ minWidth: 14, textAlign: 'center' }}>{q}</b>
              <button className="btn alt" style={{ flex: 'none', padding: '0 8px' }} disabled={q >= 9}
                onClick={() => setReorderPoint(type, q + 1)} aria-label={`Raise ${type} minimum`}>+</button>
            </span>
          )
        })}
      </div>
    </Collapse>
  )
}

// 🚢 Import orders still on the water: what's coming and when it lands. Rendered on the
// Buy tab whenever anything is in transit, whichever distributor shelf is selected.
function ImportsInTransit() {
  const imports = useGame(s => s.imports)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  if (!imports?.length) return null
  const absNow = absoluteDay(currentDay, monthsElapsed)
  return (
    <div className="banner" style={{ marginTop: 12, borderColor: '#ff5e6c66' }}>
      🚢 <b>On the water</b> — {imports.map((sh, i) => {
        const d = Math.max(0, (sh.arrivesDay ?? 0) - absNow)
        const nm = setById(sh.setId)?.name || 'JP'
        return (
          <span key={sh.id || i}>
            {i > 0 && ' · '}
            {sh.qty}× {sh.type} <span className="muted">({nm})</span> — <b>{d <= 0 ? 'lands today' : `${d} day${d > 1 ? 's' : ''} out`}</b>
          </span>
        )
      })}
    </div>
  )
}

// A distributor that won't open a wholesale account with you yet. Two flavors: the big
// wholesaler wants NOTORIETY (a bar you climb), the import channel wants the ⛩️ Import
// License UPGRADE (a purchase). Shown in place of their shelves so each reads as a goal.

// What a sealed product actually is, in one line. The playtest's complaint was that the Buy
// tab lists a dozen product types and never says how any of them differ — "Booster Pack" and
// "Sleeved Pack" cost different money for what looks like the same thing.

// A new build is downloaded and waiting. Shown rather than applied: yanking the page out
// from under a pack rip to install a copy change is worse than being a build behind. One
// tap flushes the save and reloads onto the new version.
function productBlurb(product) {
  const t = String(product?.type || '')
  const packs = product?.packs || 1
  const base = /sleeved/i.test(t)
    ? 'The same booster pack in a sealed foil sleeve — the wrapper can\'t be felt or weighed through it, so retailers hang them where a loose pack would get searched. Same cards, small premium for the protection.'
    : /booster box/i.test(t) ? `A retail box of ${packs} boosters — the cheapest way to buy packs by the pack, and the standard unit for a real break.`
    : /elite trainer/i.test(t) ? `An ETB: ${packs} packs plus sleeves, dice and a storage box${product?.bonus ? ', and a guaranteed promo card' : ''}. Priced for the accessories as much as the packs.`
    : /blister/i.test(t) ? `A hanging retail blister — ${packs} pack${packs > 1 ? 's' : ''}${product?.bonus ? ' with a guaranteed promo' : ''}.`
    : /tin/i.test(t) ? `A collector's tin — ${packs} packs${product?.bonus ? ' and a promo' : ''} in reusable packaging.`
    : /bundle/i.test(t) ? `A booster bundle — ${packs} packs, no extras, usually the best packs-per-dollar of the small products.`
    : /premium|collection/i.test(t) ? `A premium collection — ${packs} packs built around a chase promo card.`
    : /case/i.test(t) ? `A sealed case${product?.boxes ? ` of ${product.boxes} boxes` : ''} — distributor quantity, at distributor pricing.`
    : /^booster pack$/i.test(t) ? 'A single loose booster — 10 cards. The cheapest way in, and the most -EV per dollar.'
    : `${packs} pack${packs > 1 ? 's' : ''} of sealed product.`
  return base
}

function LockedDistributor({ dist, notoriety, rank = 0 }) {
  // 🏅 Rank-gated account (D&A): the door is the BANKED ladder rank — show the checklist
  // shape (⭐ threshold + any-2-deeds), not just a number to grind.
  const targetRank = dist.minRank != null ? RANKS[dist.minRank] : null
  const deedsHave = useGame(s => targetRank ? deedsDone(s, dist.minRank) : 0)
  if (dist.requiresUpgrade) {
    const u = UPGRADES[dist.requiresUpgrade]
    return (
      <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>{u?.icon || '🔒'}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: dist.color }}>{dist.icon} {dist.name} needs the {u?.name || 'right paperwork'}</div>
        <p className="muted" style={{ fontSize: 13, margin: '8px auto 0', maxWidth: 440 }}>
          Importing means customs, freight, and a wholesale account overseas — buy the
          <b> {u?.icon} {u?.name}</b> {u ? <>({fmtMoney(u.cost)}) </> : ''}in <b>⚙️ → Upgrades</b> and this shelf opens for good.
        </p>
      </div>
    )
  }
  const need = dist.minNotoriety || 0
  const pct = Math.min(100, Math.round(((notoriety || 0) / need) * 100))
  return (
    <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66', textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: dist.color }}>{dist.icon} {dist.name} isn't taking accounts your size yet</div>
      <p className="muted" style={{ fontSize: 13, margin: '8px auto 12px', maxWidth: 440 }}>
        {targetRank
          ? <>A hobby giant this size wants a résumé, not just a number: become a <b>{targetRank.emoji} {targetRank.name}</b> — reach <b>⭐ {targetRank.min}</b> and prove yourself ({DEEDS_NEEDED} of: {targetRank.deeds.map(d => d.label.toLowerCase()).join(' · ')}) — and they'll come to the table.</>
          : <>A hobby giant this size only opens a wholesale account with an established name. Build your
            <b> reputation</b> — run shows, fill wants, move product — and they'll come to the table.</>}
      </p>
      <div className="distrib-bar" style={{ maxWidth: 320, margin: '0 auto' }}>
        <div style={{ width: pct + '%', background: dist.color }} />
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        <b style={{ color: dist.color }}>{Math.round(notoriety || 0)}</b> / {need} reputation
        {targetRank && <> · deeds <b style={{ color: dist.color }}>{Math.min(deedsHave, DEEDS_NEEDED)}</b> / {DEEDS_NEEDED}</>}
        {rank >= (dist.minRank ?? 99) && ' · rank met!'}
      </div>
    </div>
  )
}

// Pick which distributor you're buying from. Each chip shows their icon, name, and your
// rapport (filled stars), tinted with their brand colour.
function DistributorPicker({ distributorState, notoriety, upgrades, rank = 0, selected, onSelect, vintageDists }) {
  return (
    <div className="distrib-picker">
      {DISTRIBUTORS.map(d => {
        const rec = distributorState[d.id] || { spend: 0 }
        const level = rapportLevel(rec.spend).level
        const max = RAPPORT_LEVELS.length - 1
        const locked = !distributorUnlocked(d, notoriety, upgrades, rank)
        const needsUpgrade = locked && d.requiresUpgrade
        const rankGate = locked && !needsUpgrade && d.minRank != null ? RANKS[d.minRank] : null
        const hasVintage = !locked && vintageDists?.has(d.id)
        return (
          <button key={d.id} className={`distrib-chip ${selected === d.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
            style={{ '--dc': d.color }} onClick={() => onSelect(d.id)}
            title={needsUpgrade ? `Locked — needs the ${UPGRADES[d.requiresUpgrade]?.name || 'right'} upgrade (⚙️ → Upgrades)`
              : rankGate ? `Locked — become a ${rankGate.emoji} ${rankGate.name} (rank ${d.minRank}) to open an account`
              : locked ? `Locked — reach ${d.minNotoriety} reputation to open an account`
              : hasVintage ? `${d.name} has vintage sealed on the shelf this week` : undefined}>
            {hasVintage && <span className="dc-vintage" title="Vintage in stock this week" aria-label="Vintage in stock">🗝️</span>}
            <span className="dc-icon">{d.icon}</span>
            <span className="dc-name">{d.name}</span>
            {needsUpgrade
              ? <span className="dc-rep" aria-label={`Locked — needs the ${UPGRADES[d.requiresUpgrade]?.name} upgrade`}>🔒 {UPGRADES[d.requiresUpgrade]?.icon || '⛩️'}</span>
              : rankGate
              ? <span className="dc-rep" aria-label={`Locked — ${rankGate.name} rank needed`}>🔒 {rankGate.emoji}</span>
              : locked
              ? <span className="dc-rep" aria-label={`Locked — ${d.minNotoriety} reputation needed`}>🔒 {d.minNotoriety}</span>
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

// Group a distributor's catalog into ERAS, preserving the catalog's own set order inside each
// one. The shelf reads Era → Set → Product, which is the shape the product line actually has:
// an Elite Trainer Box belongs to a set, but an Ultra Premium Collection belongs to a whole
// era, and until there was an era level there was nowhere to put one.
function groupByEra(sets) {
  const byEra = new Map()
  for (const s of sets) {
    const key = s.series || 'Other'
    if (!byEra.has(key)) byEra.set(key, { series: key, sets: [] })
    byEra.get(key).sets.push(s)
  }
  // Cross-set product hangs off the era, above its sets.
  for (const era of byEra.values()) {
    era.products = ERA_PRODUCTS.filter(p => p.pool?.series === era.series)
  }
  return [...byEra.values()]
}

// One ERA on the shelf. Collapsed by default like the set rows beneath it, so the shop still
// opens as a short scannable list however many products the era carries.
function DistributorEraCard({ era, dist, lvl, stock, cash, onBuy, clearanceSetId, owned, onCredit, split, creditAvail, weekIndex = 0 }) {
  const [open, setOpen] = useState(false)
  const credit = { onCredit, split, creditAvail }
  // 👑 Collector product is shelf-filtered too. A corner shop has one of these in at a time,
  // not the whole era's back catalogue — see game/shelf.js.
  const eraProducts = shelfEraProducts(dist, era.products, era.series, weekIndex)
  const nProducts = era.sets.reduce((a, s) => a + shelfProducts(dist, setProducts(s), s, weekIndex).length, 0) + eraProducts.length
  return (
    <div className={`product era-acc ${open ? 'open' : ''}`}>
      <button className="set-head era-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="set-head-info">
          <span className="set-head-name">{era.series}</span>
          <span className="meta">
            {era.sets.length} set{era.sets.length !== 1 ? 's' : ''} · {nProducts} product{nProducts !== 1 ? 's' : ''}
            {eraProducts.length ? ` · ${eraProducts.length} collector piece${eraProducts.length !== 1 ? 's' : ''}` : ''}
          </span>
        </span>
        <span className="set-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="era-body">
          {/* Era-wide product first — a UPC isn't a Lost Origin product, it's a Sword & Shield one. */}
          {eraProducts.length > 0 && (
            <div className="era-products">
              <div className="era-products-head">👑 Collector product — rips packs from across the {era.series} era</div>
              {eraProducts.map(p => (
                <EraProductRow key={p.tcgId} dist={dist} product={p} lvl={lvl} cash={cash}
                  onBuy={onBuy} owned={owned} {...credit} />
              ))}
            </div>
          )}
          {era.sets.map(set => (
            <DistributorSetCard key={set.id} dist={dist} set={set} lvl={lvl} stock={stock}
              cash={cash} onBuy={onBuy} clearance={set.id === clearanceSetId} owned={owned}
              onCredit={onCredit} split={split} creditAvail={creditAvail} weekIndex={weekIndex} />
          ))}
        </div>
      )}
    </div>
  )
}

// One cross-set product line. Buys through the ordinary product path — it just resolves its
// own anchor set first, since held sealed is keyed by setId.
function EraProductRow({ dist, product, lvl, cash, onBuy, owned, onCredit, split, creditAvail }) {
  const anchor = eraAnchorSet(product)
  // 🚫 Collector product is exactly what a shop rations, so the sign belongs here most of all.
  // Read through the same store check the shelf rows and both buy paths use.
  const lim = useGame(s => (anchor ? s.purchaseLimitFor(dist.id, anchor, product) : { limit: Infinity, left: Infinity }))
  if (!anchor) return null
  const price = distributorPrice(dist, product.price, lvl.level, { product, set: anchor })
  const afford = cash >= price || (onCredit && creditAvail >= price) || (split && cash + creditAvail >= price)
  const spent = lim.left <= 0
  return (
    <div className="prodrow era-prodrow">
      <span className="prod-name">
        {product.icon} {product.name}
        {lim.limit !== Infinity && (
          <span className={`limit-chip ${spent ? 'spent' : ''}`}
            title={spent
              ? `You have had your ${lim.limit} today. The shelf resets tomorrow${lim.limit < 4 ? ' — and a shop that knows you lets you take more' : ''}.`
              : `${dist.name} rations this: ${lim.limit} per customer per day${lim.level > 0 ? ' — up from 1, because they know you' : ''}. ${lim.left} left today.`}>
            🚫 {spent ? 'had yours today' : `${lim.limit}/customer`}
          </span>
        )}
        <span className="muted" style={{ fontSize: 12, display: 'block' }}>
          {product.packs} pack{product.packs !== 1 ? 's' : ''} from across the {product.pool.series} era
          {product.bonus === 'promo' ? ' · 🎁 promo' : ''}
        </span>
      </span>
      <button className="btn" disabled={!afford || spent}
        title={spent ? `${dist.name} limits this to ${lim.limit} per customer a day, and you have had yours. Back tomorrow.`
          : afford ? `Buy for ${fmtMoney(price)}` : 'Not enough cash'}
        onClick={() => onBuy(dist.id, anchor, { ...product, _buyPrice: price, _distId: dist.id }, 1, { onCredit, split })}>
        {fmtMoney(price)}
      </button>
    </div>
  )
}

// One set on a distributor's shelf: its products (priced at your rapport), plus a case
// lot (if they sell cases and you've earned it) and a clearance lot (Greg, weekly).
function DistributorSetCard({ dist, set, lvl, stock, cash, onBuy, clearance, owned, onCredit, split, creditAvail, weekIndex = 0 }) {
  // 🛒 What THIS retailer stocks, not the full manufacturer lineup — a small shop carries
  // boxes, packs and one impulse line, not four artwork variants of the same blister. See
  // game/shelf.js; the shelf is deterministic per (set, week), never per render.
  const products = shelfProducts(dist, setProducts(set), set, weekIndex)
  const showCases = dist.cases && lvl.level >= dist.casesMinLevel
  const lot = showCases ? caseLot(set) : null
  const box = [...products].sort((a, b) => b.packs - a.packs)[0]
  const credit = { onCredit, split, creditAvail }
  // Collapsed by default: the shelf opens as a scannable list of set logos; tap a row to expand
  // its products. Summary on the collapsed row = how many lines and the cheapest one, at rapport.
  const [open, setOpen] = useState(false)
  const count = products.length + (lot ? 1 : 0) + (clearance && box ? 1 : 0)
  const cheapest = products.length ? Math.min(...products.map(p => distributorPrice(dist, p.price, lvl.level, { product: p, set }))) : 0
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
            /* keyed on tcgId, not type — a set carries several products per type now */
            <StockButton key={p.tcgId || p.type} dist={dist} set={set} product={p} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} owned={owned} {...credit} />
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
  const ownedN = owned?.get(`${set.id}|${productTypeLabel(product)}`) || 0 // sealed copies of this exact line you already hold
  let price
  if (product._case) price = distributorCasePrice(dist, { retail: product._retail }, lvl.level)
  else if (product._clearance) price = round2(distributorPrice(dist, product._clearanceOf, lvl.level, { product, set }) * 0.65)
  else price = distributorPrice(dist, product.price, lvl.level, { product, set })

  const { q: stockQty, cap, out } = stockState(dist, stock, set, product, lvl.level)
  const days = out ? daysToRestock(dist, stockQty, cap) : 0
  // How many you can buy right now: at least 1 if in stock, capped by stock and your spendable
  // funds — cash, your open credit line (pure credit), or cash + credit together (split).
  const spendable = onCredit ? creditAvail : split ? round2(cash + creditAvail) : cash
  const useCredit = onCredit || split // a credit mode is in play (badge/label/opts)
  const affordable = price > 0 ? Math.floor(spendable / price) : 999
  // 🚫 "1 per customer" on the collector product, relaxed for a regular. Read here so the
  // stepper cannot even be pushed past it — a limit you discover at the till is a worse
  // experience than a limit printed on the shelf, which is why real shops print it.
  const rapportLvl = lvl?.level || 0
  const lim = useGame(s => s.purchaseLimitFor(dist.id, set, product))
  const perCustomer = lim.limit
  const limitLeft = lim.left
  const maxBuy = out ? 0 : Math.max(0, Math.min(Math.max(1, Math.floor(stockQty)), affordable, limitLeft))

  const [buyQty, setBuyQty] = useState(1)
  const qN = Math.min(Math.max(1, Math.floor(buyQty) || 1), Math.max(1, maxBuy))
  const clampSet = (v) => setBuyQty(Math.min(Math.max(1, Math.floor(v) || 1), Math.max(1, maxBuy)))
  const canBuy = !out && maxBuy >= 1

  const retail = product._clearance ? product._clearanceOf : product._case ? product._retail : product.price
  const showStrike = price < (retail || 0) - 0.005
  const total = round2(price * qN)
  // 🔥 Fresh-drop hype: the struck-through number above is the market price; this explains
  // why the ask sits over it. (There's no MSRP shelf — a shop owner buys drops scalped.)
  const surge = hypeSurge(set)
  // …but never claim a MARKUP on a row that is already showing a DISCOUNT. A clearance box
  // struck through $373.91, asked $247.42, and still wore a "🔥 +45%" badge — two opposite
  // claims about one price, with the tooltip citing the struck-through figure as "the market"
  // it was 45% above. The surge note only means anything when the ask sits ABOVE that figure,
  // which is exactly when showStrike is false (clearance and case lots both sit below it).
  const priceNote = surge > 1.02 && !showStrike
    ? `🔥 Fresh-drop markup: +${Math.round((surge - 1) * 100)}% over the ${fmtMoney(retail)} market. It's worth market the moment you own it — patience is the discount.`
    : null

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
            : `📋 Standing order: auto-buy ${qN}× ${productTypeLabel(product)} every week at your rapport price (while stocked & cash allows). One product at a time — setting this moves it here.`}
          onClick={() => setSO(soHere ? null : { distId: dist.id, setId: set.id, type: product.type, qty: qN })}>📋</button>
      )}
      <button className={`prodbtn ${product._case ? 'caselot' : ''} ${product._clearance ? 'clearance' : ''} ${out ? 'out' : ''} ${useCredit && canBuy ? 'on-credit' : ''}`}
        disabled={!canBuy}
        onClick={() => onBuy(dist.id, set, { ...product, _buyPrice: price, _distId: dist.id }, qN, { onCredit, split })}
        title={out ? `Sold out — restocks in ~${days}d`
          : limitLeft <= 0 ? `${dist.name} limits this to ${perCustomer} per customer a day, and you have had yours. Back tomorrow.`
          : `${product.packs} pack${product.packs > 1 ? 's' : ''}${product.bonus ? ' + promo' : ''} · ${Math.floor(stockQty)}/${cap} in stock · up to ${maxBuy} buyable now${onCredit ? ' — charged to your 💳 credit line' : split ? ' — cash first, then your 💳 credit line' : ''}${priceNote ? `\n\n${priceNote}` : ''}`}>
        <span className="prodname" title={productBlurb(product)}>{useCredit ? '💳 ' : ''}{product.icon} {productTypeLabel(product)}</span>
        {ownedN > 0 && <span className="prodowned" title={`You already hold ${ownedN} sealed ${productTypeLabel(product)} of ${set.name}`}>📦 {ownedN}</span>}
        <span className="prodmeta">{product.packs} pk{product.bonus ? ' +🎁' : ''}{product._case && product.boxes ? ` · ${product.boxes} boxes` : ''}
          {perCustomer !== Infinity && (
            <span className={`limit-chip ${limitLeft <= 0 ? 'spent' : ''}`}
              title={limitLeft <= 0
                ? `You have had your ${perCustomer} today. The shelf resets tomorrow${perCustomer < 4 ? ` — and a shop that knows you lets you take more (rapport ${rapportLvl} → ${Math.min(4, perCustomer + 1)} at the next tier)` : ''}.`
                : `${dist.name} rations this: ${perCustomer} per customer per day${rapportLvl > 0 ? ` — up from 1, because they know you` : ''}. ${limitLeft} left today.`}>
              🚫 {limitLeft <= 0 ? 'had yours today' : `${perCustomer}/customer`}
            </span>
          )}
        </span>
        <span className="prodprice">
          {surge > 1.02 && <span className="pricetag surge" title={priceNote}>🔥 +{Math.round((surge - 1) * 100)}%</span>}
          {showStrike && <s className="retail">{fmtMoney(retail)}</s>}{qN > 1 ? `${fmtMoney(total)} · ×${qN}` : fmtMoney(price)}
        </span>
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
  // 🎌 The import channel deals new JP product only — no vintage shelf, not even the "check
  // back" tease. (After the hooks: `dist` swaps per selected chip, and an early return above
  // them would change the hook count between renders.)
  if (dist.japanese) return null
  if (!hold && !find) {
    return (
      <div className="market-panel vintage-vault" style={{ marginTop: 18, opacity: 0.8 }}>
        <div className="market-head">🗝️ Back room <span className="muted">— nothing old on {dist.name}'s shelf this week. Vintage and out-of-print sealed turn up here at random (check back), and always at shows. Build rapport and they'll hold pieces for you.</span></div>
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
          {held ? '🗝️ Reserved for you' : f.aftermarket ? '🕰️ Out-of-print find' : '🗝️ Vintage find'} · sealed {productTypeLabel(f.product)}
          {!held && (out
            ? <> · <b style={{ color: 'var(--red)' }}>cleaned out</b></>
            : <> · <b>{n} left</b></>)}
        </div>
        <div className="prodlist">
          <button className={`prodbtn ${useCredit ? 'on-credit' : ''}`} disabled={out || broke}
            onClick={() => onBuyVintage(dist.id, f, { fromHold: held, onCredit, split })}
            title={out
              ? `${dist.name} has no more sealed ${f.setName} — it's out of print, so there's no reordering it. A new find turns up next week.`
              : `${productTypeLabel(f.product)} · ask ${fmtMoney(f.price)} · current market ${fmtMoney(p)}${onCredit ? ' — charged to your 💳 credit line' : split ? ' — cash first, then your 💳 credit line' : ''}`}>
            <span className="prodname">{useCredit ? '💳 ' : ''}{f.product.icon || '📦'} {productTypeLabel(f.product)}</span>
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
  const cost = distributorPrice(dist, product.price, lvl.level, { product, set })
  const pending = supplyChannel.reduce((a, w) => a + w.net, 0)

  function place() {
    if (cash < cost) return flash('Not enough cash to buy in.')
    const r = supplyVendors(set, product)
    if (r) flash(`Wholesaled ${productTypeLabel(product)} of ${set.name} — nets ${fmtMoney(r.net)} in ~${r.daysLeft}d.`)
  }
  return (
    <div className="market-panel" style={{ marginTop: 14 }}>
      <div className="market-head">📦 Supply other vendors <span className="muted">— buy in at {dist.name}'s wholesale, sell through the channel for passive income over a few days</span></div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select value={setId} onChange={e => { const id = e.target.value; setSetId(id); const ps = setProducts(SHOP_SETS.find(s=>s.id===id)); setType(ps.find(p=>p.packs>=10)?.type || ps[0].type) }}>
          {groupByEra(SHOP_SETS).map(era => (
            <optgroup key={era.series} label={era.series}>
              {era.sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        {/* This picks a product TYPE, and a set now carries several products per type (eight
            Prismatic mini tins). List each type once — the cheapest of that type is what
            `product` above resolves to, matching how the wholesale price is quoted. */}
        <select value={type} onChange={e => setType(e.target.value)}>
          {[...new Map(products.map(p => [p.type, p])).values()]
            .map(p => <option key={p.type} value={p.type}>{p.icon} {p.type}</option>)}
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
