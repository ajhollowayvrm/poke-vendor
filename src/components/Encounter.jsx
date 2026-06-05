import HoloCard from './HoloCard'
import { useModalEscape } from '../ui/dialog'

const TONE_ICON = { kind: '💛', fair: '🤝', cold: '🥶' }

// An encounter prompt. `onPick` resolves the chosen option. `onClose` (optional)
// dismisses without choosing — backdrop click, Esc, or the × button. When no
// onClose is given the modal is non-dismissable (caller wants a forced choice).
export default function Encounter({ data, onPick, onClose }) {
  useModalEscape(() => onClose?.())
  return (
    <div className="modalbg" onClick={() => onClose?.()}>
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {onClose && <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>}
        <h2 style={{ fontSize: 19 }}>{data.title}</h2>
        {data.card && (
          <div style={{ display:'flex', justifyContent:'center', margin:'8px 0' }}>
            <HoloCard card={data.card} maxTilt={16} className="enc-card"><img src={data.card.imgLarge || data.card.img} alt={data.card.name} /></HoloCard>
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
