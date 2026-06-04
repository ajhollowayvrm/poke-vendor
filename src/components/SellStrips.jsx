import { useGame } from '../game/store'
import { fmtMoney } from '../game/engine'

// The "in-transit" selling strips — cards you've listed on your own site, and
// cards you've consigned. Both pay out on a day-advance / when you attend a show.
// Lives on the Sell tab (moved out of Collection, where it ate too much space).
export default function SellStrips() {
  const consignments = useGame(s => s.consignments)
  const listings = useGame(s => s.listings)
  const relistListing = useGame(s => s.relistListing)
  const pullListing = useGame(s => s.pullListing)

  if (!listings.length && !consignments.length) return null

  return (
    <>
      {listings.length > 0 && (
        <div className="consign-strip">
          <b>🌐 Listed on your site ({listings.length})</b>
          {listings.map((l, i) => (
            <span key={i} className={`pill ${l.expired ? 'expired' : ''}`}
              title={l.expired ? 'Priced too high — it sat unsold' : `Sells for ${fmtMoney(l.net)} net in ~${l.daysLeft}d`}>
              {l.card.name} · {fmtMoney(l.ask)}
              {l.expired
                ? <> · <button className="linkbtn" onClick={() => relistListing(i)}>relist</button> / <button className="linkbtn" onClick={() => pullListing(i)}>pull</button></>
                : ` · ${l.daysLeft}d`}
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>— pays out on Next Day / when you attend a show</span>
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
          <span className="muted" style={{ fontSize: 12 }}>— pays out on Next Day / when you attend a show</span>
        </div>
      )}
    </>
  )
}
