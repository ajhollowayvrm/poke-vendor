import { useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, fmtMoney } from '../game/engine'
import CardTile from './CardTile'
import Haggle from './Haggle'
import { confirmDialog } from '../ui/dialog'

export default function VendorBooth({ booth, onClose, flash, onRipVault, onRipSealed, haggledIds, onHaggled }) {
  // The Vintage Vault is a special booth: no singles bin, just one heavy sealed
  // vintage pack you can buy and crack right here on the floor.
  if (booth.special === 'vault') return <VaultBooth booth={booth} onClose={onClose} onRipVault={onRipVault} />
  return <RegularBooth booth={booth} onClose={onClose} flash={flash} onRipSealed={onRipSealed} haggledIds={haggledIds} onHaggled={onHaggled} />
}

// The rare travelling vintage dealer — sells a single sealed 1999 Base Set pack.
function VaultBooth({ booth, onClose, onRipVault }) {
  const cash = useGame(s => s.cash)
  const { setName, logo, product, ask } = booth.vault
  const afford = cash >= ask
  useModalEscape(onClose)
  async function buy() {
    const ok = await confirmDialog({
      title: `Buy a sealed ${product.name}?`,
      body: `${fmtMoney(ask)} for a genuine heavy vintage pack — unsearched, mint, straight from the case. `
        + `Could hold a base-set holo (Charizard, Blastoise, Venusaur…) — or nothing. `
        + `You'll crack it right here, and the whole hall will be watching.`,
      confirmText: `Buy & rip — ${fmtMoney(ask)}`,
      cancelText: 'Walk away',
    })
    if (!ok) return
    onClose()
    onRipVault?.({ setId: booth.vault.setId, product: { ...product, price: ask } })
  }
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal vault-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="vault-ribbon">✨ SPECIAL EVENT ✨</div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <h2 style={{ marginRight: 'auto' }}>🗝️ The Vintage Vault</h2>
          <span className="pill" style={{ background: '#ffd70022', color: '#ffd700' }}>Vintage Dealer</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>
          A travelling legend who deals only in sealed vintage. Today: one genuine
          <b> {product.name}</b>. Unsearched, heavy, the real thing.
        </p>
        <div className="vault-offer">
          {logo && <img className="vault-logo" src={logo} alt={setName} />}
          <div className="vault-pack">🗝️</div>
          <div className="vault-info">
            <div className="vault-name">{product.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>1 sealed pack · base-set holos inside (Charizard, Blastoise, Venusaur…)</div>
            <div className="vault-ask">{fmtMoney(ask)}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn gold" disabled={!afford} onClick={buy}>
            {afford ? `Buy & rip — ${fmtMoney(ask)}` : `Need ${fmtMoney(ask)}`}
          </button>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 140 }} onClick={onClose}>Walk away</button>
        </div>
        {!afford && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Come back when you've built up some cash — vintage isn't cheap.</p>}
      </div>
    </div>
  )
}

function RegularBooth({ booth, onClose, flash, onRipSealed, haggledIds, onHaggled }) {
  const haggled = haggledIds || new Set()
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const buyFromVendor = useGame(s => s.buyFromVendor)
  const collection = useGame(s => s.collection)
  const [stock, setStock] = useState(booth.stock)
  const sealed = booth.products || []
  const [tab, setTab] = useState('buy')
  const [haggle, setHaggle] = useState(null) // { side, card, market, start }
  // After agreeing a buy, ask whether to list it at the show or take it home.
  const [pendingBuy, setPendingBuy] = useState(null) // { card, price }
  // Escape closes the top-most layer: the buy prompt if open, else the booth.
  // (Haggle owns its own escape.)
  useModalEscape(() => { if (pendingBuy) setPendingBuy(null); else if (!haggle) onClose() })

  const seeDeals = upgrades.network

  // A buy is agreed (at ask or via haggle) → ask where it goes before committing.
  function buyAt(card, price) {
    setPendingBuy({ card, price })
  }
  // Commit the agreed buy. `toShowInventory` lists it for sale at your booth;
  // otherwise it goes home to your collection.
  function commitBuy(toShowInventory) {
    const { card, price } = pendingBuy
    setPendingBuy(null)
    if (buyFromVendor(card, price, { toShowInventory })) {
      setStock(s => s.filter(c => c.uid !== card.uid))
      const deal = price < cardValue(card) * 0.85 ? ' — great deal!' : ''
      flash(`Bought ${card.name} for ${fmtMoney(price)}${deal}${toShowInventory ? ' · listed at your booth' : ' · added to your collection'}`)
    }
  }
  function sellAt(card, price) {
    useGame.getState().resolveEncounter({ type: 'sellOwned', uid: card.uid, price, notoriety: 0, msg: '' })
    flash(`Sold ${card.name} to ${booth.name} for ${fmtMoney(price)}`)
  }
  // Buy a sealed product off the table and crack it on the floor (same rip flow as the
  // Vault). Vintage sealed gets a heads-up about the markup; modern is a quick confirm.
  async function buySealed(entry) {
    const { set, product, _ask, _origin } = entry
    const ok = await confirmDialog({
      title: `Buy a sealed ${product.type}?`,
      body: _origin === 'vintage'
        ? `${fmtMoney(_ask)} for a sealed ${product.name || set.name + ' pack'} — a vintage gamble. `
          + `Vendor markup applies; rip it right here.`
        : `${fmtMoney(_ask)} for a ${product.type} of ${set.name}. Above retail (vendor markup), `
          + `but you can buy and rip it without leaving the show.`,
      confirmText: `Buy & rip — ${fmtMoney(_ask)}`,
      cancelText: 'Walk away',
    })
    if (!ok) return
    onClose()
    onRipSealed?.({ set, product, ask: _ask, vendorName: booth.name })
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
          <button className="btn alt" style={{ flex:'none', maxWidth: 78 }} disabled={haggled.has(card.uid)}
            title={haggled.has(card.uid) ? 'Already haggled this one — buy it or move on' : undefined}
            onClick={() => setHaggle({ side:'buy', card, market: mkt, start: card._ask })}>
            {haggled.has(card.uid) ? 'Haggled' : 'Haggle'}
          </button>
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
          {sealed.length > 0 && <button className={`tab ${tab==='sealed'?'active':''}`} onClick={()=>setTab('sealed')}>📦 Sealed ({sealed.length})</button>}
          <button className={`tab ${tab==='sell'?'active':''}`} onClick={()=>setTab('sell')}>Sell to them</button>
        </div>

        {tab === 'sealed' ? (
          <>
            <div className="showcase-head">📦 Sealed product <span className="muted">— buy &amp; rip it right here (vendor markup applies)</span></div>
            <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))' }}>
              {sealed.map((entry, idx) => (
                <div key={idx} className={`vendoritem featured ${entry._origin === 'vintage' ? 'sealed-vintage' : ''}`}>
                  {entry.set.logo && <img src={entry.set.logo} alt={entry.set.name} style={{ height: 34, objectFit:'contain', alignSelf:'center' }} />}
                  <div style={{ fontWeight: 800, fontSize: 13, textAlign:'center' }}>
                    {entry._origin === 'vintage' ? '🗝️ ' : entry.product.icon + ' '}{entry.product.type}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, textAlign:'center' }}>
                    {entry.set.name} · {entry.product.packs} pk{entry.product.bonus ? ' +🎁' : ''}
                  </div>
                  <div className="askrow" style={{ justifyContent:'center' }}><span className="ask">{fmtMoney(entry._ask)}</span></div>
                  <button className="btn gold" disabled={cash < entry._ask} onClick={() => buySealed(entry)}>
                    {cash < entry._ask ? `Need ${fmtMoney(entry._ask)}` : 'Buy & rip →'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : tab === 'buy' ? (
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
            {[...collection].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 24).map(card => {
              const mkt = cardValue(card)
              const offer = Math.round(mkt * booth.buyMult * 100) / 100
              return (
                <div key={card.uid} className="vendoritem">
                  <CardTile card={card} interactive={false} />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn alt" onClick={() => sellAt(card, offer)}>Sell {fmtMoney(offer)}</button>
                    <button className="btn" style={{ flex:'none', maxWidth: 78 }} disabled={haggled.has(card.uid)}
                      title={haggled.has(card.uid) ? 'Already haggled this one — sell it or move on' : undefined}
                      onClick={() => setHaggle({ side:'sell', card, market: mkt, start: offer })}>
                      {haggled.has(card.uid) ? 'Haggled' : 'Haggle'}
                    </button>
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
          onClose={(engaged) => { if (engaged) onHaggled?.(haggle.card.uid); setHaggle(null) }}
          onDeal={(price) => {
            if (haggle.side === 'buy') buyAt(haggle.card, price)
            else sellAt(haggle.card, price)
            onHaggled?.(haggle.card.uid)
            setHaggle(null)
          }}
        />
      )}

      {pendingBuy && (
        <div className="modalbg" style={{ zIndex: 20 }} onClick={() => setPendingBuy(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Bought {pendingBuy.card.name}</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              for {fmtMoney(pendingBuy.price)} · market {fmtMoney(cardValue(pendingBuy.card))}.
              What do you want to do with it?
            </p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" onClick={() => commitBuy(true)}>
                🪧 List it at your booth — sell it here
              </button>
              <button className="btn alt" onClick={() => commitBuy(false)}>
                🗂️ Keep it in your collection
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Listed cards are offered to shoppers at your table; unsold ones come home when you leave.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
