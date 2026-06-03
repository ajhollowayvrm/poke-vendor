import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useGame } from '../game/store'
import { generateBooths, boothEncounter, SHOW_TIERS, NPC_EMOJI } from '../game/shows'
import { openPack, rarityRank, cardValue, fmtMoney, SETS } from '../game/engine'
import VendorBooth from './VendorBooth'
import Encounter from './Encounter'

const TILE = 52
const ENCOUNTER_COOLDOWN = 9000 // ms between booth walk-ups
// A pull worth announcing to the whole hall: SIR-or-better, any special foil, or grail.
const ANNOUNCE_RANK = rarityRank('Special Illustration Rare')
function isBigPull(card) {
  return !!card.foil || !!card._grail || rarityRank(card.rarity) >= ANNOUNCE_RANK
}
const HYPE = ['just hit a', 'PULLED a', 'cracked a', 'opened a', 'just ripped a']

export default function ShowFloor({ show, onLeave }) {
  const notoriety = useGame(s => s.notoriety)
  const upgrades = useGame(s => s.upgrades)
  const tier = SHOW_TIERS[show.tierKey]

  const [showDay, setShowDay] = useState(1) // which day of the multi-day show we're on
  const booths = useMemo(() => generateBooths(show, notoriety, showDay - 1), [show, notoriety, showDay])
  // Layout scales with booth count → bigger shows fill more of the page.
  const layout = useMemo(() => buildLayout(booths), [booths])
  const { grid, cols, rows, playerAt } = layout

  const [pos, setPos] = useState(() => ({ x: playerAt.x, y: playerAt.y + 1 }))
  const [openBooth, setOpenBooth] = useState(null)
  const [encounter, setEncounter] = useState(null)
  const [toast, setToast] = useState(null)
  const [boothAlert, setBoothAlert] = useState(null)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  // seed with mount time so the cooldown window opens on entry — gives the player
  // a grace period to look around before the first walk-up fires (was 0 = instant).
  const lastEncounterRef = useRef(Date.now())

  // NPC shoppers wandering the aisles (visual atmosphere). Some are ripping packs.
  const addNotoriety = useGame(s => s.addNotoriety)
  const [npcs, setNpcs] = useState(() => spawnNpcs(layout, tier.npcs, notoriety))
  const [poppedIds, setPoppedIds] = useState(() => new Set()) // NPCs mid-"pop" flash
  const [announce, setAnnounce] = useState(null)              // hall-wide big-pull banner
  useEffect(() => { setNpcs(spawnNpcs(layout, tier.npcs, notoriety)) }, [layout, tier.npcs, notoriety])

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600) }, [])

  // Drift NPCs around the open floor.
  useEffect(() => {
    const id = setInterval(() => {
      setNpcs(prev => prev.map(n => {
        if (Math.random() < 0.35) return n // pause sometimes
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]]
        const [dx, dy] = dirs[Math.floor(Math.random() * 4)]
        const nx = n.x + dx, ny = n.y + dy
        if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) return n
        if (grid[ny][nx] !== 0) return n // only walk open floor
        return { ...n, x: nx, y: ny, face: dx < 0 ? -1 : dx > 0 ? 1 : n.face }
      }))
    }, 700)
    return () => clearInterval(id)
  }, [grid, cols, rows])

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
      if (pack._god || isBigPull(best)) {
        const who = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)]
        const what = pack._god ? 'a GOD PACK 🤯' : `${best.foil ? best.foil.label + ' ' : ''}${best.name}`
        const verb = HYPE[Math.floor(Math.random() * HYPE.length)]
        // Hype only rubs off on YOU if they bought the sealed from your booth.
        const mine = !!npc.boughtFromYou
        if (mine) {
          const bump = pack._god ? 5 : 2
          addNotoriety(bump)
          useGame.getState().log('hype', `${who} hit ${what} from product they bought at your booth — your name's buzzing! (+${bump} notoriety)`, 0)
        }
        setAnnounce({ who, verb, what, card: best.img, value: cardValue(best), god: !!pack._god, mine, id: Date.now() })
        setTimeout(() => setAnnounce(a => (a && a.id ? null : a)), 5000)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [npcs, addNotoriety])

  // Booth walk-ups, now gated by a cooldown so they don't spam.
  useEffect(() => {
    const id = setInterval(() => {
      if (encounter || openBooth || boothAlert) return
      if (Date.now() - lastEncounterRef.current < ENCOUNTER_COOLDOWN) return
      // chance per 3s tick after cooldown: scales with the show's traffic and a
      // capped notoriety bonus so small shows stay calm even when you're famous.
      const notoBonus = Math.min(0.5, notoriety / 300)
      const chance = Math.min(0.85, 0.12 * tier.traffic * (1 + notoBonus))
      if (Math.random() < chance) {
        const enc = boothEncounter(notoriety, useGame.getState().collection)
        if (upgrades.ticker) { setBoothAlert(enc); lastEncounterRef.current = Date.now() }
        else if (atPlayerBooth(pos, playerAt)) { setEncounter({ enc, atBooth: true }); lastEncounterRef.current = Date.now() }
      }
    }, 3000)
    return () => clearInterval(id)
  }, [encounter, openBooth, boothAlert, notoriety, upgrades.ticker, pos, playerAt, tier.traffic])

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

  // Keyboard movement (desktop).
  useEffect(() => {
    function onKey(e) {
      const d = { ArrowUp: [0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0], W:[0,-1], S:[0,1], A:[-1,0], D:[1,0] }[e.key]
      if (!d) return
      e.preventDefault()
      move(d[0], d[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

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
    if (boothAlert) { setEncounter({ enc: boothAlert, atBooth: true }); setBoothAlert(null); return }
    const enc = boothEncounter(notoriety, useGame.getState().collection)
    setEncounter({ enc, atBooth: true })
    lastEncounterRef.current = Date.now()
  }
  function pick(opt) { flash(resolveEncounter(opt.effect)); setEncounter(null) }

  return (
    <div className="floorwrap">
      <div className="floorhud">
        <button className="btn alt" style={{ flex:'none' }} onClick={onLeave}>← Leave show</button>
        <span className="pill" style={{ background: tier.color+'33', color: tier.color }}>{show.name} · {tier.name}</span>
        {tier.days > 1 && <span className="pill">Show day {showDay} / {tier.days}</span>}
        <span className="muted floorhint" style={{ fontSize: 12 }}>WASD / tap to walk · tap a booth to shop · {booths.length} vendors</span>
        {tier.days > 1 && showDay < tier.days && (
          <button className="btn" style={{ flex:'none', maxWidth: 170, marginLeft:'auto' }}
            onClick={() => { setShowDay(d => d + 1); setPos({ x: playerAt.x, y: playerAt.y + 1 }); flash(`Day ${showDay + 1} of the show — fresh vendors arrive.`) }}>
            Next show day →
          </button>
        )}
        <span className="pill" style={{ marginLeft: tier.days > 1 && showDay < tier.days ? 0 : 'auto' }}>Notoriety {Math.round(notoriety)}</span>
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
                  <div className={`booth arch-${booths[boothIdx].archetype}`} title={booths[boothIdx].name}>
                    <span className="boothname">{booths[boothIdx].name}</span>
                    <span className="boothicon">🛒</span>
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
        <button className="dpad-btn act"   onClick={() => { if (!openBooth && !encounter) triggerPlayerBooth() }} title="Tend your booth">★</button>
        <button className="dpad-btn right" onClick={() => move(1,0)}>▶</button>
        <button className="dpad-btn down"  onClick={() => move(0,1)}>▼</button>
      </div>

      {announce && (
        <div className={`hall-announce ${announce.god ? 'god' : ''} ${announce.mine ? 'mine' : ''}`}>
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
      {openBooth && <VendorBooth booth={openBooth} onClose={() => setOpenBooth(null)} flash={flash} />}
      {encounter && <Encounter data={encounter.enc} onPick={pick} onClose={() => setEncounter(null)} />}
    </div>
  )
}

// --- layout: a hall sized to the booth count, booths in aisles, player center-bottom ---
function buildLayout(booths) {
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
  // player booth: center column, near the bottom
  const px = Math.floor(cols / 2), py = rows - 3
  grid[py][px] = 'P'
  return { grid, cols, rows, playerAt: { x: px, y: py } }
}

function atPlayerBooth(pos, playerAt) {
  return Math.abs(pos.x - playerAt.x) + Math.abs(pos.y - playerAt.y) <= 1
}

function spawnNpcs(layout, count, notoriety = 0) {
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
    npcs.push({ id: `npc${i}`, x, y, emoji: NPC_EMOJI[i % NPC_EMOJI.length], face: Math.random() < 0.5 ? -1 : 1,
      ripping, boughtFromYou: ripping && Math.random() < yourShare })
  }
  return npcs
}

const NPC_NAMES = ['A collector','A kid','A streamer','Some guy','A hype beast','A local','A grinder',
  'A YouTuber','A first-timer','A whale','A dad','Some teen','A regular','A breaker']
