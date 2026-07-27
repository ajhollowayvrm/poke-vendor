import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPack, openProduct, makeProductPromo, isHit, cardValue, fmtMoney, rarityRank,
  preloadCardImages, cardImg, setById } from '../game/engine'
import { cardMatchesWant } from '../game/shows'
import { useGame } from '../game/store'
import { rarityColor } from './CardTile'
import CardModal from './CardModal'
import HoloCard from './HoloCard'
import Burst from './Burst'
import { configureFeedback, primeAudio, sfxTear, sfxHit, sfxGod } from '../game/feedback'

// Chase-tier = the cards worth stopping the whole sift for (Master Ball foils and SIR+).
function isChase(c) { return c.foil?.key === 'masterball' || rarityRank(c.rarity) >= rarityRank('Special Illustration Rare') }

// "Big hit" thresholds — how good a card has to be for the sifter to STOP and hand you the
// pack to rip yourself. Chase-only sets the value bar to infinity, so only a Master Ball / SIR+
// (or a want-fill / god pack) breaks the churn.
const STOP_LEVELS = [
  { key: 25,  label: '$25+',  blurb: 'Stop on anything $25 or up' },
  { key: 50,  label: '$50+',  blurb: 'Only bigger hits break the churn' },
  { key: 150, label: '$150+', blurb: 'Chase-money only' },
  { key: Infinity, label: 'Chase only', blurb: 'Only a Master Ball / SIR+ stops it' },
]

// AUTO-RIP / "sift": churn through a whole GROUP of sealed one pack at a time, banking the
// forgettable packs automatically and STOPPING on any pack with a big hit so you can rip THAT
// one by hand. `items` are sealed inventory rows; each is consumed (ripSealed) as its turn
// comes up, its packs banked as they're opened — so backing out never loses product.
export default function AutoRip({ items, onExit }) {
  const ripSpeed = useGame(s => s.settings.ripSpeed ?? 1)
  const soundOn = useGame(s => s.settings.sound ?? true)
  const hapticsOn = useGame(s => s.settings.haptics ?? true)
  const addPulls = useGame(s => s.addPulls)
  const ripSealed = useGame(s => s.ripSealed)
  const wantList = useGame(s => s.wantList)
  const forumPosts = useGame(s => s.forumPosts)
  const activeWants = useMemo(() => [...(wantList || []), ...(forumPosts || [])], [wantList, forumPosts])

  const [phase, setPhase] = useState('intro')   // intro | sifting | hit | reveal | done
  const [minValue, setMinValue] = useState(25)
  const [feed, setFeed] = useState([])
  const [stats, setStats] = useState({ packs: 0, value: 0, hitPacks: 0, best: null, hits: [] })
  const [pending, setPending] = useState(null)   // { set, product, cards, hit } awaiting a manual rip
  const [reveal, setReveal] = useState(null)     // { set, cards } — the hit pack you just tore open
  const [tear, setTear] = useState(0)
  const [burst, setBurst] = useState(false)
  const [modalCard, setModalCard] = useState(null)

  const speed = Math.max(0.25, ripSpeed)
  const ms = (n) => n / speed
  const timers = useRef([])
  const after = (fn, d) => { const id = setTimeout(() => { timers.current = timers.current.filter(t => t !== id); fn() }, d); timers.current.push(id); return id }
  useEffect(() => { configureFeedback({ sound: soundOn, haptics: hapticsOn }) }, [soundOn, hapticsOn])

  // Work state lives in refs (the sift loop reads/advances it outside React's render cycle).
  const queue = useRef([...items])   // sealed rows not yet started (still in inventory)
  const cur = useRef(null)           // { set, product, packsLeft, promo }
  const running = useRef(false)      // a between-packs timer is pending — don't double-pump
  const minRef = useRef(minValue)
  minRef.current = minValue

  function wantFor(card) { return activeWants.find(w => cardMatchesWant(card, w)) }
  function tagCards(cards) {
    cards.forEach(c => { c._isHit = isHit(c); const w = wantFor(c); if (w) { c._fillsWant = true; c._wantWho = w.who; c._wantForum = !!w.forum; c._wantPremium = w.premiumMult } })
    return cards
  }
  function bigHitIn(cards) {
    if (cards._god) return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), null)
    return cards.find(c => c._fillsWant || isChase(c) || cardValue(c) >= minRef.current) || null
  }
  function pickBest(best, cards) { return cards.reduce((b, c) => (cardValue(c) > (b ? cardValue(b) : 0) ? c : b), best) }
  // Bank a pack to the collection AND fold it into the on-screen tally.
  function bankPack(cards, set) {
    addPulls(cards, set.name, 1)
    const v = cards.reduce((a, c) => a + cardValue(c), 0)
    const newHits = cards.filter(c => c._isHit || c.foil)
    setStats(s => ({ ...s, packs: s.packs + 1, value: s.value + v, best: pickBest(s.best, cards), hits: newHits.length ? [...newHits, ...s.hits] : s.hits }))
  }
  function pushFeed(line, key) { setFeed(f => [{ line, key: key || `${f.length}-${line}` }, ...f].slice(0, 10)) }

  // The heart of the sift: advance until we hit a big-hit pack (then stop for you) or run dry.
  function pump() {
    if (running.current) return
    if (!cur.current) {
      if (!queue.current.length) { setPhase('done'); return }
      const it = queue.current.shift()
      const removed = ripSealed(it.uid)                   // consume this unit from inventory now
      if (!removed) { pump(); return }                    // already gone (sold/moved) — skip it, don't rip a phantom
      const set = setById(it.setId)
      cur.current = { set, product: it.product, packsLeft: it.product?.packs || 1, promo: it.product?.bonus === 'promo' }
    }
    const c = cur.current
    if (!c.set) { cur.current = null; pump(); return }    // unknown set — skip it defensively
    if (c.packsLeft > 0) {
      const cards = tagCards(openPack(c.set))
      const hit = bigHitIn(cards)
      if (hit) {
        // STOP — hand this pack to the player. It isn't banked or counted until they rip it.
        setPending({ set: c.set, product: c.product, cards, hit })
        setTear(0); setPhase('hit')
        setStats(s => ({ ...s, hitPacks: s.hitPacks + 1 }))
        pushFeed(`🔥 ${c.set.name} — ${hit.name} (${fmtMoney(cardValue(hit))}) — rip it yourself →`)
        return
      }
      bankPack(cards, c.set)
      c.packsLeft--
      running.current = true
      after(() => { running.current = false; pump() }, ms(240))
      return
    }
    if (c.promo) {
      c.promo = false
      const promo = makeProductPromo(c.set, c.product)
      if (promo) {
        promo._isHit = isHit(promo)
        addPulls([promo], `${c.product.type} promo · ${c.set.name}`, 0)
        setStats(s => ({ ...s, value: s.value + cardValue(promo), best: pickBest(s.best, [promo]), hits: (promo._isHit || promo.foil) ? [promo, ...s.hits] : s.hits }))
        pushFeed(`${promo._stamp === 'pc' ? '🏬 PC stamped promo' : '🎁 Promo'}: ${promo.name} (${fmtMoney(cardValue(promo))})`)
      }
      running.current = true
      after(() => { running.current = false; pump() }, ms(200))
      return
    }
    cur.current = null                                    // this item is done — on to the next
    running.current = true
    after(() => { running.current = false; pump() }, ms(120))
  }

  function start() { primeAudio(); setPhase('sifting'); after(() => pump(), ms(300)) }

  // Manually tear open the flagged hit pack, then reveal what stopped the sifter.
  function ripPending() {
    if (!pending || phase !== 'hit') return
    primeAudio()
    preloadCardImages(pending.cards)
    setPhase('reveal')
    sfxTear()
    const p = pending
    after(() => {
      setReveal({ set: p.set, cards: p.cards })
      bankPack(p.cards, p.set)                             // the rip IS the acquisition
      if (cur.current) cur.current.packsLeft--
      setPending(null)                                     // banked now — flush must not re-bank it
      const chase = isChase(p.hit) || p.cards._god
      if (chase) { sfxGod() } else { sfxHit(rarityRank(p.hit.rarity) - rarityRank('Double Rare'), false) }
      setBurst(true); after(() => setBurst(false), 1800)
    }, ms(650))
  }
  function continueSift() { setPending(null); setReveal(null); setPhase('sifting'); after(() => pump(), ms(150)) }

  // Drag-to-rip on the flagged pack (mirrors the main opener's feel).
  const dragRef = useRef({ active: false, startY: 0 })
  const RIP_DRAG = 130
  function onPackDown(e) { if (phase !== 'hit') return; dragRef.current = { active: true, startY: e.clientY }; primeAudio(); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
  function onPackMove(e) { if (!dragRef.current.active) return; const dy = e.clientY - dragRef.current.startY; setTear(Math.max(0, Math.min(1, dy / RIP_DRAG))); if (dy >= RIP_DRAG) { dragRef.current.active = false; ripPending() } }
  function onPackUp() { if (!dragRef.current.active) return; dragRef.current.active = false; if (phase === 'hit') setTear(0) }

  // Bank everything still un-ripped WITHOUT touching React state — safe to run on unmount so
  // backing out (or navigating away) never strands product you already pulled from inventory.
  const flush = useRef(() => {})
  const flushed = useRef(false)
  flush.current = () => {
    if (flushed.current) return                          // idempotent — never bank the remainder twice
    flushed.current = true
    if (pending) { addPulls(tagCards(pending.cards), pending.set.name, 1); if (cur.current) cur.current.packsLeft--; }
    if (cur.current && cur.current.set) {
      for (let i = 0; i < cur.current.packsLeft; i++) addPulls(tagCards(openPack(cur.current.set)), cur.current.set.name, 1)
      if (cur.current.promo) { const p = makeProductPromo(cur.current.set, cur.current.product); if (p) { p._isHit = isHit(p); addPulls([p], '', 0) } }
    }
    cur.current = null
    while (queue.current.length) {
      const it = queue.current.shift(); const removed = ripSealed(it.uid); if (!removed) continue
      const set = setById(it.setId); if (!set) continue
      const all = openProduct(set, it.product); all.forEach(c => (c._isHit = isHit(c))); addPulls(all, set.name, it.product?.packs || 1)
    }
  }
  useEffect(() => () => { timers.current.forEach(clearTimeout); flush.current() }, [])

  // "Finish & bank the rest": stop sifting, sweep everything left straight into the collection.
  function finishRest() { flush.current(); setPhase('done') }
  function done() { flush.current(); onExit && onExit() }

  const totalPacks = useMemo(() => items.reduce((a, it) => a + (it.product?.packs || 1), 0), [items])
  const remainingItems = () => queue.current.length + (cur.current ? 1 : 0)
  const modalEl = modalCard && createPortal(<CardModal card={modalCard} readOnly onClose={() => setModalCard(null)} />, document.body)

  // ---- INTRO: pick the group + the "big hit" bar --------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <h2 style={{ marginBottom: 4 }}>⚡ Sift-rip</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
            Rips <b>{items.length} item{items.length === 1 ? '' : 's'}</b> — <b>{totalPacks} pack{totalPacks === 1 ? '' : 's'}</b> — one at a time,
            banking the forgettable ones for you and <b>stopping on any pack with a big hit</b> so you can rip that one by hand.
          </p>
          <div className="sift-levels">
            <div className="rip-side-head">Stop the sifter on…</div>
            <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              {STOP_LEVELS.map(l => (
                <button key={l.label} className={`chip-btn ${minValue === l.key ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
                  onClick={() => setMinValue(l.key)} title={l.blurb}>
                  <b>{l.label}</b><small>{l.blurb}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18, gap: 10 }}>
            <button className="btn gold" style={{ maxWidth: 240 }} onClick={start}>⚡ Start sifting {totalPacks} packs →</button>
            <button className="btn alt" style={{ flex: 'none', maxWidth: 120 }} onClick={onExit}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // Plain JSX values (not inline components) so frequent re-renders during the churn reconcile
  // by key instead of remounting — the feed rows keep their identity and don't re-animate.
  const tally = (
    <div className="pack-progress">
      <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>📦 {stats.packs} sifted{remainingItems() ? ` · ${remainingItems()} item${remainingItems() === 1 ? '' : 's'} left` : ''}</span>
      <span className="pill" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', color: 'var(--green)' }} title="Everything pulled so far this sift">💰 {fmtMoney(stats.value)} pulled</span>
      {stats.hitPacks > 0 && <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 13%, transparent)', color: 'var(--gold)' }}>🔥 {stats.hitPacks} big hit{stats.hitPacks === 1 ? '' : 's'}</span>}
    </div>
  )
  const feedEl = (
    <div className="sift-feed">
      {feed.map(f => <div key={f.key} className="sift-feed-row">{f.line}</div>)}
    </div>
  )

  // ---- DONE ---------------------------------------------------------------------------------
  if (phase === 'done') {
    return (
      <div className="stage">
        <div style={{ textAlign: 'center', maxWidth: 560 }}>
          <h2 style={{ marginBottom: 6 }}>✓ Sift complete</h2>
          <p style={{ fontSize: 15, margin: '4px 0' }}>
            Sifted <b>{stats.packs}</b> pack{stats.packs === 1 ? '' : 's'} · pulled <b style={{ color: 'var(--green)' }}>{fmtMoney(stats.value)}</b>
            {stats.hitPacks > 0 && <> · <b style={{ color: 'var(--gold)' }}>{stats.hitPacks}</b> big hit{stats.hitPacks === 1 ? '' : 's'}</>}
          </p>
          {stats.best && <p className="muted" style={{ fontSize: 13 }}>Best pull: <b style={{ color: rarityColor(stats.best.rarity) }}>{stats.best.name}</b> · {fmtMoney(cardValue(stats.best))}</p>}
          {stats.hits.length > 0 && (
            <div className="rip-summary-hits" style={{ marginTop: 10 }}>
              <div className="rip-side-head" style={{ textAlign: 'center' }}>Hits ({stats.hits.filter(c => c._isHit || c.foil).length})</div>
              <div className="rip-summary-hits-grid">
                {[...stats.hits].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 24).map((c, i) => {
                  const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                  return (
                    <button key={c.uid + '-' + i} className="rip-hit-row" style={{ '--rarity': edge }} onClick={() => setModalCard(c)} title="Tap for the full card details">
                      <img src={cardImg(c)} alt="" />
                      <div className="rip-hit-info">
                        <div className="rip-hit-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                        <div className="rip-hit-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : c.rarity}</div>
                      </div>
                      <div className="rip-hit-val">{fmtMoney(cardValue(c))}{c._fillsWant && <div className="rip-hit-want">⭐ Fills a want</div>}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {modalEl}
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn gold" style={{ maxWidth: 200 }} onClick={() => onExit && onExit()}>Done →</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- HIT: the flagged pack, waiting for you to tear it open --------------------------------
  if (phase === 'hit') {
    return (
      <div className="stage">
        {tally}
        <div className="banner" style={{ maxWidth: 460, textAlign: 'center' }}>
          🔥 <b>Big one here.</b> The sifter stopped — this {pending?.set?.name} pack is holding a{' '}
          <b style={{ color: rarityColor(pending?.hit?.rarity) }}>{pending?.hit?.name}</b> ({fmtMoney(cardValue(pending?.hit || {}))}).
          Rip it yourself.
        </div>
        <div className="pack-wrap">
          <div className="pack3d" onClick={ripPending} role="button" tabIndex={0} aria-label="Rip the pack" style={{ '--tear': tear }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ripPending() } }}
            onPointerDown={onPackDown} onPointerMove={onPackMove} onPointerUp={onPackUp} onPointerCancel={onPackUp}>
            <div className="foil" />
            <div className="tear" aria-hidden="true" />
            {pending?.set?.logo ? <img className="logo" src={pending.set.logo} alt={pending.set.name} /> : <b>{pending?.set?.name}</b>}
            <span className="hint">▶ Click or drag down to rip</span>
          </div>
        </div>
        <button className="btn alt" style={{ maxWidth: 220 }} onClick={finishRest}>⏭️ Skip & bank the rest</button>
        {feedEl}
      </div>
    )
  }

  // ---- REVEAL: the torn-open hit pack, then continue -----------------------------------------
  if (phase === 'reveal') {
    return (
      <div className="stage">
        {burst && <Burst />}
        {tally}
        {reveal ? (
          <>
            <div className="rip-top-actions">
              <button className="btn gold" style={{ maxWidth: 240 }} onClick={continueSift}>{remainingItems() ? 'Keep sifting →' : 'Finish →'}</button>
            </div>
            <div className="reveal-row rip-reveal-grid">
              {reveal.cards.map(c => {
                const edge = c.foil ? c.foil.color : rarityColor(c.rarity)
                return (
                  <div key={c.uid} className="rip-cell">
                    <HoloCard card={c} interactive onClick={() => setModalCard(c)} extraStyle={{ '--rarity': edge }}
                      className={`reveal-card shown ${(c._isHit || c.foil) ? 'hit' : ''} ${isChase(c) ? 'chase' : ''}`}>
                      <div className="flip">
                        <div className="flip-back" aria-hidden="true">{reveal.set.logo && <img src={reveal.set.logo} alt="" />}</div>
                        <div className="flip-front"><img src={cardImg(c)} alt={c.name} decoding="async" fetchpriority="high" /></div>
                      </div>
                    </HoloCard>
                    <button className="rip-cell-foot" onClick={() => setModalCard(c)} title="Tap for the full card details">
                      <div className="rc-name">{c.foil ? `${c.foil.badge} ` : ''}{c.name}</div>
                      <div className="rc-meta" style={{ color: edge }}>{c.foil ? c.foil.label : c.grade ? `PSA ${c.grade.overall}` : `${c.reverse ? 'Reverse · ' : ''}${c.rarity}`}</div>
                      <div className="rc-val">{fmtMoney(cardValue(c))}</div>
                      {c._fillsWant && <div className="rc-badges"><span className="rc-want">⭐ Want</span></div>}
                    </button>
                  </div>
                )
              })}
            </div>
            {modalEl}
          </>
        ) : (
          <div className="pack-wrap"><div className="pack3d shake"><div className="foil" />{pending?.set?.logo ? <img className="logo" src={pending.set.logo} alt="" /> : null}</div></div>
        )}
      </div>
    )
  }

  // ---- SIFTING: the churn --------------------------------------------------------------------
  return (
    <div className="stage">
      {tally}
      <div className="sift-churn">
        <div className="sift-spinner" aria-hidden="true">📦💨</div>
        <div className="muted" style={{ fontSize: 13 }}>Sifting through your sealed… stopping on the big ones.</div>
      </div>
      <button className="btn alt" style={{ maxWidth: 220 }} onClick={finishRest}>⏭️ Skip & bank the rest</button>
      {feedEl}
    </div>
  )
}
