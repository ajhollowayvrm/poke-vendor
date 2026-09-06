import { useState } from 'react'
import { useGame } from '../game/store'
import { DM_KINDS, unreadCount } from '../game/dms'
import { toast } from '../ui/dialog'
import { clickable } from '../ui/clickable'

// 💬 The socials inbox.
//
// Kept deliberately apart from the store's inbox. A buyer standing at your counter and a
// fifteen-year-old asking whether grading is worth it are not the same job, and putting them
// in one list means the one that pays gets buried under the one that does not. Store →
// Messages is where money is; this is where the audience is.
//
// Nothing here obliges you. Reading is free, replying is not a mechanic, and clearing costs
// nothing — that is the honest shape of having an audience, and a DM that demanded an answer
// would be a chore with a chat bubble drawn on it.
export default function DMs() {
  const dms = useGame(s => s.dms || [])
  const followers = useGame(s => s.followers || 0)
  const readDm = useGame(s => s.readDm)
  const clearDm = useGame(s => s.clearDm)
  const clearReadDms = useGame(s => s.clearReadDms)
  const [open, setOpen] = useState(null)
  const unread = unreadCount(dms)

  if (!dms.length) {
    return (
      <div className="empty">
        {followers > 0
          ? 'Nothing in the inbox. Keep posting — an audience eventually talks back. 💬'
          : 'No audience yet, so nobody is writing. Post something worth watching first. 💬'}
      </div>
    )
  }

  return (
    <>
      <div className="paystatus mt-3">
        <span className="pill">💬 {dms.length} message{dms.length === 1 ? '' : 's'}</span>
        {unread > 0 && <span className="pill" style={{ fontWeight: 700 }}>{unread} unread</span>}
        {dms.some(d => d.read) && (
          <button className="btn alt t-xs btn-fixed" style={{ padding: '3px 10px' }}
            onClick={() => { clearReadDms(); toast('💬 Cleared the ones you have read.') }}>
            Clear read
          </button>
        )}
      </div>

      <div className="stock-lines mt-4">
        {dms.map(d => {
          const k = DM_KINDS[d.kind] || DM_KINDS.fan
          const isOpen = open === d.id
          return (
            <div key={d.id} className={`trade-line dm-line ${d.read ? '' : 'unread'}`}
              {...clickable(() => { setOpen(isOpen ? null : d.id); if (!d.read) readDm(d.id) },
                { style: { cursor: 'pointer', alignItems: 'flex-start' } })}>
              <span className="tl-icon">{d.avatar}</span>
              <div className="tl-info">
                <div className="tl-name">
                  {!d.read && <span className="pill t-xs" style={{ marginRight: 6 }}>NEW</span>}
                  @{d.from} <span className="muted">· {k.icon} {k.label}</span>
                </div>
                <div className={isOpen ? 'tl-sub' : 'tl-sub muted'}
                  style={isOpen ? { whiteSpace: 'normal' } : undefined}>
                  {isOpen ? d.body : `${d.body.slice(0, 64)}${d.body.length > 64 ? '…' : ''}`}
                </div>
              </div>
              <button className="stock-act" aria-label="Delete this message"
                onClick={e => { e.stopPropagation(); clearDm(d.id) }}>✕</button>
            </div>
          )
        })}
      </div>
    </>
  )
}
