import { useState, useRef } from 'react'
import { useGame } from '../game/store'
import { cardValue, fmtMoney } from '../game/engine'
import CardTile from './CardTile'
import Haggle from './Haggle'
import { confirmDialog, useModalEscape } from '../ui/dialog'

export default function VendorBooth({ booth, onClose, flash, onRipVault, onRipSealed, onStockVault, onStockSealed, haggledIds, onHaggled }) {
  // The Vintage Vault is a special booth: no singles bin, just one heavy sealed
  // vintage pack you can buy and crack right here on the floor — or stock to hold.
  if (booth.special === 'vault') return <VaultBooth booth={booth} onClose={onClose} onRipVault={onRipVault} onStockVault={onStockVault} />
  return <RegularBooth booth={booth} onClose={onClose} flash={flash} onRipSealed={onRipSealed} onStockSealed={onStockSealed} haggledIds={haggledIds} onHaggled={onHaggled} />
}

// The rare travelling vintage dealer — sells a single sealed 1999 Base Set pack.
function VaultBooth({ booth, onClose, onRipVault, onStockVault }) {
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
  // Buy the pack and HOLD it in your sealed inventory instead of cracking it now. Vintage
  // appreciates, so banking a sealed old pack to flip later is a legitimate play.
  function hold() {
    onClose()
    onStockVault?.({ setId: booth.vault.setId, product: { ...product, price: ask }, ask })
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
          <button className="btn alt" disabled={!afford} onClick={hold}
            title="Stock it in your inventory to rip, list, or flip later — vintage appreciates while you hold">
            📦 Buy &amp; hold
          </button>
          <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} onClick={onClose}>Walk away</button>
        </div>
        {!afford && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Come back when you've built up some cash — vintage isn't cheap.</p>}
      </div>
    </div>
  )
}

function RegularBooth({ booth, onClose, flash, onRipSealed, onStockSealed, haggledIds, onHaggled }) {
  const haggled = haggledIds || new Set()
  const cash = useGame(s => s.cash)
  const upgrades = useGame(s => s.upgrades)
  const buyFromVendor = useGame(s => s.buyFromVendor)
  const collection = useGame(s => s.collection)
  const [stock, setStock] = useState(booth.stock)
  // Sealed is local state so a stocked item disappears from the table after you take it.
  const [sealed, setSealed] = useState(booth.products || [])
  const [tab, setTab] = useState('buy')
  const [haggle, setHaggle] = useState(null) // { side, card, market, start }
  // After agreeing a buy, ask whether to list it at the show or take it home.
  const [pendingBuy, setPendingBuy] = useState(null) // { card, price }
  // Re-entry guard: a fast double-click on List/Keep could otherwise run commitBuy twice
  // on the same pendingBuy (setPendingBuy(null) is async, so the second click still sees a
  // non-null closure) — double-charging and inserting a duplicate-uid card. Stays true once
  // a buy commits; buyAt() resets it when a NEW purchase begins.
  const committingRef = useRef(false)
  // After choosing a sealed product: rip it on the floor now or stock it to hold.
  const [pendingSealed, setPendingSealed] = useState(null) // the sealed entry
  // Escape closes the top-most layer: a pending prompt if open, else the booth.
  // (Haggle owns its own escape.)
  useModalEscape(() => {
    if (pendingSealed) setPendingSealed(null)
    else if (pendingBuy) setPendingBuy(null)
    else if (!haggle) onClose()
  })

  const seeDeals = upgrades.network

  // A buy is agreed (at ask or via haggle) → ask where it goes before committing.
  function buyAt(card, price) {
    committingRef.current = false // arm a fresh commit for this new purchase
    setPendingBuy({ card, price })
  }
  // Commit the agreed buy. `toShowInventory` lists it for sale at your booth;
  // otherwise it goes home to your collection.
  function commitBuy(toShowInventory) {
    if (committingRef.current || !pendingBuy) return // ignore a double-click re-entry
    committingRef.current = true
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
  // Picking a sealed product opens a choice: rip it on the floor now, or stock it to hold.
  // Buy a sealed product and crack it on the floor right now (same rip flow as the Vault).
  function ripSealedNow(entry) {
    setPendingSealed(null)
    onClose()
    onRipSealed?.({ set: entry.set, product: entry.product, ask: entry._ask, vendorName: booth.name })
  }
  // Buy a sealed product and stock it in your held inventory (rip/list/flip later). Keeps
  // the booth open and removes the item from the table; the last one closes the Sealed tab.
  function stockSealedNow(entry) {
    setPendingSealed(null)
    if (sealed.length <= 1) setTab('buy')
    setSealed(s => s.filter(e => e !== entry))
    onStockSealed?.({ set: entry.set, product: entry.product, ask: entry._ask, vendorName: booth.name })
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
            <div className="showcase-head">📦 Sealed product <span className="muted">— buy to rip on the floor or stock &amp; hold (vendor markup applies)</span></div>
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
                  <button className="btn gold" disabled={cash < entry._ask} onClick={() => setPendingSealed(entry)}>
                    {cash < entry._ask ? `Need ${fmtMoney(entry._ask)}` : 'Buy →'}
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

      {pendingSealed && (
        <div className="modalbg" style={{ zIndex: 20 }} onClick={() => setPendingSealed(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>
              {pendingSealed._origin === 'vintage' ? '🗝️ ' : (pendingSealed.product.icon || '📦') + ' '}{pendingSealed.product.type}
            </h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {pendingSealed.set.name} · {fmtMoney(pendingSealed._ask)} <span style={{ opacity: 0.8 }}>(vendor markup)</span>.
              {pendingSealed._origin === 'vintage' ? ' A sealed vintage gamble.' : ''} Rip it now, or stock it to rip/list/flip later?
            </p>
            <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn gold" disabled={cash < pendingSealed._ask} onClick={() => ripSealedNow(pendingSealed)}>
                📦 Rip it here on the floor →
              </button>
              <button className="btn alt" disabled={cash < pendingSealed._ask} onClick={() => stockSealedNow(pendingSealed)}>
                🗂️ Stock it in your inventory
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Held sealed rides the market — vintage climbs the longer you hold it.
            </p>
          </div>
        </div>
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
