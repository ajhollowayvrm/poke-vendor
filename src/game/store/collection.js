// Collection slice — cards you own and how they leave the collection for cash.
//
// createCollectionSlice(set, get) returns: addPulls (rip → collection + stats/ledger),
// master-set completion, the quick-sell / buylist / consign exits (single + bulk), and the
// full grading lifecycle (submit, bulk-submit, resolve). Listing on your own site lives in
// the SELLING slice; buying sealed lives in SOURCING.

import {
  cardValue, isBulkCard, round2, GRADING, gradingFee, graderTier, bulkDiscount,
  rollGrade, ownedIdSet, SETS, setCompletion, completionReward, bulkSellableUids,
  setById, cardVariant, cardMastersetVariants, fileableInBinder,
} from '../engine'
import { setIdOf, bumpSet } from './helpers'
import { absoluteDay } from './constants'

// Quick-selling is the instant-but-worst exit, and now it has teeth beyond the flat rate:
//   • DUMP PENALTY — every quick-sell you make in a single day floods the buylist, so each
//     one that day pays a little less (diminishing returns). A fire-sale of your whole
//     collection nets far less per card than spacing sales out, listing, or consigning.
//   • REP DING — dumping a genuinely valuable card cheap dents your standing; collectors
//     notice a known name flipping chase cards for scraps.
// Together these make quick-sell strictly the panic/convenience button — anything worth real
// money wants the patient channels (list for the market, consign near market, fill a want).
const DUMP_PENALTY_PER = 0.025  // rate cut per prior quick-sell today
const DUMP_PENALTY_MAX = 0.20   // capped (never worse than base − 20 points)
const DUMP_DING_VALUE = 50      // a card worth ≥ this, dumped cheap, dents notoriety
function dumpRate(base, prior) {
  return base * (1 - Math.min(DUMP_PENALTY_MAX, DUMP_PENALTY_PER * Math.max(0, prior)))
}

export function createCollectionSlice(set, get) {
  return {
    addPulls(cards, setName, packs = 1) {
      set(s => {
        // With a storefront, everything you pull is YOURS first: singles land in Personal
        // (locked), and you decide what goes out to the floor or into the storeroom. Nothing
        // sells from Personal except a manual want fulfilment. Without a store the flag would
        // just block the bulk-sell flow, so keep the old behaviour there.
        const hasStore = !!s.upgrades?.storefront
        const incoming = hasStore ? cards.map(c => ({ ...c, locked: true, loc: 'storeroom' })) : cards
        const hits = cards.filter(c => c._isHit).length
        const best = cards.reduce((b, c) => (cardValue(c) > (b?cardValue(b):0) ? c : b), s.stats.bestPull)
        // track best foil pulled (by value) for the stats page
        const foils = cards.filter(c => c.foil)
        const bestFoil = foils.reduce((b, c) => (cardValue(c) > (b?cardValue(b):0) ? c : b), s.stats.bestFoil)
        const godPacks = (s.stats.godPacks || 0) + (cards._god || cards.some(c => c._fromGod) ? 1 : 0)
        const demigodPacks = (s.stats.demigodPacks || 0) + (cards._demigod || cards.some(c => c._fromDemigod) ? 1 : 0)
        // Fold pulled cards into the per-set ledger (grouped by set, in case a single
        // rip spans sets). Packs are attributed to the first card's set.
        let bySet = s.bySet
        const firstSet = setIdOf(cards[0])
        for (const c of cards) {
          bySet = bumpSet(bySet, setIdOf(c), {
            pulledValue: cardValue(c), cardsPulled: 1, hits: c._isHit ? 1 : 0,
          })
        }
        if (firstSet) bySet = bumpSet(bySet, firstSet, { packsOpened: packs })
        return {
          collection: [...incoming, ...s.collection],
          bySet,
          stats: {
            ...s.stats,
            packsOpened: s.stats.packsOpened + packs,
            cardsPulled: s.stats.cardsPulled + cards.length,
            hits: s.stats.hits + hits,
            bestPull: best,
            bestFoil: bestFoil ?? s.stats.bestFoil,
            godPacks,
            demigodPacks,
          },
        }
      })
      get().log('rip', `Opened ${setName}`, 0)
      get().bumpGoal('rip', packs)
      get().checkCompletions() // a new card may have just finished a set
      get().checkMilestones()  // packs/hits/god-pack/best-pull badges — instant feedback on a rip
    },

    // --- Master-set completion ---------------------------------------------------
    // Pay the FIRST-TIME completion bonus for any set you now own one-of-every-card in
    // and haven't been rewarded for yet. Idempotent and cheap; safe to call after any
    // card enters the collection. The reward records the set id permanently in
    // completedSets so it never pays twice (and selling later doesn't claw it back).
    checkCompletions() {
      const s = get()
      // Cards slotted into the binder still count toward set completion (they didn't leave
      // your ownership — just the sellable pool), so include them when checking.
      const ownedIds = ownedIdSet([...s.collection, ...(s.binder || [])])
      const newly = []
      for (const set_ of SETS) {
        if (s.completedSets.includes(set_.id)) continue
        if (setCompletion(set_, ownedIds).complete) newly.push(set_)
      }
      if (!newly.length) return
      set(st => ({ completedSets: [...st.completedSets, ...newly.map(x => x.id)] }))
      for (const set_ of newly) {
        const r = completionReward(set_)
        get().earn(r.cash)
        get().addNotoriety(r.noto)
        get().log('complete', `🏆 Completed the ${set_.name} set! Bonus +$${r.cash.toFixed(2)} & +${r.noto}★`, r.cash)
      }
    },

    // --- Masterset binder --------------------------------------------------------
    // The binder physically holds ONE copy per {set, card, variant} slot, moved OUT of the
    // collection (so it's safe from every bulk action) but still counted as owned. Placing a
    // card is deliberate curation; a full masterset (every variant of every card) is the flex.

    // Move one collection card into its binder slot. No-op if that exact slot is already
    // filled (a masterset holds one of each variant — a duplicate stays sellable). Returns
    // true if it moved.
    addToBinder(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return false
      const setId = setIdOf(card)
      const variant = cardVariant(card)
      const filled = (get().binder || []).some(b => b.id === card.id && setIdOf(b) === setId && cardVariant(b) === variant)
      if (filled) return false
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        binder: [...(s.binder || []), card],
      }))
      get().log('binder', `📒 Slotted ${card.name} into your binder`, 0)
      return true
    },

    // Fill every EMPTY binder slot for a set from your collection in one go — "add everything
    // possible." Picks one copy per open slot (best copy first). Pass no setId to sweep all
    // sets. Returns the number of cards moved. `skipGraded` leaves slabs alone — the Binder
    // Curator's nightly sweep uses it so a freshly returned PSA slab (always the "best copy")
    // isn't whisked out of the sellable pool the same night it comes back from grading.
    //
    // BINDER RESERVE: a masterset is where DUPLICATE / display copies live — the genuinely
    // sharp copies are worth more graded and sold than buried in a slot. So `settings.binderReserveCut`
    // is a CEILING: a RAW copy whose cut is at/above it is reserved (held out, free to grade
    // & sell), and only lesser copies get filed. If a slot's ONLY copy is reserved, the slot
    // stays empty — never bury a grade-worthy card. Applies to BOTH the nightly Curator sweep
    // and the manual "fill every slot" button (it's a statement about what your binder is, not
    // which button you pressed). Slabs are exempt. Unset ('off') = file everything.
    addAllToBinder(setId = null, { skipGraded = false, skipLocked = false } = {}) {
      const sets = setId ? [setById(setId)].filter(Boolean) : SETS
      if (!sets.length) return 0
      const reserveCut = (get().settings || {}).binderReserveCut || 'off'
      const binder = get().binder || []
      const placed = new Set(binder.map(b => `${setIdOf(b)}:${b.id}:${cardVariant(b)}`))
      const chosen = new Map()   // slotKey → the copy we'll file (best FILEABLE copy wins)
      const reservedSlots = new Set() // open slots we own only reserved copies for
      // best copy first so the nicest FILEABLE copy lands in the binder
      const coll = [...get().collection].sort((a, b) => cardValue(b) - cardValue(a))
      for (const c of coll) {
        if (c._heldFor) continue // promised to a regular — the hold keeps its word
        if (skipLocked && c.locked) continue // 🔒 Personal — the overnight Curator leaves it alone
        if (skipGraded && c.grade) continue // slabs are placed by hand
        const cSet = setIdOf(c)
        const set_ = sets.find(s => s.id === cSet)
        if (!set_) continue
        // the card must actually be part of this set's masterset (it always is, but guard)
        const cardDef = set_.cards.find(x => x.id === c.id)
        if (!cardDef) continue
        const variant = cardVariant(c)
        if (!cardMastersetVariants(set_, cardDef).includes(variant)) continue
        const slotKey = `${cSet}:${c.id}:${variant}`
        if (placed.has(slotKey) || chosen.has(slotKey)) continue
        // Slot is open and unfilled. A fileable copy claims it; a reserved copy is noted but
        // left out (a lesser copy seen later can still claim the slot, clearing the note).
        if (fileableInBinder(c, reserveCut)) { chosen.set(slotKey, c); reservedSlots.delete(slotKey) }
        else reservedSlots.add(slotKey)
      }
      const reserved = reservedSlots.size
      if (!chosen.size) return { moved: 0, reserved }
      const movingUids = new Set([...chosen.values()].map(c => c.uid))
      const moving = get().collection.filter(c => movingUids.has(c.uid))
      set(s => ({
        collection: s.collection.filter(c => !movingUids.has(c.uid)),
        binder: [...(s.binder || []), ...moving],
      }))
      const label = setId ? `for ${setById(setId)?.name || 'the set'}` : 'across your collection'
      const note = reserved ? ` · ${reserved} ${reserved === 1 ? 'slot' : 'slots'} left open (reserved for grading)` : ''
      get().log('binder', `📒 Filled ${moving.length} binder slot${moving.length > 1 ? 's' : ''} ${label}${note}`, 0)
      return { moved: moving.length, reserved }
    },

    // Take a card back out of the binder, into your collection (to sell or reslot).
    removeFromBinder(uid) {
      const card = (get().binder || []).find(c => c.uid === uid)
      if (!card) return false
      set(s => ({
        binder: s.binder.filter(c => c.uid !== uid),
        collection: [card, ...s.collection],
      }))
      get().log('binder', `Took ${card.name} out of your binder`, 0)
      return true
    },

    // --- Card protection (master-set safety net) --------------------------------
    // Toggle a hard "keep this" lock on one card — locked cards are never touched by
    // any BULK action (sell/buylist/consign/list/stock). Single-card actions from the
    // card modal still work, so a lock is a bulk-sweep guard, not a total freeze.
    toggleLock(uid) {
      let nowLocked = false
      set(s => ({ collection: s.collection.map(c => {
        if (c.uid !== uid) return c
        nowLocked = !c.locked; return { ...c, locked: nowLocked }
      }) }))
      const card = get().collection.find(c => c.uid === uid)
      if (card) get().log('lock', `${nowLocked ? '🔒 Locked' : '🔓 Unlocked'} ${card.name}`, 0)
      return nowLocked
    },
    // Lock/unlock many at once (Collection select-mode). val=true locks, false unlocks.
    lockMany(uids, val = true) {
      const ids = new Set(uids)
      let n = 0
      set(s => ({ collection: s.collection.map(c => {
        if (!ids.has(c.uid) || !!c.locked === !!val) return c
        n++; return { ...c, locked: !!val }
      }) }))
      return n
    },

    // Quick sell (TCGplayer-style): instant cash, but well below market — you pay a steep
    // premium for the convenience. Liquidating your collection to make rent is a real loss,
    // not a soft cushion. Listing on your own site (below) can match or beat market.
    quickSellRate: 0.50,
    // Effective quick-sell rate right now, after today's dump penalty (for UI + logic).
    quickSellRateNow() { return dumpRate(get().quickSellRate, get().quickSellsToday || 0) },
    quickSell(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return
      const prior = get().quickSellsToday || 0
      const rate = dumpRate(get().quickSellRate, prior)
      const market = cardValue(card)
      const v = round2(market * rate)
      set(s => ({ collection: s.collection.filter(c => c.uid !== uid), quickSellsToday: prior + 1 }))
      get().earn(v)
      const flooded = prior >= 3 ? ' (buylist flooded today)' : ''
      get().log('sell', `Quick-sold ${card.grade ? 'PSA '+card.grade.overall+' ' : ''}${card.name} @ ${Math.round(rate*100)}%${flooded}`, v)
      // Dumping something genuinely valuable cheap dents your rep with collectors.
      if (market >= DUMP_DING_VALUE) {
        get().addNotoriety(-1)
        get().log('rep', `Word got around you fire-sold a ${card.name} — collectors frowned (−1★). List valuable cards instead.`, 0)
      }
      get().bumpGoal('sell', 1); get().bumpGoal('profit', v)
    },

    sellAllUngraded() {
      const { collection, quickSellRate } = get()
      // Bulk = raw, unfoiled, below the hit threshold (by live rarity, not the stale
      // _isHit flag) — so a MEGA_ATTACK / SIR / foil acquired without that flag is safe.
      // Then filter through the protection net (locks + keep-one) so a sweep never eats
      // a card you're keeping for a set.
      const candidates = collection.filter(isBulkCard).map(c => c.uid)
      const { sell, kept } = bulkSellableUids(collection, candidates, { keepOne: get().settings?.keepOne })
      const sellSet = new Set(sell)
      const toSell = collection.filter(c => sellSet.has(c.uid))
      // Progressive dump penalty across the batch: the deeper you dump in one go, the more
      // it floods the buylist and the less each additional card fetches.
      const prior = get().quickSellsToday || 0
      const total = round2(toSell.reduce((a, c, i) => a + cardValue(c) * dumpRate(quickSellRate, prior + i), 0))
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        quickSellsToday: prior + toSell.length,
        lastBulkSale: { cards: toSell, total, noto: 0, qsDelta: toSell.length, ts: Date.now() },
      }))
      get().earn(total)
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      const avgPct = toSell.length ? Math.round((total / toSell.reduce((a, c) => a + cardValue(c), 0)) * 100) : Math.round(quickSellRate*100)
      get().log('sell', `Quick-sold ${toSell.length} raw commons/uncommons @ ~${avgPct}%${keptNote}`, total)
      return { got: total, sold: toSell.length, kept: kept.length }
    },

    // Buylist: instantly dump ALL raw bulk (commons/uncommons/rares, no hits/graded)
    // to a shop at a flat buylist rate — fast cash, but a punishing cut under market.
    buylistRate: 0.45,
    sellToBuylist() {
      const { collection, buylistRate } = get()
      const candidates = collection.filter(isBulkCard).map(c => c.uid)
      const { sell, kept } = bulkSellableUids(collection, candidates, { keepOne: get().settings?.keepOne })
      if (!sell.length) return 0
      const sellSet = new Set(sell)
      const toSell = collection.filter(c => sellSet.has(c.uid))
      const total = round2(toSell.reduce((a, c) => a + cardValue(c) * buylistRate, 0))
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        lastBulkSale: { cards: toSell, total, noto: 0, qsDelta: 0, ts: Date.now() },
      }))
      get().earn(total)
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      get().log('sell', `Buylisted ${toSell.length} bulk cards @ ${Math.round(buylistRate*100)}%${keptNote}`, total)
      return total
    },

    // ↩︎ Undo the most recent bulk sale (surfaced as an Undo button on the sale toast).
    // Atomic reversal: the exact cards come back, and the cash / stats.earned / income-
    // accrual / dump-counter / rep-ding bookkeeping all reverse. Guarded by a freshness
    // window so a stale snapshot can't be replayed long after prices have moved.
    undoBulkSale() {
      const u = get().lastBulkSale
      if (!u || !u.cards?.length) return false
      if (Date.now() - u.ts > 15000) return false // undo window is the toast, ~5-6s
      if (get().cash < u.total) return false      // already spent the money — can't unwind
      set(s => ({
        collection: [...u.cards, ...s.collection],
        cash: round2(s.cash - u.total),
        stats: { ...s.stats, earned: round2(s.stats.earned - u.total) },
        _cardAccrual: round2((s._cardAccrual || 0) - u.total),
        quickSellsToday: Math.max(0, (s.quickSellsToday || 0) - (u.qsDelta || 0)),
        lastBulkSale: null,
      }))
      if (u.noto) get().addNotoriety(u.noto) // refund the fire-sale rep ding
      get().log('undo', `↩︎ Undid the bulk sale — ${u.cards.length} card${u.cards.length > 1 ? 's' : ''} back, $${u.total.toFixed(2)} returned`, -u.total)
      return true
    },

    // Consign a card: a service lists it; it sells in 2–6 game-days slightly above market
    // (1.05–1.20×), minus a 12% consignment fee — so you net ~0.92–1.06× market (roughly AT
    // market). Removes from collection now, pays later.
    consignCard(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return false
      const sellsFor = round2(cardValue(card) * (1.02 + Math.random() * 0.13)) // 1.02–1.15× market
      const net = round2(sellsFor * 0.82) // 18% consignment fee → nets ~0.84–0.94× market
      const daysLeft = 2 + Math.floor(Math.random() * 5) // 2–6 days
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        consignments: [...s.consignments, { card, net, daysLeft }],
      }))
      get().log('consign', `Consigned ${card.name} — nets ${'$'+net.toFixed(2)} in ~${daysLeft}d`, 0)
      return { net, daysLeft }
    },

    // --- Bulk actions on a selected set of cards (Collection multi-select) -------
    // Quick-sell every selected card at the quick-sell rate, in one go.
    quickSellMany(uids) {
      const { sell, kept } = bulkSellableUids(get().collection, uids, { keepOne: get().settings?.keepOne })
      const sellSet = new Set(sell)
      const toSell = get().collection.filter(c => sellSet.has(c.uid))
      if (!toSell.length) return { got: 0, sold: 0, kept: kept.length }
      const base = get().quickSellRate
      const prior = get().quickSellsToday || 0
      // Progressive dump penalty (see dumpRate) + count how many valuable cards got dumped.
      let total = 0, valuable = 0
      toSell.forEach((c, i) => {
        const mkt = cardValue(c)
        total += mkt * dumpRate(base, prior + i)
        if (mkt >= DUMP_DING_VALUE) valuable++
      })
      total = round2(total)
      const ding = valuable ? Math.min(3, valuable) : 0
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        quickSellsToday: prior + toSell.length,
        lastBulkSale: { cards: toSell, total, noto: ding, qsDelta: toSell.length, ts: Date.now() },
      }))
      get().earn(total)
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      const avgPct = Math.round((total / toSell.reduce((a, c) => a + cardValue(c), 0)) * 100)
      get().log('sell', `Quick-sold ${toSell.length} cards @ ~${avgPct}%${keptNote}`, total)
      // Fire-selling valuable cards in bulk dents your rep (capped so a big dump can't tank it).
      if (ding) {
        get().addNotoriety(-ding)
        get().log('rep', `You dumped ${valuable} valuable card${valuable>1?'s':''} to the buylist — collectors noticed (−${ding}★).`, 0)
      }
      get().bumpGoal('sell', toSell.length); get().bumpGoal('profit', total)
      return { got: total, sold: toSell.length, kept: kept.length }
    },
    // Consign every selected card (each sells in 2–6 days for a bit above market −12%).
    consignMany(uids) {
      const { sell, kept } = bulkSellableUids(get().collection, uids, { keepOne: get().settings?.keepOne })
      const sellSet = new Set(sell)
      const cards = get().collection.filter(c => sellSet.has(c.uid))
      if (!cards.length) return { sold: 0, kept: kept.length }
      const newConsigns = cards.map(card => {
        const sellsFor = round2(cardValue(card) * (1.02 + Math.random() * 0.13))
        return { card, net: round2(sellsFor * 0.82), daysLeft: 2 + Math.floor(Math.random() * 5) }
      })
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        consignments: [...s.consignments, ...newConsigns],
      }))
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      get().log('consign', `Consigned ${cards.length} cards${keptNote}`, 0)
      return { sold: cards.length, kept: kept.length }
    },

    // --- Grading -----------------------------------------------------------------
    submitGrade(uid, tierKey) {
      const tier = GRADING[tierKey]
      if (!tier) return
      const card = get().collection.find(c => c.uid === uid)
      if (!card || card.grade) return
      const before = graderTier(get().gradesSubmitted)
      const fee = gradingFee(tierKey, get().gradesSubmitted)
      if (!get().spend(fee)) return
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        gradesSubmitted: s.gradesSubmitted + 1,
      }))
      // Use the month-safe ABSOLUTE day: currentDay wraps to 1 each calendar month, so a
      // raw `currentDay + tier.days` (e.g. economy's 45) could exceed the wrap and never
      // be reached — stranding the card + fee forever. absoluteDay never wraps.
      const submittedAt = absoluteDay(get().currentDay, get().monthsElapsed)
      const readyOnDay = submittedAt + tier.days
      // remember the fee actually paid so the resolved grade records it, not list price.
      set(s => ({ pendingGrades: [...s.pendingGrades, { card, tierKey, readyOnDay, submittedAt, paidFee: fee }] }))
      const disc = before.discount > 0 ? ` (${Math.round(before.discount*100)}% loyalty off)` : ''
      get().log('grade-submit', `Submitted ${card.name} (${tier.name}, $${fee.toFixed(2)}${disc})`, -fee)
      // crossed into a new loyalty tier?
      const after = graderTier(get().gradesSubmitted)
      if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
      get().bumpGoal('grade', 1)
    },

    // Submit several raw cards at once for a bulk per-card discount (stacks with
    // loyalty). Charges the total up front; each card resolves on its own timer.
    submitGradesBulk(uids, tierKey) {
      const tier = GRADING[tierKey]
      if (!tier || !uids?.length) return
      const cards = get().collection.filter(c => uids.includes(c.uid) && !c.grade)
      if (!cards.length) return
      const before = graderTier(get().gradesSubmitted)
      const feePer = gradingFee(tierKey, get().gradesSubmitted, cards.length)
      const total = round2(feePer * cards.length)
      if (!get().spend(total)) return
      const uidSet = new Set(cards.map(c => c.uid))
      // month-safe absolute day (see submitGrade) so a late-month bulk submit still resolves.
      const submittedAt = absoluteDay(get().currentDay, get().monthsElapsed)
      const readyOnDay = submittedAt + tier.days
      set(s => ({
        collection: s.collection.filter(c => !uidSet.has(c.uid)),
        gradesSubmitted: s.gradesSubmitted + cards.length,
        pendingGrades: [...s.pendingGrades, ...cards.map(card => ({ card, tierKey, readyOnDay, submittedAt, paidFee: feePer }))],
      }))
      const bulk = bulkDiscount(cards.length)
      const notes = [before.discount > 0 ? `${Math.round(before.discount*100)}% loyalty` : null,
        bulk > 0 ? `${Math.round(bulk*100)}% bulk` : null].filter(Boolean).join(' + ')
      get().log('grade-submit', `Bulk-submitted ${cards.length} cards (${tier.name}, $${feePer.toFixed(2)}/ea${notes ? `, ${notes} off` : ''})`, -total)
      const after = graderTier(get().gradesSubmitted)
      if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
      get().bumpGoal('grade', cards.length)
    },

    // Resolve grades whose day count has been reached.
    resolveGrades() {
      // Compare against the same month-safe absolute day grades are stamped with (see submitGrade).
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const ready = get().pendingGrades.filter(p => day >= p.readyOnDay)
      if (!ready.length) return []
      const loupeLuck = get().upgrades.loupe ? 0.08 : 0
      const resolved = ready.map(p => {
        // A pricier grading tier grades a touch kinder (see GRADING[].luck), stacking with the loupe.
        const luck = loupeLuck + (GRADING[p.tierKey]?.luck || 0)
        const grade = rollGrade(p.card, p.tierKey, luck, p.paidFee ?? null)
        // Append to a per-card grading history so the modal can show "this card was
        // graded PSA X (Standard, $Y) on day Z". (One entry today, but the array is
        // future-proof for a crack-a-slab regrade mechanic.)
        const entry = { overall: grade.overall, tier: p.tierKey, fee: grade.fee, gradedAt: grade.gradedAt }
        const gradeHistory = [...(p.card.gradeHistory || []), entry]
        return { ...p.card, grade, gradeHistory }
      })
      set(s => ({
        pendingGrades: s.pendingGrades.filter(p => day < p.readyOnDay),
        collection: [...resolved, ...s.collection],
      }))
      for (const g of resolved) get().log('grade-done', `${g.name} graded PSA ${g.grade.overall}`, 0)
      get().checkCompletions() // a returned slab may complete a set
      return resolved
    },
  }
}
