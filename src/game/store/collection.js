// Collection slice — cards you own and how they leave the collection for cash.
//
// createCollectionSlice(set, get) returns: addPulls (rip → collection + stats/ledger),
// master-set completion, the quick-sell / bulk-turn-in / consign exits (single + bulk), and the
// full grading lifecycle (submit, bulk-submit, resolve). Listing on your own site lives in
// the SELLING slice; buying sealed lives in SOURCING.

import {
  cardValue, rawValue, isBulkCard, round2, GRADING, gradingFee, gradingShipping, gradeUpcharge, graderTier, bulkDiscount,
  rollGrade, graderById, gradingDays, isBlackLabel, DEFAULT_GRADER, ownedIdSet, SETS, setCompletion, completionReward, bulkSellableUids,
  setById, cardVariant, cardMastersetVariants, fileableInBinder, BULK_CREDIT_PER_CARD, fmtMoney,
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

// 🚚 Grader Dealer Account: submissions ride the courier — turnaround cut ~40% on every
// tier (Economy 45→27, Standard 20→12, Express 5→3). Fees and odds untouched: the sim's
// grading-EV ladder must never move because of this — it's capital velocity only.
function gradeTurnaround(tier, upgrades) {
  return upgrades?.graderAccount ? Math.max(1, Math.ceil(tier.days * 0.6)) : tier.days
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
      // Paid in ONE state write, not three per set. Every set() re-serializes the whole game,
      // so on a large save this loop was the single most expensive thing in the app: completing
      // a batch of sets fired hundreds of writes and measured **11.6 seconds** for one rip at
      // 20,000 cards — long enough for iOS to kill the tab mid-animation. The rewards are
      // identical; they just land together.
      const rewards = newly.map(set_ => ({ set: set_, r: completionReward(set_) }))
      const cash = round2(rewards.reduce((a, x) => a + x.r.cash, 0))
      const noto = rewards.reduce((a, x) => a + x.r.noto, 0)
      set(st => ({
        completedSets: [...st.completedSets, ...newly.map(x => x.id)],
        cash: round2(st.cash + cash),
        notoriety: (st.notoriety || 0) + noto,
        stats: { ...st.stats, earned: round2((st.stats?.earned || 0) + cash) },
        history: [
          ...rewards.map(({ set: s_, r }) => ({ t: Date.now(), type: 'complete', amount: r.cash,
            detail: `🏆 Completed the ${s_.name} set! Bonus +$${r.cash.toFixed(2)} & +${r.noto}★` })),
          ...st.history,
        ].slice(0, 200),
      }))
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

    // Turn in ALL raw bulk (every raw card worth under a dollar — no graded slabs) at the Local
    // Game Store for IN-STORE CREDIT at a flat nickel a card. This is the realistic bulk exit:
    // sub-dollar cards aren't worth cash, they're worth a little credit toward your next order.
    // The credit (lgsCredit) is an asset, spent automatically the next time you buy from the LGS.
    //
    // Bulk is defined by LIVE market WORTH (see isBulkCard — under $1, not by rarity), then
    // filtered through the protection net (locks + keep-one) so a sweep never eats a card you're
    // keeping for a set. Replaces the old cash buylist / sell-raw exits (retired — never worth cash).
    turnInBulk() {
      const { collection } = get()
      const candidates = collection.filter(isBulkCard).map(c => c.uid)
      const { sell, kept } = bulkSellableUids(collection, candidates, { keepOne: get().settings?.keepOne })
      if (!sell.length) return { credit: 0, sold: 0, kept: kept.length }
      const sellSet = new Set(sell)
      const toSell = collection.filter(c => sellSet.has(c.uid))
      const credit = round2(toSell.length * BULK_CREDIT_PER_CARD)
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        lgsCredit: round2((s.lgsCredit || 0) + credit),
        // Credit-mode bulk sale — undo restores the cards and claws the credit back (see undoBulkSale).
        lastBulkSale: { cards: toSell, credit, mode: 'credit', noto: 0, qsDelta: 0, ts: Date.now() },
      }))
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      get().log('sell', `📦 Turned in ${toSell.length} bulk cards at the Local Game Store — +${fmtMoney(credit)} store credit (5¢/card)${keptNote}`, 0)
      get().bumpGoal('sell', toSell.length)
      return { credit, sold: toSell.length, kept: kept.length }
    },

    // ↩︎ Undo the most recent bulk sale (surfaced as an Undo button on the sale toast).
    // Atomic reversal: the exact cards come back, and the cash / stats.earned / income-
    // accrual / dump-counter / rep-ding bookkeeping all reverse. Guarded by a freshness
    // window so a stale snapshot can't be replayed long after prices have moved.
    undoBulkSale() {
      const u = get().lastBulkSale
      if (!u || !u.cards?.length) return false
      if (Date.now() - u.ts > 15000) return false // undo window is the toast, ~5-6s
      // Credit-mode (bulk turn-in): claw the store credit back instead of cash. Blocked if you've
      // already spent that credit down below what the undo would remove.
      if (u.mode === 'credit') {
        if ((get().lgsCredit || 0) < u.credit) return false
        set(s => ({
          collection: [...u.cards, ...s.collection],
          lgsCredit: round2((s.lgsCredit || 0) - u.credit),
          lastBulkSale: null,
        }))
        get().log('undo', `↩︎ Undid the bulk turn-in — ${u.cards.length} card${u.cards.length > 1 ? 's' : ''} back, $${u.credit.toFixed(2)} credit reversed`, 0)
        return true
      }
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
    // `company` picks WHICH grader (GRADERS in engine.js) — it changes the fee, the
    // turnaround and what the returned slab is worth, never the grade roll itself.
    submitGrade(uid, tierKey, company = DEFAULT_GRADER) {
      const tier = GRADING[tierKey]
      if (!tier) return
      const card = get().collection.find(c => c.uid === uid)
      if (!card || card.grade) return
      const before = graderTier(get().gradesSubmitted)
      // One card pays the whole round trip — the reason batching exists.
      const ship = gradingShipping([card], get().upgrades)
      const fee = round2(gradingFee(tierKey, get().gradesSubmitted, 1, company, rawValue(card)) + ship)
      if (!get().spend(fee)) return
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        gradesSubmitted: s.gradesSubmitted + 1,
      }))
      // Use the month-safe ABSOLUTE day: currentDay wraps to 1 each calendar month, so a
      // raw `currentDay + tier.days` (e.g. economy's 45) could exceed the wrap and never
      // be reached — stranding the card + fee forever. absoluteDay never wraps.
      const submittedAt = absoluteDay(get().currentDay, get().monthsElapsed)
      const readyOnDay = submittedAt + gradeTurnaround({ ...tier, days: gradingDays(tierKey, company) }, get().upgrades)
      // remember the fee actually paid so the resolved grade records it, not list price.
      set(s => ({ pendingGrades: [...s.pendingGrades, { card, tierKey, company, readyOnDay, submittedAt, paidFee: fee }] }))
      const disc = before.discount > 0 ? ` (${Math.round(before.discount*100)}% loyalty off)` : ''
      get().log('grade-submit', `Submitted ${card.name} to ${graderById(company).name} (${tier.name}, $${fee.toFixed(2)}${disc})`, -fee)
      // crossed into a new loyalty tier?
      const after = graderTier(get().gradesSubmitted)
      if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
      get().bumpGoal('grade', 1)
    },

    // Submit several raw cards at once for a bulk per-card discount (stacks with
    // loyalty). Charges the total up front; each card resolves on its own timer.
    submitGradesBulk(uids, tierKey, company = DEFAULT_GRADER) {
      const tier = GRADING[tierKey]
      if (!tier || !uids?.length) return
      const cards = get().collection.filter(c => uids.includes(c.uid) && !c.grade)
      if (!cards.length) return
      const before = graderTier(get().gradesSubmitted)
      // Per-card fees now, not one sticker × N: declared-value pricing means a batch holding a
      // $3,000 chase and forty commons costs different amounts per card. Each pending grade
      // records the fee ACTUALLY paid for that card, so the resolved slab reports it honestly.
      const fees = cards.map(c => gradingFee(tierKey, get().gradesSubmitted, cards.length, company, rawValue(c)))
      // Freight is per SUBMISSION, so a batch pays it once — spread across every card here so
      // each pending grade still records what that card actually cost.
      const ship = gradingShipping(cards, get().upgrades)
      const shipEach = round2(ship / cards.length)
      const total = round2(fees.reduce((a, f) => a + f, 0) + ship)
      if (!get().spend(total)) return
      const uidSet = new Set(cards.map(c => c.uid))
      // month-safe absolute day (see submitGrade) so a late-month bulk submit still resolves.
      const submittedAt = absoluteDay(get().currentDay, get().monthsElapsed)
      const readyOnDay = submittedAt + gradeTurnaround({ ...tier, days: gradingDays(tierKey, company) }, get().upgrades)
      set(s => ({
        collection: s.collection.filter(c => !uidSet.has(c.uid)),
        gradesSubmitted: s.gradesSubmitted + cards.length,
        pendingGrades: [...s.pendingGrades, ...cards.map((card, i) => ({ card, tierKey, company, readyOnDay, submittedAt, paidFee: round2(fees[i] + shipEach) }))],
      }))
      const bulk = bulkDiscount(cards.length)
      const notes = [before.discount > 0 ? `${Math.round(before.discount*100)}% loyalty` : null,
        bulk > 0 ? `${Math.round(bulk*100)}% bulk` : null].filter(Boolean).join(' + ')
      // Report the total, and only claim a flat per-card rate when the batch really was flat —
      // a mixed-value batch has no single "/ea" figure any more.
      const flat = fees.every(f => f === fees[0])
      const rate = `${flat ? `$${fees[0].toFixed(2)}/ea` : `$${total.toFixed(2)} total, by card value`} + $${ship.toFixed(2)} freight`
      get().log('grade-submit', `Bulk-submitted ${cards.length} cards to ${graderById(company).name} (${tier.name}, ${rate}${notes ? `, ${notes} off` : ''})`, -total)
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
      const resolved = [], stillHeld = [], invoices = []
      for (const p of ready) {
        // A grade already rolled (a slab the grader is holding over an unpaid balance) must
        // NEVER be re-rolled — otherwise going broke would be a free reroll on a bad grade.
        const grade = p.grade || rollGrade(p.card, p.tierKey,
          loupeLuck + (GRADING[p.tierKey]?.luck || 0), p.paidFee ?? null, p.company || DEFAULT_GRADER)
        const graded = { ...p.card, grade }
        // 💸 The return invoice: the grade is known now, so the card gets re-valued against
        // what the service level actually insured. A sleeper that gems into a five-figure slab
        // costs more than you agreed to when you posted it.
        const owed = gradeUpcharge(graded, p.paidFee, p.tierKey, get().gradesSubmitted, p.company)
        if (owed > 0 && !get().spend(owed)) {
          // Can't cover it — the grader keeps the slab until the balance is paid, exactly as a
          // real one would. The rolled grade travels with it so it isn't graded twice.
          stillHeld.push({ ...p, grade, owed })
          continue
        }
        if (owed > 0) invoices.push({ name: p.card.name, owed })
        const entry = { overall: grade.overall, tier: p.tierKey, company: grade.company, fee: round2((p.paidFee || 0) + owed), gradedAt: grade.gradedAt }
        resolved.push({ ...graded, gradeHistory: [...(p.card.gradeHistory || []), entry] })
      }
      set(s => ({
        pendingGrades: [...s.pendingGrades.filter(p => day < p.readyOnDay), ...stillHeld],
        collection: [...resolved, ...s.collection],
      }))
      for (const g of resolved) {
        const black = isBlackLabel(g.grade)
        get().log('grade-done', `${g.name} graded ${graderById(g.grade.company).name} ${g.grade.overall}${black ? ' ⬛ BLACK LABEL!' : ''}`, 0)
      }
      for (const inv of invoices) {
        get().log('grade-fee', `💸 Return invoice on ${inv.name} — it graded up past what your service level insured, so the grader billed the $${inv.owed.toFixed(2)} difference`, -inv.owed)
      }
      for (const h of stillHeld) {
        get().log('grade-hold', `⛔ ${h.card.name} graded ${h.grade.overall} but the grader is HOLDING it — $${h.owed.toFixed(2)} still owed on the return invoice. It ships when you can cover it.`, 0)
      }
      get().checkCompletions() // a returned slab may complete a set
      return resolved
    },
  }
}
