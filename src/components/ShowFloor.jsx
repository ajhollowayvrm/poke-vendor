import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { toast } from '../ui/dialog'
import { useGame, acceptedMethods, hypeDemandMult, VLOG_BOOTH_MULT } from '../game/store'
import { generateBooths, boothEncounter, makeWhaleOffer, SHOW_TIERS, NPC_EMOJI, vendorRapport, cardMatchesWant,
  pickSnipe, boothItemKey, SNIPE_GRACE_MS, SNIPE_INTERVAL_MS, SNIPE_RATE } from '../game/shows'
import { openPack, rarityRank, cardValue, sealedValue, fmtMoney, round2, SHOP_SETS as SETS, cardImg, setNameOfCard, setById, fameMult, fameBeyond, isCardDeal, shopName, shopIcon, shopAccent, slabLabel } from '../game/engine'
import VendorBooth from './VendorBooth'
import Encounter from './Encounter'
import QuoteCounter from './QuoteCounter'
import PackOpening from './PackOpening'
import AutoRip from './AutoRip'
import CardTile from './CardTile'
import CardModal from './CardModal'
import { Modal } from '../ui/Modal'
import { clickable } from '../ui/clickable'
import { AnimatedNumber, CashFlash } from '../ui/AnimatedNumber'
import { Explain } from '../ui/Explain'

const ENCOUNTER_COOLDOWN = 15000 // ms between booth walk-ups (longer = calmer floor)
// How many unsolicited walk-ups your booth can get in a show day. This was a flat 3 — so a
// world-famous vendor's table was as quiet as an unknown's, which is exactly backwards. A big
// name draws a crowd: 3 at noto 0 → 5 at 100 → 7 at 300 → 10 (the hard rail) past ~700.
function maxWalkupsPerDay(notoriety, shopHype = 0) {
  return Math.min(10, Math.round((2 + fameMult(notoriety)) * hypeDemandMult(shopHype)))
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
  const shopHype = useGame(s => s.hype || 0) // 🔥 a hot name pulls extra walk-ups to the table
  const cash = useGame(s => s.cash) // shown on the floor HUD — you buy at booths here, so your balance must be visible
  const showReserve = useGame(s => s.showReserve || 0) // cash you left safely at home for this trip
  const settings = useGame(s => s.settings) // deal-detector config (what YOU count as a deal)
  const upgrades = useGame(s => s.upgrades)
  // Snapshot the money/rep state the moment you walk the floor, so leaving can recap what
  // the FLOOR itself did (buying, selling, encounters) — distinct from the days-away home
  // recap that already fired at entry. stats.earned/spent only move on real cash in/out.
  // It also snapshots what you WALKED IN WITH — every sealed/card uid you already owned. The
  // 🎒 haul (your home base at the show) is just the diff against that, so anything that came
  // into your hands here shows up without every buy path having to report itself: booth buys,
  // lot deals, trades, mystery packs and cards pulled from a rip on the floor.
  const floorBaseRef = useRef(null)
  if (floorBaseRef.current === null) {
    const g = useGame.getState()
    floorBaseRef.current = {
      earned: g.stats.earned, spent: g.stats.spent, noto: g.notoriety,
      rapport: Object.values(g.vendorSpend || {}).reduce((a, v) => a + v, 0),
      sealedUids: new Set((g.sealedInventory || []).map(it => it.uid)),
      cardUids: new Set([...(g.collection || []).map(c => c.uid), ...(g.showInventory || []).map(c => c.uid)]),
    }
  }
  // Leave: compute the floor recap from the baseline and hand it up to be folded into the
  // trip summary. takenIds counts every item lifted off a booth table this show.
  function handleLeave() {
    const g = useGame.getState()
    const b = floorBaseRef.current
    // 🎥 The best thing that ended up in your hands here — the vlog's headline. Same diff the
    // 🎒 haul uses (anything whose uid wasn't in the walk-in snapshot), so a card bought off a
    // table, won in a trade, or pulled from a rip at the floor all qualify.
    let best = null
    for (const c of [...(g.collection || []), ...(g.showInventory || [])]) {
      if (b.cardUids.has(c.uid)) continue
      if (!best || cardValue(c) > cardValue(best)) best = c
    }
    const floor = {
      spent: round2(g.stats.spent - b.spent),
      earned: round2(g.stats.earned - b.earned),
      notoGained: round2(g.notoriety - b.noto),
      rapport: round2(Object.values(g.vendorSpend || {}).reduce((a, v) => a + v, 0) - b.rapport),
      acquired: takenIds.size,
      bestPickup: best ? { name: best.name, value: cardValue(best) } : null,
    }
    onLeave(floor)
  }
  const showInventory = useGame(s => s.showInventory)
  const showSealed = useGame(s => s.showSealed)   // sealed product you brought to your booth
  const store = useGame(s => s.store)             // shop branding for the table sign
  const showVendors = useGame(s => s.showVendors) // recurring roster (stable identities)
  const vendorSpend = useGame(s => s.vendorSpend)
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory) // what you're carrying — the haul lives here
  const spentAll = useGame(s => s.stats.spent)    // for the haul's live running tally
  const earnedAll = useGame(s => s.stats.earned)
  const tier = SHOW_TIERS[show.tierKey]
  const [showTable, setShowTable] = useState(false) // peek at your booth inventory
  const [haulOpen, setHaulOpen] = useState(false)   // 🎒 home base — what you've picked up here
  const [haulSel, setHaulSel] = useState(() => new Set()) // sealed uids picked for a group rip

  // Which day of the multi-day show we're on. Restored from the save, because the floor is
  // rebuilt per day (generateBooths' dayOffset) and `takenIds` is scoped to ONE day's floor —
  // resuming a day-2 show on day 1 would serve day 1's stock against day 2's taken list.
  const [showDay, setShowDay] = useState(() => useGame.getState().activeShow?.showDay || 1)
  // Recurring roster gets injected into the floor; `show._arrival` ('open' | 'late') tunes
  // how picked-over the booths are; `show._leads` makes a vendor who DM'd you actually be
  // here with the promised item on the table.
  // The floor is fixed per show-day: notoriety must NOT be a dependency here — it ticks
  // constantly at a show (sales, questions, giveaways), and every tick used to rebuild
  // the whole floor, restocking everything already bought and re-minting card uids.
  const booths = useMemo(() => {
    // 🃏 An announced master set challenge skews a slice of every singles bin toward that set —
    // read once here (like the roster) so the floor stays fixed for the show-day.
    const chaseId = useGame.getState().challenge?.setId || null
    const bs = generateBooths(show, showDay - 1, showVendors, show._arrival || 'open', show._leads || [], chaseId)
    // Stamp a RELOAD-STABLE "taken" key on every item on every table: booth index + slot.
    // Purchases mark these in takenIds so closing and reopening a booth — or the whole app —
    // can never re-serve something you already bought. It has to be the position rather than
    // the card's uid, which is re-minted on every rebuild; see boothItemKey in game/shows.js.
    bs.forEach((b, bi) => {
      (b.stock || []).forEach((c, ci) => { c._tk = `${bi}#c${ci}` })
      ;(b.products || []).forEach((p, pi) => { p._tk = `${bi}#s${pi}` })
    })
    return bs
  }, [show, showDay, showVendors])

  // Everything bought off the floor this show — card uids + sealed `_tk` keys. Booth
  // stock is component state inside the booth modal, so without this a close/reopen
  // re-served every purchased item at the same uid (infinite rebuy of mispriced gems,
  // plus uid duplication: selling one copy silently destroyed both).
  // Seeded from the save so a resumed show does not re-serve everything you already bought.
  // These two sets are the reason a mid-show resume is safe at all — see recordShowProgress.
  const [takenIds, setTakenIds] = useState(() => new Set(useGame.getState().activeShow?.taken || []))
  const markTaken = (keys) => setTakenIds(prev => { const n = new Set(prev); for (const k of keys) n.add(k); return n })

  // Per-booth cash-till depletion for THIS show-day: selling to a vendor draws down their
  // finite till (booth.till), so you can't dump an unlimited amount on one whale. Keyed by
  // booth id + show-day so a fresh floor each day restocks the till.
  const [tillSpent, setTillSpent] = useState(() => ({ ...(useGame.getState().activeShow?.till || {}) }))
  const tillKey = (booth) => `${booth.id}#${showDay}`
  const markTillSpend = (booth, amt) => setTillSpent(prev => ({ ...prev, [tillKey(booth)]: (prev[tillKey(booth)] || 0) + amt }))

  // Mirror all three into the save whenever they move. Cheap (two small collections) and it
  // has to be an effect rather than part of markTaken/markTillSpend, because those are called
  // from several places and one of them forgetting to persist is exactly the bug this prevents.
  useEffect(() => {
    useGame.getState().recordShowProgress({ taken: [...takenIds], till: tillSpent, showDay })
  }, [takenIds, tillSpent, showDay])

  const [openBooth, setOpenBooth] = useState(null)
  // Booths you've walked up to this show — the directory greys the ones you've already
  // seen so you can tell at a glance what's left to browse. Session-scoped (a fresh floor
  // each show/day starts blank); recurring vendors keep a stable id, so they stay ticked.
  const [visitedBooths, setVisitedBooths] = useState(() => new Set())
  const visitBooth = useCallback((b) => {
    if (b?.id) setVisitedBooths(prev => prev.has(b.id) ? prev : new Set(prev).add(b.id))
    setOpenBooth(b)
  }, [])
  // "Come back to this" stars: eyeing an item at one booth, then walking the rest of the
  // floor before you commit. Keyed by boothId + item key (a card uid / a sealed `_tk`); the
  // directory highlights any booth holding a star so you can find your way back.
  const [starred, setStarred] = useState(() => new Set())
  const toggleStar = useCallback((boothId, key) => setStarred(prev => {
    const n = new Set(prev); const k = `${boothId}|${key}`; n.has(k) ? n.delete(k) : n.add(k); return n
  }), [])
  const starredBooths = useMemo(() => new Set([...starred].map(s => s.split('|')[0])), [starred])
  // Cards you've already haggled this show — one negotiation per card (no re-rolling
  // a vendor by re-opening the haggle). Persists across booth re-opens for the whole show.
  const [haggledIds, setHaggledIds] = useState(() => new Set())
  const markHaggled = useCallback((uid) => setHaggledIds(prev => { const n = new Set(prev); n.add(uid); return n }), [])
  // Haggled-down sealed prices, keyed by the line's reload-stable `_tk`. Lives here (not in the
  // booth) so it survives a close/reopen the same way haggledIds does — a sealed haggle used to
  // vanish the moment you closed the modal, leaving the Haggle button dead but the full ask back.
  const [agreedPrices, setAgreedPrices] = useState(() => new Map())
  const markAgreedPrice = useCallback((tk, price) => setAgreedPrices(prev => { const n = new Map(prev); n.set(tk, price); return n }), [])
  // Ripping on the floor is a QUEUE, not one product: buy three boxes off a table (or pick a
  // few out of your 🎒 haul) and they rip back-to-back right here without a trip home.
  // { set, product, rest[], idx, total, nonce } — nonce re-keys PackOpening for the next unit.
  const [vaultRip, setVaultRip] = useState(null)
  const [sifting, setSifting] = useState(null)   // sealed rows handed to the ⚡ sifter on the floor
  // Esc backs out of the peek/haul panels (the booth and the rip own their own escape).
  const [encounter, setEncounter] = useState(null)
  const [boothAlert, setBoothAlert] = useState(null)
  // Buyer appointments from pre-show leads — met (or ignored) during this show.
  const [meets, setMeets] = useState(() => (show._leads || []).filter(l => l.kind === 'buyer'))
  const [meetPick, setMeetPick] = useState(null) // the buyer lead being fulfilled
  const [inspect, setInspect] = useState(null)   // card tapped for its full detail page (condition, cut, price history)
  const resolveEncounter = useGame(s => s.resolveEncounter)
  // seed with mount time so the cooldown window opens on entry — gives the player
  // a grace period to look around before the first walk-up fires (was 0 = instant).
  const lastEncounterRef = useRef(Date.now())
  // cap unsolicited walk-ups per show day so the floor doesn't feel like a gauntlet.
  const walkupsRef = useRef(0)
  useEffect(() => { walkupsRef.current = 0; lastEncounterRef.current = Date.now() }, [showDay])
  const accepted = useMemo(() => acceptedMethods(upgrades), [upgrades])

  const flash = useCallback((m) => toast(m, 2600), [])

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

  // 🏃 THE OTHER DEALERS. Every so often a rival works the floor and lifts the best genuinely
  // under-market card left in a bin. The grace period means you always get a real look around
  // first, and only true deals are ever taken — so what you lose is exactly what you should
  // have been quicker about. See game/shows.js (pickSnipe) for the selection rule.
  const [sniped, setSniped] = useState(null)     // the "somebody just bought that" banner
  // Read through refs so the interval sees current state without being torn down and rebuilt
  // every time you buy something — which would restart the clock and mean nothing was ever
  // taken while you were actively shopping.
  const takenIdsRef = useRef(takenIds)
  useEffect(() => { takenIdsRef.current = takenIds }, [takenIds])
  const openBoothRef = useRef(openBooth)
  useEffect(() => { openBoothRef.current = openBooth }, [openBooth])
  const floorEntryRef = useRef(Date.now())
  useEffect(() => { floorEntryRef.current = Date.now(); setSniped(null) }, [showDay])
  useEffect(() => {
    const rate = SNIPE_RATE[show.tierKey] ?? 0.15
    const id = setInterval(() => {
      if (Date.now() - floorEntryRef.current < SNIPE_GRACE_MS) return
      if (openBoothRef.current) return  // not while you are standing at a table reading it
      if (Math.random() >= rate) return
      const hit = pickSnipe(booths, takenIdsRef.current)
      if (!hit) return
      markTaken([boothItemKey(hit.card)])
      setSniped({
        who: hit.who, card: hit.card, at: hit.booth.name,
        ask: hit.ask, worth: hit.worth, id: Date.now(),
      })
      setTimeout(() => setSniped(x => (x && x.id ? null : x)), 6000)
    }, SNIPE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [booths, show.tierKey])

  // 🐋 FLOOR WHALES (invitational/worlds, vending only). Where the real money walks the
  // aisles, a whale sometimes stops at YOUR table for its best piece — the same no-haggle
  // offer shape as the home channels, at a hotter 1.20–1.80× band. Needs a piece worth a
  // whale's time (≥20% of the tier cap) and a real name (noto 150+); capped at 2 a day so
  // it stays an event, not a faucet.
  const whaleCountRef = useRef(0)
  useEffect(() => { whaleCountRef.current = 0 }, [showDay])
  // 💥 Everything the 30s whale roll READS but that must not RESTART it. Its deps used to list
  // encounter, boothAlert and notoriety directly, and its cleanup clears the interval — so at a
  // vending booth, where the 3s walk-up loop sets and clears encounter/boothAlert constantly and
  // notoriety moves on every sale, the timer was torn down and rebuilt before it could ever fire.
  // On an Invitational or Worlds floor the whale roll may never have run at all.
  // The 3s walk-up loop below tolerates the same deps because its period is short; a 30s one
  // cannot. Same fix the snipe interval above already uses — see its comment.
  // No dep array: this ref must hold the LATEST values on every render.
  const whaleLiveRef = useRef(null)
  useEffect(() => { whaleLiveRef.current = { encounter, boothAlert, notoriety, accepted, ticker: upgrades.ticker } })
  // 💸 Ambient scale: at the elite shows, five-figure deals close around you — pure flavor
  // lines on the announce banner, zero economy.
  const [bigSale, setBigSale] = useState(null)
  useEffect(() => {
    const pWhale = { invitational: 0.08, worlds: 0.12 }[show.tierKey]
    if (!pWhale) return
    const id = setInterval(() => {
      // Flavor line first — it fires for shoppers and vendors alike.
      if (Math.random() < 0.15) {
        const amt = round2(tier.valueBand[1] * (0.3 + Math.random() * 0.8))
        const line = [
          `Two tables down, a PSA 10 just changed hands for ${fmtMoney(amt)}.`,
          `A ${fmtMoney(amt)} package deal just closed at the High Roller row.`,
          `Someone counted out ${fmtMoney(amt)} in hundreds a few booths over.`,
          `A slab just left the hall in a bank bag — ${fmtMoney(amt)}.`,
        ][Math.floor(Math.random() * 4)]
        setBigSale({ line, id: Date.now() })
        setTimeout(() => setBigSale(x => (x && x.id ? null : x)), 6000)
      }
      if (!show._asVendor) return
      const live = whaleLiveRef.current || {}
      // A whale offer is a no-haggle encounter same as a walk-up — it must not clobber one
      // already waiting to be answered, or it silently burns a whale slot on nothing.
      if (live.encounter || live.boothAlert) return
      if (Date.now() - floorEntryRef.current < SNIPE_GRACE_MS) return
      if (whaleCountRef.current >= 2) return
      if ((live.notoriety ?? 0) < 150) return
      if (Math.random() >= pWhale) return
      const inv = useGame.getState().showInventory || []
      const pool = inv.filter(c => cardValue(c) >= tier.valueBand[1] * 0.2)
      if (!pool.length) return
      const enc = makeWhaleOffer(pool, 'show', [1.20, 1.80], live.accepted)
      if (!enc) return
      whaleCountRef.current++
      if (live.ticker) setBoothAlert(enc)
      else if (busyRef.current) {
        useGame.getState().log('missed', 'A whale stopped at your booth while you were elsewhere — they moved on. (A 🔔 Visitor Ticker would have alerted you.)', 0)
      } else setEncounter({ enc, atBooth: true })
    }, 30000)
    return () => clearInterval(id)
    // Only what should genuinely restart the clock. Everything else the interval reads comes off
    // whaleLiveRef — see its comment above; adding a churning value back here disables the roll.
  }, [show.tierKey, show._asVendor])

  // Booth walk-ups, gated by a cooldown so they don't spam. With the 🔔 Visitor Ticker
  // you get an alert you can answer whenever — without it, a buyer who walks up while
  // you're deep at another vendor's table just leaves (that's what the ticker is for).
  const busy = !!(openBooth || encounter || vaultRip || sifting || meetPick || showTable || haulOpen)
  const busyRef = useRef(busy)
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => {
    if (!show._asVendor) return // shoppers have no booth → no walk-up buyers
    const id = setInterval(() => {
      if (encounter || boothAlert) return
      if (walkupsRef.current >= maxWalkupsPerDay(notoriety, shopHype)) return // hit the per-day cap
      if (Date.now() - lastEncounterRef.current < ENCOUNTER_COOLDOWN) return
      // Booth pull used to cap at +50% (reached at noto 150) and go flat. It keeps growing now
      // — a famous vendor's table is mobbed, which is what the whole show ladder is FOR.
      const notoBonus = Math.min(0.5, notoriety / 300) + fameBeyond(notoriety, 150) * 0.35
      const inv = useGame.getState().showInventory || []
      const showcaseN = inv.filter(c => c._showcase).length
      const dealActive = inv.some(c => c._deal)
      const boothMult = (show._boothMult || 1) * (1 + Math.min(0.45, showcaseN * 0.15)) * (dealActive ? 1.25 : 1)
      const signageMult = upgrades.signage ? 1.15 : 1 // 🪧 +15% booth foot traffic at shows
      // 🎥 They've seen the vlogs — people walk over because they recognize the table. Stacks
      // with signage on purpose: one is a sign, the other is a face.
      const vlogMult = upgrades.showVlog ? VLOG_BOOTH_MULT : 1
      const chance = Math.min(0.9, 0.12 * tier.traffic * (1 + notoBonus) * boothMult * signageMult * vlogMult)
      if (Math.random() < chance) {
        const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted, null, null, null, useGame.getState().showSealed, { tierKey: show.tierKey })
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
    if (walkupsRef.current >= maxWalkupsPerDay(notoriety, shopHype)) { flash('Your table’s had its rush for today — it’s quiet now.'); return }
    const enc = boothEncounter(notoriety, useGame.getState().showInventory, 'show', accepted, null, null, null, useGame.getState().showSealed, { tierKey: show.tierKey })
    setEncounter({ enc, atBooth: true })
    lastEncounterRef.current = Date.now(); walkupsRef.current++
  }
  function pick(opt) { flash(resolveEncounter(opt.effect)); setEncounter(null) }

  // Start a floor rip of one or more products, back-to-back. The first goes up now; the rest
  // wait in `rest` and take over as each finishes (see nextRip).
  const startRipQueue = useCallback((list) => {
    if (!list?.length) return
    setVaultRip({ ...list[0], rest: list.slice(1), idx: 1, total: list.length, nonce: 0 })
  }, [])
  // A product finished: pull the next one out of the queue, or close the overlay when it's empty.
  const nextRip = useCallback(() => {
    setVaultRip(v => {
      if (!v?.rest?.length) return null
      const [next, ...rest] = v.rest
      return { ...next, rest, idx: v.idx + 1, total: v.total, nonce: (v.nonce || 0) + 1 }
    })
  }, [])

  // Buy + rip sealed product off a booth's table right here on the floor.
  // Returns true on success so the booth can mark the entry taken.
  const buySealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return false
    const g = useGame.getState()
    if (g.cash < ask) { flash(`Not enough cash for the ${product.name || product.type}.`); return false }
    if (!g.spend(ask)) return false
    g.recordSetSpend(set.id, ask)
    g.log('buy', `Bought a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} (${show.name})`, -ask)
    startRipQueue([{ set, product: { ...product, price: ask } }])
    return true
  }, [show.name, flash, startRipQueue])

  // Take a whole STACK off one line and rip every unit here — one charge, one queue. This is
  // what makes "I bought four of these, let me open them at the table" work; buying them one
  // at a time to rip one at a time was the only way before.
  const buySealedStack = useCallback(({ set, product, each, n, vendorName }) => {
    if (!set || !product || !(n > 0)) return false
    const total = round2(each * n)
    const g = useGame.getState()
    if (g.cash < total) { flash(`Not enough cash — ${n}× ${product.type} runs ${fmtMoney(total)}.`); return false }
    if (!g.spend(total)) return false
    g.recordSetSpend(set.id, total)
    g.log('buy', `Bought ${n}× ${product.type} of ${set.name} from ${vendorName || 'a vendor'} to rip on the floor (${show.name})`, -total)
    startRipQueue(Array.from({ length: n }, () => ({ set, product: { ...product, price: each } })))
    return true
  }, [show.name, flash, startRipQueue])

  // Rip product you ALREADY own — bought here earlier and stocked, so there's nothing to pay.
  // ripSealed pulls each unit out of inventory; the queue rips them one after another.
  const ripHeld = useCallback((uids) => {
    const list = (Array.isArray(uids) ? uids : [uids])
      .map(uid => useGame.getState().ripSealed(uid))
      .filter(Boolean)
      .map(it => ({ set: setById(it.setId), product: it.product }))
      .filter(q => q.set)
    if (!list.length) { flash("That product isn't in your bag any more."); return }
    startRipQueue(list)
  }, [flash, startRipQueue])

  // Buy sealed off a booth and STOCK it in held inventory instead of ripping now.
  const stockSealed = useCallback(({ set, product, ask, vendorName }) => {
    if (!set || !product) return false
    const item = useGame.getState().buySealed(set, { ...product, _buyPrice: ask }, ask)
    if (!item) { flash(`Not enough cash for the ${product.name || product.type}.`); return false }
    flash(`Stocked a ${product.type} of ${set.name} from ${vendorName || 'a vendor'} — it's in your 🎒 haul: rip it here or take it home.`)
    return true
  }, [flash])

  // --- 🎒 Your haul: home base at the show ---------------------------------------------
  // Everything that's come into your hands since you walked through the door, by diffing
  // against the snapshot in floorBaseRef. Sealed you're carrying can be ripped right here.
  const haulSealed = useMemo(
    () => (sealedInventory || []).filter(it => !floorBaseRef.current.sealedUids.has(it.uid)),
    [sealedInventory])
  const haulCards = useMemo(
    () => [...(collection || []), ...(showInventory || [])]
      .filter(c => !floorBaseRef.current.cardUids.has(c.uid))
      .sort((a, b) => cardValue(b) - cardValue(a)),
    [collection, showInventory])
  // Identical product groups into one stack, exactly like the sealed inventory back home.
  const haulStacks = useMemo(() => {
    const map = new Map()
    for (const it of haulSealed) {
      const k = `${it.setId}|${it.product?.type}|${it.product?.name || ''}|${it.vintage ? 1 : 0}`
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(it)
    }
    return [...map.values()].sort((a, b) => sealedValue(b[0]) - sealedValue(a[0]))
  }, [haulSealed])
  const packsOf = (items) => items.reduce((a, it) => a + (it.product?.packs || 1), 0)
  const haulPacks = packsOf(haulSealed)
  const selItems = haulSealed.filter(it => haulSel.has(it.uid))
  const selPacks = packsOf(selItems)
  const haulCount = haulSealed.length + haulCards.length
  function toggleHaulStack(items) {
    setHaulSel(prev => {
      const n = new Set(prev)
      const allIn = items.every(it => n.has(it.uid))
      items.forEach(it => allIn ? n.delete(it.uid) : n.add(it.uid))
      return n
    })
  }
  // Rip the picked sealed by hand, one product after another, without leaving the floor.
  function ripSelection() {
    if (!selItems.length) return
    const uids = selItems.map(it => it.uid)
    setHaulSel(new Set())
    ripHeld(uids)
  }
  // Or hand the pick to the ⚡ sifter — it churns and stops on the packs worth your hands.
  // The haul panel closes for it (the sift is a full-screen takeover) and reopens after.
  function siftSelection() {
    if (!selItems.length) return
    setHaulOpen(false)
    setHaulSel(new Set())
    setSifting(selItems)
  }

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
        {/* A new show day is a WHOLE NEW FLOOR (generateBooths reseeds on dayOffset), so the
            taken keys must be dropped with it — they are booth+slot positions, and yesterday's
            positions hold tomorrow's stock. Left in place they blanked whatever happened to sit
            where you bought. The till is keyed by day instead and refills on its own. */}
        {tier.days > 1 && showDay < tier.days && (
          <button className="btn btn-fixed" style={{ maxWidth: 170, marginLeft:'auto' }}
            onClick={() => { setShowDay(d => d + 1); setTakenIds(new Set()); flash(`Day ${showDay + 1} of the show — fresh vendors set up.`) }}>
            Next show day →
          </button>
        )}
        <span className="pill" style={{ marginLeft: tier.days > 1 && showDay < tier.days ? 0 : 'auto' }}>⭐ {Math.round(notoriety)}{shopHype >= 10 ? ` · 🔥 ${Math.round(shopHype)}` : ''}</span>
        <Explain label="What is the floor wallet?" trigger={<span className="pill cash-pill">
          💵 <AnimatedNumber value={cash} format={fmtMoney} /><CashFlash value={cash} />
        </span>}>
          Your floor wallet — what you brought to spend here. Selling on the floor tops it back up.
        </Explain>
        {showReserve > 0 && (
          <Explain label="What is cash at home?" trigger={<span className="pill btn-fixed" style={{ opacity: 0.85 }}>
            🏦 {fmtMoney(showReserve)} at home
          </span>}>
            Cash you left safely at home — it can't be spent on the floor, and it's yours again when you leave.
          </Explain>
        )}
        {/* 🎒 Home base: everything you've picked up here, and the place to rip it. Tapping it
            opens the haul panel, which explains itself, so no title is needed here. */}
        <button className="pill btn-fixed" style={{ cursor: 'pointer', border: 0, background: haulCount ? 'color-mix(in srgb, var(--gold) 16%, transparent)' : undefined, color: haulCount ? 'var(--gold)' : undefined }}
          onClick={() => setHaulOpen(true)}>
          🎒 Haul{haulCount ? ` (${haulCount})` : ''}{haulPacks ? ` · ${haulPacks} pk` : ''}
        </button>
        {show._asVendor ? (
          <>
            <button className="pill btn-fixed" style={{ cursor: 'pointer', border: 0 }}
              onClick={() => setShowTable(true)}>
              {shopIcon(store)} {shopName(store)} ({showInventory.length + (showSealed?.length || 0)})
            </button>
            <button className="btn gold btn-fixed" style={{ maxWidth: 150, padding: '6px 12px' }}
              onClick={tendTable}>
              ⭐ Tend table
            </button>
          </>
        ) : (
          <Explain label="Why can't I sell here?" trigger={<span className="pill btn-fixed" style={{ opacity: 0.7 }}>
            🛍️ Shopping
          </span>}>
            You're here as a shopper — buy a Vendor Setup to run your own booth.
          </Explain>
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
                  ? <button className="btn gold btn-fixed" style={{ padding: '6px 12px' }} onClick={() => setMeetPick(l)}>🤝 Meet ({matches.length} match{matches.length > 1 ? 'es' : ''})</button>
                  : <span className="pill" style={{ opacity: 0.7 }}>don't have it</span>}
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
              <button className="btn btn-fixed" style={{ padding: '6px 12px' }}
                onClick={() => { const b = booths.find(x => x.vendorId === l.vendorId); if (b) visitBooth(b) }}>
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
              <div key={booth.id} className="vdir-row kiosk" {...clickable(() => visitBooth(booth))}>
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
          // Out-of-print "aftermarket" sealed (Fusion Strike, Evolving Skies, Team Up…): not
          // old enough to be vintage, but no longer printed — you can't buy it fresh in the shop.
          const hasAftermarket = (booth.products || []).some(p => p._origin === 'aftermarket')
          const top = booth.stock.reduce((b, c) => (!b || (c._ask || 0) > (b._ask || 0)) ? c : b, null)
          const deals = upgrades.network ? booth.stock.filter(c => isCardDeal(c, c._ask || 0, settings)).length : 0
          const visited = visitedBooths.has(booth.id)
          const starredHere = starredBooths.has(booth.id)
          return (
            <div key={booth.id} className={`vdir-row arch-${booth.archetype} ${crowd >= 3 ? 'busy' : ''} ${booth.leadNote ? 'lead' : ''} ${visited ? 'visited' : ''} ${starredHere ? 'starred' : ''}`}
              {...clickable(() => visitBooth(booth))}>
              <span className="vdir-icon">{booth.recurring ? '🤝' : '🛒'}</span>
              <div className="vdir-info">
                <div className="vdir-name">
                  {booth.name}
                  <span className="pill vdir-arch">{booth.archLabel}</span>
                  {booth.specialty === 'sealed' && <span className="pill" style={{ background: '#3b6cff22', color: 'var(--accent-light)' }}>📦 sealed wall</span>}
                  {booth.specialty === 'vintage' && <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>🗝️ vintage table</span>}
                  {booth.bigDeal && !takenIds.has(booth.bigDeal._tk) && <span className="pill" style={{ background: '#7cf0ff22', color: '#7cf0ff' }}>🐋 private package · {fmtMoney(booth.bigDeal.price)}</span>}
                  {starredHere && <span className="pill vdir-starred">⭐ come back</span>}
                  {rap && rap.level > 0 && <span className="pill" style={{ background: rap.color + '22', color: rap.color }}>{rap.name}{rap.disc ? ` · ${Math.round(rap.disc * 100)}% off` : ''}</span>}
                  {booth.leadNote && <span className="pill vdir-held">🗝️ set aside for you</span>}
                  {crowd >= 2 && <span className="pill vdir-crowd">👥 {crowd}</span>}
                  {visited && <span className="pill vdir-visited">✓ visited</span>}
                </div>
                <div className="vdir-sub muted">
                  {cap(booth.vibe)} · pays {Math.round(booth.buyMult * 100)}% cash{booth.tradeMult ? ` · ${Math.round(booth.tradeMult * 100)}% trade` : ''} for yours
                </div>
                <div className="vdir-sub">
                  🃏 {booth.stock.length} singles
                  {sealedN > 0 && <> · 📦 {sealedN} sealed{hasVintage ? ' (🗝️ vintage!)' : ''}{hasAftermarket ? ' (🕰️ out-of-print!)' : ''}</>}
                  {mysteryN > 0 && <> · ❓ mystery</>}
                  {top && <> · ⭐ {top.grade ? `${slabLabel(top.grade)} ` : ''}{top.name} {fmtMoney(top._ask)}</>}
                  {deals > 0 && <span className="pos"> · {deals} DEAL{deals > 1 ? 'S' : ''} flagged</span>}
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

      {/* 💸 Elite-hall ambience: the money moving around you. Flavor only — no economy. */}
      {bigSale && (
        <div className="hall-announce">
          <div>
            <div className="ha-line">💸 {bigSale.line}</div>
            <div className="ha-sub">This is the room where the money moves.</div>
          </div>
        </div>
      )}

      {/* 🏃 Somebody else got there first. The banner names the card, the table and what it
          was under market for, because the lesson is only useful if you can see the number. */}
      {sniped && (
        <div className="hall-announce sniped">
          {cardImg(sniped.card) && <img src={cardImg(sniped.card)} alt="" />}
          <div>
            <div className="ha-line">🏃 {sniped.who} just bought <b>{sniped.card.name}</b>
              {sniped.at ? <span className="muted"> off {sniped.at}</span> : ''}.</div>
            <div className="ha-sub">
              {fmtMoney(sniped.ask)} for {fmtMoney(sniped.worth)} of card — <b>{fmtMoney(sniped.worth - sniped.ask)} under market</b>.
              You are not the only dealer working this floor.
            </div>
          </div>
        </div>
      )}

      {openBooth && <VendorBooth booth={openBooth} onClose={() => setOpenBooth(null)} flash={flash} onRipSealed={buySealed}
        onStockSealed={stockSealed} onRipSealedStack={buySealedStack} haggledIds={haggledIds} onHaggled={markHaggled}
        agreedPrices={agreedPrices} onAgreedPrice={markAgreedPrice}
        takenIds={takenIds} onTaken={markTaken} asVendor={show._asVendor}
        tillLeft={Math.max(0, round2((openBooth.till || 0) - (tillSpent[tillKey(openBooth)] || 0)))}
        onTillSpend={(amt) => markTillSpend(openBooth, amt)}
        starredKeys={new Set([...starred].filter(s => s.startsWith(openBooth.id + '|')).map(s => s.slice(openBooth.id.length + 1)))}
        onToggleStar={(key) => toggleStar(openBooth.id, key)} />}
      {/* A quote walk-up ("what'll you give me for these?") runs its own negotiation modal;
          everything else is the standard pick-an-option encounter. */}
      {encounter && (encounter.enc.kind === 'quote'
        ? <QuoteCounter req={encounter.enc} onDone={(msg) => { if (msg) flash(msg); setEncounter(null) }} />
        : <Encounter data={encounter.enc} onPick={pick} onClose={() => setEncounter(null)} />)}

      {/* 🎒 YOUR HAUL — the home base at a show. What you've picked up on this floor, in one
          place, with the sealed still rippable HERE: pick a stack (or several) and tear into
          them at the table, or hand the pile to the ⚡ sifter. Anything you leave sealed just
          rides home with you. Rendered ABOVE the booth and BELOW the rip overlay on purpose —
          ripping out of the haul returns you to the haul. */}
      {haulOpen && (
        <Modal onClose={() => setHaulOpen(false)} maxWidth={760} label="Your haul">
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ marginRight: 'auto' }}>🎒 Your haul</h2>
              {haulSealed.length > 0 && (
                <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 14%, transparent)', color: 'var(--gold)' }}>
                  📦 {haulSealed.length} sealed · {haulPacks} pack{haulPacks === 1 ? '' : 's'}
                </span>
              )}
              {haulCards.length > 0 && <span className="pill">🃏 {haulCards.length} card{haulCards.length === 1 ? '' : 's'}</span>}
            </div>
            <p className="cap t-sm mt-1">
              Everything you've picked up at <b>{show.name}</b> — bought off the tables and pulled here.
              Sealed you're carrying can be <b>ripped right here on the floor</b>; whatever you leave
              wrapped comes home with you.
            </p>
            <div className="banner mt-3">
              💵 Spent on the floor <b>{fmtMoney(Math.max(0, round2(spentAll - floorBaseRef.current.spent)))}</b>
              {' · '}Taken in <b className="pos">{fmtMoney(Math.max(0, round2(earnedAll - floorBaseRef.current.earned)))}</b>
              {haulCards.length > 0 && <> · 🃏 cards on you worth <b>{fmtMoney(haulCards.reduce((a, c) => a + cardValue(c), 0))}</b></>}
            </div>

            {haulCount === 0 ? (
              <div className="empty mt-5">
                Nothing yet — you've not bought anything at this show. Walk the tables above.
              </div>
            ) : (
              <>
                <div className="floor-sec-h">📦 Sealed you're carrying <span className="muted">— tap a stack to pick it for a group rip</span></div>
                {haulStacks.length === 0 ? (
                  <div className="floor-sec-empty muted">No sealed in the bag — every product you bought here has been ripped.</div>
                ) : (
                  <div className="vsealed-list">
                    {haulStacks.map(items => {
                      const it = items[0]
                      const set = setById(it.setId)
                      const picked = items.every(x => haulSel.has(x.uid))
                      const packs = packsOf(items)
                      return (
                        <div key={it.uid} className={`vsealed-row ${picked ? 'in-stack' : ''} ${it.vintage ? 'sealed-vintage' : ''}`}>
                          <span className="vsealed-name">
                            <button type="button" className={`stack-check ${picked ? 'on' : ''}`}
                              style={{ marginRight: 6, verticalAlign: '-7px' }}
                              aria-pressed={picked} aria-label="Pick this stack for a group rip"
                              onClick={() => toggleHaulStack(items)}>{picked ? '✓' : '+'}</button>
                            {it.vintage ? '🗝️ ' : (it.product.icon || '📦') + ' '}{it.product.type}
                            {items.length > 1 && <span className="pill vsealed-qty">×{items.length}</span>}
                          </span>
                          <span className="vsealed-meta">
                            {set?.name} · {packs} pack{packs === 1 ? '' : 's'} · {fmtMoney(sealedValue(it) * items.length)}
                          </span>
                          <span className="vsealed-ask">
                            <span className="ask">{fmtMoney(it.boughtPrice || 0)}{items.length > 1 ? ' ea' : ''}</span>
                          </span>
                          <span className="vsealed-act">
                            <button className="btn gold" onClick={() => ripHeld(it.uid)}>
                              📦 Rip{items.length > 1 ? ' one' : ''}
                            </button>
                            {items.length > 1 && (
                              <button className="btn alt"
                                onClick={() => ripHeld(items.map(x => x.uid))}>Rip all {items.length}</button>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {haulCards.length > 0 && (
                  <>
                    <div className="floor-sec-h mt-5">
                      🃏 Cards <span className="muted">— bought at the tables & pulled from rips here</span>
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))', marginTop: 6 }}>
                      {haulCards.slice(0, 18).map(c => (
                        <div key={c.uid} className="vendoritem" style={{ cursor: 'zoom-in' }} onClick={() => setInspect(c)}>
                          <CardTile card={c} interactive={false} />
                        </div>
                      ))}
                    </div>
                    {haulCards.length > 18 && (
                      <div className="cap mt-3">
                        +{haulCards.length - 18} more in the bag (biggest {18} shown) — the rest are waiting in your collection.
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={() => setHaulOpen(false)}>Back to the floor</button>

            {/* Sticky picker bar — the pack count is the number that matters: two Prismatic
                Super-Premium Collections is 30 packs, not "2 items". */}
            {selItems.length > 0 && (
              <div className="bulk-bar">
                <div className="bulk-bar-summary">
                  <b>{selItems.length} item{selItems.length === 1 ? '' : 's'}</b> · <b>{selPacks} pack{selPacks === 1 ? '' : 's'}</b> picked
                </div>
                <div className="bulk-bar-actions">
                  <button className="btn gold" onClick={ripSelection}>📦 Rip {selPacks} pack{selPacks === 1 ? '' : 's'}</button>
                  <button className="btn alt" onClick={siftSelection}>⚡ Sift {selPacks}</button>
                  <button className="btn alt" style={{ maxWidth: 60 }} onClick={() => setHaulSel(new Set())}>✕</button>
                </div>
              </div>
            )}
        </Modal>
      )}

      {vaultRip && (
        <Modal dismissable={false} className="vault-rip-modal" bgClassName="vault-rip-bg" maxWidth={980} label="Vault rip">
            <div className="vault-ribbon">
              {vaultRip.set?.vintage ? '🗝️ VINTAGE' : '📦 SEALED'} — {vaultRip.set?.name} {vaultRip.product.name || vaultRip.product.type}
              {vaultRip.total > 1 && <> · <b>{vaultRip.idx} of {vaultRip.total}</b></>}
            </div>
            {/* onExit walks the queue: the next product goes straight up, and only the last
                one closes the overlay — so "rip all of them here" really is all of them. */}
            <PackOpening key={vaultRip.nonce || 0} set={vaultRip.set} product={vaultRip.product}
              singleNoReRip onExit={nextRip} />
        </Modal>
      )}

      {/* ⚡ The sifter, on the floor. Full-screen takeover like it is at home; the haul panel
          reopens underneath it when you're done. */}
      {sifting && (
        <div className="rip-overlay rip-full">
          <AutoRip items={sifting} onExit={() => { setSifting(null); setHaulOpen(true) }} />
        </div>
      )}

      {/* Meet a buyer appointment: pick which matching copy to sell them. */}
      {meetPick && (() => {
        const matches = [...collection, ...(showInventory || [])].filter(c => cardMatchesWant(c, meetPick.want))
        return (
          <Modal onClose={() => setMeetPick(null)} maxWidth={640} zIndex={25} label="Meetup pick">
              <h2 className="t-xl" style={{ marginBottom: 2 }}>🤝 Meet {meetPick.who}</h2>
              <p className="cap t-sm mt-0">
                As arranged — they're buying <b>{meetPick.desc}</b> at <b>{Math.round(meetPick.premiumMult * 100)}% of market</b>, cash on the spot (+{meetPick.notoriety}★).
              </p>
              {matches.length === 0 ? (
                <div className="empty">You don't have it on you anymore.</div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
                  {matches.map(c => (
                    <div key={c.uid} className="vendoritem">
                      <div style={{ cursor: 'zoom-in' }} onClick={() => setInspect(c)}>
                        <CardTile card={c} interactive={false} />
                      </div>
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
          </Modal>
        )
      })()}

      {showTable && (
        <Modal onClose={() => setShowTable(false)} maxWidth={720} label="Your table">
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ marginRight: 'auto' }}>
                <span style={shopAccent(store) ? { color: shopAccent(store) } : undefined}>{shopIcon(store)} {shopName(store)}</span>
              </h2>
              {(() => {
                const packsOut = useGame.getState().packsForChannel ? useGame.getState().packsForChannel('show').length : 0
                return packsOut > 0 && (
                  <Explain label="What are mystery packs out?" trigger={
                    <span className="pill" style={{ background: '#ffcb0522', color: 'var(--gold)' }}>
                      ❓ {packsOut} mystery pack{packsOut === 1 ? '' : 's'} out
                    </span>}>
                    Your built mystery packs (with the 🎪 Shows channel on) sell off this table too.
                  </Explain>
                )
              })()}
              {(showSealed?.length || 0) > 0 && (
                <span className="pill" style={{ background: 'color-mix(in srgb, var(--gold) 14%, transparent)', color: 'var(--gold)' }}>
                  📦 {showSealed.length} sealed · {fmtMoney(showSealed.reduce((a, it) => a + sealedValue(it), 0))}
                </span>
              )}
              <span className="pill">{showInventory.length} card{showInventory.length === 1 ? '' : 's'} · {fmtMoney(showInventory.reduce((a, c) => a + cardValue(c), 0))}</span>
            </div>
            {store?.tagline?.trim() && <p className="muted" style={{ margin: '2px 0 0', fontStyle: 'italic' }}>“{store.tagline.trim()}”</p>}
            <p className="muted mt-1">
              Shoppers who walk up to your booth buy from these — cards <b>and any sealed product you brought</b>.
              <b> Work your table</b> to pull more foot traffic: feature your best pieces in the <b>⭐ showcase</b> (up to 3)
              and flag one <b> 🏷️ Deal of the Show</b> as a crowd-drawing loss-leader.
            </p>
            {show._asVendor && (
              <div className="banner mt-3">
                📍 Spot: <b>{show._spotLabel || 'Standard table'}</b>
                {' · '}⭐ Showcase {showInventory.filter(c => c._showcase).length}/3
                {' · '}🏷️ Deal: <b>{showInventory.find(c => c._deal)?.name || 'none'}</b>
                {' — '}<span className="pos">traffic ×{( (show._boothMult||1) * (1 + Math.min(0.45, showInventory.filter(c=>c._showcase).length*0.15)) * (showInventory.some(c=>c._deal)?1.25:1) ).toFixed(2)}</span>
              </div>
            )}
            {showInventory.length === 0 && (showSealed?.length || 0) === 0 ? (
              <div className="empty">Nothing on your table yet — buy from a vendor and list it here, or sell from your collection to other vendors. You can also pack cards and sealed from home before a show.</div>
            ) : (
              <>
                {showInventory.length > 0 && (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(132px,1fr))', marginTop: 6 }}>
                    {[...showInventory].sort((a, b) => (b._showcase?1:0)-(a._showcase?1:0) || cardValue(b) - cardValue(a)).map(c => (
                      <div key={c.uid} className={`vendoritem ${c._showcase ? 'featured' : ''}`}>
                        <div style={{ cursor: 'zoom-in' }} onClick={() => setInspect(c)}>
                          <CardTile card={c} interactive={false} />
                        </div>
                        <div className="cap">{fmtMoney(cardValue(c))}{c._deal ? ' · 🏷️ deal' : ''}</div>
                        <div className="row" style={{ gap: 5 }}>
                          <button className={`btn ${c._showcase ? 'gold' : 'alt'}`} style={{ fontSize: 'var(--fs-xs)', padding: '5px 6px' }}
                            onClick={() => useGame.getState().toggleShowcase(c.uid)}>{c._showcase ? '★ Featured' : '☆ Showcase'}</button>
                          <button className={`btn ${c._deal ? 'gold' : 'alt'}`} style={{ flex:'none', fontSize: 'var(--fs-xs)', padding: '5px 6px' }}
                            onClick={() => useGame.getState().setDealOfShow(c._deal ? null : c.uid)}
                            aria-label="Flag as the Deal of the Show">🏷️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(showSealed?.length || 0) > 0 && (
                  <>
                    <div className="cap" style={{ fontWeight: 700, margin: '14px 2px 4px' }}>📦 Sealed on your table</div>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', marginTop: 2 }}>
                      {[...showSealed].sort((a, b) => sealedValue(b) - sealedValue(a)).map(it => {
                        const set = setById(it.setId)
                        return (
                          <div key={it.uid} className="product sealed-item">
                            <div className="sealed-head">
                              {set?.logo && <img className="sealed-logo" src={set.logo} alt={set.name} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <b className="sealed-name">{it.product.icon || '📦'} {it.product.type}</b>
                                <div className="cap">{set?.name}{it.vintage ? ' · 🏛️ vintage' : ''} · {it.product.packs} pk</div>
                              </div>
                            </div>
                            <div className="sealed-value"><span className="sealed-now">{fmtMoney(sealedValue(it))}</span></div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}
            <button className="btn alt" style={{ marginTop: 16, maxWidth: 160 }} onClick={() => setShowTable(false)}>Close</button>
        </Modal>
      )}

      {inspect && <CardModal card={inspect} onClose={() => setInspect(null)} />}
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
