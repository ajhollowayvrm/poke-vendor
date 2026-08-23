import { useEffect, useState, lazy, Suspense } from 'react'
import { useGame, flushSaveWrite } from '../game/store'
import { setById, sealedValue, sealedBase, breakOptions, fmtMoney, round2, hitGemRate, SEALED_FLIP_RATE } from '../game/engine'
import { SEALED_GRADERS, sealedGraderById, sealedGradingFee, sealedGradingDays, sealedSlabLabel, worthGrading } from '../game/sealedgrading'
import { AskPicker } from '../ui/AskPicker'

// Code-split: the set price sheet (every card + PSA estimates) is only pulled when the
// player taps to open it, so its chunk + a set's worth of card art stay off the rip path.
// GUARDED import: this game redeploys on every push, so a session left open across a
// deploy asks the server for the OLD hashed chunk — which is gone (404) — and an unguarded
// lazy() would throw all the way to the crash screen. A missing chunk means "the game
// updated under you", so say that and offer a reload instead.
const SetPriceList = lazy(() => import('./SetPriceList').catch(() => ({ default: StalePriceSheet })))

function StalePriceSheet() {
  return (
    <div className="empty mt-5">
      📵 The game <b>updated since you opened it</b>, so this view couldn't load.
      Your save is safe — reload to pick up the new version.
      <div className="mt-5">
        <button className="btn gold" style={{ maxWidth: 200, margin: '0 auto' }}
          onClick={() => { try { flushSaveWrite() } catch { /* best effort */ } location.reload() }}>
          🔄 Reload the game
        </button>
      </div>
    </div>
  )
}

// 📦🔟 The sealed-grading option, with both graders quoted and an honest warning attached.
//
// The warning is the important half. Slabbing a vintage pack is a real play; slabbing this
// month's Elite Trainer Box is money set on fire, because the premium a holder adds is a
// VINTAGE premium (see game/sealedgrading.js). The button stays visible either way and simply
// tells you which one you are looking at.
function SealedGradeOption({ item, value, onDone }) {
  const submitSealedGrade = useGame(s => s.submitSealedGrade)
  const upgrades = useGame(s => s.upgrades)
  const [open, setOpen] = useState(false)
  const advice = worthGrading(item, value)

  if (!open) {
    return (
      <button className="btn alt sellopt" onClick={() => setOpen(true)}>
        <b>📦🔟 Send it to a sealed grader</b>
        <small>{advice.ok
          ? `A graded wrapper is how vintage sealed is held and sold. A ${sealedGraderById('wata').name} 9.5 on this would be worth about ${fmtMoney(value * 2.3)}.`
          : advice.why}</small>
      </button>
    )
  }

  return (
    <div className="list-picker mt-2">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b>📦🔟 Sealed grading</b>
        <span className="cap">market {fmtMoney(value)}</span>
      </div>
      {!advice.ok && <div className="lot-warn mt-3">⚠️ {advice.why}</div>}
      <div className="sell-options mt-4">
        {Object.values(SEALED_GRADERS).map(g => {
          const fee = sealedGradingFee(value, g.key)
          const days = sealedGradingDays(g.key, upgrades)
          return (
            <button key={g.key} className="btn alt sellopt" onClick={() => {
              const r = submitSealedGrade(item.uid, g.key)
              onDone(r?.error ? `⚠️ ${r.error}` : `📦 Sent to ${g.name} — back in ${r.days} days.`)
            }}>
              <b>{g.icon} {g.name} · {fmtMoney(fee)}</b>
              <small>{days} days · {g.blurb}</small>
            </button>
          )
        })}
        <button className="btn alt sellopt" onClick={() => setOpen(false)}><b>← Never mind</b></button>
      </div>
    </div>
  )
}

// The sealed-product page — the counterpart to CardModal, so a booster box / ETB / blister
// is more than a thumbnail + price on the shelf. Opening it shows WHAT the product is (the
// full product name, its set, how many packs, whether it ships a guaranteed promo) plus the
// live market read (value, your cost basis, what it breaks down into) and the moves that fit
// its place. Rendered from StoreStock, which owns the rip/break/move/sell verbs.
//
// `stack` (optional) is the full array of identical units this item heads — the Sealed
// inventory hands it over so List/Keep can act on N units at once (its compact rows have no
// per-row quantity chrome anymore; this modal is where quantity lives).
export default function SealedModal({ item, stack, place, onClose, onRip, flash }) {
  const breakSealed = useGame(s => s.breakSealed)
  const moveStock = useGame(s => s.moveStock)
  const listSealed = useGame(s => s.listSealed)
  const listSealedMany = useGame(s => s.listSealedMany)
  const toggleLockSealed = useGame(s => s.toggleLockSealed)
  const quickFlipSealed = useGame(s => s.quickFlipSealed)
  const toggleFeatureSealed = useGame(s => s.toggleFeatureSealed)
  const upgrades = useGame(s => s.upgrades)
  useGame(s => s.marketMults) // keep value live as the market drifts
  const [showPrices, setShowPrices] = useState(false) // price-sheet sub-view toggle
  const [listing, setListing] = useState(false)       // inventory listing sub-control
  const [mult, setMult] = useState(1.0)               // listing ask, as a share of market
  const [qtySel, setQtySel] = useState(1)             // how many units List / Keep act on

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

  // Stack-aware bits: qty defaults to 1 and clamps to the stack size. `pickUids(k)` = the
  // first k units (identical products — any k of them are the same k).
  const qty = stack?.length || 1
  const n = Math.max(1, Math.min(qty, qtySel))
  const pickUids = (k) => (stack || [item]).slice(0, k).map(i => i.uid)

  const fin = (msg) => { if (msg && flash) flash(msg); onClose() }
  const move = (dest, verb) => { moveStock('sealed', [item.uid], dest); fin(`${verb} ${title}.`) }
  function doBreak(opt) {
    if (!opt) return
    const r = breakSealed(item.uid, opt.product.type)
    if (r?.error) return fin(r.error)
    const where = item.locked ? 'Personal' : 'the Storeroom'
    fin(`🔨 Broke into ${r.count}× ${r.type} (in ${where}).`)
  }
  // Flip KEEP on the selected units (kept units re-group into their own stack on the shelf).
  function doKeep() {
    for (const uid of pickUids(n)) toggleLockSealed(uid)
    fin(item.locked
      ? `🔓 ${n}× ${p.type} back up for sale in the store.`
      : `🔒 Keeping ${n}× ${p.type} — walk-ins can't buy it (you can still rip, stream, or repack it).`)
  }
  function doList() {
    const listed = listSealedMany(pickUids(n), mult)
    if (listed) fin(`Listed ${listed}× ${p.type} at ${Math.round(mult * 100)}% — track them on the Sell tab.`)
  }

  // Price-sheet sub-view: full-width, replaces the detail. A ← Back returns to the detail.
  if (showPrices) {
    return (
      <div className="modalbg" onClick={onClose}>
        <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
          <button className="btn alt" style={{ padding: '5px 12px', marginBottom: 12 }} onClick={() => setShowPrices(false)}>← Back to {p.type}</button>
          <Suspense fallback={<div className="empty mt-5">Loading price sheet…</div>}>
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
            <div className="sealed-modal-badge">{p.icon || '📦'} {p.packs} pack{p.packs === 1 ? '' : 's'}{item.vintage ? ' · 🗝️ vintage' : ''}{item.grade ? ` · 🔟 ${sealedSlabLabel(item.grade)}` : ''}</div>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <h2>{title}</h2>
            <p className="muted" style={{ margin: '2px 0 10px' }}>
              {/* An era product belongs to no single set, so don't claim one. */}
              📦 Sealed product{p.pool?.series ? <> · {p.pool.series} era</> : <>{set?.name ? <> · {set.name}</> : ''}{set?.series ? <> · {set.series}</> : ''}</>}{year ? <> · {year}</> : ''}
            </p>

            <p className="t-lg" style={{ marginBottom: 4 }}>Market value: <b className="pos">{fmtMoney(value)}</b></p>
            {cost != null && (
              <p className="cap t-sm" style={{ margin: '0 0 6px' }}>
                You paid {fmtMoney(cost)} ·{' '}
                <b style={{ color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{gain >= 0 ? '+' : ''}{fmtMoney(gain)}</b> vs market
              </p>
            )}

            <div className="banner mt-4">
              <div>📦 <b>{p.packs}</b> booster pack{p.packs === 1 ? '' : 's'} inside{p.packs > 1 ? ` (~${fmtMoney(round2(base / p.packs))}/pack)` : ''}.</div>
              {/* Deliberately vague about WHICH sets: the packs are already inside a sealed box,
                  and you find out by ripping it. Two of these are worth exactly the same. */}
              {p.pool?.series && (
                <div className="mt-2">
                  🎲 The packs are drawn from across the <b>{p.pool.series}</b> era — the mix varies
                  from box to box, and you won't know what's in this one until you open it.
                </div>
              )}
              {gem && gem.total > 0 && (
                <div className="mt-2">
                  💎 <b>{Math.round(gem.pct * 100)}%</b> of this set's {gem.total} hit{gem.total === 1 ? '' : 's'} clear <b>$100</b> graded PSA 10
                  <span className="muted"> ({gem.count} of {gem.total})</span>.
                </div>
              )}
              {p.bonus === 'promo' && <div className="mt-2">🎁 Ships a <b>guaranteed promo card</b> on top of the packs — a fixed foil (a headline ex/V chase in premium boxes).</div>}
              {breaks.length > 0 && (
                <div className="mt-2">
                  🔨 Breaks into {breaks.map((b, i) => (
                    <span key={i}>{i > 0 ? ', ' : ''}<b>{b.count}× {b.product.type}</b> ({fmtMoney(b.total)}{b.delta ? `, ${b.delta >= 0 ? '+' : ''}${fmtMoney(b.delta)}` : ''})</span>
                  ))}.
                </div>
              )}
            </div>

            {/* Drill-down: the whole set priced out, card by card — the "is this a chase set
                or a deep one?" read. Lazy-loaded on tap (see the code-split import up top). */}
            {/* Hidden for an era product: its packs span a dozen sets, so one set's price sheet
                would be a straight-up lie about what's in the box. */}
            {set && !p.pool?.series && (
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
              <div className="mt-2">💵 <b>Flip sealed</b> — <b className="pos">{fmtMoney(round2(value * SEALED_FLIP_RATE))}</b> cash now, or list at ~<b className="pos">{fmtMoney(value)}</b>. The sure thing.</div>
              {item.vintage
                ? <div className="mt-2">🗝️ <b>Hold it</b> — vintage sealed is finite and <b>trends up</b>; it's worth more unopened than the rip. Sit on it as it climbs, or feature it as a showpiece to pull whale offers.</div>
                : <div className="mt-2">📦 <b>Hold it</b> — sit on it in the storeroom and let a hot-set spike come to you before you decide.</div>}
            </div>

            {/* With a stack behind the modal, one shared quantity control feeds List / Keep —
                the compact inventory rows deliberately carry no per-row quantity chrome. */}
            {qty > 1 && (
              <div className="sealed-qty-ctl mt-6">
                <span className="cap">Quantity</span>
                <button className="qstep" onClick={() => setQtySel(q => Math.max(1, Math.min(qty, q) - 1))} disabled={n <= 1} aria-label="Fewer">−</button>
                <b className="qval">{n}</b>
                <button className="qstep" onClick={() => setQtySel(q => Math.min(qty, Math.max(1, q) + 1))} disabled={n >= qty} aria-label="More">+</button>
                <button className="qstep qmax" onClick={() => setQtySel(qty)} disabled={n >= qty}>All {qty}</button>
                <span className="cap" style={{ marginLeft: 'auto' }}>applies to List / Keep</span>
              </div>
            )}

            {/* Actions — the moves that make sense for a sealed unit, mirroring the shelf row */}
            <div className="sell-options" style={{ marginTop: qty > 1 ? 8 : 14 }}>
              <button className="btn alt sellopt" onClick={() => { onClose(); onRip && onRip(item.uid) }}>
                <b>🎬 Rip it now</b>
                <small>{item.grade
                  ? `Cracking the holder destroys the ${sealedSlabLabel(item.grade)} premium — this is worth ${fmtMoney(value)} sealed and graded.`
                  : 'Crack it open and price out everything inside'}</small>
              </button>
              {/* 📦🔟 Sealed grading. Offered on every product so the WARNING is visible on the
                  ones it would be a mistake on — grading modern sealed is the most common way
                  to lose money on this system, and hiding the button would hide the lesson. */}
              {!item.grade && <SealedGradeOption item={item} value={value} onDone={fin} /> }
              {/* Every break tier is its own option (a case splits to boxes OR straight to packs)
                  with the value delta attached, because that delta IS the decision. */}
              {breaks.map(o => (
                <button key={o.product.type} className="btn alt sellopt" onClick={() => doBreak(o)}>
                  <b>🔨 Break down · {o.count}× {o.product.type}</b>
                  <small>{fmtMoney(o.total)} of product ({o.delta >= 0 ? '+' : '−'}{fmtMoney(Math.abs(o.delta))} vs sealed) — lands in {item.locked ? 'Personal' : 'the Storeroom'}</small>
                </button>
              ))}
              {/* 🔒 Keep — the no-store Sealed inventory doubles as the storefront's sealed
                  stock, so kept-vs-sellable is decided here (the shelf rows just show the 🔒). */}
              {place === 'inventory' && upgrades?.storefront && (
                <button className="btn alt sellopt" onClick={doKeep}>
                  <b>{item.locked ? '🔓 Unkeep' : '🔒 Keep'}{n > 1 ? ` ${n} units` : ''}</b>
                  <small>{item.locked
                    ? 'Put it back on the floor — walk-ins can buy it again'
                    : "Walk-ins can't buy kept units (rips, streams & repacks still can use them)"}</small>
                </button>
              )}
              {/* The HOLD, made actionable: park it under glass where it draws whales and
                  premium offers — the collector's move on a crown-jewel piece. */}
              {upgrades?.storefront && !item._featured && place !== 'personal' && (
                <button className="btn alt sellopt" onClick={() => { if (toggleFeatureSealed(item.uid)) fin(`⭐ ${title} is under glass — a showpiece whales come in for.`) }}>
                  <b>⭐ Feature as showpiece — hold & display</b>
                  <small>{item.vintage
                    ? 'Put this vintage pack under glass: it pulls whale offers and appreciates while it sits'
                    : 'Put it under glass: whales come in for featured pieces and pay a premium'}</small>
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
                  {/* From the inventory the listing opens an ask picker (the % control that used
                      to live on the shelf rows); elsewhere it stays the one-tap 100% list. */}
                  {place === 'inventory' ? (
                    listing ? (
                      <div className="list-picker mt-2">
                        <AskPicker pct={Math.round(mult * 100)} onChange={pc => setMult((pc || 0) / 100)} custom={false} label={null}>
                          <span className="cap" style={{ marginLeft: 'auto' }}>ask <b>{fmtMoney(value * mult)}</b>{n > 1 ? ` ea · ${fmtMoney(value * mult * n)} total` : ''}</span>
                        </AskPicker>
                        <div className="row" style={{ gap: 8, marginTop: 8 }}>
                          <button className="btn gold" style={{ maxWidth: 220 }} onClick={doList}>List {n > 1 ? `${n} units` : 'for sale'}</button>
                          <button className="btn alt" style={{ maxWidth: 120 }} onClick={() => setListing(false)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn alt sellopt" onClick={() => setListing(true)}>
                        <b>🏷️ List online{n > 1 ? ` · ${n} units` : ''}…</b>
                        <small>Pick your ask — rides the buyer engine, can catch a hot-set spike</small>
                      </button>
                    )
                  ) : (
                    <button className="btn alt sellopt" onClick={() => { if (listSealed(item.uid, 1.0)) fin(`Listed ${title} online.`) }}>
                      <b>🏷️ List online</b>
                      <small>Put it up on your site — rides the buyer engine, can catch a hot-set spike</small>
                    </button>
                  )}
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
