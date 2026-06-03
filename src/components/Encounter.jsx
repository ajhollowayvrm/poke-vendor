import HoloCard from './HoloCard'

const TONE_ICON = { kind: '💛', fair: '🤝', cold: '🥶' }

export default function Encounter({ data, onPick }) {
  return (
    <div className="modalbg">
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
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
