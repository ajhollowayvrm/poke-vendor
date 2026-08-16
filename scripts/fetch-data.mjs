// Fetches Pokémon TCG sets + cards into src/data/sets.json.
//
// PRIMARY source: pokemontcg.io (https://api.pokemontcg.io/v2) — free, no key required, and
//   no key is obtainable any more: the free key tier is being retired in favour of Scrydex,
//   its paid successor (from $29/mo, metered, no free tier). POKEMONTCG_IO_KEY is still read
//   if you happen to hold one, but unauthenticated access is the supported path here.
//   ⚠️ This API periodically serves 500/502 for most requests. That is an OUTAGE, not
//   throttling — it never returns 429 and sends no rate-limit headers. See getJSON's retry
//   knobs and the stale-set report at the end of a run.
//   Provides: card names, numbers, rarities, images, and USD/EUR prices for all English sets.
//
// SECONDARY source: TCGCSV (https://tcgcsv.com) — free, no auth needed, browser UA required.
//   Provides: sealed product listings + prices for English sets; per-card price fallback
//   by collector number.
//
// TERTIARY source: TCGdex (https://api.tcgdex.net/v2/en) — free, no auth needed.
//   Last-resort fallback ONLY: fills a missing price or image for individual cards that
//   come up empty from both pokemontcg.io and TCGCSV. Not bulk-fetched.
//
// PSA graded comps: NO live source — preserved from the prior src/data/sets.json.
//   At startup, the existing file is read and a card-id → psa map is built. After each
//   card is priced from free sources, its prior PSA comp is reattached and re-sanitized
//   against the new price (to maintain monotonicity). Drop-in safe: if sets.json doesn't
//   exist yet, no PSA data is attached (no crash).
//
// No paid key required. No RapidAPI / POKEMON_API_KEY / .pokemon-api-key references.
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripDerivableImages } from './strip-derivable-images.mjs'
import { stripDerivableFields } from './strip-derivable-fields.mjs'

// EUR→USD conversion for Cardmarket prices (approximate; used as fallback only).
const EUR_USD = 1.08

// English sets to build, keyed by OUR ids (which ARE the pokemontcg.io set ids — 1:1 match).
// `vintage:true` sets are hidden from the shop and sold only via the Vintage Vault vendor.
// `ep` is kept as a comment for reference but is no longer used for fetching.
const EN_SETS = [
  // ========================= SHOP — in-print, sold FRESH by distributors =========================
  // What a real modern card shop stocks new right now: the current Mega Evolution block + recent
  // Scarlet & Violet, plus Prismatic, the evergreen reprint that never really leaves shelves.
  // ⚠️ THIS LIST *IS* THE IN-PRINT LINEUP (minus RETIRED_IDS in engine.js). The engine no longer
  // retires sets on an age window — everything here is orderable from every distributor, forever,
  // until you either move it down to SECONDARY or add its id to RETIRED_IDS. Print status is
  // curated because in real life it's set by demand and Standard rotation, not by a set's age.
  // 151 stays listed here but is RETIRED in the engine: it rotated out (mark G) and stopped
  // printing in April 2026, yet it is nowhere near gone — sealed still sells through Amazon and
  // the marketplaces, and its singles are everywhere. That's the sell-through stage, not
  // SECONDARY. Only move a set down there once the channel has actually run dry.
  // Ordered newest → oldest; SHOP_SETS is re-sorted by releaseDate in engine.js so scoped fetches
  // can't scramble the "newest" that Pokémon Center gets first dibs on.
  { id: 'me5',      name: 'Pitch Black' },
  { id: 'me4',      name: 'Chaos Rising' },
  { id: 'me3',      name: 'Perfect Order' },
  { id: 'me2pt5',   name: 'Ascended Heroes' },
  { id: 'me2',      name: 'Phantasmal Flames' },
  { id: 'me1',      name: 'Mega Evolution' },
  { id: 'zsv10pt5', name: 'Black Bolt' },
  { id: 'rsv10pt5', name: 'White Flare' },
  { id: 'sv10',     name: 'Destined Rivals' },
  { id: 'sv9',      name: 'Journey Together' },
  { id: 'sv8',      name: 'Surging Sparks' },
  { id: 'sv8pt5',   name: 'Prismatic Evolutions' },
  { id: 'sv7',      name: 'Stellar Crown' },
  { id: 'sv6pt5',   name: 'Shrouded Fable' },
  { id: 'sv6',      name: 'Twilight Masquerade' },
  { id: 'sv5',      name: 'Temporal Forces' },
  { id: 'sv3pt5',   name: '151' },

  // ===================== SECONDARY — online + vendor-show finds (not sold fresh) =====================
  // Older but still-findable aftermarket product. Surfaces at show-floor booths and online listings,
  // never on a distributor's fresh shelf. Full product lineups (unlike the single-pack vintage packs).
  // --- Scarlet & Violet (early, out of fresh print) ---
  { id: 'sv4pt5',   name: 'Paldean Fates',    secondary: true },
  { id: 'sv4',      name: 'Paradox Rift',     secondary: true },
  { id: 'sv3',      name: 'Obsidian Flames',  secondary: true },
  { id: 'sv2',      name: 'Paldea Evolved',   secondary: true },
  { id: 'sv1',      name: 'Scarlet & Violet', secondary: true },
  // --- Sword & Shield era ---
  // Crown Zenith ships a 70-card "Galarian Gallery" subset (swsh12pt5gg); merge it so the set is complete.
  { id: 'swsh12pt5', name: 'Crown Zenith',    secondary: true, alsoFetch: ['swsh12pt5gg'] },
  { id: 'pgo',      name: 'Pokémon GO',       secondary: true },
  // SWSH sets ship a "Trainer Gallery" (*tg) subset of alt-art chases (Charizard TG, etc.); merge each.
  { id: 'swsh12',   name: 'Silver Tempest',   secondary: true, alsoFetch: ['swsh12tg'] },
  { id: 'swsh11',   name: 'Lost Origin',      secondary: true, alsoFetch: ['swsh11tg'] },
  { id: 'swsh10',   name: 'Astral Radiance',  secondary: true, alsoFetch: ['swsh10tg'] },
  { id: 'swsh9',    name: 'Brilliant Stars',  secondary: true, alsoFetch: ['swsh9tg'] },
  { id: 'swsh8',    name: 'Fusion Strike',    secondary: true },
  { id: 'swsh7',    name: 'Evolving Skies',   secondary: true },
  { id: 'swsh6',    name: 'Chilling Reign',   secondary: true },
  { id: 'swsh5',    name: 'Battle Styles',    secondary: true },
  // Shining Fates ships a 122-card "Shiny Vault" subset (swsh45sv — shiny Charizard VMAX etc.); merge it.
  { id: 'swsh45',   name: 'Shining Fates',    secondary: true, alsoFetch: ['swsh45sv'] },
  { id: 'swsh4',    name: 'Vivid Voltage',    secondary: true },
  { id: 'swsh35',   name: "Champion's Path",  secondary: true },
  { id: 'swsh3',    name: 'Darkness Ablaze',  secondary: true },
  { id: 'swsh2',    name: 'Rebel Clash',      secondary: true },
  { id: 'swsh1',    name: 'Sword & Shield',   secondary: true },
  // --- Sun & Moon era ---
  { id: 'sm12',   name: 'Cosmic Eclipse',   secondary: true },
  { id: 'sm11',   name: 'Unified Minds',    secondary: true },
  // Hidden Fates ships a 94-card "Shiny Vault" subset (sma — shiny Charizard-GX etc.); merge it.
  { id: 'sm115',  name: 'Hidden Fates',     secondary: true, alsoFetch: ['sma'] },
  { id: 'sm10',   name: 'Unbroken Bonds',   secondary: true },
  { id: 'sm9',    name: 'Team Up',          secondary: true },
  { id: 'sm8',    name: 'Lost Thunder',     secondary: true },
  { id: 'sm75',   name: 'Dragon Majesty',   secondary: true },
  { id: 'sm7',    name: 'Celestial Storm',  secondary: true },
  { id: 'sm6',    name: 'Forbidden Light',  secondary: true },
  { id: 'sm5',    name: 'Ultra Prism',      secondary: true },
  { id: 'sm4',    name: 'Crimson Invasion', secondary: true },
  { id: 'sm35',   name: 'Shining Legends',  secondary: true },
  { id: 'sm3',    name: 'Burning Shadows',  secondary: true },
  { id: 'sm2',    name: 'Guardians Rising', secondary: true },
  { id: 'sm1',    name: 'Sun & Moon',       secondary: true },
  // --- XY era ---
  { id: 'xy12',   name: 'Evolutions',       secondary: true },
  { id: 'xy11',   name: 'Steam Siege',      secondary: true },
  { id: 'xy10',   name: 'Fates Collide',    secondary: true },
  { id: 'xy9',    name: 'BREAKpoint',       secondary: true },
  { id: 'xy8',    name: 'BREAKthrough',     secondary: true },
  { id: 'xy7',    name: 'Ancient Origins',  secondary: true },
  { id: 'xy6',    name: 'Roaring Skies',    secondary: true },
  { id: 'xy5',    name: 'Primal Clash',     secondary: true },
  { id: 'xy4',    name: 'Phantom Forces',   secondary: true },
  { id: 'xy3',    name: 'Furious Fists',    secondary: true },
  { id: 'xy2',    name: 'Flashfire',        secondary: true },
  { id: 'xy1',    name: 'XY',               secondary: true },
  { id: 'g1',     name: 'Generations',      secondary: true },
  // Celebrations (2021, out of print) — 25-card main + 25-card Classic Collection reprints (cel25c).
  { id: 'cel25',  name: 'Celebrations',     secondary: true, alsoFetch: ['cel25c'] },

  // ===================== VINTAGE — out-of-print chase; surfaces as random finds =====================
  // --- Black & White / Call of Legends ---
  { id: 'bw11',    name: 'Legendary Treasures',  vintage: true },
  { id: 'bw10',    name: 'Plasma Blast',         vintage: true },
  { id: 'bw9',     name: 'Plasma Freeze',        vintage: true },
  { id: 'bw8',     name: 'Plasma Storm',         vintage: true },
  { id: 'bw7',     name: 'Boundaries Crossed',   vintage: true },
  { id: 'bw6',     name: 'Dragons Exalted',      vintage: true },
  { id: 'bw5',     name: 'Dark Explorers',       vintage: true },
  { id: 'bw4',     name: 'Next Destinies',       vintage: true },
  { id: 'bw3',     name: 'Noble Victories',      vintage: true },
  { id: 'bw2',     name: 'Emerging Powers',      vintage: true },
  { id: 'bw1',     name: 'Black & White',        vintage: true },
  { id: 'col1',    name: 'Call of Legends',      vintage: true },
  // --- HeartGold & SoulSilver ---
  { id: 'hgss1',   name: 'HeartGold SoulSilver', vintage: true },
  { id: 'hgss2',   name: 'HS Unleashed',         vintage: true },
  { id: 'hgss3',   name: 'HS Undaunted',         vintage: true },
  { id: 'hgss4',   name: 'Triumphant',           vintage: true },
  // --- Platinum ---
  { id: 'pl4',     name: 'Arceus',               vintage: true },
  { id: 'pl3',     name: 'Supreme Victors',      vintage: true },
  { id: 'pl2',     name: 'Rising Rivals',        vintage: true },
  { id: 'pl1',     name: 'Platinum',             vintage: true },
  // --- Diamond & Pearl ---
  { id: 'dp1',     name: 'Diamond & Pearl',      vintage: true },
  { id: 'dp2',     name: 'Mysterious Treasures', vintage: true },
  { id: 'dp3',     name: 'Secret Wonders',       vintage: true },
  { id: 'dp4',     name: 'Great Encounters',     vintage: true },
  { id: 'dp5',     name: 'Majestic Dawn',        vintage: true },
  { id: 'dp6',     name: 'Legends Awakened',     vintage: true },
  { id: 'dp7',     name: 'Stormfront',           vintage: true },
  // --- EX era ---
  { id: 'ex16',    name: 'Power Keepers',        vintage: true },
  { id: 'ex15',    name: 'EX Dragon Frontiers',  vintage: true },
  { id: 'ex14',    name: 'Crystal Guardians',    vintage: true },
  { id: 'ex13',    name: 'Holon Phantoms',       vintage: true },
  { id: 'ex12',    name: 'Legend Maker',         vintage: true },
  { id: 'ex11',    name: 'Delta Species',        vintage: true },
  { id: 'ex10',    name: 'Unseen Forces',        vintage: true },
  { id: 'ex9',     name: 'Emerald',              vintage: true },
  { id: 'ex8',     name: 'EX Deoxys',            vintage: true },
  { id: 'ex7',     name: 'EX Team Rocket Returns', vintage: true },
  { id: 'ex6',     name: 'FireRed & LeafGreen',  vintage: true },
  { id: 'ex5',     name: 'Hidden Legends',       vintage: true },
  { id: 'ex4',     name: 'Team Magma vs Team Aqua', vintage: true },
  { id: 'ex3',     name: 'Dragon',               vintage: true },
  { id: 'ex2',     name: 'Sandstorm',            vintage: true },
  { id: 'ex1',     name: 'Ruby & Sapphire',      vintage: true },
  // --- WOTC (1999–2002) ---
  { id: 'ecard3',  name: 'Skyridge',             vintage: true },
  { id: 'ecard2',  name: 'Aquapolis',            vintage: true },
  { id: 'ecard1',  name: 'Expedition',           vintage: true },
  { id: 'neo4',    name: 'Neo Destiny',          vintage: true },
  { id: 'neo3',    name: 'Neo Revelation',       vintage: true },
  { id: 'neo2',    name: 'Neo Discovery',        vintage: true },
  { id: 'neo1',    name: 'Neo Genesis',          vintage: true },
  { id: 'gym2',    name: 'Gym Challenge',        vintage: true },
  { id: 'gym1',    name: 'Gym Heroes',           vintage: true },
  { id: 'base5',   name: 'Team Rocket',          vintage: true },
  { id: 'base4',   name: 'Base Set 2',           vintage: true },
  { id: 'base3',   name: 'Fossil',               vintage: true },
  { id: 'base2',   name: 'Jungle',               vintage: true },
  { id: 'base1',   name: 'Base Set',             vintage: true },
  { id: 'base6',   name: 'Legendary Collection', vintage: true },

  // ===================== EXTRA — promo & collectible card POOLS (no sealed product) =====================
  // These have no booster/box to buy: they're a card pool, browsable in the price guide and — crucially —
  // the source the real bonus promos pin to (a "151 ETB" ships an svp Black Star Promo). `extra:true`
  // keeps them out of the shop, distributors, and the Vault. No SET_GROUP → no products, prices come
  // straight from pokemontcg.io's tcgplayer data.
  // --- Black Star Promos (every era) ---
  { id: 'svp',     name: 'Scarlet & Violet Black Star Promos', extra: true },
  { id: 'swshp',   name: 'SWSH Black Star Promos',             extra: true },
  { id: 'smp',     name: 'SM Black Star Promos',               extra: true },
  { id: 'xyp',     name: 'XY Black Star Promos',               extra: true },
  { id: 'bwp',     name: 'BW Black Star Promos',               extra: true },
  { id: 'hsp',     name: 'HGSS Black Star Promos',             extra: true },
  { id: 'dpp',     name: 'DP Black Star Promos',               extra: true },
  { id: 'np',      name: 'Nintendo Black Star Promos',         extra: true },
  { id: 'basep',   name: 'Wizards Black Star Promos',          extra: true },
  // --- McDonald's Collections ---
  { id: 'mcd22',   name: "McDonald's Collection 2022", extra: true },
  { id: 'mcd21',   name: "McDonald's Collection 2021", extra: true },
  { id: 'mcd19',   name: "McDonald's Collection 2019", extra: true },
  { id: 'mcd18',   name: "McDonald's Collection 2018", extra: true },
  { id: 'mcd17',   name: "McDonald's Collection 2017", extra: true },
  { id: 'mcd16',   name: "McDonald's Collection 2016", extra: true },
  { id: 'mcd15',   name: "McDonald's Collection 2015", extra: true },
  { id: 'mcd14',   name: "McDonald's Collection 2014", extra: true },
  { id: 'mcd12',   name: "McDonald's Collection 2012", extra: true },
  { id: 'mcd11',   name: "McDonald's Collection 2011", extra: true },
  // --- POP Series (organized-play promos) ---
  { id: 'pop9',    name: 'POP Series 9', extra: true },
  { id: 'pop8',    name: 'POP Series 8', extra: true },
  { id: 'pop7',    name: 'POP Series 7', extra: true },
  { id: 'pop6',    name: 'POP Series 6', extra: true },
  { id: 'pop5',    name: 'POP Series 5', extra: true },
  { id: 'pop4',    name: 'POP Series 4', extra: true },
  { id: 'pop3',    name: 'POP Series 3', extra: true },
  { id: 'pop2',    name: 'POP Series 2', extra: true },
  { id: 'pop1',    name: 'POP Series 1', extra: true },
  // --- Trainer Kits & one-off specials ---
  { id: 'tk2a',    name: 'EX Trainer Kit 2 Plusle', extra: true },
  { id: 'tk2b',    name: 'EX Trainer Kit 2 Minun',  extra: true },
  { id: 'tk1a',    name: 'EX Trainer Kit Latias',   extra: true },
  { id: 'tk1b',    name: 'EX Trainer Kit Latios',   extra: true },
  { id: 'sve',     name: 'Scarlet & Violet Energies', extra: true },
  { id: 'det1',    name: 'Detective Pikachu',       extra: true },
  { id: 'dc1',     name: 'Double Crisis',           extra: true },
  { id: 'xy0',     name: 'Kalos Starter Set',       extra: true },
  { id: 'dv1',     name: 'Dragon Vault',            extra: true },
  { id: 'ru1',     name: 'Pokémon Rumble',          extra: true },
  { id: 'bp',      name: 'Best of Game',            extra: true },
  { id: 'si1',     name: 'Southern Islands',        extra: true },
  { id: 'fut20',   name: 'Pokémon Futsal Collection', extra: true },
]
// Sets flagged `vintage` are NOT sold in the normal shop — they only surface via
// the rare "Vintage Vault" vendor that occasionally appears at higher-tier shows.
const VINTAGE_SETS = new Set(['base1', ...EN_SETS.filter(s => s.vintage).map(s => s.id)])

// Real sealed-product promos, researched + verified against Bulbapedia / PSA-GameStop /
// TCGplayer labels (SVP & SWSH numbers validated against the fetched card data). Applied to
// each set's products after they're built so a re-fetch never loses them (products are rebuilt
// from scratch by classifyProduct). `etb`/`pcEtb`/`bb` use exact card ids; `etbName`/`bbNames`
// pin by name (engine resolves in-set → era Black Star Promo → mints) for promos whose card we
// don't have (Mega Evolution's MEP set isn't on pokemontcg.io; svp 209/210 beyond our snapshot).
// The engine reads fixedPromo (id) / fixedPromoName (string) / promoPool (1-of-N) — see engine.js.
const PROMO_MAP = {
  sv1:      { etb: 'svp-14',  pcEtb: 'svp-13',  bb: ['svp-5','svp-6','svp-7','svp-8'] },
  sv2:      { etb: 'svp-27',  bb: ['svp-19','svp-20','svp-21','svp-22'] },
  sv3:      { etb: 'svp-44',  bb: ['svp-36','svp-37','svp-38','svp-39'] },
  sv3pt5:   { etb: 'svp-51' },
  sv4:      { etb: 'svp-65',  pcEtb: 'svp-66',  bb: ['svp-57','svp-58','svp-59','svp-60'] },
  sv4pt5:   { etb: 'svp-75' },
  sv5:      { etb: 'svp-97',  pcEtb: 'svp-98',  bb: ['svp-89','svp-90','svp-91','svp-92'] },
  sv6:      { etb: 'svp-123', bb: ['svp-115','svp-116','svp-117','svp-118'] },
  sv6pt5:   { etb: 'svp-129' },
  sv7:      { etb: 'svp-141', bb: ['svp-133','svp-134','svp-135','svp-136'] },
  sv8:      { etb: 'svp-159', bb: ['svp-151','svp-152','svp-153','svp-154'] },
  sv8pt5:   { etb: 'svp-173' },
  sv9:      { etb: 'svp-189', bb: ['svp-181','svp-182','svp-183','svp-184'] },
  sv10:     { etb: 'svp-203', bb: ['sv10-34','sv10-49','sv10-87','sv10-96'] },
  zsv10pt5: { etbName: 'Thundurus' },
  rsv10pt5: { etbName: 'Tornadus' },
  swsh7:     { bb: ['swshp-SWSH122','swshp-SWSH123','swshp-SWSH124','swshp-SWSH125'] },
  swsh9:     { bb: ['swshp-SWSH185','swshp-SWSH186','swshp-SWSH187','swshp-SWSH188'] },
  swsh10:    { bb: ['swshp-SWSH205','swshp-SWSH206','swshp-SWSH207','swshp-SWSH208'] },
  swsh11:    { bb: ['swshp-SWSH240','swshp-SWSH241','swshp-SWSH242','swshp-SWSH243'] },
  swsh12:    { bb: ['swshp-SWSH269','swshp-SWSH270','swshp-SWSH271','swshp-SWSH272'] },
  swsh12pt5: { etb: 'swshp-SWSH291' },
  me1:      { etbName: 'Riolu',     bbNames: ['Meganium','Inteleon','Alakazam','Lunatone'] },
  me2:      { etbName: 'Charcadet', bbNames: ['Ceruledge','Zacian','Flygon','Toxtricity'] },
  me2pt5:   { etbName: "N's Zekrom" },
  me3:      { etbName: 'Tyrunt',    bbNames: ['Serperior','Barbaracle','Tyrantrum','Doublade'] },
  me4:      { etbName: 'Fennekin',  bbNames: ['Delphox','Ampharos','Crobat','Goodra'] },
  me5:      { etbName: 'Zarude',    bbNames: ['Miraidon','Slowbro','Dhelmise','Bastiodon'] },
}
// Stamp a set's products with its researched promos (in place). Safe no-op for sets not in the map.
// Stamps every matching product, not just the first. Since the dedup was lifted a set can
// carry several Elite Trainer Boxes, and each one really does ship the same researched promo —
// `find` would have left all but one of them handing out a random card.
function applyPromoMap(setId, products) {
  const m = PROMO_MAP[setId]
  if (!m) return
  const all = t => products.filter(p => p.type === t)
  for (const etb of all('Elite Trainer Box')) {
    if (m.etb) etb.fixedPromo = m.etb; else if (m.etbName) etb.fixedPromoName = m.etbName
  }
  for (const pcEtb of all('Pokémon Center Elite Trainer Box')) {
    const id = m.pcEtb || m.etb
    if (id) pcEtb.fixedPromo = id; else if (m.etbName) pcEtb.fixedPromoName = m.etbName
  }
  for (const bb of all('Build & Battle Box')) {
    if (m.bb) bb.promoPool = m.bb; else if (m.bbNames) bb.promoPool = m.bbNames
  }
}

// pokemontcg.io rarity → engine rarity (RARITY_ORDER in engine.js). Modern sets
// already match. Vintage eras add Gold Star / Shining / Crystal / EX rarities —
// map them into engine tiers so they're treated as the chases they are.
const EN_RARITY_MAP = {
  'rare': 'Rare',
  'Rare Holo Star': 'Hyper Rare',          // Gold Stars — top vintage chase
  'Rare Shining':   'Hyper Rare',          // Neo "Shining" subtype
  'Rare Secret':    'Special Illustration Rare', // Crystals / secret rares
  'Rare Holo EX':   'Ultra Rare',          // EX-era full-art ex
  'Rare Holo':      'Rare Holo',
  'Rare Ultra':     'Ultra Rare',          // modern/Generations full-art ultra
  'Rare Holo V':    'Ultra Rare',          // SWSH-era V (Celebrations reprints) — chase tier
  'Rare Holo VMAX': 'Ultra Rare',          // SWSH-era VMAX (Celebrations reprints) — chase tier
  'Rare Holo VSTAR': 'Ultra Rare',         // SWSH-era VSTAR (Brilliant Stars+) — chase tier
  'Radiant Rare':   'Ultra Rare',          // SWSH Radiant — same era, map preemptively
  'Amazing Rare':   'Ultra Rare',          // SWSH Amazing Rare (Vivid Voltage era)
  'Trainer Gallery Rare Holo': 'Illustration Rare', // SWSH Trainer/Galarian Gallery alt-arts
  'Rare Shiny V':    'Special Illustration Rare', // Shining Fates Shiny Vault
  'Rare Shiny VMAX': 'Hyper Rare',         // Shiny Vault VMAX
  'Classic Collection': 'Special Illustration Rare', // Celebrations Classic reprints (Base Zard etc.)
  // SM / XY-era chases (aftermarket sets: Team Up, Hidden Fates, Evolutions, Fates Collide…)
  'Rare Holo GX':   'Ultra Rare',          // SM GX full-bodies
  'Rare Rainbow':   'Hyper Rare',          // SM rainbow-rare secret
  'Rare Holo LV.X': 'Ultra Rare',
  'Rare BREAK':     'Ultra Rare',          // XY BREAK cards
  'Rare Shining':   'Hyper Rare',
  'Rare Shiny':     'Special Illustration Rare',   // Hidden Fates Shiny Vault
  'Rare Shiny GX':  'Hyper Rare',          // Shiny Vault GX
  'Shiny Rare':       'Ultra Rare',        // SWSH Shiny Vault baby-shinies (Shining Fates)
  'Shiny Ultra Rare': 'Hyper Rare',        // SWSH Shiny Vault V/VMAX shinies
  'Rare Prime':     'Ultra Rare',
  'Rare ACE':       'Ultra Rare',
  'LEGEND':         'Hyper Rare',
  // Mega-era JP-style rarity names
  'Art Rare':         'Illustration Rare',
  'Special Art Rare': 'Special Illustration Rare',
  'SECRET RARE':      'Mega Hyper Rare',
  // Black Star Promo / trainer-kit / McDonald's card pools (extra sets): a foil promo tier.
  // Their real worth rides the fetched market price, not the rarity, so this is mostly cosmetic.
  'Promo':            'Rare Holo',
}
const KNOWN_RARITIES = new Set([
  'Common','Uncommon','Rare','Rare Holo','Double Rare','ACE SPEC Rare','Illustration Rare',
  'Ultra Rare','Special Illustration Rare','Hyper Rare','Mega Hyper Rare','Black White Rare',
  'MEGA_ATTACK_RARE', // Mega-era alt-art Mega ex (Ascended Heroes+) — passes through as-is
])
function mapRarity(r) {
  if (!r) return 'Common'
  if (EN_RARITY_MAP[r]) return EN_RARITY_MAP[r]
  if (KNOWN_RARITIES.has(r)) return r
  console.log(`    ⚠️  unknown rarity "${r}" → defaulting to Rare`)
  return 'Rare'
}

// Per-card rarity corrections keyed by card id. The source (pokemontcg.io) mis-tags a
// handful of top secret-numbered cards as plain "Rare"; these are the set's signature
// Black White Rare chases. Applied after mapRarity so a re-fetch keeps them correct.
const RARITY_ID_OVERRIDE = {
  'zsv10pt5-171': 'Black White Rare', // Black Bolt — Victini (secret)
  'rsv10pt5-172': 'Black White Rare', // White Flare — Victini (secret)
}

// --- TCGCSV sealed product / singles source (free, no auth) --------------------
// Maps our set ids → TCGplayer group ids on tcgcsv.com (category 3).
const TCGCSV = 'https://tcgcsv.com/tcgplayer/3'
const SET_GROUP = {
  // --- SHOP (in-print) ---
  me5:      24688, // Pitch Black
  me4:      24655, // Chaos Rising
  me3:      24587, // Perfect Order
  me2pt5:   24541, // Ascended Heroes
  me2:      24448, // Phantasmal Flames
  me1:      24380, // Mega Evolution
  zsv10pt5: 24325, // Black Bolt
  rsv10pt5: 24326, // White Flare
  sv10:     24269, // Destined Rivals
  sv9:      24073, // Journey Together
  sv8:      23651, // Surging Sparks
  sv8pt5:   23821, // Prismatic Evolutions
  sv7:      23537, // Stellar Crown
  sv6pt5:   23529, // Shrouded Fable
  sv6:      23473, // Twilight Masquerade
  sv5:      23381, // Temporal Forces
  sv3pt5:   23237, // 151
  // --- SECONDARY (aftermarket) — TCGplayer group ids for sealed products + singles price fallback ---
  sv4pt5:  23353, // Paldean Fates
  sv4:     23286, // Paradox Rift
  sv3:     23228, // Obsidian Flames
  sv2:     23120, // Paldea Evolved
  sv1:     22873, // Scarlet & Violet Base
  pgo:     3064,  // Pokémon GO
  swsh12pt5: 17688, // Crown Zenith
  swsh12:  3170,  // Silver Tempest
  swsh11:  3118,  // Lost Origin
  swsh10:  3040,  // Astral Radiance
  swsh9:   2948,  // Brilliant Stars
  swsh8:   2906,  // Fusion Strike
  swsh7:   2848,  // Evolving Skies
  swsh6:   2807,  // Chilling Reign
  swsh5:   2765,  // Battle Styles
  swsh45:  2754,  // Shining Fates
  swsh4:   2701,  // Vivid Voltage
  swsh35:  2685,  // Champion's Path
  swsh3:   2675,  // Darkness Ablaze
  swsh2:   2626,  // Rebel Clash
  swsh1:   2585,  // Sword & Shield Base
  sm12:    2534,  // SM Cosmic Eclipse
  sm11:    2464,  // SM Unified Minds
  sm115:   2480,  // Hidden Fates
  sm10:    2420,  // SM Unbroken Bonds
  sm9:     2377,  // SM Team Up
  sm8:     2328,  // SM Lost Thunder
  sm75:    2295,  // Dragon Majesty
  sm7:     2278,  // SM Celestial Storm
  sm6:     2209,  // SM Forbidden Light
  sm5:     2178,  // SM Ultra Prism
  sm4:     2071,  // SM Crimson Invasion
  sm35:    2054,  // Shining Legends
  sm3:     1957,  // SM Burning Shadows
  sm2:     1919,  // SM Guardians Rising
  sm1:     1863,  // SM Base Set
  xy12:    1842,  // XY Evolutions
  xy11:    1815,  // XY Steam Siege
  xy10:    1780,  // XY Fates Collide
  xy9:     1701,  // XY BREAKpoint
  xy8:     1661,  // XY BREAKthrough
  xy7:     1576,  // XY Ancient Origins
  xy6:     1534,  // XY Roaring Skies
  xy5:     1509,  // XY Primal Clash
  xy4:     1494,  // XY Phantom Forces
  xy3:     1481,  // XY Furious Fists
  xy2:     1464,  // XY Flashfire
  xy1:     1387,  // XY Base Set
  cel25:   2867,  // Celebrations
  g1:      1728,  // Generations
  // --- VINTAGE — sealed products + singles price fallback ---
  bw11:    1409,  // Legendary Treasures
  bw10:    1370,  // Plasma Blast
  bw9:     1382,  // Plasma Freeze
  bw8:     1413,  // Plasma Storm
  bw7:     1408,  // Boundaries Crossed
  bw6:     1394,  // Dragons Exalted
  bw5:     1386,  // Dark Explorers
  bw4:     1412,  // Next Destinies
  bw3:     1385,  // Noble Victories
  bw2:     1424,  // Emerging Powers
  bw1:     1400,  // Black & White
  col1:    1415,  // Call of Legends
  hgss1:   1402,  // HeartGold SoulSilver
  hgss2:   1399,  // HS Unleashed
  hgss3:   1403,  // HS Undaunted
  hgss4:   1381,  // HS Triumphant
  pl4:     1391,  // Arceus
  pl3:     1384,  // Supreme Victors
  pl2:     1367,  // Rising Rivals
  pl1:     1406,  // Platinum
  dp1:     1430,  // Diamond & Pearl
  dp2:     1368,  // Mysterious Treasures
  dp3:     1380,  // Secret Wonders
  dp4:     1405,  // Great Encounters
  dp5:     1390,  // Majestic Dawn
  dp6:     1417,  // Legends Awakened
  dp7:     1369,  // Stormfront
  ex16:    1383,  // Power Keepers
  ex15:    1411,  // EX Dragon Frontiers
  ex14:    1395,  // Crystal Guardians
  ex13:    1379,  // Holon Phantoms
  ex12:    1378,  // Legend Maker
  ex11:    1429,  // Delta Species
  ex10:    1398,  // Unseen Forces
  ex9:     1410,  // Emerald
  ex8:     1404,  // EX Deoxys
  ex7:     1428,  // EX Team Rocket Returns
  ex6:     1419,  // FireRed & LeafGreen
  ex5:     1416,  // Hidden Legends
  ex4:     1377,  // Team Magma vs Team Aqua
  ex3:     1376,  // Dragon
  ex2:     1392,  // Sandstorm
  ex1:     1393,  // Ruby & Sapphire
  ecard3:  1372,  // Skyridge
  ecard2:  1397,  // Aquapolis
  ecard1:  1375,  // Expedition
  neo4:    1444,  // Neo Destiny
  neo3:    1389,  // Neo Revelation
  neo2:    1434,  // Neo Discovery
  neo1:    1396,  // Neo Genesis
  gym2:    1440,  // Gym Challenge
  gym1:    1441,  // Gym Heroes
  base5:   1373,  // Team Rocket
  base4:   605,   // Base Set 2
  base3:   630,   // Fossil
  base2:   635,   // Jungle
  base1:   604,   // Base Set (1999)
  base6:   1374,  // Legendary Collection
}

// --- CardText: the publisher's own contents blurb ----------------------------
// Every sealed product on TCGCSV carries an `extendedData` field named `CardText` holding
// the back-of-box contents ("• 18 Pokémon TCG booster packs"). 4,069 of 4,741 sealed rows
// have one. It states the pack count outright, so it beats guessing from the product name —
// a "Premium Collection" is 6 packs in one set and 12 in another, and only this text knows.
//
// It also says which EXPANSION those packs come from — but only sometimes, and that is the
// second thing we read it for. When The Pokémon Company commits to a set the copy names it
// ("3 Pokémon TCG: Scarlet & Violet-151 booster packs"). When the contents float from box to
// box the copy goes vague ("16 Pokémon TCG booster packs from the Sword & Shield Series").
// That vagueness IS the signal that the product holds a random assortment — see productEra.
const NUM_WORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, twentyfour: 24, thirty: 30,
}

// Strip HTML to text WITHOUT collapsing line breaks or bullets — those boundaries are what
// stop a count in one bullet binding to "booster packs" three bullets later.
function plainText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\s*(?:br|\/li|\/p|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[—–]/g, '-')      // em/en dash → hyphen, so set names compare
    .replace(/[ \t]+/g, ' ')
}

// A count bound DIRECTLY to "booster pack(s)" — "18 Pokémon TCG booster packs",
// "3 Pokémon TCG: Scarlet & Violet-151 booster packs", "six booster packs".
//
// Two guards, both earned from real misreads in this data:
//   • The ordinal lookahead. Without it "30th Celebration Elite Trainer Box" read as 30 packs.
//   • No comma, semicolon or sentence-ending punctuation in the gap. Without that, the prose
//     "30 reasons to honor Pikachu, as each booster pack…" read as 30 packs. A real contents
//     line never puts a clause between the number and the thing it counts.
// A colon stays legal — expansion names carry one ("Pokémon TCG: Scarlet & Violet-151").
const PACK_RX = new RegExp(
  String.raw`\b(?:(\d{1,2})(?!(?:st|nd|rd|th)\b)|(` + Object.keys(NUM_WORD).join('|') + String.raw`))\b` +
  String.raw`[^.,;!?\n•*|]{0,60}?booster\s+packs?`,
  'gi',
)

// Expansions the copy names outright, e.g. "Scarlet & Violet-151", "Mega Evolution-Chaos Rising".
const SERIES_NAMES = ['Scarlet & Violet', 'Sword & Shield', 'Sun & Moon', 'Mega Evolution',
  'Black & White', 'Diamond & Pearl', 'HeartGold & SoulSilver', 'XY']
const NAMED_SET_RX = new RegExp(
  `(?:${SERIES_NAMES.join('|')})\\s*[-:]\\s*([A-Z][A-Za-z0-9 &'’]{2,28}?)` +
  `(?=\\s+(?:expansion|booster|Elite|Pok|Collection|Tin|Mini|Tech|Trainer|Binder|Poster|Series)|[.,)\\n]|$)`,
  'g',
)

function firstPackCount(t) {
  PACK_RX.lastIndex = 0
  let m
  while ((m = PACK_RX.exec(t))) {
    const n = m[1] ? Number(m[1]) : NUM_WORD[m[2].toLowerCase()]
    if (n >= 1 && n <= 40) return n   // 40 = above any real product, below a page number
  }
  return null
}

function namedExpansions(t) {
  const out = new Set()
  NAMED_SET_RX.lastIndex = 0
  let m
  while ((m = NAMED_SET_RX.exec(t))) {
    const n = m[1].trim()
    if (n.length > 3) out.add(n)
  }
  return [...out]
}

// → { packs, bonus, namedSets, text } or null when the text states no pack count.
function parseContents(cardText) {
  const t = plainText(cardText)
  if (!t.trim()) return null
  // A bulleted contents line ("• 18 Pokémon TCG booster packs") is the manifest; the prose
  // above it is marketing and often quotes a different number. Read the manifest first.
  const bullets = t.split('\n').filter(l => /^\s*[•*·-]/.test(l)).join('\n')
  const packs = firstPackCount(bullets) ?? firstPackCount(t)
  if (packs == null) return null
  const bonus = /foil promo|promo card|full-art foil|oversize\w*[^.\n]{0,40}foil/i.test(t) ? 'promo' : null
  return { packs, bonus, namedSets: namedExpansions(t), text: t }
}

// --- Era resolution for cross-set product ------------------------------------
// A product whose group is not a set and whose copy names no expansion (every Ultra Premium
// Collection) still has to rip SOMETHING. It draws from an era pool at rip time, so all we
// need here is which era. The mechanic suffix in the product's name settles it: The Pokémon
// Company retires a mechanic when its era ends, so "VSTAR" can only mean Sword & Shield and
// "GX" can only mean Sun & Moon. Case matters — lowercase "ex" is Scarlet & Violet onward,
// uppercase "EX" is the XY era.
const ERA_OVERRIDE = {
  // Only for names carrying no mechanic suffix at all. Keep this list short and cited.
  'TAG TEAM': 'Sun & Moon',                    // TAG TEAM was an SM-era mechanic
  'Alola': 'Sun & Moon',                       // Alola debuted in Sun & Moon
  'Detective Pikachu': 'Sun & Moon',           // 2019 tie-in, SM era
  'Eevee Evolutions Premium Collection': 'Sword & Shield',
  'Small But Mighty Premium Collection': 'Sword & Shield',
  'Heavy Hitters Premium Collection': 'Scarlet & Violet',
  'Legendary Warriors Premium Collection': 'Scarlet & Violet',
  'Combined Powers Premium Collection': 'Scarlet & Violet',
  'Meddling Sparks Premium Collection': 'Scarlet & Violet',
  'Masks of Ogerpon Premium Collection': 'Scarlet & Violet',
  'Tera Team Premium Collection': 'Scarlet & Violet',
  'Paradox Fury Premium Collection': 'Scarlet & Violet',
  'Paradox Wisdom Premium Collection': 'Scarlet & Violet',
  'Mythical Squishy Premium Collection': 'Scarlet & Violet',
  'Evolving Powers Premium Collection': 'Scarlet & Violet',
}

function productEra(name, text) {
  for (const [k, v] of Object.entries(ERA_OVERRIDE)) if (name.includes(k)) return v
  // The copy says it outright — "booster packs from the Sword & Shield Series".
  const m = text.match(new RegExp(`(${SERIES_NAMES.join('|')})\\s+Series`, 'i'))
  if (m) return SERIES_NAMES.find(s => s.toLowerCase() === m[1].toLowerCase()) || null
  if (/\bmega\b[^[]*\bex\b/i.test(name))       return 'Mega Evolution'
  if (/\b(?:VMAX|VSTAR|V-UNION)\b/i.test(name)) return 'Sword & Shield'
  if (/\bV\b/.test(name))                       return 'Sword & Shield'
  if (/\bGX\b/.test(name))                      return 'Sun & Moon'
  if (/\bex\b/.test(name))                      return 'Scarlet & Violet'   // lowercase — modern
  if (/\bEX\b/.test(name))                      return 'XY'                 // uppercase — XY era
  return null
}

// Classify a sealed product by name → { type, packs, bonus }.
// packs = how many booster packs it rips into; bonus = guaranteed promo/extra.
// Order matters: most specific first. Returns null for things we don't sell
// (cases, code cards, singles, display cases, accessories).
function classifyProduct(rawName) {
  // Normalise before matching the $-anchored rules below:
  //   • drop trailing qualifiers — "[Mega Gardevoir]", "(Retail)", "(LGS)", "(Sam's Club)",
  //     "(Dollar General Exclusive)" — so "… Elite Trainer Box (Dollar General Exclusive)"
  //     types as an Elite Trainer Box instead of falling through to the generic Box guess.
  //   • accept "3 Pack Blister" as well as "3-Pack Blister".
  // These mattered only once the shop stopped keeping one product per type: under the old dedup
  // the plain sibling won the slot and the qualified ones never surfaced.
  // `raw` keeps every qualifier, `n` has them stripped. EVERY reject test runs against `raw`;
  // only the type rules read `n`. Getting this backwards silently un-rejects things —
  // "… Collection [Set of 2]" strips to a clean product name and sails past `set of \d`.
  const raw = String(rawName).toLowerCase()
  let name = String(rawName)
  for (let i = 0; i < 3; i++) name = name.replace(/\s*(?:\[[^\]]*\]|\([^)]*\))\s*$/, '').trim()
  const n = name.toLowerCase().replace(/\b(\d) pack blister/g, '$1-pack blister')
  // Pokémon Center Elite Trainer Box — a store-exclusive ETB (same 9 packs, extra promo). Matched
  // BEFORE the hard-reject because "(Exclusive)" would otherwise drop it; still reject its case/display
  // variants via the guard so "…ETB Case (Exclusive)" stays out. The guard MUST also drop the code
  // card ("Code Card - … Pokémon Center Elite Trainer Box"): it carries "pokémon center" +
  // "elite trainer box" so it matches here, and a $0.91 code card must never stand in for the
  // real ~$290 box (this rule runs before the /code card/ reject).
  if (/pok[eé]?mon center.*elite trainer box/.test(n) && !/\bcase\b|display|code card|^code |set of \d/.test(raw)) return { type: 'Pokémon Center Elite Trainer Box', icon: '🎁', packs: 9, bonus: 'promo' }
  // Hard reject: code cards, cases, displays, multi-packs, and — for older sets — fixed
  // THEME/THUNDER decks (no booster packs) and loose energy singles.
  // Poster / binder / figure / pin / sticker / pouch collections and retail "(Exclusive)"
  // bundles USED to be rejected here. They are real sealed product that rips real packs, so
  // they now fall through to the type rules below. Cases still die on the \bcase\b guard.
  //
  // `carton` and `token` are here because the catch-all `guessProduct` gave both a default of
  // ONE pack, and at their real prices that is not a cosmetic mislabel:
  //   • "Stellar Crown Sleeved Booster Master Carton" ($1,146) is bulk retail shipping — the
  //     same thing as a case, just not spelled "case". As 1 pack it was the worst buy in the
  //     game by an order of magnitude.
  //   • "VSTAR Token" ($0.15) is a game token, not sealed product at all. As 1 pack it was a
  //     money printer: buy for 15c, rip a real Brilliant Stars pack worth several dollars,
  //     repeat. That one is an exploit, not just wrong data.
  if (/code card|^code |\bcase\b|case$|display|set of \d|theme deck|\bdeck\b|\benergy\b|unnumbered|\bcarton\b|\btoken\b/.test(raw)) return null
  // Ultra Premium Collection — the flagship. MUST precede the plain premium-collection rule,
  // because "ultra premium collection" also ends in "premium …collection".
  if (/ultra[- ]premium collection/.test(n)) return { type: 'Ultra Premium Collection', icon: '👑', packs: 16, bonus: 'promo' }
  if (/poster collection/.test(n))          return { type: 'Poster Collection', icon: '🖼️', packs: 3, bonus: 'promo' }
  if (/binder collection/.test(n))          return { type: 'Binder Collection', icon: '📒', packs: 4, bonus: 'promo' }
  if (/tech sticker collection/.test(n))    return { type: 'Tech Sticker Collection', icon: '🏷️', packs: 4, bonus: 'promo' }
  if (/pin collection|pin blister/.test(n)) return { type: 'Pin Collection', icon: '📍', packs: 3, bonus: 'promo' }
  if (/super-premium collection$/.test(n))  return { type: 'Super-Premium Collection', icon: '🏆', packs: 15, bonus: 'promo' }
  if (/premium .*collection$|premium figure collection$/.test(n)) return { type: 'Premium Collection', icon: '💎', packs: 7, bonus: 'promo' }
  // Plain (non-premium) figure collection — a sculpted figure plus packs. After the premium
  // rule so "Crown Zenith Premium Figure Collection" keeps its richer type.
  if (/figure collection/.test(n))          return { type: 'Figure Collection', icon: '🗿', packs: 4, bonus: 'promo' }
  if (/build (&|and) battle/.test(n))       return { type: 'Build & Battle Box', icon: '⚔️', packs: 4, bonus: 'promo' }
  if (/elite trainer box$/.test(n))         return { type: 'Elite Trainer Box', icon: '📦', packs: 9, bonus: 'promo' }
  // Half Booster Box — a retail half-size box (18 packs). Must precede the full Booster Box rule
  // because the singular "Half Booster Box" also ends in "booster box".
  if (/half booster box(es)?$/.test(n)) return { type: 'Half Booster Box', icon: '🗃️', packs: 18, bonus: null }
  if (/booster box$/.test(n))               return { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null }
  if (/booster bundle$/.test(n))            return { type: 'Booster Bundle', icon: '🎟️', packs: 6, bonus: null }
  if (/surprise box$/.test(n))              return { type: 'Surprise Box', icon: '🎁', packs: 8, bonus: 'promo' }
  if (/mini tin/.test(n))                   return { type: 'Mini Tin', icon: '🥫', packs: 2, bonus: 'promo' }
  // GX/EX-era collector TINS (Team Up TAG TEAM tin, Triple Power tin, etc.): ~3 packs + a promo.
  if (/\btin\b/.test(n))                    return { type: 'Tin', icon: '🥫', packs: 3, bonus: 'promo' }
  // Real SV 3-pack blisters ship a fixed coin/energy/checklane card, not a hit-tier promo.
  if (/3-pack blister|three pack blister/.test(n)) return { type: '3-Pack Blister', icon: '🪟', packs: 3, bonus: null }
  if (/2-pack blister|two pack blister/.test(n))   return { type: '2-Pack Blister', icon: '🪟', packs: 2, bonus: 'promo' }
  // A single-pack blister: one booster + a fixed promo card.
  if (/single pack blister|1-pack blister|single booster/.test(n)) return { type: 'Blister', icon: '🪟', packs: 1, bonus: 'promo' }
  // Premium Checklane Blister — a checkout-lane blister that ships a booster + a guaranteed foil promo.
  // Precedes the plain checklane→Sleeved Pack rule so it keeps its promo.
  if (/premium checklane|checklane blister/.test(n)) return { type: 'Premium Checklane Blister', icon: '🪟', packs: 1, bonus: 'promo' }
  if (/sleeved booster( pack)?$|checklane/.test(n))   return { type: 'Sleeved Pack', icon: '🛡️', packs: 1, bonus: null }
  // "<Pokémon> ex Box" / "V Box" / "VMAX Box" — a small box built around a chase card.
  if (/\bex box$|\bv box$|\bvmax box$|\bvstar box$/.test(n)) return { type: 'ex Box', icon: '🎁', packs: 4, bonus: 'promo' }
  if (/booster( pack)?$/.test(n))           return { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null }
  // CATCH-ALL: survived hard-reject but matched no known type. Tag `_guessed`.
  return guessProduct(n)
}

// Best-effort classifier for an unrecognized (but non-rejected) sealed product.
function guessProduct(n) {
  if (/\bbox$|\bbox\b/.test(n))                 return { type: 'Box', icon: '📦', packs: 4, bonus: null, _guessed: true }
  if (/collection$|\bcollection\b|\btin\b/.test(n)) return { type: 'Collection', icon: '🧰', packs: 3, bonus: null, _guessed: true }
  if (/blister|\bpack(s)?\b/.test(n))           return { type: 'Blister', icon: '🪟', packs: 2, bonus: null, _guessed: true }
  return { type: 'Sealed Product', icon: '🎴', packs: 1, bonus: null, _guessed: true }
}

// Pull-rate model for modern Scarlet & Violet / Mega Evolution era English packs.
// RARE slot — "Rare or higher". Probabilities sum to ~1; remainder is Rare Holo.
const RARE_SLOT = [
  { rarity: 'Double Rare', p: 0.1405 },   // ex — 14.05% (1 in 7)
  { rarity: 'Ultra Rare',  p: 0.0651 },   // full art — 6.51% (1 in 15)
]
// REVERSE slot — normally an ordinary reverse holo, occasionally upgraded.
const REVERSE_SLOT = [
  { rarity: 'Illustration Rare',          p: 0.0752 }, // 7.52% (1 in 13)
  { rarity: 'Special Illustration Rare',  p: 0.0301 }, // 3.01% (1 in 33)
  { rarity: 'Hyper Rare',                 p: 0.0185 }, // 1.85% (1 in 54)
  { rarity: 'Mega Hyper Rare',            p: 0.0035 }, // chase — ~1 in 285
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Retry/pacing knobs. Defaults are tuned for a HEALTHY api.pokemontcg.io. When it is having
// a bad day (it periodically serves 500/502 for a majority of requests, unrelated to rate
// limits — there is no 429 and no ratelimit header in sight), raise them:
//
//   FETCH_RETRIES=12 FETCH_BACKOFF_MS=3000 SET_DELAY_MS=2000 npm run fetch-data
//
// Going slower genuinely helps there: the failures are bursty, so waiting longer between
// attempts is worth far more than hammering faster.
const RETRIES = Number(process.env.FETCH_RETRIES || 8)
const BACKOFF_MS = Number(process.env.FETCH_BACKOFF_MS || 1500)
const SET_DELAY_MS = Number(process.env.SET_DELAY_MS || 200)

// Exponential backoff with jitter, capped at 30s. Exponential matters when the far end is
// DOWN rather than throttling us: the old linear ramp spent its 5 attempts inside ~18s and
// gave a struggling server no room to recover. Jitter keeps retries from lock-stepping.
function backoffMs(attempt) {
  const base = Math.min(BACKOFF_MS * 2 ** (attempt - 1), 30_000)
  return Math.round(base + Math.random() * base * 0.3)
}

// Generic JSON fetcher with retry/backoff. Sends a browser UA because tcgcsv.com
// rejects the default Node fetch UA.
async function getJSON(url, extraHeaders = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json',
    ...extraHeaders,
  }
  let lastErr = 'unknown'
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt) await sleep(backoffMs(attempt))
    let res
    try {
      res = await fetch(url, { headers })
    } catch (e) { // network blip (ECONNRESET, timeout) — back off and retry
      lastErr = e.message
      continue
    }
    if (res.ok) {
      // A 200 is NOT proof of a good body. Cloudflare in front of pokemontcg.io answers 200
      // with the text "error code: 502" during an outage, and res.json() then threw a
      // SyntaxError that escaped this loop entirely — killing the whole set on the first
      // attempt without ever retrying. Parse defensively and treat a junk body as transient.
      const text = await res.text()
      try { return JSON.parse(text) } catch {
        lastErr = `HTTP 200 but the body was not JSON ("${text.slice(0, 40).trim()}")`
        continue
      }
    }
    lastErr = `HTTP ${res.status}`
    // Retry transient statuses: 429 rate-limit, 5xx gateway errors, and a 404 (pokemontcg.io
    // intermittently 404s a valid set's cards endpoint under load — a real miss survives all retries).
    if (res.status === 429 || res.status >= 500 || res.status === 404) continue
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error(`gave up after ${RETRIES} attempts (last: ${lastErr}) ${url}`)
}

// --- pokemontcg.io helpers ---------------------------------------------------
const PTCGIO = 'https://api.pokemontcg.io/v2'
// POKEMONTCG_IO_KEY is honoured if set, but free keys are no longer issued (see the header
// note). Unauthenticated is ~1000 requests/day, and a full run is ~350 — so the key only ever
// mattered if you refetched several times in one day.
let PTCGIO_HEADERS = {}

// Prefer holofoil-type finishes for the headline price; fall back to normal/reverse.
// Higher rank = lower preference (0 = best).
const FINISH_RANK = {
  '1stEditionHolofoil': 0,
  'unlimitedHolofoil':  1,
  '1stEdition':         2,
  'unlimited':          3,
  'holofoil':           4,
  'Holofoil':           4, // TCGCSV finish name variant
  'normal':             5,
  'Normal':             5,
  'reverseHolofoil':    6,
  'Reverse Holofoil':   6,
}

// Best USD price across all finish keys present on a pokemontcg.io card's tcgplayer block.
// Returns the market price of the highest-ranked finish (prefer holo over normal over reverse).
function bestTcgplayerPrice(tcgplayer) {
  if (!tcgplayer?.prices) return null
  let best = null
  let bestRank = Infinity
  for (const [finish, prices] of Object.entries(tcgplayer.prices)) {
    const m = prices?.market
    if (m == null) continue
    const rank = FINISH_RANK[finish] ?? 7
    if (rank < bestRank || (rank === bestRank && m > (best ?? 0))) {
      best = m
      bestRank = rank
    }
  }
  return best
}

// USD price from a pokemontcg.io card. Prefers tcgplayer (already USD);
// falls back to cardmarket EUR→USD if tcgplayer has nothing.
function cardUSD(card) {
  const tcg = bestTcgplayerPrice(card.tcgplayer)
  if (tcg != null) return round2(tcg)
  const cm = card.cardmarket?.prices
  if (cm) {
    const eur = cm.avg7 ?? cm.avg30 ?? cm.trendPrice ?? cm.averageSellPrice
    if (eur != null) return round2(eur * EUR_USD)
  }
  return null
}

// Fetch all cards for a pokemontcg.io set, paging 250 at a time.
async function fetchPtcgioCards(setId) {
  const cards = []
  let page = 1
  let totalCount = null
  do {
    const j = await getJSON(`${PTCGIO}/cards?q=set.id:${setId}&pageSize=250&page=${page}`, PTCGIO_HEADERS)
    if (totalCount === null) totalCount = j.totalCount ?? 0
    if (!j.data?.length) break // guard: API said totalCount>0 but returned an empty page
    cards.push(...j.data)
    page++
  } while (cards.length < totalCount)
  return cards
}

// Fetch set metadata (name, series, releaseDate, logo, symbol, printedTotal, total).
async function fetchPtcgioSet(setId) {
  try {
    const j = await getJSON(`${PTCGIO}/sets/${setId}`, PTCGIO_HEADERS)
    return j.data || {}
  } catch { return {} }
}

// --- TCGCSV helpers (unchanged from original) --------------------------------

// Fetch SINGLE-card prices for a TCGCSV group → { collectorNumber: price }.
// Prefer Holofoil → Normal → Reverse Holo to match the headline finish.
async function fetchSingles(groupId) {
  if (!groupId) return {}
  let prods, prices
  try {
    prods = (await getJSON(`${TCGCSV}/${groupId}/products`)).results || []
    prices = (await getJSON(`${TCGCSV}/${groupId}/prices`)).results || []
  } catch (e) {
    console.log(`    (singles fetch failed for group ${groupId}: ${e.message})`)
    return {}
  }
  const bestByProduct = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (!m) continue
    const rank = FINISH_RANK[pr.subTypeName] ?? 9
    const cur = bestByProduct[pr.productId]
    if (!cur || rank < cur.rank) bestByProduct[pr.productId] = { price: m, rank }
  }
  const byNumber = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (!ext.Number) continue
    // Skip Code Cards — digital redemption rows, not collectibles.
    if (ext.Rarity === 'Code Card') continue
    const best = bestByProduct[p.productId]
    if (!best) continue
    const num = String(ext.Number).split('/')[0].replace(/^0+/, '') || '0'
    const price = Math.round(best.price * 100) / 100
    if (byNumber[num] == null || price > byNumber[num]) byNumber[num] = price
  }
  return byNumber
}

// Fetch + classify sealed products for a TCGCSV group. Returns EVERY sellable product,
// one entry each.
//
// This used to return one entry per product TYPE, keeping the cheapest — so a set with six
// real Elite Trainer Boxes shipped one, and always the worst one. That single rule discarded
// ~633 products across the mapped groups. The shop now carries the full lineup, so dedup by
// productId (i.e. not at all) and let the shop UI group them.
async function fetchSealed(groupId) {
  if (!groupId) return []
  let prods, prices
  try {
    prods = (await getJSON(`${TCGCSV}/${groupId}/products`)).results || []
    prices = (await getJSON(`${TCGCSV}/${groupId}/prices`)).results || []
  } catch (e) {
    console.log(`    (sealed fetch failed for group ${groupId}: ${e.message})`)
    return []
  }
  const priceById = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (m && (priceById[pr.productId] == null)) priceById[pr.productId] = m
  }
  const out = []
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (ext.Number) continue                 // single card — skip
    if (p.presaleInfo?.isPresale) continue   // announced but not on shelves yet
    const cls = classifyProduct(p.name)
    if (!cls) continue
    const price = priceById[p.productId]
    if (price == null) continue
    // The publisher's own contents blurb beats the name-based guess on pack count — a
    // "Premium Collection" is 6 packs in one set and 12 in another, and only this knows.
    // `bonus` keeps the curated classifier value when it has one: applyPromoMap pins real
    // researched promo cards onto those types, and the blurb can't improve on that.
    const parsed = parseContents(ext.CardText)
    out.push({
      type: cls.type,
      icon: cls.icon,
      packs: parsed?.packs ?? cls.packs,
      bonus: cls.bonus ?? parsed?.bonus ?? null,
      name: p.name,
      price: Math.round(price * 100) / 100,
      tcgId: p.productId,
      _guessed: cls._guessed || undefined,
      _parsed: parsed ? true : undefined,   // build-only: did CardText give us the count?
      _text: parsed?.text,                  // build-only: era resolution reads this
      _named: parsed?.namedSets?.length ? parsed.namedSets : undefined, // build-only
    })
  }
  // Keep the build-only tags (`_guessed`, `_parsed`, `_text`, `_named`) so main()'s per-set
  // log can flag heuristic types; main() strips every underscore key before writing
  // sets.json (the vintage/JP paths strip it inline instead).
  return sortProducts(out)
}

// --- TCGdex helpers (last-resort fallback only) ------------------------------
const TCGDEX = 'https://api.tcgdex.net/v2/en'
// Our set id → TCGdex set id. Only lists the ones that differ.
const TCGDEX_ID = {
  me5:      'me05',
  me4:      'me04',
  me3:      'me03',
  me2pt5:   'me02.5',
  me2:      'me02',
  me1:      'me01',
  zsv10pt5: 'sv10.5b',
  rsv10pt5: 'sv10.5w',
  sv8pt5:   'sv08.5',
  sv3pt5:   'sv03.5',  // 151 — TCGdex uses sv03.5
  base6:    'lc',
}

// Lazily-populated map: setId → { localId → { price, img } }
// Built on first miss for a set, then cached so we don't re-fetch per-card.
const tcgdexCache = {}

async function fetchTcgdexSetIndex(setId) {
  const tdId = TCGDEX_ID[setId] || setId
  if (tcgdexCache[setId]) return tcgdexCache[setId]
  let cards
  try {
    const j = await getJSON(`${TCGDEX}/sets/${tdId}`)
    cards = j.cards || []
  } catch { tcgdexCache[setId] = {}; return {} }
  // cards is [{ id, localId, image, name }] — id is "tdSetId-localId"
  // We need to look up by collector number (= localId stripped of leading zeros).
  const byNum = {}
  for (const c of cards) {
    // localId may be "001" or "1" or "100a" — strip leading zeros for numeric ones
    const num = String(c.localId).replace(/^0+(?=\d)/, '') || c.localId
    byNum[num] = { tdCardId: c.id, image: c.image }
  }
  tcgdexCache[setId] = byNum
  return byNum
}

// Fetch price + image for a single card from TCGdex.
// Returns { price, img } where price is USD (tcgplayer marketPrice preferred, else cardmarket EUR→USD).
async function tcgdexCard(setId, number) {
  const idx = await fetchTcgdexSetIndex(setId)
  const num = String(number).replace(/^0+(?=\d)/, '') || number
  const entry = idx[num]
  if (!entry) return null
  let j
  try { j = await getJSON(`${TCGDEX}/cards/${entry.tdCardId}`) } catch { return null }
  if (!j || j.status === 404) return null
  // Price: prefer tcgplayer USD market; fall back to cardmarket EUR avg7 → avg30 → trend → avg
  let price = null
  const tp = j.pricing?.tcgplayer
  if (tp) {
    // finish keys: normal, holofoil, reverse-holofoil, 1st-edition-holofoil, unlimited-holofoil, etc.
    let best = null, bestRank = Infinity
    for (const [finish, data] of Object.entries(tp)) {
      if (finish === 'unit' || finish === 'updated') continue
      const m = data?.marketPrice
      if (m == null) continue
      // Map TCGdex finish names to FINISH_RANK roughly
      const normFinish = finish.includes('1st') ? '1stEditionHolofoil'
        : finish.includes('holo') ? 'holofoil'
        : finish.includes('reverse') ? 'reverseHolofoil'
        : 'normal'
      const rank = FINISH_RANK[normFinish] ?? 7
      if (rank < bestRank || (rank === bestRank && m > (best ?? 0))) { best = m; bestRank = rank }
    }
    if (best != null) price = round2(best)
  }
  if (price == null) {
    const cm = j.pricing?.cardmarket
    if (cm) {
      const eur = cm.avg7 ?? cm.avg30 ?? cm.trend ?? cm.avg
      if (eur != null) price = round2(eur * EUR_USD)
    }
  }
  // Image: TCGdex gives a base URL; append /high.webp for large
  const img = entry.image ? `${entry.image}/high.webp` : null
  return { price, img }
}

// eBay sold-comps monotonicity filter. Drops any comp that violates
// the rule "higher grade must be worth more than raw or any lower grade".
function sanitizePsa(psa, price) {
  if (!psa) return null
  const raw = price ?? 0
  const out = {}
  let prev = raw
  for (let g = 1; g <= 10; g++) {
    const v = psa[String(g)]
    if (v == null) continue
    if (v >= prev) { out[g] = v; prev = v }
  }
  return Object.keys(out).length ? out : null
}

function round2(n) { return Math.round(n * 100) / 100 }

// Build one English set using pokemontcg.io as the primary source, TCGCSV for
// sealed products and singles fallback, TCGdex as last-resort per-card fallback.
async function fetchEnglishSet(cfg, psaMap) {
  // 1. Set metadata from pokemontcg.io
  const meta = await fetchPtcgioSet(cfg.id)

  // 2. All cards from pokemontcg.io (paged). `alsoFetch` merges sibling source sets into
  //    this one (e.g. Celebrations' Classic Collection subset) so the set is complete.
  const rawCards = await fetchPtcgioCards(cfg.id)
  for (const extraId of (cfg.alsoFetch || [])) {
    const extra = await fetchPtcgioCards(extraId)
    console.log(`    +${extra.length} cards merged from ${extraId}`)
    rawCards.push(...extra)
  }

  // 3. Build card objects. Skip Code Cards — digital redemption rows, not collectibles.
  const cards = []
  for (const raw of rawCards) {
    if (raw.rarity === 'Code Card') continue
    const price = cardUSD(raw)
    const img = raw.images?.small || null
    const imgLarge = raw.images?.large || null
    cards.push({
      id: raw.id, // e.g. "me4-1" — already matches our id format
      name: raw.name,
      number: String(raw.number),
      rarity: RARITY_ID_OVERRIDE[raw.id] || mapRarity(raw.rarity),
      supertype: raw.supertype || 'Pokémon',
      img,
      imgLarge,
      price,
      _needsPrice: price == null,
      _needsImg: !img,
    })
  }

  // 4. TCGCSV singles fallback: fill cards still missing a price
  const missingPrice = cards.filter(c => c._needsPrice)
  let tcgcsvSingles = null
  if (missingPrice.length && SET_GROUP[cfg.id]) {
    tcgcsvSingles = await fetchSingles(SET_GROUP[cfg.id])
    let filled = 0
    for (const c of missingPrice) {
      const key = String(c.number).replace(/^0+/, '') || '0'
      if (tcgcsvSingles[key] != null) { c.price = tcgcsvSingles[key]; c._needsPrice = false; filled++ }
    }
    if (filled) console.log(`    singles fallback: filled ${filled}/${missingPrice.length} from TCGCSV`)
  }

  // 5. TCGdex last-resort: fill cards still missing price OR image
  const needsTcgdex = cards.filter(c => c._needsPrice || c._needsImg)
  if (needsTcgdex.length) {
    let tdPriceFilled = 0, tdImgFilled = 0
    for (const c of needsTcgdex) {
      const td = await tcgdexCard(cfg.id, c.number)
      if (!td) continue
      if (c._needsPrice && td.price != null) { c.price = td.price; c._needsPrice = false; tdPriceFilled++ }
      if (c._needsImg && td.img) { c.img = td.img; c.imgLarge = td.img; c._needsImg = false; tdImgFilled++ }
      await new Promise(r => setTimeout(r, 80)) // light politeness for per-card calls
    }
    if (tdPriceFilled || tdImgFilled) console.log(`    TCGdex fallback: +${tdPriceFilled} prices, +${tdImgFilled} images`)
  }

  // 6. Attach prior PSA comps (re-sanitized against the new price).
  // c.id is the pokemontcg.io id (e.g. "me3-94"); the map also has a "setId-number" key
  // as a fallback for cards whose old id used a paid-API prefix (e.g. "POR-94").
  for (const c of cards) {
    const numKey = `${cfg.id}-${String(c.number).replace(/^0+/, '') || c.number}`
    const priorPsa = psaMap[c.id] || psaMap[numKey]
    if (priorPsa) {
      const clean = sanitizePsa(priorPsa, c.price)
      if (clean) c.psa = clean
    }
  }

  // 7. Strip build-only flags
  for (const c of cards) { delete c._needsPrice; delete c._needsImg }

  // 8. Sealed products from TCGCSV (primary; pokemontcg.io has no products endpoint)
  let products = SET_GROUP[cfg.id] ? await fetchSealed(SET_GROUP[cfg.id]) : []

  return { cards, products, meta }
}


// Canonical display order for product types.
const PRODUCT_ORDER = ['Booster Pack','Sleeved Pack','Premium Checklane Blister','2-Pack Blister','3-Pack Blister','Mini Tin',
  'Booster Bundle','Poster Collection','Pin Collection','Tech Sticker Collection','Binder Collection','Figure Collection',
  'ex Box','Elite Trainer Box','Pokémon Center Elite Trainer Box','Premium Collection','Super-Premium Collection','Ultra Premium Collection','Surprise Box','Half Booster Box','Booster Box',
  'Box','Collection','Blister','Sealed Product']
// Within a type, cheapest first — the shop reads top-down, and with the dedup lifted a type
// can now hold a dozen rows.
function sortProducts(arr) {
  const rank = t => { const i = PRODUCT_ORDER.indexOf(t); return i === -1 ? PRODUCT_ORDER.length : i }
  return arr.sort((a, b) => rank(a.type) - rank(b.type) || a.price - b.price)
}

// --- Cross-set ("era") product ------------------------------------------------
// TCGplayer groups that are NOT a set. Every Ultra Premium Collection lives in one, and the
// packs inside come from a whole era rather than a single expansion — a Charizard UPC holds
// "16 booster packs from the Sword & Shield Series", drawn from whatever The Pokémon Company
// was packing that month. The reviewer who opened one got 3 Evolving Skies, 3 Fusion Strike,
// 3 Astral Radiance, 3 Brilliant Stars, 2 Lost Origin, 1 Vivid Voltage and 1 Darkness Ablaze,
// and reported that the mix varies between boxes — one box even held 17 packs, not 16.
//
// So these products carry no setId. They carry `pool: { series }`, and the engine draws their
// packs at rip time. See eraPool / drawPackSets in src/game/engine.js.
const PRODUCT_GROUPS = [
  2374, // Miscellaneous Cards & Products — where every UPC and most premium collections live
]

// A group whose publishedOn is in the future is announced but not released (30th Celebration
// publishes 2026-09-16). Its products already list on TCGplayer as presales, and they must
// not reach the shop.
async function releasedGroupIds() {
  try {
    const { results = [] } = await getJSON(`${TCGCSV}/groups`)
    const now = Date.now()
    const ok = new Set()
    for (const g of results) {
      if (!g.publishedOn || Date.parse(g.publishedOn) <= now) ok.add(g.groupId)
    }
    return ok
  } catch (e) {
    console.log(`  (group list fetch failed: ${e.message} — skipping era products)`)
    return null
  }
}

// Series (era) from our set id, for the sets pokemontcg.io hasn't tagged yet — Journey
// Together (sv9) currently comes back with no `series` at all. The shop now groups its whole
// shelf Era → Set, so an untagged set would sit alone in an "Other" bucket next to its own
// siblings. Ordered longest-prefix first so `swsh` beats `sw`, `me` doesn't swallow others.
const SERIES_BY_PREFIX = [
  ['zsv', 'Scarlet & Violet'], ['rsv', 'Scarlet & Violet'], ['swsh', 'Sword & Shield'],
  ['hgss', 'HeartGold & SoulSilver'], ['ecard', 'E-Card'], ['cel', 'Other'], ['col', 'Other'],
  ['sv', 'Scarlet & Violet'], ['me', 'Mega Evolution'], ['sm', 'Sun & Moon'], ['xy', 'XY'],
  ['bw', 'Black & White'], ['dp', 'Diamond & Pearl'], ['pl', 'Platinum'], ['neo', 'Neo'],
  ['gym', 'Gym'], ['base', 'Base'], ['ex', 'EX'], ['pop', 'POP'],
]
function seriesFromId(id) {
  const s = String(id || '').toLowerCase()
  for (const [prefix, series] of SERIES_BY_PREFIX) if (s.startsWith(prefix)) return series
  return null
}

// Build the cross-set product list. A product only survives if BOTH are true:
//   1. CardText states a real pack count — otherwise we have no idea what it rips.
//   2. We can name its era — otherwise there is no pool to draw from, and guessing an era
//      would put Base Set packs inside a modern collection.
async function fetchEraProducts() {
  const released = await releasedGroupIds()
  if (!released) return []
  const out = []
  let noPacks = 0, noEra = 0
  for (const groupId of PRODUCT_GROUPS) {
    if (!released.has(groupId)) { console.log(`  skipping unreleased group ${groupId}`); continue }
    const prods = await fetchSealed(groupId)
    for (const p of prods) {
      if (!p._parsed || !p.packs) { noPacks++; continue }
      // Copy that names its expansions outright is NOT an era product — it belongs to
      // those sets, and a set-scoped fetch already has it.
      if (p._named) continue
      const series = productEra(p.name, p._text || '')
      if (!series) { noEra++; continue }
      out.push({ type: p.type, icon: p.icon, packs: p.packs, bonus: p.bonus,
        name: p.name, price: p.price, tcgId: p.tcgId, pool: { series } })
    }
  }
  console.log(`  era products: ${out.length} kept · ${noPacks} with no pack count · ${noEra} with no resolvable era`)
  const byEra = {}
  for (const p of out) byEra[p.pool.series] = (byEra[p.pool.series] || 0) + 1
  for (const [k, v] of Object.entries(byEra).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
  return out.sort((a, b) => b.price - a.price)
}

// Choose the vintage "heavy pack" product. Prefer a real sealed Booster Pack price;
// otherwise fall back to a market-plausible vintage pack ask.
// Picks the CHEAPEST single pack: the dedup used to guarantee that, and without it the
// first 1-pack row in the list could be a $3,750 outlier.
function pickVintagePack(products) {
  const singles = products.filter(p => p.packs === 1)
  const realPack = singles.length ? singles.reduce((a, b) => (b.price < a.price ? b : a)) : null
  const price = realPack ? Math.max(realPack.price, 250) : 600
  return {
    type: 'Vintage Booster Pack', icon: '🗝️', packs: 1, bonus: null, vintage: true,
    name: realPack?.name,
    price: Math.round(price * 100) / 100,
    tcgId: realPack?.tcgId,
  }
}

async function main() {
  // Wire a pokemontcg.io key from env if one is set. Free keys are no longer issued; running
  // without one is the normal, supported path.
  const ptcgKey = process.env.POKEMONTCG_IO_KEY?.trim()
  if (ptcgKey) { PTCGIO_HEADERS = { 'X-Api-Key': ptcgKey }; console.log('Using POKEMONTCG_IO_KEY.') }
  console.log(`Pacing: ${RETRIES} retries · ${BACKOFF_MS}ms base backoff · ${SET_DELAY_MS}ms between sets.`)

  // Load prior PSA comps from existing sets.json (preserved — free sources have no PSA data).
  // Primary key: card id (e.g. "me4-90"). Secondary key: "setId-number" for any card whose
  // old id used a non-standard prefix (e.g. the paid source emitted "POR-94" for me3 card #94).
  const psaMap = {}
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const existing = JSON.parse(await readFile(join(here, '../src/data/sets.json'), 'utf8'))
    for (const s of (existing.sets || [])) {
      for (const c of (s.cards || [])) {
        if (!c.psa) continue
        psaMap[c.id] = c.psa
        // Also index by canonical setId-number so paid-API ids (e.g. "POR-94") survive a
        // source swap. Only register the fallback key when the existing id uses a different prefix.
        const numKey = `${s.id}-${String(c.number).replace(/^0+/, '') || c.number}`
        if (numKey !== c.id) psaMap[numKey] = c.psa
      }
    }
    console.log(`Loaded ${Object.keys(psaMap).length} prior PSA comps from sets.json.`)
  } catch { console.log('No existing sets.json — starting fresh (no prior PSA comps).') }

  // Scoped fetch: ONLY=sm9,xy10,… fetches just those sets. Every write is merge-
  // preserving now (sets not in this run are always carried forward), so MERGE=1 is
  // no longer needed — ONLY just narrows how much gets re-fetched/re-priced.
  const onlyIds = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
  const setsToFetch = onlyIds.length ? EN_SETS.filter(s => onlyIds.includes(s.id)) : EN_SETS
  if (onlyIds.length) console.log(`Scoped fetch: ${setsToFetch.map(s => s.id).join(', ')}`)

  console.log(`Fetching ${setsToFetch.length} English sets from pokemontcg.io + TCGCSV…`)

  const out = []
  const failedCfgs = []
  // Two passes. The far end's failures are BURSTY — a set that dies during a bad minute
  // usually succeeds a few minutes later — and a failed set silently keeps its stale copy,
  // which is the worst possible outcome to leave unretried.
  await fetchPass(setsToFetch, out, failedCfgs, psaMap)
  if (failedCfgs.length) {
    const again = failedCfgs.splice(0, failedCfgs.length)
    console.log(`\n↻ Retry pass — ${again.length} set(s) failed the first time: ${again.map(c => c.id).join(', ')}`)
    await sleep(5000)
    await fetchPass(again, out, failedCfgs, psaMap)
  }
  await finishRun(out, failedCfgs, setsToFetch)
}

async function fetchPass(list, out, failedCfgs, psaMap) {
  for (const cfg of list) {
   try {
    console.log(`  ${cfg.name} (${cfg.id})…`)
    const { cards, products: rawProducts, meta } = await fetchEnglishSet(cfg, psaMap)

    let products = rawProducts

    // Prismatic SPC always ships the Eevee ex Black Star Promo (svp-174) — its own promo print,
    // above the in-set base ex and well below the #167 SIR alt art (which is a pack-only chase,
    // never boxed; see promoEligible in engine.js).
    if (cfg.id === 'sv8pt5') {
      for (const spc of products.filter(p => p.type === 'Super-Premium Collection')) spc.fixedPromo = 'svp-174'
    }
    // Stamp researched real ETB / Build & Battle promos onto this set's products.
    applyPromoMap(cfg.id, products)

    // Vintage sets sell ONE marked-up heavy pack via the Vault, never in the shop.
    if (cfg.vintage) {
      const vp = pickVintagePack(products)
      vp.name = vp.name || `${cfg.name} Booster Pack`
      products = [vp]
      console.log(`    vintage pack: ${vp.name} @ $${vp.price}`)
    } else {
      // With the dedup lifted a set carries many products, so log a type histogram rather
      // than one line per row.
      const byType = {}
      for (const p of products) byType[p.type] = (byType[p.type] || 0) + 1
      const label = Object.entries(byType).map(([t, n]) => (n > 1 ? `${t}×${n}` : t)).join(', ') || 'none'
      console.log(`    sealed: ${products.length} product(s) — ${label}`)
      const fromText = products.filter(p => p._parsed).length
      console.log(`    pack counts: ${fromText} from CardText, ${products.length - fromText} from the name`)
      const guessed = products.filter(p => p._guessed)
      if (guessed.length) console.log(`    ⚠️  ${guessed.length} guessed product type(s): ${guessed.slice(0, 8).map(p => `"${p.name}"→${p.type}/${p.packs}pk`).join('; ')}${guessed.length > 8 ? ` …+${guessed.length - 8}` : ''}`)
    }
    // Strip every build-only underscore tag (_guessed, _parsed, _text, _named).
    products = products.map(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_'))))

    const priced = cards.filter(c => c.price != null).length
    const withPsa = cards.filter(c => c.psa).length
    console.log(`    ${cards.length} cards (${priced} priced, ${withPsa} w/ PSA comps)`)

    out.push({
      id: cfg.id,
      name: cfg.name,
      series: meta.series || seriesFromId(cfg.id) || (cfg.vintage ? 'Vintage' : undefined),
      releaseDate: meta.releaseDate,
      printedTotal: meta.printedTotal || cards.length,
      total: meta.total || cards.length,
      logo: meta.images?.logo,
      symbol: meta.images?.symbol,
      vintage: cfg.vintage || undefined,
      secondary: cfg.secondary || undefined,
      extra: cfg.extra || undefined,
      cards,
      products,
    })
    await sleep(SET_DELAY_MS)
   } catch (e) {
    // A single set's transient API failure (a 404 under load, a schema hiccup) must NOT
    // abort the whole run. Skip it — the validation gate below carries forward the prior
    // snapshot's copy if one exists; a brand-new set that fails can be re-fetched via ONLY=.
    console.log(`  ⚠️  ${cfg.name} (${cfg.id}) failed: ${e.message} — skipping this set`)
    failedCfgs.push(cfg)
   }
  }
}

async function finishRun(out, failedCfgs, setsToFetch) {

  // Fold the freshly-fetched sets into the existing snapshot. This is ALWAYS
  // merge-preserving now: sets in the prior snapshot that this run didn't fetch
  // (e.g. the WOTC legacy sets written by fetch-legacy.mjs) are kept, never
  // silently deleted — the old non-merge mode wiped every set outside EN_SETS.
  let prevMeta = null
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    prevMeta = JSON.parse(await readFile(join(here, '../src/data/sets.json'), 'utf8'))
  } catch { /* first ever run — nothing to preserve */ }
  const prevById = new Map((prevMeta?.sets || []).map(s => [s.id, s]))

  // Validation gate: a set that fetched EMPTY (API regression, schema change) must not
  // replace a good prior copy — an empty set crashes openPack at runtime. Keep the old
  // data and say so loudly. A set that shrank >30% is suspicious too: keep the fetch
  // (real rotations happen) but flag it for eyeballing.
  const validated = []
  for (const s of out) {
    const prev = prevById.get(s.id)
    if (!s.cards.length) {
      if (prev?.cards?.length) {
        console.log(`  ⚠️  ${s.id} fetched EMPTY — keeping the previous snapshot's ${prev.cards.length} cards`)
        validated.push(prev)
      } else {
        console.log(`  ⚠️  ${s.id} fetched EMPTY and has no prior copy — SKIPPING (would crash openPack)`)
      }
      continue
    }
    if (prev?.cards?.length && s.cards.length < prev.cards.length * 0.7) {
      console.log(`  ⚠️  ${s.id} shrank ${prev.cards.length} → ${s.cards.length} cards — keeping the fetch, but verify this is a real change`)
    }
    validated.push(s)
  }
  const fetchedIds = new Set(validated.map(s => s.id))
  const carried = (prevMeta?.sets || []).filter(s => !fetchedIds.has(s.id))
  const finalSets = [...carried, ...validated]
  if (carried.length) console.log(`Carried ${carried.length} set(s) not in this run: ${carried.map(s => s.id).join(', ')}`)

  // Cross-set product (Ultra Premium Collections and friends). Fetched once, not per set,
  // because these belong to an ERA rather than an expansion. Carried forward from the prior
  // snapshot on failure, exactly like a set that 404s mid-run.
  console.log('Fetching cross-set (era) products…')
  let eraProducts = []
  try {
    eraProducts = await fetchEraProducts()
  } catch (e) {
    console.log(`  ⚠️  era product fetch failed: ${e.message}`)
  }
  if (!eraProducts.length && prevMeta?.eraProducts?.length) {
    eraProducts = prevMeta.eraProducts
    console.log(`  ⚠️  kept ${eraProducts.length} era product(s) from the previous snapshot`)
  }

  // Drop image URLs the runtime rebuilds from card id+number (engine.js cardImg) —
  // ~40% of the snapshot's raw bytes. Only exact-pattern matches are stripped;
  // idempotent for sets carried forward from an already-stripped snapshot.
  const imgStats = stripDerivableImages(finalSets)
  // Then drop everything else the runtime rebuilds or already defaults (collector
  // numbers, the majority supertype, stray instance fields) — ~830 KB raw / 58 KB gzip.
  // MUST run AFTER the image strip: that one derives its URLs from `number`, which this
  // one then removes.
  const fieldStats = stripDerivableFields(finalSets)
  console.log(`Stripped derivable art URLs from ${imgStats.stripped}/${imgStats.total} cards (${imgStats.keptExplicit} keep explicit URLs).`)
  console.log(`Stripped ${fieldStats.numberStripped} derivable collector numbers, ${fieldStats.supertypeStripped} default supertypes, ${fieldStats.instanceStripped} stray instance fields.`)
  if (fieldStats.refused.length) {
    console.warn(`⚠️  ${fieldStats.refused.length} catalog card(s) carry REAL per-copy state — left alone, but that is a data bug:`,
      fieldStats.refused.slice(0, 5))
  }

  await mkdir('src/data', { recursive: true })
  await writeFile('src/data/sets.json', JSON.stringify({
    fetchedAt: new Date().toISOString(),
    rareSlot: prevMeta?.rareSlot || RARE_SLOT,
    reverseSlot: prevMeta?.reverseSlot || REVERSE_SLOT,
    sets: finalSets,
    eraProducts,
  }, null, 0))
  const totalCards = finalSets.reduce((a, s) => a + s.cards.length, 0)
  const totalProd = finalSets.reduce((a, s) => a + (s.products?.length || 0), 0)
  const totalPsa = finalSets.reduce((a, s) => a + s.cards.filter(c => c.psa).length, 0)
  console.log(`Wrote src/data/sets.json — ${finalSets.length} sets, ${totalCards} cards, ${totalProd} sealed products, ${eraProducts.length} era products, ${totalPsa} cards w/ PSA comps.`)

  // 🔴 STALE-DATA REPORT. A set that failed every attempt keeps its PREVIOUS copy, so the run
  // finishes "successfully" while quietly shipping old data. During an api.pokemontcg.io
  // outage that can be most of the snapshot, and nothing above says so. Say it here, loudly,
  // and exit nonzero so a scripted run can't mistake a partial refresh for a full one.
  if (failedCfgs.length) {
    const ids = failedCfgs.map(c => c.id)
    console.log('')
    console.log(`🔴 ${failedCfgs.length} of ${setsToFetch.length} set(s) FAILED and kept their previous data — this snapshot is PARTIAL.`)
    console.log(`   stale: ${ids.join(', ')}`)
    console.log(`   Re-run just those once the API recovers:`)
    console.log(`     ONLY=${ids.join(',')} npm run fetch-data`)
    console.log(`   If most sets failed, api.pokemontcg.io is probably down rather than throttling you`)
    console.log(`   (it serves 500/502, never 429). Check, wait, and retry slower:`)
    console.log(`     FETCH_RETRIES=12 FETCH_BACKOFF_MS=3000 SET_DELAY_MS=2000 npm run fetch-data`)
    process.exitCode = 1
  } else {
    console.log(`✓ All ${setsToFetch.length} set(s) refreshed — no stale carry-over.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
