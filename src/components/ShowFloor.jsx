import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useGame, acceptedMethods } from '../game/store'
import { generateBooths, boothEncounter, SHOW_TIERS, NPC_EMOJI, vendorRapport, cardMatchesWant } from '../game/shows'
import { openPack, rarityRank, cardValue, fmtMoney, round2, SHOP_SETS as SETS, cardImg, setNameOfCard, fameMult, fameBeyond } from '../game/engine'
import VendorBooth from './VendorBooth'
import Encounter from './Encounter'
import PackOpening from './PackOpening'
import CardTile from './CardTile'
import { useModalEscape } from '../ui/dialog'
import { AnimatedNumber, CashFlash } from '../ui/AnimatedNumber'

const ENCOUNTER_COOLDOWN = 15000 // ms between booth walk-ups (longer = calmer floor)
// How many unsolicited walk-ups your booth can get in a show day. This was a flat 3 — so a
// world-famous vendor's table was as quiet as an unknown's, which is exactly backwards. A big
// name draws a crowd: 3 at noto 0 → 5 at 100 → 7 at 300 → 10 (the hard rail) past ~700.
function maxWalkupsPerDay(notoriety) {
  return Math.min(10, Math.round(2 + fameMult(notoriety)))
}
// A pull worth announcing to the whole hall: SIR-or-better, any special foil, or grail.
const ANNOUNCE_RANK = rarityRank('Special Illustration Rare')
function isBigPull(card) {
  return !!card.foil || !!card._grail || rarityRank(card.rarity) >= ANNOUNCE_RANK
}
const HYPE = ['just hit a', 'PULLED a', 'cracked a', 'opened a', 'just ripped a']

// The show floor, directory-style: every vendor is a LINE you can read and tap into —
// no walking a tile map. The hall still lives and breathes around the list: shoppers
// drift between tables (the 👥 crowd counts), rippers crack packs, and a big pull gets
// announced to the whole room. Pre-show leads surface as appointments + held items.
export default function ShowFloor({ show, onLeave }) {
  const notoriety = useGame(s => s.notoriety)
  const cash = useGame(s => s.cash) // shown on the floor HUD — you buy at booths here, so your balance must be visible
  const showReserve = useGame(s => s.showReserve || 0) // cash you left safely at home for this trip
  const upgrades = useGame(s => s.upgrades)
  // Snapshot the money/rep state the moment you walk the floor, so leaving can recap what
  // the FLOOR itself did (buying, selling, encounters) — distinct from the days-away home
  // recap that already fired at entry. stats.earned/spent only move on real cash in/out.
  const floorBaseRef = useRef(null)
  if (floorBaseRef.current === null) {
    const g = useGame.getState()
    floorBaseRef.current = {
      earned: g.stats.earned, spent: g.stats.spent, noto: g.notoriety,
      rapport: Object.values(g.vendorSpend || {}).reduce((a, v) => a + v, 0),
    }
  }
  // Leave: compute the floor recap from the baseline and hand it up to be folded into the
  // trip summary. takenIds counts every item lifted off a booth table this show.
  function handleLeave() {
    const g = useGame.getState()
    const b = floorBaseRef.current
    const floor = {
      spent: round2(g.stats.spent - b.spent),
      earned: round2(g.stats.earned - b.earned),
      notoGained: round2(g.notoriety - b.noto),
      rapport: round2(Object.values(g.vendorSpend || {}).reduce((a, v) => a + v, 0) - b.rapport),
      acquired: takenIds.size,
    }
    onLeave(floor)
  }
  const showInventory = useGame(s => s.showInventory)
  const showVendors = useGame(s => s.showVendors) // recurring roster (stable identities)
  const vendorSpend = useGame(s => s.vendorSpend)
  const collection = useGame(s => s.collection)
  const tier = SHOW_TIERS[show.tierKey]
  const [showTable, setShowTable] = useState(false) // peek at your booth inventory
  useModalEscape(() => setShowTable(false)) // Esc closes the table peek

  const [showDay, setShowDay] = useState(1) // which day of the multi-day show we're on
  // Recurring roster gets injected into the floor; `show._arrival` ('open' | 'late') tunes
  // how picked-over the booths are; `show._leads` makes a vendor who DM'd you actually be
  // here with the promised item on the table.
  // The floor is fixed per show-day: notoriety must NOT be a dependency here — it ticks
  // constantly at a show (sales, questions, giveaways), and every tick used to rebuild
  // the whole floor, restocking everything already bought and re-minting card uids.
  const booths = useMemo(() => {
    const bs = generateBooths(show, showDay - 1, showVendors, show._arrival || 'open', show._leads || [])
    // Stamp session-stable "taken" keys on sealed/mystery entries (cards already carry
    // uids): booth index + slot. Purchases mark these in takenIds so closing and
    // reopening a booth can never re-serve something you already bought.
    bs.forEach((b, bi) => { (b.products || []).forEach((p, pi) => { p._tk = `${bi}#s${pi}` }) })
    return bs
  }, [show, showDay, showVendors])

  // Everything bought off the floor this show — card uids + sealed `_tk` keys. Booth
  // stock is component state inside the booth modal, so without this a close/reopen
  // re-served every purchased item at the same uid (infinite rebuy of mispriced gems,
  // plus uid duplication: selling one copy silently destroyed both).
  const [takenIds, setTakenIds] = useState(() => new Set())
  const markTaken = (keys) => setTakenIds(prev => { const n = new Set(prev); for (const k of keys) n.add(k); return n })

  // Per-booth cash-till depletion for THIS show-day: selling to a vendor draws down their
  // finite till (booth.till), so you can't dump an unlimited amount on one whale. Keyed by
  // booth id + show-day so a fresh floor each day restocks the till.
  const [tillSpent, setTillSpent] = useState(() => ({}))
  const tillKey = (booth) => `${booth.id}#${showDay}`
  const markTillSpend = (booth, amt) => setTillSpent(prev => ({ ...prev, [tillKey(booth)]: (prev[tillKey(booth)] || 0) + amt }))

  const [openBooth, setOpenBooth] = useState(null)
  // Cards you've already haggled this show — one negotiation per card (no re-rolling
  // a vendor by re-opening the haggle). Persists across booth re-opens for the whole show.
  const [haggledIds, setHaggledIds] = useState(() => new Set())
  const markHaggled = useCallback((uid) => setHaggledIds(prev => { const n = new Set(prev); n.add(uid); return n }), [])
  const [vaultRip, setVaultRip] = useState(null) // { set, product } when ripping sealed on the floor
  const [encounter, setEncounter] = useState(null)
  const [toast, setToast] = useState(null)
  const [boothAlert, setBoothAlert] = useState(null)
  // Buyer appointments from pre-show leads — met (or ignored) during this show.
  const [meets, setMeets] = useState(() => (show._leads || []).filter(l => l.kind === 'buyer'))
  const [meetPick, setMeetPick] = useState(null) // the buyer lead being fulfilled
  const resolveEncounter = useGame(s => s.resolveEncounter)
  // seed with mount time so the cooldown window opens on entry — gives the player
  // a grace period to look around before the first walk-up fires (was 0 = instant).
  const lastEncounterRef = useRef(Date.now())
  // cap unsolicited walk-ups per show day so the floor doesn't feel like a gauntlet.
  const walkupsRef = useRef(0)
  useEffect(() => { walkupsRef.current = 0; lastEncounterRef.current = Date.now() }, [showDay])
  const accepted = useMemo(() => acceptedMethods(upgrades), [upgrades])

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600) }, [])

  // --- The living hall ---------------------------------------------------------
  // Shoppers drift from table to table (weighted by each booth's draw), linger a few
  // beats, and move on — so the 👥 counts in the directory swell and thin like a real
  // room. ~30% are cracking packs as they go; a big pull is announced hall-wide.
  const addNotoriety = useGame(s => s.addNotoriety)
  const [npcs, setNpcs] = useState(() => spawnCrowd(booths, tier.npcs, notoriety))
  const [announce, setAnnounce] = useState(null) // hall-wide big-pull banner
  useEffect(() => { setNpcs(spawnCrowd(booths, tier.npcs, notoriety)) }, [booths, tier.npcs, notoriety])
  useEffect(() => {
    const id = setInterval(() => {
      setNpcs(prev => prev.map(n => n.linger > 0
        ? { ...n, linger: n.linger - 1 }
        : { ...n, booth: pickBoothIdx(booths), linger: 2 + Math.floor(Math.random() * 5) }))
    }, 2400)
    return () => clearInterval(id)
  }, [booths])

  // Live rippers: every few seconds a ripping shopper cracks a pack somewhere in the
  // hall. A big pull (SIR+, foil, or grail) gets announced — named to the table they
  // were browsing, so the room has geography even without a map.
  useEffect(() => {
    const id = setInterval(() => {
      const rippers = npcs.filter(n => n.ripping)
      if (!rippers.length) return
      const npc = rippers[Math.floor(Math.random() * rippers.length)]
      const set = SETS[Math.floor(Math.random() * SETS.length)]
      const pack = openPack(set)
      const best = pack.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, pack[0])
      if (pack._god || pack._demigod || isBigPull(best)) {
        const who = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)]
        const what = pack._god ? 'a GOD PACK 🤯' : pack._demigod ? 'a DEMIGOD PACK ⭐' : `${best.foil ? best.foil.label + ' ' : ''}${best.name}${setNameOfCard(best) ? ` (${setNameOfCard(best)})` : ''}`
        const verb = HYPE[Math.floor(Math.random() * HYPE.length)]
        const at = booths[npc.booth]?.name
        // Hype only rubs off on YOU if they bought the sealed from your booth.
        const mine = !!npc.boughtFromYou
        if (mine) {
          const bump = pack._god ? 5 : pack._demigod ? 3 : 2
          addNotoriety(bump)
          useGame.getState().log('hype', `${who} hit ${what} from product they bought at your booth — your name's buzzing! (+${bump} notoriety)`, 0)
        }
        setAnnounce({ who, verb, what, at, card: cardImg(best), value: cardValue(best), god: !!pack._god, demigod: !!pack._demigod, mine, id: Date.now() })
        setTimeout(() => setAnnounce(a => (a && a.id ? null : a)), 5000)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [npcs, booths, addNotoriety])

  // Booth walk-ups, gated by a cooldown so they don't spam. With the 🔔 Visitor Ticker
  // you get an alert you can answer whenever — without it, a buyer who walks up while
  // you're deep at another vendor's table just leaves (that's what the ticker is for).
  const busy = !!(openBooth || encounter || vaultRip || meetPick || showTable)
  const busyRef = useRef(busy)
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => {
    if (!show._asVendor) return // shoppers have no booth → no walk-up buyers
    const id = setInterval(() => {
      if (encounter || boothAlert) return
      if (walkupsRef.current >= maxWalkupsPerDay(notoriety)) return // hit the per-day cap
      if (Date.now() - lastEncounterRef.current < ENCOUNTER_COOLDOWN) return
      // Booth pull used to cap at +50% (reached at noto 150) and go flat. It keeps growing now
      // — a famous vendor's table is mobbed, which is what the whole show ladder is FOR.
      const notoBonus = Math.min(0.5, notoriety / 300) + fameBeyond(notoriety, 150) * 0.35
      const inv = useGame.getState().showInventory || []
      const showcaseN = inv.filter(c => c._showcase).length
      const dealActive = inv.some(c => c._deal)
      const boothMult = (show._boothMult || 1) * (1 + Math.min(0.45, showcaseN * 0.15)) * (dealActive ? 1.25 : 1)
      const signageMult = upgrades.signage ? 1.15 : 1 // 🪧 +15% booth foot traffic at shows
      const chance = Math.min(0.9, 0.12 * tier.traffic * (1 + notoBonus) * boothMult * signageMult)
      if (Math.random() < chance) {
        const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted, null, null, null, useGame.getState().showSealed)
        lastEncounterRef.current = Date.now(); walkupsRef.current++
        if (upgrades.ticker) { setBoothAlert(enc) }
        else if (busyRef.current) {
          useGame.getState().log('missed', 'A buyer walked up to your booth while you were at another table — they left. (A 🔔 Visitor Ticker would have alerted you.)', 0)
        } else setEncounter({ enc, atBooth: true })
      }
    }, 3000)
    return () => clearInterval(id)
  }, [show._asVendor, encounter, boothAlert, notoriety, upgrades.ticker, tier.traffic, accepted, show._boothMult])

  // Tend your own table on demand: face the room and see who's there.
  function tendTable() {
    if (!show._asVendor || openBooth || encounter) return
    // A pending alert is a walk-up that already counted against the budget — just show it.
    if (boothAlert) { setEncounter({ enc: boothAlert, atBooth: true }); setBoothAlert(null); return }
    // Tending draws from the SAME daily walk-up budget as auto walk-ups (was uncapped, so
    // mashing ★/Enter spawned unlimited encounters — a rep/price-check farm). Once the
    // booth's had its visitors for the day, tending just finds a quiet table. That budget now
    // grows with your name (maxWalkupsPerDay), so a famous vendor's table stays busy longer.
    if (walkupsRef.current >= maxWalkupsPerDay(notoriety)) { flash('Your table’s had its rush for today — it’s quiet now.'); return }
    const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted, null, null, null, useGame.getState().showSealed)
    setEncounter({ enc, atBooth: true })
    lastEncounterRef.current = Date.now(); walkupsRef.current++
  }
  function pick(opt) { flash(resolveEncounter(opt.effect)); setEncounter(null) }

  // Buy + rip sealed product off a booth's table right here on the floor.
  // Returns true on success so the booth can mark the entry taken.
  const buySealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return false
    const g = useGame.getState()
    if (g.cash < ask) { flash(`Not enough cash for the ${product.name || product.type}.`); return false }
    if (!g.spend(ask)) return false
    g.recordSetSpend(set.id, ask)
    g.log('buy', `Bought a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} (${show.name})`, -ask)
    setVaultRip({ set, product: { ...product, price: ask } })
    return true
  }, [show.name, flash])

  // Buy sealed off a booth and STOCK it in held inventory instead of ripping now.
  const stockSealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return false
    const item = useGame.getState().buySealed(set, { ...product, _buyPrice: ask }, ask)
    if (!item) { flash(`Not enough cash for the ${product.name || product.type}.`); return false }
    flash(`Stocked a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} — rip/list/flip it from 📦 Inventory.`)
    return true
  }, [flash])

  // Live crowd per booth (from the drifting shoppers) — the directory's 👥 badges.
  const boothCrowd = {}
  for (const n of npcs) if (n.linger > 0) boothCrowd[n.booth] = (boothCrowd[n.booth] || 0) + 1

  // Directory order: held-item vendors first (you came for them), then familiar faces,
  // then the rest, grading kiosk last. Stable within groups (generation order).
  const ordered = useMemo(() => {
    const rank = b => b.leadNote ? 0 : b.special === 'kiosk' ? 3 : b.recurring ? 1 : 2
    return booths.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map(x => x.b)
  }, [booths])

  const vendorLeads = (show._leads || []).filter(l => l.kind === 'vendor')

  return (
    <div className="floorwrap">
      <div className="floorhud">
        <button className="btn alt" style={{ flex:'none' }} onClick={handleLeave}>← Leave show</button>
        <span className="pill" style={{ background: tier.color+'33', color: tier.color }}>{show.name} · {tier.name}</span>
        {tier.days > 1 && <span className="pill">Show day {showDay} / {tier.days}</span>}
        {tier.days > 1 && showDay < tier.days && (
          <button className="btn" style={{ flex:'none', maxWidth: 170, marginLeft:'auto' }}
            onClick={() => { setShowDay(d => d + 1); flash(`Day ${showDay + 1} of the show — fresh vendors set up.`) }}>
            Next show day →
          </button>
        )}
        <span className="pill" style={{ marginLeft: tier.days > 1 && showDay < tier.days ? 0 : 'auto' }}>Notoriety {Math.round(notoriety)}</span>
        <span className="pill cash-pill" title="Your floor wallet — what you brought to spend here. Selling on the floor tops it back up.">
          💵 <AnimatedNumber value={cash} format={fmtMoney} /><CashFlash value={cash} />
        </span>
        {showReserve > 0 && (
          <span className="pill" style={{ flex: 'none', opacity: 0.85 }} title="Cash you left safely at home — it's waiting for you and can't be spent on the floor. Yours again when you leave.">
            🏦 {fmtMoney(showReserve)} at home
          </span>
        )}
        {show._asVendor ? (
          <>
            <button className="pill" style={{ flex: 'none', cursor: 'pointer', border: 0 }}
              title="The cards you brought to sell at your booth"
              onClick={() => setShowTable(true)}>
              🪧 Your table ({showInventory.length})
            </button>
            <button className="btn gold" style={{ flex: 'none', maxWidth: 150, padding: '6px 12px' }}
              title="Step back to your own booth and see who's browsing"
              onClick={tendTable}>
              ⭐ Tend table
            </button>
          </>
        ) : (
          <span className="pill" style={{ flex: 'none', opacity: 0.7 }} title="You're here as a shopper — buy a Vendor Setup to run your own booth">
            🛍️ Shopping
          </span>
        )}
      </div>

      {boothAlert && (
        <div className="ticker" onClick={() => { setEncounter({ enc: boothAlert, atBooth: true }); setBoothAlert(null) }}>
          🔔 Someone is at your stand! <b>Click to attend →</b>
        </div>
      )}

      <div className="hall-vibe muted">
        🏟️ {booths.length} vendor tables · {tier.npcs} shoppers working the room{show._arrival === 'late' ? ' · you rolled in late — picked over, but marked down' : ''}
      </div>

      {/* Appointments from pre-show DMs: buyers who arranged to meet you HERE. */}
      {meets.length > 0 && (
        <div className="appt-strip">
          <div className="appt-head">📬 Appointments — they came to see you</div>
          {meets.map(l => {
            const matches = [...collection, ...(showInventory || [])].filter(c => cardMatchesWant(c, l.want))
            return (
              <div key={l.id} className="appt-row">
                {l.img && <img src={l.img} alt="" className="appt-thumb" />}
                <div className="appt-info">
                  <b>{l.who}</b> is here for <b>{l.desc}</b>
                  <span className="muted"> · pays {Math.round(l.premiumMult * 100)}% of market · +{l.notoriety}★</span>
                </div>
                {matches.length
                  ? <button className="btn gold" style={{ flex: 'none', padding: '6px 12px' }} onClick={() => setMeetPick(l)}>🤝 Meet ({matches.length} match{matches.length > 1 ? 'es' : ''})</button>
                  : <span className="pill" style={{ opacity: 0.7 }} title="You don't have what they're after — maybe a vendor here does…">don't have it</span>}
              </div>
            )
          })}
        </div>
      )}
      {vendorLeads.length > 0 && (
        <div className="appt-strip held">
          <div className="appt-head">🗝️ Held for you</div>
          {vendorLeads.map(l => (
            <div key={l.id} className="appt-row">
              <div className="appt-info">
                <b>{l.vendorName}</b> set aside a <b>{l.productType} of {l.setName}</b>
                <span className="muted"> · held at {fmtMoney(l.price)} — find their table below</span>
              </div>
              <button className="btn" style={{ flex: 'none', padding: '6px 12px' }}
                onClick={() => { const b = booths.find(x => x.vendorId === l.vendorId); if (b) setOpenBooth(b) }}>
                Go →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The vendor directory — every table on the floor, one line each. */}
      <div className="vdir">
        {ordered.map(booth => {
          const crowd = boothCrowd[booths.indexOf(booth)] || 0
          if (booth.special === 'kiosk') {
            return (
              <div key={booth.id} className="vdir-row kiosk" onClick={() => setOpenBooth(booth)}>
                <span className="vdir-icon">🔬</span>
                <div className="vdir-info">
                  <div className="vdir-name">{booth.name} <span className="pill vdir-arch">{booth.archLabel}</span></div>
                  <div className="vdir-sub muted">Slabs while you shop — hand over raw cards, graded in ~2 days.</div>
                </div>
                <span className="vdir-go">›</span>
              </div>
            )
          }
          const rap = booth.vendorId ? vendorRapport(vendorSpend?.[booth.vendorId] || 0) : null
          const sealedN = (booth.products || []).filter(p => !p.mystery).length
          const mysteryN = (booth.products || []).filter(p => p.mystery).length
          const hasVintage = (booth.products || []).some(p => p._origin === 'vintage')
          const top = booth.stock.reduce((b, c) => (!b || (c._ask || 0) > (b._ask || 0)) ? c : b, null)
          const deals = upgrades.network ? booth.stock.filter(c => (c._ask || 0) < cardValue(c) * 0.85).length : 0
          return (
            <div key={booth.id} className={`vdir-row arch-${booth.archetype} ${crowd >= 3 ? 'busy' : ''} ${booth.leadNote ? 'lead' : ''}`}
              onClick={() => setOpenBooth(booth)}>
              <span className="vdir-icon">{booth.recurring ? '🤝' : '🛒'}</span>
              <div className="vdir-info">
                <div className="vdir-name">
                  {booth.name}
                  <span className="pill vdir-arch">{booth.archLabel}</span>
                  {rap && rap.level > 0 && <span className="pill" style={{ background: rap.color + '22', color: rap.color }}>{rap.name}{rap.disc ? ` · ${Math.round(rap.disc * 100)}% off` : ''}</span>}
                  {booth.leadNote && <span className="pill vdir-held">🗝️ set aside for you</span>}
                  {crowd >= 2 && <span className="pill vdir-crowd" title={`${crowd} shoppers at this table`}>👥 {crowd}</span>}
                </div>
                <div className="vdir-sub muted">
                  {cap(booth.vibe)} · pays {Math.round(booth.buyMult * 100)}% for yours
                </div>
                <div className="vdir-sub">
                  🃏 {booth.stock.length} singles
                  {sealedN > 0 && <> · 📦 {sealedN} sealed{hasVintage ? ' (🗝️ vintage!)' : ''}</>}
                  {mysteryN > 0 && <> · ❓ mystery</>}
                  {top && <> · ⭐ {top.grade ? `PSA ${top.grade.overall} ` : ''}{top.name} {fmtMoney(top._ask)}</>}
                  {deals > 0 && <span style={{ color: 'var(--green)' }}> · {deals} DEAL{deals > 1 ? 'S' : ''} flagged</span>}
                </div>
              </div>
              <span className="vdir-go">›</span>
            </div>
          )
        })}
      </div>

      {announce && (
        <div className={`hall-announce ${announce.god ? 'god' : announce.demigod ? 'demigod' : ''} ${announce.mine ? 'mine' : ''}`}>
          {announce.card && <img src={announce.card} alt="" />}
          <div>
            <div className="ha-line">📣 {announce.who} {announce.verb} <b>{announce.what}</b>{announce.at ? <span className="muted"> at {announce.at}</span> : ''}!</div>
            <div className="ha-sub">
              {announce.mine
                ? <>🔥 <b>Bought it from your booth</b> — your rep is buzzing · {fmtMoney(announce.value)}</>
                : <>The whole hall turns to look · {fmtMoney(announce.value)}</>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {openBooth && <VendorBooth booth={openBooth} onClose={() => setOpenBooth(null)} flash={flash} onRipSealed={buySealed}
        onStockSealed={stockSealed} haggledIds={haggledIds} onHaggled={markHaggled}
        takenIds={takenIds} onTaken={markTaken} asVendor={show._asVendor}
        tillLeft={Math.max(0, round2((openBooth.till || 0) - (tillSpent[tillKey(openBooth)] || 0)))}
        onTillSpend={(amt) => markTillSpend(openBooth, amt)} />}
      {encounter && <Encounter data={encounter.enc} onPick={pick} onClose={() => setEncounter(null)} />}

      {vaultRip && (
        <div className="modalbg vault-rip-bg">
          <div className="modal vault-rip-modal" style={{ maxWidth: 980 }}>
            <div className="vault-ribbon">{vaultRip.set?.vintage ? '🗝️ VINTAGE' : '📦 SEALED'} — {vaultRip.set?.name} {vaultRip.product.name || vaultRip.product.type}</div>
            <PackOpening set={vaultRip.set} product={vaultRip.product} singleNoReRip onExit={() => setVaultRip(null)} />
          </div>
        </div>
      )}

      {/* Meet a buyer appointment: pick which matching copy to sell them. */}
      {meetPick && (() => {
        const matches = [...collection, ...(showInventory || [])].filter(c => cardMatchesWant(c, meetPick.want))
        return (
          <div className="modalbg" style={{ zIndex: 25 }} onClick={() => setMeetPick(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <h2 style={{ fontSize: 18, marginBottom: 2 }}>🤝 Meet {meetPick.who}</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                As arranged — they're buying <b>{meetPick.desc}</b> at <b>{Math.round(meetPick.premiumMult * 100)}% of market</b>, cash on the spot (+{meetPick.notoriety}★).
              </p>
              {matches.length === 0 ? (
                <div className="empty">You don't have it on you anymore.</div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                  {matches.map(c => (
                    <div key={c.uid} className="vendoritem">
                      <CardTile card={c} interactive={false} />
                      <button className="btn gold" onClick={() => {
                        const r = useGame.getState().fulfillShowLead(meetPick, c.uid)
                        if (r) {
                          flash(`Sold ${c.name} to ${meetPick.who} — ${fmtMoney(r.payout)} (+${meetPick.notoriety}★)`)
                          setMeets(m => m.filter(x => x.id !== meetPick.id))
                        }
                        setMeetPick(null)
                      }}>Sell · {fmtMoney(cardValue(c) * meetPick.premiumMult)}</button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn alt" style={{ marginTop: 14, maxWidth: 140 }} onClick={() => setMeetPick(null)}>Not now</button>
            </div>
          </div>
        )
      })()}

      {showTable && (
        <div className="modalbg" onClick={() => setShowTable(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ marginRight: 'auto' }}>🪧 Your table</h2>
              {(() => {
                const packsOut = useGame.getState().packsForChannel ? useGame.getState().packsForChannel('show').length : 0
                return packsOut > 0 && (
                  <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}
                    title="Your built mystery packs (with the 🎪 Shows channel on) sell off this table too">
                    ❓ {packsOut} mystery pack{packsOut === 1 ? '' : 's'} out
                  </span>
                )
              })()}
              <span className="pill">{showInventory.length} card{showInventory.length === 1 ? '' : 's'} · {fmtMoney(showInventory.reduce((a, c) => a + cardValue(c), 0))}</span>
            </div>
            <p className="muted" style={{ marginTop: 2 }}>
              Shoppers who walk up to your booth buy from these. <b>Work your table</b> to pull more foot
              traffic: feature your best pieces in the <b>⭐ showcase</b> (up to 3) and flag one
              <b> 🏷️ Deal of the Show</b> as a crowd-drawing loss-leader.
            </p>
            {show._asVendor && (
              <div className="banner" style={{ marginTop: 6 }}>
                📍 Spot: <b>{show._spotLabel || 'Standard table'}</b>
                {' · '}⭐ Showcase {showInventory.filter(c => c._showcase).length}/3
                {' · '}🏷️ Deal: <b>{showInventory.find(c => c._deal)?.name || 'none'}</b>
                {' — '}<span style={{ color: 'var(--green)' }}>traffic ×{( (show._boothMult||1) * (1 + Math.min(0.45, showInventory.filter(c=>c._showcase).length*0.15)) * (showInventory.some(c=>c._deal)?1.25:1) ).toFixed(2)}</span>
              </div>
            )}
            {showInventory.length === 0 ? (
              <div className="empty">Nothing on your table yet — buy from a vendor and list it here, or sell from your collection to other vendors.</div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', marginTop: 6 }}>
                {[...showInventory].sort((a, b) => (b._showcase?1:0)-(a._showcase?1:0) || cardValue(b) - cardValue(a)).map(c => (
                  <div key={c.uid} className={`vendoritem ${c._showcase ? 'featured' : ''}`}>
                    <CardTile card={c} interactive={false} />
                    <div className="muted" style={{ fontSize: 11 }}>{fmtMoney(cardValue(c))}{c._deal ? ' · 🏷️ deal' : ''}</div>
                    <div className="row" style={{ gap: 5 }}>
                      <button className={`btn ${c._showcase ? 'gold' : 'alt'}`} style={{ fontSize: 11, padding: '5px 6px' }}
                        onClick={() => useGame.getState().toggleShowcase(c.uid)}
                        title="Feature this piece in your showcase to pull more traffic">{c._showcase ? '★ Featured' : '☆ Showcase'}</button>
                      <button className={`btn ${c._deal ? 'gold' : 'alt'}`} style={{ flex:'none', fontSize: 11, padding: '5px 6px' }}
                        onClick={() => useGame.getState().setDealOfShow(c._deal ? null : c.uid)}
                        title="Flag as the Deal of the Show — a loss-leader that draws a crowd">🏷️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={() => setShowTable(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- The drifting crowd --------------------------------------------------------
// Shoppers hold a booth index + a linger count instead of grid coordinates. Draw
// weight per archetype — how strongly a table pulls a crowd (fair dealers and whales
// run busy tables; a known lowballer's is quiet).
const BOOTH_DRAW = { fair: 1.5, whale: 1.6, newbie: 1.2, sharp: 1.0, fleecer: 0.5, kiosk: 1.3 }
function pickBoothIdx(booths) {
  if (!booths.length) return 0
  let total = 0
  for (const b of booths) total += BOOTH_DRAW[b.archetype] ?? 1
  let r = Math.random() * total
  for (let i = 0; i < booths.length; i++) { r -= BOOTH_DRAW[booths[i].archetype] ?? 1; if (r <= 0) return i }
  return booths.length - 1
}
function spawnCrowd(booths, count, notoriety = 0) {
  // The better-known you are, the more of the floor's rippers bought their sealed
  // from YOUR booth (so their big pulls hype your name). 0 → ~10%, 100 → ~55%, and past that
  // it used to go flat; now it keeps creeping toward "most of this hall bought from me"
  // (hard-railed at 85% — some of the floor is always someone else's customer).
  const yourShare = Math.min(0.85, 0.1 + notoriety / 220 + fameBeyond(notoriety, 100) * 0.06)
  const npcs = []
  for (let i = 0; i < count; i++) {
    const ripping = Math.random() < 0.3 // ~30% are cracking sealed as they browse
    npcs.push({
      id: `npc${i}`, emoji: NPC_EMOJI[i % NPC_EMOJI.length],
      booth: pickBoothIdx(booths), linger: 1 + Math.floor(Math.random() * 5),
      ripping, boughtFromYou: ripping && Math.random() < yourShare,
    })
  }
  return npcs
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

const NPC_NAMES = ['A collector','A kid','A streamer','Some guy','A hype beast','A local','A grinder',
  'A YouTuber','A first-timer','A whale','A dad','Some teen','A regular','A breaker']
