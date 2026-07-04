import { useEffect, useRef, useState, useCallback } from 'react'
import { useGame } from '../game/store'
import { SHOP_SETS, setProducts, openPack, makeProductPromo, isHit, cardValue, psa10Value, psaValueAt, fmtMoney, rarityRank, HIT_THRESHOLD, preloadCardImages, setById } from '../game/engine'
import {
  baseViewers, fatigueMult, viewerReaction, tipsFor, streamNotoriety, isFlop, isStreamHype,
  chatLine, reactionKind, spotPrice, spotsFilled, followersGained, hypeTrainMult, HYPE_TRAIN_MAX, streamDrawMult,
} from '../game/stream'
import { rarityColor } from './CardTile'
import HoloCard from './HoloCard'
import Burst from './Burst'
import { confirmDialog, toast } from '../ui/dialog'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { configureFeedback, primeAudio, sfxHit, sfxGod } from '../game/feedback'

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
// You can ONLY stream product you already HOLD in sealed inventory — no buying right before
// a stream. Source low (shop / shows), hold it, then break it live for tips + fame.
function StreamSetup({ notoriety, fatigue, streamStats, onGoLive }) {
  const followers = useGame(s => s.followers || 0)
  const collectBreakSpots = useGame(s => s.collectBreakSpots)
  const inventory = useGame(s => s.sealedInventory)
  const ripSealedAction = useGame(s => s.ripSealed)

  const [invUid, setInvUid] = useState(null)
  useEffect(() => {
    if (!inventory.find(i => i.uid === invUid)) setInvUid(inventory[0]?.uid || null)
  }, [inventory, invUid])
  const invItem = inventory.find(i => i.uid === invUid) || null

  const set = invItem ? (setById(invItem.setId) || SHOP_SETS[0]) : null
  const product = invItem ? invItem.product : null
  const canBreak = !!product && product.packs >= 2

  const [doBreak, setDoBreak] = useState(false)
  const [spots, setSpots] = useState(4)

  const fresh = fatigueMult(fatigue)
  const draw = set ? streamDrawMult(set, product) : 1
  const expected = Math.round(baseViewers(notoriety, fresh, followers) * draw)
  const per = product ? spotPrice(product.price, spots, notoriety) : 0

  // keep break toggle valid when switching to a single-pack product
  useEffect(() => { if (!canBreak && doBreak) setDoBreak(false) }, [canBreak, doBreak])

  function go() {
    if (!invItem) return
    primeAudio() // this click is our chance to start audio under the browser's autoplay policy
    // Consume the held product from inventory — no charge, you already paid when you bought it.
    const it = ripSealedAction(invItem.uid)
    if (!it) return toast('That product is no longer in your inventory.')
    useGame.getState().log('stream', `Broke a held ${product.type} (${set.name}) on stream`, 0)

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
        🔴 <b>Go live & rip on camera.</b> You break product you <b>already hold</b> — viewers tune in, react to your
        pulls, and tip. A hot stream banks a notoriety jump and pumps your store's traffic for days — but it
        <b> burns a game-day</b>, and streaming often <b>tires your audience</b> (rest a few days to recover).
        {streamStats?.streams ? <span className="muted"> · {streamStats.streams} stream{streamStats.streams>1?'s':''} · peak {streamStats.peakViewers} · {fmtMoney(streamStats.tips)} tipped lifetime</span> : null}
        {followers > 0 && <span className="pill" style={{ marginLeft: 8, background:'color-mix(in srgb, var(--accent2) 13%, transparent)', color:'var(--accent-light)' }}>👥 {followers.toLocaleString()} followers</span>}
      </div>

      {inventory.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          📦 You have no sealed product to break. Streams rip from your <b>held inventory</b> only —
          <b> buy sealed on the Buy tab</b> (or source it at a show), then come back and break it live.
        </div>
      ) : (
        <>
          <div className="market-panel" style={{ marginTop: 14 }}>
            <div className="market-head">🎬 What are you breaking? <span className="muted">— from your 📦 inventory</span></div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <select value={invUid || ''} onChange={e => setInvUid(e.target.value)}>
                {inventory.map(it => {
                  const s = setById(it.setId)
                  const tag = it.vintage ? '🗝️ ' : s?.secondary ? '🕰️ ' : ''
                  return <option key={it.uid} value={it.uid}>{tag}{it.product.icon || '📦'} {s?.name} {it.product.type} · {it.product.packs} pk</option>
                })}
              </select>
              {set?.vintage
                ? <span className="pill" style={{ marginLeft: 'auto', background:'color-mix(in srgb, var(--gold) 16%, transparent)', color:'var(--gold)' }}>🗝️ Vintage · huge draw</span>
                : <span className="pill" style={{ marginLeft: 'auto' }}>{product?.packs} pack{product?.packs>1?'s':''} · owned</span>}
            </div>
            {draw > 1.05 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {set?.vintage
                  ? `🗝️ Breaking sealed VINTAGE on camera is appointment viewing — expect a much bigger crowd (~${Math.round((draw-1)*100)}% more viewers).`
                  : `🕰️ Older sealed pulls a bigger crowd (~${Math.round((draw-1)*100)}% more viewers).`}
              </p>
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
                  All {spots} filling collects <b style={{ color: 'var(--green)' }}>{fmtMoney(per * spots)}</b> vs a box you already own.
                  Whatever doesn't sell, you keep those teams' pulls.
                </p>
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
            <button className="btn gold" style={{ maxWidth: 300 }} disabled={!invItem} onClick={go}>
              🔴 Go live — break your {product?.icon || ''} {product?.type}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            Expecting ~{expected.toLocaleString()} viewers
            {fresh < 0.99 && <span style={{ color: 'var(--gold)' }}> · audience {Math.round(fresh*100)}% fresh (you've streamed recently — rest to recover)</span>}
            {isFlop(expected) && <span style={{ color: 'var(--red)' }}> · ⚠️ risky — barely anyone may show (a flop dings rep)</span>}
            {' · costs 1 game-day'}
          </p>
        </>
      )}
    </div>
  )
}

// --- Live --------------------------------------------------------------------
function LiveStage({ session, notoriety, fatigue, onEnd }) {
  const { set, product, isBreak, spots, spotsSold, perSpot } = session
  const addPulls = useGame(s => s.addPulls)
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const autoAdvance = useGame(s => s.settings.autoAdvance ?? false)
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const followers = useGame(s => s.followers || 0)
  const regulars = useGame(s => s.regulars)
  const collection = useGame(s => s.collection)
  const giveawayCard = useGame(s => s.giveawayCard)
  const speed = Math.max(0.25, ripSpeed)
  const ms = (n) => n / speed

  // Keep the SFX module in sync with the player's sound/haptics settings.
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])

  const totalPacks = product.packs
  const settled = Math.round(baseViewers(notoriety, fatigueMult(fatigue), followers) * streamDrawMult(set, product))

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
  // Hype train (consecutive hits stack a tip multiplier) + a live combo counter.
  const [hypeLevel, setHypeLevel] = useState(0)
  const [combo, setCombo] = useState(0)
  // Followers earned THIS session (giveaway + goal bonuses) — the base performance gain is
  // added at cash-out. Kept in the component so the store's follower count moves exactly once.
  const [sessionFollowers, setSessionFollowers] = useState(0)
  const [giveawayOpen, setGiveawayOpen] = useState(false) // the "pick a card to give away" picker
  const [giveaways, setGiveaways] = useState(0)            // how many you've raffled this stream
  const [goal] = useState(() => pickStreamGoal(product))
  const [goalMet, setGoalMet] = useState(false)

  const peakRef = useRef(settled)
  const chatBoxRef = useRef(null)
  const finishedRef = useRef(false)
  const autoRef = useRef(false)
  const hypeRef = useRef(0)          // mirror of hypeLevel readable inside timer callbacks
  const regularsRef = useRef([])     // live online-regular roster for chat attribution
  // every card pulled, tagged with its spot index (for break shipping at the end)
  const allPulled = useRef([])  // { card, spot }  (spot only set for breaks)
  regularsRef.current = (regulars || []).filter(r => !r.flags?.burned)

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
      if (cards._god) { setBurst(true); sfxGod(); after(() => setBurst(false), ms(2500)) }
      else if (cards._demigod) { setBurst(true); sfxGod(); after(() => setBurst(false), ms(1500)) }
      setPackNo(n => { const np = n + 1; if (np >= totalPacks) finishSoon(); return np })
      setPhase('packdone'); return
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
    setViewers(v => { const next = Math.max(1, Math.round(v * viewerReaction(c))); peakRef.current = Math.max(peakRef.current, next); return next })
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
    const t = tipsFor(c, peakRef.current, Math.random, hypeMult)
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

  // Cards a break buyer already paid for (on a filled spot) can't be given away — they ship
  // to that buyer at the end. Everything else you own is fair game for a raffle.
  const reservedUids = new Set(allPulled.current.filter(p => p.spot != null && p.spot < filledSpots).map(p => p.card.uid))

  // Raffle ANY card you own to a lucky viewer — a follower pop + chat frenzy. A pricier
  // giveaway lands a bigger crowd. Repeatable all stream long (generosity feeds the loyalty
  // loop). `uid` comes from the giveaway picker.
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
        // keep the hype train rolling through the skip so its tip multiplier still applies
        const good = kind === 'hit' || kind === 'hype' || kind === 'god' || kind === 'demigod'
        hypeRef.current = good
          ? Math.min(HYPE_TRAIN_MAX, hypeRef.current + (kind === 'god' ? 3 : (kind === 'hype' || kind === 'demigod') ? 2 : 1))
          : Math.max(0, hypeRef.current - 1)
        addedTips += tipsFor(c, peakRef.current, Math.random, hypeTrainMult(hypeRef.current))
        if (c._isHit || c.foil) addedHits.push(c)
      })
    }
    if (addedTips) setTips(x => Math.round((x + addedTips) * 100) / 100)
    if (hype) setHypeMoments(m => m + hype)
    setHypeLevel(hypeRef.current)
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
    // Followers earned: base performance (peak + hype moments) + this session's giveaway/goal
    // bonuses. A flop earns none of the base. The store applies the whole gain at once.
    const flopped = isFlop(peak)
    const followerGain = followersGained(peak, hypeMoments, flopped) + sessionFollowers
    // breaks: ship the cards that landed on FILLED spots; keep the rest (your teams)
    let shipped = 0, keptHits = hits
    if (isBreak) {
      const shipUids = allPulled.current.filter(p => p.spot < filledSpots).map(p => p.card.uid)
      shipped = useGame.getState().shipBreakCards(shipUids)
      const shipSet = new Set(shipUids)
      keptHits = hits.filter(h => !shipSet.has(h.uid))
    }
    useGame.getState().endStream({ tips, noto, peakViewers: peak, followers: followerGain })
    // A solid (non-flop) stream can win you a new online regular — streaming feeds the loyalty loop.
    if (!flopped && noto > 0) useGame.getState().formRegular({ channel: 'online', setId: set.id, setName: set.name, generous: hypeMoments > 0 })
    onEnd({ peak, noto, tips, hits: keptHits, packsRipped: totalPacks, isBreak,
      spotsSold: filledSpots, spots, spotGross: Math.round(filledSpots * perSpot * 100) / 100,
      shipped, set, product, followers: followerGain })
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
        {isBreak && <span className={`pill ${liveSpotFlash ? 'spot-pop' : ''}`} style={{ background:'color-mix(in srgb, var(--gold) 13%, transparent)', color:'var(--gold)' }}>📦 Break · {filledSpots}/{spots} spots</span>}
        <span className="pill" title={isBreak
            ? 'Tips + spot cash + value of cards you keep (unfilled spots), minus the box cost'
            : 'Tips + market value of every card you rip, minus the box cost'}
          style={{ background: net >= 0 ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
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

      {goal && (
        <div className={`stream-goal ${goalMet ? 'met' : ''}`}>
          {goalMet ? '✅' : '🎯'} <b>Stream goal:</b> {goal.label}
          <span className="muted"> · +{goal.reward} followers{goalMet ? ' — done!' : ''}</span>
        </div>
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
                      <HoloCard card={c} interactive={i < shown} extraStyle={{ '--rarity': edge }}
                        className={`reveal-card ${i < shown ? 'shown' : 'facedown'} ${(c._isHit||c.foil) ? 'hit' : ''} ${chase ? 'chase' : ''}`}>
                        <div className="flip">
                          <div className="flip-back" aria-hidden="true" />
                          <div className="flip-front"><img src={c.img} alt={i < shown ? c.name : ''} decoding="async" /></div>
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
            {canRip && pulls.length > 0 && (
              <button className="btn gold" style={{ maxWidth: 220 }} disabled={phase === 'revealing'} onClick={ripPack}>Rip next pack ({packNo + 1}/{totalPacks}) →</button>
            )}
            {!done && (totalPacks - packNo) >= 2 && phase !== 'revealing' && (
              <button className="btn alt" style={{ flex:'none', maxWidth: 200 }} onClick={skipRest}>
                ⏩ Skip to end ({totalPacks - packNo} left)
              </button>
            )}
            {!done && (
              <button className="btn alt" style={{ flex:'none', maxWidth: 190 }} disabled={!collection.length} onClick={() => setGiveawayOpen(true)}
                title={collection.length ? 'Raffle any card you own to a viewer — a burst of new followers (bigger cards = bigger pop)' : 'You have no cards to give away'}>
                🎁 Giveaway{giveaways > 0 ? ` (${giveaways})` : ''}
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
                  <img src={c.img} alt={c.name} loading="lazy" decoding="async" style={{ width: '100%', borderRadius: 8 }} />
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
        const label = card.foil ? card.foil.label : `${card.reverse ? 'Reverse Holo · ' : ''}${card.rarity}`
        return (
          <div className="rip-now-card" style={{ '--rarity': edge }}>
            <img src={card.img} alt={card.name} decoding="async" fetchpriority="high" />
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
          {s.followers > 0 && <div><span className="muted">New followers</span><b style={{ color:'var(--accent-light)' }}>👥 +{s.followers}</b></div>}
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
