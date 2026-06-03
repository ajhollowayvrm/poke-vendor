import { useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, fmtMoney } from '../game/engine'
import CardTile from './CardTile'
import Haggle from './Haggle'

export default function VendorBooth({ booth, onClose, flash }) {
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const buyFromVendor = useGame(s => s.buyFromVendor)
  const collection = useGame(s => s.collection)
  const [stock, setStock] = useState(booth.stock)
  const [tab, setTab] = useState('buy')
  const [haggle, setHaggle] = useState(null) // { side, card, market, start }

  const seeDeals = upgrades.network

  function buyAt(card, price) {
    if (buyFromVendor(card, price)) {
      setStock(s => s.filter(c => c.uid !== card.uid))
      flash(`Bought ${card.name} for ${fmtMoney(price)}${price < cardValue(card)*0.85 ? ' — great deal!' : ''}`)
    }
  }
  function sellAt(card, price) {
    useGame.getState().resolveEncounter({ type: 'sellOwned', uid: card.uid, price, notoriety: 0, msg: '' })
    flash(`Sold ${card.name} to ${booth.name} for ${fmtMoney(price)}`)
  }

  function renderBuy(card, featured) {
    const mkt = cardValue(card) // grade-aware true value
    const deal = card._ask < mkt * 0.85
    return (
      <div key={card.uid} className={`vendoritem ${featured ? 'featured' : ''}`}>
        <CardTile card={card} interactive={false} />
        <div className="askrow">
          <span className="ask">{fmtMoney(card._ask)}</span>
          {seeDeals && deal && <span className="dealtag">DEAL</span>}
          {seeDeals && !deal && card._ask > mkt*1.2 && <span className="overtag">OVER</span>}
        </div>
        <div className="muted" style={{fontSize:11}}>mkt {fmtMoney(mkt)}</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" disabled={cash < card._ask} onClick={() => buyAt(card, card._ask)}>Buy</button>
          <button className="btn alt" style={{ flex:'none', maxWidth: 78 }} onClick={() => setHaggle({ side:'buy', card, market: mkt, start: card._ask })}>Haggle</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="row" style={{ alignItems:'baseline' }}>
          <h2 style={{ marginRight:'auto' }}>{booth.name}</h2>
          <span className="pill">{booth.archLabel}</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>This vendor is {booth.vibe}. They pay <b>{Math.round(booth.buyMult*100)}%</b> of market for cards. Try to <b>haggle</b> — but push too hard and they'll walk.</p>

        <div className="tabs" style={{ margin: '10px 0' }}>
          <button className={`tab ${tab==='buy'?'active':''}`} onClick={()=>setTab('buy')}>Their stock ({stock.length})</button>
          <button className={`tab ${tab==='sell'?'active':''}`} onClick={()=>setTab('sell')}>Sell to them</button>
        </div>

        {tab === 'buy' ? (
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
          <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))' }}>
            {collection.slice(0, 24).map(card => {
              const mkt = cardValue(card)
              const offer = Math.round(mkt * booth.buyMult * 100) / 100
              return (
                <div key={card.uid} className="vendoritem">
                  <CardTile card={card} interactive={false} />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn alt" onClick={() => sellAt(card, offer)}>Sell {fmtMoney(offer)}</button>
                    <button className="btn" style={{ flex:'none', maxWidth: 78 }} onClick={() => setHaggle({ side:'sell', card, market: mkt, start: offer })}>Haggle</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={onClose}>Done</button>
      </div>

      {haggle && (
        <Haggle
          side={haggle.side} card={haggle.card} market={haggle.market} start={haggle.start}
          archKey={booth.archetype} vendorName={booth.name}
          onClose={() => setHaggle(null)}
          onDeal={(price) => {
            if (haggle.side === 'buy') buyAt(haggle.card, price)
            else sellAt(haggle.card, price)
            setHaggle(null)
          }}
        />
      )}
    </div>
  )
}
