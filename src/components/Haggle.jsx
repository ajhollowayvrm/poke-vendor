import { useState } from 'react'
import { haggleRound, archetype } from '../game/shows'
import { fmtMoney } from '../game/engine'

const MAX_ROUNDS = 3

// Negotiation modal. props:
//   side: 'buy' (you buy from vendor) | 'sell' (vendor buys from you)
//   card, market (fair value), start (their opening price), archKey, vendorName
//   onDeal(price) — agreed; onClose() — walked/cancelled
export default function Haggle({ side, card, market, start, archKey, vendorName, onDeal, onClose }) {
  const arch = archetype(archKey)
  const [their, setTheir] = useState(start)
  const [round, setRound] = useState(0)
  const [log, setLog] = useState([`${vendorName}: "${side === 'buy' ? `It's ${fmtMoney(start)}.` : `I'll give you ${fmtMoney(start)}.`}"`])
  const [done, setDone] = useState(false)

  // suggested counter: nudge toward your favor from their current price
  const step = Math.max(0.25, Math.round(their * 0.12 * 100) / 100)
  const [offer, setOffer] = useState(() => side === 'buy' ? Math.max(0.25, their - step) : their + step)

  const better = side === 'buy' ? offer < their : offer > their
  function bump(dir) {
    setOffer(o => Math.max(0.25, Math.round((o + dir * step) * 100) / 100))
  }

  function send() {
    if (done) return
    const res = haggleRound({ side, their, market, yourOffer: offer, flex: arch.flex, round })
    if (res.accept) {
      setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "Deal."`])
      setDone(true)
      setTimeout(() => onDeal(offer), 600)
      return
    }
    if (res.walk) {
      setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "We're done here." 🚪`])
      setDone(true)
      setTimeout(() => onClose(), 900)
      return
    }
    // counter
    const nextRound = round + 1
    setTheir(res.counter)
    setRound(nextRound)
    setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "${side==='buy'?`Best I can do is ${fmtMoney(res.counter)}.`:`I can go to ${fmtMoney(res.counter)}.`}"`])
    // re-seed your next offer between your last and their new price
    setOffer(side === 'buy' ? Math.max(0.25, Math.round(((offer + res.counter)/2)*100)/100) : Math.round(((offer + res.counter)/2)*100)/100)
    if (nextRound >= MAX_ROUNDS) {
      // final: you can only take their last price or leave
    }
  }

  const outOfRounds = round >= MAX_ROUNDS

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 19, marginBottom: 2 }}>Haggle · {vendorName}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {card?.name} · market {fmtMoney(market)} · {arch.label} ({side === 'buy' ? 'selling to you' : 'buying from you'})
        </p>

        <div className="haggle-log">
          {log.map((line, i) => <div key={i} className={line.startsWith('You:') ? 'hl-you' : 'hl-them'}>{line}</div>)}
        </div>

        {!done && (
          <>
            <div className="haggle-current">
              Their price: <b>{fmtMoney(their)}</b>
              <span className="muted" style={{ fontSize: 12 }}> · round {round + 1}/{MAX_ROUNDS}</span>
            </div>
            <div className="haggle-offer">
              <span className="muted" style={{ fontSize: 13 }}>Your offer</span>
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <button className="btn alt" style={{ flex:'none', minWidth:44 }} onClick={() => bump(-1)}>−</button>
                <span className="haggle-amt">{fmtMoney(offer)}</span>
                <button className="btn alt" style={{ flex:'none', minWidth:44 }} onClick={() => bump(1)}>+</button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {!outOfRounds && <button className="btn gold" disabled={!better && side==='buy' ? offer>their : false} onClick={send}>Offer {fmtMoney(offer)}</button>}
              {/* always allow taking their standing price */}
              <button className="btn" onClick={() => onDeal(their)}>Take {fmtMoney(their)}</button>
              <button className="btn alt" onClick={onClose}>Walk away</button>
            </div>
            {outOfRounds && <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>They're out of patience — take their price or walk.</p>}
          </>
        )}
      </div>
    </div>
  )
}
