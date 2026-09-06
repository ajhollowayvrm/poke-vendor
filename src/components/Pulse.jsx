import { useMemo } from 'react'
import { useGame } from '../game/store'
import { SETS } from '../game/engine'
import { Explain } from '../ui/Explain'

// 📈 The pulse — what the hobby is talking about this week.
//
// A word on what this is and is NOT. There is no separate "community heat" number in this
// game, and inventing one would mean a second truth about which sets are hot that could
// disagree with the prices you actually buy and sell at. So the pulse reads the ONE signal
// that already exists — each set's market multiplier, the thing that moves what a card is
// worth — and shows it the way you would actually encounter it: as chatter, not a table.
//
// That keeps it honest. The sets people are loud about here really are the sets whose prices
// are moving, because they are the same number.
const HOT = [
  'everyone is opening it again', 'the price boards will not sit still', 'group breaks are all this',
  'sold out at three shops locally', 'the timeline will not shut up about it',
]
const COLD = [
  'the hype has gone somewhere else', 'sitting in every case in town', 'people are quietly taking losses',
  'nobody is filming it any more', 'the boards have given up on it',
]

export default function Pulse() {
  const mults = useGame(s => s.marketMults) || {}
  const hype = useGame(s => s.hype || 0)
  const followers = useGame(s => s.followers || 0)

  // Only sets that have actually MOVED. A multiplier sitting at exactly 1.00 is not news, and
  // a pulse that lists all 150 sets in release order is a table wearing a costume.
  const movers = useMemo(() => {
    const rows = []
    for (const set of SETS) {
      const m = mults[set.id]
      if (m == null) continue
      const drift = m - 1
      if (Math.abs(drift) < 0.03) continue
      rows.push({ set, mult: m, drift })
    }
    return rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 12)
  }, [mults])

  const hot = movers.filter(r => r.drift > 0)
  const cold = movers.filter(r => r.drift < 0)

  return (
    <>
      <div className="paystatus mt-3">
        <span className="pill">👥 {followers} followers</span>
        <Explain label="What the pulse is" align="left" trigger={
          <span className="pill">🔥 Shop heat {Math.round(hype)}/100</span>}>
          <b>📈 The pulse</b>
          <p>What the hobby is loud about, read off the same market multipliers that set what
            your cards are worth. A set people are talking up is a set whose singles and sealed
            are drifting up — buy into it early, or sell into the noise.</p>
        </Explain>
      </div>

      {movers.length === 0 ? (
        <div className="empty">Quiet week. Nothing is moving enough for anybody to talk about it. 📈</div>
      ) : (
        <>
          <PulseList title="🔥 What people are chasing" rows={hot} lines={HOT}
            empty="Nothing is running right now." />
          <PulseList title="🧊 What people have moved on from" rows={cold} lines={COLD}
            empty="Nothing is falling out of favour." />
        </>
      )}

    </>
  )
}

function PulseList({ title, rows, lines, empty }) {
  return (
    <div className="mt-6">
      <div className="wants-head">{title} <span className="muted">({rows.length})</span></div>
      {rows.length === 0 ? <div className="cap">{empty}</div> : (
        <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', marginTop: 8 }}>
          {rows.map(({ set, drift }, i) => (
            <div key={set.id} className="product" style={{ padding: '10px 12px', gap: 3 }}>
              <div className="t-sm" style={{ fontWeight: 700 }}>{set.name}</div>
              <div className="cap">{set.series}</div>
              <div className="cap" style={{ color: drift > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {drift > 0 ? '▲' : '▼'} {Math.abs(Math.round(drift * 100))}% on the boards
              </div>
              <div className="cap">“{lines[i % lines.length]}”</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
