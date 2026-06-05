import HoloCard from './HoloCard'
import { useModalEscape } from '../ui/dialog'
import { cardValue, fmtMoney } from '../game/engine'

const TONE_ICON = { kind: '💛', fair: '🤝', cold: '🥶' }

// An encounter prompt. `onPick` resolves the chosen option. `onClose` (optional)
// dismisses without choosing — backdrop click, Esc, or the × button. When no
// onClose is given the modal is non-dismissable (caller wants a forced choice).
export default function Encounter({ data, onPick, onClose }) {
  useModalEscape(() => onClose?.())
  const isTrade = data.kind === 'trade' && data.yourCard && data.card
  return (
    <div className="modalbg" onClick={() => onClose?.()}>
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {onClose && <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>}
        <h2 style={{ fontSize: 19 }}>{data.title}</h2>

        {isTrade ? (
          // Two-sided trade: what you give up ↔ what you get, with the cash delta.
          <div className="trade-view">
            <div className="trade-side">
              <div className="trade-label">You give</div>
              <HoloCard card={data.yourCard} maxTilt={14} className="enc-card trade-card">
                <img src={data.yourCard.img} alt={data.yourCard.name} decoding="async" />
              </HoloCard>
              <div className="trade-name">{data.yourCard.name}</div>
              <div className="trade-val">{fmtMoney(cardValue(data.yourCard))}</div>
            </div>
            <div className="trade-swap">
              <span className="trade-arrows">⇄</span>
              {data.cashAdj > 0 && <span className="trade-cash up">+{fmtMoney(data.cashAdj)} to you</span>}
              {data.cashAdj < 0 && <span className="trade-cash down">you add {fmtMoney(-data.cashAdj)}</span>}
            </div>
            <div className="trade-side">
              <div className="trade-label">You get</div>
              <HoloCard card={data.card} maxTilt={14} className="enc-card trade-card">
                <img src={data.card.imgLarge || data.card.img} alt={data.card.name} decoding="async" fetchpriority="high" />
              </HoloCard>
              <div className="trade-name">{data.card.name}</div>
              <div className="trade-val">{fmtMoney(cardValue(data.card))}</div>
            </div>
          </div>
        ) : data.card && (
          <div style={{ display:'flex', justifyContent:'center', margin:'8px 0' }}>
            <HoloCard card={data.card} maxTilt={16} className="enc-card"><img src={data.card.imgLarge || data.card.img} alt={data.card.name} decoding="async" fetchpriority="high" /></HoloCard>
          </div>
        )}

        <p style={{ fontSize: 15, lineHeight: 1.45 }}>{data.body}</p>
        <div className="encopts">
          {data.options.map((o, i) => (
            <button key={i} className={`encbtn tone-${o.tone}`} onClick={() => onPick(o)}>
              <span>{TONE_ICON[o.tone] || '•'}</span> {o.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
