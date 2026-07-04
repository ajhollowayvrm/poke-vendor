import { useEffect, useMemo, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney, packPrice,
  DISTRIBUTORS, RAPPORT_LEVELS, distributorById, distributorCatalog, distributorPrice, distributorCasePrice,
  distributorDiscount, rapportLevel, nextRapport, stockState, daysToRestock, caseLot, round2,
  VINTAGE_SETS, vintageProduct, sealedValue, setById, warmPricesOnBoot, distributorVintageFind } from './game/engine'
import { useGame } from './game/store'
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
import GradeReveal from './components/GradeReveal'
import { DialogHost, ToastHost, toast } from './ui/dialog'
import { AnimatedNumber } from './ui/AnimatedNumber'
import { NotorietyBar } from './components/Calendar'
import { SHOW_TIERS } from './game/shows'
import { milestoneById } from './game/milestones'

// Primary nav: the core loop + Stats (your money/standing matters more than the upgrade
// shop, so Stats gets a top slot and Upgrades moves behind the ⚙️ gear). Reference/meta
// screens (Grader, Prices) live as sub-tabs inside Collection; Settings + Upgrades live
// behind the gear in the top bar.
const TABS = ['shop', 'myshop', 'stream', 'shows', 'stats', 'collection']
const TAB_LABEL = { shop: 'Buy', myshop: 'Sell', stream: 'Stream', shows: 'Shows', stats: 'Stats', collection: 'Cards' }
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

export default function App() {
  const [tab, setTab] = useState('shop')
  const [collTab, setCollTab] = useState('cards') // Cards sub-tab: cards | sealed | binder | grader | regulars | prices
  const [settingsPane, setSettingsPane] = useState('settings') // gear sub-pane: settings | upgrades
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [picked, setPicked] = useState(null)     // card for modal
  const [preppingShow, setPreppingShow] = useState(null) // show selected; picking which cards to bring
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const [shopperShow, setShopperShow] = useState(null) // shopper attending: pick arrival timing first
  const cash = useGame(s => s.cash)
  // How many copies of the in-progress rip's product are still held in 📦 Inventory —
  // drives the "Rip another" label/gate (rip your own stock free before re-buying).
  const ripStock = useGame(s => ripping ? heldMatches(s, ripping.set, ripping.product).length : 0)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  const sealedCount = useGame(s => s.sealedInventory.length)
  const regularsCount = useGame(s => (s.regulars || []).filter(r => !r.flags?.burned).length)
  // only count orders still valid (card not since sold) so the tab badge matches the list
  const inboxCount = useGame(s => s.boothInbox.filter(e => encounterStillValid(e, s.collection, s.listings, s.shopDisplay)).length)
  const offerCount = useGame(s => s.listings.filter(l => (l.offers?.length || 0) > 0).length)
  const notoriety = useGame(s => s.notoriety)
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

  // If the page was reloaded while a show was open, the floor view (React state) is
  // gone but show-inventory cards may still be stranded on the table — bring them home.
  // Also kick off cloud auto-sync (no-ops unless the AWS backend is configured + signed in).
  useEffect(() => {
    if ((useGame.getState().showInventory || []).length) useGame.getState().endShow()
    startAutoSync()
    warmPricesOnBoot().catch(() => {}) // re-apply the last price snapshot (and freshen if stale)
  }, [])

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
  function buyProduct(distId, set, product, qty = 1) {
    // The Buy UI passes `_buyPrice` = the actual charged price (the distributor's price
    // at your rapport, a case lot, or a clearance lot), so shown == charged.
    const price = product._buyPrice ?? product.price
    if (cash < price) return toast(`Not enough cash for ${product.type}.`)
    const n = Math.max(1, Math.floor(qty))
    if (n > 1) {
      // Bulk buy: stock N at once into inventory (a stocking action — ignores Rip-on-buy).
      const res = useGame.getState().buyFromDistributorBulk(distId, set, product, price, n)
      if (!res) return toast(`${distributorById(distId)?.name || 'They'} can't fill that order right now.`)
      const short = res.bought < n ? ` (only ${res.bought} were available)` : ''
      return toast(`Stocked ${res.bought}× ${product.type} of ${set.name} for ${fmtMoney(res.spent)}${short} — in Cards → 📦 Sealed.`)
    }
    const item = useGame.getState().buyFromDistributor(distId, set, product, price)
    if (!item) return toast(`${distributorById(distId)?.name || 'They'} are out of ${product.type} — check back after it restocks.`)
    if (useGame.getState().settings.ripOnBuy) { ripFromInventory(item.uid); return }
    toast(`Stocked ${product.type} of ${set.name} — rip, list, or flip it from Cards → 📦 Sealed.`)
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

  // Buy a vintage FIND (or a reserved rapport hold) off a distributor — stocks it to hold
  // (vintage appreciates), builds rapport with them, and clears the hold if it was reserved.
  function buyDistVintage(distId, find, opts = {}) {
    if (cash < find.price) return toast(`Not enough cash for the ${find.setName} pack (${fmtMoney(find.price)}).`)
    const item = useGame.getState().buyDistributorVintage(distId, find.setId, find.product, find.price, opts)
    if (!item) return
    toast(`Stocked a sealed ${find.setName} pack for ${fmtMoney(find.price)}${opts.fromHold ? ' (they held it for you)' : ''} — it's in Cards → 📦 Sealed.`)
  }

  // "Rip another" from the end-of-rip summary: keep chasing without going back to the
  // shop. It reconciles with 📦 Inventory first — holding more of the SAME product
  // means the next rip comes from YOUR stock (already paid; no charge). Only when
  // you're out does it re-buy: a distributor product (`_distId`) re-buys through that
  // distributor so its STOCK and your RAPPORT stay honest — it's stocked then
  // immediately pulled back out to rip (no double-charge), and refuses if they've
  // sold out. Vintage / shop-less products fall back to a plain re-buy. Bails (no
  // charge) if you can't afford it.
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
    if (product._distId) {
      const item = useGame.getState().buyFromDistributor(product._distId, set, product, price)
      if (!item) return toast(`${distributorById(product._distId)?.name || 'They'} are out of ${product.type} — can't rip another right now.`)
      useGame.getState().ripSealed(item.uid) // pull it straight back out to rip; already paid
      setRipping(r => ({ set, product, nonce: (r?.nonce ?? 0) + 1 }))
      setTab('shop')
      return
    }
    if (!spend(price)) return
    useGame.getState().recordSetSpend(set.id, price)
    const wholesaleNote = product._buyPrice != null && product._buyPrice < product.price ? ' (wholesale)' : ''
    useGame.getState().log('buy', `Bought ${product?.type || 'pack'} (${set.name})${wholesaleNote}`, -price)
    setRipping(r => ({ set, product, nonce: (r?.nonce ?? 0) + 1 }))
    setTab('shop')
  }

  // Attend a show in one of two modes:
  //   'shop'   — buy a shopper ticket (entryFee) and walk the floor to BUY. No booth.
  //   'vendor' — entryFee + the show's vendorFee, and you run a BOOTH to sell your own
  //              cards. Requires the one-time Vendor Setup upgrade. Opens prep to pick stock.
  // No money/days are spent until you confirm (vendor → prep; shopper → straight in).
  function attendShow(show, mode = 'shop') {
    const tier = SHOW_TIERS[show.tierKey]
    if (mode === 'vendor') {
      if (!useGame.getState().upgrades.vendorSetup) return toast('You need the 🎪 Vendor Setup upgrade to run a booth. Buy it from Upgrades.')
      const cost = tier.entryFee + (tier.vendorFee || 0)
      if (useGame.getState().cash < cost) return toast(`Not enough cash for the vendor fee (${'$'+cost}).`)
      setPreppingShow(show) // prep screen: pick the cards to bring to your booth
      return
    }
    if (useGame.getState().cash < tier.entryFee) return toast('Not enough cash for the entry fee.')
    setShopperShow(show) // pick when you'll walk the floor (open vs late), then enter
  }

  // Enter a show as a SHOPPER: charge only the entry fee, no booth, straight to the floor.
  // `arrival` ('open' | 'late') sets how picked-over the vendor floors are.
  function enterAsShopper(show, arrival = 'open') {
    const tier = SHOW_TIERS[show.tierKey]
    setShopperShow(null)
    if (!spend(tier.entryFee)) return toast('Not enough cash for the entry fee.')
    useGame.getState().bringToShow([]) // ensure the booth is empty — you're here to buy
    useGame.getState().log('show', `Attended ${show.name} as a shopper (${tier.days}d, ${arrival === 'late' ? 'arrived late' : 'at open'})`, -tier.entryFee)
    // The trip's days pass now (at entry); stash the recap to show when you leave the floor.
    const summary = useGame.getState().attendShowDays(show.day, tier.days)
    setActiveShow({ ...show, _asVendor: false, _arrival: arrival, _summary: summary })
  }

  // Confirmed from the prep screen (VENDOR mode): charge entry + vendor fee (+ booth-spot
  // fee), move the picked cards onto your booth, advance the calendar past the show, enter
  // as a vendor. `opts` carries the booth spot (traffic mult + fee) and arrival timing.
  function enterShow(show, uids, opts = {}) {
    const tier = SHOW_TIERS[show.tierKey]
    const spotFee = opts.spotFee || 0
    const cost = tier.entryFee + (tier.vendorFee || 0) + spotFee
    if (!spend(cost)) { setPreppingShow(null); return toast(`Not enough cash for the vendor fee (${'$'+cost}).`) }
    useGame.getState().bringToShow(uids || [])
    const spotNote = spotFee ? ` + ${opts.spotLabel} $${spotFee}` : ''
    useGame.getState().log('show', `Vended at ${show.name} (${tier.days}d · entry $${tier.entryFee} + booth $${tier.vendorFee}${spotNote})`, -cost)
    // The trip's days pass now (at entry); stash the recap to show when you leave the floor.
    const summary = useGame.getState().attendShowDays(show.day, tier.days)
    setPreppingShow(null)
    setActiveShow({ ...show, _asVendor: true, _boothMult: opts.spotMult || 1, _spotLabel: opts.spotLabel || 'Standard table', _arrival: opts.arrival || 'open', _summary: summary })
  }

  // Leaving the show: unsold show-inventory cards come back home, then exit the floor.
  // Surface the trip recap (days away, rent/lease paid, orders missed, grades back) that we
  // stashed when the days passed at entry — most useful after a multi-day show.
  function leaveShow() {
    const trip = activeShow?._summary
    const name = activeShow?.name
    useGame.getState().endShow()
    setActiveShow(null)
    if (trip) {
      const s = { ...trip, showName: name }
      if (trip.resolvedGradeCards?.length) setGradeReveal({ cards: trip.resolvedGradeCards, summary: s })
      else setDaySummary(s)
    }
  }

  // Switch tabs. A rip in progress is NOT discarded — its component stays mounted as an
  // overlay (just hidden off the Buy tab), so leaving and coming back resumes exactly where
  // you were (same pack, running tally, unopened packs intact) instead of losing the rip.
  function selectTab(t) { setTab(t) }

  // Prepping for a show: the pick-your-inventory screen takes over the whole view.
  if (preppingShow) {
    return (
      <div className="app">
        <ShowPrep show={preppingShow}
          onConfirm={(uids, opts) => enterShow(preppingShow, uids, opts)}
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
      <div className="topbar">
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
          <button className="btn next-day-btn" disabled={!!activeShow} title={activeShow ? 'Cannot advance while attending a show' : 'Advance one day'} onClick={handleNextDay}>
            Next Day →
          </button>
          <span className="noto-chip">⭐ <AnimatedNumber value={notoriety} format={(n) => Math.round(n)} /><small>notoriety</small></span>
          <div className="cash"><AnimatedNumber value={cash} format={fmtMoney} /><small>balance</small></div>
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
        {tab === 'myshop' && <div className="pane"><BoothInbox /></div>}
        {tab === 'stream' && <div className="pane"><Livestream /></div>}
        {tab === 'stats' && <div className="pane"><Stats /></div>}

        {tab === 'collection' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${collTab === 'cards' ? 'active' : ''}`} onClick={() => setCollTab('cards')}>🗂️ All</button>
              <button className={`subtab ${collTab === 'sealed' ? 'active' : ''}`} onClick={() => setCollTab('sealed')}>📦 Sealed{sealedCount ? ` (${sealedCount})` : ''}</button>
              <button className={`subtab ${collTab === 'binder' ? 'active' : ''}`} onClick={() => setCollTab('binder')}>📒 Binder</button>
              <button className={`subtab ${collTab === 'grader' ? 'active' : ''}`} onClick={() => setCollTab('grader')}>🔬 Grader{pendingCount ? ` (${pendingCount})` : ''}</button>
              <button className={`subtab ${collTab === 'regulars' ? 'active' : ''}`} onClick={() => setCollTab('regulars')}>🤝 Regulars{regularsCount ? ` (${regularsCount})` : ''}</button>
              <button className={`subtab ${collTab === 'prices' ? 'active' : ''}`} onClick={() => setCollTab('prices')}>🏷️ Prices</button>
            </div>
            <div className="pane" key={collTab}>
              {collTab === 'cards' && <Collection onPick={setPicked} />}
              {collTab === 'sealed' && <SealedInventory onRip={ripFromInventory} />}
              {collTab === 'binder' && <Binder onPick={setPicked} />}
              {collTab === 'grader' && <Bench />}
              {collTab === 'regulars' && <Regulars />}
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
        <div className={`rip-overlay ${tab === 'shop' ? '' : 'hidden'}`}>
          <PackOpening
            key={ripping.nonce ?? 0}
            set={ripping.set}
            product={ripping.product}
            onExit={() => setRipping(null)}
            ripAnotherPrice={liveProductPrice(ripping.set, ripping.product)}
            ripAnotherStock={ripStock}
            canRipAnother={ripStock > 0 || cash >= liveProductPrice(ripping.set, ripping.product)}
            onRipAnother={() => ripAnother(ripping.set, ripping.product)}
          />
        </div>
      )}

      {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}

      {/* Shopper arrival choice: first dibs at open vs. marked-down late. */}
      {shopperShow && (
        <div className="modalbg" onClick={() => setShopperShow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0 }}>🛍️ {shopperShow.name}</h2>
            <p className="muted" style={{ marginTop: 0 }}>Entry {fmtMoney(SHOW_TIERS[shopperShow.tierKey].entryFee)}. When do you walk the floor?</p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" onClick={() => enterAsShopper(shopperShow, 'open')}>🌅 Arrive at open — first dibs on the showcases</button>
              <button className="btn alt" onClick={() => enterAsShopper(shopperShow, 'late')}>🌇 Roll in late — picked over, but vendors mark it down</button>
            </div>
            <button className="btn alt" style={{ marginTop: 12, maxWidth: 120 }} onClick={() => setShopperShow(null)}>Cancel</button>
          </div>
        </div>
      )}
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

// Simple day display — no countdown, no real-time timer.
function GameClock() {
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  return (
    <span className="clock-chip">
      📅 Day {currentDay}{monthsElapsed ? ` · M${monthsElapsed + 1}` : ''}
    </span>
  )
}

// Per-day summary — shown after clicking "Next Day". A satisfying end-of-day recap: the
// headline net-cash + net-worth, what actually SOLD (with the biggest sale called out),
// how the market moved, new collectors who found you, and the overhead that hit.
function DaySummary({ summary, onClose }) {
  const { cashDelta, added, listingsSold, listingOffers, premiumOffers, wages, rent, lease, payroll, storage,
    resolvedGrades, saleProceeds, notoDelta, missedOnline, missedWalkin, days, showName,
    soldNames, bigSale, newWants, marketMovers, netWorth, lifeEvents, counterIncome } = summary
  const currentDay = useGame(s => s.currentDay)
  const missed = (missedOnline || 0) + (missedWalkin || 0)
  const movers = marketMovers || []
  const sold = soldNames || []
  const events = lifeEvents || []
  const hasActivity = added || listingsSold || listingOffers || resolvedGrades || wages || rent || lease
    || payroll || storage || saleProceeds || notoDelta || missed || movers.length || newWants || events.length
  // A show trip recaps the whole time away ("Back from … · N days"); a single Next Day is
  // just the day you entered.
  const multiDay = days > 1
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal recap" onClick={e => e.stopPropagation()} style={{ maxWidth: 430 }}>
        <h2 style={{ marginBottom: 2, textAlign: 'center' }}>{showName ? `🎪 Back from ${showName}` : `📅 Day ${currentDay}`}</h2>
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
            {/* What sold */}
            {(saleProceeds > 0 || sold.length > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">🧾 Sold</div>
                {bigSale && <div className="recap-line"><span>Biggest: <b>{bigSale.name}</b></span><b style={{ color: 'var(--green)' }}>+{fmtMoney(bigSale.net)}</b></div>}
                {sold.filter(s => !bigSale || s.name !== bigSale.name || s.net !== bigSale.net).slice(0, 3).map((s, i) => (
                  <div className="recap-line" key={i}><span className="muted">{s.name}</span><span className="muted">+{fmtMoney(s.net)}</span></div>
                ))}
                {counterIncome > 0 && <div className="recap-line"><span className="muted">🏬 Storefront counter (singles/supplies/bulk)</span><b style={{ color: 'var(--green)' }}>+{fmtMoney(counterIncome)}</b></div>}
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
            {(added > 0 || listingOffers > 0 || premiumOffers > 0 || newWants > 0 || resolvedGrades > 0 || notoDelta > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">📬 New</div>
                {newWants > 0 && <div className="recap-line"><span>🐋 {newWants} collector want{newWants === 1 ? '' : 's'} found you</span><span className="muted">Sell tab</span></div>}
                {premiumOffers > 0 && <div className="recap-line"><span style={{ color: 'var(--green)' }}>📈 {premiumOffers} over-market offer{premiumOffers === 1 ? '' : 's'} (hot set)</span></div>}
                {added > 0 && <div className="recap-line"><span className="muted">{added} new order{added === 1 ? '' : 's'} in your inbox</span></div>}
                {listingOffers > 0 && <div className="recap-line"><span className="muted">{listingOffers} new offer{listingOffers === 1 ? '' : 's'} on listings</span></div>}
                {resolvedGrades > 0 && <div className="recap-line"><span className="muted">{resolvedGrades} slab{resolvedGrades === 1 ? '' : 's'} back from grading</span></div>}
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
      </div>
    </div>
  )
}

// Lose screen — shown when you can't make rent and have nothing left to sell.
function GameOver() {
  const gameOver = useGame(s => s.gameOver)
  const reset = useGame(s => s.reset)
  if (!gameOver) return null
  return (
    <div className="modalbg" style={{ background: '#000d', zIndex: 50 }}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 6 }}>💸 Game Over</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          You couldn't make rent and had nothing left to sell. The dream's over… for now.
        </p>
        <button className="btn gold" style={{ maxWidth: 200, margin: '8px auto 0' }} onClick={reset}>
          Start over
        </button>
      </div>
    </div>
  )
}

function Shop({ cash, onBuy, onBuyVintage }) {
  const distributors = useGame(s => s.distributors)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const supplyVendors = useGame(s => s.supplyVendors)
  const supplyChannel = useGame(s => s.supplyChannel || [])
  useGame(s => s.marketMults) // keep strike-through retail honest as the market drifts
  const [distId, setDistId] = useState(DISTRIBUTORS[0].id)
  const [toastMsg, setToastMsg] = useState(null)
  const flash = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2600) }

  const dist = distributorById(distId) || DISTRIBUTORS[0]
  const rec = distributors[distId] || { spend: 0, stock: {} }
  const lvl = rapportLevel(rec.spend)
  // Week index drives Greg's rotating catalog (month-safe; 30 days/month).
  const weekIndex = Math.floor(((monthsElapsed || 0) * 30 + currentDay) / 7)
  const catalog = distributorCatalog(dist, SHOP_SETS, weekIndex)
  // Greg flags one set's box as a clearance lot each week — a steep, thin-stock steal.
  const clearanceSetId = dist.clearance && catalog.length ? catalog[weekIndex % catalog.length].id : null
  const showSupply = dist.supply && lvl.level >= dist.supplyMinLevel

  return (
    <>
      <DistributorPicker distributorState={distributors} selected={distId} onSelect={setDistId} />
      <RapportBanner dist={dist} rec={rec} lvl={lvl} />

      {showSupply && (
        <SupplyPanel dist={dist} lvl={lvl} supplyVendors={supplyVendors} supplyChannel={supplyChannel} cash={cash} flash={flash} />
      )}

      <div className="banner" style={{ marginTop: 14 }}>
        {dist.icon} <b style={{ color: dist.color }}>{dist.name}</b> — {dist.blurb}
        {' '}Live <b>TCGplayer sealed prices</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); each product rips into its real pack count.
      </div>

      {catalog.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>{dist.name} has nothing on the shelf right now — check back next week.</p>
      ) : (
        <div className="grid shop-grid">
          {catalog.map(set => (
            <DistributorSetCard key={set.id} dist={dist} set={set} lvl={lvl} stock={rec.stock}
              cash={cash} onBuy={onBuy} clearance={set.id === clearanceSetId} />
          ))}
        </div>
      )}

      <VintageShelf dist={dist} rec={rec} weekIndex={weekIndex} cash={cash} onBuyVintage={onBuyVintage} />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}

// Pick which distributor you're buying from. Each chip shows their icon, name, and your
// rapport (filled stars), tinted with their brand colour.
function DistributorPicker({ distributorState, selected, onSelect }) {
  return (
    <div className="distrib-picker">
      {DISTRIBUTORS.map(d => {
        const rec = distributorState[d.id] || { spend: 0 }
        const level = rapportLevel(rec.spend).level
        const max = RAPPORT_LEVELS.length - 1
        return (
          <button key={d.id} className={`distrib-chip ${selected === d.id ? 'active' : ''}`}
            style={{ '--dc': d.color }} onClick={() => onSelect(d.id)}>
            <span className="dc-icon">{d.icon}</span>
            <span className="dc-name">{d.name}</span>
            <span className="dc-rep" aria-label={`${level} of ${max} rapport`}>{'★'.repeat(level)}{'☆'.repeat(max - level)}</span>
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
function DistributorSetCard({ dist, set, lvl, stock, cash, onBuy, clearance }) {
  const products = setProducts(set)
  const showCases = dist.cases && lvl.level >= dist.casesMinLevel
  const lot = showCases ? caseLot(set) : null
  const box = [...products].sort((a, b) => b.packs - a.packs)[0]
  return (
    <div className="product">
      {set.logo && <img className="logo" src={set.logo} alt={set.name} />}
      <h3>{set.name}</h3>
      <div className="meta">{set.series} · {set.printedTotal} numbered / {set.total} total</div>
      <div className="prodlist">
        {products.map(p => (
          <StockButton key={p.type} dist={dist} set={set} product={p} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} />
        ))}
        {lot && (
          <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy}
            product={{ ...lot.unit, type: lot.type, icon: lot.icon, packs: lot.packs, bonus: lot.bonus, boxes: lot.boxes, _retail: lot.retail, _case: true }} />
        )}
        {clearance && box && (
          <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy}
            product={{ ...box, type: `Clearance ${box.type}`, icon: '🏷️', _clearanceOf: box.price, _clearance: true }} />
        )}
      </div>
    </div>
  )
}

// A single buyable product line with live stock. Prices at your rapport, draws the stock
// bar, and disables itself when sold out (with a restock ETA) or you can't afford it.
// A quantity stepper lets you buy several at once (type "10" → ten ETBs in one purchase),
// capped to what's in stock and what you can afford.
function StockButton({ dist, set, product, lvl, stock, cash, onBuy }) {
  let price
  if (product._case) price = distributorCasePrice(dist, { retail: product._retail }, lvl.level)
  else if (product._clearance) price = round2(distributorPrice(dist, product._clearanceOf, lvl.level) * 0.65)
  else price = distributorPrice(dist, product.price, lvl.level)

  const { q: stockQty, cap, out } = stockState(dist, stock, set, product, lvl.level)
  const days = out ? daysToRestock(dist, stockQty, cap) : 0
  // How many you can buy right now: at least 1 if in stock, capped by stock and your cash.
  const affordable = price > 0 ? Math.floor(cash / price) : 999
  const maxBuy = out ? 0 : Math.max(0, Math.min(Math.max(1, Math.floor(stockQty)), affordable))

  const [buyQty, setBuyQty] = useState(1)
  const qN = Math.min(Math.max(1, Math.floor(buyQty) || 1), Math.max(1, maxBuy))
  const clampSet = (v) => setBuyQty(Math.min(Math.max(1, Math.floor(v) || 1), Math.max(1, maxBuy)))
  const canBuy = !out && maxBuy >= 1

  const retail = product._clearance ? product._clearanceOf : product._case ? product._retail : product.price
  const showStrike = price < (retail || 0) - 0.005
  const total = round2(price * qN)

  return (
    <div className="prodrow">
      <div className="qty-ctl" aria-label="quantity">
        <button type="button" className="qty-step" disabled={!canBuy || qN <= 1} onClick={() => clampSet(qN - 1)} aria-label="fewer">−</button>
        <input type="number" min="1" max={Math.max(1, maxBuy)} value={qN} disabled={!canBuy}
          onChange={e => clampSet(Number(e.target.value))} onFocus={e => e.target.select()} aria-label="quantity" />
        <button type="button" className="qty-step" disabled={!canBuy || qN >= maxBuy} onClick={() => clampSet(qN + 1)} aria-label="more">+</button>
      </div>
      <button className={`prodbtn ${product._case ? 'caselot' : ''} ${product._clearance ? 'clearance' : ''} ${out ? 'out' : ''}`}
        disabled={!canBuy}
        onClick={() => onBuy(dist.id, set, { ...product, _buyPrice: price, _distId: dist.id }, qN)}
        title={out ? `Sold out — restocks in ~${days}d` : `${product.packs} pack${product.packs > 1 ? 's' : ''}${product.bonus ? ' + promo' : ''} · ${Math.floor(stockQty)}/${cap} in stock · up to ${maxBuy} buyable now`}>
        <span className="prodname">{product.icon} {product.type}</span>
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
function VintageShelf({ dist, rec, weekIndex, cash, onBuyVintage }) {
  if (!VINTAGE_SETS.length) return null
  const hold = rec?.hold || null
  const find = useMemo(() => distributorVintageFind(dist, weekIndex), [dist, weekIndex])
  if (!hold && !find) {
    return (
      <div className="market-panel vintage-vault" style={{ marginTop: 18, opacity: 0.8 }}>
        <div className="market-head">🗝️ Vintage <span className="muted">— nothing old on {dist.name}'s shelf this week. It turns up randomly here (check back), and always at shows. Build rapport and they'll hold pieces for you.</span></div>
      </div>
    )
  }
  const Card = ({ f, held }) => {
    const p = sealedValue({ product: f.product, setId: f.setId })
    const up = p >= (f.product.price || 0)
    return (
      <div className={`product ${held ? 'vintage-held' : ''}`} key={(held ? 'h' : 'f') + f.setId}>
        {f.logo && <img className="logo" src={f.logo} alt={f.setName} />}
        <h3>{f.setName}</h3>
        <div className="meta">{held ? '🗝️ Reserved for you' : '🗝️ Vintage find'} · sealed {f.product.type}</div>
        <div className="prodlist">
          <button className="prodbtn" disabled={cash < f.price}
            onClick={() => onBuyVintage(dist.id, f, { fromHold: held })}
            title={`${f.product.type} · ask ${fmtMoney(f.price)} · current market ${fmtMoney(p)}`}>
            <span className="prodname">{f.product.icon || '📦'} {f.product.type}</span>
            <span className="prodmeta" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'} mkt {held ? '· held' : ''}</span>
            <span className="prodprice">{fmtMoney(f.price)}</span>
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="market-panel vintage-vault" style={{ marginTop: 18 }}>
      <div className="market-head">🗝️ Vintage on {dist.name}'s shelf <span className="muted">— old sealed, buy &amp; hold (vintage appreciates) or rip it. Rotates weekly; rapport gets pieces reserved for you.</span></div>
      <div className="grid shop-grid" style={{ marginTop: 10 }}>
        {hold && <Card f={hold} held />}
        {find && <Card f={find} />}
      </div>
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
