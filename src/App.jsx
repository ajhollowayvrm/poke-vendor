import { useEffect, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney, packPrice,
  businessVolume, distributorTier, nextDistributorTier, wholesalePrice, caseLot, casePrice,
  VINTAGE_SETS, vintageProduct, sealedValue, setById } from './game/engine'
import { useGame } from './game/store'
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
import { DialogHost, ToastHost, toast } from './ui/dialog'
import { NotorietyBar } from './components/Calendar'
import { SHOW_TIERS } from './game/shows'

// Primary nav: the core loop + Stats (your money/standing matters more than the upgrade
// shop, so Stats gets a top slot and Upgrades moves behind the ⚙️ gear). Reference/meta
// screens (Grader, Prices) live as sub-tabs inside Collection; Settings + Upgrades live
// behind the gear in the top bar.
const TABS = ['shop', 'myshop', 'stream', 'shows', 'stats', 'collection']
const TAB_LABEL = { shop: 'Buy', myshop: 'Sell', stream: 'Stream', shows: 'Shows', stats: 'Stats', collection: 'Cards' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { shop: '🛒', myshop: '🏬', stream: '🔴', shows: '🎪', stats: '📊', collection: '🗂️' }

export default function App() {
  const [tab, setTab] = useState('shop')
  const [shopTab, setShopTab] = useState('buy') // Buy sub-tab: buy | inventory
  const [collTab, setCollTab] = useState('cards') // Collection sub-tab: cards | grader | prices
  const [settingsPane, setSettingsPane] = useState('settings') // gear sub-pane: settings | upgrades
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [picked, setPicked] = useState(null)     // card for modal
  const [preppingShow, setPreppingShow] = useState(null) // show selected; picking which cards to bring
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  const sealedCount = useGame(s => s.sealedInventory.length)
  // only count orders still valid (card not since sold) so the tab badge matches the list
  const inboxCount = useGame(s => s.boothInbox.filter(e => encounterStillValid(e, s.collection, s.listings, s.shopDisplay)).length)
  const offerCount = useGame(s => s.listings.filter(l => (l.offers?.length || 0) > 0).length)
  const notoriety = useGame(s => s.notoriety)
  const [daySummary, setDaySummary] = useState(null) // per-day summary popup after Next Day

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
  useEffect(() => {
    if ((useGame.getState().showInventory || []).length) useGame.getState().endShow()
  }, [])

  function handleNextDay() {
    const summary = useGame.getState().nextDay()
    if (summary) setDaySummary(summary)
  }

  // Buying now STOCKS sealed product into your inventory (hold-first) — you rip, list,
  // or flip it later from the 📦 Inventory tab. With "Auto-rip" on, it rips immediately
  // on buy (the old instant-rip behaviour) for players who'd rather not hold.
  function buyProduct(set, product) {
    // The Buy/Distributor UI passes `_buyPrice` = the actual charged price (retail,
    // wholesale, or case-lot), so the price shown is exactly what's charged.
    const price = product._buyPrice ?? product.price
    if (cash < price) return toast(`Not enough cash for ${product.type}.`)
    const item = useGame.getState().buySealed(set, product, price)
    if (!item) return
    if (useGame.getState().settings.autoAdvance) { ripFromInventory(item.uid); return }
    setShopTab('inventory')
    toast(`Stocked ${product.type} of ${set.name} — rip, list, or flip it from 📦 Inventory.`)
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
      setTab('shop'); setShopTab('buy')
      return
    }
    const all = openProduct(set, product)
    all.forEach(c => (c._isHit = isHit(c)))
    addPulls(all, `${product.type} · ${set.name}`, product.packs) // counts packs + rip goal
    const hits = all.filter(c => c._isHit || c.foil).length
    setTab('collection')
    toast(`Ripped a ${product.type} of ${set.name} — ${all.length} cards, ${hits} hit${hits===1?'':'s'}! Check your collection.`)
  }

  // Buy a vintage sealed pack at its CURRENT (appreciated) market price and hold it.
  function buyVintage(set) {
    const product = vintageProduct(set)
    const price = sealedValue({ product, setId: set.id })
    if (cash < price) return toast(`Not enough cash for the ${product.type}.`)
    const item = useGame.getState().buySealed(set, { ...product, _buyPrice: price }, price)
    if (!item) return
    setShopTab('inventory')
    toast(`Stocked ${product.type} of ${set.name} for ${fmtMoney(price)} — it's in 📦 Inventory.`)
  }

  // "Rip another" from the end-of-rip summary: re-buy the SAME product and rip it fresh,
  // so you can keep chasing without going back to the shop. Charges the same price the
  // original buy did (retail/wholesale/case via _buyPrice), logs it, and re-mounts the
  // animated rip via a bumped nonce. Bails (no charge) if you can't afford it — the
  // summary button is already disabled in that case, this is just a safety net.
  function ripAnother(set, product) {
    const price = product._buyPrice ?? product.price ?? packPrice(set)
    if (cash < price) return toast(`Not enough cash to rip another ${product?.type || 'pack'}.`)
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
    enterAsShopper(show)
  }

  // Enter a show as a SHOPPER: charge only the entry fee, no booth, straight to the floor.
  function enterAsShopper(show) {
    const tier = SHOW_TIERS[show.tierKey]
    if (!spend(tier.entryFee)) return toast('Not enough cash for the entry fee.')
    useGame.getState().bringToShow([]) // ensure the booth is empty — you're here to buy
    useGame.getState().log('show', `Attended ${show.name} as a shopper (${tier.days}d)`, -tier.entryFee)
    useGame.getState().attendShowDays(show.day, tier.days)
    setActiveShow({ ...show, _asVendor: false })
  }

  // Confirmed from the prep screen (VENDOR mode): charge entry + vendor fee, move the
  // picked cards onto your booth, advance the calendar past the show, enter as a vendor.
  function enterShow(show, uids) {
    const tier = SHOW_TIERS[show.tierKey]
    const cost = tier.entryFee + (tier.vendorFee || 0)
    if (!spend(cost)) { setPreppingShow(null); return toast(`Not enough cash for the vendor fee (${'$'+cost}).`) }
    useGame.getState().bringToShow(uids || [])
    useGame.getState().log('show', `Vended at ${show.name} (${tier.days}d · entry $${tier.entryFee} + booth $${tier.vendorFee})`, -cost)
    useGame.getState().attendShowDays(show.day, tier.days)
    setPreppingShow(null)
    setActiveShow({ ...show, _asVendor: true })
  }

  // Leaving the show: unsold show-inventory cards come back home, then exit the floor.
  function leaveShow() {
    useGame.getState().endShow()
    setActiveShow(null)
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
          onConfirm={(uids) => enterShow(preppingShow, uids)}
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
          <span className="noto-chip">⭐ {Math.round(notoriety)}<small>notoriety</small></span>
          <div className="cash">{fmtMoney(cash)}<small>balance</small></div>
          <button className={`gear-btn ${tab === 'settings' ? 'active' : ''}`} aria-label="Settings & Stats" title="Settings & Stats" onClick={() => selectTab('settings')}>⚙️</button>
        </div>
      </div>

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
          <>
            <div className="subtabs">
              <button className={`subtab ${shopTab === 'buy' ? 'active' : ''}`} onClick={() => setShopTab('buy')}>🛒 Buy</button>
              <button className={`subtab ${shopTab === 'inventory' ? 'active' : ''}`} onClick={() => setShopTab('inventory')}>📦 Inventory{sealedCount ? ` (${sealedCount})` : ''}</button>
            </div>
            {shopTab === 'buy' && <Shop cash={cash} onBuy={buyProduct} onBuyVintage={buyVintage} />}
            {shopTab === 'inventory' && <SealedInventory onRip={ripFromInventory} />}
          </>
        )}

        {tab === 'shows' && <Calendar onAttend={attendShow} />}
        {tab === 'myshop' && <BoothInbox />}
        {tab === 'stream' && <Livestream />}
        {tab === 'stats' && <Stats />}

        {tab === 'collection' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${collTab === 'cards' ? 'active' : ''}`} onClick={() => setCollTab('cards')}>🗂️ All</button>
              <button className={`subtab ${collTab === 'binder' ? 'active' : ''}`} onClick={() => setCollTab('binder')}>📒 Binder</button>
              <button className={`subtab ${collTab === 'grader' ? 'active' : ''}`} onClick={() => setCollTab('grader')}>🔬 Grader{pendingCount ? ` (${pendingCount})` : ''}</button>
              <button className={`subtab ${collTab === 'prices' ? 'active' : ''}`} onClick={() => setCollTab('prices')}>🏷️ Prices</button>
            </div>
            {collTab === 'cards' && <Collection onPick={setPicked} />}
            {collTab === 'binder' && <Binder onPick={setPicked} />}
            {collTab === 'grader' && <Bench />}
            {collTab === 'prices' && <PriceGuide />}
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${settingsPane === 'settings' ? 'active' : ''}`} onClick={() => setSettingsPane('settings')}>⚙️ Settings</button>
              <button className={`subtab ${settingsPane === 'upgrades' ? 'active' : ''}`} onClick={() => setSettingsPane('upgrades')}>⬆️ Upgrades</button>
            </div>
            {settingsPane === 'settings' ? <Settings /> : <UpgradeShop />}
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
            ripAnotherPrice={ripping.product?._buyPrice ?? ripping.product?.price ?? packPrice(ripping.set)}
            canRipAnother={cash >= (ripping.product?._buyPrice ?? ripping.product?.price ?? packPrice(ripping.set))}
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

// Per-day summary — shown after clicking "Next Day".
function DaySummary({ summary, onClose }) {
  const { cashDelta, added, listingsSold, listingOffers, wages, rent, lease, payroll, resolvedGrades } = summary
  const currentDay = useGame(s => s.currentDay)
  const hasActivity = added || listingsSold || listingOffers || resolvedGrades || wages || rent || lease || payroll
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 6 }}>📅 Day {currentDay}</h2>
        {!hasActivity ? (
          <p className="muted" style={{ marginTop: 0 }}>A quiet day.</p>
        ) : (
          <div style={{ fontSize: 14, margin: '8px 0', textAlign: 'left' }}>
            {cashDelta != null && (
              <div style={{ marginBottom: 6 }}>Net cash <b style={{ color: cashDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {cashDelta >= 0 ? '+' : ''}{fmtMoney(cashDelta)}</b></div>
            )}
            {added > 0 && <div className="muted">{added} new order{added === 1 ? '' : 's'} in your inbox</div>}
            {listingsSold > 0 && <div className="muted">{listingsSold} listing{listingsSold === 1 ? '' : 's'} sold</div>}
            {listingOffers > 0 && <div className="muted">{listingOffers} new offer{listingOffers === 1 ? '' : 's'} on listings</div>}
            {resolvedGrades > 0 && <div className="muted">{resolvedGrades} card{resolvedGrades === 1 ? '' : 's'} returned from grading</div>}
            {wages > 0 && <div className="muted">Wages earned +{fmtMoney(wages)}</div>}
            {rent > 0 && <div className="muted">Rent paid -{fmtMoney(rent)}</div>}
            {lease > 0 && <div className="muted">Store lease -{fmtMoney(lease)}</div>}
            {payroll > 0 && <div className="muted">Staff payroll -{fmtMoney(payroll)}</div>}
          </div>
        )}
        <button className="btn gold" style={{ maxWidth: 160, marginTop: 8 }} onClick={onClose}>Continue</button>
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
  const stats = useGame(s => s.stats)
  const supplyVendors = useGame(s => s.supplyVendors)
  const supplyChannel = useGame(s => s.supplyChannel || [])
  const volume = businessVolume(stats)
  const tier = distributorTier(volume)
  const next = nextDistributorTier(volume)
  const disc = tier.discount
  const [toastMsg, setToastMsg] = useState(null)
  const flash = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2600) }

  // A product priced for the current account: stamps `_buyPrice` (what's charged)
  // so the shown price equals the charged price. Retail at base tier; wholesale above.
  const priced = (p) => ({ ...p, _buyPrice: wholesalePrice(p.price, disc) })

  return (
    <>
      <DistributorBanner tier={tier} next={next} volume={volume} />

      {tier.supply && (
        <SupplyPanel disc={disc} supplyVendors={supplyVendors} supplyChannel={supplyChannel} cash={cash} flash={flash} />
      )}

      <div className="banner" style={{ marginTop: 14 }}>
        🃏 Real sets & live <b>TCGplayer sealed prices</b> · data from {new Date(FETCHED_AT).toLocaleDateString()} ·
        each product rips into its real pack count (+ a guaranteed promo for ETBs/tins/premiums).
        {disc > 0 ? <> Your <b style={{ color: tier.color }}>{tier.name}</b> account takes <b style={{ color:'var(--green)' }}>{Math.round(disc*100)}% off</b> every product.</> : <> Ripping sealed is usually a loss — the chase is the fun.</>}
      </div>
      <div className="grid shop-grid">
        {SHOP_SETS.map(set => {
          const products = setProducts(set)
          const lot = tier.cases ? caseLot(set) : null
          return (
            <div className="product" key={set.id}>
              {set.logo && <img className="logo" src={set.logo} alt={set.name} />}
              <h3>{set.name}</h3>
              <div className="meta">{set.series} · {set.printedTotal} numbered / {set.total} total</div>
              <div className="prodlist">
                {products.map(p => {
                  const pp = priced(p)
                  return (
                    <button key={p.type} className="prodbtn" disabled={cash < pp._buyPrice} onClick={() => onBuy(set, pp)}
                      title={`${p.packs} pack${p.packs>1?'s':''}${p.bonus ? ' + promo' : ''}${disc>0?` · ${Math.round(disc*100)}% wholesale`:''}`}>
                      <span className="prodname">{p.icon} {p.type}</span>
                      <span className="prodmeta">{p.packs} pk{p.bonus ? ' +🎁' : ''}</span>
                      <span className="prodprice">
                        {disc > 0 && <s className="retail">{fmtMoney(p.price)}</s>}
                        {fmtMoney(pp._buyPrice)}
                      </span>
                    </button>
                  )
                })}
                {lot && (() => {
                  const price = casePrice(lot, disc)
                  return (
                    <button className="prodbtn caselot" disabled={cash < price}
                      onClick={() => onBuy(set, { ...lot.unit, type: lot.type, icon: lot.icon, packs: lot.packs, _buyPrice: price })}
                      title={`${lot.boxes} boxes · ${lot.packs} packs · case bulk pricing`}>
                      <span className="prodname">{lot.icon} {lot.type}</span>
                      <span className="prodmeta">{lot.packs} pk · {lot.boxes} boxes</span>
                      <span className="prodprice"><s className="retail">{fmtMoney(lot.retail)}</s>{fmtMoney(price)}</span>
                    </button>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
      <VintageVault onBuy={onBuyVintage} cash={cash} />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}

// Vintage sealed: pricey old packs bought at current (appreciated) market value and
// HELD — they trend up over time. Buying stocks them into your sealed inventory; ripping
// one (a single old pack) is a real gamble. Re-prices live as the market drifts.
function VintageVault({ onBuy, cash }) {
  useGame(s => s.marketMults) // re-price as the market drifts
  if (!VINTAGE_SETS.length) return null
  return (
    <div className="market-panel vintage-vault" style={{ marginTop: 18 }}>
      <div className="market-head">🏛️ Vintage Vault <span className="muted">— rare old sealed packs. Buy &amp; hold; vintage appreciates. Ripping one is a real gamble.</span></div>
      <div className="grid shop-grid" style={{ marginTop: 10 }}>
        {VINTAGE_SETS.map(set => {
          const product = vintageProduct(set)
          const price = sealedValue({ product, setId: set.id })
          const up = price >= (product.price || 0)
          return (
            <div className="product" key={set.id}>
              {set.logo && <img className="logo" src={set.logo} alt={set.name} />}
              <h3>{set.name}</h3>
              <div className="meta">{set.series} · {set.printedTotal || set.total} cards</div>
              <div className="prodlist">
                <button className="prodbtn" disabled={cash < price} onClick={() => onBuy(set)}
                  title={`${product.type} · current market ${fmtMoney(price)}`}>
                  <span className="prodname">{product.icon || '📦'} {product.type}</span>
                  <span className="prodmeta" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'} mkt</span>
                  <span className="prodprice">{fmtMoney(price)}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Distributor status banner: your tier, what it unlocks, and progress to the next.
function DistributorBanner({ tier, next, volume }) {
  const pct = next ? Math.min(100, Math.round(((volume - tier.min) / (next.min - tier.min)) * 100)) : 100
  return (
    <div className="distrib-banner" style={{ marginTop: 18, borderColor: tier.color + '66' }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
        <span className="pill" style={{ background: tier.color + '22', color: tier.color, fontSize: 13 }}>📦 {tier.name}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {tier.discount > 0 ? `${Math.round(tier.discount*100)}% wholesale off` : 'Move volume to unlock wholesale pricing'}
          {tier.cases ? ' · case lots' : ''}{tier.supply ? ' · supply other vendors' : ''}
        </span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Lifetime volume {fmtMoney(volume)}</span>
      </div>
      {next && (
        <>
          <div className="distrib-bar"><div style={{ width: pct + '%', background: tier.color }} /></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            {fmtMoney(next.min - volume)} more volume → <b style={{ color: next.color }}>{next.name}</b>
            {' '}({Math.round(next.discount*100)}% off{next.cases && !tier.cases ? ', case lots' : ''}{next.supply && !tier.supply ? ', supply vendors' : ''})
          </div>
        </>
      )}
    </div>
  )
}

// Supply Vendors: wholesale sealed product into the channel for passive income.
function SupplyPanel({ disc, supplyVendors, supplyChannel, cash, flash }) {
  const [setId, setSetId] = useState(SHOP_SETS[0].id)
  const set = SHOP_SETS.find(s => s.id === setId) || SHOP_SETS[0]
  const products = setProducts(set)
  const [type, setType] = useState(() => products.find(p => p.packs >= 10)?.type || products[0].type)
  const product = products.find(p => p.type === type) || products[0]
  const cost = wholesalePrice(product.price, disc)
  const pending = supplyChannel.reduce((a, w) => a + w.net, 0)

  function place() {
    if (cash < cost) return flash('Not enough cash to buy in.')
    const r = supplyVendors(set, product)
    if (r) flash(`Wholesaled ${product.type} of ${set.name} — nets ${fmtMoney(r.net)} in ~${r.daysLeft}d.`)
  }
  return (
    <div className="market-panel" style={{ marginTop: 14 }}>
      <div className="market-head">📦 Supply other vendors <span className="muted">— buy in at wholesale, sell through the channel for passive income over a few days</span></div>
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
