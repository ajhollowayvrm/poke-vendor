import { useGame } from '../game/store'
import { fmtMoney, cardValue } from '../game/engine'
import { Modal } from '../ui/Modal'
import CardTile from './CardTile'

// One picker for both collector WANTS and forum WTB posts — they use the same matcher and the
// same payout, so they get the same screen. It lives in its own file because the two things
// that raise it now sit on different screens: a want is an order (💬 Messages) and a forum post
// is a board you go and read (📦 Inventory → Online). A modal duplicated across two screens is
// two modals that drift.
//
// `pick`: { kind: 'want' | 'forum', item }.
export default function WantFulfill({ pick, onClose, onInspect, flash }) {
  const cardsForWant = useGame(s => s.cardsForWant)
  const cardsForForumPost = useGame(s => s.cardsForForumPost)
  const fulfillWant = useGame(s => s.fulfillWant)
  const fulfillForumPost = useGame(s => s.fulfillForumPost)
  if (!pick) return null

  const item = pick.item
  const isForum = pick.kind === 'forum'
  const matches = isForum ? cardsForForumPost(item) : cardsForWant(item)

  return (
    <Modal onClose={onClose} maxWidth={640} sheet label="Pick a card">
      <h2 className="t-xl" style={{ marginBottom: 2 }}>{isForum ? 'Fill forum WTB' : 'Fill'}: {item.desc}</h2>
      <p className="cap t-sm mt-0">
        Pick which copy to hand over — {isForum ? 'the poster' : 'they'} pay {Math.round(item.premiumMult * 100)}%
        of its market value, +{item.notoriety}★ reputation.
      </p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
        {matches.map(c => (
          <div key={c.uid} className="vendoritem">
            <div style={{ cursor: 'zoom-in' }} onClick={() => onInspect && onInspect(c)}>
              <CardTile card={c} interactive={false} />
            </div>
            <button className="btn gold" onClick={() => {
              const r = isForum ? fulfillForumPost(item.id, c.uid) : fulfillWant(item.id, c.uid)
              if (r && flash) flash(`${isForum ? 'Filled a forum request' : 'Filled the want'} — earned ${fmtMoney(r.payout)} (+${item.notoriety}★)`)
              onClose()
            }}>Give · {fmtMoney(cardValue(c) * item.premiumMult)}</button>
          </div>
        ))}
      </div>
      <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={onClose}>Cancel</button>
    </Modal>
  )
}
