import { useMemo, useState } from 'react'
import { useGame, absoluteDay } from '../game/store'
import { GRADING, GRADERS, GRADER_TIERS, graderTier, nextGraderTier, gradingFee, gradingFeeTotal, gradingShipping, overTierValue, gradingDays, graderById, bulkDiscount, BULK_TIERS, rawValue, round2, fmtMoney, cutEstimate, cardImg, setNameOfCard, setById } from '../game/engine'
import { sealedGraderById } from '../game/sealedgrading'
import CardTile from './CardTile'

export default function Bench() {
  const pending = useGame(s => s.pendingGrades)
  const submitted = useGame(s => s.gradesSubmitted)
  const clout = useGame(s => s.clout || 0)
  const expediteGrade = useGame(s => s.expediteGrade)
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

      {/* 📦🔟 Sealed product out at a sealed grader. Its own queue and its own clock, shown
          here because from the player's side there is one question: what is away being graded. */}
      <SealedBench today={today} />

      {pending.length === 0 ? (
        <div className="empty">No cards at the grader. Submit cards above, or from a card's detail view. 🔬</div>
      ) : (
        <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {pending.map((p) => {
            const totalDays = gradingDays(p.tierKey, p.company)
            const daysLeft = Math.max(0, p.readyOnDay - today)
            const pct = Math.min(100, 100 * (totalDays - daysLeft) / totalDays)
            return (
              <div className="product" key={p.card.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <img src={cardImg(p.card)} alt={p.card.name} style={{ width: 70, borderRadius: 8 }} />
                <div style={{ flex: 1 }}>
                  <b>{p.card.name}</b>
                  <div className="cap">{setNameOfCard(p.card) ? `${setNameOfCard(p.card)} · ` : ''}<span style={{ color: graderById(p.company).color, fontWeight: 700 }}>{graderById(p.company).icon} {graderById(p.company).name}</span> · {GRADING[p.tierKey].name}</div>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, height: 10, marginTop: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,var(--accent2),var(--green))', transition: 'width .25s' }} />
                  </div>
                  <div className="cap mt-2">
                    {daysLeft === 0 ? 'Ready — advance a day to collect' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                    {p.expedited && <span className="warn"> · ⚡ expedited</span>}
                  </div>
                  {/* 🎫 ⚡ Clout spend: walk this one to the front — 7 days off, speed only. */}
                  {daysLeft > 1 && !p.expedited && (
                    <button className="btn alt t-xs" style={{ marginTop: 6, padding: '3px 9px' }}
                      disabled={clout < 2 || cash < 50}
                      title={clout < 2 ? 'Needs 2 🎫 clout' : cash < 50 ? 'Needs $50 for the rush fee' : 'Spend 2 🎫 clout + $50 — your grader contact walks it to the front (7 days off, never lands before tomorrow). Odds untouched.'}
                      onClick={() => expediteGrade(p.card.uid)}>
                      ⚡ Expedite · 2 🎫 + $50
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// 📦🔟 The sealed queue. Renders nothing when empty, so the grader tab is unchanged for a
// player who has never sent a box — the whole system stays out of the way until it is used.
function SealedBench({ today }) {
  const pending = useGame(s => s.pendingSealed || [])
  if (!pending.length) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="cap" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>
        📦 At the sealed grader
      </div>
      <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
        {pending.map(p => {
          const total = Math.max(1, p.readyOnDay - p.submittedAt)
          const daysLeft = Math.max(0, p.readyOnDay - today)
          const pct = Math.min(100, 100 * (total - daysLeft) / total)
          const set = setById(p.item.setId)
          const g = sealedGraderById(p.company)
          return (
            <div className="product" key={p.item.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {set?.logo
                ? <img src={set.logo} alt={set.name} style={{ width: 70, borderRadius: 8 }} />
                : <span style={{ fontSize: 34 }}>{p.item.product?.icon || '📦'}</span>}
              <div style={{ flex: 1 }}>
                <b>{p.item.product?.name || `${set?.name || ''} ${p.item.product?.type || 'Sealed'}`.trim()}</b>
                <div className="cap">
                  <span style={{ color: g.color, fontWeight: 700 }}>{g.icon} {g.name}</span>
                  {p.item.vintage ? ' · 🗝️ vintage' : ''} · {fmtMoney(p.paidFee)} fee
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, height: 10, marginTop: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                  <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#a78bfa,var(--green))', transition: 'width .25s' }} />
                </div>
                <div className="cap mt-2">
                  {daysLeft === 0 ? 'Ready — advance a day to collect' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Multi-select raw cards and submit them in one batch for a per-card bulk discount.
function BulkSubmit({ collection, submitted, cash, onSubmit }) {
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const upgrades = useGame(s => s.upgrades)   // 📦 Shipping Station cuts submission freight
  const [open, setOpen] = useState(false)
  const [tierKey, setTierKey] = useState('economy')
  const [company, setCompany] = useState('psa')   // which grader the whole batch goes to
  const [picked, setPicked] = useState(() => new Set())

  // Only raw (ungraded) cards can be graded — sorted by value (highest first) so
  // the cards worth grading surface at the top of the picker.
  const raw = useMemo(
    () => collection.filter(c => !c.grade).sort((a, b) => rawValue(b) - rawValue(a)),
    [collection])
  const count = picked.size
  // Per-card, then summed: declared-value pricing means the pricey cards in a batch cost more
  // than the sticker, so "feePer × count" would under-quote what the store charges.
  const pickedCards = raw.filter(c => picked.has(c.uid))
  const total = gradingFeeTotal(pickedCards, tierKey, submitted, company, upgrades)
  const ship = gradingShipping(pickedCards, upgrades)
  const feePer = count ? round2(total / count) : gradingFee(tierKey, submitted, 1, company)
  const mixed = pickedCards.some(c => overTierValue(tierKey, rawValue(c)))
  const bulk = bulkDiscount(count)

  function toggle(uid) {
    setPicked(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function submit() {
    onSubmit([...picked], tierKey, company)
    setPicked(new Set()); setOpen(false)
  }

  if (!raw.length) return null

  return (
    <div className="bulk-submit">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <b>📦 Bulk submit</b>
          <span className="cap" style={{ marginLeft: 8 }}>
            Send several at once for a per-card discount: {BULK_TIERS.slice().reverse().map((t, i) => `${t.min}+ → ${Math.round(t.discount*100)}% off`).join(' · ')}
          </span>
        </div>
        <button className="btn alt btn-fixed" style={{ maxWidth: 170 }} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide' : 'Bulk submit cards'}
        </button>
      </div>

      {open && (
        <>
          {/* A batch goes to ONE grader — that's how a real bulk submission works, and it's
              the whole decision: red-label resale, a black-label lottery, or cheap and fast. */}
          <div className="grader-pick mt-5">
            {Object.values(GRADERS).map(g => (
              <button key={g.key} type="button" className={`chip-btn ${company === g.key ? 'active' : ''}`}
                style={{ flex: '1 1 0', '--rarity': g.color }} onClick={() => setCompany(g.key)} title={g.blurb}>
                <b style={{ color: g.color }}>{g.icon} {g.name}</b>
                <small>{g.slabMult === 1 ? 'benchmark resale' : `${Math.round((g.slabMult - 1) * 100)}% resale`}</small>
              </button>
            ))}
          </div>
          <p className="cap" style={{ margin: '4px 0 0' }}>{graderById(company).blurb}</p>
          <div className="row" style={{ margin: '10px 0', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="cap t-sm">Service:</span>
            {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([key, t]) => (
              <button key={key} className={`tab ${tierKey === key ? 'active' : ''}`} onClick={() => setTierKey(key)}>
                {t.name} · ~{gradingDays(key, company)}d
              </button>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', maxHeight: 360, overflowY: 'auto' }}>
            {raw.map(c => {
              const est = cutEstimate(c, hasLoupe)
              return (
              <div key={c.uid} className={`bulk-card ${picked.has(c.uid) ? 'picked' : ''}`} onClick={() => toggle(c.uid)}>
                <CardTile card={c} interactive={false} />
                <div className="cap" style={{ textAlign: 'center' }}>raw {fmtMoney(rawValue(c))}</div>
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <span className="t-xs" style={{ fontWeight: 700, color: est.color, background: est.color + '22', borderRadius: 4, padding: '1px 5px' }}
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
            {bulk > 0 && <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }}>{Math.round(bulk*100)}% bulk discount</span>}
            <span className="cap t-sm">
              {!count ? 'Pick cards to grade'
                : <>
                    {mixed ? `${count} cards, priced by value` : `${fmtMoney(round2((total - ship) / count))}/card × ${count}`}
                    {' + '}
                    <span title="Insured postage there and back, charged once per submission — so one card pays the whole round trip and a big batch barely notices it.">
                      {fmtMoney(ship)} freight
                    </span>
                    {' = '}<b>{fmtMoney(total)}</b>
                    {count === 1 && <span className="muted"> · batching spreads the freight</span>}
                  </>}
            </span>
            <button className="btn gold btn-fixed" style={{ maxWidth: 220, marginLeft: 'auto' }}
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
          <div className="t-xs" style={{ color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Grader relationship</div>
          <div className="t-xl" style={{ fontWeight: 800, color: tier.color }}>🤝 {tier.name}{tier.discount > 0 ? ` · ${Math.round(tier.discount * 100)}% off` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cap">Cards submitted</div>
          <div className="t-xl" style={{ fontWeight: 800 }}>{submitted}</div>
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

      <div style={{ background: 'var(--bg)', borderRadius: 999, height: 8, overflow: 'hidden', border: '1px solid var(--line)', margin: '4px 0 6px' }}>
        <div style={{ width: pct + '%', height: '100%', background: `linear-gradient(90deg, ${tier.color}, ${next?.color || tier.color})`, transition: 'width .4s' }} />
      </div>
      <div className="cap">
        {next
          ? <>Send <b>{next.min - submitted}</b> more card{next.min - submitted === 1 ? '' : 's'} to reach <b style={{ color: next.color }}>{next.name}</b> ({Math.round(next.discount * 100)}% off).</>
          : <>Top tier reached — the grader treats you like family.</>}
        {' '}Current fees: {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([k, t], i) => (
          <span key={k}>{i ? ' · ' : ''}{t.name} <b>${gradingFee(k, submitted, 1, 'psa').toFixed(0)}</b></span>
        ))}.
      </div>
    </div>
  )
}
