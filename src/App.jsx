import { useEffect, useRef, useState } from 'react'
import { openProduct, isHit, fmtMoney, distributorById, round2, setById, warmPricesOnBoot,
  cardValue, drawPackSets, productTypeLabel } from './game/engine'
import { Modal } from './ui/Modal'
import { useGame, RANKS } from './game/store'
import { netWorthFull } from './game/store/helpers'
import { weekdayOf, absoluteDay, monthName, yearOf } from './game/store/constants'
import { startAutoSync } from './game/cloudSave'
import { encounterStillValid } from './game/shows'
import FirstRun, { NotorietyHelp } from './components/FirstRun'
import { Chunk, lazyChunk } from './ui/lazyChunk'
import { DialogHost, ToastHost, toast } from './ui/dialog'
import { configureFeedback } from './game/feedback'
import { AnimatedNumber, CashFlash } from './ui/AnimatedNumber'
import { Explain } from './ui/Explain'
import { SHOW_TIERS } from './game/shows'
import { milestoneById } from './game/milestones'

// Primary nav, grouped by WHO OWNS THE THING rather than by what the screen is made of.
//
//   👤 You      — everything that is yours: collection, sealed, binders, grading, career, upgrades
//   🏬 Sell/Store — the business: before a storefront it is a Sell screen; after, a whole shop
//   🛒 Buy      — the shelves, the local marketplace, and the cart you fill from them
//   📱 Socials  — the audience: the pulse, three platforms, going live, and the DMs
//   🎪 Shows    — the calendar and the floor (unchanged)
//   ⚙️ Misc     — settings, and nothing else
//
// The Stats tab is gone. It reported and could not be acted on, and the things worth keeping
// from it belong with what they are ABOUT: your job and standing are yours (You → Career),
// the books and the burn are the business's (Store → Financials).
// Tab-gated screens, split out of the boot chunk. None of these paint on the first render
// (the Buy tab), and together they were ~500 KB of source that WebKit had to parse before it
// could show anything. lazyChunk() carries the stale-chunk guard — see src/ui/lazyChunk.jsx.
const PackOpening = lazyChunk(() => import('./components/PackOpening'))
const Collection = lazyChunk(() => import('./components/Collection'))
const CardModal = lazyChunk(() => import('./components/CardModal'))
const Bench = lazyChunk(() => import('./components/Bench'))
const Books = lazyChunk(() => import('./components/Books'))
const Calendar = lazyChunk(() => import('./components/Calendar'))
const ShowFloor = lazyChunk(() => import('./components/ShowFloor'))
const UpgradeShop = lazyChunk(() => import('./components/UpgradeShop'))
const BoothInbox = lazyChunk(() => import('./components/BoothInbox'))
const StoreMessages = lazyChunk(() => import('./components/StoreMessages'))
const Settings = lazyChunk(() => import('./components/Settings'))
const PriceGuide = lazyChunk(() => import('./components/PriceGuide'))
const SealedInventory = lazyChunk(() => import('./components/SealedInventory'))
const AutoRip = lazyChunk(() => import('./components/AutoRip'))
const ShowPrep = lazyChunk(() => import('./components/ShowPrep'))
const Livestream = lazyChunk(() => import('./components/Livestream'))
const Socials = lazyChunk(() => import('./components/Socials'))
const Career = lazyChunk(() => import('./components/Career'))
const StoreOverview = lazyChunk(() => import('./components/StoreOverview'))
const StoreFinancials = lazyChunk(() => import('./components/StoreFinancials'))
const Pulse = lazyChunk(() => import('./components/Pulse'))
const DMs = lazyChunk(() => import('./components/DMs'))
const Feed = lazyChunk(() => import('./components/Feed'))
const Binder = lazyChunk(() => import('./components/Binder'))
const Regulars = lazyChunk(() => import('./components/Regulars'))
const StoreStock = lazyChunk(() => import('./components/StoreStock'))
const GradeReveal = lazyChunk(() => import('./components/GradeReveal'))
const DaySummary = lazyChunk(() => import('./components/DaySummary'))
const Shop = lazyChunk(() => import('./components/Shop'))
import TabBar from './components/TabBar'

// Vendor flow order: source → stock → sell → shows → content → back office.
const TABS = ['you', 'sell', 'buy', 'socials', 'shows', 'misc']
// Device-local, deliberately NOT part of the saved game. See the useState that reads it.
const TAB_KEY = 'pv.tab'
const TAB_LABEL = { you: 'You', sell: 'Sell', buy: 'Buy', socials: 'Socials', shows: 'Shows', misc: 'Misc' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { you: '👤', sell: '🏬', buy: '🛒', socials: '📱', shows: '🎪', misc: '⚙️' }
// The tab ids were renamed with the nav, and `pv.tab` is on the DEVICE — it is not part of the
// save and no migration reaches it. Without this map every existing player opens the app once
// on the wrong screen, which reads as the app having lost their place.
const TAB_ALIAS = { shop: 'buy', collection: 'you', myshop: 'sell', stream: 'socials', stats: 'you', settings: 'misc' }

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
      const mapped = TAB_ALIAS[t] || t
      return mapped && TABS.includes(mapped) ? mapped : 'buy'
    } catch { return 'buy' }
  })
  const [youTab, setYouTab] = useState('cards')       // You: cards | sealed | binders | grader | regulars | career | upgrades
  const [storeTab, setStoreTab] = useState('overview') // Store (with a storefront): overview | messages | inventory | financials
  const [socialsTab, setSocialsTab] = useState('pulse') // Socials: pulse | tweeter | instantgram | yourtube | dms
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
  // 📒 How many masterset pages you have going — a binder is a thing you bought and put a set
  // in, so this is a count of chases you chose, not of sets that exist.
  const binderCount = useGame(s => (s.binders || []).filter(b => b.setId).length)
  // 💬 Unread socials DMs. Badged on the tab like the store's inbox is, because it is the
  // same promise: something is waiting for you in there.
  const unreadDms = useGame(s => (s.dms || []).filter(d => !d.read).length)
  // With a storefront your stock splits into Shop Floor / Storeroom (on the 🏬 Store tab) and
  // the Collection sub-tab becomes your PERSONAL collection. A pre-store flipper keeps the flat
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
    if (ripping && tab === 'buy') {
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

  // Adding to the 🛒 CART, not buying. A stocking run is one order — you fill a basket, then
  // answer "cash or credit" and "store or personal" once, at checkout (see Cart.jsx and
  // store/sourcing.js checkoutCart). Every shelf row on the Buy tab lands here.
  //
  // ONE exception, and it is the whole reason this branch exists: the "Rip on buy" setting
  // means the product is opened the moment it is yours, and a cart cannot rip. With it on we
  // buy immediately, exactly as before. The setting is the player's, and a cart that silently
  // swallowed it would be the feature breaking a setting rather than respecting it.
  function buyProduct(distId, set, product, qty = 1, opts = {}) {
    if (!useGame.getState().settings.ripOnBuy) {
      const price = product._buyPrice ?? product.price
      const n = Math.max(1, Math.floor(qty))
      useGame.getState().addToCart(distId, set, product, n, price)
      const origin = product.pool?.series ? `the ${product.pool.series} era` : set.name
      toast(`🛒 Added ${n > 1 ? `${n}× ` : ''}${productTypeLabel(product)} of ${origin} — ${fmtMoney(price * n)}. Check out from the cart when the order's done.`, 3200)
      return
    }
    return buyAndRipNow(distId, set, product, opts)
  }

  // The Rip-on-buy path: charge for ONE unit and open it. Quantity is meaningless here — you
  // cannot rip four boxes at once — so this deliberately ignores it.
  function buyAndRipNow(distId, set, product, opts = {}) {
    // The Buy UI passes `_buyPrice` = the actual charged price (the distributor's price
    // at your rapport, a case lot, or a clearance lot), so shown == charged.
    const price = product._buyPrice ?? product.price
    const onCredit = !!opts.onCredit
    const split = !!opts.split // 🔀 cash first, credit for the remainder
    if (split) {
      const avail = useGame.getState().creditAvailable()
      if (cash + 1e-9 < price) { // cash alone won't cover it — the rest must ride the line
        if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen. See 💳 The distributor line in 👤 You → Career for what froze it and what lifts it.')
        if (cash + avail + 1e-9 < price) return toast(`Not enough cash + credit for ${productTypeLabel(product)}. Pay down your balance or bring more cash.`)
      }
    } else if (onCredit) {
      if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen. See 💳 The distributor line in 👤 You → Career for what froze it and what lifts it.')
      if (useGame.getState().creditAvailable() + 1e-9 < price) return toast(`Not enough credit available for ${productTypeLabel(product)}. Pay down your balance or buy with cash.`)
    } else if (cash < price) return toast(`Not enough cash for ${productTypeLabel(product)}.`)
    const distName = distributorById(distId)?.name || 'They'
    // 🚫 Check the ration BEFORE blaming the shelf — "sold out" and "you have had your one"
    // need different answers from the player.
    const lim = useGame.getState().purchaseLimitFor(distId, set, product)
    if (lim.left <= 0) {
      return toast(`${distName} limit ${productTypeLabel(product)} to ${lim.limit} per customer a day — you've had yours. Back tomorrow${lim.limit < 4 ? ', or keep spending here and they\u2019ll let you take more' : ''}.`)
    }
    // What to call where this came from. A cross-set product has an ANCHOR set for bookkeeping,
    // but naming it would be a lie — "Ultra Premium Collection of Phantasmal Flames" claims
    // 18 Phantasmal Flames packs. Name the era instead.
    const origin = product.pool?.series ? `the ${product.pool.series} era` : set.name
    const item = useGame.getState().buyFromDistributor(distId, set, product, price, { onCredit, split, locked: true })
    if (!item) return toast(`${distName} are out of ${productTypeLabel(product)} — check back after it restocks.`)
    // 🚢 An import buy is on the water — nothing to rip yet, whatever the Rip-on-buy setting says.
    if (item._inTransit) return toast(`🚢 Import order placed — ${productTypeLabel(product)} of ${origin} is crossing the Pacific (lands in a few days).`)
    ripFromInventory(item.uid)
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
      setRipReturn(tab)     // came from You/Store/Messages → Done should return you here
      // cost: what you ACTUALLY paid for this unit, not what it lists at today — the 📜 rip log
      // records a real P/L, and the sift (which reads boughtPrice directly) must agree with it.
      // uid identifies the physical unit: a cross-set product derives its pack lineup from it,
      // so two of the same UPC rip different sets. See drawPackSets in engine.js.
      setRipping({ set, product, cost: item.boughtPrice, uid: item.uid })
      setTab('buy')
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
    setTab('you')
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
        if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen. See 💳 The distributor line in 👤 You → Career for what froze it and what lifts it.')
        if (cash + useGame.getState().creditAvailable() + 1e-9 < find.price) return toast(`Not enough cash + credit for the ${find.setName} pack.`)
      }
    } else if (onCredit) {
      if (useGame.getState().credit?.frozen) return toast('Your credit line is frozen. See 💳 The distributor line in 👤 You → Career for what froze it and what lifts it.')
      if (useGame.getState().creditAvailable() + 1e-9 < find.price) return toast(`Not enough credit available for the ${find.setName} pack. Pay down your balance or buy with cash.`)
    } else if (cash < find.price) return toast(`Not enough cash for the ${find.setName} pack (${fmtMoney(find.price)}).`)
    const item = useGame.getState().buyDistributorVintage(distId, find.setId, find.product, find.price, { ...opts, onCredit, split })
    // The weekly find is finite — refuses once their shelf is bare (say the buy raced a click).
    if (!item) return toast(`${distributorById(distId)?.name || 'They'} have no more sealed ${find.setName} — it's out of print. A fresh find turns up next week.`)
    const cashPart = Math.min(cash, find.price), creditPart = round2(find.price - cashPart)
    const pay = onCredit ? ' on credit 💳' : (split && creditPart > 0) ? ` — ${fmtMoney(cashPart)} cash + ${fmtMoney(creditPart)} credit 💳` : ''
    toast(`Stocked a sealed ${find.setName} pack for ${fmtMoney(find.price)}${pay}${opts.fromHold ? ' (they held it for you)' : ''} — it's in 👤 You → 📦 Sealed.`)
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
    setTab('buy')
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
    if (streamLive && t !== 'socials') { toast('🔴 You’re live — end the stream before leaving.'); return }
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

  // One list drives BOTH tab strips (top bar + bottom nav); badges are computed once here.
  // ⚙️ Misc is a real tab now rather than a synthetic bottom-only stand-in for the gear, so
  // the phone nav and the desktop strip finally show the same six entries. The top bar keeps
  // its gear as a shortcut to the same place.
  const navItems = TABS.map(t => ({
    id: t,
    // The Sell tab BECOMES the Store the day you sign a lease. Same tab, same slot, different
    // job — so the label has to say which one you are looking at.
    label: t === 'sell' && hasStore ? 'Store' : TAB_LABEL[t],
    icon: TAB_ICON[t],
    badge: t === 'sell' ? inboxCount + offerCount
      : t === 'you' ? pendingCount
      : t === 'socials' ? unreadDms : 0,
  }))

  return (
    <div className="app">
      <header className={`topbar ${ripping && tab === 'buy' ? 'rip-hide' : ''}`} ref={topbarRef}>
        <h1 className="brand">Poké<b>Vendor</b></h1>
        <TabBar items={navItems} active={tab} onSelect={selectTab} variant="top" />
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          <GameClock />
          <button className="btn next-day-btn" aria-disabled={!!activeShow || streamLive}
            onClick={() => {
              if (activeShow) return toast('🎪 You\u2019re at a show — leave the floor to advance the day.')
              if (streamLive) return toast('🔴 You\u2019re live — end the stream first (it consumes the day itself).')
              handleNextDay()
            }}>
            Next Day →
          </button>
          <span className="noto-chip">⭐ <AnimatedNumber value={notoriety} format={(n) => Math.round(n)} /><small>reputation</small><NotorietyHelp /></span>
          {hype >= 10 && (
            <Explain label="What is hype?" align="right" trigger={
              <span className="hype-chip">🔥 <AnimatedNumber value={hype} format={(n) => Math.round(n)} /><small>hype</small></span>
            }>
              <b>🔥 Shop heat {Math.round(hype)}/100</b>
              <p>Big moments — god packs, grails, streams, giveaways, events — heat the shop up.
                While hot, more buyers come through everywhere. It fades over a few days, and a
                little settles into permanent ⭐ reputation.</p>
            </Explain>
          )}
          <Explain label="What counts as cash?" align="right" trigger={
            <div className="cash"><AnimatedNumber value={cash} format={fmtMoney} /><small>cash on hand</small><CashFlash value={cash} /></div>
          }>
            <b>💵 Cash on hand</b>
            <p>Spendable money right now. Buying, fees, rent and payroll come out of this.</p>
          </Explain>
          <Explain label="What is net worth?" align="right" trigger={
            <div className="worth"><AnimatedNumber value={worth} format={fmtMoney} /><small>net worth</small></div>
          }>
            <b>📊 Net worth</b>
            <p>Cash + market value of everything you own — collection, listings, sealed, cards
              at the grader. Moving value around (grading, buying, listing) doesn't change it;
              only real income or spending does.</p>
          </Explain>
          <button className={`gear-btn ${tab === 'misc' ? 'active' : ''}`} aria-label="Settings" onClick={() => selectTab('misc')}>⚙️</button>
        </div>
      </header>

      {gradeReveal && (
        <Chunk label="Opening the return package…">
          <GradeReveal cards={gradeReveal.cards} onDone={() => {
            const s = gradeReveal.summary
            setGradeReveal(null)
            if (s) setDaySummary(s)
          }} />
        </Chunk>
      )}
      {daySummary && <Chunk label="Closing the register…"><DaySummary summary={daySummary} onClose={() => setDaySummary(null)} /></Chunk>}
      <GameOver />

      {/* A rip is mid-flight but you've stepped away to another tab — a tap brings you back. */}
      {ripping && tab !== 'buy' && (
        <button className="rip-resume-banner" onClick={() => selectTab('buy')}>
          📦 Rip in progress — tap to resume
        </button>
      )}

      {/* the active view fills the space between the top bar and the bottom nav,
          so short pages (empty collection, settings) don't leave dead space */}
      <main className="content">
        {/* Names the current screen for assistive tech. The tab strip is the visible title, so
            repeating it on the page would be noise for a sighted player — but without this the
            document has one h1 and nothing between it and the panel h3s. */}
        <h2 className="sr-only">{TAB_LABEL[tab] || 'Settings'}</h2>
        {/* Buy tab ONLY. Sitting outside the tab switch, this checklist painted on all six
            screens at once — ~230px of a 676px phone viewport (34%) repeated on Store, Stream,
            Shows, Stats and Inventory, where none of its steps live. Buy is where you land by
            default and where step one ("buy some sealed") happens, so it's the one screen the
            onboarding belongs on; it still dismisses globally. */}
        {tab === 'buy' && <FirstRun />}
        {/* ONE Suspense for the whole tab area: every screen inside is a lazy chunk, and a
            per-tab boundary would just mean the same fallback written fourteen times. */}
        <Chunk>
        {/* One shelf, no sub-tabs. The 🛍️ global Marketplace used to sit beside it doing the
            same job as the 📱 Local Marketplace — buy a single you want, right now — but with
            honest prices, which made the local board's whole point (nobody here prices to
            market) into a strictly worse option. The local board is the one that stayed. It is
            not a sub-tab either: it is what a marketplace DISTRIBUTOR renders (Shop.jsx). */}
        {tab === 'buy' && (
          <div className="pane"><Shop cash={cash} onBuy={buyProduct} onBuyVintage={buyDistVintage} /></div>
        )}

        {tab === 'shows' && <div className="pane"><Calendar onAttend={attendShow} /></div>}

        {/* 🏬 Sell BECOMES Store the day you sign a lease. Before that it is one screen — you
            are a flipper with a phone, and a four-way split of a shop you do not have would be
            four mostly-empty screens. After, the shop is a place with a front of house, an
            inbox, a stockroom and a set of books, and each of those is its own job. */}
        {tab === 'sell' && !hasStore && (
          <div className="pane"><BoothInbox onRip={ripFromInventory} onSift={startSift} onPick={setPicked} /></div>
        )}
        {tab === 'sell' && hasStore && (
          <>
            <div className="subtabs">
              <button className={`subtab ${storeTab === 'overview' ? 'active' : ''}`} onClick={() => setStoreTab('overview')}>📊 Overview</button>
              <button className={`subtab ${storeTab === 'messages' ? 'active' : ''}`} onClick={() => setStoreTab('messages')}>
                💬 Messages{inboxCount + offerCount ? ` (${inboxCount + offerCount})` : ''}
              </button>
              <button className={`subtab ${storeTab === 'inventory' ? 'active' : ''}`} onClick={() => setStoreTab('inventory')}>📦 Inventory</button>
              <button className={`subtab ${storeTab === 'financials' ? 'active' : ''}`} onClick={() => setStoreTab('financials')}>
                💰 Financials{taxOwed > 0 ? ` (${fmtMoney(taxOwed)})` : ''}
              </button>
            </div>
            <div className="pane" key={storeTab}>
              {storeTab === 'overview' && <StoreOverview />}
              {/* 💬 Messages is its own component now — the inbox is a whole job with a store,
                  and it was the one group inside Sell that had nothing to do with the selling
                  surfaces around it. Inventory is still BoothInbox: it owns the floor, the
                  storeroom, the product lines, the listings and the regulars, which really are
                  one screen with four sections, and it keeps its own strip to move between
                  them. */}
              {storeTab === 'messages' && <StoreMessages onRip={ripFromInventory} onSift={startSift} onPick={setPicked}
                onOpenInventory={() => setStoreTab('inventory')} />}
              {storeTab === 'inventory' && <BoothInbox hideGroups={['orders']} onRip={ripFromInventory} onSift={startSift} onPick={setPicked} />}
              {storeTab === 'financials' && <StoreFinancials />}
            </div>
          </>
        )}
        {/* 📱 Socials. The livestream lives under ▶️ YourTube, where a long-form channel
            actually belongs — going live and posting a vlog are the same channel doing the same
            thing at two lengths, and they had no business being on separate tabs. While you are
            ON AIR the sub-tab strip is hidden and the broadcast keeps the whole view; selectTab
            already refuses to leave the tab mid-stream. */}
        {tab === 'socials' && (
          <>
            {!streamLive && (
              <div className="subtabs">
                <button className={`subtab ${socialsTab === 'pulse' ? 'active' : ''}`} onClick={() => setSocialsTab('pulse')}>📈 Pulse</button>
                <button className={`subtab ${socialsTab === 'tweeter' ? 'active' : ''}`} onClick={() => setSocialsTab('tweeter')}>🐦 Tweeter</button>
                <button className={`subtab ${socialsTab === 'instantgram' ? 'active' : ''}`} onClick={() => setSocialsTab('instantgram')}>📸 Instantgram</button>
                <button className={`subtab ${socialsTab === 'yourtube' ? 'active' : ''}`} onClick={() => setSocialsTab('yourtube')}>▶️ YourTube</button>
                <button className={`subtab ${socialsTab === 'dms' ? 'active' : ''}`} onClick={() => setSocialsTab('dms')}>
                  💬 DMs{unreadDms ? ` (${unreadDms})` : ''}
                </button>
              </div>
            )}
            <div className="pane" key={streamLive ? 'live' : socialsTab}>
              {streamLive ? <Livestream /> : (
                <>
                  {socialsTab === 'pulse' && <Pulse />}
                  {socialsTab === 'tweeter' && <Feed platform="tweeter" />}
                  {socialsTab === 'instantgram' && <Feed platform="instantgram" />}
                  {socialsTab === 'yourtube' && <><Feed platform="yourtube" /><Livestream /></>}
                  {socialsTab === 'dms' && <DMs />}
                  {/* The standing commitments belong with the platforms, not with the pulse
                      (which is about other people) or the DMs (which are other people). */}
                  {socialsTab !== 'dms' && socialsTab !== 'pulse' && <Socials />}
                </>
              )}
            </div>
          </>
        )}
        {/* 👤 You — everything that is yours, including the two things that were filed
            under analytics on a tab you could only read: your career (job, money, credit,
            standing) and the upgrades you spend it on. 🏷️ Prices moved into a Collapse at the
            foot of Collection: it is reference you check, not a place you go. */}
        {tab === 'you' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${youTab === 'cards' ? 'active' : ''}`} onClick={() => setYouTab('cards')}>
                {hasStore ? `🗂️ Collection${personalCardCount ? ` (${personalCardCount})` : ''}` : '🗂️ Collection'}
              </button>
              <button className={`subtab ${youTab === 'sealed' ? 'active' : ''}`} onClick={() => setYouTab('sealed')}>
                📦 Sealed{(hasStore ? personalSealedCount : sealedCount) ? ` (${hasStore ? personalSealedCount : sealedCount})` : ''}
              </button>
              <button className={`subtab ${youTab === 'binders' ? 'active' : ''}`} onClick={() => setYouTab('binders')}>
                📒 Binders{binderCount ? ` (${binderCount})` : ''}
              </button>
              <button className={`subtab ${youTab === 'grader' ? 'active' : ''}`} onClick={() => setYouTab('grader')}>🔬 Grading{pendingCount ? ` (${pendingCount})` : ''}</button>
              {!hasStore && <button className={`subtab ${youTab === 'regulars' ? 'active' : ''}`} onClick={() => setYouTab('regulars')}>🤝 Regulars{regularsCount ? ` (${regularsCount})` : ''}</button>}
              <button className={`subtab ${youTab === 'career' ? 'active' : ''}`} onClick={() => setYouTab('career')}>
                💼 Career{!hasStore && taxOwed > 0 ? ` (${fmtMoney(taxOwed)})` : ''}
              </button>
              <button className={`subtab ${youTab === 'upgrades' ? 'active' : ''}`} onClick={() => setYouTab('upgrades')}>⬆️ Upgrades</button>
            </div>
            <div className="pane" key={youTab}>
              {youTab === 'cards' && (
                <>
                  {hasStore
                    ? <StoreStock place="personal" only="cards" onRip={ripFromInventory} onPick={setPicked} />
                    : <Collection onPick={setPicked} />}
                  <PriceGuide collapsed />
                </>
              )}
              {youTab === 'sealed' && (hasStore ? <StoreStock place="personal" only="sealed" onRip={ripFromInventory} onSift={startSift} onPick={setPicked} /> : <SealedInventory onRip={ripFromInventory} onSift={startSift} />)}
              {youTab === 'binders' && <Binder onPick={setPicked} />}
              {youTab === 'grader' && <Bench />}
              {youTab === 'regulars' && !hasStore && <Regulars />}
              {youTab === 'career' && <Career />}
              {youTab === 'upgrades' && <UpgradeShop />}
            </div>
          </>
        )}

        {/* ⚙️ Misc — settings, and nothing else. ⬆️ Upgrades moved to 👤 You, next to the money
            that buys them; with nothing left to switch between, the sub-tab row is gone. */}
        {tab === 'misc' && <div className="pane"><Settings /></div>}
        </Chunk>
      </main>

      {/* In-progress rip overlay. Mounted whenever a rip is active so its state survives
          tab switches; hidden (not unmounted) when you're off the Buy tab, so leaving and
          returning resumes the same rip rather than discarding it. */}
      {ripping && (
        <div className={`rip-overlay rip-full ${tab === 'buy' ? '' : 'hidden'}`}>
          <Chunk label="Tearing the wrapper…">
          <PackOpening
            key={ripping.nonce ?? 0}
            set={ripping.set}
            product={ripping.product}
            uid={ripping.uid}
            paused={tab !== 'buy'}
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
      <TabBar items={navItems} active={tab} onSelect={selectTab} variant="bottom" />
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
function GameOver() {
  const gameOver = useGame(s => s.gameOver)
  const reset = useGame(s => s.reset)
  if (!gameOver) return null
  return (
    <Modal dismissable={false} maxWidth={420} zIndex={'calc(var(--z-reveal) + 5)'} label="Game over"
      style={{ textAlign: 'center' }}>
      <h2 style={{ marginBottom: 6 }}>💸 Game Over</h2>
      <p className="muted mt-0">
        You couldn't make rent and had nothing left to sell. The dream's over… for now.
      </p>
      <button className="btn gold" style={{ maxWidth: 200, margin: '8px auto 0' }} onClick={reset}>
        Start over
      </button>
    </Modal>
  )
}
