import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { cardValue, sealedValue, fmtMoney, round2 } from '../game/engine'
import { quoteRound, pickCreditBundle, creditCovers, CREDIT_COVER } from '../game/shows'
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
  // WHICH stock a credit deal can shop from depends on the counter they walked up to.
  //
  // At a show it is the table you packed. In the shop it is the display case — floor stock only,
  // because 🔒 kept and held-for-a-regular items are not for sale to a stranger, and the storeroom
  // is not something they can point at. Reading show state for a store deal found an empty table,
  // which silently turned credit off for every walk-in at your own counter.
  const atStore = req.venue === 'store'
  const showInventory = useGame(s => s.showInventory)
  const showSealed = useGame(s => s.showSealed)
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  // The word for the stock they walk out with. "Table credit" is wrong at a shop counter.
  const creditWord = atStore ? 'store credit' : 'table credit'
  const placeWord = atStore ? 'case' : 'table'
  const onFloor = (x) => x.loc === 'floor' && !x.locked && !x._heldFor
  const poolCards = atStore ? (collection || []).filter(onFloor) : (showInventory || [])
  const poolSealed = atStore ? (sealedInventory || []).filter(onFloor) : (showSealed || [])
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
    poolCards.reduce((a, c) => a + cardValue(c), 0)
    + poolSealed.reduce((a, it) => a + sealedValue(it), 0),
  [poolCards, poolSealed])
  const creditOk = tableVal >= quoteCash * CREDIT_COVER // thin stock → credit isn't a real offer

  // Apportion the total you paid across their items by value share — the sealed rows carry
  // their slice as cost basis when they're minted into your inventory.
  const sealedRows = (total) => sealedItems.map(x => ({ ...x.item, paid: round2(total * (x.val / market)) }))

  // What a credit deal can shop from. The picking rule itself lives in game/shows.js next to
  // quoteRound, so it can be tested — see scripts/verify-quotes.mjs.
  const pool = useMemo(() => [
    ...poolCards.map(c => ({ kind: 'card', uid: c.uid, item: c, val: round2(cardValue(c)) })),
    ...poolSealed.map(it => ({ kind: 'sealed', uid: it.uid, item: it, val: round2(sealedValue(it)) })),
  ], [poolCards, poolSealed])
  const pickBundle = (credit) => pickCreditBundle(pool, credit)
  // Total table value passing the bar doesn't mean anything on it actually FITS this credit
  // amount (a single big slab can clear the bar while nothing nearest-fits within the ±5% band
  // pickBundle wants) — check that a real bundle exists, not just enough value.
  //
  // ⚠️ AND that the bundle actually COVERS most of the credit. A non-empty bundle was not enough:
  // pickBundle skips anything over credit×1.05, so a table holding one $600 slab and one $5 card
  // returned a single $5 item against a $500 quote. That passed as "feasible", the deal closed at
  // the CREDIT floor — 10-15 points under the cash floor (shows.js makeQuoteRequest) — and then
  // settled $495 of it in cash. A credit price for a cash deal. The bundle must be a real bundle.
  const creditProbe = pickBundle(quoteCash)
  const creditFeasible = creditCovers(creditProbe, quoteCash)
  const creditUsable = creditOk && creditFeasible
  const canAfford = method === 'credit' ? creditUsable : cash >= quoteCash

  // A pct change (preset, ± step, or a counter) can make a previously-fine credit quote stop
  // fitting the table — fall back to cash rather than leaving offer() able to reach an
  // accepted-but-unfulfillable deal.
  useEffect(() => {
    if (method === 'credit' && !creditUsable) setMethod('cash')
  }, [method, creditUsable])

  // 💥 Their counter belongs to the METHOD it was named in. The credit floor sits 10-15 points
  // under the cash floor (shows.js makeQuoteRequest), so a credit counter is a number they would
  // never say in cash. Nothing used to clear it: quote in credit, get countered at 62%, tap
  // 💵 Cash, and "Take their 62%" was still live — takeCounter() reads the CURRENT method and
  // called closeCash(0.62) against a lot whose cash floor was 0.78. The auto-fallback above
  // fires the same path without the player even trying it.
  //
  // `round` deliberately survives. Patience belongs to the person, not to the method — resetting
  // it here would let you farm unlimited counters by toggling cash/credit between each one.
  const prevMethodRef = useRef(method)
  useEffect(() => {
    if (prevMethodRef.current === method) return
    const wasCredit = prevMethodRef.current === 'credit'
    prevMethodRef.current = method
    if (counter == null) return
    setCounter(null)
    setLog(l => [...l, `${req.who}: "That number was for ${wasCredit ? creditWord : 'cash'} — quote me again."`])
  }, [method, counter, req.who])

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
    // Re-checked here, not just at creditFeasible: taking a counter closes at a DIFFERENT pct
    // than the one the button was enabled for, so the bundle is re-picked against a bigger
    // credit value and can fall under the coverage bar that made credit legitimate.
    if (!creditCovers(picked, credit)) {
      onDone(`Your ${placeWord} can't cover that in credit — the deal fizzles.`); return
    }
    setBundle({ ...picked, credit, pct: atPct })
    setLog(l => [...l, `${req.who}: "Deal — lemme see what you've got out."`])
  }
  function confirmBundle() {
    const adj = round2(bundle.credit - bundle.total) // >0 you top up cash; <0 they add cash
    const msg = resolveEncounter({
      type: 'quoteCredit', venue: req.venue || 'show', pct: bundle.pct, cashAdj: adj,
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
      setLog(l => [...l, `You: "${pct}% — ${fmtMoney(quoteCash)} ${method === 'credit' ? `in ${creditWord}` : 'cash'}?"`, `${req.who}: "Deal."`])
      method === 'credit' ? closeCredit(res.pct) : closeCash(res.pct)
      return
    }
    if (res.walk) {
      setLog(l => [...l, `You: "${pct}%?"`, `${req.who}: "Forget it." They walk.`])
      const msg = resolveEncounter({ type: 'none', notoriety: res.hardLowball ? -1 : 0,
        msg: res.hardLowball
          ? (atStore ? 'Word gets round the local group about your lowball. Not a great look.'
                     : 'They tell the next table about your lowball. Not a great look.')
          : 'They shop it around instead.' })
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
          <h2 className="t-xl">They shop your {placeWord}</h2>
          <p className="cap t-sm mt-1">
            {req.who} settles on <b>{fmtMoney(bundle.total)}</b> of your stock against the {fmtMoney(bundle.credit)} credit
            {adj > 0 ? <> — you top up the last <b className="neg">{fmtMoney(adj)}</b> in cash</>
              : adj < 0 ? <> — and hands you <b className="pos">{fmtMoney(-adj)}</b> to square it</>
              : ' — dead even'}.
          </p>
          <div className="trade-items" style={{ margin: '10px 0' }}>
            {bundle.take.map(x => x.kind === 'card'
              ? <TradeItem key={x.uid} card={x.item} />
              : <TradeItem key={x.uid} sealed={x.item} />)}
          </div>
          <div className="row mt-5">
            <button className="btn gold" disabled={adj > 0 && cash < adj} onClick={confirmBundle}>
              {adj > 0 && cash < adj ? `Need ${fmtMoney(adj)}` : '🤝 Do the deal'}
            </button>
            <button className="btn alt btn-fixed" style={{ maxWidth: 130 }}
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
        <h2 className="t-xl">🗣️ {req.who} wants a quote</h2>
        <p className="cap t-sm mt-1">
          They lay {req.items.length === 1 ? 'an item' : `${req.items.length} items`} on your {placeWord} —
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
          <button className={`btn ${method === 'credit' ? 'gold' : 'alt'}`} disabled={!creditUsable}
            title={creditUsable ? `They spend it on your ${placeWord} — sellers take a lower % in credit than in cash`
              : !creditOk ? `Your ${placeWord} doesn't have enough out to back a credit offer`
              : `Nothing on your ${placeWord} fits this credit amount — they'd walk with nothing`}
            onClick={() => setMethod('credit')}>
            🎟️ {atStore ? 'Store' : 'Table'} credit · {fmtMoney(quoteCash)}
          </button>
        </div>

        <div className="quote-pct mt-5">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p} className={`btn ${pct === p ? 'gold' : 'alt'} quote-chip`} onClick={() => setPct(p)}>{p}%</button>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button className="btn alt btn-fixed" style={{ minWidth: 44 }} onClick={() => setPct(p => Math.max(10, p - 1))}>−</button>
            <span className="haggle-amt">{pct}% · {fmtMoney(quoteCash)}</span>
            <button className="btn alt btn-fixed" style={{ minWidth: 44 }} onClick={() => setPct(p => Math.min(99, p + 1))}>+</button>
            <span className="cap" style={{ marginLeft: 'auto' }}>
              patience {'●'.repeat(Math.max(0, MAX_ROUNDS - round))}{'○'.repeat(Math.min(round, MAX_ROUNDS))}
            </span>
          </div>
        </div>

        <div className="row mt-5">
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
          <button className="btn alt btn-fixed" style={{ maxWidth: 110 }}
            onClick={() => onDone('You pass — they pack it back up.')}>Pass</button>
        </div>
        {outOfRounds && counter != null && (
          <p className="cap mt-4">They're done going back and forth — take their number or pass.</p>
        )}
      </div>
    </div>
  )
}
