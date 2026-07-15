import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { sealedValue, setById, fmtMoney, round2 } from '../game/engine'
import { groupLines, sealedSku } from './sku'

// 🎰 The Pack Machine — a sealed-pack "mystery box". You LOAD it with real individual booster
// packs and set ONE flat price; walk-ins pay that price for a RANDOM pack out of it (resolved
// in the day-tick). Price it below the average pack's value and it flies (but you leave money
// on the table); price it above and it's steady profit but slower. Boxes/cases must be broken
// into single packs first; kept (Personal) and held packs can't be loaded.
export default function PackMachine() {
  const machine = useGame(s => s.packMachine) || { price: 0, stock: [], sold: 0, revenue: 0 }
  const sealedInventory = useGame(s => s.sealedInventory)
  useGame(s => s.marketMults) // live values as the market drifts
  const setMachinePrice = useGame(s => s.setMachinePrice)
  const stockMachine = useGame(s => s.stockMachine)
  const unstockMachine = useGame(s => s.unstockMachine)
  const [priceInput, setPriceInput] = useState(machine.price ? String(machine.price) : '')
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400) }

  const stock = machine.stock || []
  const totalVal = useMemo(() => stock.reduce((a, it) => a + sealedValue(it), 0), [stock])
  const avgVal = stock.length ? totalVal / stock.length : 0
  const price = machine.price || 0

  // Single packs on hand you could load (sellable, not kept/held, exactly one pack).
  const available = useMemo(() => (sealedInventory || [])
    .filter(it => (it.product?.packs || 1) === 1 && !it.locked && !it._heldFor), [sealedInventory])
  const availLines = useMemo(() => groupLines(available, it => sealedSku(it.setId, it.product), it => round2(sealedValue(it))), [available])
  const stockLines = useMemo(() => groupLines(stock, it => sealedSku(it.setId, it.product), it => round2(sealedValue(it))), [stock])

  function applyPrice() {
    const p = Math.max(0, round2(Number(priceInput) || 0))
    setMachinePrice(p)
    flash(p > 0 ? `Price set to ${fmtMoney(p)} per pack.` : 'Machine paused (price $0 — set a price to sell).')
  }
  const loadOne = (line) => { if (stockMachine([line.items[0].uid])) flash(`Loaded a ${line.first.product.type}.`) }
  const loadAll = (line) => { const n = stockMachine(line.items.map(x => x.uid)); if (n) flash(`Loaded ${n} ${line.first.product.type}${n === 1 ? '' : 's'}.`) }
  const pullOne = (line) => { if (unstockMachine(line.items[0].uid)) flash(`Pulled a ${line.first.product.type} back to the storeroom.`) }

  // Deal read: how the flat price compares to the average pack's value (drives demand).
  const dealRead = price <= 0 ? { txt: 'Set a price to start selling.', color: 'var(--dim)' }
    : avgVal <= 0 ? { txt: 'Load some packs to sell.', color: 'var(--dim)' }
    : price < avgVal * 0.9 ? { txt: `Below avg value (${fmtMoney(avgVal)}) — sells fast, but you're leaving money on the table.`, color: 'var(--gold)' }
    : price > avgVal * 1.25 ? { txt: `A ${Math.round((price / avgVal - 1) * 100)}% markup over avg value (${fmtMoney(avgVal)}) — steady profit, slower sales.`, color: 'var(--accent-light)' }
    : { txt: `Priced near avg value (${fmtMoney(avgVal)}) — a fair gamble; it'll tick over.`, color: 'var(--green)' }

  return (
    <>
      <div className="banner" style={{ marginTop: 16 }}>
        🎰 <b>Pack Machine</b> — load it with real booster packs and set <b>one flat price</b>. Walk-ins pay that
        price for a <b>random</b> pack (a sealed-pack mystery box). A price below the average pack's value pulls a
        crowd; a markup earns more but sells slower. Break boxes into single packs first.
      </div>

      {/* Price + status */}
      <div className="wants" style={{ marginTop: 12 }}>
        <div className="wants-head">🎟️ Flat price <span className="muted">— what a customer pays for any random pack</span></div>
        <div className="toolbar" style={{ marginTop: 6, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted">$</span>
          <input type="number" min="0" step="0.5" value={priceInput} onChange={e => setPriceInput(e.target.value)}
            onFocus={e => e.target.select()} style={{ width: 90 }} aria-label="pack price" />
          <button className="btn gold" style={{ flex: 'none', padding: '6px 12px' }} onClick={applyPrice}>Set price</button>
          <span className="muted" style={{ fontSize: 12.5, color: dealRead.color }}>{dealRead.txt}</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Loaded: <b>{stock.length}</b> pack{stock.length === 1 ? '' : 's'} · value <b>{fmtMoney(totalVal)}</b>
          {stock.length > 0 && <> · avg <b>{fmtMoney(avgVal)}</b>/pack</>}
          {(machine.sold || 0) > 0 && <> · lifetime: sold <b>{machine.sold}</b> for <b style={{ color: 'var(--green)' }}>{fmtMoney(machine.revenue || 0)}</b></>}
        </div>
      </div>

      {/* What's loaded */}
      <div className="wants" style={{ marginTop: 10 }}>
        <div className="wants-head">📥 In the machine <span className="muted">— {stock.length} pack{stock.length === 1 ? '' : 's'} ready to vend</span></div>
        {stockLines.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, margin: '6px 2px' }}>Empty — load single packs from your inventory below.</div>
        ) : (
          <div className="stock-lines">
            {stockLines.map(line => (
              <div key={line.key} className="trade-line stock-line" style={{ cursor: 'default' }}>
                <span className="tl-icon">{line.first.product.icon || '🎴'}</span>
                <div className="tl-info">
                  <div className="tl-name">{line.first.product.type} · {setById(line.first.setId)?.name || 'sealed'}</div>
                  <div className="tl-sub muted">{fmtMoney(line.unit)} value each{line.first.vintage ? ' · 🗝️ vintage' : ''}</div>
                </div>
                <span className="tl-count" title={`${line.count} loaded`}>×{line.count}</span>
                <button className="stock-act" title="Pull one back to the storeroom" onClick={() => pullOne(line)}>↩</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Load packs from inventory */}
      <div className="wants" style={{ marginTop: 10 }}>
        <div className="wants-head">🎴 Load packs <span className="muted">— single booster packs from your inventory (break boxes first)</span></div>
        {availLines.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, margin: '6px 2px' }}>No single packs on hand. Buy packs, or break a box down in the Storeroom.</div>
        ) : (
          <div className="stock-lines">
            {availLines.map(line => (
              <div key={line.key} className="trade-line stock-line" style={{ cursor: 'default' }}>
                <span className="tl-icon">{line.first.product.icon || '🎴'}</span>
                <div className="tl-info">
                  <div className="tl-name">{line.first.product.type} · {setById(line.first.setId)?.name || 'sealed'}</div>
                  <div className="tl-sub muted">{fmtMoney(line.unit)} value each{line.first.vintage ? ' · 🗝️ vintage' : ''}</div>
                </div>
                <span className="tl-count" title={`${line.count} on hand`}>×{line.count}</span>
                <button className="stock-act" title="Load one into the machine" onClick={() => loadOne(line)}>➕</button>
                <button className="stock-act" title="Load all of this pack" onClick={() => loadAll(line)}>⏩</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && <div className="toast" style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>{toast}</div>}
    </>
  )
}
