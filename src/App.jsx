import { useEffect, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney } from './game/engine'
import { useGame, dayLengthMs } from './game/store'
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
import ShowPrep from './components/ShowPrep'
import { NotorietyBar } from './components/Calendar'
import { SHOW_TIERS } from './game/shows'

// Primary nav: the core loop only. Reference/meta screens (Grader, Prices) live
// as sub-tabs inside Collection; Settings + Stats live behind the ⚙️ gear in the top bar.
const TABS = ['shop', 'myshop', 'shows', 'upgrades', 'collection']
const TAB_LABEL = { shop: 'Buy', myshop: 'Sell', shows: 'Shows', upgrades: 'Upgrades', collection: 'Cards' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { shop: '🛒', myshop: '🏬', shows: '🎪', upgrades: '⬆️', collection: '🗂️' }

export default function App() {
  const [tab, setTab] = useState('shop')
  const [collTab, setCollTab] = useState('cards') // Collection sub-tab: cards | grader | prices
  const [settingsPane, setSettingsPane] = useState('settings') // Settings tab sub-pane: settings | stats
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [picked, setPicked] = useState(null)     // card for modal
  const [preppingShow, setPreppingShow] = useState(null) // show selected; picking which cards to bring
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  // only count orders still valid (card not since sold) so the tab badge matches the list
  const inboxCount = useGame(s => s.boothInbox.filter(e => encounterStillValid(e, s.collection, s.listings)).length)
  const notoriety = useGame(s => s.notoriety)
  const resolveGrades = useGame(s => s.resolveGrades)
  const tickRealTime = useGame(s => s.tickRealTime)
  const [awaySummary, setAwaySummary] = useState(null) // "while you were away" banner

  // REAL-TIME CLOCK. One unified tick drives the whole living world: advance whole game-days
  // of elapsed real time (orders, listings, consignments, wages/rent later — and grades, which
  // resolve inside advanceDaysWith's day loop). Runs on mount (offline catch-up), every second
  // while open, and whenever the tab becomes visible again.
  useEffect(() => {
    const pump = (showAway) => {
      const summary = tickRealTime()
      resolveGrades() // settle any grades whose readyAt just passed this tick
      if (showAway && summary && summary.days >= 1) setAwaySummary(summary)
    }
    pump(true) // mount: catch up offline time and surface a summary
    // If the page was reloaded while a show was open, the floor view (React state) is
    // gone but show-inventory cards may still be stranded on the table — bring them home.
    if ((useGame.getState().showInventory || []).length) useGame.getState().endShow()
    const id = setInterval(() => pump(false), 1000)
    const onVis = () => { if (document.visibilityState === 'visible') pump(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [tickRealTime, resolveGrades])

  // Buy any sealed product. A single booster pack always opens the animated rip.
  // Multi-pack products: if "open one at a time" is on, rip each pack with the
  // animation (you can fast-forward); otherwise open the whole thing instantly.
  function buyProduct(set, product) {
    if (cash < product.price) return alert(`Not enough cash for ${product.type}!`)
    const oneByOne = useGame.getState().settings.openSealedOneByOne
    const animated = product.packs === 1 || oneByOne
    if (animated) {
      if (!spend(product.price)) return
      useGame.getState().recordSetSpend(set.id, product.price)
      useGame.getState().log('buy', `Bought ${product.type} (${set.name})`, -product.price)
      setRipping({ set, product })
      setTab('shop')
      return
    }
    if (!spend(product.price)) return
    useGame.getState().recordSetSpend(set.id, product.price)
    const all = openProduct(set, product)
    all.forEach(c => (c._isHit = isHit(c)))
    addPulls(all, `${product.type} · ${set.name}`, product.packs) // counts packs + rip goal
    useGame.getState().log('buy', `Opened ${product.type} (${set.name})`, -product.price)
    const hits = all.filter(c => c._isHit || c.foil).length
    setTab('collection')
    alert(`Ripped a ${product.type} of ${set.name} — ${all.length} cards, ${hits} hit${hits===1?'':'s'}! Check your collection.`)
  }

  // Selecting a show opens the prep screen (pick which cards to bring to sell).
  // No money/days are spent until you confirm in prep — backing out is free.
  function attendShow(show) {
    const tier = SHOW_TIERS[show.tierKey]
    if (useGame.getState().cash < tier.entryFee) return alert('Not enough cash for the entry fee!')
    setPreppingShow(show)
  }

  // Confirmed from the prep screen with the chosen card uids: charge the fee, move
  // the picked cards onto your show table, advance the calendar past the show, enter.
  function enterShow(show, uids) {
    const tier = SHOW_TIERS[show.tierKey]
    if (!spend(tier.entryFee)) { setPreppingShow(null); return alert('Not enough cash for the entry fee!') }
    useGame.getState().bringToShow(uids || [])
    useGame.getState().log('show', `Attended ${show.name} (${tier.days}d)`, -tier.entryFee)
    // advance the calendar past the show — consumes its days, skipping overlaps
    useGame.getState().attendShowDays(show.day, tier.days)
    setPreppingShow(null)
    setActiveShow(show)
  }

  // Leaving the show: unsold show-inventory cards come back home, then exit the floor.
  function leaveShow() {
    useGame.getState().endShow()
    setActiveShow(null)
  }

  // Switch tabs — also bail out of an in-progress pack rip so the new tab renders.
  function selectTab(t) { setRipping(null); setTab(t) }

  // Prepping for a show: the pick-your-inventory screen takes over the whole view.
  if (preppingShow) {
    return (
      <div className="app">
        <ShowPrep show={preppingShow}
          onConfirm={(uids) => enterShow(preppingShow, uids)}
          onCancel={() => setPreppingShow(null)} />
        {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
      </div>
    )
  }

  // If attending a show, the floor takes over the whole view.
  if (activeShow) {
    return (
      <div className="app">
        <ShowFloor show={activeShow} onLeave={leaveShow} />
        {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}
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
              {t === 'myshop' && inboxCount ? ` (${inboxCount})` : ''}
              {t === 'collection' && pendingCount ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          <GameClock />
          <span className="noto-chip">⭐ {Math.round(notoriety)}<small>notoriety</small></span>
          <div className="cash">${cash.toFixed(2)}<small>balance</small></div>
          <button className={`gear-btn ${tab === 'settings' ? 'active' : ''}`} aria-label="Settings & Stats" title="Settings & Stats" onClick={() => selectTab('settings')}>⚙️</button>
        </div>
      </div>

      {awaySummary && <AwaySummary summary={awaySummary} onClose={() => setAwaySummary(null)} />}
      <GameOver />

      {/* the active view fills the space between the top bar and the bottom nav,
          so short pages (empty collection, settings) don't leave dead space */}
      <main className="content">
        {tab === 'shop' && (ripping
          ? <PackOpening set={ripping.set} product={ripping.product} onExit={() => setRipping(null)} />
          : <Shop cash={cash} onBuy={buyProduct} />)}

        {tab === 'shows' && <Calendar onAttend={attendShow} />}
        {tab === 'myshop' && <BoothInbox />}
        {tab === 'upgrades' && <UpgradeShop />}

        {tab === 'collection' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${collTab === 'cards' ? 'active' : ''}`} onClick={() => setCollTab('cards')}>🗂️ All</button>
              <button className={`subtab ${collTab === 'grader' ? 'active' : ''}`} onClick={() => setCollTab('grader')}>🔬 Grader{pendingCount ? ` (${pendingCount})` : ''}</button>
              <button className={`subtab ${collTab === 'prices' ? 'active' : ''}`} onClick={() => setCollTab('prices')}>🏷️ Prices</button>
            </div>
            {collTab === 'cards' && <Collection onPick={setPicked} />}
            {collTab === 'grader' && <Bench />}
            {collTab === 'prices' && <PriceGuide />}
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="subtabs">
              <button className={`subtab ${settingsPane === 'settings' ? 'active' : ''}`} onClick={() => setSettingsPane('settings')}>⚙️ Settings</button>
              <button className={`subtab ${settingsPane === 'stats' ? 'active' : ''}`} onClick={() => setSettingsPane('stats')}>📊 Stats</button>
            </div>
            {settingsPane === 'settings' ? <Settings /> : <Stats />}
          </>
        )}
      </main>

      {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}

      {/* Mobile-only floating bottom nav (top tab strip is hidden at <=640px).
          Icon + small label; the 5 core tabs + a gear for Settings/Stats. */}
      <nav className="bottomnav" aria-label="Primary">
        {TABS.map(t => {
          const badge = t === 'myshop' ? inboxCount : t === 'collection' ? pendingCount : 0
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

// Live day counter + a countdown to the next game-day. Ticks its own 1s timer for the
// countdown display (the actual day advance is driven by App's real-time tick).
function GameClock() {
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const lastTick = useGame(s => s.lastTick)
  const dayMs = useGame(dayLengthMs)
  const [, force] = useState(0)
  useEffect(() => { const id = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(id) }, [])
  const remain = Math.max(0, dayMs - ((Date.now() - (lastTick || Date.now())) % dayMs))
  const mm = Math.floor(remain / 60000)
  const ss = Math.floor((remain % 60000) / 1000)
  return (
    <span className="clock-chip" title={`Next day in ${mm}:${String(ss).padStart(2,'0')} · ${Math.round(dayMs/60000)} min/day`}>
      📅 Day {currentDay}{monthsElapsed ? ` · M${monthsElapsed + 1}` : ''}
      <small>{mm}:{String(ss).padStart(2,'0')} to next</small>
    </span>
  )
}

// "While you were away" — shown after offline/closed-tab time is fast-forwarded on load.
function AwaySummary({ summary, onClose }) {
  const { days, cashDelta, added, capped } = summary
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 6 }}>🕑 {days} day{days === 1 ? '' : 's'} passed</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {capped ? 'You were away a long time — caught up the last stretch.' : 'The shop kept running while you were away.'}
        </p>
        <div style={{ fontSize: 15, margin: '10px 0' }}>
          {cashDelta != null && (
            <div>Net cash <b style={{ color: cashDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {cashDelta >= 0 ? '+' : ''}{fmtMoney(cashDelta)}</b></div>
          )}
          {added ? <div className="muted" style={{ fontSize: 13 }}>{added} new order{added === 1 ? '' : 's'} waiting</div> : null}
        </div>
        <button className="btn gold" style={{ maxWidth: 160 }} onClick={onClose}>Got it →</button>
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

function Shop({ cash, onBuy }) {
  return (
    <>
      <div className="banner" style={{ marginTop: 18 }}>
        🃏 Real sets & live <b>TCGplayer sealed prices</b> · data from {new Date(FETCHED_AT).toLocaleDateString()} ·
        each product rips into its real pack count (+ a guaranteed promo for ETBs/tins/premiums). Ripping sealed is usually a loss — the chase is the fun.
      </div>
      <div className="grid shop-grid">
        {SHOP_SETS.map(set => {
          const products = setProducts(set)
          return (
            <div className="product" key={set.id}>
              {set.logo && <img className="logo" src={set.logo} alt={set.name} />}
              <h3>{set.name}</h3>
              <div className="meta">{set.series} · {set.printedTotal} numbered / {set.total} total</div>
              <div className="prodlist">
                {products.map(p => (
                  <button key={p.type} className="prodbtn" disabled={cash < p.price} onClick={() => onBuy(set, p)}
                    title={`${p.packs} pack${p.packs>1?'s':''}${p.bonus ? ' + promo' : ''}`}>
                    <span className="prodname">{p.icon} {p.type}</span>
                    <span className="prodmeta">{p.packs} pk{p.bonus ? ' +🎁' : ''}</span>
                    <span className="prodprice">{fmtMoney(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
