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
          <div className="market-head">🌐 Listed on your site <span className="muted">({listings.length}) — customers browse these; a fair price sells, an overpriced one just sits</span></div>
          <div className="market-list">
            {listings.map((l, i) => <ListingRow key={i} l={l} i={i} />)}
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

function ListingRow({ l, i }) {
  const acceptOffer = useGame(s => s.acceptOffer)
  const declineOffer = useGame(s => s.declineOffer)
  const repriceListing = useGame(s => s.repriceListing)
  const pullListing = useGame(s => s.pullListing)
  const setListingAutoSell = useGame(s => s.setListingAutoSell)
  const hasAutoSell = useGame(s => !!s.upgrades.autoSell)
  const [repricing, setRepricing] = useState(false)
  const [mult, setMult] = useState(l.askMult || 1.1)

  const market = cardValue(l.card)
  const pct = Math.round((l.askMult || 1) * 100)
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
              <span className="pill" style={{ marginLeft: 6, fontSize: 11, background: '#ffcb0522', color: '#ffcb05', border: '1px solid #ffcb0544' }}>
                PSA {l.card.grade.overall}
              </span>
            )}
          </div>
          <div className="listing-sub">
            <b>{fmtMoney(l.ask)}</b> <span className="muted">· {pct}% of market</span>
            <span className="listing-views" title="Customers who've looked at this listing">👀 {l.views || 0}</span>
            {l.stale && <span className="pill expired" title="Lots of looks, no buyers — almost certainly priced too high">priced too high</span>}
          </div>
        </div>
        <div className="listing-actions">
          {hasAutoSell && (
            <button
              className={`btn ${autoSellOn ? 'gold' : 'alt'}`}
              style={{ padding: '2px 8px', fontSize: 11, flex: 'none' }}
              title={autoSellOn ? '🤖 Auto-sell ON — click to hold for manual offers' : '🤖 Auto-sell OFF — click to re-enable'}
              onClick={() => setListingAutoSell(i, !autoSellOn)}
            >
              🤖 {autoSellOn ? 'Auto' : 'Manual'}
            </button>
          )}
          <button className="linkbtn" onClick={() => setRepricing(v => !v)}>{repricing ? 'close' : 'reprice'}</button>
          <button className="linkbtn" onClick={() => pullListing(i)}>pull</button>
        </div>
      </div>

      {repricing && (
        <div className="listing-reprice">
          <span className="muted">New ask: <b>{fmtMoney(market * mult)}</b> ({Math.round(mult * 100)}%)</span>
          <input type="range" min="0.8" max="2" step="0.05" value={mult}
            onChange={e => setMult(parseFloat(e.target.value))} />
          <button className="btn" style={{ flex: 'none' }} onClick={() => { repriceListing(i, mult); setRepricing(false) }}>Reprice</button>
        </div>
      )}

      {topOffer && (
        <div className="listing-offers">
          <div className="offer">
            <span className="offer-label" title={`${topOffer.savvyLabel} offered below your ask`}>
              {topOffer.icon} Offer <b>{fmtMoney(topOffer.amount)}</b> <span className="muted">(nets {fmtMoney(topOffer.net)})</span>
              {hiddenCount > 0 && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>+{hiddenCount} more bid{hiddenCount > 1 ? 's' : ''}</span>}
            </span>
            <button className="btn gold" style={{ flex: 'none' }} onClick={() => acceptOffer(i, topOffer.id)}>Accept</button>
            <button className="linkbtn" onClick={() => declineOffer(i, topOffer.id)}>decline</button>
          </div>
        </div>
      )}
    </div>
  )
}
