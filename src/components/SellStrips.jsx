import { useState } from 'react'
import { useGame } from '../game/store'
import { fmtMoney, cardValue } from '../game/engine'

// The "on the market" panel — cards you've listed on your own site (browsed by
// real customers) and cards you've consigned. Lives on the Sell tab.
export default function SellStrips() {
  const consignments = useGame(s => s.consignments)
  const listings = useGame(s => s.listings)

  if (!listings.length && !consignments.length) return null

  return (
    <>
      {listings.length > 0 && (
        <div className="market-panel">
          <div className="market-head">🌐 Listed for sale <span className="muted">({listings.length}) — online sales pay a 5% fee + shipping; 🏬+🌐 items can also sell in person, fee-free at a premium</span></div>
          <div className="market-list">
            {listings.map(l => <ListingRow key={l.card.uid} l={l} />)}
          </div>
        </div>
      )}

      {consignments.length > 0 && (
        <div className="consign-strip">
          <b>↗ Consigned ({consignments.length})</b>
          {consignments.map((c, i) => (
            <span key={i} className="pill" title={`Pays ${fmtMoney(c.net)} when it sells`}>
              {c.card.name} · {fmtMoney(c.net)} · {c.daysLeft}d
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>— pays out as the days pass / when you attend a show</span>
        </div>
      )}
    </>
  )
}

function ListingRow({ l }) {
  const acceptOffer = useGame(s => s.acceptOffer)
  const declineOffer = useGame(s => s.declineOffer)
  const repriceListing = useGame(s => s.repriceListing)
  const pullListing = useGame(s => s.pullListing)
  const setListingAutoSell = useGame(s => s.setListingAutoSell)
  const setListingEverywhere = useGame(s => s.setListingEverywhere)
  const hasAutoSell = useGame(s => !!s.upgrades.autoSell)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const [repricing, setRepricing] = useState(false)
  const [mult, setMult] = useState(l.askMult || 1.1)

  // The store's listing actions address by INDEX, but the listings array shifts under us
  // when a sale/pull removes an earlier listing on a day-tick. Resolve the CURRENT index
  // by this card's uid at click time so an action never lands on the wrong (shifted) row.
  const uid = l.card.uid
  const withIdx = (fn) => () => {
    const idx = useGame.getState().listings.findIndex(x => x.card.uid === uid)
    if (idx >= 0) fn(idx)
  }

  const market = cardValue(l.card)
  const pct = Math.round((l.askMult || 1) * 100)
  const canEverywhere = hasStore && !l.card?._sealed
  const offers = l.offers || []
  const topOffer = offers.reduce((best, o) => {
    if (!best) return o
    if (o.net > best.net) return o
    if (o.net === best.net && o.amount > best.amount) return o
    return best
  }, null)
  const hiddenCount = topOffer ? offers.length - 1 : 0
  const autoSellOn = l.autoSell !== false

  return (
    <div className={`listing-row ${l.stale ? 'stale' : ''}`}>
      <div className="listing-main">
        {l.card.img && <img src={l.card.img} alt="" className="listing-thumb" />}
        <div className="listing-info">
          <div className="listing-name">
            {l.card.name}
            {l.card.grade && (
              <span className="pill" style={{ marginLeft: 6, fontSize: 11, background: 'color-mix(in srgb, var(--gold) 13%, transparent)', color: 'var(--gold)', border: '1px solid color-mix(in srgb, var(--gold) 27%, transparent)' }}>
                PSA {l.card.grade.overall}
              </span>
            )}
          </div>
          <div className="listing-sub">
            <b>{fmtMoney(l.ask)}</b> <span className="muted">· {pct}% of market</span>
            <span className="pill" style={l.everywhere
              ? { fontSize: 10.5, background: '#ffcb0522', color: 'var(--gold)' }
              : { fontSize: 10.5, background: '#5aa0ff22', color: '#5aa0ff' }}
              title={l.everywhere
                ? 'Listed everywhere — online AND in your store case. A walk-in can buy it fee-free at the in-person premium; whichever channel sells first takes it.'
                : 'Online only — sales pay the 5% marketplace fee + shipping.'}>
              {l.everywhere ? '🏬+🌐 everywhere' : '🌐 online'}
            </span>
            <span className="listing-views" title="Customers who've looked at this listing">👀 {l.views || 0}</span>
            {l.stale && <span className="pill expired" title="Lots of looks, no buyers — almost certainly priced too high">priced too high</span>}
          </div>
        </div>
        <div className="listing-actions">
          {(canEverywhere || l.everywhere) && (
            <button className="linkbtn"
              title={l.everywhere ? 'Take it out of the store case (keep the online listing)' : 'Also put it out in your store case — sells to walk-ins too, fee-free at a premium'}
              onClick={withIdx(idx => setListingEverywhere(idx, !l.everywhere))}>
              {l.everywhere ? 'online only' : '+ store case'}
            </button>
          )}
          {hasAutoSell && (
            <button
              className={`btn ${autoSellOn ? 'gold' : 'alt'}`}
              style={{ padding: '2px 8px', fontSize: 11, flex: 'none' }}
              title={autoSellOn ? '🤖 Auto-sell ON — click to hold for manual offers' : '🤖 Auto-sell OFF — click to re-enable'}
              onClick={withIdx(idx => setListingAutoSell(idx, !autoSellOn))}
            >
              🤖 {autoSellOn ? 'Auto' : 'Manual'}
            </button>
          )}
          <button className="linkbtn" onClick={() => setRepricing(v => !v)}>{repricing ? 'close' : 'reprice'}</button>
          <button className="linkbtn" onClick={withIdx(idx => pullListing(idx))}>pull</button>
        </div>
      </div>

      {repricing && (
        <div className="listing-reprice">
          <span className="muted">New ask: <b>{fmtMoney(market * mult)}</b> ({Math.round(mult * 100)}%)</span>
          <input type="range" min="0.8" max="2" step="0.05" value={mult}
            onChange={e => setMult(parseFloat(e.target.value))} />
          <button className="btn" style={{ flex: 'none' }} onClick={withIdx(idx => { repriceListing(idx, mult); setRepricing(false) })}>Reprice</button>
        </div>
      )}

      {topOffer && (
        <div className="listing-offers">
          <div className="offer">
            <span className="offer-label" title={`${topOffer.savvyLabel} offered below your ask`}>
              {topOffer.icon} Offer <b>{fmtMoney(topOffer.amount)}</b> <span className="muted">(nets {fmtMoney(topOffer.net)})</span>
              {hiddenCount > 0 && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>+{hiddenCount} more bid{hiddenCount > 1 ? 's' : ''}</span>}
            </span>
            <button className="btn gold" style={{ flex: 'none' }} onClick={withIdx(idx => acceptOffer(idx, topOffer.id))}>Accept</button>
            <button className="linkbtn" onClick={withIdx(idx => declineOffer(idx, topOffer.id))}>decline</button>
          </div>
        </div>
      )}
    </div>
  )
}
