import { useEffect, useState } from 'react'
import { SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney } from './game/engine'
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
import { NotorietyBar } from './components/Calendar'
import { SHOW_TIERS } from './game/shows'

const TABS = ['shop', 'shows', 'myshop', 'upgrades', 'collection', 'prices', 'bench', 'stats', 'settings']
const TAB_LABEL = { shop: 'Shop', shows: 'Shows', myshop: 'Orders', upgrades: 'Upgrades',
  collection: 'Collection', prices: 'Prices', bench: 'Grader', stats: 'Stats', settings: 'Settings' }
// Icons for the mobile bottom nav (label is shown small underneath).
const TAB_ICON = { shop: '🛒', shows: '🎪', myshop: '📨', upgrades: '⬆️',
  collection: '🗂️', prices: '🏷️', bench: '🔬', stats: '📊', settings: '⚙️' }

export default function App() {
  const [tab, setTab] = useState('shop')
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [picked, setPicked] = useState(null)     // card for modal
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  // only count orders still valid (card not since sold) so the tab badge matches the list
  const inboxCount = useGame(s => s.boothInbox.filter(e => encounterStillValid(e, s.collection)).length)
  const notoriety = useGame(s => s.notoriety)
  const resolveGrades = useGame(s => s.resolveGrades)
  const hasPendingGrades = useGame(s => s.pendingGrades.length > 0)

  // Resolve grades whenever the app is mounted (in case the Bench tab isn't open),
  // but only spin the interval while cards are actually at the grader — no point
  // ticking every second with an empty queue.
  useEffect(() => {
    if (!hasPendingGrades) return
    const id = setInterval(resolveGrades, 1000)
    return () => clearInterval(id)
  }, [resolveGrades, hasPendingGrades])

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

  function attendShow(show) {
    const tier = SHOW_TIERS[show.tierKey]
    if (useGame.getState().cash < tier.entryFee) return alert('Not enough cash for the entry fee!')
    // Confirm before committing: attending charges the fee and burns days immediately
    // (and any home orders during those days are missed without a Smartphone). Easy to
    // fat-finger on the portrait/mobile layout, so make it deliberate.
    const noPhone = !useGame.getState().upgrades.smartphone
    const ok = window.confirm(
      `Attend ${show.name}?\n\n` +
      `• Entry fee: $${tier.entryFee}\n` +
      `• Passes ${tier.days} day${tier.days > 1 ? 's' : ''} (you'll skip any other shows in that window)` +
      (noPhone ? `\n• ⚠️ Online orders during the show will be MISSED (no 📱 Smartphone)` : `\n• 📱 Online orders will still be handled while you're away`)
    )
    if (!ok) return
    if (!spend(tier.entryFee)) return alert('Not enough cash for the entry fee!')
    useGame.getState().log('show', `Attended ${show.name} (${tier.days}d)`, -tier.entryFee)
    // advance the calendar past the show — consumes its days, skipping overlaps
    useGame.getState().attendShowDays(show.day, tier.days)
    setActiveShow(show)
  }

  // Switch tabs — also bail out of an in-progress pack rip so the new tab renders.
  function selectTab(t) { setRipping(null); setTab(t) }

  // If attending a show, the floor takes over the whole view.
  if (activeShow) {
    return (
      <div className="app">
        <ShowFloor show={activeShow} onLeave={() => setActiveShow(null)} />
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
              {t === 'bench' && pendingCount ? ` (${pendingCount})` : ''}
              {t === 'myshop' && inboxCount ? ` (${inboxCount})` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          <span className="noto-chip">⭐ {Math.round(notoriety)}<small>notoriety</small></span>
          <div className="cash">${cash.toFixed(2)}<small>balance</small></div>
        </div>
      </div>

      {tab === 'shop' && (ripping
        ? <PackOpening set={ripping.set} product={ripping.product} onExit={() => setRipping(null)} />
        : <Shop cash={cash} onBuy={buyProduct} />)}

      {tab === 'shows' && <Calendar onAttend={attendShow} />}
      {tab === 'myshop' && <BoothInbox />}
      {tab === 'upgrades' && <UpgradeShop />}
      {tab === 'collection' && <Collection onPick={setPicked} />}
      {tab === 'prices' && <PriceGuide />}
      {tab === 'bench' && <Bench />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <Settings />}

      {picked && <CardModal card={picked} onClose={() => setPicked(null)} />}

      {/* Mobile-only floating bottom nav (top tab strip is hidden at <=640px).
          Icon + small label; horizontally scrollable for the full tab set. */}
      <nav className="bottomnav" aria-label="Primary">
        {TABS.map(t => {
          const badge = t === 'bench' ? pendingCount : t === 'myshop' ? inboxCount : 0
          return (
            <button key={t} className={`bnav-btn ${tab === t ? 'active' : ''}`} onClick={() => selectTab(t)}>
              <span className="bnav-icon">{TAB_ICON[t]}{badge ? <span className="bnav-badge">{badge}</span> : null}</span>
              <span className="bnav-label">{TAB_LABEL[t]}</span>
            </button>
          )
        })}
      </nav>
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
        {SETS.map(set => {
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
