import HoloCard from './HoloCard'
import { useModalEscape } from '../ui/dialog'
import { cardValue, sealedValue, fmtMoney, setById, setNameOfCard } from '../game/engine'
import HiResImg from './HiResImg'

const TONE_ICON = { kind: '💛', fair: '🤝', cold: '🥶' }

// One item thumbnail in a trade bundle — a card, or a sealed-product chip.
// Exported for the quote walk-up (QuoteCounter), whose item strip is the same idiom.
export function TradeItem({ card, sealed }) {
  if (sealed) {
    const set = setById(sealed.setId)
    return (
      <div className="trade-item sealed">
        {set?.logo
          ? <img className="trade-sealed-logo" src={set.logo} alt={set.name} decoding="async" />
          : <div className="trade-sealed-icon">{sealed.product.icon || '📦'}</div>}
        <div className="trade-name">{sealed.product.icon || '📦'} {sealed.product.type}</div>
        <div className="trade-val">{fmtMoney(sealedValue(sealed))}</div>
      </div>
    )
  }
  return (
    <div className="trade-item">
      <HoloCard card={card} maxTilt={14} className="enc-card trade-card">
        <HiResImg card={card} alt={card.name} decoding="async" />
      </HoloCard>
      <div className="trade-name">{card.name}</div>
      {setNameOfCard(card) && <div className="muted" style={{ fontSize: 10 }}>{setNameOfCard(card)}</div>}
      <div className="trade-val">{fmtMoney(cardValue(card))}</div>
    </div>
  )
}

// An encounter prompt. `onPick` resolves the chosen option. `onClose` (optional)
// dismisses without choosing — backdrop click, Esc, or the × button. When no
// onClose is given the modal is non-dismissable (caller wants a forced choice).
export default function Encounter({ data, onPick, onClose }) {
  useModalEscape(() => onClose?.())
  // Normalize the trade bundles (arrays) with a fallback to the legacy single-card shape.
  const giveCards = data.giveCards || (data.yourCard ? [data.yourCard] : [])
  const giveSealed = data.giveSealed || []
  const getCards = data.theirs ? (Array.isArray(data.theirs) ? data.theirs : [data.theirs]) : (data.card ? [data.card] : [])
  const getSealed = data.theirsSealed || []
  const isTrade = data.kind === 'trade' && (giveCards.length || giveSealed.length) && (getCards.length || getSealed.length)
  return (
    <div className="modalbg" onClick={() => onClose?.()}>
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {onClose && <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>}
        {data.regular && (
          <div className="regular-banner">
            <span className="reg-avatar" aria-hidden>{data.regular.emoji}</span>
            <span><b>{data.regular.name}</b> · <span className="reg-tier">{data.regular.tier}</span>
              {data.regular.focusLabel && <> · <span className="reg-focus">{data.regular.focusLabel}</span></>}
            </span>
          </div>
        )}
        <h2 style={{ fontSize: 19 }}>{data.title}</h2>

        {isTrade ? (
          // Two-sided bundle trade: what you give up ↔ what you get, with the cash delta.
          <div className="trade-view">
            <div className="trade-side">
              <div className="trade-label">You give</div>
              <div className="trade-items">
                {giveCards.map(c => <TradeItem key={c.uid} card={c} />)}
                {giveSealed.map(it => <TradeItem key={it.uid} sealed={it} />)}
              </div>
            </div>
            <div className="trade-swap">
              <span className="trade-arrows">⇄</span>
              {data.cashAdj > 0 && <span className="trade-cash up">+{fmtMoney(data.cashAdj)} to you</span>}
              {data.cashAdj < 0 && <span className="trade-cash down">you add {fmtMoney(-data.cashAdj)}</span>}
            </div>
            <div className="trade-side">
              <div className="trade-label">You get</div>
              <div className="trade-items">
                {getCards.map(c => <TradeItem key={c.uid} card={c} />)}
                {getSealed.map(it => <TradeItem key={it.uid || it.product?.type} sealed={it} />)}
              </div>
            </div>
          </div>
        ) : data.card && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 4, margin:'8px 0' }}>
            <HoloCard card={data.card} maxTilt={16} className="enc-card"><HiResImg card={data.card} alt={data.card.name} decoding="async" fetchpriority="high" /></HoloCard>
            {setNameOfCard(data.card) && <div className="muted" style={{ fontSize: 11 }}>{setNameOfCard(data.card)}</div>}
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
