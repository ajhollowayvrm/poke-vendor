// Mystery-pack slice — your own repack product line.
//
// createPacksSlice(set, get) returns: tier CRUD (your product lines: price, advertised
// value band, sales channels), building/unbuilding packs (sealing exact cards + sealed
// product from your stock inside), and sellBuiltPack — the single resolution path every
// sales channel calls (day-tick online/store, show-floor + walk-in browsers, livestream).
// The pure math (demand odds, buyer-outcome classification) lives in ../mysterypacks.
//
// OWNERSHIP: building a pack MOVES cards out of `collection` and sealed out of
// `sealedInventory` into the pack (like the binder / show table — one bucket per uid).
// Unbuilding returns them. Selling ships the contents to the buyer — they leave the game.

import { round2, cardValue, setIdOfCard } from '../engine'
import { packValue, packBestItem, packOutcome, packBuyerName, cardFitsTier, tierContentsLabel,
  PACK_TIER_CAP, AUTO_BUILD_CAP, defaultPackTiers } from '../mysterypacks'
import { ONLINE_FEE_PCT, shippingCost, processingFee, absoluteDay, bumpHype } from './constants'

let packSuffix = 0
const nextPackUid = () => `mp${Date.now().toString(36)}${(packSuffix++).toString(36)}`

export function createPacksSlice(set, get) {
  return {
    // --- Tiers (your product lines) -----------------------------------------------
    // Add a new tier. Returns it, or null at the cap / on bad input.
    addPackTier({ name, icon, price, bandLo, bandHi, channels } = {}) {
      if ((get().packTiers || []).length >= PACK_TIER_CAP) return null
      const tier = sanitizeTier({ name, icon, price, bandLo, bandHi, channels })
      if (!tier) return null
      tier.id = `t${Date.now().toString(36)}${(packSuffix++).toString(36)}`
      set(s => ({ packTiers: [...(s.packTiers || []), tier] }))
      get().log('packs', `New mystery pack line: ${tier.icon} ${tier.name} — $${tier.price.toFixed(2)}, advertising $${tier.bandLo}–$${tier.bandHi} inside`, 0)
      return tier
    },
    // Edit a tier in place (price/band/channels/name). Built packs of it keep selling
    // under the new terms — reprice a line anytime.
    updatePackTier(id, patch) {
      const cur = (get().packTiers || []).find(t => t.id === id)
      if (!cur) return false
      const next = sanitizeTier({ ...cur, ...patch })
      if (!next) return false
      set(s => ({ packTiers: s.packTiers.map(t => t.id === id ? { ...next, id } : t) }))
      return true
    },
    // Delete a product line — only when no built packs of it remain (unbuild them first).
    deletePackTier(id) {
      if ((get().builtPacks || []).some(p => p.tierId === id)) return false
      set(s => ({ packTiers: (s.packTiers || []).filter(t => t.id !== id) }))
      return true
    },

    // --- Building ------------------------------------------------------------------
    // Seal the given cards + sealed product into ONE pack of `tierId`. You pick EXACTLY
    // what goes in — the game doesn't enforce your advertised band (your reputation does).
    // Returns the pack, or null if the tier is gone / nothing was picked.
    buildPack(tierId, cardUids = [], sealedUids = []) {
      const tier = (get().packTiers || []).find(t => t.id === tierId)
      if (!tier) return null
      const cardIds = new Set(cardUids)
      const sealIds = new Set(sealedUids)
      const cards = get().collection.filter(c => cardIds.has(c.uid))
      const sealed = (get().sealedInventory || []).filter(it => sealIds.has(it.uid))
      if (!cards.length && !sealed.length) return null
      const pack = { uid: nextPackUid(), tierId, cards, sealed, builtDay: absoluteDay(get().currentDay, get().monthsElapsed) }
      set(s => ({
        collection: s.collection.filter(c => !cardIds.has(c.uid)),
        sealedInventory: (s.sealedInventory || []).filter(it => !sealIds.has(it.uid)),
        builtPacks: [pack, ...(s.builtPacks || [])],
        packStats: { ...s.packStats, built: (s.packStats?.built || 0) + 1 },
      }))
      const v = packValue(pack)
      get().log('packs', `Sealed a ${tier.icon} ${tier.name} — ${cards.length} card${cards.length === 1 ? '' : 's'}${sealed.length ? ` + ${sealed.length} sealed` : ''} inside (~$${v.toFixed(2)} of stuff, sells at $${tier.price.toFixed(2)})`, 0)
      return pack
    },
    // Every loose card that fits a tier RIGHT NOW: the right kind (its contents rule — raw /
    // slabs / PSA 10 only) at the right price (inside the advertised band). Cheapest first, so
    // a capped Auto-build clears the bulk you're trying to get rid of rather than your grails.
    // Only `collection` is eligible — cards in the binder, on the shop shelf, at the grader or
    // on a show table are spoken for, and silently sealing those away would be a nasty surprise.
    eligibleForTier(tierId) {
      const tier = (get().packTiers || []).find(t => t.id === tierId)
      if (!tier) return []
      return get().collection
        .filter(c => cardFitsTier(c, tier))
        .sort((a, b) => cardValue(a) - cardValue(b))
    },

    // 🪄 AUTO-BUILD: seal ONE pack per eligible card, in one go. Set a line to $1–$10 and this
    // turns all 20 qualifying cards into 20 sealed packs — the whole point being that hand-
    // picking twenty packs one modal at a time is nobody's idea of a good evening.
    //
    // Sealed product is never swept up: it has no grade and no obvious 1-per-pack reading, so
    // it stays a deliberate choice in the manual builder.
    //
    // Returns { built, value, skipped } — `skipped` is how many eligible cards the cap left
    // behind, so the UI can say "100 sealed, 43 still eligible" instead of quietly truncating.
    autoBuildPacks(tierId) {
      const tier = (get().packTiers || []).find(t => t.id === tierId)
      if (!tier) return null
      const all = get().eligibleForTier(tierId)
      if (!all.length) return { built: 0, value: 0, skipped: 0 }
      const take = all.slice(0, AUTO_BUILD_CAP)
      const skipped = all.length - take.length
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const uids = new Set(take.map(c => c.uid))
      const packs = take.map(c => ({ uid: nextPackUid(), tierId, cards: [c], sealed: [], builtDay: day }))
      const value = round2(take.reduce((a, c) => a + cardValue(c), 0))
      // One transaction: the cards leave the collection and land in packs together, so a
      // 100-pack sweep can't half-apply and duplicate a card into both places.
      set(s => ({
        collection: s.collection.filter(c => !uids.has(c.uid)),
        builtPacks: [...packs, ...(s.builtPacks || [])],
        packStats: { ...s.packStats, built: (s.packStats?.built || 0) + packs.length },
      }))
      get().log('packs', `🪄 Auto-built ${packs.length}× ${tier.icon} ${tier.name} — one card each, ${tierContentsLabel(tier)}, $${tier.bandLo}–$${tier.bandHi} (~$${value.toFixed(2)} of stock sealed away)`, 0)
      return { built: packs.length, value, skipped }
    },

    // Tear a built pack back open — contents return to your collection / inventory.
    unbuildPack(uid) {
      const pack = (get().builtPacks || []).find(p => p.uid === uid)
      if (!pack) return false
      set(s => ({
        builtPacks: s.builtPacks.filter(p => p.uid !== uid),
        collection: [...(pack.cards || []), ...s.collection],
        sealedInventory: [...(pack.sealed || []), ...(s.sealedInventory || [])],
      }))
      get().log('packs', `Tore a mystery pack back open — contents returned to your stock`, 0)
      return true
    },

    // Built packs sellable on `channel` ('show' | 'store' | 'online' | 'stream'),
    // oldest first (FIFO — the pack you sealed first is the one on top of the stack).
    packsForChannel(channel) {
      const tiers = get().packTiers || []
      return [...(get().builtPacks || [])]
        .filter(p => tiers.find(t => t.id === p.tierId)?.channels?.[channel])
        .sort((a, b) => (a.builtDay || 0) - (b.builtDay || 0))
    },

    // --- The sale ------------------------------------------------------------------
    // A buyer takes a built pack at the tier price and OPENS IT. One path for every
    // channel: bank the net, ship the contents (they leave the game), and let what was
    // inside move your pack reputation + notoriety. Stream sales swing harder — everyone
    // watched it happen. Returns { net, gross, value, outcome, tier, pack, best } or null.
    //   opts: { channel: 'online'|'walkin'|'show'|'stream', payMethod?, buyer? }
    sellBuiltPack(uid, { channel = 'online', payMethod = null, buyer = null } = {}) {
      const pack = (get().builtPacks || []).find(p => p.uid === uid)
      if (!pack) return null
      const tier = (get().packTiers || []).find(t => t.id === pack.tierId)
      if (!tier) return null
      const gross = round2(tier.price)
      // Online pays the marketplace fee + shipping (same drag as a listing); in-person and
      // stream sales keep the whole ticket (minus any card-rail processing fee).
      let net = gross
      if (channel === 'online') net = round2(gross - round2(gross * ONLINE_FEE_PCT) - shippingCost(gross, get().upgrades))
      if (payMethod) net = processingFee(net, payMethod).net
      const value = packValue(pack)
      const who = buyer || packBuyerName(channel)
      // 📋 A published board changes how the opening lands: honest thin packs are forgiven,
      // but a pack that breaks a posted floor burns hotter. Certified boards cushion further.
      const published = !!tier.published
      const certified = !!get().upgrades.certOdds
      const out = packOutcome(value, gross, tier.bandLo, cap(who), { published, certified })
      // On stream the whole room saw it — reputation and fame swing harder both ways.
      const swing = channel === 'stream' ? 1.5 : 1
      // ✨ Custom Wrap Press: pro presentation buys forgiveness — a thin pack stings less
      // (negative rep swings softened 40%). It never juices a GOOD pull's rep; that'd be
      // buying reputation, not packaging.
      let repDelta = Math.round(out.repDelta * swing)
      if (repDelta < 0 && get().upgrades.wrapPress) repDelta = Math.round(repDelta * 0.6)
      const notoDelta = Math.round(out.notoDelta * swing)
      // 🔥 Word-of-mouth streak: happy openings build a demand tailwind (jackpots build it
      // fastest); a single burned buyer snaps it back to zero. Feeds packSaleChance's hype mult.
      const curStreak = get().packStreak || 0
      const nextStreak = out.key === 'jackpot' ? Math.min(12, curStreak + 2)
        : out.key === 'happy' ? Math.min(12, curStreak + 1)
        : out.key === 'ripoff' ? 0
        : curStreak
      set(s => ({
        builtPacks: s.builtPacks.filter(p => p.uid !== uid),
        packRep: Math.max(0, Math.min(100, round2((s.packRep ?? 50) + repDelta))),
        packStreak: nextStreak,
        // 🔥 A jackpot repack story travels — folded into this write, no extra set().
        ...(out.key === 'jackpot' ? { hype: bumpHype(s.hype, 4) } : {}),
        packStats: {
          ...s.packStats,
          sold: (s.packStats?.sold || 0) + 1,
          revenue: round2((s.packStats?.revenue || 0) + net),
          delighted: (s.packStats?.delighted || 0) + (out.key === 'jackpot' || out.key === 'happy' ? 1 : 0),
          burned: (s.packStats?.burned || 0) + (out.key === 'ripoff' ? 1 : 0),
        },
      }))
      get().earn(net)
      if (notoDelta) get().addNotoriety(notoDelta, false, 'packs')
      const chanIcon = channel === 'stream' ? '🔴' : channel === 'show' ? '🎪' : channel === 'walkin' ? '🏬' : '🌐'
      const best = packBestItem(pack)
      const openNote = channel === 'stream'
        ? `you ripped it live — ${out.line.toLowerCase()}`
        : `${out.line}${best ? ` (best: ${best.name}, $${best.value.toFixed(2)})` : ''}`
      const emoji = out.key === 'jackpot' ? '🎉' : out.key === 'happy' ? '🙂' : out.key === 'meh' ? '😐' : '😡'
      get().log('packs', `${chanIcon}${emoji} ${cap(who)} bought a ${tier.icon} ${tier.name} for $${gross.toFixed(2)} — ${openNote}${notoDelta ? ` (${notoDelta > 0 ? '+' : ''}${notoDelta}★)` : ''}`, net)
      get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
      // A delighted repack buyer sticks around — the good-pack loop feeds your regulars.
      if ((out.key === 'jackpot' || (out.key === 'happy' && Math.random() < 0.4)) && (channel === 'online' || channel === 'walkin')) {
        get().formRegular({ setId: setIdOfContents(pack), channel: channel === 'walkin' ? 'walkin' : 'online', generous: out.key === 'jackpot' })
      }
      get().checkMilestones()
      return { net, gross, value, outcome: out, tier, pack, best }
    },
  }
}

// Clamp/normalize a tier's fields; null if it can't be a real product.
function sanitizeTier({ name, icon, price, bandLo, bandHi, channels, only, minGrade, published }) {
  const p = round2(Math.max(1, Math.min(2000, +price || 0)))
  if (!(p > 0)) return null
  let lo = round2(Math.max(0.25, +bandLo || 1))
  let hi = round2(Math.max(lo, +bandHi || lo * 3))
  // The content rule. An absent `only` (every tier saved before this existed) reads as
  // 'any', so old lines keep behaving exactly as they did.
  const o = ['any', 'raw', 'slab'].includes(only) ? only : 'any'
  return {
    name: String(name || 'Mystery Pack').slice(0, 40),
    icon: String(icon || '❓').slice(0, 4),
    price: p, bandLo: lo, bandHi: hi,
    only: o,
    // 📋 Whether the odds board for this line is public (see packOutcome/packSaleChance).
    published: !!published,
    // Only a slab line can carry a grade floor; clamp to a real PSA grade.
    minGrade: o === 'slab' ? Math.max(0, Math.min(10, Math.floor(+minGrade || 0))) : 0,
    channels: {
      show: channels?.show !== false, store: channels?.store !== false,
      online: channels?.online !== false, stream: channels?.stream !== false,
    },
  }
}

// A set id from the pack's contents (for regular formation) — first card's set, if any.
function setIdOfContents(pack) {
  return pack.cards?.length ? setIdOfCard(pack.cards[0]) : null
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

export { defaultPackTiers }
