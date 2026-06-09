import { useEffect, useRef, useState, useCallback } from 'react'
import { useGame } from '../game/store'
import { SHOP_SETS, setProducts, openPack, makeProductPromo, isHit, cardValue, psa10Value, fmtMoney, rarityRank, preloadCardImages, setById } from '../game/engine'
import {
  baseViewers, fatigueMult, viewerReaction, tipsFor, streamNotoriety, isFlop, isStreamHype,
  chatLine, reactionKind, spotPrice, spotsFilled,
} from '../game/stream'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'
import Burst from './Burst'
import { confirmDialog, toast } from '../ui/dialog'

// The livestream studio. You go LIVE and rip product on camera: a viewer counter,
// live chat that reacts to your ACTUAL pulls, tips, a "now revealing" callout, and
// (optionally) a BOX BREAK where spots ship to buyers — unsold spots' cards stay
// yours, and a big pull can sell a lingering spot live. Streaming burns a game-day
// and tires your audience, so it's a deliberate play.
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
function StreamSetup({ notoriety, fatigue, streamStats, onGoLive }) {
  const cash = useGame(s => s.cash)
  const spend = useGame(s => s.spend)
  const recordSetSpend = useGame(s => s.recordSetSpend)
  const collectBreakSpots = useGame(s => s.collectBreakSpots)
  const inventory = useGame(s => s.sealedInventory)
  const ripSealedAction = useGame(s => s.ripSealed)

  const [setId, setSetId] = useState(SHOP_SETS[0].id)
  const buySet = SHOP_SETS.find(s => s.id === setId) || SHOP_SETS[0]
  const products = setProducts(buySet)
  const [prodType, setProdType] = useState(() => bestProduct(products).type)
  const buyProduct = products.find(p => p.type === prodType) || products[0]

  // You can rip FRESH (buy now) or break a box you already HOLD in sealed inventory.
  const [source, setSource] = useState('buy')   // 'buy' | 'inventory'
  const [invUid, setInvUid] = useState(null)
  useEffect(() => {
    if (source === 'inventory' && !inventory.find(i => i.uid === invUid)) setInvUid(inventory[0]?.uid || null)
  }, [source, inventory, invUid])
  const invItem = inventory.find(i => i.uid === invUid) || null

  const fromInv = source === 'inventory' && !!invItem
  const set = fromInv ? (setById(invItem.setId) || buySet) : buySet
  const product = fromInv ? invItem.product : buyProduct
  const canBreak = product.packs >= 2

  const [doBreak, setDoBreak] = useState(false)
  const [spots, setSpots] = useState(4)

  const fresh = fatigueMult(fatigue)
  const expected = baseViewers(notoriety, fresh)
  const per = spotPrice(product.price, spots, notoriety)

  // keep break toggle valid when switching to a single-pack product
  useEffect(() => { if (!canBreak && doBreak) setDoBreak(false) }, [canBreak, doBreak])

  async function go() {
    // Breaking a held box costs nothing now (you paid when you bought it); ripping fresh
    // charges the product price.
    if (!fromInv && cash < product.price) return toast(`Not enough cash for the ${product.type}.`)
    // Guard a pricey FRESH buy behind a confirm so one mis-tap can't burn a fortune.
    if (!fromInv && product.price > 250) {
      const ok = await confirmDialog({
        title: `Go live with a ${product.type}?`,
        body: `This rips a ${fmtMoney(product.price)} ${product.type} of ${set.name} on stream. It burns a game-day.`,
        confirmText: `Go live — ${fmtMoney(product.price)}`, cancelText: 'Not yet',
      })
      if (!ok) return
    }
    if (fromInv) {
      // Consume the held product from inventory — no re-charge.
      const it = ripSealedAction(invItem.uid)
      if (!it) return toast('That product is no longer in your inventory.')
      useGame.getState().log('stream', `Broke a held ${product.type} (${set.name}) on stream`, 0)
    } else {
      if (!spend(product.price)) return
      recordSetSpend(set.id, product.price)
      useGame.getState().log('stream', `Bought ${product.type} (${set.name}) to rip live`, -product.price)
    }

    let isBreak = false, spotsSold = 0, spotGross = 0
    if (doBreak && canBreak) {
      isBreak = true
      spotsSold = spotsFilled(spots, notoriety)
      spotGross = Math.round(spotsSold * per * 100) / 100
      if (spotGross > 0) collectBreakSpots(spotGross)
    }
    onGoLive({ set, product, isBreak, spots, spotsSold, spotGross, perSpot: per })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="banner" style={{ marginTop: 16 }}>
        🔴 <b>Go live & rip on camera.</b> Viewers tune in, react to your pulls, and tip. A hot stream banks a
        notoriety jump and pumps your store's traffic for days — but it <b>burns a game-day</b>, and streaming
        often <b>tires your audience</b> (rest a few days to recover).
        {streamStats?.streams ? <span className="muted"> · {streamStats.streams} stream{streamStats.streams>1?'s':''} · peak {streamStats.peakViewers} · {fmtMoney(streamStats.tips)} tipped lifetime</span> : null}
      </div>

      <div className="market-panel" style={{ marginTop: 14 }}>
        <div className="market-head">🎬 What are you ripping?</div>
        {inventory.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className={`tab ${source === 'buy' ? 'active' : ''}`} onClick={() => setSource('buy')}>🛒 Buy fresh</button>
            <button className={`tab ${source === 'inventory' ? 'active' : ''}`} onClick={() => setSource('inventory')}>📦 From inventory ({inventory.length})</button>
          </div>
        )}
        {fromInv ? (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <select value={invUid || ''} onChange={e => setInvUid(e.target.value)}>
              {inventory.map(it => {
                const s = setById(it.setId)
                return <option key={it.uid} value={it.uid}>{it.product.icon || '📦'} {s?.name} {it.product.type} · {it.product.packs} pk</option>
              })}
            </select>
            <span className="pill" style={{ marginLeft: 'auto' }}>{product.packs} pack{product.packs>1?'s':''} · owned</span>
          </div>
        ) : (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <select value={setId} onChange={e => { const id = e.target.value; setSetId(id); setProdType(bestProduct(setProducts(SHOP_SETS.find(s=>s.id===id))).type) }}>
              {SHOP_SETS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={prodType} onChange={e => setProdType(e.target.value)}>
              {products.map(p => <option key={p.type} value={p.type}>{p.icon} {p.type} · {p.packs} pk · {fmtMoney(p.price)}</option>)}
            </select>
            <span className="pill" style={{ marginLeft: 'auto' }}>{product.packs} pack{product.packs>1?'s':''}</span>
          </div>
        )}
      </div>

      <div className="market-panel" style={{ marginTop: 12, opacity: canBreak ? 1 : 0.5 }}>
        <label className="tweet-toggle" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={doBreak} disabled={!canBreak} onChange={e => setDoBreak(e.target.checked)} />
          📦 <b>Run a box break</b> <span className="muted">— sell spots up front; filled spots ship to buyers, unsold spots' cards are yours to keep. A hot pull can sell a leftover spot live.{canBreak ? '' : ' (needs a multi-pack product)'}</span>
        </label>
        {doBreak && canBreak && (
          <div style={{ marginTop: 10 }}>
            <div className="list-pct-row">
              <span className="muted" style={{ fontSize: 12 }}>Spots</span>
              {[2, 4, 6, 8].map(n => (
                <button key={n} className={`pctbtn ${spots === n ? 'on' : ''}`} onClick={() => setSpots(n)}>{n}</button>
              ))}
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                {fmtMoney(per)}/spot · ~{Math.round(Math.min(0.98, 0.25 + notoriety/160)*100)}% sell at your fame
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              All {spots} filling collects <b style={{ color: 'var(--green)' }}>{fmtMoney(per * spots)}</b> vs {fromInv ? 'a box you already own' : `${fmtMoney(product.price)} cost`}.
              Whatever doesn't sell, you keep those teams' pulls.
            </p>
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
        <button className="btn gold" style={{ maxWidth: 300 }} disabled={!fromInv && cash < product.price} onClick={go}>
          {fromInv
            ? `🔴 Go live — break your ${product.icon || ''} ${product.type}`
            : (cash < product.price ? `Need ${fmtMoney(product.price)}` : `🔴 Go live — rip ${product.icon || ''} ${product.type} (${fmtMoney(product.price)})`)}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
        Expecting ~{expected.toLocaleString()} viewers
        {fresh < 0.99 && <span style={{ color: 'var(--gold)' }}> · audience {Math.round(fresh*100)}% fresh (you've streamed recently — rest to recover)</span>}
        {isFlop(expected) && <span style={{ color: 'var(--red)' }}> · ⚠️ risky — barely anyone may show (a flop dings rep)</span>}
        {' · costs 1 game-day'}
      </p>
    </div>
  )
}

// --- Live --------------------------------------------------------------------
function LiveStage({ session, notoriety, fatigue, onEnd }) {
  const { set, product, isBreak, spots, spotsSold, perSpot } = session
  const addPulls = useGame(s => s.addPulls)
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const speed = Math.max(0.25, ripSpeed)
  const ms = (n) => n / speed

  const totalPacks = product.packs
  const settled = baseViewers(notoriety, fatigueMult(fatigue))

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
  const [filledSpots, setFilledSpots] = useState(spotsSold)   // grows as viewers grab spots live
  const [liveSpotFlash, setLiveSpotFlash] = useState(null)
  const [done, setDone] = useState(false)

  const peakRef = useRef(settled)
  const chatBoxRef = useRef(null)
  const finishedRef = useRef(false)
  const autoRef = useRef(false)
  // every card pulled, tagged with its spot index (for break shipping at the end)
  const allPulled = useRef([])  // { card, spot }  (spot only set for breaks)

  // Every reveal/burst/tip timer is tracked here so we can cancel the whole chain when the
  // stream ends early or the component unmounts — otherwise an in-flight revealNext keeps
  // running setState and could fire finishSoon (minting a promo) AFTER cashout/settlement.
  const timersRef = useRef([])
  const after = (fn, delay) => {
    const id = setTimeout(() => { timersRef.current = timersRef.current.filter(t => t !== id); fn() }, delay)
    timersRef.current.push(id)
    return id
  }
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }, [])

  const pushChat = useCallback((line) => {
    setChat(c => [...c.slice(-40), { ...line, id: `${Date.now()}-${Math.random()}` }])
  }, [])

  // ambient chat + viewer drift toward settled. Depend on `speed` (a number), NOT `ms` —
  // `ms` is re-created every render, which would tear down and recreate this interval on
  // every reveal tick, resetting the 1600ms timer before it can fire (stalling ambient
  // chat/drift during the busiest part of the stream).
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() < 0.7) pushChat(chatLine('ambient'))
      setViewers(v => {
        const drift = Math.round((settled - v) * 0.08)
        const jitter = Math.round((Math.random() - 0.45) * Math.max(2, v * 0.04))
        const next = Math.max(1, v + drift + jitter)
        peakRef.current = Math.max(peakRef.current, next); return next
      })
    }, 1600 / speed)
    return () => clearInterval(id)
  }, [settled, speed, pushChat])

  useEffect(() => { const el = chatBoxRef.current; if (el) el.scrollTop = el.scrollHeight }, [chat])

  // auto-advance between packs when the setting is on
  useEffect(() => {
    if (!autoAdvance) return
    if (phase === 'packdone' && packNo < totalPacks) {
      const t = setTimeout(() => ripPack(), ms(1400)); return () => clearTimeout(t)
    }
    if (phase === 'idle' && packNo === 0 && !autoRef.current) {
      autoRef.current = true
      const t = setTimeout(() => ripPack(), ms(700)); return () => clearTimeout(t)
    }
  }, [phase, packNo, autoAdvance]) // eslint-disable-line

  const canRip = (phase === 'idle' || phase === 'packdone') && !done && packNo < totalPacks
  // spot index a pull lands on (round-robin across spots, in global pull order)
  const spotOwners = isBreak ? buildSpotOwners(spots) : null

  function ripPack() {
    if (!canRip) return
    const cards = openPack(set)
    preloadCardImages(cards) // warm the CDN cache so the live reveal doesn't lag on slow images
    cards.forEach(c => { c._isHit = isHit(c) })
    const god = !!cards._god
    const demigod = !!cards._demigod
    if (god) cards.forEach(c => { c._fromGod = true })
    if (demigod) cards.forEach(c => { c._fromDemigod = true })
    addPulls(cards, `🔴 ${set.name} (live)`)
    // tag each card with its break-spot (global index keeps round-robin fair across packs)
    if (isBreak) {
      const startIdx = allPulled.current.length
      cards.forEach((c, i) => allPulled.current.push({ card: c, spot: (startIdx + i) % spots }))
    } else {
      cards.forEach(c => allPulled.current.push({ card: c, spot: null }))
    }
    setIsGod(god); setIsDemigod(demigod); setPulls(cards); setShown(0); setCurrent(null); setPhase('revealing')
    after(() => revealNext(cards, 0), ms(god ? 1100 : 500))
  }

  function revealNext(cards, i) {
    if (finishedRef.current) return // stream ended early — stop the chain (don't mint a post-cashout promo)
    if (i >= cards.length) {
      if (cards._god) { setBurst(true); after(() => setBurst(false), ms(2500)) }
      else if (cards._demigod) { setBurst(true); after(() => setBurst(false), ms(1500)) }
      setPackNo(n => { const np = n + 1; if (np >= totalPacks) finishSoon(); return np })
      setPhase('packdone'); return
    }
    setShown(i + 1)
    const c = cards[i]; setCurrent(c)
    const kind = reactionKind(c)
    const special = c._isHit || c.foil
    setViewers(v => { const next = Math.max(1, Math.round(v * viewerReaction(c))); peakRef.current = Math.max(peakRef.current, next); return next })
    pushChat(chatLine(kind, Math.random, c))
    if (kind === 'hype' || kind === 'god') {
      setHypeMoments(m => m + 1)
      setBurst(true); after(() => setBurst(false), ms(1400))
      for (let k = 0; k < (kind === 'god' ? 4 : 2); k++) after(() => pushChat(chatLine(kind, Math.random, c)), ms(120 * (k + 1)))
      // a hot pull can sell a lingering break spot to a hyped viewer
      maybeSellLiveSpot(c)
    }
    if (special) setHits(h => [c, ...h])
    const t = tipsFor(c, peakRef.current)
    if (t > 0) { setTips(x => Math.round((x + t) * 100) / 100); if (t >= 3 || kind === 'hype' || kind === 'god') after(() => pushChat(chatLine('tip')), ms(200)) }
    const delay = special ? 900 : 360
    after(() => revealNext(cards, i + 1), ms(delay))
  }

  // On a hype pull, viewers may scramble for a still-open break spot.
  function maybeSellLiveSpot(card) {
    if (!isBreak) return
    setFilledSpots(f => {
      if (f >= spots) return f
      // chance scales with how hot the pull is + your fame
      const chance = (card._fromGod ? 0.9 : 0.5) * (0.5 + Math.min(0.5, notoriety / 200))
      if (Math.random() < chance) {
        useGame.getState().sellLiveSpot(perSpot)
        setLiveSpotFlash({ id: Date.now() })
        after(() => setLiveSpotFlash(null), 2200)
        pushChat({ handle: 'system', text: `someone grabbed an open spot! 📦 (+${fmtMoney(perSpot)})`, tip: true })
        return f + 1
      }
      return f
    })
  }

  function finishSoon() {
    if (finishedRef.current) return // already cashed out — don't add a promo after the fact
    const promo = makeProductPromo(set, product || { bonus: null })
    if (promo) {
      promo._isHit = isHit(promo)
      addPulls([promo], `🔴 ${set.name} promo (live)`, 0)
      // spots is always ≥2 for a break, but guard the modulo against a 0 just in case
      allPulled.current.push({ card: promo, spot: isBreak && spots > 0 ? allPulled.current.length % spots : null })
      if (promo._isHit || promo.foil) setHits(h => [promo, ...h])
      pushChat(chatLine(reactionKind(promo), Math.random, promo))
    }
    setDone(true)
  }

  // Skip the slog: instantly rip every remaining pack into the collection (no
  // animation), tallying viewers/tips/hits/spot-fills, then jump to the wrap-up.
  // For a big box this turns 30+ clicks into one.
  function skipRest() {
    if (done) return
    const remaining = totalPacks - packNo - (phase === 'revealing' ? 1 : 0)
    let addedTips = 0, addedHits = [], hype = 0, spotGain = 0
    // Track the LIVE filled-spot count (seeded from current state), not the stale initial
    // `spotsSold` prop — spots already grabbed during the animated reveal must count, or
    // skip would sell (and bank cash for) more spots than the break holds.
    let filled = filledSpots
    let v = peakRef.current
    for (let p = 0; p < Math.max(0, remaining); p++) {
      const cards = openPack(set)
      cards.forEach(c => { c._isHit = isHit(c) })
      if (cards._god) cards.forEach(c => { c._fromGod = true })
      if (cards._demigod) cards.forEach(c => { c._fromDemigod = true })
      addPulls(cards, `🔴 ${set.name} (live)`)
      cards.forEach((c, i) => {
        if (isBreak) allPulled.current.push({ card: c, spot: (allPulled.current.length) % spots })
        else allPulled.current.push({ card: c, spot: null })
        v = Math.max(1, Math.round(v * viewerReaction(c)))
        peakRef.current = Math.max(peakRef.current, v)
        const kind = reactionKind(c)
        if (kind === 'hype' || kind === 'god') {
          hype++
          if (isBreak && filled < spots && Math.random() < (c._fromGod ? 0.9 : 0.5)) {
            filled++; spotGain++; useGame.getState().sellLiveSpot(perSpot)
          }
        }
        addedTips += tipsFor(c, peakRef.current)
        if (c._isHit || c.foil) addedHits.push(c)
      })
    }
    if (addedTips) setTips(x => Math.round((x + addedTips) * 100) / 100)
    if (hype) setHypeMoments(m => m + hype)
    if (spotGain) setFilledSpots(f => Math.min(spots, f + spotGain))
    if (addedHits.length) setHits(h => [...addedHits.reverse(), ...h])
    setViewers(Math.round(v))
    setPackNo(totalPacks)
    pushChat({ handle: 'system', text: 'ripped the rest off-stream ⏩', tip: false })
    finishSoon()
  }

  function endStream() {
    if (finishedRef.current) return
    finishedRef.current = true
    timersRef.current.forEach(clearTimeout); timersRef.current = [] // kill any in-flight reveal chain
    const peak = Math.round(peakRef.current)
    const noto = streamNotoriety(peak, hypeMoments)
    // breaks: ship the cards that landed on FILLED spots; keep the rest (your teams)
    let shipped = 0, keptHits = hits
    if (isBreak) {
      const shipUids = allPulled.current.filter(p => p.spot < filledSpots).map(p => p.card.uid)
      shipped = useGame.getState().shipBreakCards(shipUids)
      const shipSet = new Set(shipUids)
      keptHits = hits.filter(h => !shipSet.has(h.uid))
    }
    useGame.getState().endStream({ tips, noto, peakViewers: peak })
    onEnd({ peak, noto, tips, hits: keptHits, packsRipped: totalPacks, isBreak,
      spotsSold: filledSpots, spots, spotGross: Math.round(filledSpots * perSpot * 100) / 100,
      shipped, set, product })
  }

  const flopping = isFlop(viewers)
  // Running net so the player sees if the stream is in the black. What's come IN:
  //   tips (always) + spot cash (breaks only) + the MARKET VALUE OF CARDS YOU KEEP.
  // When ripping for yourself (no break) every card you pull is yours, so the box's
  // pull value counts toward your net. In a break, cards on FILLED spots ship to buyers
  // (already paid for via spot cash), so only the cards on unfilled spots are yours to keep.
  const spotCash = isBreak ? Math.round(filledSpots * perSpot * 100) / 100 : 0
  const keptValue = Math.round(allPulled.current.reduce((a, p) =>
    a + ((isBreak && p.spot != null && p.spot < filledSpots) ? 0 : cardValue(p.card)), 0) * 100) / 100
  const net = Math.round((tips + spotCash + keptValue - product.price) * 100) / 100
  const progressPct = Math.round((Math.min(packNo, totalPacks) / totalPacks) * 100)

  return (
    <div className="stream-live">
      {burst && <Burst />}
      <div className="stream-hud">
        <span className="pill live-dot">🔴 LIVE</span>
        <span className="stream-viewers" style={flopping ? { color: 'var(--red)' } : null}>👁 {viewers.toLocaleString()} watching{flopping ? ' · quiet room…' : ''}</span>
        <span className="pill" style={{ background:'#36d39922', color:'var(--green)' }}>💸 {fmtMoney(tips)} tips</span>
        {keptValue > 0 && <span className="pill" style={{ background:'#3b6cff22', color:'#9db8ff' }}
          title="Market value of the cards you're keeping from this rip">🃏 {fmtMoney(keptValue)} kept</span>}
        {isBreak && <span className={`pill ${liveSpotFlash ? 'spot-pop' : ''}`} style={{ background:'#ffcb0522', color:'var(--gold)' }}>📦 Break · {filledSpots}/{spots} spots</span>}
        <span className="pill" title={isBreak
            ? 'Tips + spot cash + value of cards you keep (unfilled spots), minus the box cost'
            : 'Tips + market value of every card you rip, minus the box cost'}
          style={{ background: net >= 0 ? '#36d39922' : '#ff5e6c22', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
          Net {net >= 0 ? '+' : ''}{fmtMoney(net)}
        </span>
        <span className="pill" style={{ marginLeft:'auto' }}>📦 Pack {Math.min(packNo + (phase==='revealing'?1:0), totalPacks)}/{totalPacks}</span>
      </div>
      {totalPacks > 1 && (
        <div className="stream-progress" aria-hidden="true"><div style={{ width: progressPct + '%' }} /></div>
      )}

      {isGod && (phase === 'revealing' || phase === 'packdone') && (
        <div className="godbanner">✨🎉 GOD PACK!! 🎉✨<small>Every card is a hit — chat is losing it.</small></div>
      )}
      {isDemigod && (phase === 'revealing' || phase === 'packdone') && (
        <div className="demigodbanner">DEMIGOD PACK! <small>chat is hyped.</small></div>
      )}

      <div className="stream-body">
        <div className="stream-stage">
          {pulls.length === 0 && !done && (
            <div className="stream-prompt">
              <div className="pack3d" onClick={ripPack} style={{ cursor:'pointer' }}
                role="button" tabIndex={0} aria-label="Rip the first pack live"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ripPack() } }}>
                <div className="foil" />
                {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <b>{set.name}</b>}
                <span className="hint">▶ Rip the first pack live</span>
              </div>
            </div>
          )}

          {pulls.length > 0 && (
            <div className="stream-revealwrap">
              <NowRevealing card={current} />
              <div className="reveal-row" style={{ marginTop: 0 }}>
                {pulls.map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  const chase = c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare')
                  // this card's global spot (for the break ship tag)
                  const gp = allPulled.current.find(p => p.card.uid === c.uid)
                  const spotIdx = gp ? gp.spot : null
                  const owner = spotIdx != null ? (spotIdx < filledSpots ? spotOwners[spotIdx] : 'YOU') : null
                  return (
                    <div key={c.uid} style={{ position:'relative' }}>
                      <HoloCard card={c} extraStyle={{ '--rarity': edge }}
                        className={`reveal-card ${i < shown ? 'shown' : ''} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                        <img src={c.img} alt={c.name} decoding="async" />
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
            {canRip && pulls.length > 0 && (
              <button className="btn gold" style={{ maxWidth: 220 }} disabled={phase === 'revealing'} onClick={ripPack}>Rip next pack ({packNo + 1}/{totalPacks}) →</button>
            )}
            {!done && (totalPacks - packNo) >= 2 && phase !== 'revealing' && (
              <button className="btn alt" style={{ flex:'none', maxWidth: 200 }} onClick={skipRest}>
                ⏩ Skip to end ({totalPacks - packNo} left)
              </button>
            )}
            {done && <button className="btn gold" style={{ maxWidth: 240 }} onClick={endStream}>End stream & cash out →</button>}
            {!done && <button className="btn alt" style={{ flex:'none', maxWidth: 150 }} onClick={endStream}>End early</button>}
          </div>

          {hits.length > 0 && (
            <div className="stream-hits">
              <div className="rip-side-head">On-stream hits ({hits.length})</div>
              <div className="stream-hits-row">
                {[...hits].sort((a,b)=>cardValue(b)-cardValue(a)).map((c,i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  return (
                    <div key={c.uid+'-'+i} className="stream-hit" style={{ '--rarity': edge }} title={`${c.name} · ${fmtMoney(cardValue(c))}`}>
                      <img src={c.img} alt="" /><span>{fmtMoney(cardValue(c))}</span>
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
              <div key={m.id} className={`chat-msg ${m.tip ? 'tip' : ''}`}>
                {m.tip ? <span>{m.text}</span> : <><b style={{ color: handleColor(m.handle) }}>{m.handle}</b> {m.text}</>}
              </div>
            ))}
          </div>
        </aside>
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
        const label = card.foil ? card.foil.label : `${card.reverse ? 'Reverse Holo · ' : ''}${card.rarity}`
        const showPsa10 = !card.grade && (card._isHit || card.foil)
        return (
          <div className="rip-now-card" style={{ '--rarity': edge }}>
            <img src={card.img} alt={card.name} decoding="async" fetchpriority="high" />
            <div className="rip-now-name">{card.foil ? `${card.foil.badge} ` : ''}{card.name}</div>
            <div className="rip-now-meta" style={{ color: edge }}>{label}</div>
            <div className="rip-now-val">{fmtMoney(cardValue(card))}</div>
            {showPsa10 && <div className="rip-now-psa10" title="What this card would be worth graded PSA 10">💎 PSA 10 <b>{fmtMoney(psa10Value(card))}</b></div>}
          </div>
        )
      })() : <div className="muted" style={{ fontSize: 12 }}>Tearing it open…</div>}
    </aside>
  )
}

// --- Summary -----------------------------------------------------------------
function StreamSummary({ session, onDone }) {
  const s = session?.summary
  if (!s) { onDone(); return null }
  const hitValue = s.hits.reduce((a, c) => a + cardValue(c), 0)
  const breakPL = s.isBreak ? Math.round((s.spotGross - s.product.price) * 100) / 100 : null
  const flopped = isFlop(s.peak)
  return (
    <div className="stage">
      <div style={{ textAlign:'center', maxWidth: 520 }}>
        <h2 style={{ marginBottom: 4 }}>{flopped ? '🦗 Stream over — quiet one.' : '📴 Stream over — GG!'}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {s.packsRipped} pack{s.packsRipped>1?'s':''} of {s.set.name}{flopped ? ' to a near-empty room.' : ', ripped live for the people.'}
        </p>
        <div className="stream-summary-grid">
          <div><span className="muted">Peak viewers</span><b>👁 {s.peak.toLocaleString()}</b></div>
          <div><span className="muted">Tips banked</span><b style={{ color:'var(--green)' }}>{fmtMoney(s.tips)}</b></div>
          <div><span className="muted">Notoriety</span><b style={{ color: s.noto >= 0 ? 'var(--gold)' : 'var(--red)' }}>{s.noto>=0?'+':''}{s.noto}★</b></div>
          <div><span className="muted">Your hits kept</span><b>{s.hits.length} · {fmtMoney(hitValue)}</b></div>
          {s.isBreak && <div><span className="muted">Spots sold</span><b>{s.spotsSold}/{s.spots}</b></div>}
          {s.isBreak && <div><span className="muted">Break P/L</span><b style={{ color: breakPL >= 0 ? 'var(--green)' : 'var(--red)' }}>{breakPL>=0?'+':''}{fmtMoney(breakPL)}</b></div>}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {s.noto > 0 ? '🔥 Your shop is buzzing — listing traffic is boosted for the next few days. Hop to the Sell tab.'
            : '😬 Barely anyone watched — no afterglow this time. Build some buzz before going live again.'}
          {s.isBreak && s.shipped > 0 && ` Shipped ${s.shipped} card${s.shipped>1?'s':''} to spot-holders; unsold-spot cards are in your collection.`}
          {' · A day passed while you streamed.'}
        </p>
        <button className="btn gold" style={{ maxWidth: 200, marginTop: 12 }} onClick={onDone}>Done →</button>
      </div>
    </div>
  )
}

// --- helpers -----------------------------------------------------------------
function bestProduct(products) { return [...products].sort((a, b) => (b.packs - a.packs) || (b.price - a.price))[0] }
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
