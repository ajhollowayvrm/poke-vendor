import { useMemo } from 'react'
import { useGame, absoluteDay } from '../game/store'
import { rosterForShow, vendorPreview, crowdTipFrom, vendorRapport, archetype } from '../game/shows'
import { sealedValue, fmtMoney, round2 } from '../game/engine'
import { toast, useModalEscape } from '../ui/dialog'

// 💬 Pre-show DMs — "it's not the size of the show, it's who's going." For a show a few
// days out, this is the group chat: which recurring dealers are setting up (rosterForShow —
// the exact ones the floor will seat), what a few of them are hauling (vendorPreview), and
// what the room's going to feel like (crowdTipFrom — rapport-gated gossip). Dealers you're
// at least Familiar with will sell you ONE piece now (💳 ships home after the show) or hold
// ONE on their table (🤝 pay when you get there) — dealing before the show builds the same
// rapport ladder as dealing at it. Below Familiar, they leave you on read: buy from them at
// a show first.
export default function ShowDMs({ show, onClose }) {
  const cash = useGame(s => s.cash)
  const showVendors = useGame(s => s.showVendors)
  const vendorSpend = useGame(s => s.vendorSpend)
  const showLeads = useGame(s => s.showLeads)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const prepayFromVendor = useGame(s => s.prepayFromVendor)
  const reserveFromVendor = useGame(s => s.reserveFromVendor)
  useModalEscape(onClose)

  const absDay = absoluteDay(show.day, monthsElapsed)
  const roster = useMemo(() => rosterForShow(show, showVendors || []), [show, showVendors])
  // The crowd rumor: the best-connected dealer willing to gossip sets the read.
  const tip = useMemo(() => {
    let best = null
    for (const v of roster) {
      const level = vendorRapport(vendorSpend?.[v.id] || 0).level
      const t = crowdTipFrom(show, v, level)
      if (t && (!best || level > best.level)) best = { vendor: v, level, crowd: t }
    }
    return best
  }, [roster, show, vendorSpend])

  const boughtFrom = (vid) => (showLeads || []).some(l => l.showId === show.id && l.vendorId === vid && l.kind === 'purchase')
  const heldBy = (vid) => (showLeads || []).some(l => l.showId === show.id && l.vendorId === vid && l.kind === 'vendor')

  function doBuy(vendor, item) {
    const res = prepayFromVendor({ show, vendor, item, absDay })
    toast(res.error ? res.error : `💳 Paid ${fmtMoney(res.price)} — it ships home after the show.`)
  }
  function doReserve(vendor, item) {
    const res = reserveFromVendor({ show, vendor, item, absDay })
    toast(res.error ? res.error : `🤝 ${vendor.name} will have it on the table for you — ${fmtMoney(res.price)} when you get there.`)
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 style={{ fontSize: 19, marginBottom: 2 }}>💬 Who's going — {show.name}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Day {show.day} · {show.tier}. The size of the hall isn't what matters — it's who books a table.
        </p>

        {tip ? (
          <div className="banner" style={{ marginBottom: 10 }}>
            {tip.crowd === 'stacked'
              ? <>🔥 <b>{tip.vendor.name}</b>: "Heard the room's going to be <b>stacked</b> — serious collectors booked tables. Bring your good stuff."</>
              : tip.crowd === 'quiet'
              ? <>💤 <b>{tip.vendor.name}</b>: "Honestly? Sounds like a <b>slow one</b>. Might just be locals clearing binders."</>
              : <>🙂 <b>{tip.vendor.name}</b>: "Should be a normal crowd — the usual faces."</>}
          </div>
        ) : (
          <div className="banner" style={{ marginBottom: 10 }}>
            🤐 Nobody's talking about the crowd yet — dealers gossip with people they <b>know</b>. Build rapport and the reads come to you.
          </div>
        )}

        {roster.length === 0 && <p className="muted">No dealers you recognize on the list for this one.</p>}

        {roster.map(v => {
          const rap = vendorRapport(vendorSpend?.[v.id] || 0)
          const arch = archetype(v.archetype)
          const items = rap.level >= 1 ? vendorPreview(show, v) : []
          return (
            <div key={v.id} className="wants" style={{ marginBottom: 8 }}>
              <div className="wants-head" style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span>🤝 {v.name}</span>
                <span className="pill">{arch.label}</span>
                <span className="pill" style={{ background: rap.color + '22', color: rap.color }}>{rap.name}{rap.disc ? ` · ${Math.round(rap.disc * 100)}% off` : ''}</span>
              </div>
              {rap.level < 1 ? (
                <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 2px' }}>
                  They're setting up, but you don't know them well enough to deal over DM — buy from their table at a show first.
                </p>
              ) : items.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 2px' }}>"Still packing the van — come see the table."</p>
              ) : (
                <div className="vsealed-list" style={{ marginTop: 6 }}>
                  {items.map((item, idx) => {
                    const mkt = sealedValue({ product: item.product, setId: item.set.id })
                    const price = round2(item.ask * (1 - rap.disc))
                    const bought = boughtFrom(v.id)
                    const held = heldBy(v.id)
                    return (
                      <div key={idx} className={`vsealed-row ${item.origin === 'vintage' ? 'sealed-vintage' : ''} ${item.origin === 'aftermarket' ? 'sealed-aftermarket' : ''}`}>
                        <span className="vsealed-name">
                          {item.origin === 'vintage' ? '🗝️ ' : item.origin === 'aftermarket' ? '🕰️ ' : (item.product.icon || '📦') + ' '}
                          {item.product.type}
                        </span>
                        <span className="vsealed-meta">{item.set.name}{mkt > 0 ? ` · mkt ${fmtMoney(mkt)}` : ''}</span>
                        <span className="vsealed-ask">
                          {rap.disc > 0 && <s className="retail" style={{ marginRight: 4 }}>{fmtMoney(item.ask)}</s>}
                          <span className="ask">{fmtMoney(price)}</span>
                        </span>
                        <span className="vsealed-act">
                          <button className="btn gold" disabled={bought || cash < price}
                            title={bought ? 'One pre-show buy per dealer per show' : 'Pay now — it ships to your storeroom after the show, go or not'}
                            onClick={() => doBuy(v, item)}>{bought ? '✓' : '💳 Buy'}</button>
                          <button className="btn alt" disabled={held}
                            title={held ? "They're already holding something for you" : 'No money down — held on their table at this price, pay when you get there'}
                            onClick={() => doReserve(v, item)}>{held ? '✓' : '🤝 Hold'}</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          One 💳 buy and one 🤝 hold per dealer per show. Buying over DM builds the same rapport as dealing at their table.
        </p>
        <button className="btn alt" style={{ marginTop: 8, maxWidth: 140 }} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
