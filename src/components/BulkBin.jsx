import { useMemo, useState } from 'react'
import { useGame, binDemand, BIN_GIVEUP_DAYS, BIN_FORGOTTEN_DAYS } from '../game/store'
import { cardValue, fmtMoney, round2 } from '../game/engine'
import { Collapse } from '../ui/Collapse'

// 🗑️ The Bulk Bin — the quarter box kids dig through. Toss raw cheap cards in (they leave
// the collection, like Pack Machine stock), set ONE flat price, and it drains daily with
// foot traffic (resolved in the day-tick). The patient ~5× alternative to the instant LGS
// bulk turn-in — and now and then a kid digs out something you shouldn't have tossed,
// which is somebody's best day of the week.
//
// It's the busiest fixture on the floor, so it's also the easiest one to let people down
// with: diggers who find the box empty leave unhappy (rep ding + demand-board entry), and
// this panel's job is to make sure you see that coming rather than discover it in the log.
export default function BulkBin() {
  const bin = useGame(s => s.bulkBin) || { price: 0.25, stock: [], sold: 0, revenue: 0 }
  useGame(s => s.marketMults) // live values as the market drifts
  const collection = useGame(s => s.collection)
  const notoriety = useGame(s => s.notoriety)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const upgrades = useGame(s => s.upgrades)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const setBinPrice = useGame(s => s.setBinPrice)
  const stockBinBulk = useGame(s => s.stockBinBulk)
  const unstockBin = useGame(s => s.unstockBin)
  const keepOne = useGame(s => !!s.settings?.keepOne)
  const autoFill = useGame(s => !!s.settings?.autoFillBin)
  const setSetting = useGame(s => s.setSetting)
  const [priceInput, setPriceInput] = useState(bin.price ? String(bin.price) : '')
  const [showStock, setShowStock] = useState(false)
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400) }

  const stock = bin.stock || []
  const totalVal = useMemo(() => stock.reduce((a, c) => a + cardValue(c), 0), [stock])
  const avgVal = stock.length ? totalVal / stock.length : 0
  const price = bin.price || 0
  // What a one-tap toss would sweep in right now (sub-$1 raw, minus the safety nets).
  const bulkOnHand = useMemo(() => collection.filter(c =>
    !c.grade && !c.locked && !c._heldFor && cardValue(c) < 1).length, [collection])
  // The riskiest cards in the bin — worth pulling back before a kid finds them.
  const treasures = useMemo(() => [...stock].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 6)
    .filter(c => cardValue(c) >= Math.max(3, price * 8)), [stock, price])
  // What the box is going to move tomorrow at this price — the same model the day-tick runs,
  // so "≈40 cards a day" is a promise, not a vibe. Days of runway tells you when to refill.
  const dryDays = bin.dryDays || 0
  const known = (bin.sold || 0) > 0
  const demand = useMemo(() => binDemand({
    notoriety, price, avgVal, upgrades, monthsElapsed, dryDays, hasStock: stock.length > 0,
  }), [notoriety, price, avgVal, upgrades, monthsElapsed, dryDays, stock.length])
  const perDay = price > 0 && hasStore ? demand.cardsPerDay : 0
  const runway = perDay > 0 && stock.length > 0 ? stock.length / perDay : null
  const givenUp = dryDays > BIN_GIVEUP_DAYS
  const forgotten = stock.length === 0 && dryDays >= BIN_FORGOTTEN_DAYS
  // What the crowd looks like once you refill it — the number that matters when the box is
  // empty, since the "≈N a day" above is what an EMPTY box pulls (nothing, if they've moved on).
  const refilledPerDay = useMemo(() => price > 0 && hasStore && stock.length === 0
    ? binDemand({ notoriety, price, avgVal: price * 0.5, upgrades, monthsElapsed, dryDays, hasStock: true }).cardsPerDay
    : 0, [notoriety, price, upgrades, monthsElapsed, dryDays, hasStore, stock.length])

  function applyPrice() {
    const p = Math.max(0, round2(Number(priceInput) || 0))
    setBinPrice(p)
    flash(p > 0 ? `Bin price set to ${fmtMoney(p)} a card.` : 'Bin paused (price $0 — set a price to sell).')
  }

  return (
    <Collapse id="store-bulkbin" head="🗑️ Bulk bin"
      badge={stock.length > 0
        ? `${stock.length} in · ${fmtMoney(price)}/card${runway != null && runway < 2 ? ' · ⚠️ nearly out' : ''}${treasures.length ? ' · 🤿' : ''}`
        : (dryDays > 0 ? `${forgotten ? '🚸' : '😠'} empty · ${dryDays}d` : (known && price > 0 ? '😠 empty' : null))}
      hint="— the quarter box kids dig through; ~5× the LGS turn-in rate, paid out as it drains with foot traffic">
      {/* An empty box isn't neutral: kids came for it and left unhappy. Say so loudly, right
          above the one-tap refill, so the fix is where the bad news is. */}
      {stock.length === 0 && known && price > 0 && (
        <div className="banner" style={{ marginTop: 6, borderColor: 'var(--red)', color: 'var(--red)' }}>
          {forgotten
            ? <>🚸 <b>Nobody checks your quarter box any more.</b> Empty {dryDays} days — they've written it off, so it's stopped costing you. It takes a day of full stock to pull the diggers back.</>
            : givenUp
            ? <>🚸 <b>The kids are giving up on your quarter box.</b> Empty {dryDays} days running — fill it now and you can still win the diggers back.</>
            : dryDays > 0
            ? <>😠 <b>Kids keep coming for an empty box.</b> {dryDays} day{dryDays === 1 ? '' : 's'} running{(bin.missed || 0) > 0 ? ` · ${bin.missed} turned away all-time` : ''} — every one of them costs you a little of your name{bulkOnHand > 0 ? ', and there\'s bulk sitting in your storeroom right now' : ''}.</>
            : <>🗑️ <b>The box is empty and your diggers are coming.</b>{bulkOnHand > 0 ? ' There\'s bulk in the storeroom.' : ''}</>}
          {refilledPerDay > 0 && <div style={{ marginTop: 4 }}>Fill it and they'll clear <b>≈{Math.round(refilledPerDay)}</b> card{Math.round(refilledPerDay) === 1 ? '' : 's'} a day at {fmtMoney(price)}.</div>}
        </div>
      )}
      <div className="toolbar" style={{ marginTop: 6, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted">$</span>
        <input type="number" min="0" step="0.05" value={priceInput} onChange={e => setPriceInput(e.target.value)}
          onFocus={e => e.target.select()} style={{ width: 80 }} aria-label="bin price per card" />
        <button className="btn" style={{ flex: 'none', padding: '6px 10px', fontSize: 12 }} onClick={applyPrice}>Set price</button>
        {bulkOnHand > 0 && (
          <button className="btn gold" style={{ flex: 'none', padding: '6px 10px', fontSize: 12 }}
            title={`Toss every raw card worth under $1 into the bin${keepOne ? ' (keep-singles protection applies)' : ''} — locked and held cards always stay out.`}
            onClick={() => {
              const { tossed, kept } = stockBinBulk()
              flash(tossed ? `🗑️ Tossed ${tossed} bulk card${tossed > 1 ? 's' : ''} in.${kept ? ` ${kept} protected.` : ''}` : 'Nothing toss-able right now.')
            }}>🗑️ Toss {bulkOnHand} bulk in</button>
        )}
      </div>
      {/* Keeping the box full is now a daily job, so make it one you can hand off. Storeroom
          bulk only — the display floor is never swept out from under you. */}
      {hasStore && (
        <label className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
          title="Every morning, sweep the storeroom's sub-$1 raw bulk into the box before the doors open. Locked, held and keep-singles cards stay out, and cards already on your sales floor are left alone.">
          <input type="checkbox" checked={autoFill} onChange={e => setSetting('autoFillBin', e.target.checked)} />
          Keep the box full — top it up from storeroom bulk each morning
        </label>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        In the bin: <b>{stock.length}</b> card{stock.length === 1 ? '' : 's'}
        {stock.length > 0 && <> · avg value <b>{fmtMoney(avgVal)}</b> vs your {fmtMoney(price)} price</>}
        {(bin.sold || 0) > 0 && <> · lifetime: <b>{bin.sold}</b> dug out for <b style={{ color: 'var(--green)' }}>{fmtMoney(bin.revenue || 0)}</b></>}
        {(bin.missed || 0) > 0 && <> · <span style={{ color: 'var(--red)' }}>{bin.missed} left empty-handed</span></>}
      </div>
      {/* The demand read: what the box will move at this price, and how long your stock lasts.
          Cheaper price → more diggers AND deeper handfuls, so this moves as you retune it. */}
      {perDay > 0 && stock.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          📈 At {fmtMoney(price)} a card the diggers will clear <b>≈{Math.round(perDay)}</b> card{Math.round(perDay) === 1 ? '' : 's'} a day
          {' · '}that's <b style={{ color: runway < 2 ? 'var(--red)' : runway < 5 ? 'var(--gold)' : undefined }}>
            {runway < 1 ? 'under a day' : `~${Math.round(runway)} day${Math.round(runway) === 1 ? '' : 's'}`}</b> of stock
          {runway < 2 && ' — top it up before they turn up to a bare box'}
        </div>
      )}
      {price <= 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          The box is off the counter at $0 — nothing sells, and nobody comes looking for it. Set a price to put it out.
        </div>
      )}
      {treasures.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          🤿 Buried in there: {treasures.map(c => (
            <button key={c.uid} className="pill" style={{ marginRight: 4, cursor: 'pointer', background: '#ffd45e22', color: 'var(--gold, #ffd45e)' }}
              title={`Worth ${fmtMoney(cardValue(c))} — tap to fish it back out before a kid does`}
              onClick={() => { if (unstockBin(c.uid)) flash(`Fished the ${c.name} back out — to the storeroom.`) }}>
              {c.name} {fmtMoney(cardValue(c))} ↩
            </button>
          ))}
        </div>
      )}
      {stock.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button className="btn alt" style={{ padding: '4px 10px', fontSize: 12, maxWidth: 200 }}
            onClick={() => setShowStock(v => !v)}>{showStock ? 'Hide contents' : `Dig through it (${stock.length})`}</button>
          {showStock && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {[...stock].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 80).map(c => (
                <button key={c.uid} className="pill" style={{ cursor: 'pointer', fontSize: 11.5 }}
                  title={`${fmtMoney(cardValue(c))} — tap to pull it back out`}
                  onClick={() => { if (unstockBin(c.uid)) flash(`Pulled ${c.name} back out.`) }}>
                  {c.name} ↩
                </button>
              ))}
              {stock.length > 80 && <span className="muted" style={{ fontSize: 11.5 }}>…and {stock.length - 80} more</span>}
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast" style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>{toast}</div>}
    </Collapse>
  )
}
