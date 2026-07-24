import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, fmtMoney, round2 } from '../game/engine'
import { Collapse } from '../ui/Collapse'

// 🗑️ The Bulk Bin — the quarter box kids dig through. Toss raw cheap cards in (they leave
// the collection, like Pack Machine stock), set ONE flat price, and it drains daily with
// foot traffic (resolved in the day-tick). The patient ~5× alternative to the instant LGS
// bulk turn-in — and now and then a kid digs out something you shouldn't have tossed,
// which is somebody's best day of the week.
export default function BulkBin() {
  const bin = useGame(s => s.bulkBin) || { price: 0.25, stock: [], sold: 0, revenue: 0 }
  useGame(s => s.marketMults) // live values as the market drifts
  const collection = useGame(s => s.collection)
  const setBinPrice = useGame(s => s.setBinPrice)
  const stockBinBulk = useGame(s => s.stockBinBulk)
  const unstockBin = useGame(s => s.unstockBin)
  const keepOne = useGame(s => !!s.settings?.keepOne)
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

  function applyPrice() {
    const p = Math.max(0, round2(Number(priceInput) || 0))
    setBinPrice(p)
    flash(p > 0 ? `Bin price set to ${fmtMoney(p)} a card.` : 'Bin paused (price $0 — set a price to sell).')
  }

  return (
    <Collapse id="store-bulkbin" head="🗑️ Bulk bin"
      badge={stock.length > 0 ? `${stock.length} in · ${fmtMoney(price)}/card${treasures.length ? ' · 🤿' : ''}` : null}
      hint="— the quarter box kids dig through; ~5× the LGS turn-in rate, paid out as it drains with foot traffic">
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
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        In the bin: <b>{stock.length}</b> card{stock.length === 1 ? '' : 's'}
        {stock.length > 0 && <> · avg value <b>{fmtMoney(avgVal)}</b> vs your {fmtMoney(price)} price</>}
        {(bin.sold || 0) > 0 && <> · lifetime: <b>{bin.sold}</b> dug out for <b style={{ color: 'var(--green)' }}>{fmtMoney(bin.revenue || 0)}</b></>}
      </div>
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
