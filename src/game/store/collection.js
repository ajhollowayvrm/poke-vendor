// Collection slice — cards you own and how they leave the collection for cash.
//
// createCollectionSlice(set, get) returns: addPulls (rip → collection + stats/ledger),
// master-set completion, the quick-sell / buylist / consign exits (single + bulk), and the
// full grading lifecycle (submit, bulk-submit, resolve). Listing on your own site lives in
// the SELLING slice; buying sealed lives in SOURCING.

import {
  cardValue, isBulkCard, round2, GRADING, gradingFee, graderTier, bulkDiscount,
  rollGrade, ownedIdSet, SETS, setCompletion, completionReward,
} from '../engine'
import { setIdOf, bumpSet } from './helpers'
import { absoluteDay } from './constants'

export function createCollectionSlice(set, get) {
  return {
    addPulls(cards, setName, packs = 1) {
      set(s => {
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
          collection: [...cards, ...s.collection],
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
    },

    // --- Master-set completion ---------------------------------------------------
    // Pay the FIRST-TIME completion bonus for any set you now own one-of-every-card in
    // and haven't been rewarded for yet. Idempotent and cheap; safe to call after any
    // card enters the collection. The reward records the set id permanently in
    // completedSets so it never pays twice (and selling later doesn't claw it back).
    checkCompletions() {
      const s = get()
      const ownedIds = ownedIdSet(s.collection)
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

    // Quick sell (TCGplayer-style): instant cash, but well below market — you pay a steep
    // premium for the convenience. Liquidating your collection to make rent is a real loss,
    // not a soft cushion. Listing on your own site (below) can match or beat market.
    quickSellRate: 0.50,
    quickSell(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return
      const v = round2(cardValue(card) * get().quickSellRate)
      set(s => ({ collection: s.collection.filter(c => c.uid !== uid) }))
      get().earn(v)
      get().log('sell', `Quick-sold ${card.grade ? 'PSA '+card.grade.overall+' ' : ''}${card.name} @ ${Math.round(get().quickSellRate*100)}%`, v)
      get().bumpGoal('sell', 1); get().bumpGoal('profit', v)
    },

    sellAllUngraded() {
      const { collection, quickSellRate } = get()
      // Bulk = raw, unfoiled, below the hit threshold (by live rarity, not the stale
      // _isHit flag) — so a MEGA_ATTACK / SIR / foil acquired without that flag is safe.
      const toSell = collection.filter(isBulkCard)
      const total = round2(toSell.reduce((a, c) => a + cardValue(c) * quickSellRate, 0))
      set(s => ({ collection: s.collection.filter(c => !isBulkCard(c)) }))
      get().earn(total)
      get().log('sell', `Quick-sold ${toSell.length} raw commons/uncommons @ ${Math.round(quickSellRate*100)}%`, total)
    },

    // Buylist: instantly dump ALL raw bulk (commons/uncommons/rares, no hits/graded)
    // to a shop at a flat buylist rate — fast cash, but a punishing cut under market.
    buylistRate: 0.45,
    sellToBuylist() {
      const { collection, buylistRate } = get()
      const toSell = collection.filter(isBulkCard)
      if (!toSell.length) return 0
      const total = round2(toSell.reduce((a, c) => a + cardValue(c) * buylistRate, 0))
      set(s => ({ collection: s.collection.filter(c => !isBulkCard(c)) }))
      get().earn(total)
      get().log('sell', `Buylisted ${toSell.length} bulk cards @ ${Math.round(buylistRate*100)}%`, total)
      return total
    },

    // Consign a card: a service lists it; it sells in 2–6 game-days slightly above market
    // (1.05–1.20×), minus a 12% consignment fee — so you net ~0.92–1.06× market (roughly AT
    // market). Removes from collection now, pays later.
    consignCard(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return false
      const sellsFor = round2(cardValue(card) * (1.05 + Math.random() * 0.15)) // 1.05–1.20× market
      const net = round2(sellsFor * 0.88) // 12% consignment fee
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
      const ids = new Set(uids)
      const toSell = get().collection.filter(c => ids.has(c.uid))
      if (!toSell.length) return 0
      const rate = get().quickSellRate
      const total = round2(toSell.reduce((a, c) => a + cardValue(c) * rate, 0))
      set(s => ({ collection: s.collection.filter(c => !ids.has(c.uid)) }))
      get().earn(total)
      get().log('sell', `Quick-sold ${toSell.length} cards @ ${Math.round(rate*100)}%`, total)
      get().bumpGoal('sell', toSell.length); get().bumpGoal('profit', total)
      return total
    },
    // Consign every selected card (each sells in 2–6 days for a bit above market −12%).
    consignMany(uids) {
      const ids = new Set(uids)
      const cards = get().collection.filter(c => ids.has(c.uid))
      if (!cards.length) return 0
      const newConsigns = cards.map(card => {
        const sellsFor = round2(cardValue(card) * (1.05 + Math.random() * 0.15))
        return { card, net: round2(sellsFor * 0.88), daysLeft: 2 + Math.floor(Math.random() * 5) }
      })
      set(s => ({
        collection: s.collection.filter(c => !ids.has(c.uid)),
        consignments: [...s.consignments, ...newConsigns],
      }))
      get().log('consign', `Consigned ${cards.length} cards`, 0)
      return cards.length
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
      const luck = get().upgrades.loupe ? 0.08 : 0
      const resolved = ready.map(p => {
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
