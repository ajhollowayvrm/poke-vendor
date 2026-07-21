import { useEffect, useState, lazy, Suspense } from 'react'
import { useGame } from '../game/store'
import { setById, sealedValue, sealedBase, breakOptions, fmtMoney, round2, hitGemRate, SEALED_FLIP_RATE } from '../game/engine'

// Code-split: the set price sheet (every card + PSA estimates) is only pulled when the
// player taps to open it, so its chunk + a set's worth of card art stay off the rip path.
const SetPriceList = lazy(() => import('./SetPriceList'))

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
  const toggleFeatureSealed = useGame(s => s.toggleFeatureSealed)
  const upgrades = useGame(s => s.upgrades)
  useGame(s => s.marketMults) // keep value live as the market drifts
  const [showPrices, setShowPrices] = useState(false) // price-sheet sub-view toggle

  // close on Escape — clicking the backdrop already closes; this adds keyboard parity.
  // From the price sheet, Escape steps back to the detail first (one layer at a time).
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') showPrices ? setShowPrices(false) : onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showPrices])
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
  // How stacked this set's chase lineup is: of its hits, what share clears $100 in a PSA 10.
  const gem = set ? hitGemRate(set, 100, 10) : null

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

  // Price-sheet sub-view: full-width, replaces the detail. A ← Back returns to the detail.
  if (showPrices) {
    return (
      <div className="modalbg" onClick={onClose}>
        <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
          <button className="btn alt" style={{ padding: '5px 12px', marginBottom: 12 }} onClick={() => setShowPrices(false)}>← Back to {p.type}</button>
          <Suspense fallback={<div className="empty" style={{ marginTop: 12 }}>Loading price sheet…</div>}>
            <SetPriceList setId={item.setId} />
          </Suspense>
        </div>
      </div>
    )
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
              {gem && gem.total > 0 && (
                <div style={{ marginTop: 4 }}>
                  💎 <b>{Math.round(gem.pct * 100)}%</b> of this set's {gem.total} hit{gem.total === 1 ? '' : 's'} clear <b>$100</b> graded PSA 10
                  <span className="muted"> ({gem.count} of {gem.total})</span>.
                </div>
              )}
              {p.bonus === 'promo' && <div style={{ marginTop: 4 }}>🎁 Ships a <b>guaranteed promo card</b> on top of the packs — a fixed foil (a headline ex/V chase in premium boxes).</div>}
              {breaks.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  🔨 Breaks into {breaks.map((b, i) => (
                    <span key={i}>{i > 0 ? ', ' : ''}<b>{b.count}× {b.product.type}</b> ({fmtMoney(b.total)}{b.delta ? `, ${b.delta >= 0 ? '+' : ''}${fmtMoney(b.delta)}` : ''})</span>
                  ))}.
                </div>
              )}
            </div>

            {/* Drill-down: the whole set priced out, card by card — the "is this a chase set
                or a deep one?" read. Lazy-loaded on tap (see the code-split import up top). */}
            {set && (
              <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowPrices(true)}>
                📋 See the full {set.name} price sheet →
              </button>
            )}

            {/* The crack-or-flip-or-hold call, laid out with the numbers so the decision is legible
                rather than buried in a wall of buttons. Vintage tilts the whole thing: its sealed is
                finite and trends UP, and it's worth more unopened than the rip — so holding is a real,
                named path, not just "didn't sell yet". */}
            <div className={`banner ${item.vintage ? 'jewel-call' : ''}`} style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 2 }}>{item.vintage ? '🗝️ Your call' : 'Your call'}</div>
              <div>🎬 <b>Crack it</b> — a shot at this set's chase{gem && gem.total > 0 ? <> ({Math.round(gem.pct * 100)}% of its {gem.total} hits clear $100 in a PSA 10)</> : ''}. The gamble.</div>
              <div style={{ marginTop: 3 }}>💵 <b>Flip sealed</b> — <b style={{ color: 'var(--green)' }}>{fmtMoney(round2(value * SEALED_FLIP_RATE))}</b> cash now, or list at ~<b style={{ color: 'var(--green)' }}>{fmtMoney(value)}</b>. The sure thing.</div>
              {item.vintage
                ? <div style={{ marginTop: 3 }}>🗝️ <b>Hold it</b> — vintage sealed is finite and <b>trends up</b>; it's worth more unopened than the rip. Sit on it as it climbs, or feature it as a showpiece to pull whale offers.</div>
                : <div style={{ marginTop: 3 }}>📦 <b>Hold it</b> — sit on it in the storeroom and let a hot-set spike come to you before you decide.</div>}
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
              {/* The vintage HOLD, made actionable: park it under glass where it draws whales and
                  premium offers while it appreciates — the collector's move on a crown-jewel pack. */}
              {item.vintage && upgrades?.storefront && !item._featured && place !== 'personal' && (
                <button className="btn alt sellopt" onClick={() => { if (toggleFeatureSealed(item.uid)) fin(`⭐ ${title} is under glass — a showpiece whales come in for.`) }}>
                  <b>⭐ Feature as showpiece — hold & display</b>
                  <small>Put this vintage pack under glass: it pulls whale offers and appreciates while it sits</small>
                </button>
              )}
              {/* Floor / storeroom are store concepts — only offered when there's a storefront.
                  Without one (the no-store Sealed inventory) the product just lives on hand. */}
              {upgrades?.storefront && place !== 'floor' && (
                <button className="btn alt sellopt" onClick={() => move('floor', '🛒 Out on the floor —')}>
                  <b>🛒 Put out on the floor</b>
                  <small>Stock it up front so walk-ins can buy it</small>
                </button>
              )}
              {upgrades?.storefront && place !== 'storeroom' && (
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
