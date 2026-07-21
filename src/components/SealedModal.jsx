import { useEffect } from 'react'
import { useGame } from '../game/store'
import { setById, sealedValue, sealedBase, breakOptions, fmtMoney, round2, SEALED_FLIP_RATE } from '../game/engine'

// The sealed-product page — the counterpart to CardModal, so a booster box / ETB / blister
// is more than a thumbnail + price on the shelf. Opening it shows WHAT the product is (the
// full product name, its set, how many packs, whether it ships a guaranteed promo) plus the
// live market read (value, your cost basis, what it breaks down into) and the moves that fit
// its place. Rendered from StoreStock, which owns the rip/break/move/sell verbs.
export default function SealedModal({ item, place, onClose, onRip, flash }) {
  const breakSealed = useGame(s => s.breakSealed)
  const moveStock = useGame(s => s.moveStock)
  const listSealed = useGame(s => s.listSealed)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  useGame(s => s.marketMults) // keep value live as the market drifts

  // close on Escape — clicking the backdrop already closes; this adds keyboard parity
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!item?.product) return null

  const p = item.product
  const set = setById(item.setId)
  const value = sealedValue(item)
  const base = round2(sealedBase(p))
  const breaks = breakOptions(item)
  const cost = item.boughtPrice
  const gain = cost != null ? round2(value - cost) : null
  const title = p.name || `${set?.name ? set.name + ' ' : ''}${p.type}`
  const year = (set?.releaseDate || '').slice(0, 4)

  const fin = (msg) => { if (msg && flash) flash(msg); onClose() }
  const move = (dest, verb) => { moveStock('sealed', [item.uid], dest); fin(`${verb} ${title}.`) }
  function doBreak() {
    const opt = breaks[0]
    if (!opt) return
    const r = breakSealed(item.uid, opt.product.type)
    if (r?.error) return fin(r.error)
    const where = item.locked ? 'Personal' : 'the Storeroom'
    fin(`🔨 Broke into ${r.count}× ${r.type} (in ${where}).`)
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="detailflex">
          {/* Product panel — the set's logo (or the product's icon) big enough to actually read */}
          <div className="sealed-modal-art">
            {set?.logo
              ? <img src={set.logo} alt={set.name} decoding="async" />
              : <span className="sealed-modal-ico">{p.icon || '📦'}</span>}
            <div className="sealed-modal-badge">{p.icon || '📦'} {p.packs} pack{p.packs === 1 ? '' : 's'}{item.vintage ? ' · 🗝️ vintage' : ''}</div>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <h2>{title}</h2>
            <p className="muted" style={{ margin: '2px 0 10px' }}>
              📦 Sealed product{set?.name ? <> · {set.name}</> : ''}{set?.series ? <> · {set.series}</> : ''}{year ? <> · {year}</> : ''}
            </p>

            <p style={{ fontSize: 15, marginBottom: 4 }}>Market value: <b style={{ color: 'var(--green)' }}>{fmtMoney(value)}</b></p>
            {cost != null && (
              <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
                You paid {fmtMoney(cost)} ·{' '}
                <b style={{ color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{gain >= 0 ? '+' : ''}{fmtMoney(gain)}</b> vs market
              </p>
            )}

            <div className="banner" style={{ marginTop: 8 }}>
              <div>📦 <b>{p.packs}</b> booster pack{p.packs === 1 ? '' : 's'} inside{p.packs > 1 ? ` (~${fmtMoney(round2(base / p.packs))}/pack)` : ''}.</div>
              {p.bonus === 'promo' && <div style={{ marginTop: 4 }}>🎁 Ships a <b>guaranteed promo</b> hit on top of the packs.</div>}
              {breaks.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  🔨 Breaks into {breaks.map((b, i) => (
                    <span key={i}>{i > 0 ? ', ' : ''}<b>{b.count}× {b.product.type}</b> ({fmtMoney(b.total)}{b.delta ? `, ${b.delta >= 0 ? '+' : ''}${fmtMoney(b.delta)}` : ''})</span>
                  ))}.
                </div>
              )}
            </div>

            {/* Actions — the moves that make sense for a sealed unit, mirroring the shelf row */}
            <div className="sell-options" style={{ marginTop: 14 }}>
              <button className="btn alt sellopt" onClick={() => { onClose(); onRip && onRip(item.uid) }}>
                <b>🎬 Rip it now</b>
                <small>Crack it open and price out everything inside</small>
              </button>
              {breaks.length > 0 && (
                <button className="btn alt sellopt" onClick={doBreak}>
                  <b>🔨 Break down · {breaks[0].count}× {breaks[0].product.type}</b>
                  <small>Split one tier down into {fmtMoney(breaks[0].total)} of smaller product (lands in the {item.locked ? 'Personal' : 'Storeroom'})</small>
                </button>
              )}
              {place !== 'floor' && (
                <button className="btn alt sellopt" onClick={() => move('floor', '🛒 Out on the floor —')}>
                  <b>🛒 Put out on the floor</b>
                  <small>Stock it up front so walk-ins can buy it</small>
                </button>
              )}
              {place !== 'storeroom' && (
                <button className="btn alt sellopt" onClick={() => move('storeroom', '📦 To the storeroom —')}>
                  <b>📦 Send to the storeroom</b>
                  <small>Backstock — off the floor, still sellable to counter orders</small>
                </button>
              )}
              {place !== 'personal' && (
                <>
                  <button className="btn alt sellopt" onClick={() => { if (listSealed(item.uid, 1.0)) fin(`Listed ${title} online.`) }}>
                    <b>🏷️ List online</b>
                    <small>Put it up on your site — rides the buyer engine, can catch a hot-set spike</small>
                  </button>
                  <button className="btn alt sellopt" onClick={() => { quickFlipSealed(item.uid); fin(`Flipped ${title}.`) }}>
                    <b>💵 Quick-flip · {fmtMoney(round2(value * SEALED_FLIP_RATE))}</b>
                    <small>Instant cash, but a haircut under market</small>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
