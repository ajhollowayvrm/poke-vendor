import { useState } from 'react'
import { useGame } from '../game/store'
import { rawValue, fmtMoney } from '../game/engine'
import CardTile from './CardTile'

export default function VendorBooth({ booth, onClose, flash }) {
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const buyFromVendor = useGame(s => s.buyFromVendor)
  const collection = useGame(s => s.collection)
  const [stock, setStock] = useState(booth.stock)
  const [tab, setTab] = useState('buy')

  // network upgrade reveals whether a card is a deal
  const seeDeals = upgrades.network

  function buy(card) {
    if (buyFromVendor(card, card._ask)) {
      setStock(s => s.filter(c => c.uid !== card.uid))
      flash(`Bought ${card.name} for ${fmtMoney(card._ask)}${card._mispriced ? ' — what a steal!' : ''}`)
    }
  }

  // what this vendor will pay for YOUR cards
  function sellTo(card) {
    const offer = Math.round(rawValue(card) * booth.buyMult * 100) / 100
    useGame.getState().resolveEncounter({ type: 'sellOwned', uid: card.uid, price: offer, notoriety: 0, msg: '' })
    flash(`Sold ${card.name} to ${booth.name} for ${fmtMoney(offer)}`)
  }

  function renderBuy(card, featured) {
    const deal = card._ask < rawValue(card) * 0.85
    return (
      <div key={card.uid} className={`vendoritem ${featured ? 'featured' : ''}`}>
        <CardTile card={card} interactive={false} />
        <div className="askrow">
          <span className="ask">{fmtMoney(card._ask)}</span>
          {seeDeals && deal && <span className="dealtag">DEAL</span>}
          {seeDeals && !deal && card._ask > rawValue(card)*1.2 && <span className="overtag">OVER</span>}
        </div>
        <div className="muted" style={{fontSize:11}}>mkt {fmtMoney(rawValue(card))}</div>
        <button className="btn" disabled={cash < card._ask} onClick={() => buy(card)}>Buy</button>
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
        <p className="muted" style={{ marginTop: 2 }}>This vendor is {booth.vibe}. They pay <b>{Math.round(booth.buyMult*100)}%</b> of market for cards.</p>

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
            {collection.slice(0, 24).map(card => (
              <div key={card.uid} className="vendoritem">
                <CardTile card={card} interactive={false} />
                <button className="btn alt" onClick={() => sellTo(card)}>
                  Sell {fmtMoney(rawValue(card)*booth.buyMult)}
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
