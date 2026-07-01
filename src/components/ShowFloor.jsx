import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useGame, acceptedMethods } from '../game/store'
import { generateBooths, boothEncounter, SHOW_TIERS, NPC_EMOJI } from '../game/shows'
import { openPack, rarityRank, cardValue, fmtMoney, SHOP_SETS as SETS, VINTAGE_SETS, vintageProduct } from '../game/engine'
import VendorBooth from './VendorBooth'
import Encounter from './Encounter'
import PackOpening from './PackOpening'
import CardTile from './CardTile'
import { useModalEscape } from '../ui/dialog'

const TILE = 52
const ENCOUNTER_COOLDOWN = 15000 // ms between booth walk-ups (longer = calmer floor)
const MAX_WALKUPS_PER_DAY = 3    // cap unsolicited walk-ups per show day
// A pull worth announcing to the whole hall: SIR-or-better, any special foil, or grail.
const ANNOUNCE_RANK = rarityRank('Special Illustration Rare')
function isBigPull(card) {
  return !!card.foil || !!card._grail || rarityRank(card.rarity) >= ANNOUNCE_RANK
}
const HYPE = ['just hit a', 'PULLED a', 'cracked a', 'opened a', 'just ripped a']

export default function ShowFloor({ show, onLeave }) {
  const notoriety = useGame(s => s.notoriety)
  const upgrades = useGame(s => s.upgrades)
  const showInventory = useGame(s => s.showInventory)
  const showVendors = useGame(s => s.showVendors) // recurring roster (stable identities)
  const tier = SHOW_TIERS[show.tierKey]
  const [showTable, setShowTable] = useState(false) // peek at your booth inventory
  useModalEscape(() => setShowTable(false)) // Esc closes the table peek

  const [showDay, setShowDay] = useState(1) // which day of the multi-day show we're on
  // Recurring roster gets injected into the floor; `show._arrival` ('open' | 'late') tunes
  // how picked-over the booths are. showVendors identities are stable, so this won't re-roll
  // the floor when rapport changes (rapport lives in vendorSpend, read only in the booth).
  const booths = useMemo(() => generateBooths(show, notoriety, showDay - 1, showVendors, show._arrival || 'open'), [show, notoriety, showDay, showVendors])
  // Layout scales with booth count → bigger shows fill more of the page.
  const layout = useMemo(() => buildLayout(booths, show._asVendor), [booths, show._asVendor])
  const { grid, cols, rows, playerAt } = layout
  // Walkable floor tiles adjacent to each booth, with a "draw" weight by archetype — where
  // shoppers path TO and linger. Popular booths (fair dealers, whales, the Vault) pull bigger
  // crowds, so the floor self-organizes into busy and dead tables (the show's "vibe").
  const boothSpots = useMemo(() => buildBoothSpots(grid, cols, rows, booths), [grid, cols, rows, booths])

  const [pos, setPos] = useState(() => ({ x: playerAt.x, y: playerAt.y + 1 }))
  // mirror of pos for the NPC drift interval (so it sees the live player tile
  // without re-subscribing the interval on every step).
  const posRef = useRef(pos)
  useEffect(() => { posRef.current = pos }, [pos])
  const [openBooth, setOpenBooth] = useState(null)
  // Cards you've already haggled this show — one negotiation per card (no re-rolling
  // a vendor by re-opening the haggle). Persists across booth re-opens for the whole show.
  const [haggledIds, setHaggledIds] = useState(() => new Set())
  const markHaggled = useCallback((uid) => setHaggledIds(prev => { const n = new Set(prev); n.add(uid); return n }), [])
  const [vaultRip, setVaultRip] = useState(null) // { set, product } when ripping a Vintage Vault pack on the floor
  const [encounter, setEncounter] = useState(null)
  const [toast, setToast] = useState(null)
  const [boothAlert, setBoothAlert] = useState(null)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  // seed with mount time so the cooldown window opens on entry — gives the player
  // a grace period to look around before the first walk-up fires (was 0 = instant).
  const lastEncounterRef = useRef(Date.now())
  // cap unsolicited walk-ups per show day so the floor doesn't feel like a gauntlet.
  // (Tending your own booth via the ★ / Enter doesn't count against this.)
  const walkupsRef = useRef(0)
  useEffect(() => { walkupsRef.current = 0; lastEncounterRef.current = Date.now() }, [showDay])
  const accepted = useMemo(() => acceptedMethods(upgrades), [upgrades])

  // NPC shoppers wandering the aisles (visual atmosphere). Some are ripping packs.
  const addNotoriety = useGame(s => s.addNotoriety)
  const [npcs, setNpcs] = useState(() => spawnNpcs(layout, tier.npcs, notoriety, boothSpots))
  const [poppedIds, setPoppedIds] = useState(() => new Set()) // NPCs mid-"pop" flash
  const [announce, setAnnounce] = useState(null)              // hall-wide big-pull banner
  useEffect(() => { setNpcs(spawnNpcs(layout, tier.npcs, notoriety, boothSpots)) }, [layout, tier.npcs, notoriety, boothSpots])

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600) }, [])

  // Move NPCs with PURPOSE: each shopper heads to a booth (weighted by the booth's draw),
  // browses there a few beats, then picks a new table. They path around aisles and each other
  // instead of drifting randomly — so crowds gather at the popular booths and the hall reads
  // as a living show floor rather than a screensaver.
  useEffect(() => {
    const id = setInterval(() => {
      setNpcs(prev => {
        // Tiles you can't step onto this tick: the player + every other shopper's current cell.
        const blocked = new Set([`${posRef.current.x},${posRef.current.y}`])
        for (const o of prev) blocked.add(`${o.x},${o.y}`)
        return prev.map(n => {
          // Browsing a booth — hold still, then end the visit (clears the target).
          if (n.linger > 0) return { ...n, linger: n.linger - 1 }
          let target = n.target
          if (!target && boothSpots.length) { const t = weightedPick(boothSpots); target = { x: t.x, y: t.y } }
          if (!target) return n
          const dist = Math.abs(n.x - target.x) + Math.abs(n.y - target.y)
          if (dist === 0) return { ...n, linger: 2 + Math.floor(Math.random() * 5), target: null } // arrived → browse
          const nextTile = stepToward(n, target, grid, cols, rows, blocked)
            || randomStep(n, grid, cols, rows, blocked) // blocked → nudge so we never wedge
          if (!nextTile) return n
          blocked.add(`${nextTile.x},${nextTile.y}`) // claim the tile so no one else takes it this tick
          return { ...n, x: nextTile.x, y: nextTile.y, face: nextTile.x < n.x ? -1 : nextTile.x > n.x ? 1 : n.face }
        })
      })
    }, 650)
    return () => clearInterval(id)
  }, [grid, cols, rows, boothSpots])

  // Live rippers: every few seconds a ripping NPC cracks a pack. A big pull (SIR+,
  // foil, or grail) gets announced to the whole hall.
  useEffect(() => {
    const id = setInterval(() => {
      const rippers = npcs.filter(n => n.ripping)
      if (!rippers.length) return
      const npc = rippers[Math.floor(Math.random() * rippers.length)]
      // brief "pop" over their head
      setPoppedIds(prev => { const s = new Set(prev); s.add(npc.id); return s })
      setTimeout(() => setPoppedIds(prev => { const s = new Set(prev); s.delete(npc.id); return s }), 1400)
      // they crack a pack of a random real set (people bring all kinds to a show)
      const set = SETS[Math.floor(Math.random() * SETS.length)]
      const pack = openPack(set)
      const best = pack.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, pack[0])
      if (pack._god || pack._demigod || isBigPull(best)) {
        const who = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)]
        const what = pack._god ? 'a GOD PACK 🤯' : pack._demigod ? 'a DEMIGOD PACK ⭐' : `${best.foil ? best.foil.label + ' ' : ''}${best.name}`
        const verb = HYPE[Math.floor(Math.random() * HYPE.length)]
        // Hype only rubs off on YOU if they bought the sealed from your booth.
        const mine = !!npc.boughtFromYou
        if (mine) {
          const bump = pack._god ? 5 : pack._demigod ? 3 : 2
          addNotoriety(bump)
          useGame.getState().log('hype', `${who} hit ${what} from product they bought at your booth — your name's buzzing! (+${bump} notoriety)`, 0)
        }
        setAnnounce({ who, verb, what, card: best.img, value: cardValue(best), god: !!pack._god, demigod: !!pack._demigod, mine, id: Date.now() })
        setTimeout(() => setAnnounce(a => (a && a.id ? null : a)), 5000)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [npcs, addNotoriety])

  // Booth walk-ups, now gated by a cooldown so they don't spam.
  useEffect(() => {
    if (!show._asVendor) return // shoppers have no booth → no walk-up buyers
    const id = setInterval(() => {
      if (encounter || openBooth || boothAlert) return
      if (walkupsRef.current >= MAX_WALKUPS_PER_DAY) return // hit the per-day cap
      if (Date.now() - lastEncounterRef.current < ENCOUNTER_COOLDOWN) return
      // chance per 3s tick after cooldown: scales with the show's traffic and a
      // capped notoriety bonus so small shows stay calm even when you're famous.
      // Your ACTIVE-BOOTH play multiplies it: a better spot, a stocked showcase, and a
      // running Deal of the Show all pull more foot traffic to your table.
      const notoBonus = Math.min(0.5, notoriety / 300)
      const inv = useGame.getState().showInventory || []
      const showcaseN = inv.filter(c => c._showcase).length
      const dealActive = inv.some(c => c._deal)
      const boothMult = (show._boothMult || 1) * (1 + Math.min(0.45, showcaseN * 0.15)) * (dealActive ? 1.25 : 1)
      const chance = Math.min(0.9, 0.12 * tier.traffic * (1 + notoBonus) * boothMult)
      if (Math.random() < chance) {
        // Floor buyers only shop your SHOW INVENTORY — the cards you brought to sell.
        const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted)
        if (upgrades.ticker) { setBoothAlert(enc); lastEncounterRef.current = Date.now(); walkupsRef.current++ }
        else if (atPlayerBooth(pos, playerAt)) { setEncounter({ enc, atBooth: true }); lastEncounterRef.current = Date.now(); walkupsRef.current++ }
      }
    }, 3000)
    return () => clearInterval(id)
  }, [show._asVendor, encounter, openBooth, boothAlert, notoriety, upgrades.ticker, pos, playerAt, tier.traffic, accepted])

  // One step in a direction: walk onto floor, or interact with a bumped booth.
  const move = useCallback((dx, dy) => {
    if (openBooth || encounter) return
    setPos(p => {
      const nx = p.x + dx, ny = p.y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return p
      const cell = grid[ny][nx]
      if (cell === 1) return p
      if (typeof cell === 'number' && cell >= 100) { setOpenBooth(booths[cell - 100]); return p }
      if (cell === 'P') { triggerPlayerBooth(); return p }
      return { x: nx, y: ny }
    })
  }, [grid, cols, rows, openBooth, encounter, booths])

  // Interact with whatever's adjacent: a neighboring booth → shop it; your own
  // booth (or just standing near it) → tend it. Mirrors a tap on an adjacent tile.
  const interact = useCallback(() => {
    if (openBooth || encounter) return
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const cell = grid[pos.y + dy]?.[pos.x + dx]
      if (typeof cell === 'number' && cell >= 100) { setOpenBooth(booths[cell - 100]); return }
      if (cell === 'P') { triggerPlayerBooth(); return }
    }
    if (atPlayerBooth(pos, playerAt)) triggerPlayerBooth() // standing on/at your stand
  }, [grid, pos, booths, openBooth, encounter, playerAt])

  // Keyboard movement + interact (desktop).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); interact(); return
      }
      const d = { ArrowUp: [0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0], W:[0,-1], S:[0,1], A:[-1,0], D:[1,0] }[e.key]
      if (!d) return
      e.preventDefault()
      move(d[0], d[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, interact])

  // Tap-to-move (mobile): tap a tile → step one toward it; tap an adjacent booth → open it.
  const tapTile = useCallback((tx, ty) => {
    if (openBooth || encounter) return
    const cell = grid[ty]?.[tx]
    const adj = Math.abs(tx - pos.x) + Math.abs(ty - pos.y) === 1
    // adjacent booth / your booth → interact immediately
    if (adj && typeof cell === 'number' && cell >= 100) { setOpenBooth(booths[cell - 100]); return }
    if (adj && cell === 'P') { triggerPlayerBooth(); return }
    // otherwise step one tile toward the tapped spot (prefer the larger axis)
    const ddx = tx - pos.x, ddy = ty - pos.y
    if (Math.abs(ddx) >= Math.abs(ddy)) move(Math.sign(ddx), 0)
    else move(0, Math.sign(ddy))
  }, [grid, pos, booths, openBooth, encounter, move])

  function triggerPlayerBooth() {
    if (!show._asVendor) return // shoppers have no booth — only vendors tend one
    if (boothAlert) { setEncounter({ enc: boothAlert, atBooth: true }); setBoothAlert(null); return }
    const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted)
    setEncounter({ enc, atBooth: true })
    lastEncounterRef.current = Date.now()
  }
  function pick(opt) { flash(resolveEncounter(opt.effect)); setEncounter(null) }

  // Buy + rip a Vintage Vault pack right here on the floor. Charges cash, records
  // the spend against the set, then hands off to the PackOpening overlay.
  const buyVault = useCallback(({ setId, product }) => {
    const set = VINTAGE_SETS.find(s => s.id === setId)
    if (!set) return
    const g = useGame.getState()
    if (g.cash < product.price) { flash(`Not enough cash for the ${product.name}.`); return }
    if (!g.spend(product.price)) return
    g.recordSetSpend(set.id, product.price)
    g.log('buy', `Bought a ${product.name} from the Vintage Vault (${show.name})`, -product.price)
    setVaultRip({ set, product })
  }, [show.name, flash])

  // Buy + rip sealed product off a REGULAR booth's table. The booth entry carries the full
  // set object + product + marked-up ask, so it works for both modern and vintage sealed.
  // Charges the ask, records the spend, then hands off to the same PackOpening overlay.
  const buySealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return
    const g = useGame.getState()
    if (g.cash < ask) { flash(`Not enough cash for the ${product.name || product.type}.`); return }
    if (!g.spend(ask)) return
    g.recordSetSpend(set.id, ask)
    g.log('buy', `Bought a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} (${show.name})`, -ask)
    setVaultRip({ set, product: { ...product, price: ask } })
  }, [show.name, flash])

  // Buy sealed off a booth and STOCK it in your held inventory instead of ripping now —
  // source low at a show, rip/list/flip from the 📦 Inventory tab later. buySealed (store)
  // charges the ask, records the spend, and stocks the item.
  const stockSealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return
    const item = useGame.getState().buySealed(set, { ...product, _buyPrice: ask }, ask)
    if (!item) { flash(`Not enough cash for the ${product.name || product.type}.`); return }
    flash(`Stocked a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} — rip/list/flip it from 📦 Inventory.`)
  }, [flash])

  // Same, for a Vintage Vault pack: resolve the vintage set, then stock it to hold (vintage
  // appreciates, so holding a sealed old pack is a real play, not just a rip-it-live gamble).
  const stockVault = useCallback(({ setId, product, ask }) => {
    const set = VINTAGE_SETS.find(s => s.id === setId)
    if (!set) return
    const item = useGame.getState().buySealed(set, { ...product, _buyPrice: ask }, ask)
    if (!item) { flash(`Not enough cash for the ${product.name}.`); return }
    flash(`Stocked a ${product.name} from the Vintage Vault — it's in 📦 Inventory.`)
  }, [flash])

  // Live crowd per booth = shoppers standing on a tile adjacent to it. Drives the "busy"
  // vibe badge, so the player can read at a glance which tables are drawing a crowd.
  const boothCrowd = {}
  for (const n of npcs) {
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const cell = grid[n.y + dy]?.[n.x + dx]
      if (typeof cell === 'number' && cell >= 100) boothCrowd[cell - 100] = (boothCrowd[cell - 100] || 0) + 1
    }
  }

  return (
    <div className="floorwrap">
      <div className="floorhud">
        <button className="btn alt" style={{ flex:'none' }} onClick={onLeave}>← Leave show</button>
        <span className="pill" style={{ background: tier.color+'33', color: tier.color }}>{show.name} · {tier.name}</span>
        {tier.days > 1 && <span className="pill">Show day {showDay} / {tier.days}</span>}
        <span className="muted floorhint" style={{ fontSize: 12 }}>WASD / tap to walk · Enter or tap a booth to shop · {booths.length} vendors</span>
        {tier.days > 1 && showDay < tier.days && (
          <button className="btn" style={{ flex:'none', maxWidth: 170, marginLeft:'auto' }}
            onClick={() => { setShowDay(d => d + 1); setPos({ x: playerAt.x, y: playerAt.y + 1 }); flash(`Day ${showDay + 1} of the show — fresh vendors arrive.`) }}>
            Next show day →
          </button>
        )}
        <span className="pill" style={{ marginLeft: tier.days > 1 && showDay < tier.days ? 0 : 'auto' }}>Notoriety {Math.round(notoriety)}</span>
        {show._asVendor ? (
          <button className="pill" style={{ flex: 'none', cursor: 'pointer', border: 0 }}
            title="The cards you brought to sell at your booth"
            onClick={() => setShowTable(true)}>
            🪧 Your table ({showInventory.length})
          </button>
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

      <div className="floorscroll">
        <div className="floor" style={{ width: cols*TILE, height: rows*TILE }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const tx = Math.floor((e.clientX - r.left) / TILE)
            const ty = Math.floor((e.clientY - r.top) / TILE)
            tapTile(tx, ty)
          }}>
          {grid.map((row, y) => row.map((cell, x) => {
            const isWall = cell === 1
            const boothIdx = typeof cell === 'number' && cell >= 100 ? cell - 100 : null
            const isPlayer = cell === 'P'
            if (!isWall && boothIdx === null && !isPlayer) return null
            return (
              <div key={`${x}-${y}`} className={`tile ${isWall?'wall':''}`} style={{ left:x*TILE, top:y*TILE, width:TILE, height:TILE }}>
                {boothIdx !== null && (
                  <div className={`booth arch-${booths[boothIdx].archetype} ${booths[boothIdx].special === 'vault' ? 'vault-booth' : ''} ${booths[boothIdx].recurring ? 'recurring-booth' : ''} ${booths[boothIdx].special === 'kiosk' ? 'kiosk-booth' : ''} ${boothCrowd[boothIdx] >= 2 ? 'busy' : ''}`}
                    title={`${booths[boothIdx].name}${boothCrowd[boothIdx] >= 2 ? ` · busy (${boothCrowd[boothIdx]} shoppers)` : ''}`}>
                    <span className="boothname">{booths[boothIdx].recurring ? '🤝 ' : ''}{booths[boothIdx].name}</span>
                    <span className="boothicon">{booths[boothIdx].special === 'vault' ? '🗝️' : booths[boothIdx].special === 'kiosk' ? '🔬' : '🛒'}</span>
                    {boothCrowd[boothIdx] >= 2 && <span className="booth-crowd" title={`${boothCrowd[boothIdx]} shoppers here`}>👥{boothCrowd[boothIdx]}</span>}
                  </div>
                )}
                {isPlayer && <div className="booth player"><span className="boothname">YOUR BOOTH</span><span className="boothicon">⭐</span></div>}
              </div>
            )
          }))}

          {npcs.map(n => (
            <div key={n.id} className="npc" style={{ left: n.x*TILE + TILE*0.2, top: n.y*TILE + TILE*0.12, width: TILE*0.6, height: TILE*0.76, transform: `scaleX(${n.face})` }}>
              {n.emoji}
              {n.ripping && <span className="rip-badge">📦</span>}
              {poppedIds.has(n.id) && <span className="rip-pop">💥</span>}
            </div>
          ))}

          <div className="avatar" style={{ left: pos.x*TILE+TILE*0.15, top: pos.y*TILE+TILE*0.1, width: TILE*0.7, height: TILE*0.8 }}>🧍</div>
        </div>
      </div>

      {/* On-screen D-pad for touch devices (hidden on desktop via CSS). */}
      <div className="dpad" aria-hidden="true">
        <button className="dpad-btn up"    onClick={() => move(0,-1)}>▲</button>
        <button className="dpad-btn left"  onClick={() => move(-1,0)}>◀</button>
        {show._asVendor && <button className="dpad-btn act"   onClick={() => { if (!openBooth && !encounter) triggerPlayerBooth() }} title="Tend your booth">★</button>}
        <button className="dpad-btn right" onClick={() => move(1,0)}>▶</button>
        <button className="dpad-btn down"  onClick={() => move(0,1)}>▼</button>
      </div>

      {announce && (
        <div className={`hall-announce ${announce.god ? 'god' : announce.demigod ? 'demigod' : ''} ${announce.mine ? 'mine' : ''}`}>
          {announce.card && <img src={announce.card} alt="" />}
          <div>
            <div className="ha-line">📣 {announce.who} {announce.verb} <b>{announce.what}</b>!</div>
            <div className="ha-sub">
              {announce.mine
                ? <>🔥 <b>Bought it from your booth</b> — your rep is buzzing · {fmtMoney(announce.value)}</>
                : <>The whole hall turns to look · {fmtMoney(announce.value)}</>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {openBooth && <VendorBooth booth={openBooth} onClose={() => setOpenBooth(null)} flash={flash} onRipVault={buyVault} onRipSealed={buySealed}
        onStockVault={stockVault} onStockSealed={stockSealed} haggledIds={haggledIds} onHaggled={markHaggled} />}
      {encounter && <Encounter data={encounter.enc} onPick={pick} onClose={() => setEncounter(null)} />}

      {vaultRip && (
        <div className="modalbg vault-rip-bg">
          <div className="modal vault-rip-modal" style={{ maxWidth: 980 }}>
            <div className="vault-ribbon">🗝️ VINTAGE VAULT — {vaultRip.product.name}</div>
            <PackOpening set={vaultRip.set} product={vaultRip.product} singleNoReRip onExit={() => setVaultRip(null)} />
          </div>
        </div>
      )}

      {showTable && (
        <div className="modalbg" onClick={() => setShowTable(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ marginRight: 'auto' }}>🪧 Your table</h2>
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

// --- layout: a hall sized to the booth count, booths in aisles, player center-bottom ---
// asVendor=true stamps the player's own booth tile ('P') at the start position; a shopper
// spawns at the same spot but has no booth tile (playerAt is still their entry point).
function buildLayout(booths, asVendor) {
  const n = booths.length
  // booths sit on every other column/row so there are walkable aisles between them.
  const boothCols = Math.ceil(Math.sqrt(n * 1.3))
  const boothRows = Math.ceil(n / boothCols)
  const cols = boothCols * 2 + 1
  const rows = boothRows * 2 + 3 // extra rows at the bottom for the player area
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let x = 0; x < cols; x++) { grid[0][x] = 1; grid[rows-1][x] = 1 }
  for (let y = 0; y < rows; y++) { grid[y][0] = 1; grid[y][cols-1] = 1 }

  // place booths on the (odd,odd) lattice in the upper region
  let placed = 0
  for (let by = 0; by < boothRows && placed < n; by++) {
    for (let bx = 0; bx < boothCols && placed < n; bx++) {
      const x = bx * 2 + 1, y = by * 2 + 1
      grid[y][x] = 100 + placed
      placed++
    }
  }
  // player booth: center column, near the bottom. Only vendors get an actual booth tile;
  // shoppers spawn at the same spot but the cell stays walkable floor (no 'P').
  const px = Math.floor(cols / 2), py = rows - 3
  if (asVendor) grid[py][px] = 'P'
  return { grid, cols, rows, playerAt: { x: px, y: py } }
}

function atPlayerBooth(pos, playerAt) {
  return Math.abs(pos.x - playerAt.x) + Math.abs(pos.y - playerAt.y) <= 1
}

function spawnNpcs(layout, count, notoriety = 0, boothSpots = []) {
  const { grid, cols, rows } = layout
  const open = []
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) if (grid[y][x] === 0) open.push({ x, y })
  // The better-known you are, the more of the floor's rippers bought their sealed
  // from YOUR booth (so their big pulls hype your name). 0 → ~10%, 100+ → ~55%.
  const yourShare = Math.min(0.55, 0.1 + notoriety / 220)
  const npcs = []
  for (let i = 0; i < count && open.length; i++) {
    const idx = Math.floor(Math.random() * open.length)
    const { x, y } = open[idx]
    const ripping = Math.random() < 0.3 // ~30% are cracking sealed on the floor
    // Head to a booth from the off (weighted by draw) so the crowd forms immediately.
    const t = boothSpots.length ? weightedPick(boothSpots) : null
    npcs.push({ id: `npc${i}`, x, y, emoji: NPC_EMOJI[i % NPC_EMOJI.length], face: Math.random() < 0.5 ? -1 : 1,
      ripping, boughtFromYou: ripping && Math.random() < yourShare,
      target: t ? { x: t.x, y: t.y } : null, linger: Math.floor(Math.random() * 3) })
  }
  return npcs
}

// --- Show-floor NPC pathing --------------------------------------------------
// Draw weight per booth archetype — how strongly it pulls a crowd. Reputable/popular tables
// (fair dealers, whales, the travelling Vault) pull more shoppers than a known lowballer's.
const BOOTH_DRAW = { fair: 1.5, whale: 1.6, newbie: 1.2, sharp: 1.0, fleecer: 0.5, vault: 2.2, kiosk: 1.3 }
// Walkable floor tiles orthogonally adjacent to each booth, tagged with the booth's draw —
// the set of "stand here and browse" spots shoppers path to.
function buildBoothSpots(grid, cols, rows, booths) {
  const spots = []
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
    const cell = grid[y][x]
    if (typeof cell === 'number' && cell >= 100) {
      const bi = cell - 100
      const weight = BOOTH_DRAW[booths[bi]?.archetype] ?? 1
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        if (grid[y+dy]?.[x+dx] === 0) spots.push({ x: x+dx, y: y+dy, booth: bi, weight })
      }
    }
  }
  return spots
}
function weightedPick(arr) {
  let total = 0; for (const a of arr) total += a.weight || 1
  let r = Math.random() * total
  for (const a of arr) { r -= a.weight || 1; if (r <= 0) return a }
  return arr[arr.length - 1]
}
function passable(grid, cols, rows, x, y, blocked) {
  if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) return false
  if (grid[y][x] !== 0) return false // walls + booths are impassable
  return !blocked.has(`${x},${y}`)   // don't step onto the player or another shopper
}
// Greedy one-step toward the target: try the longer axis first, then the other. Because the
// hall is an open lattice of aisles, greedy-with-fallback reliably routes around the booths.
function stepToward(n, target, grid, cols, rows, blocked) {
  const dx = Math.sign(target.x - n.x), dy = Math.sign(target.y - n.y)
  const order = Math.abs(target.x - n.x) >= Math.abs(target.y - n.y) ? [[dx,0],[0,dy]] : [[0,dy],[dx,0]]
  for (const [ox, oy] of order) {
    if (!ox && !oy) continue
    if (passable(grid, cols, rows, n.x+ox, n.y+oy, blocked)) return { x: n.x+ox, y: n.y+oy }
  }
  return null
}
// When the greedy step is blocked (a booth or another shopper), take any legal step so an
// NPC never wedges permanently.
function randomStep(n, grid, cols, rows, blocked) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]]
  for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [dirs[i],dirs[j]] = [dirs[j],dirs[i]] }
  for (const [dx, dy] of dirs) if (passable(grid, cols, rows, n.x+dx, n.y+dy, blocked)) return { x: n.x+dx, y: n.y+dy }
  return null
}

const NPC_NAMES = ['A collector','A kid','A streamer','Some guy','A hype beast','A local','A grinder',
  'A YouTuber','A first-timer','A whale','A dad','Some teen','A regular','A breaker']
