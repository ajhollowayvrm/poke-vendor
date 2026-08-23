import { useMemo, useState } from 'react'
import { fmtMoney, cardImg, setById, cardValue, round2 } from '../game/engine'
import { useGame } from '../game/store'
import {
  SELLERS, PHOTOS, ACCOUNT_LABEL, travelCost, listingWarning, MEETS_PER_DAY,
} from '../game/market'

// 📱 The Local Marketplace board.
//
// The design job here is the opposite of every other buy screen in the game. Those exist to
// make a price legible. This one exists to make a JUDGEMENT legible — because the price is
// the least trustworthy thing on the listing.
//
// So the listing leads with what a stranger wrote and how long it has sat there, and the
// market value sits underneath as a comparison rather than a headline. A listing at 20% of
// market is either the find of the month or a person who will not be there when you arrive,
// and the whole point is that the number cannot tell you which.

function Tell({ icon, children, tone }) {
  return (
    <span className={`mk-tell ${tone || ''}`}>{icon} {children}</span>
  )
}

function Listing({ listing, meetsLeft }) {
  const upgrades = useGame(s => s.upgrades)
  const cash = useGame(s => s.cash)
  const messageSeller = useGame(s => s.messageSeller)
  const collectListing = useGame(s => s.collectListing)
  const [draft, setDraft] = useState('')
  const [reply, setReply] = useState(null)
  const [result, setResult] = useState(null)

  const seller = SELLERS[listing.seller]
  const warning = listingWarning(listing, upgrades)
  const price = listing.agreed ?? listing.ask
  const travel = travelCost(listing.miles)
  const total = round2(price + travel)
  const ratio = listing.worth ? price / listing.worth : 1
  const art = listing.kind === 'card' ? cardImg(listing.card)
    : listing.kind === 'sealed' ? (setById(listing.item?.setId)?.logo || null) : null

  const send = () => {
    const r = messageSeller(listing.id, Number(draft))
    if (r?.error) { setReply({ line: r.error, bad: true }); return }
    setReply({ line: r.line, bad: !r.ok })
    setDraft('')
  }
  const collect = () => {
    const r = collectListing(listing.id)
    if (r?.error) { setResult({ line: r.error, bad: true }); return }
    if (r.noshow) { setResult({ line: `👻 They never turned up. ${fmtMoney(r.travel)} of fuel gone.`, bad: true }); return }
    setResult({
      line: r.bad
        ? `⚠️ Got it — and it is not what the listing said. Paid ${fmtMoney(r.total)} for about ${fmtMoney(r.worth)}.`
        : `✅ Got it for ${fmtMoney(r.total)} — worth about ${fmtMoney(r.worth)}.`,
      bad: r.bad,
    })
  }

  // How the price reads against market. Deliberately NOT a verdict: "well under" is what a
  // steal and a scam both look like, which is the whole lesson of this channel.
  const priceRead = ratio >= 1.5 ? { text: 'way over market', tone: 'bad' }
    : ratio >= 1.1 ? { text: 'over market', tone: 'warn' }
    : ratio >= 0.85 ? { text: 'about market', tone: '' }
    : ratio >= 0.6 ? { text: 'under market', tone: 'good' }
    : { text: 'well under market', tone: 'good' }

  return (
    <div className={`mk-row ${warning ? 'flagged' : ''} ${listing.dead ? 'dead' : ''}`}>
      {art && <img className="mk-art" src={art} alt="" />}
      <div className="mk-main">
        <div className="mk-title">
          <b>{listing.title}</b>
          <span className="mk-ask">{fmtMoney(price)}</span>
        </div>
        <div className="mk-line">{listing.line}</div>
        <div className="mk-tells">
          {/* The three tells a real buyer actually reads, in the order they read them. */}
          <Tell icon="🕐" tone={listing.daysListed >= 7 ? 'warn' : ''}>
            {listing.daysListed === 0 ? 'listed today' : `listed ${listing.daysListed}d ago`}
          </Tell>
          <Tell icon="👤" tone={listing.account === 'new' ? 'warn' : ''}>{ACCOUNT_LABEL[listing.account]}</Tell>
          <Tell icon="📷" tone={listing.photo === 'stock' ? 'warn' : ''}>{PHOTOS[listing.photo]?.label}</Tell>
          <Tell icon="📍">{listing.miles} miles · {fmtMoney(travel)} to go</Tell>
        </div>
        <div className="mk-value">
          worth about <b>{fmtMoney(listing.worth)}</b>
          <span className={`mk-read ${priceRead.tone}`}> — {priceRead.text}</span>
          {listing.kind === 'lot' && <span className="muted"> · a pile, and you cannot see the bottom of it</span>}
        </div>
        {warning && <div className="mk-warn">{warning.icon} {warning.text}</div>}
        {reply && <div className={`mk-reply ${reply.bad ? 'bad' : ''}`}>{reply.line}</div>}
        {result && <div className={`mk-reply ${result.bad ? 'bad' : ''}`}>{result.line}</div>}
      </div>
      <div className="mk-act">
        {!listing.dead && (
          <>
            <div className="mk-offer">
              <input className="mk-input" type="number" min="0" step="1" placeholder="offer"
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && draft) send() }} />
              <button className="btn small ghost" disabled={!draft} onClick={send}>Message</button>
            </div>
            <button className="btn small" disabled={meetsLeft <= 0 || cash < total} onClick={collect}
              title={meetsLeft <= 0 ? 'No time left today — the day only holds so many trips'
                : cash < total ? `You need ${fmtMoney(total)} including travel` : `Drive out and collect it`}>
              Go get it · {fmtMoney(total)}
            </button>
          </>
        )}
        {listing.dead && <span className="cap">They stopped replying.</span>}
      </div>
    </div>
  )
}

export default function LocalMarket() {
  const listings = useGame(s => s.market?.listings || [])
  const meetsLeft = useGame(s => s.meetsLeft())
  const stats = useGame(s => s.marketStats)
  const [sort, setSort] = useState('new')

  const sorted = useMemo(() => {
    const l = [...listings]
    if (sort === 'cheap') l.sort((a, b) => (a.ask / (a.worth || 1)) - (b.ask / (b.worth || 1)))
    else if (sort === 'price') l.sort((a, b) => a.ask - b.ask)
    else l.sort((a, b) => (a.daysListed || 0) - (b.daysListed || 0))
    return l
  }, [listings, sort])

  return (
    <>
      <div className="banner mt-6">
        📱 <b style={{ color: '#4267B2' }}>Local Marketplace</b> — strangers near you, selling out of
        their spare rooms. <b>Nobody here prices to market.</b> They price to how they feel about the
        thing, so most of this board is fantasy and the rest goes fast. Message them to haggle (free),
        then drive out and collect — <b>{meetsLeft} of {MEETS_PER_DAY} trips left today</b>.
        {stats?.burned > 0 && (
          <> You have been caught out <b>{stats.burned}</b> time{stats.burned === 1 ? '' : 's'} out here.</>
        )}
        <div className="cap mt-3">
          A price well under market means one of two things and never says which: somebody who does
          not know what they have, or somebody who is lying. Read how long it has sat, how old the
          account is, and what the photos look like.
        </div>
      </div>

      <div className="row" style={{ gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        <span className="cap">Sort:</span>
        {[['new', 'Newest'], ['cheap', 'Best price vs market'], ['price', 'Cheapest']].map(([k, label]) => (
          <button key={k} className={`btn small ${sort === k ? '' : 'ghost'}`} onClick={() => setSort(k)}>{label}</button>
        ))}
      </div>

      {!sorted.length ? (
        <p className="muted">Nothing listed near you right now — check back tomorrow.</p>
      ) : (
        <div className="mk-list">
          {sorted.map(l => <Listing key={l.id} listing={l} meetsLeft={meetsLeft} />)}
        </div>
      )}
    </>
  )
}
