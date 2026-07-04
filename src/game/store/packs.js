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

import { round2, setIdOfCard } from '../engine'
import { packValue, packBestItem, packOutcome, packBuyerName, PACK_TIER_CAP, defaultPackTiers } from '../mysterypacks'
import { ONLINE_FEE_PCT, shippingCost, processingFee, absoluteDay } from './constants'

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
      if (channel === 'online') net = round2(gross - round2(gross * ONLINE_FEE_PCT) - shippingCost(gross))
      if (payMethod) net = processingFee(net, payMethod).net
      const value = packValue(pack)
      const who = buyer || packBuyerName(channel)
      const out = packOutcome(value, gross, tier.bandLo, cap(who))
      // On stream the whole room saw it — reputation and fame swing harder both ways.
      const swing = channel === 'stream' ? 1.5 : 1
      const repDelta = Math.round(out.repDelta * swing)
      const notoDelta = Math.round(out.notoDelta * swing)
      set(s => ({
        builtPacks: s.builtPacks.filter(p => p.uid !== uid),
        packRep: Math.max(0, Math.min(100, round2((s.packRep ?? 50) + repDelta))),
        packStats: {
          ...s.packStats,
          sold: (s.packStats?.sold || 0) + 1,
          revenue: round2((s.packStats?.revenue || 0) + net),
          delighted: (s.packStats?.delighted || 0) + (out.key === 'jackpot' || out.key === 'happy' ? 1 : 0),
          burned: (s.packStats?.burned || 0) + (out.key === 'ripoff' ? 1 : 0),
        },
      }))
      get().earn(net)
      if (notoDelta) get().addNotoriety(notoDelta)
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
function sanitizeTier({ name, icon, price, bandLo, bandHi, channels }) {
  const p = round2(Math.max(1, Math.min(2000, +price || 0)))
  if (!(p > 0)) return null
  let lo = round2(Math.max(0.25, +bandLo || 1))
  let hi = round2(Math.max(lo, +bandHi || lo * 3))
  return {
    name: String(name || 'Mystery Pack').slice(0, 40),
    icon: String(icon || '❓').slice(0, 4),
    price: p, bandLo: lo, bandHi: hi,
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
