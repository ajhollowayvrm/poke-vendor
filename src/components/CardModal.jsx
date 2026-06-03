import { cardValue, rawValue, GRADING, gradingFee, graderTier, nextGraderTier } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'

export default function CardModal({ card, onClose }) {
  const sellCard = useGame(s => s.sellCard)
  const submitGrade = useGame(s => s.submitGrade)
  const cash = useGame(s => s.cash)
  const submitted = useGame(s => s.gradesSubmitted)
  if (!card) return null
  const g = card.grade
  const tier = graderTier(submitted)
  const next = nextGraderTier(submitted)

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="detailflex">
          <HoloCard card={card} maxTilt={18} className="modal-holo">
            <img src={card.imgLarge || card.img} alt={card.name} />
          </HoloCard>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2>{card.name}</h2>
            <p className="muted" style={{ margin: '2px 0 10px' }}>
              <span style={{ color: rarityColor(card.rarity), fontWeight: 800 }}>{card.rarity}</span>
              {card.reverse ? ' · Reverse Holo' : ''} · #{card.number}
            </p>

            {g ? (
              <>
                <div className="banner" style={{background:'#fff', color:'#111', borderColor:'#ddd', textAlign:'center'}}>
                  <b style={{fontSize:28}}>PSA {g.overall}</b>{' '}
                  <span style={{fontWeight:700}}>{g.overall===10?'GEM MINT':g.overall>=9?'MINT':g.overall>=7?'NM':'graded'}</span>
                </div>
                <div className="subgrades">
                  {['centering','corners','edges','surface'].map(k => (
                    <div className="sg" key={k}><span>{k[0].toUpperCase()+k.slice(1)}</span><b>{g[k]}</b></div>
                  ))}
                </div>
                <p style={{fontSize:15}}>Graded value: <b style={{color:'var(--green)'}}>${cardValue(card).toFixed(2)}</b>
                  <span className="muted"> (raw ${rawValue(card).toFixed(2)})</span></p>
              </>
            ) : (
              <p style={{ fontSize: 15 }}>Market value: <b style={{ color: 'var(--green)' }}>${rawValue(card).toFixed(2)}</b></p>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn gold" onClick={() => { sellCard(card.uid); onClose() }}>
                Sell for ${cardValue(card).toFixed(2)}
              </button>
            </div>

            {!g && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap: 8, margin: '18px 0 6px' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Submit for PSA-style grading</span>
                  <span className="pill" style={{ color: tier.color, borderColor: tier.color, border: '1px solid' }}>
                    🤝 {tier.name}{tier.discount > 0 ? ` · ${Math.round(tier.discount*100)}% off` : ''}
                  </span>
                </div>
                <div className="row">
                  {Object.entries(GRADING).map(([key, t]) => {
                    const fee = gradingFee(key, submitted)
                    const discounted = fee < t.fee
                    return (
                      <button key={key} className="btn alt" disabled={cash < fee}
                        onClick={() => { submitGrade(card.uid, key); onClose() }}>
                        {t.name} · ${fee.toFixed(0)}
                        {discounted && <small style={{ textDecoration:'line-through', opacity:.5, marginLeft:4 }}>${t.fee}</small>}
                        <br/><small className="muted">~{t.days}d</small>
                      </button>
                    )
                  })}
                </div>
                <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  A high grade can multiply value 2–4×; low grades hurt — it's a gamble.
                  {next
                    ? ` Submitted ${submitted} cards · ${next.min - submitted} more to ${next.name} (${Math.round(next.discount*100)}% off).`
                    : ` You're a ${tier.name} client — top grading loyalty.`}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
