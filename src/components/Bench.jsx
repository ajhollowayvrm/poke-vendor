import { useMemo, useState } from 'react'
import { useGame, absoluteDay } from '../game/store'
import { GRADING, GRADER_TIERS, graderTier, nextGraderTier, gradingFee, bulkDiscount, BULK_TIERS, rawValue, fmtMoney, cutEstimate } from '../game/engine'
import CardTile from './CardTile'

export default function Bench() {
  const pending = useGame(s => s.pendingGrades)
  const submitted = useGame(s => s.gradesSubmitted)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  // readyOnDay is a month-safe absolute day, so compare against the absolute "today".
  const today = absoluteDay(currentDay, monthsElapsed)
  const collection = useGame(s => s.collection)
  const cash = useGame(s => s.cash)
  const submitGradesBulk = useGame(s => s.submitGradesBulk)

  return (
    <>
      <GraderRelationship submitted={submitted} />

      <BulkSubmit collection={collection} submitted={submitted} cash={cash} onSubmit={submitGradesBulk} />

      {pending.length === 0 ? (
        <div className="empty">No cards at the grader. Submit cards above, or from a card's detail view. 🔬</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {pending.map((p) => {
            const totalDays = GRADING[p.tierKey].days
            const daysLeft = Math.max(0, p.readyOnDay - today)
            const pct = Math.min(100, 100 * (totalDays - daysLeft) / totalDays)
            return (
              <div className="product" key={p.card.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <img src={p.card.img} alt={p.card.name} style={{ width: 70, borderRadius: 8 }} />
                <div style={{ flex: 1 }}>
                  <b>{p.card.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{GRADING[p.tierKey].name} grading</div>
                  <div style={{ background: '#0c0f1a', borderRadius: 8, height: 10, marginTop: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#3b6cff,#36d399)', transition: 'width .25s' }} />
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {daysLeft === 0 ? 'Ready — advance a day to collect' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// Multi-select raw cards and submit them in one batch for a per-card bulk discount.
function BulkSubmit({ collection, submitted, cash, onSubmit }) {
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const [open, setOpen] = useState(false)
  const [tierKey, setTierKey] = useState('economy')
  const [picked, setPicked] = useState(() => new Set())

  // Only raw (ungraded) cards can be graded — sorted by value (highest first) so
  // the cards worth grading surface at the top of the picker.
  const raw = useMemo(
    () => collection.filter(c => !c.grade).sort((a, b) => rawValue(b) - rawValue(a)),
    [collection])
  const count = picked.size
  const feePer = gradingFee(tierKey, submitted, count || 1)
  const total = +(feePer * count).toFixed(2)
  const bulk = bulkDiscount(count)

  function toggle(uid) {
    setPicked(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function submit() {
    onSubmit([...picked], tierKey)
    setPicked(new Set()); setOpen(false)
  }

  if (!raw.length) return null

  return (
    <div className="bulk-submit">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <b>📦 Bulk submit</b>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            Send several at once for a per-card discount: {BULK_TIERS.slice().reverse().map((t, i) => `${t.min}+ → ${Math.round(t.discount*100)}% off`).join(' · ')}
          </span>
        </div>
        <button className="btn alt" style={{ flex: 'none', maxWidth: 170 }} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide' : 'Bulk submit cards'}
        </button>
      </div>

      {open && (
        <>
          <div className="row" style={{ margin: '10px 0', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13 }}>Service:</span>
            {Object.entries(GRADING).map(([key, t]) => (
              <button key={key} className={`tab ${tierKey === key ? 'active' : ''}`} onClick={() => setTierKey(key)}>
                {t.name} · ~{t.days}d
              </button>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', maxHeight: 360, overflowY: 'auto' }}>
            {raw.map(c => {
              const est = cutEstimate(c, hasLoupe)
              return (
              <div key={c.uid} className={`bulk-card ${picked.has(c.uid) ? 'picked' : ''}`} onClick={() => toggle(c.uid)}>
                <CardTile card={c} interactive={false} />
                <div className="muted" style={{ fontSize: 10.5, textAlign: 'center' }}>raw {fmtMoney(rawValue(c))}</div>
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: est.color, background: est.color + '22', borderRadius: 4, padding: '1px 5px' }}
                    title={est.label}>
                    👁️ {est.short}
                  </span>
                </div>
                {picked.has(c.uid) && <span className="bulk-check">✓</span>}
              </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 12, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="pill">{count} selected</span>
            {bulk > 0 && <span className="pill" style={{ background: '#36d39922', color: 'var(--green)' }}>{Math.round(bulk*100)}% bulk discount</span>}
            <span className="muted" style={{ fontSize: 13 }}>
              {count ? <>{fmtMoney(feePer)}/card × {count} = <b>{fmtMoney(total)}</b></> : 'Pick cards to grade'}
            </span>
            <button className="btn gold" style={{ flex: 'none', maxWidth: 220, marginLeft: 'auto' }}
              disabled={!count || cash < total} onClick={submit}>
              Submit {count || ''} {count === 1 ? 'card' : 'cards'} · {fmtMoney(total)}
            </button>
          </div>
        </>
      )}
    </div>
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
