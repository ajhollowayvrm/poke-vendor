import { useMemo, useState } from 'react'
import { cardValue, sealedValue, fmtMoney, cardImg, setById, slabLabel, round2 } from '../game/engine'
import { useGame } from '../game/store'
import { useOpen, bigScreen } from '../ui/Collapse'
import {
  lotMarket, lotTotalCost, lotWarning, roomHeat, WATCHERS_MAX, HOUSE_PREMIUM, lotAppeal,
} from '../game/lots'
import { absoluteDay } from '../game/store/constants'

// 🔨 The auction house, on the Buy tab — the BUY side of the hammer.
//
// The panel is deliberately built around ONE control: a maximum bid. There is no "bid again"
// button, because a proxy maximum is the whole decision and re-entering a higher number after
// being outbid is precisely the behaviour that loses dealers money.
//
// What the player reads before deciding:
//   • the room (watchers), which is what actually sets the closing price
//   • what the lot is worth AS DESCRIBED
//   • what a win would really cost, premium and postage included
//   • a warning, IF they own the upgrade that would spot the problem
//
// The last one is the point of the whole panel. A quiet lot is cheap because a quiet lot is
// disproportionately a bad listing, and 🤝 Dealer Network / 🔬 Authentication Kit are what
// let you tell which is which. Without them you are bidding on photographs.

function RoomBar({ watchers }) {
  const heat = roomHeat(watchers)
  const color = heat > 0.66 ? 'var(--red)' : heat > 0.33 ? '#ff9f43' : 'var(--green)'
  const label = heat > 0.66 ? 'packed — it will close over market'
    : heat > 0.33 ? 'a normal room' : 'quiet — where the deals are, and the traps'
  return (
    <span className="pill" title={`${watchers} watching. The room is what sets the closing price: a packed lot ends over market, a quiet one well under it.`}>
      👥 <b style={{ color }}>{watchers}</b>
      <span className="muted" style={{ marginLeft: 5, fontSize: 11 }}>{label}</span>
    </span>
  )
}

function Lot({ lot, day }) {
  const upgrades = useGame(s => s.upgrades)
  const bidOnLot = useGame(s => s.bidOnLot)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState(null)

  const market = lotMarket(lot)
  const warning = lotWarning(lot, upgrades)
  const daysLeft = Math.max(0, lot.endsOn - day)
  const committed = lot.maxBid > 0 ? lotTotalCost(lot.maxBid) : null
  const art = lot.kind === 'sealed'
    ? (setById(lot.item?.setId)?.logo || lot.item?.product?.img || null)
    : cardImg(lot.card)

  const place = (value) => {
    const r = bidOnLot(lot.id, value)
    if (r?.error) { setErr(r.error); setTimeout(() => setErr(null), 4200); return }
    setErr(null); setDraft('')
  }

  return (
    <div className={`lot-row ${lot.maxBid > 0 ? 'bidding' : ''} ${warning ? 'flagged' : ''}`}>
      {art && <img className="lot-art" src={art} alt="" />}
      <div className="lot-main">
        <div className="lot-title">
          <b>{lot.title}</b>
          {lot.kind === 'raw' && lot.claimedCondition && (
            <span className="pill" title="What the listing CLAIMS the condition is. Claims are not always true, and the quieter the lot the less often they are.">
              {lot.claimedCondition}
            </span>
          )}
          {lot.kind === 'slab' && lot.card?.grade && <span className="pill">{slabLabel(lot.card.grade)}</span>}
        </div>
        <div className="lot-sub">
          <RoomBar watchers={lot.watchers} />
          <span className="pill" title="What this lot is worth if the description is accurate.">
            worth <b>{fmtMoney(market)}</b>
          </span>
          <span className="pill">{daysLeft <= 0 ? 'closing now' : `${daysLeft}d left`}</span>
        </div>
        {warning && (
          <div className="lot-warn">{warning.icon} {warning.text}</div>
        )}
        {committed && (
          <div className="lot-committed">
            Your maximum <b>{fmtMoney(lot.maxBid)}</b> · a win costs{' '}
            <b>{fmtMoney(committed.total)}</b>{' '}
            <span className="muted">({fmtMoney(committed.premium)} premium + {fmtMoney(committed.ship)} postage)</span>
          </div>
        )}
        {err && <div className="lot-warn">⚠️ {err}</div>}
      </div>
      <div className="lot-bid">
        <input
          className="lot-input" type="number" min="0" step="1" placeholder="max"
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && draft) place(Number(draft)) }} />
        <button className="btn small" disabled={!draft || Number(draft) <= 0} onClick={() => place(Number(draft))}>
          Leave bid
        </button>
        {lot.maxBid > 0 && (
          <button className="btn small ghost" onClick={() => place(0)}>Withdraw</button>
        )}
      </div>
    </div>
  )
}

export default function AuctionHouse() {
  const lots = useGame(s => s.auctionLots)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const committed = useGame(s => s.lotsCommitted())
  const stats = useGame(s => s.auctionStats)
  const [open, toggle] = useOpen('pv-lots-open', bigScreen())

  const day = absoluteDay(currentDay, monthsElapsed)
  // Sort by appeal: a quiet room on a valuable lot floats to the top, because that is the
  // thing worth a decision. It is not a recommendation — half of them are quiet for a reason.
  const sorted = useMemo(
    () => [...(lots || [])].filter(l => day < l.endsOn).sort((a, b) => lotAppeal(b) - lotAppeal(a)),
    [lots, day])

  if (!sorted.length) return null

  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head" style={{ cursor: 'pointer' }} onClick={toggle}>
        🔨 Auction house <span className="muted">— {sorted.length} lots running</span>
        {committed > 0 && <span className="pill" style={{ marginLeft: 8 }}>{fmtMoney(committed)} committed</span>}
        <span className="muted" style={{ marginLeft: 'auto' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          <div className="muted" style={{ fontSize: 12.5, margin: '8px 0 10px' }}>
            Leave the most you would genuinely pay and walk away. You pay one increment over
            the runner-up, never your maximum — so a high bid costs nothing when the room is
            quiet. The house adds {Math.round(HOUSE_PREMIUM * 100)}% on every win, plus postage.
            {stats?.burned > 0 && (
              <> You have been caught out by a description <b>{stats.burned}</b> time{stats.burned === 1 ? '' : 's'}.</>
            )}
          </div>
          <div className="lot-list">
            {sorted.map(lot => <Lot key={lot.id} lot={lot} day={day} />)}
          </div>
        </>
      )}
    </div>
  )
}
