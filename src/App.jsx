import { useEffect, useState } from 'react'
import { SETS, FETCHED_AT, setProducts, openProduct, isHit, fmtMoney } from './game/engine'
import { useGame } from './game/store'
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

export default function App() {
  const [tab, setTab] = useState('shop')
  const [ripping, setRipping] = useState(null)   // { set, product } when opening packs
  const [picked, setPicked] = useState(null)     // card for modal
  const [activeShow, setActiveShow] = useState(null) // show being attended
  const cash = useGame(s => s.cash)
  const spend = useGame(s => s.spend)
  const addPulls = useGame(s => s.addPulls)
  const pendingCount = useGame(s => s.pendingGrades.length)
  const inboxCount = useGame(s => s.boothInbox.length)
  const notoriety = useGame(s => s.notoriety)
  const resolveGrades = useGame(s => s.resolveGrades)

  // resolve grades whenever app is mounted (in case Bench tab isn't open)
  useEffect(() => {
    const id = setInterval(resolveGrades, 1000)
    return () => clearInterval(id)
  }, [resolveGrades])

  // Buy any sealed product. A single booster pack always opens the animated rip.
  // Multi-pack products: if "open one at a time" is on, rip each pack with the
  // animation (you can fast-forward); otherwise open the whole thing instantly.
  function buyProduct(set, product) {
    if (cash < product.price) return alert(`Not enough cash for ${product.type}!`)
    const oneByOne = useGame.getState().settings.openSealedOneByOne
    const animated = product.packs === 1 || oneByOne
    if (animated) {
      if (!spend(product.price)) return
      useGame.getState().log('buy', `Bought ${product.type} (${set.name})`, -product.price)
      setRipping({ set, product })
      setTab('shop')
      return
    }
    if (!spend(product.price)) return
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
    if (!spend(tier.entryFee)) return alert('Not enough cash for the entry fee!')
    useGame.getState().log('show', `Attended ${show.name} (${tier.days}d)`, -tier.entryFee)
    // advance the calendar past the show — consumes its days, skipping overlaps
    useGame.getState().attendShowDays(show.day, tier.days)
    setActiveShow(show)
  }

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
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => { setRipping(null); setTab(t) }}>
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
              <div className="meta">{set.series} · {set.printedTotal} cards</div>
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
