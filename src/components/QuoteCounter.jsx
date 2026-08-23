import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2 } from '../game/engine'
import { quoteRound } from '../game/shows'
import { useModalEscape } from '../ui/dialog'
import { TradeItem } from './Encounter'

const MAX_ROUNDS = 2      // counters they'll bother with before it's take-it-or-leave
const PRESETS = [50, 60, 70, 80, 90]

// 🗣️ The quote walk-up — someone lays 1–3 items on your booth table and asks YOU to name
// the number (see game/shows.js makeQuoteRequest). You quote a percentage of market, in
// CASH or in TABLE CREDIT; credit is cheaper (they leave with your stock, you part with no
// money — their hidden credit floor sits 10–15 points under cash). On a credit deal they
// shop your table: the game picks a bundle nearest the credit value, you confirm it once.
export default function QuoteCounter({ req, onDone }) {
  const cash = useGame(s => s.cash)
  const showInventory = useGame(s => s.showInventory)
  const showSealed = useGame(s => s.showSealed)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  const [pct, setPct] = useState(70)
  const [method, setMethod] = useState('cash')
  const [round, setRound] = useState(0)
  const [counter, setCounter] = useState(null) // their pending counter, as a pct fraction
  const [log, setLog] = useState([`${req.who}: "What'll you give me for these?"`])
  const [bundle, setBundle] = useState(null)   // credit accepted → the picked bundle awaiting confirm
  const close = () => onDone(null)
  useModalEscape(close)

  const market = req.market
  const cardItems = req.items.filter(x => x.kind === 'card')
  const sealedItems = req.items.filter(x => x.kind === 'sealed')
  const frac = pct / 100
  const quoteCash = round2(market * frac)
  // What's on your table right now — the pool a credit deal shops from.
  const tableVal = useMemo(() =>
    (showInventory || []).reduce((a, c) => a + cardValue(c), 0)
    + (showSealed || []).reduce((a, it) => a + sealedValue(it), 0),
  [showInventory, showSealed])
  const creditOk = tableVal >= quoteCash * 0.6 // thin table → credit isn't a real offer
  const canAfford = method === 'credit' || cash >= quoteCash

  // Apportion the total you paid across their items by value share — the sealed rows carry
  // their slice as cost basis when they're minted into your inventory.
  const sealedRows = (total) => sealedItems.map(x => ({ ...x.item, paid: round2(total * (x.val / market)) }))

  // Greedy closest-fit bundle off your table for a credit deal: big pieces first, stop near
  // the credit value (≤5% overshoot). The small remainder settles in cash either way.
  function pickBundle(credit) {
    const pool = [
      ...(showInventory || []).map(c => ({ kind: 'card', uid: c.uid, item: c, val: round2(cardValue(c)) })),
      ...(showSealed || []).map(it => ({ kind: 'sealed', uid: it.uid, item: it, val: round2(sealedValue(it)) })),
    ].filter(x => x.val > 0).sort((a, b) => b.val - a.val)
    const take = []
    let total = 0
    for (const x of pool) {
      if (total + x.val <= credit * 1.05) { take.push(x); total = round2(total + x.val) }
      if (total >= credit * 0.95) break
    }
    return { take, total }
  }

  function closeCash(atPct) {
    const price = round2(market * atPct)
    const msg = resolveEncounter({
      type: 'quoteBuy', price, pct: atPct,
      notoriety: atPct >= 0.7 ? 1 : 0, // a fair quote builds your name; a taken lowball doesn't
      cards: cardItems.map(x => x.item),
      sealed: sealedRows(price),
    })
    onDone(msg)
  }
  function closeCredit(atPct) {
    const credit = round2(market * atPct)
    const picked = pickBundle(credit)
    if (!picked.take.length) { onDone("Your table has nothing they'd take — the deal fizzles."); return }
    setBundle({ ...picked, credit, pct: atPct })
    setLog(l => [...l, `${req.who}: "Deal — lemme see what you've got out."`])
  }
  function confirmBundle() {
    const adj = round2(bundle.credit - bundle.total) // >0 you top up cash; <0 they add cash
    const msg = resolveEncounter({
      type: 'quoteCredit', pct: bundle.pct, cashAdj: adj,
      notoriety: bundle.pct >= 0.65 ? 1 : 0,
      takeCardUids: bundle.take.filter(x => x.kind === 'card').map(x => x.uid),
      takeSealedUids: bundle.take.filter(x => x.kind === 'sealed').map(x => x.uid),
      cards: cardItems.map(x => x.item),
      sealed: sealedRows(bundle.credit),
    })
    onDone(msg)
  }

  function offer() {
    const res = quoteRound(req, frac, method, round)
    if (res.accept) {
      setLog(l => [...l, `You: "${pct}% — ${fmtMoney(quoteCash)} ${method === 'credit' ? 'in table credit' : 'cash'}?"`, `${req.who}: "Deal."`])
      method === 'credit' ? closeCredit(res.pct) : closeCash(res.pct)
      return
    }
    if (res.walk) {
      setLog(l => [...l, `You: "${pct}%?"`, `${req.who}: "Forget it." They walk.`])
      const msg = resolveEncounter({ type: 'none', notoriety: res.hardLowball ? -1 : 0,
        msg: res.hardLowball ? 'They tell the next table about your lowball. Not a great look.' : 'They shop it around instead.' })
      setTimeout(() => onDone(msg), 700)
      return
    }
    setCounter(res.counter)
    setRound(r => r + 1)
    setLog(l => [...l, `You: "${pct}%?"`,
      `${req.who}: "Make it ${Math.round(res.counter * 100)}% (${fmtMoney(round2(market * res.counter))} ${method === 'credit' ? 'credit' : 'cash'}) and it's yours."`])
    setPct(Math.min(99, Math.round(((pct / 100 + res.counter) / 2) * 100)))
  }
  function takeCounter() {
    const atPct = counter
    setLog(l => [...l, `You: "Done — ${Math.round(atPct * 100)}%."`])
    method === 'credit' ? closeCredit(atPct) : closeCash(atPct)
  }

  const outOfRounds = round >= MAX_ROUNDS

  // --- Credit-bundle confirm screen: what they picked off your table -----------------------
  if (bundle) {
    const adj = round2(bundle.credit - bundle.total)
    return (
      <div className="modalbg" onClick={close}>
        <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <button className="modal-close" aria-label="Close" onClick={close}>✕</button>
          <h2 style={{ fontSize: 19 }}>They shop your table</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {req.who} settles on <b>{fmtMoney(bundle.total)}</b> of your stock against the {fmtMoney(bundle.credit)} credit
            {adj > 0 ? <> — you top up the last <b style={{ color: 'var(--red)' }}>{fmtMoney(adj)}</b> in cash</>
              : adj < 0 ? <> — and hands you <b style={{ color: 'var(--green)' }}>{fmtMoney(-adj)}</b> to square it</>
              : ' — dead even'}.
          </p>
          <div className="trade-items" style={{ margin: '10px 0' }}>
            {bundle.take.map(x => x.kind === 'card'
              ? <TradeItem key={x.uid} card={x.item} />
              : <TradeItem key={x.uid} sealed={x.item} />)}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn gold" disabled={adj > 0 && cash < adj} onClick={confirmBundle}>
              {adj > 0 && cash < adj ? `Need ${fmtMoney(adj)}` : '🤝 Do the deal'}
            </button>
            <button className="btn alt" style={{ flex: 'none', maxWidth: 130 }}
              onClick={() => { onDone('You wave it off at the last second. They leave, a little annoyed.') }}>Back out</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modalbg" onClick={close}>
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <button className="modal-close" aria-label="Close" onClick={close}>✕</button>
        <h2 style={{ fontSize: 19 }}>🗣️ {req.who} wants a quote</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          They lay {req.items.length === 1 ? 'an item' : `${req.items.length} items`} on your table —
          market <b>{fmtMoney(market)}</b> · {req.hint}.
        </p>

        <div className="trade-items" style={{ margin: '8px 0' }}>
          {req.items.map((x, i) => x.kind === 'card'
            ? <TradeItem key={x.item.uid || i} card={x.item} />
            : <TradeItem key={i} sealed={x.item} />)}
        </div>

        <div className="haggle-log">
          {log.map((line, i) => <div key={i} className={line.startsWith('You:') ? 'hl-you' : 'hl-them'}>{line}</div>)}
        </div>

        {/* Cash vs table credit. Credit is the trade play: they leave with your stock, no
            money leaves your till — and their hidden floor sits lower for it. */}
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className={`btn ${method === 'cash' ? 'gold' : 'alt'}`} onClick={() => setMethod('cash')}>
            💵 Cash · {fmtMoney(quoteCash)}
          </button>
          <button className={`btn ${method === 'credit' ? 'gold' : 'alt'}`} disabled={!creditOk}
            title={creditOk ? 'They spend it on your table — sellers take a lower % in credit than in cash' : "Your table doesn't have enough out to back a credit offer"}
            onClick={() => setMethod('credit')}>
            🎟️ Table credit · {fmtMoney(quoteCash)}
          </button>
        </div>

        <div className="quote-pct" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p} className={`btn ${pct === p ? 'gold' : 'alt'} quote-chip`} onClick={() => setPct(p)}>{p}%</button>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button className="btn alt" style={{ flex: 'none', minWidth: 44 }} onClick={() => setPct(p => Math.max(10, p - 1))}>−</button>
            <span className="haggle-amt">{pct}% · {fmtMoney(quoteCash)}</span>
            <button className="btn alt" style={{ flex: 'none', minWidth: 44 }} onClick={() => setPct(p => Math.min(99, p + 1))}>+</button>
            <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
              patience {'●'.repeat(Math.max(0, MAX_ROUNDS - round))}{'○'.repeat(Math.min(round, MAX_ROUNDS))}
            </span>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {!outOfRounds && (
            <button className="btn gold" disabled={!canAfford} onClick={offer}>
              {canAfford ? `Quote ${pct}%` : `Need ${fmtMoney(quoteCash)}`}
            </button>
          )}
          {counter != null && (
            <button className="btn" disabled={method === 'cash' && cash < round2(market * counter)} onClick={takeCounter}>
              Take their {Math.round(counter * 100)}%
            </button>
          )}
          <button className="btn alt" style={{ flex: 'none', maxWidth: 110 }}
            onClick={() => onDone('You pass — they pack it back up.')}>Pass</button>
        </div>
        {outOfRounds && counter != null && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>They're done going back and forth — take their number or pass.</p>
        )}
      </div>
    </div>
  )
}
