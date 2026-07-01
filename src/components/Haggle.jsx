import { useState } from 'react'
import { haggleRound, archetype } from '../game/shows'
import { fmtMoney } from '../game/engine'
import { useModalEscape } from '../ui/dialog'

const MAX_ROUNDS = 3

// A few line templates per situation so haggling doesn't read identically every
// time. {p} is filled with the relevant price. Picked at random per line.
const LINES = {
  openBuy:   ['It\'s {p}.', 'I can let it go for {p}.', 'Asking {p} for this one.', 'Yours for {p}.'],
  openSell:  ['I\'ll give you {p}.', 'I can do {p} for it.', 'How about {p}?', '{p}, cash in hand.'],
  accept:    ['Deal.', 'Done — pleasure doing business.', 'Sold. Nice one.', 'You got it.'],
  walk:      ['We\'re done here. 🚪', 'Forget it — no deal.', 'Pass. Good luck elsewhere.', 'Yeah, that\'s a no.'],
  counterBuy:['Best I can do is {p}.', 'I can come down to {p}.', 'Meet me at {p}?', 'Tell you what — {p}.'],
  counterSell:['I can go to {p}.', 'I\'ll stretch to {p}.', 'How about {p}, then?', 'Up to {p}, final-ish.'],
  pride:     ['Ha — at that price? I\'ll do {p}, take it or leave it.', 'Not a chance. {p} is me being generous.',
              'You\'re funny. {p}, and that\'s me posturing.', 'For YOU? {p}. Don\'t insult me.'],
}
function line(key, price) {
  const arr = LINES[key] || ['{p}']
  const t = arr[Math.floor(Math.random() * arr.length)]
  return price == null ? t : t.replace('{p}', fmtMoney(price))
}

// Negotiation modal. props:
//   side: 'buy' (you buy from vendor) | 'sell' (vendor buys from you)
//   card, market (fair value), start (their opening price), archKey, vendorName
//   onDeal(price) — agreed; onClose() — walked/cancelled
export default function Haggle({ side, card, market, start, archKey, vendorName, onDeal, onClose }) {
  const arch = archetype(archKey)
  const [their, setTheir] = useState(start)
  const [round, setRound] = useState(0)
  const [log, setLog] = useState([`${vendorName}: "${line(side === 'buy' ? 'openBuy' : 'openSell', start)}"`])
  const [done, setDone] = useState(false)
  // Whether the player actually negotiated (sent an offer / walked / out of rounds).
  // A stray backdrop click before engaging doesn't burn the card's one haggle.
  const [engaged, setEngaged] = useState(false)
  const close = () => onClose(engaged)
  useModalEscape(close)

  // suggested counter: nudge toward your favor from their current price
  const step = Math.max(0.25, Math.round(their * 0.12 * 100) / 100)
  const [offer, setOffer] = useState(() => side === 'buy' ? Math.max(0.25, their - step) : their + step)

  const better = side === 'buy' ? offer < their : offer > their
  function bump(dir) {
    setOffer(o => Math.max(0.25, Math.round((o + dir * step) * 100) / 100))
  }

  // --- Visual read on the negotiation (no exact limits revealed) --------------
  // Patience shrinks each round (mirrors haggleRound's internal patience term) — when it's
  // gone they take-it-or-walk. Their MOOD reacts to your current offer vs fair market: a
  // hint at whether they'll bite, without giving away their precise floor.
  const patienceFrac = Math.max(0, 1 - round * 0.34)
  const fairness = market > 0 ? offer / market : 1
  const mood = side === 'buy'
    ? (offer >= market ? '😀' : fairness >= 0.85 ? '🙂' : fairness >= 0.7 ? '😐' : '😠')
    : (offer <= market ? '😀' : fairness <= 1.15 ? '🙂' : fairness <= 1.3 ? '😐' : '😠')
  // Price scale bounds — fit market, their standing price, and your offer with padding.
  const vals = [market, their, offer].filter(v => v > 0)
  const lo = Math.min(...vals) * 0.92, hi = Math.max(...vals) * 1.08
  const at = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))

  function send() {
    if (done) return
    setEngaged(true)
    const res = haggleRound({ side, their, market, yourOffer: offer, flex: arch.flex, round, archKey })
    if (res.accept) {
      setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "${line('accept')}"`])
      setDone(true)
      setTimeout(() => onDeal(offer), 600)
      return
    }
    if (res.walk) {
      setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "${line('walk')}"`])
      setDone(true)
      setTimeout(() => onClose(true), 900) // they walked — the haggle happened
      return
    }
    // counter (a "pride" counter gets the posturing line templates)
    const nextRound = round + 1
    setTheir(res.counter)
    setRound(nextRound)
    const key = res.pride ? 'pride' : side === 'buy' ? 'counterBuy' : 'counterSell'
    setLog(l => [...l, `You: "${fmtMoney(offer)}?"`, `${vendorName}: "${line(key, res.counter)}"`])
    // re-seed your next offer between your last and their new price
    setOffer(side === 'buy' ? Math.max(0.25, Math.round(((offer + res.counter)/2)*100)/100) : Math.round(((offer + res.counter)/2)*100)/100)
  }

  const outOfRounds = round >= MAX_ROUNDS

  return (
    <div className="modalbg" onClick={close}>
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
            <div className="haggle-viz">
              <div className="haggle-patience">
                <span className="hp-label">Patience <span className="hp-mood" title="How they feel about your current offer">{mood}</span></span>
                <div className="hp-track">
                  <div className="hp-fill" style={{ width: `${Math.round(patienceFrac * 100)}%`,
                    background: patienceFrac > 0.6 ? 'var(--green)' : patienceFrac > 0.3 ? 'var(--gold)' : 'var(--red)' }} />
                </div>
              </div>
              <div className="haggle-scale">
                <div className="hs-track">
                  <span className="hs-pin market" style={{ left: `${at(market)}%` }} title={`Market ${fmtMoney(market)}`} />
                  <span className="hs-pin their" style={{ left: `${at(their)}%` }} title={`Their price ${fmtMoney(their)}`} />
                  <span className={`hs-pin you ${better ? 'good' : 'bad'}`} style={{ left: `${at(offer)}%` }} title={`Your offer ${fmtMoney(offer)}`} />
                </div>
                <div className="hs-legend">
                  <span><i className="hs-dot market" /> Market</span>
                  <span><i className="hs-dot their" /> Their price</span>
                  <span><i className="hs-dot you" /> You</span>
                </div>
              </div>
            </div>
            <div className="haggle-current">
              Their price: <b>{fmtMoney(their)}</b>
              <span className="muted" style={{ fontSize: 12 }}> · round {Math.min(round + 1, MAX_ROUNDS)}/{MAX_ROUNDS}</span>
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
              {/* Disable when your offer isn't an improvement on their standing
                  price (same rule for buy and sell — `better` already encodes the
                  correct direction per side). Take-their-price is always available. */}
              {!outOfRounds && <button className="btn gold" disabled={!better} onClick={send}>Offer {fmtMoney(offer)}</button>}
              {/* always allow taking their standing price */}
              <button className="btn" onClick={() => onDeal(their)}>Take {fmtMoney(their)}</button>
              <button className="btn alt" onClick={() => onClose(true)}>Walk away</button>
            </div>
            {outOfRounds && <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>They're out of patience — take their price or walk.</p>}
          </>
        )}
      </div>
    </div>
  )
}
