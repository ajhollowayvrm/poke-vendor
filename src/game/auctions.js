// 🔨 Auctions — the other way to sell online.
//
// A fixed-price listing is a question you ask the market: "will anyone pay this?" Price it
// too high and the answer is a permanent no — the card draws lookers forever and never
// sells. An auction inverts that: you don't name a price, you name a DEADLINE, and the
// room decides what it's worth. It always ends. What it ends AT is the gamble.
//
// What actually sets the hammer price is how many people showed up to bid. One lonely
// bidder buys it for a song; four people who all want it talk each other into a number
// above market. So an auction is really a bet on your own reach — and reach is notoriety.
// A nobody auctioning a chase card gets robbed; a known dealer auctioning the same card
// gets a bidding war. That makes this the one exit that gets structurally better as your
// name grows, rather than just paying out a bit more.
//
// The escape hatch is a RESERVE: a floor under the hammer. It costs you, and not in fees —
// bidders can see there's a reserve and a chunk of them won't engage with one at all, so
// setting a reserve thins the very room that sets your price. Protection you pay for in
// the currency that matters.
import { cardValue, round2 } from './engine'

// How long you can run one for. Longer runs pull more eyes (more chances for a bidder to
// wander in) but tie the card up — and the sim clock is days you could have been selling.
export const AUCTION_LENGTHS = [
  { days: 3, label: '3 days', blurb: 'Quick flip — fewer eyes, fast cash' },
  { days: 5, label: '5 days', blurb: 'The standard run' },
  { days: 7, label: '7 days', blurb: 'Widest reach — a full week of watchers' },
]

// Reserve options, as a multiple of market. `null` = no reserve (it sells at whatever it
// reaches, guaranteed). Each step up scares off more of the room — see reserveChill.
export const AUCTION_RESERVES = [
  { mult: null, label: 'No reserve', blurb: 'It sells, whatever it reaches. The biggest room.' },
  { mult: 0.7,  label: '70%',  blurb: 'A floor at 70% of market — mild chill on bidding' },
  { mult: 0.9,  label: '90%',  blurb: 'A floor near market — noticeably fewer bidders engage' },
  { mult: 1.1,  label: '110%', blurb: 'Above market. Most of the room walks; you often keep the card.' },
]

// A reserve visibly on the listing thins the bidder pool — nobody likes bidding into a
// number they can't see. Steeper reserve, colder room.
export function reserveChill(reserveMult) {
  if (!reserveMult) return 1
  return reserveMult >= 1.1 ? 0.45 : reserveMult >= 0.9 ? 0.65 : 0.85
}

// How many people actually turn up to bid. THE number that decides the hammer price.
// Scales with your name (reach), how long it ran, and how desirable the card is — a $600
// chase draws a crowd off its own merits; a $3 rare draws whoever happens to be browsing.
export function expectedBidders(card, noto, days, reserveMult, hypeDays = 0) {
  const value = cardValue(card)
  // Reach: 0★ pulls ~1 bidder, a well-known dealer 4-5. Deliberately brutal at the bottom —
  // an unknown seller's auction SHOULD go for a song, and that's the lesson.
  const reach = 0.9 + Math.min(3.6, Math.sqrt(Math.max(0, noto)) / 4.2)
  // Desirability: a real chase card brings its own audience.
  const draw = 1 + Math.min(1.1, Math.log10(Math.max(1, value)) / 2.4)
  const run = 0.78 + days * 0.055          // a longer run collects more wanderers
  const hype = hypeDays > 0 ? 1.25 : 1     // 🔴 post-stream afterglow packs the room
  return Math.max(0.2, reach * draw * run * hype * reserveChill(reserveMult))
}

// Draw an actual bidder count from the expectation (Poisson-ish, via a small sum so the
// tail stays sane), then let the top two bidders fight.
function drawBidders(expected, rnd = Math.random) {
  let n = 0
  const lam = Math.min(9, expected)
  // Sum of Bernoullis around the mean — same shape as a Poisson without the tail blowouts.
  for (let i = 0; i < 12; i++) if (rnd() < lam / 12) n++
  return n
}

// What a given number of bidders pays, as a multiple of market. This is the whole payoff
// curve: an auction with nobody in the room is worse than a quick-sell, and a packed room
// beats any fixed price you'd have dared to ask.
//   1 → ~0.60×  ·  2 → ~0.79×  ·  3 → ~0.91×  ·  4 → ~0.99×  ·  6 → ~1.10×  ·  9 → ~1.22×
// The second-highest bidder sets the price (that's how an ascending auction actually
// works), so each extra body has diminishing but real pull.
export function hammerMultiple(bidders, rnd = Math.random) {
  if (bidders <= 0) return 0
  const base = 0.60 + 0.40 * (1 - Math.exp(-(bidders - 1) / 2.6))
  // Every auction has its own weather — two stubborn bidders, or a quiet Tuesday night.
  const jitter = 1 + (rnd() + rnd() - 1) * 0.18
  return Math.max(0.28, base * jitter)
}

// Run the whole auction to its close and report what happened. Deterministic given `rnd`,
// so the day-tick can settle several at once and the UI can preview the odds.
export function settleAuction(a, noto, hypeDays = 0, rnd = Math.random) {
  const market = cardValue(a.card)
  const expected = expectedBidders(a.card, noto, a.days, a.reserve, hypeDays)
  const bidders = drawBidders(expected, rnd)
  const mult = hammerMultiple(bidders, rnd)
  const hammer = round2(market * mult)
  const reserveAt = a.reserve ? round2(market * a.reserve) : 0
  const met = bidders > 0 && hammer >= reserveAt
  return { bidders, hammer, market, mult, reserveAt, met }
}

// Watchers ticking up on a live auction — pure theatre for the Sell tab, but it's the
// theatre that tells you whether the room is filling before the hammer falls.
export function watcherDraw(card, noto, rnd = Math.random) {
  const expected = expectedBidders(card, noto, 5, null)
  return Math.max(0, Math.round(expected * (1.4 + rnd() * 1.9)))
}
