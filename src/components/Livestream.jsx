import { useEffect, useRef, useState, useCallback } from 'react'
import { useGame } from '../game/store'
import { SHOP_SETS, openPack, makeProductPromo, isHit, cardValue, psaValueAt, fmtMoney, rarityRank, HIT_THRESHOLD, preloadCardImages, setById, setNameOfCard, sealedCard, round2, cardImg } from '../game/engine'
import {
  baseViewers, fatigueMult, viewerReaction, tipsFor, streamNotoriety, isFlop, isStreamHype,
  chatLine, reactionKind, spotPrice, spotsFilled, followersGained, hypeTrainMult, HYPE_TRAIN_MAX, streamDrawMult,
  rollRipOrder, randomChatHandle, ripOrderPrice,
} from '../game/stream'
import { packSaleChance } from '../game/mysterypacks'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'
import Burst from './Burst'
import { confirmDialog, toast } from '../ui/dialog'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { configureFeedback, primeAudio, sfxHit, sfxGod } from '../game/feedback'

// The livestream studio. You go LIVE and rip product on camera: a viewer counter,
// live chat that reacts to your ACTUAL pulls, tips, a "now revealing" callout, and
// (optionally) a BOX BREAK where spots ship to buyers — unsold spots' cards stay
// yours, and a big pull can sell a lingering spot live. You QUEUE multiple products
// per broadcast (they rip back-to-back) and, with the Live Rip Service upgrade, take
// RIP ORDERS from viewers mid-stream. Streaming burns a game-day and tires your
// audience, so it's a deliberate play.
// Phases: setup → live → ended
export default function Livestream() {
  const hasGear = useGame(s => !!s.upgrades.streaming)
  const notoriety = useGame(s => s.notoriety)
  const fatigue = useGame(s => s.streamFatigue || 0)
  const streamStats = useGame(s => s.streamStats)

  const [phase, setPhase] = useState('setup')
  const [session, setSession] = useState(null)

  if (!hasGear) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        🔴 You need a <b>Streaming Setup</b> (camera, lights, capture card) to go live.
        Grab it on the <b>Upgrades</b> tab — then rip on camera for tips, fame, and a big traffic boost.
      </div>
    )
  }
  if (phase === 'setup') {
    return <StreamSetup notoriety={notoriety} fatigue={fatigue} streamStats={streamStats}
      onGoLive={(cfg) => { setSession(cfg); setPhase('live') }} />
  }
  if (phase === 'live') {
    return <LiveStage session={session} notoriety={notoriety} fatigue={fatigue}
      onEnd={(summary) => { setSession(s => ({ ...s, summary })); setPhase('ended') }} />
  }
  return <StreamSummary session={session} onDone={() => { setSession(null); setPhase('setup') }} />
}

// --- Setup -------------------------------------------------------------------
// You can ONLY stream product you already HOLD in sealed inventory — no buying right before
// a stream. Source low (shop / shows), hold it, then queue it up and break it live for tips
// + fame. Build a QUEUE of held products; the stream rips through them back-to-back.
// What viewers are allowed to ask you to rip tonight. Two independent rules, and BOTH matter:
//
//  1. It must be something you actually have and could actually part with. This mirrors the
//     game's canonical "sellable sealed" test (daytick.js `sellableSealed`): a 🔒 LOCKED item
//     is one you've explicitly said you won't sell, and a `_heldFor` item is already promised
//     to a regular behind the counter. The stream used to ignore both — so a viewer could buy
//     a locked pack out from under you, or make you rip the very thing you'd set aside for a
//     customer. Neither should ever be orderable.
//
//  2. It must be something you OPENED UP for this broadcast (`policy`) — see the setup screen.
//
// `exclude` is the uids already sitting in the pending-order box, so the room can't order the
// same physical pack twice.
function orderableSealed(inventory, policy, exclude = new Set()) {
  const mode = policy?.sealed || 'all'
  if (mode === 'none') return []
  const allow = new Set(policy?.uids || [])
  return (inventory || []).filter(it =>
    !exclude.has(it.uid) && !it.locked && !it._heldFor &&
    (mode === 'all' || allow.has(it.uid)))
}

function StreamSetup({ notoriety, fatigue, streamStats, onGoLive }) {
  const followers = useGame(s => s.followers || 0)
  const collectBreakSpots = useGame(s => s.collectBreakSpots)
  const inventory = useGame(s => s.sealedInventory)
  const ripSealedAction = useGame(s => s.ripSealed)
  const hasRipService = useGame(s => !!s.upgrades.ripService) // 🎟️ lets viewers order YOUR sealed
  const hasStore = useGame(s => !!s.upgrades.storefront)
  // Built mystery packs with the 🔴 stream channel on — viewers can order them mid-stream.
  const streamPacks = useGame(s => (s.builtPacks || [])
    .filter(p => (s.packTiers || []).find(t => t.id === p.tierId)?.channels?.stream).length)

  // The rip queue you're building. Each row: { invUid, setId, product, brk:{on,spots} }.
  const [queue, setQueue] = useState([])
  const [pick, setPick] = useState(null) // the inventory item currently selected to add

  // WHAT YOU'RE WILLING TO SELL TONIGHT. 'all' = anything in the case is fair game; 'picked' =
  // only the units you tick; 'none' = queue only, take no rip orders at all. Locked and
  // held-for-a-regular items are never orderable under ANY mode (see orderableSealed).
  const [orderMode, setOrderMode] = useState('all')     // all | picked | none
  const [orderUids, setOrderUids] = useState(() => new Set())
  const [allowPacks, setAllowPacks] = useState(true)    // per-stream override on top of each
                                                        // tier's 🔴 stream channel setting

  // Available = held items not already queued (each physical unit can be queued once).
  const queuedUids = new Set(queue.map(q => q.invUid))
  const available = inventory.filter(it => !queuedUids.has(it.uid))
  // WHERE THE PICKER LOOKS. With a storefront your sealed splits into a 🔒 personal stash
  // (locked) and store stock (floor + storeroom), and a streamer who rips their own keepsakes
  // shouldn't have to scroll the whole store case to find them — so the picker narrows by
  // source, defaults to Personal, and remembers the choice. Without a storefront there's no
  // split; the chips don't render and everything shows.
  const [src, setSrc] = useState(() => {
    if (!hasStore) return 'all'
    try { return localStorage.getItem('pv-stream-src') || 'personal' } catch { return 'personal' }
  })
  const pickSrc = (k) => { setSrc(k); try { localStorage.setItem('pv-stream-src', k) } catch { /* private mode */ } }
  const srcCounts = { personal: available.filter(it => it.locked).length }
  srcCounts.store = available.length - srcCounts.personal
  const shown = !hasStore || src === 'all' ? available
    : available.filter(it => src === 'personal' ? it.locked : !it.locked)
  // The units a viewer could ever ask for: not queued (those get consumed at go-live), not
  // locked, not promised to a regular. This is the shelf you're choosing from below.
  const offerable = available.filter(it => !it.locked && !it._heldFor)
  const reserved = available.length - offerable.length // locked / held-for-a-regular
  const toggleOrderUid = (uid) => setOrderUids(prev => {
    const next = new Set(prev)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    return next
  })
  // Only ever offer units that are still offerable (you might have queued one after ticking it).
  const offerUids = [...orderUids].filter(uid => offerable.some(it => it.uid === uid))
  const orderPolicy = { sealed: orderMode, uids: offerUids, packs: allowPacks }
  const openCount = orderMode === 'all' ? offerable.length : orderMode === 'picked' ? offerUids.length : 0
  // Could ANY order actually arrive tonight? Sealed rips need the upgrade AND something open;
  // pack orders need a built pack on the stream channel AND tonight's toggle on.
  const canTakeSealed = hasRipService && openCount > 0
  const canTakePacks = allowPacks && streamPacks > 0
  useEffect(() => {
    if (!shown.find(it => it.uid === pick)) setPick(shown[0]?.uid || null)
  }, [shown, pick])

  function addToQueue() {
    const it = available.find(x => x.uid === pick)
    if (!it) return
    setQueue(q => [...q, { invUid: it.uid, setId: it.setId, product: it.product, brk: { on: false, spots: 4 } }])
  }
  function removeFromQueue(uid) { setQueue(q => q.filter(e => e.invUid !== uid)) }
  function patchBreak(uid, patch) {
    setQueue(q => q.map(e => e.invUid === uid ? { ...e, brk: { ...e.brk, ...patch } } : e))
  }

  const fresh = fatigueMult(fatigue)
  // The room drifts toward the biggest-draw product in the queue (a vintage box later
  // shouldn't cap the crowd at a $5 pack's draw).
  const draw = queue.length ? Math.max(...queue.map(e => streamDrawMult(setById(e.setId) || SHOP_SETS[0], e.product))) : 1
  const expected = Math.round(baseViewers(notoriety, fresh, followers) * draw)
  const totalPacks = queue.reduce((a, e) => a + e.product.packs, 0)
  // Dead air: nothing queued AND nothing a viewer could possibly order. Going live on that
  // would burn a game-day watching an empty table.
  const deadAir = queue.length === 0 && !canTakeSealed && !canTakePacks

  // Going live with NOTHING queued is allowed — that's a "taking orders" show: you sit on air
  // with your inventory behind you and only crack what viewers actually pay you to crack (rip
  // orders + mystery-pack orders). It's the low-risk way to stream: you never open product on
  // spec, so every pack you rip is already sold.
  function go() {
    primeAudio() // this click is our chance to start audio under the browser's autoplay policy
    const sessionQueue = []
    const escrowEntries = [] // store-side session record — survives reload/unmount
    for (const row of queue) {
      // Consume the held product from inventory — no charge, you already paid when you bought it.
      const it = ripSealedAction(row.invUid)
      if (!it) continue // vanished between building the queue and going live — skip it
      const set = setById(row.setId) || SHOP_SETS[0]
      const product = row.product
      const canBreak = product.packs >= 2 && row.brk.on
      let isBreak = false, spots = 0, spotsSold = 0, perSpot = 0, spotGross = 0, owners = []
      if (canBreak) {
        isBreak = true
        spots = row.brk.spots
        perSpot = spotPrice(product.price, spots, notoriety)
        spotsSold = spotsFilled(spots, notoriety)
        spotGross = Math.round(spotsSold * perSpot * 100) / 100
        owners = buildSpotOwners(spots)
        if (spotGross > 0) collectBreakSpots(spotGross) // buyers pre-pay their spots
      }
      useGame.getState().log('stream', `Broke a held ${product.type} (${set.name}) on stream`, 0)
      sessionQueue.push({ invUid: row.invUid, set, product, isBreak, spots, spotsSold, filled: spotsSold, perSpot, spotGross, owners, orderedBy: null })
      escrowEntries.push({ invUid: row.invUid, item: it, packs: product.packs, packsDone: 0, spotGross })
    }
    // Only a bug if you queued something and it ALL vanished; an intentionally empty queue is
    // a valid orders-only show.
    if (queue.length && !sessionQueue.length) return toast('Nothing left to stream — your queued product is gone.')
    useGame.getState().startStreamEscrow(escrowEntries)
    onGoLive({ queue: sessionQueue, orderPolicy })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="banner" style={{ marginTop: 16 }}>
        🔴 <b>Go live & rip on camera.</b> Queue up <b>as many held products as you like</b> and rip them
        back-to-back — viewers tune in, react to your pulls, and tip. A hot stream banks a notoriety jump and
        pumps your store's traffic for days — but it <b>burns a game-day</b>, and streaming often <b>tires your
        audience</b> (rest a few days to recover).
        {streamStats?.streams ? <span className="muted"> · {streamStats.streams} stream{streamStats.streams>1?'s':''} · peak {streamStats.peakViewers} · {fmtMoney(streamStats.tips)} tipped lifetime{streamStats.ripOrders ? ` · ${streamStats.ripOrders} rip orders filled` : ''}</span> : null}
        {followers > 0 && <span className="pill" style={{ marginLeft: 8, background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>👥 {followers.toLocaleString()} followers</span>}
        {streamPacks > 0 && <span className="pill" style={{ marginLeft: 8, background: '#ffcb0522', color: 'var(--gold)' }}
          title="Built mystery packs with the 🔴 Stream channel on — viewers order them mid-stream and you rip them on camera">
          🎁 {streamPacks} mystery pack{streamPacks > 1 ? 's' : ''} ready for live orders</span>}
      </div>

      {/* No sealed AND no stream-channel mystery packs = genuinely nothing to broadcast. With
          packs but no sealed you can still go live and take pack orders, so don't dead-end. */}
      {inventory.length === 0 && streamPacks === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          📦 You have no sealed product to break. Streams rip from your <b>held inventory</b> only —
          <b> buy sealed on the Buy tab</b> (or source it at a show), then come back and queue it up live.
          <br /><span className="muted" style={{ fontSize: 12.5 }}>You can also go live with nothing but <b>mystery packs</b> — build a pack line with the 🔴 Stream channel on (Sell → ❓ Packs) and viewers will order them on air.</span>
        </div>
      ) : (
        <>
          {inventory.length > 0 && (
          <div className="market-panel" style={{ marginTop: 14 }}>
            <div className="market-head">🎬 Build your rip queue <span className="muted">— from your 📦 inventory</span></div>
            {hasStore && (
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'personal', label: `🔒 Personal (${srcCounts.personal})`, hint: 'Only your kept sealed — the stash you 🔒 set aside for yourself.' },
                  { key: 'store',    label: `🏬 Store stock (${srcCounts.store})`, hint: 'Sealed on the sales floor or in the storeroom.' },
                  { key: 'all',      label: `📦 Everything (${available.length})`, hint: 'All held sealed, wherever it lives.' },
                ].map(o => (
                  <button key={o.key} className={`subtab ${src === o.key ? 'active' : ''}`} title={o.hint}
                    onClick={() => pickSrc(o.key)}>{o.label}</button>
                ))}
              </div>
            )}
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <select value={pick || ''} onChange={e => setPick(e.target.value)} disabled={!shown.length} style={{ flex: 1, minWidth: 220 }}>
                {shown.length === 0
                  ? <option value="">{available.length === 0 ? "— everything's queued —"
                      : src === 'personal' ? '— no 🔒 kept sealed — Keep some from your Store stock —'
                      : '— no store sealed — check 🔒 Personal —'}</option>
                  : shown.map(it => {
                    const s = setById(it.setId)
                    const tag = it.vintage ? '🗝️ ' : s?.secondary ? '🕰️ ' : ''
                    return <option key={it.uid} value={it.uid}>{tag}{it.product.icon || '📦'} {s?.name} {it.product.type} · {it.product.packs} pk</option>
                  })}
              </select>
              <button className="btn" disabled={!pick} onClick={addToQueue}>➕ Add to queue</button>
            </div>
          </div>
          )}

          {queue.length > 0 && (
            <div className="market-panel" style={{ marginTop: 12 }}>
              <div className="market-head">📋 Tonight's queue <span className="muted">— {queue.length} product{queue.length>1?'s':''} · {totalPacks} pack{totalPacks>1?'s':''}, ripped back-to-back</span></div>
              <div className="stream-queue">
                {queue.map((row, i) => {
                  const s = setById(row.setId)
                  const canBreak = row.product.packs >= 2
                  const per = canBreak ? spotPrice(row.product.price, row.brk.spots, notoriety) : 0
                  return (
                    <div key={row.invUid} className="stream-queue-row">
                      <div className="sq-main">
                        <span className="sq-idx">{i + 1}</span>
                        <span className="sq-name">{row.product.icon || '📦'} {s?.name}{row.vintage ? ' 🗝️' : ''} {row.product.type}</span>
                        <span className="muted sq-pk">{row.product.packs} pk</span>
                        <button className="sq-x" title="Remove from queue" onClick={() => removeFromQueue(row.invUid)}>✕</button>
                      </div>
                      {canBreak && (
                        <div className="sq-break">
                          <label className="tweet-toggle" style={{ fontSize: 13 }}>
                            <input type="checkbox" checked={row.brk.on} onChange={e => patchBreak(row.invUid, { on: e.target.checked })} />
                            📦 <b>Box break</b> <span className="muted">— sell spots up front</span>
                          </label>
                          {row.brk.on && (
                            <div className="list-pct-row" style={{ marginTop: 6 }}>
                              <span className="muted" style={{ fontSize: 12 }}>Spots</span>
                              {[2, 4, 6, 8].map(n => (
                                <button key={n} className={`pctbtn ${row.brk.spots === n ? 'on' : ''}`} onClick={() => patchBreak(row.invUid, { spots: n })}>{n}</button>
                              ))}
                              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{fmtMoney(per)}/spot · all sell ⇒ <b style={{ color:'var(--green)' }}>{fmtMoney(per * row.brk.spots)}</b></span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* WHAT YOU'LL SELL TONIGHT. Viewers can only ever ask for something you actually hold
              AND opened up here — never a 🔒 locked unit, never one promised to a regular. */}
          <div className="market-panel" style={{ marginTop: 12 }}>
            <div className="market-head">
              🎟️ Open for orders <span className="muted">— what viewers may ask you to rip tonight</span>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'all',    label: '📦 Everything I hold', hint: 'Any sealed unit in your case is fair game.' },
                { key: 'picked', label: '✅ Only what I pick',   hint: 'Tick the exact units you\'re willing to part with.' },
                { key: 'none',   label: '🚫 Nothing',            hint: 'Take no rip orders — you\'ll only rip your own queue.' },
              ].map(o => (
                <button key={o.key} className={`subtab ${orderMode === o.key ? 'active' : ''}`}
                  title={o.hint} onClick={() => setOrderMode(o.key)}>{o.label}</button>
              ))}
            </div>

            {!hasRipService && orderMode !== 'none' && (
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                ⚠️ Viewers can't order your <b>sealed</b> without the 🎟️ <b>Live Rip Service</b> upgrade — until you own it,
                this only governs your mystery packs.
              </p>
            )}

            {orderMode === 'picked' && (
              offerable.length === 0
                ? <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Nothing available to offer — it's all queued, locked, or held for a regular.</p>
                : <div className="stream-offer-grid" style={{ marginTop: 8 }}>
                    {offerable.map(it => {
                      const s = setById(it.setId)
                      const on = orderUids.has(it.uid)
                      return (
                        <label key={it.uid} className={`tweet-toggle ${on ? 'on' : ''}`} style={{ fontSize: 12.5 }}>
                          <input type="checkbox" checked={on} onChange={() => toggleOrderUid(it.uid)} />
                          {it.vintage ? '🗝️ ' : ''}{it.product.icon || '📦'} {s?.name} {it.product.type}
                          <span className="muted"> · {fmtMoney(ripOrderPrice(it.product, notoriety, s))}</span>
                        </label>
                      )
                    })}
                  </div>
            )}

            <div className="row" style={{ gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="tweet-toggle" style={{ fontSize: 13 }}
                title="Your built mystery packs with the 🔴 Stream channel on. Turn this off to take no pack orders tonight without changing the pack line itself.">
                <input type="checkbox" checked={allowPacks} onChange={e => setAllowPacks(e.target.checked)} />
                🎁 Sell my mystery packs on this stream{streamPacks > 0 ? ` (${streamPacks} ready)` : ''}
              </label>
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                {openCount > 0
                  ? <>Viewers can order <b>{openCount}</b> sealed unit{openCount === 1 ? '' : 's'}</>
                  : <>No sealed open for orders</>}
                {reserved > 0 && <> · <b>{reserved}</b> held back (🔒 locked or promised to a regular)</>}
              </span>
            </div>
          </div>

          <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
            {/* An empty queue is a valid show — you go on air and rip only what viewers buy. But
                an empty queue with nothing ORDERABLE either is just dead air: no queue, no rip
                orders (or no upgrade to take them), no packs. Don't let it burn a game-day. */}
            <button className="btn gold" style={{ maxWidth: 340 }} disabled={deadAir} onClick={go}
              title={deadAir ? "Nothing to rip and nothing viewers could order — you'd burn a day on dead air." : ''}>
              {queue.length
                ? <>🔴 Go live — rip {queue.length} product{queue.length !== 1 ? 's' : ''} ({totalPacks} pk)</>
                : <>🔴 Go live — take orders only</>}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {deadAir
              ? <span style={{ color: 'var(--red)' }}>Nothing queued and nothing viewers could order — queue a product, open some sealed for orders{!hasRipService && ' (needs the 🎟️ Live Rip Service)'}, or put a mystery pack line on the 🔴 Stream channel.</span>
              : queue.length === 0
              ? <>Nothing queued — you'll go on air with an empty table and rip only what viewers <b>order</b>. Nothing gets opened on spec.
                  {' '}Expecting ~{expected.toLocaleString()} viewers.
                  {fresh < 0.99 && <span style={{ color: 'var(--gold)' }}> · audience {Math.round(fresh*100)}% fresh</span>}</>
              : <>Expecting ~{expected.toLocaleString()} viewers
                {fresh < 0.99 && <span style={{ color: 'var(--gold)' }}> · audience {Math.round(fresh*100)}% fresh (you've streamed recently — rest to recover)</span>}
                {isFlop(expected) && <span style={{ color: 'var(--red)' }}> · ⚠️ risky — barely anyone may show (a flop dings rep)</span>}
                {' · costs 1 game-day'}</>}
          </p>
        </>
      )}
    </div>
  )
}

// --- Live --------------------------------------------------------------------
// Rips through session.queue back-to-back. Session-wide stats (viewers, tips, hits, hype,
// followers) accumulate across every product; per-entry state (which pack, this box's break
// spots) resets as each product finishes. With the Live Rip Service upgrade, viewers place
// RIP ORDERS mid-stream — accepting pre-pays cash, consumes a held product, and appends it to
// the queue as a fully-owed single-owner "break" (every card ships to that buyer).
function LiveStage({ session, notoriety, fatigue, onEnd }) {
  const addPulls = useGame(s => s.addPulls)
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const followers = useGame(s => s.followers || 0)
  const regulars = useGame(s => s.regulars)
  const collection = useGame(s => s.collection)
  const giveawayCard = useGame(s => s.giveawayCard)
  // Live Rip Service upgrade + its plumbing.
  const hasRipService = useGame(s => !!s.upgrades.ripService)
  const collectRipOrder = useGame(s => s.collectRipOrder)
  const ripSealedAction = useGame(s => s.ripSealed)
  const speed = Math.max(0.25, ripSpeed)
  const ms = (n) => n / speed

  // Keep the SFX module in sync with the player's sound/haptics settings.
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])

  // The rip queue is mutable (rip orders append to it). queueRef is the source of truth for
  // timer callbacks; queueVer forces re-render when it changes (append / a spot fills).
  const queueRef = useRef(session.queue.map(e => ({ ...e })))
  const [queueVer, setQueueVer] = useState(0)
  const bumpQueue = () => setQueueVer(v => v + 1)

  // The room drifts toward the biggest-draw product's settled viewer count. An orders-only
  // show starts with an empty queue, so guard the Math.max — on an empty array it returns
  // -Infinity and the whole viewer count goes NaN. Draw 1 = no product bonus, just your name.
  const draw = queueRef.current.length
    ? Math.max(...queueRef.current.map(e => streamDrawMult(e.set, e.product)))
    : 1
  const settled = Math.round(baseViewers(notoriety, fatigueMult(fatigue), followers) * draw)

  const [entryIdx, setEntryIdx] = useState(0)
  const [packNo, setPackNo] = useState(0)
  const [phase, setPhase] = useState('idle')        // idle | revealing | packdone
  const [pulls, setPulls] = useState([])
  const [shown, setShown] = useState(0)
  const [current, setCurrent] = useState(null)
  const [isGod, setIsGod] = useState(false)
  const [isDemigod, setIsDemigod] = useState(false)
  const [burst, setBurst] = useState(false)
  const [viewers, setViewers] = useState(settled)
  const [chat, setChat] = useState(() => seedChat())
  const [hits, setHits] = useState([])
  const [tips, setTips] = useState(0)
  const [hypeMoments, setHypeMoments] = useState(0)
  const [liveSpotFlash, setLiveSpotFlash] = useState(null)
  // What you agreed to sell tonight (set on the go-live screen). Frozen for the session — a
  // viewer can't start asking for something you never put on the table. Old saves / a resumed
  // session with no policy default to "everything", which is the pre-existing behaviour.
  const policy = session.orderPolicy || { sealed: 'all', uids: [], packs: true }

  // `done` = nothing left in the queue to rip. It does NOT mean the stream is over — you stay
  // on air, and viewers keep ordering. An orders-only show starts out done (empty table) and
  // flips back to live-ripping the moment you accept an order.
  const [done, setDone] = useState(session.queue.length === 0)
  // Hype train (consecutive hits stack a tip multiplier) + a live combo counter.
  const [hypeLevel, setHypeLevel] = useState(0)
  const [combo, setCombo] = useState(0)
  // Followers earned THIS session (giveaway + goal bonuses) — the base performance gain is
  // added at cash-out. Kept in the component so the store's follower count moves exactly once.
  const [sessionFollowers, setSessionFollowers] = useState(0)
  const [giveawayOpen, setGiveawayOpen] = useState(false) // the "pick a card to give away" picker
  const [giveaways, setGiveaways] = useState(0)            // how many you've raffled this stream
  const [goal] = useState(() => pickStreamGoal(biggestProduct(session.queue)))
  const [goalMet, setGoalMet] = useState(false)
  const [orders, setOrders] = useState([])                 // pending live rip orders (upgrade only)

  const peakRef = useRef(settled)
  const viewersRef = useRef(settled) // live viewer count for tips (peakRef is monotonic — see below)
  const godBumpedRef = useRef(false) // has THIS pack's god/demigod room-explosion already fired?
  const chatBoxRef = useRef(null)
  const finishedRef = useRef(false)
  const autoRef = useRef(false)
  const idxRef = useRef(0)           // mirror of entryIdx, readable inside timer callbacks
  const packRef = useRef(0)          // mirror of packNo
  const phaseRef = useRef('idle')    // mirror of phase
  const doneRef = useRef(session.queue.length === 0) // mirror of done
  const hypeRef = useRef(0)          // mirror of hypeLevel readable inside timer callbacks
  const entryDoneRef = useRef(new Set()) // entry indices whose promo has been minted (idempotent)
  const regularsRef = useRef([])     // live online-regular roster for chat attribution
  // every card pulled, tagged with its entry + break spot (for shipping at the end)
  const allPulled = useRef([])       // { card, spot, entryIdx }  (spot only set for break/order entries)
  regularsRef.current = (regulars || []).filter(r => !r.flags?.burned)

  // Synced setters: keep the ref mirror and the render state in lockstep so timer callbacks
  // (which close over stale state) always read the live value from the ref.
  const setIdxX = (i) => { idxRef.current = i; setEntryIdx(i) }
  const setPhaseX = (p) => { phaseRef.current = p; setPhase(p) }
  const setDoneX = (v) => { doneRef.current = v; setDone(v) }
  const curEntry = () => queueRef.current[idxRef.current]

  // Every reveal/burst/tip timer is tracked here so we can cancel the whole chain when the
  // stream ends early or the component unmounts — otherwise an in-flight revealNext keeps
  // running setState and could fire onEntryComplete (minting a promo) AFTER cashout.
  const timersRef = useRef([])
  const after = (fn, delay) => {
    const id = setTimeout(() => { timersRef.current = timersRef.current.filter(t => t !== id); fn() }, delay)
    timersRef.current.push(id)
    return id
  }
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }, [])

  const pushChat = useCallback((line) => {
    let l = line
    // Sometimes a real online REGULAR (from your customer roster) is the one chatting —
    // ties the stream into your loyalty loop. Only reattributes ordinary reaction lines.
    if (l && !l.tip && l.handle !== 'system') {
      const roster = regularsRef.current
      if (roster.length && Math.random() < 0.3) {
        const r = roster[Math.floor(Math.random() * roster.length)]
        l = { ...l, handle: r.name, regular: true, emoji: r.emoji }
      }
    }
    setChat(c => [...c.slice(-40), { ...l, id: `${Date.now()}-${Math.random()}` }])
  }, [])

  // ambient chat + viewer drift toward settled. Depend on `speed` (a number), NOT `ms` —
  // `ms` is re-created every render, which would tear down and recreate this interval on
  // every reveal tick, resetting the 1600ms timer before it can fire.
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() < 0.7) pushChat(chatLine('ambient'))
      setViewers(v => {
        const drift = Math.round((settled - v) * 0.08)
        const jitter = Math.round((Math.random() - 0.45) * Math.max(2, v * 0.04))
        const next = Math.max(1, v + drift + jitter)
        peakRef.current = Math.max(peakRef.current, next); viewersRef.current = next; return next
      })
    }, 1600 / speed)
    return () => clearInterval(id)
  }, [settled, speed, pushChat])

  useEffect(() => { const el = chatBoxRef.current; if (el) el.scrollTop = el.scrollHeight }, [chat])

  // Live orders while you're on air. Two kinds share the order box:
  //   🎁 PACK orders — viewers buy one of your built MYSTERY PACKS (stream channel on) and
  //      you rip it on camera; no upgrade needed, it's your own product.
  //   🎟️ RIP orders — viewers pay a premium to have you crack a product you hold (needs the
  //      Live Rip Service upgrade). Frequency scales with the crowd.
  useEffect(() => {
    const id = setInterval(() => {
      // NOT gated on `done`. An empty queue means "nothing of MINE left to crack" — the room is
      // still there and still buying, and an orders-only show has an empty queue by definition.
      // Gating this on `done` was what made a take-orders stream impossible: the instant you ran
      // dry, the orders dried up too and your only move was to end the broadcast.
      if (finishedRef.current) return
      setOrders(prev => {
        if (prev.length >= 3) return prev
        const g = useGame.getState()
        const pendingUids = new Set(prev.map(o => o.invUid || o.packUid))
        // Viewers can only ask for what you ACTUALLY hold and are willing to part with tonight:
        // never a 🔒 locked unit, never one promised to a regular, and never one you didn't open
        // up in the setup screen. (Re-read from the live store each tick, so a unit that gets
        // locked or reserved mid-stream stops being orderable immediately.)
        const packsOut = policy.packs === false ? []
          : (g.packsForChannel?.('stream') || []).filter(p => !pendingUids.has(p.uid))
        const held = hasRipService ? orderableSealed(g.sealedInventory, policy, pendingUids) : []
        if (!packsOut.length && !held.length) return prev
        const chance = Math.min(0.6, 0.12 + peakRef.current / 4000) // bigger room ⇒ more orders
        if (Math.random() > chance) return prev
        const wantPack = packsOut.length && (!held.length || Math.random() < 0.45)
        if (wantPack) {
          const pack = packsOut[Math.floor(Math.random() * packsOut.length)]
          const tier = (g.packTiers || []).find(t => t.id === pack.tierId)
          if (!tier) return prev
          // Pricier packs need rep + fame to move, even to a hyped room.
          if (Math.random() > Math.max(0.08, packSaleChance(tier.price, notoriety, g.packRep ?? 50, 'store', true) * 2.2)) return prev
          const buyer = randomChatHandle()
          pushChat({ handle: buyer, text: `drop me a ${tier.icon} ${tier.name}!! paying ${fmtMoney(tier.price)}` })
          return [...prev, { id: `po-${pack.uid}-${Math.floor(Math.random() * 1e9)}`, kind: 'pack',
            packUid: pack.uid, buyer, price: tier.price, product: { icon: tier.icon, type: tier.name } }]
        }
        const order = rollRipOrder(held, notoriety, setById)
        if (!order) return prev
        pushChat({ handle: order.buyer, text: `yo can you rip my ${order.product.type}? 🎟️ paying ${fmtMoney(order.price)}` })
        return [...prev, order]
      })
    }, 5200 / speed)
    return () => clearInterval(id)
  }, [hasRipService, speed, notoriety, pushChat])

  // auto-advance between packs / into the next product when the setting is on
  useEffect(() => {
    if (!autoAdvance || done) return
    const entry = queueRef.current[entryIdx]
    const totalPacks = entry ? entry.product.packs : 0
    if (phase === 'packdone' && packNo < totalPacks) {
      const t = setTimeout(() => ripPack(), ms(1400)); return () => clearTimeout(t)
    }
    if (phase === 'packdone' && packNo >= totalPacks && entryIdx < queueRef.current.length - 1) {
      const t = setTimeout(() => goNextEntry(), ms(1400)); return () => clearTimeout(t)
    }
    if (phase === 'idle' && packNo === 0 && entryIdx === 0 && !autoRef.current) {
      autoRef.current = true
      const t = setTimeout(() => ripPack(), ms(700)); return () => clearTimeout(t)
    }
  }, [phase, packNo, entryIdx, autoAdvance, done]) // eslint-disable-line

  const entry = queueRef.current[entryIdx]           // current product being ripped (render)
  const totalPacks = entry ? entry.product.packs : 0
  const hasNextEntry = entryIdx < queueRef.current.length - 1
  const canRipPack = (phase === 'idle' || phase === 'packdone') && !done && packNo < totalPacks
  const atEntryEnd = phase === 'packdone' && packNo >= totalPacks && !done && hasNextEntry

  function ripPack() {
    if (phaseRef.current === 'revealing' || doneRef.current) return
    const e = curEntry()
    if (!e || packRef.current >= e.product.packs) return
    // A mystery-pack rip reveals the PRE-SEALED contents — they were sold and already left
    // your stock (sellBuiltPack), so no pulls are added; every card ships to the buyer.
    const cards = e.packRip ? [...e.packCards] : openPack(e.set)
    preloadCardImages(cards) // warm the CDN cache so the live reveal doesn't lag on slow images
    cards.forEach(c => { c._isHit = isHit(c) })
    const god = !e.packRip && !!cards._god
    const demigod = !e.packRip && !!cards._demigod
    if (god) cards.forEach(c => { c._fromGod = true })
    if (demigod) cards.forEach(c => { c._fromDemigod = true })
    godBumpedRef.current = false // fresh pack — its god/demigod explosion hasn't fired yet
    if (!e.packRip) {
      addPulls(cards, `🔴 ${e.set.name} (live)`)
      useGame.getState().escrowPackRipped(e.invUid) // session record: this pack is cracked
    }
    const idx = idxRef.current
    if (e.isBreak) {
      const startIdx = allPulled.current.filter(p => p.entryIdx === idx).length
      cards.forEach((c, i) => allPulled.current.push({ card: c, spot: (startIdx + i) % e.spots, entryIdx: idx }))
    } else {
      cards.forEach(c => allPulled.current.push({ card: c, spot: null, entryIdx: idx }))
    }
    setIsGod(god); setIsDemigod(demigod); setPulls(cards); setShown(0); setCurrent(null); setPhaseX('revealing')
    after(() => revealNext(cards, 0), ms(god ? 1100 : 500))
  }

  function revealNext(cards, i) {
    if (finishedRef.current) return // stream ended early — stop the chain (don't mint a post-cashout promo)
    if (i >= cards.length) {
      if (cards._god) { setBurst(true); sfxGod(); after(() => setBurst(false), ms(2500)) }
      else if (cards._demigod) { setBurst(true); sfxGod(); after(() => setBurst(false), ms(1500)) }
      const tp = curEntry().product.packs
      setPackNo(n => { const np = n + 1; packRef.current = np; if (np >= tp) onEntryComplete(); return np })
      setPhaseX('packdone'); return
    }
    setShown(i + 1)
    const c = cards[i]; setCurrent(c)
    const kind = reactionKind(c)
    const special = c._isHit || c.foil
    // Hype train: a hit/hype pull stacks the combo & climbs the train (god/hype jump it
    // faster); a dead common cools it one notch. The live train level multiplies tips.
    const good = kind === 'hit' || kind === 'hype' || kind === 'god' || kind === 'demigod'
    if (good) {
      setCombo(x => x + 1)
      const step = kind === 'god' ? 3 : (kind === 'hype' || kind === 'demigod') ? 2 : 1
      hypeRef.current = Math.min(HYPE_TRAIN_MAX, hypeRef.current + step)
    } else {
      setCombo(0)
      hypeRef.current = Math.max(0, hypeRef.current - 1)
    }
    setHypeLevel(hypeRef.current)
    const hypeMult = hypeTrainMult(hypeRef.current)
    // Viewer reaction: apply a god/demigod pack's "room explodes" bump ONCE (first flagged
    // card of the pack); the rest react by their real rarity. Without this, all 10 top-rarity
    // cards compounded a 1.6-2.1× multiply — ~110×+ viewers per god pack, cascading into
    // quadratic tips. Live viewers are also clamped to 8× the settled room so no single
    // moment can run away.
    const isGodCard = c._fromGod || c._fromDemigod
    const ignoreGod = isGodCard && godBumpedRef.current
    if (isGodCard && !godBumpedRef.current) godBumpedRef.current = true
    const reaction = viewerReaction(c, Math.random, ignoreGod)
    setViewers(v => {
      const next = Math.max(1, Math.min(Math.round(settled * 8), Math.round(v * reaction)))
      peakRef.current = Math.max(peakRef.current, next)
      viewersRef.current = next
      return next
    })
    // Sound: rarer cards ring higher; chase-tier adds a shimmer (mirrors PackOpening).
    if (special) sfxHit(rarityRank(c.rarity) - HIT_THRESHOLD, kind === 'hype' || kind === 'god')
    pushChat(chatLine(kind, Math.random, c))
    if (kind === 'hype' || kind === 'god') {
      setHypeMoments(m => m + 1)
      setBurst(true); after(() => setBurst(false), ms(1400))
      for (let k = 0; k < (kind === 'god' ? 4 : 2); k++) after(() => pushChat(chatLine(kind, Math.random, c)), ms(120 * (k + 1)))
      // a hot pull can sell a lingering break spot to a hyped viewer
      maybeSellLiveSpot(c)
    }
    if (special) setHits(h => [c, ...h])
    const t = tipsFor(c, viewersRef.current, Math.random, hypeMult) // tips scale with the LIVE room, not the all-time peak
    if (t > 0) { setTips(x => Math.round((x + t) * 100) / 100); if (t >= 3 || kind === 'hype' || kind === 'god') after(() => pushChat(chatLine('tip')), ms(200)) }
    const delay = special ? 900 : 360
    after(() => revealNext(cards, i + 1), ms(delay))
  }

  // The current product's last pack just finished. Mint its guaranteed promo (once), and if it
  // was the LAST product in the queue, mark the stream done. Otherwise the player rips the next
  // product (button, or the auto-advance effect).
  function onEntryComplete() {
    const idx = idxRef.current
    if (entryDoneRef.current.has(idx)) return // idempotent (setPackNo updater can double-run)
    entryDoneRef.current.add(idx)
    const e = curEntry()
    // A mystery-pack rip has no promo (it's a repack, not sealed product) and the whole
    // queue may still be open — just check for the end.
    const promo = e.packRip ? null : makeProductPromo(e.set, e.product || { bonus: null })
    if (promo) {
      promo._isHit = isHit(promo)
      addPulls([promo], `🔴 ${e.set.name} promo (live)`, 0)
      const startIdx = allPulled.current.filter(p => p.entryIdx === idx).length
      allPulled.current.push({ card: promo, spot: e.isBreak ? startIdx % e.spots : null, entryIdx: idx })
      if (promo._isHit || promo.foil) setHits(h => [promo, ...h])
      pushChat(chatLine(reactionKind(promo), Math.random, promo))
    }
    if (idx >= queueRef.current.length - 1) setDoneX(true) // whole queue finished
  }

  // An accepted order just landed on the queue — start ripping it. Two cases:
  //   • the table was BARE (orders-only show, or you'd already cashed the queue out): the new
  //     entry IS entry 0, so rip where we stand. goNextEntry() would hunt for idx+1 and find
  //     nothing, leaving you on air staring at a product you'd already been paid for.
  //   • the queue had merely wrapped: flow into the next entry as usual.
  function startAppendedEntry(wasEmpty) {
    if (finishedRef.current) return
    if (!wasEmpty) { if (doneRef.current) goNextEntry(); return }
    setIdxX(0)
    packRef.current = 0; setPackNo(0)
    setPulls([]); setShown(0); setCurrent(null); setIsGod(false); setIsDemigod(false)
    setPhaseX('idle')
    setDoneX(false) // ripPack() refuses while done — re-open the room first
    after(() => ripPack(), ms(300))
  }

  // Move to the next queued product and start ripping it (keeps the broadcast continuous).
  function goNextEntry() {
    if (finishedRef.current) return
    const next = idxRef.current + 1
    if (next >= queueRef.current.length) return
    setIdxX(next)
    packRef.current = 0; setPackNo(0)
    setPulls([]); setShown(0); setCurrent(null); setIsGod(false); setIsDemigod(false)
    setPhaseX('idle')
    if (doneRef.current) setDoneX(false) // an accepted rip order re-opened the queue
    after(() => ripPack(), ms(300))
  }

  // On a hype pull, viewers may scramble for a still-open break spot (not for rip orders —
  // those are a single fully-owed spot).
  function maybeSellLiveSpot(card) {
    const e = curEntry()
    if (!e || !e.isBreak || e.orderedBy) return
    if (e.filled >= e.spots) return
    const chance = (card._fromGod ? 0.9 : 0.5) * (0.5 + Math.min(0.5, notoriety / 200))
    if (Math.random() < chance) {
      e.filled += 1
      useGame.getState().sellLiveSpot(e.perSpot)
      useGame.getState().escrowSpotCash(e.invUid, e.perSpot) // refundable if the session dies
      setLiveSpotFlash({ id: Date.now() })
      after(() => setLiveSpotFlash(null), 2200)
      pushChat({ handle: 'system', text: `someone grabbed an open spot! 📦 (+${fmtMoney(e.perSpot)})`, tip: true })
      bumpQueue()
    }
  }

  // Accept a live rip order: the buyer pre-pays now, the held product is consumed, and it's
  // appended to the queue as a fully-owed single-owner break (all its cards ship to them).
  // A PACK order sells one of your built mystery packs the same way — the sale (cash, rep
  // swing, log) settles now via sellBuiltPack, and the contents get ripped on camera next.
  function acceptOrder(order) {
    // Accepting while `done` is the WHOLE POINT of an orders-only show — the queue being empty
    // is exactly when you want to take work. Only a finished (cashed-out) stream refuses.
    if (finishedRef.current) return
    // Was the table bare? Then this order is the first thing of the night and starts at entry 0
    // — goNextEntry() would look for idx+1 and find nothing.
    const wasEmpty = queueRef.current.length === 0
    if (order.kind === 'pack') {
      const r = useGame.getState().sellBuiltPack(order.packUid, { channel: 'stream', buyer: order.buyer })
      if (!r) { setOrders(o => o.filter(x => x.id !== order.id)); return toast('That pack is already gone.') }
      // Contents become the on-camera reveal: real cards + any sealed inside (card-shaped for display).
      const revealCards = [...(r.pack.cards || []), ...(r.pack.sealed || []).map(sealedCard)]
      queueRef.current = [...queueRef.current, {
        set: { id: null, name: r.tier.name, logo: null }, // pseudo-set: the tier IS the product
        product: { type: r.tier.name, icon: r.tier.icon, packs: 1, price: round2(r.value) }, // price = contents value, so the Net readout stays honest (sale − what shipped out)
        isBreak: true, spots: 1, spotsSold: 1, filled: 1, perSpot: r.gross, spotGross: r.gross,
        owners: [order.buyer], orderedBy: order.buyer, packRip: true, packCards: revealCards,
      }]
      setOrders(o => o.filter(x => x.id !== order.id))
      bumpQueue()
      pushChat({ handle: 'system', text: `✅ ${order.buyer} bought a ${r.tier.icon} ${r.tier.name} (${fmtMoney(r.gross)}) — ripping it live!`, tip: true })
      startAppendedEntry(wasEmpty)
      return
    }
    // Re-check the unit is still yours to give at the moment you ACCEPT — an order can sit in
    // the box while the thing it names gets locked, promised to a regular, or sold out from
    // under it. The roll filtered on this, but the roll happened seconds ago.
    const still = (useGame.getState().sealedInventory || []).find(x => x.uid === order.invUid)
    if (!still || still.locked || still._heldFor) {
      setOrders(o => o.filter(x => x.id !== order.id))
      return toast(still ? "That one's spoken for now — not yours to rip." : 'That product just left your inventory.')
    }
    const it = ripSealedAction(order.invUid)
    if (!it) { setOrders(o => o.filter(x => x.id !== order.id)); return toast('That product just left your inventory.') }
    collectRipOrder(order.price, order.buyer, order.product.type)
    useGame.getState().appendStreamEscrow({ invUid: order.invUid, item: it, packs: order.product.packs, packsDone: 0, spotGross: order.price })
    const set = setById(order.setId) || it.setId && setById(it.setId) || SHOP_SETS[0]
    queueRef.current = [...queueRef.current, {
      invUid: order.invUid, set, product: order.product, isBreak: true, spots: 1, spotsSold: 1, filled: 1,
      perSpot: order.price, spotGross: order.price, owners: [order.buyer], orderedBy: order.buyer,
    }]
    setOrders(o => o.filter(x => x.id !== order.id))
    bumpQueue()
    pushChat({ handle: 'system', text: `✅ accepted ${order.buyer}'s rip order — ${order.product.type} added to the queue`, tip: true })
    startAppendedEntry(wasEmpty)
  }
  function declineOrder(id) { setOrders(o => o.filter(x => x.id !== id)) }

  // Cards owed to a filled break spot / rip-order buyer (across every entry) can't be given
  // away — they ship at the end. Everything else you own is fair game for a raffle.
  const reservedUids = new Set(
    allPulled.current
      .filter(p => p.spot != null && p.spot < queueRef.current[p.entryIdx].filled)
      .map(p => p.card.uid)
  )

  // Raffle ANY card you own to a lucky viewer — a follower pop + chat frenzy. `uid` comes from
  // the giveaway picker.
  function runGiveaway(uid) {
    if (done || finishedRef.current) return
    const res = giveawayCard(uid, peakRef.current)
    if (!res) return toast('That card is no longer in your collection.')
    setGiveawayOpen(false)
    setGiveaways(n => n + 1)
    setSessionFollowers(f => f + res.followers)
    setBurst(true); after(() => setBurst(false), ms(1500))
    pushChat({ handle: 'system', text: `🎁 GIVEAWAY! ${res.card.name} goes to a lucky viewer — +${res.followers} followers`, tip: true })
    for (let k = 0; k < 3; k++) after(() => pushChat(chatLine('hype', Math.random, res.card)), ms(150 * (k + 1)))
  }

  // Watch the per-stream goal; reward followers the moment it's met.
  useEffect(() => {
    if (goalMet || !goal || finishedRef.current) return
    const met = goal.type === 'hits' ? hits.length >= goal.target
      : goal.type === 'chase' ? hits.some(h => isStreamHype(h))
      : goal.type === 'train' ? hypeLevel >= goal.target
      : false
    if (met) {
      setGoalMet(true)
      setSessionFollowers(f => f + goal.reward)
      pushChat({ handle: 'system', text: `🎯 Goal complete — ${goal.label}! +${goal.reward} followers`, tip: true })
    }
  }, [hits, hypeLevel, goal, goalMet, pushChat])

  // Instantly rip every remaining pack across ALL remaining queued products (no animation),
  // tallying viewers/tips/hits/spot-fills, then jump to the wrap-up. Only reachable via
  // endEarly() — a broadcast otherwise plays out pack by pack.
  function skipRest() {
    if (done || finishedRef.current) return
    let addedTips = 0, hype = 0
    const addedHits = []
    let v = peakRef.current
    for (let idx = idxRef.current; idx < queueRef.current.length; idx++) {
      const e = queueRef.current[idx]
      // packs already ripped in the CURRENT entry (later entries start fresh)
      const already = idx === idxRef.current ? (packRef.current + (phaseRef.current === 'revealing' ? 1 : 0)) : 0
      const remaining = Math.max(0, e.product.packs - already)
      for (let p = 0; p < remaining; p++) {
        // Mystery-pack rips reveal pre-sealed contents (already sold & shipped — no pulls added).
        const cards = e.packRip ? [...e.packCards] : openPack(e.set)
        cards.forEach(c => { c._isHit = isHit(c) })
        if (!e.packRip && cards._god) cards.forEach(c => { c._fromGod = true })
        if (!e.packRip && cards._demigod) cards.forEach(c => { c._fromDemigod = true })
        if (!e.packRip) addPulls(cards, `🔴 ${e.set.name} (live)`)
        let godBumped = false // one god/demigod room-explosion per pack (same as the live path)
        cards.forEach((c) => {
          const startIdx = allPulled.current.filter(pp => pp.entryIdx === idx).length
          allPulled.current.push({ card: c, spot: e.isBreak ? startIdx % e.spots : null, entryIdx: idx })
          const isGodCard = c._fromGod || c._fromDemigod
          const reaction = viewerReaction(c, Math.random, isGodCard && godBumped)
          if (isGodCard) godBumped = true
          v = Math.max(1, Math.min(Math.round(settled * 8), Math.round(v * reaction)))
          peakRef.current = Math.max(peakRef.current, v)
          const kind = reactionKind(c)
          if (kind === 'hype' || kind === 'god') {
            hype++
            if (e.isBreak && !e.orderedBy && e.filled < e.spots && Math.random() < (c._fromGod ? 0.9 : 0.5)) {
              e.filled++; useGame.getState().sellLiveSpot(e.perSpot)
            }
          }
          // keep the hype train rolling through the skip so its tip multiplier still applies
          const good = kind === 'hit' || kind === 'hype' || kind === 'god' || kind === 'demigod'
          hypeRef.current = good
            ? Math.min(HYPE_TRAIN_MAX, hypeRef.current + (kind === 'god' ? 3 : (kind === 'hype' || kind === 'demigod') ? 2 : 1))
            : Math.max(0, hypeRef.current - 1)
          addedTips += tipsFor(c, v, Math.random, hypeTrainMult(hypeRef.current)) // live count, not peak
          if (c._isHit || c.foil) addedHits.push(c)
        })
      }
      // mint this product's guaranteed promo (once) — repacks have none
      if (!entryDoneRef.current.has(idx)) {
        entryDoneRef.current.add(idx)
        const promo = e.packRip ? null : makeProductPromo(e.set, e.product || { bonus: null })
        if (promo) {
          promo._isHit = isHit(promo)
          addPulls([promo], `🔴 ${e.set.name} promo (live)`, 0)
          const startIdx = allPulled.current.filter(pp => pp.entryIdx === idx).length
          allPulled.current.push({ card: promo, spot: e.isBreak ? startIdx % e.spots : null, entryIdx: idx })
          if (promo._isHit || promo.foil) addedHits.push(promo)
        }
      }
    }
    if (addedTips) setTips(x => Math.round((x + addedTips) * 100) / 100)
    if (hype) setHypeMoments(m => m + hype)
    setHypeLevel(hypeRef.current)
    if (addedHits.length) setHits(h => [...addedHits.reverse(), ...h])
    setViewers(Math.round(v))
    const last = queueRef.current.length - 1
    setIdxX(last)
    packRef.current = queueRef.current[last].product.packs
    setPackNo(packRef.current)
    bumpQueue()
    useGame.getState().escrowAllRipped() // fast-forward: every escrowed pack is now cracked
    pushChat({ handle: 'system', text: 'ripped the rest off-stream ⏩', tip: false })
    setDoneX(true)
  }

  // End the stream before the queue is finished. Product must never evaporate: clean
  // unstarted entries go back to 📦 inventory; anything started — or with sold spots /
  // a paying order buyer — finishes off-stream via skipRest (which also ships what's
  // owed). The player then cashes out normally with the real totals.
  async function endEarly() {
    const idx = idxRef.current
    const returnable = queueRef.current.filter((e, i) =>
      i > idx && e.invUid && !e.orderedBy && !e.packRip && !(e.isBreak && e.filled > 0))
    const ok = await confirmDialog({
      title: 'End the stream early?',
      body: `${returnable.length ? `${returnable.length} unstarted product${returnable.length > 1 ? 's go' : ' goes'} back to your 📦 inventory unopened. ` : ''}Everything already started — plus any break or rip order someone paid into — finishes off-stream: those packs still rip and owed cards still ship. Then cash out.`,
      confirmText: 'End early',
      danger: true,
    })
    if (!ok) return
    if (returnable.length) {
      useGame.getState().returnStreamItems(returnable.map(e => e.invUid))
      const drop = new Set(returnable.map(e => e.invUid))
      queueRef.current = queueRef.current.filter(e => !drop.has(e.invUid))
      bumpQueue()
    }
    skipRest() // finish the remainder off-stream (ships owed cards), then cash out normally
  }

  function endStream() {
    if (finishedRef.current) return
    finishedRef.current = true
    timersRef.current.forEach(clearTimeout); timersRef.current = [] // kill any in-flight reveal chain
    const peak = Math.round(peakRef.current)
    const noto = streamNotoriety(peak, hypeMoments)
    // Followers earned: base performance (peak + hype moments) + this session's giveaway/goal
    // bonuses. A flop earns none of the base. The store applies the whole gain at once.
    const flopped = isFlop(peak)
    const followerGain = followersGained(peak, hypeMoments, flopped) + sessionFollowers
    // Ship every owed card (filled break spots + full rip orders) across all entries.
    const shipUids = allPulled.current
      .filter(p => p.spot != null && p.spot < queueRef.current[p.entryIdx].filled)
      .map(p => p.card.uid)
    const shipped = shipUids.length ? useGame.getState().shipBreakCards(shipUids) : 0
    const shipSet = new Set(shipUids)
    const keptHits = hits.filter(h => !shipSet.has(h.uid))
    useGame.getState().endStream({ tips, noto, peakViewers: peak, followers: followerGain })
    // A solid (non-flop) stream can win you a new online regular — streaming feeds the loyalty loop.
    if (!flopped && noto > 0) {
      const s0 = queueRef.current[0].set
      useGame.getState().formRegular({ channel: 'online', setId: s0.id, setName: s0.name, generous: hypeMoments > 0 })
    }
    const breakEntries = queueRef.current.filter(e => e.isBreak && !e.orderedBy)
    const orderEntries = queueRef.current.filter(e => e.orderedBy && !e.packRip)
    const packEntries = queueRef.current.filter(e => e.packRip)
    onEnd({
      peak, noto, tips, hits: keptHits,
      packsRipped: queueRef.current.reduce((a, e) => a + e.product.packs, 0),
      products: queueRef.current.length,
      isBreak: breakEntries.length > 0,
      spots: breakEntries.reduce((a, e) => a + e.spots, 0),
      spotsSold: breakEntries.reduce((a, e) => a + e.filled, 0),
      spotGross: Math.round(breakEntries.reduce((a, e) => a + e.filled * e.perSpot, 0) * 100) / 100,
      breakCost: Math.round(breakEntries.reduce((a, e) => a + (e.product.price || 0), 0) * 100) / 100,
      orderCount: orderEntries.length,
      orderRevenue: Math.round(orderEntries.reduce((a, e) => a + e.perSpot, 0) * 100) / 100,
      packCount: packEntries.length,
      packRevenue: Math.round(packEntries.reduce((a, e) => a + e.perSpot, 0) * 100) / 100,
      shipped,
      set: queueRef.current[0].set, product: queueRef.current[0].product,
      followers: followerGain,
    })
  }

  const flopping = isFlop(viewers)
  // Running net so the player sees if the stream is in the black. What's come IN across the
  // whole queue: tips + collected spot/order cash + the MARKET VALUE OF CARDS YOU KEEP (cards
  // not shipped to a break/order buyer), minus every product's cost.
  const collectedCash = Math.round(queueRef.current.reduce((a, e) => a + e.filled * e.perSpot, 0) * 100) / 100
  const keptValue = Math.round(allPulled.current.reduce((a, p) => {
    const e = queueRef.current[p.entryIdx]
    const shipping = p.spot != null && p.spot < e.filled
    return a + (shipping ? 0 : cardValue(p.card))
  }, 0) * 100) / 100
  const totalCost = Math.round(queueRef.current.reduce((a, e) => a + (e.product.price || 0), 0) * 100) / 100
  const net = Math.round((tips + collectedCash + keptValue - totalCost) * 100) / 100
  const packsDone = queueRef.current.slice(0, entryIdx).reduce((a, e) => a + e.product.packs, 0) + Math.min(packNo, totalPacks)
  const totalPacksAll = queueRef.current.reduce((a, e) => a + e.product.packs, 0)
  const progressPct = Math.round((packsDone / Math.max(1, totalPacksAll)) * 100)

  return (
    <div className="stream-live">
      {burst && <Burst />}
      <div className="stream-hud">
        <span className="pill live-dot">🔴 LIVE</span>
        <span className="stream-viewers" style={flopping ? { color: 'var(--red)' } : null}>👁 <AnimatedNumber value={viewers} flash={false} duration={600} format={(n) => Math.round(n).toLocaleString()} /> watching{flopping ? ' · quiet room…' : ''}</span>
        <span className="pill" style={{ background:'color-mix(in srgb, var(--green) 13%, transparent)', color:'var(--green)' }}>💸 {fmtMoney(tips)} tips</span>
        <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }} title="Your returning audience — grows with good streams">
          👥 {followers.toLocaleString()}{sessionFollowers > 0 ? <b style={{ color:'var(--green)' }}> +{sessionFollowers}</b> : ''}
        </span>
        {hypeLevel > 0 && (
          <span className={`pill hype-train lvl-${Math.min(HYPE_TRAIN_MAX, hypeLevel)}`} title="Consecutive hits stack a tip multiplier — keep the train rolling!">
            ⚡ Hype ×{hypeLevel} · tips {hypeTrainMult(hypeLevel).toFixed(1)}×{combo > 2 ? ` · 🔥${combo}` : ''}
          </span>
        )}
        {keptValue > 0 && <span className="pill" style={{ background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}
          title="Market value of the cards you're keeping from this rip">🃏 {fmtMoney(keptValue)} kept</span>}
        {entry && entry.orderedBy && <span className="pill" style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }}>{entry.packRip ? '🎁 Pack order' : '🎟️ Rip order'} · {entry.orderedBy}</span>}
        {entry && entry.isBreak && !entry.orderedBy && <span className={`pill ${liveSpotFlash ? 'spot-pop' : ''}`} style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }}>📦 Break · {entry.filled}/{entry.spots} spots</span>}
        <span className="pill" title={entry && entry.isBreak
            ? 'Tips + spot/order cash + value of cards you keep, minus product cost'
            : 'Tips + market value of every card you rip, minus product cost'}
          style={{ background: net >= 0 ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
          Net {net >= 0 ? '+' : ''}{fmtMoney(net)}
        </span>
        <span className="pill" style={{ marginLeft:'auto' }} title={entry ? `${entry.product.type} · ${entry.set.name}` : ''}>
          📦 {entry ? entry.product.type : ''} · {entryIdx + 1}/{queueRef.current.length} · pk {Math.min(packNo + (phase==='revealing'?1:0), totalPacks)}/{totalPacks}
        </span>
      </div>
      {totalPacksAll > 1 && (
        <div className="stream-progress" aria-hidden="true"><div style={{ width: progressPct + '%' }} /></div>
      )}

      {isGod && (phase === 'revealing' || phase === 'packdone') && (
        <div className="godbanner">✨🎉 GOD PACK!! 🎉✨<small>Every card is a hit — chat is losing it.</small></div>
      )}
      {isDemigod && (phase === 'revealing' || phase === 'packdone') && (
        <div className="demigodbanner">DEMIGOD PACK! <small>chat is hyped.</small></div>
      )}

      {goal && (
        <div className={`stream-goal ${goalMet ? 'met' : ''}`}>
          {goalMet ? '✅' : '🎯'} <b>Stream goal:</b> {goal.label}
          <span className="muted"> · +{goal.reward} followers{goalMet ? ' — done!' : ''}</span>
        </div>
      )}

      <div className="stream-body">
        <div className="stream-stage">
          {pulls.length === 0 && !done && entry && (
            <div className="stream-prompt">
              <div className="pack3d" onClick={ripPack} style={{ cursor:'pointer' }}
                role="button" tabIndex={0} aria-label="Rip the first pack live"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ripPack() } }}>
                <div className="foil" />
                {entry?.set.logo ? <img className="logo" src={entry.set.logo} alt={entry.set.name} /> : <b>{entry?.set.name}</b>}
                <span className="hint">▶ Rip {entryIdx === 0 ? 'the first pack' : `${entry?.product.type}`} live</span>
              </div>
            </div>
          )}

          {/* ON AIR with nothing to crack. Not an error state and not the end of the show — it's
              the orders-only stream: you're live, the room is filling, and you rip whatever
              viewers pay you to rip. Also what you see after cashing out a queue but staying on. */}
          {pulls.length === 0 && done && (
            <div className="stream-prompt stream-waiting">
              <div className="stream-waiting-icon">🎙️</div>
              <h3 style={{ margin: '6px 0 2px' }}>On air — taking orders</h3>
              <p className="muted" style={{ fontSize: 13, margin: 0, maxWidth: 420, textAlign: 'center' }}>
                Nothing on your table. You'll rip whatever the room <b>buys</b> — your mystery packs,
                and your held sealed if you have the 🎟️ Live Rip Service. Accept an order and it goes
                straight to the table.
                {!orders.length && <><br /><span style={{ opacity: 0.75 }}>Waiting for someone to bite…</span></>}
              </p>
            </div>
          )}

          {pulls.length > 0 && (
            <div className="stream-revealwrap">
              <NowRevealing card={current} />
              <div className="reveal-row" style={{ marginTop: 0 }}>
                {pulls.map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  const chase = c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare')
                  // this card's spot within the CURRENT entry (for the ship tag)
                  const gp = allPulled.current.find(p => p.card.uid === c.uid)
                  const spotIdx = gp ? gp.spot : null
                  const owner = spotIdx != null ? (spotIdx < entry.filled ? (entry.owners[spotIdx] || 'buyer') : 'YOU') : null
                  return (
                    <div key={c.uid} style={{ position:'relative' }}>
                      <HoloCard card={c} interactive={i < shown} extraStyle={{ '--rarity': edge }}
                        className={`reveal-card ${i < shown ? 'shown' : 'facedown'} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                        <div className="flip">
                          <div className="flip-back" aria-hidden="true" />
                          <div className="flip-front"><img src={cardImg(c)} alt={i < shown ? c.name : ''} decoding="async" /></div>
                        </div>
                      </HoloCard>
                      {i < shown && owner && (c._isHit || c.foil) && (
                        <span className={`spot-ship ${owner === 'YOU' ? 'mine' : ''}`} title={owner === 'YOU' ? 'Unsold spot — this one is yours' : `Ships to ${owner}`}>
                          {owner === 'YOU' ? '⭐ YOURS' : `📦 ${owner}`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="stream-actions">
            {canRipPack && pulls.length > 0 && (
              <button className="btn gold" style={{ maxWidth: 220 }} disabled={phase === 'revealing'} onClick={ripPack}>Rip next pack ({packNo + 1}/{totalPacks}) →</button>
            )}
            {atEntryEnd && (
              <button className="btn gold" style={{ maxWidth: 260 }} onClick={goNextEntry}>
                Next product → {queueRef.current[entryIdx + 1]?.product.icon || '📦'} {queueRef.current[entryIdx + 1]?.product.type}
              </button>
            )}
            {!done && (
              <button className="btn alt" style={{ flex:'none', maxWidth: 190 }} disabled={!collection.length} onClick={() => setGiveawayOpen(true)}
                title={collection.length ? 'Raffle any card you own to a viewer — a burst of new followers (bigger cards = bigger pop)' : 'You have no cards to give away'}>
                🎁 Giveaway{giveaways > 0 ? ` (${giveaways})` : ''}
              </button>
            )}
            {done && <button className="btn gold" style={{ maxWidth: 240 }} onClick={endStream}>End stream & cash out →</button>}
            {!done && <button className="btn alt" style={{ flex:'none', maxWidth: 150 }} onClick={endEarly}>End early</button>}
          </div>

          {orders.length > 0 && (
            <div className="rip-orders">
              <div className="rip-side-head">🎟️ Live orders <span className="muted">— viewers buying rips & your mystery packs (cards ship to them)</span></div>
              {orders.map(o => (
                <div key={o.id} className="rip-order">
                  <b className="ro-buyer" style={{ color: handleColor(o.buyer) }}>{o.buyer}</b>
                  <span className="ro-prod">{o.product.icon || '📦'} {o.product.type}</span>
                  <span className="ro-price">{fmtMoney(o.price)}</span>
                  {/* Not disabled on `done` — taking orders with an empty table is the point. */}
                  <button className="btn gold ro-btn" onClick={() => acceptOrder(o)}>Accept</button>
                  <button className="btn alt ro-btn" onClick={() => declineOrder(o.id)}>Pass</button>
                </div>
              ))}
            </div>
          )}

          {hits.length > 0 && (
            <div className="stream-hits">
              <div className="rip-side-head">On-stream hits ({hits.length})</div>
              <div className="stream-hits-row">
                {[...hits].sort((a,b)=>cardValue(b)-cardValue(a)).map((c,i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  return (
                    <div key={c.uid+'-'+i} className="stream-hit" style={{ '--rarity': edge }} title={`${c.name} · ${fmtMoney(cardValue(c))}`}>
                      <img src={cardImg(c)} alt="" /><span>{fmtMoney(cardValue(c))}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="stream-chat">
          <div className="rip-side-head">💬 Live chat</div>
          <div className="chat-feed" ref={chatBoxRef}>
            {chat.map(m => (
              <div key={m.id} className={`chat-msg ${m.tip ? 'tip' : ''} ${m.regular ? 'regular' : ''}`}>
                {m.tip ? <span>{m.text}</span> : (
                  <><b style={{ color: m.regular ? 'var(--gold)' : handleColor(m.handle) }}>
                    {m.regular ? `${m.emoji || '⭐'} ${m.handle} ⭐` : m.handle}
                  </b> {m.text}</>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {giveawayOpen && (
        <GiveawayPicker collection={collection} reservedUids={reservedUids}
          onPick={(uid) => runGiveaway(uid)} onClose={() => setGiveawayOpen(false)} />
      )}
    </div>
  )
}

// Pick any card you own to raffle to the audience mid-stream. Sorted by value so your
// headline chase cards are front-and-centre — a big giveaway lands a big follower pop.
function GiveawayPicker({ collection, reservedUids, onPick, onClose }) {
  const pool = [...collection].filter(c => !reservedUids.has(c.uid)).sort((a, b) => cardValue(b) - cardValue(a))
  return (
    <div className="modalbg" onClick={onClose} style={{ zIndex: 30 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <h2 style={{ marginRight: 'auto' }}>🎁 Give away a card</h2>
          <span className="pill">{pool.length} eligible</span>
        </div>
        <p className="muted" style={{ marginTop: 2 }}>
          Raffle any card you own to a lucky viewer — chat goes wild and new followers pour in.
          The <b>pricier the card, the bigger the pop</b>. Give away as many as you like.
        </p>
        {pool.length === 0 ? (
          <div className="empty">Nothing to give away — every card you have is reserved for a break buyer.</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', maxHeight: '52vh', overflowY: 'auto', marginTop: 6 }}>
            {pool.slice(0, 60).map(c => {
              const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
              return (
                <div key={c.uid} className="vendoritem" style={{ '--rarity': edge }}>
                  <img src={cardImg(c)} alt={c.name} loading="lazy" decoding="async" style={{ width: '100%', borderRadius: 8 }} />
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>{c.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, textAlign: 'center', color: 'var(--green)' }}>{fmtMoney(cardValue(c))}</div>
                  <button className="btn gold" style={{ fontSize: 12, padding: '6px' }} onClick={() => onPick(c.uid)}>🎁 Give away</button>
                </div>
              )
            })}
          </div>
        )}
        <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// Left-side callout naming the card currently being revealed (rarity, value, PSA-10).
function NowRevealing({ card }) {
  return (
    <aside className="rip-side rip-now stream-now">
      <div className="rip-side-head">Now revealing</div>
      {card ? (() => {
        const edge = card.foil ? card.foil.color : rarityColor(card.rarity)
        const setNm = setNameOfCard(card)
        const label = `${card.foil ? card.foil.label : `${card.reverse ? 'Reverse Holo · ' : ''}${card.rarity}`}${setNm ? ` · ${setNm}` : ''}`
        return (
          <div className="rip-now-card" style={{ '--rarity': edge }}>
            <img src={cardImg(card)} alt={card.name} decoding="async" fetchpriority="high" />
            <div className="rip-now-name">{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
            <div className="rip-now-meta" style={{ color: edge }}>{label}</div>
            <div className="rip-now-val">{fmtMoney(cardValue(card))}</div>
            {!card.grade && <PsaLine card={card} />}
          </div>
        )
      })() : <div className="muted" style={{ fontSize: 12 }}>Tearing it open…</div>}
    </aside>
  )
}

// The graded-value teaser shown on every raw reveal: what the card would be worth at PSA 10
// and PSA 9 on the market right now.
function PsaLine({ card }) {
  return (
    <div className="rip-now-psa10" title="Market value if this card graded PSA 10 / PSA 9">
      💎 PSA 10 <b>{fmtMoney(psaValueAt(card, 10))}</b> · 9 <b>{fmtMoney(psaValueAt(card, 9))}</b>
    </div>
  )
}

// --- Summary -----------------------------------------------------------------
function StreamSummary({ session, onDone }) {
  const s = session?.summary
  if (!s) { onDone(); return null }
  const hitValue = s.hits.reduce((a, c) => a + cardValue(c), 0)
  const breakPL = s.isBreak ? Math.round((s.spotGross - (s.breakCost || 0)) * 100) / 100 : null
  const flopped = isFlop(s.peak)
  return (
    <div className="stage">
      <div style={{ textAlign:'center', maxWidth: 520 }}>
        <h2 style={{ marginBottom: 4 }}>{flopped ? '🦗 Stream over — quiet one.' : '📴 Stream over — GG!'}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {s.packsRipped} pack{s.packsRipped>1?'s':''} across {s.products || 1} product{(s.products||1)>1?'s':''} of {s.set.name}{s.products>1?' & more':''}{flopped ? ', to a near-empty room.' : ', ripped live for the people.'}
        </p>
        <div className="stream-summary-grid">
          <div><span className="muted">Peak viewers</span><b>👁 {s.peak.toLocaleString()}</b></div>
          <div><span className="muted">Tips banked</span><b style={{ color:'var(--green)' }}>{fmtMoney(s.tips)}</b></div>
          <div><span className="muted">Notoriety</span><b style={{ color: s.noto >= 0 ? 'var(--gold)' : 'var(--red)' }}>{s.noto>=0?'+':''}{s.noto}★</b></div>
          <div><span className="muted">Products ripped</span><b>📦 {s.products || 1}</b></div>
          <div><span className="muted">Your hits kept</span><b>{s.hits.length} · {fmtMoney(hitValue)}</b></div>
          {s.isBreak && <div><span className="muted">Break spots sold</span><b>{s.spotsSold}/{s.spots}</b></div>}
          {s.isBreak && <div><span className="muted">Break P/L</span><b style={{ color: breakPL >= 0 ? 'var(--green)' : 'var(--red)' }}>{breakPL>=0?'+':''}{fmtMoney(breakPL)}</b></div>}
          {s.orderCount > 0 && <div><span className="muted">Rip orders filled</span><b>🎟️ {s.orderCount}</b></div>}
          {s.orderCount > 0 && <div><span className="muted">Rip order revenue</span><b style={{ color:'var(--green)' }}>{fmtMoney(s.orderRevenue)}</b></div>}
          {s.packCount > 0 && <div><span className="muted">Mystery packs sold live</span><b>🎁 {s.packCount}</b></div>}
          {s.packCount > 0 && <div><span className="muted">Pack revenue</span><b style={{ color:'var(--green)' }}>{fmtMoney(s.packRevenue)}</b></div>}
          {s.followers > 0 && <div><span className="muted">New followers</span><b style={{ color:'var(--accent-light)' }}>👥 +{s.followers}</b></div>}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {s.noto > 0 ? '🔥 Your shop is buzzing — listing traffic is boosted for the next few days. Hop to the Sell tab.'
            : '😬 Barely anyone watched — no afterglow this time. Build some buzz before going live again.'}
          {s.shipped > 0 && ` Shipped ${s.shipped} card${s.shipped>1?'s':''} to break/rip-order buyers; everything else is in your collection.`}
          {' · A day passed while you streamed.'}
        </p>
        <button className="btn gold" style={{ maxWidth: 200, marginTop: 12 }} onClick={onDone}>Done →</button>
      </div>
    </div>
  )
}

// --- helpers -----------------------------------------------------------------
// The biggest product in a queue (most packs, then priciest) — used to size the stream goal.
function biggestProduct(queue) {
  return queue.map(e => e.product).sort((a, b) => (b.packs - a.packs) || (b.price - a.price))[0]
}
// Pick a per-stream goal (a small objective that pays followers when met). Sized to the
// product so a bigger box asks for a bit more.
function pickStreamGoal(product) {
  const packs = product?.packs || 1
  const hitTarget = Math.max(2, Math.round(packs * 0.6))
  const pool = [
    { type: 'chase', label: 'Pull a chase (SIR+ or a special foil)', reward: 8 },
    { type: 'train', target: 4, label: 'Get the hype train to ×4', reward: 6 },
    { type: 'hits', target: hitTarget, label: `Pull ${hitTarget} hits this stream`, reward: 6 },
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}
function seedChat() {
  return ['theQuietLurker', 'pikafan99', 'tcg_tina'].map((h, i) => ({
    handle: h, text: ['just got here!', 'lets see some hits', 'hi everyone 👋'][i], id: `seed-${i}`,
  }))
}
const HANDLE_COLORS = ['#ff6b6b','#5aa0ff','#36d399','#ffcb05','#ff79c6','#7cf0ff','#ff9f43','#a06bff']
function handleColor(h) { let n = 0; for (let i = 0; i < h.length; i++) n = (n * 31 + h.charCodeAt(i)) >>> 0; return HANDLE_COLORS[n % HANDLE_COLORS.length] }
function buildSpotOwners(spots) {
  const names = ['pikafan99','holoHunter','slabKing','charizard_chad','gemRate10','foilFiend','breakaholic','grail_grace']
  return Array.from({ length: spots }, (_, i) => names[i % names.length])
}
