import { useEffect, useState } from 'react'
import { useGame, DAY_MS_SIM } from '../game/store'
import { GRADING, GRADER_TIERS, graderTier, nextGraderTier, gradingFee } from '../game/engine'

export default function Bench() {
  const pending = useGame(s => s.pendingGrades)
  const submitted = useGame(s => s.gradesSubmitted)
  const resolveGrades = useGame(s => s.resolveGrades)
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => { resolveGrades(); tick(t => t + 1) }, 250)
    return () => clearInterval(id)
  }, [resolveGrades])

  const now = Date.now()
  return (
    <>
      <GraderRelationship submitted={submitted} />
      {pending.length === 0 ? (
        <div className="empty">No cards at the grader. Submit a card from its detail view to grade it. 🔬</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {pending.map((p, i) => {
            const total = GRADING[p.tierKey].days * DAY_MS_SIM
            const remain = Math.max(0, p.readyAt - now)
            const pct = Math.min(100, 100 * (1 - remain / total))
            const daysLeft = Math.ceil(remain / DAY_MS_SIM)
            return (
              <div className="product" key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <img src={p.card.img} alt={p.card.name} style={{ width: 70, borderRadius: 8 }} />
                <div style={{ flex: 1 }}>
                  <b>{p.card.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{GRADING[p.tierKey].name} grading</div>
                  <div style={{ background: '#0c0f1a', borderRadius: 8, height: 10, marginTop: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#3b6cff,#36d399)', transition: 'width .25s' }} />
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{daysLeft} days left</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function GraderRelationship({ submitted }) {
  const tier = graderTier(submitted)
  const next = nextGraderTier(submitted)
  const prevMin = tier.min
  const span = next ? next.min - prevMin : 1
  const pct = next ? Math.min(100, 100 * (submitted - prevMin) / span) : 100

  return (
    <div className="grader-rel">
      <div className="grader-rel-head">
        <div>
          <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Grader relationship</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: tier.color }}>🤝 {tier.name}{tier.discount > 0 ? ` · ${Math.round(tier.discount * 100)}% off` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 12 }}>Cards submitted</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{submitted}</div>
        </div>
      </div>

      {/* tier ladder */}
      <div className="tier-ladder">
        {GRADER_TIERS.map(t => (
          <span key={t.key} className={`tier-node ${submitted >= t.min ? 'reached' : ''} ${t.key === tier.key ? 'current' : ''}`}
            style={{ '--tc': t.color }}>
            {t.name}<small>{t.min === 0 ? '0' : t.min}+ · {Math.round(t.discount * 100)}%</small>
          </span>
        ))}
      </div>

      <div style={{ background: '#0c0f1a', borderRadius: 999, height: 8, overflow: 'hidden', border: '1px solid var(--line)', margin: '4px 0 6px' }}>
        <div style={{ width: pct + '%', height: '100%', background: `linear-gradient(90deg, ${tier.color}, ${next?.color || tier.color})`, transition: 'width .4s' }} />
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {next
          ? <>Send <b>{next.min - submitted}</b> more card{next.min - submitted === 1 ? '' : 's'} to reach <b style={{ color: next.color }}>{next.name}</b> ({Math.round(next.discount * 100)}% off).</>
          : <>Top tier reached — the grader treats you like family.</>}
        {' '}Current fees: {Object.entries(GRADING).map(([k, t], i) => (
          <span key={k}>{i ? ' · ' : ''}{t.name} <b>${gradingFee(k, submitted).toFixed(0)}</b></span>
        ))}.
      </div>
    </div>
  )
}
