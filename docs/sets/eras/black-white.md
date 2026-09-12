# Black & White era (2011–2013)

This file holds the pack template that most English Black & White Series
sets share. Each set file under `docs/sets/` holds the data for one set
and records its exceptions. For the general approach, see
[../../13-sets.md](../../13-sets.md). For why pack order matters, see
[../../18-ripping.md](../../18-ripping.md#where-the-hit-sits).

## Sets in this era

Bulbapedia's Black & White Series table has 12 English sets. All 12 had
booster packs.

| Set no. | Set | Abbr. | English release | Cards | Set file | Uses the template |
|---|---|---|---|---|---|---|
| BW1 | Black & White | BLW | April 25, 2011 | 114 + 1 secret | [black-white.md](../black-white.md) | Yes, with a code card exception |
| BW2 | Emerging Powers | EPO | August 31, 2011 | 98 | [emerging-powers.md](../emerging-powers.md) | Yes |
| BW3 | Noble Victories | NVI | November 16, 2011 | 101 + 1 secret | [noble-victories.md](../noble-victories.md) | Yes |
| BW4 | Next Destinies | NXD | February 8, 2012 | 99 + 4 secret | [next-destinies.md](../next-destinies.md) | Yes |
| BW5 | Dark Explorers | DEX | May 9, 2012 | 108 + 3 secret | [dark-explorers.md](../dark-explorers.md) | Yes |
| BW6 | Dragons Exalted | DRX | August 15, 2012 | 124 + 4 secret | [dragons-exalted.md](../dragons-exalted.md) | Yes |
| DV1 | Dragon Vault | DRV | October 5, 2012 | 20 + 1 secret | [dragon-vault.md](../dragon-vault.md) | No |
| BW7 | Boundaries Crossed | BCR | November 7, 2012 | 149 + 4 secret | [boundaries-crossed.md](../boundaries-crossed.md) | Yes, with ACE SPEC |
| BW8 | Plasma Storm | PLS | February 6, 2013 | 135 + 3 secret | [plasma-storm.md](../plasma-storm.md) | Yes, with ACE SPEC |
| BW9 | Plasma Freeze | PLF | May 8, 2013 | 116 + 6 secret | [plasma-freeze.md](../plasma-freeze.md) | Yes, with ACE SPEC |
| BW10 | Plasma Blast | PLB | August 14, 2013 | 101 + 4 secret | [plasma-blast.md](../plasma-blast.md) | Yes, with ACE SPEC |
| BW11 | Legendary Treasures | LTR | November 6, 2013 | 113 + 2 secret + 25 Radiant Collection | [legendary-treasures.md](../legendary-treasures.md) | No |

Source for all columns: the
[Bulbapedia expansion list](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions).

### Products checked and excluded

The given list was complete. No English set with booster packs is
missing from it. These products are not in the set files:

- **McDonald's Collection 2011, 2012, and 2013** (12 cards each).
  Bulbapedia lists them in a separate McDonald's Collection table, not
  as expansions. No source shows retail booster packs or booster boxes.
- **BW Black Star Promos** (BWP). These are promo cards. They had no
  booster packs.
- **Kalos Starter Set** (November 8, 2013). Bulbapedia puts it in the
  XY Series table, so it is not in this era.
- **Sampling Packs.** These are 3-card packs inside blisters. They are
  not a set.
- **Black & White Trainer Kit, Battle Arena Decks, World Championships
  Decks.** These are products, not sets.

## Pack template

### Cards per pack

- **10 game cards per pack.** Bulbapedia says packs "consistently had 10
  cards" since the first Diamond & Pearl expansion. Confidence: official
  data, via Bulbapedia.
- **1 code card** for the Pokémon Trading Card Game Online. Bulbapedia
  says code cards started in Emerging Powers. The first print run of
  Black & White had no code card.
- **No basic Energy card.** Bulbapedia says the extra Energy card
  started in Sun & Moon.

### Slots

| Slot | Count | What it holds | Confidence |
|---|---|---|---|
| Common | 5 | Common cards | Official rule, via Bulbapedia ("generally 3 Uncommon cards, and the remainder are Common"). A 2013 PokeBeach post also gives 5. |
| Reverse holo | 1 | A reverse holo Common, Uncommon, or Rare. From Boundaries Crossed to Plasma Blast, an ACE SPEC can take this slot. | Reverse holo: official rule, via Bulbapedia. ACE SPEC: community (PokeBeach, 2013). |
| Rare | 1 | Rare, Holo Rare, Pokémon-EX, Full Art, or Secret rare | One rare per pack: official rule, via Bulbapedia. Slot content: community (PokeBeach, 2013). |
| Uncommon | 3 | Uncommon cards | Official rule, via Bulbapedia |
| Code card | 1 | Not a game card | Official, via Bulbapedia |

A PokeBeach member wrote in 2013 that "the rares always occupy the same
slot in the booster pack". So a pack cannot hold two cards from the rare
slot. A pack can hold one rare-slot hit and one ACE SPEC.

### Pack order

Two community sources list the cards of a pack in order:

1. A PokeBeach member (TrainerJack, December 16, 2013) asked about
   Plasma Freeze, Plasma Blast, Plasma Storm, and Dragons Exalted packs.
   The member gave this example: "5 commons, ultra rare, rare/holo rare,
   3 uncommons, and the code card". In the example, the ultra rare sits
   in the reverse holo slot. The normal order is therefore: 5 commons,
   reverse holo, rare, 3 uncommons, code card.
2. A PokeBeach member (AnimeDudde, October 27, 2013) listed Legendary
   Treasures packs "in order". That list also starts with the commons
   and ends with the uncommons and the code card. See
   [legendary-treasures.md](../legendary-treasures.md).

Template order, as the sources list it:

| Position | Card |
|---|---|
| 1–5 | Common |
| 6 | Reverse holo (or ACE SPEC) |
| 7 | Rare slot (the hit) |
| 8–10 | Uncommon |
| 11 | Code card |

- **Direction: Unknown.** No source says which end of the stack faces
  the player when the player opens the pack with the front facing them.
- **Where the hit sits.** In the listed order, the rare slot is card 7 of
  10 game cards. In reverse order, the rare slot is card 4 of 10. In both
  directions, the hit is **not** one of the last three cards. This is an
  exception to the default in
  [18-ripping.md](../../18-ripping.md#where-the-hit-sits).
- **Confidence: community.** One forum post gives the order, and a
  reply confirms the slot structure. No source shows photos or video of
  the order.
- **Conflict.** NinePocket says that packs from Black & White and earlier
  "did not follow one reliably documented internal order". NinePocket
  cites no source.

**Default for the simulation:** use the listed order, with the code card
last. Both order sources list the cards this way.

### Sealed boxes and cases

- **36 packs per booster box.** Retailer listings give 36 for
  [Next Destinies](https://www.collectorscache.com/buylist/pokemon_sealed_products-pokemon_booster_boxes/pokemon_black__white_bw4_next_destinies_booster_box/199103)
  and [Plasma Storm](https://toywiz.com/pokemon-trading-card-game-black-white-plasma-storm-booster-box-36-packs/).
  PokeBeach members use 36 packs per box for other sets. Confidence:
  retailer data for two sets, community for the others.
- **6 boxes per case.** One PokeBeach post (July 30, 2013) says "per
  case (6 booster BOXES)". Confidence: community, one post.
- **Collation: variable.** Box reports on PokeBeach show different hit
  counts in boxes of the same set. Some members say boxes were
  "standardized" or "mediated" before Dragons Exalted or Boundaries
  Crossed, and random after. Confidence: community.

## Rarity system

The rarity names below come from the pokemontcg.io card data. Bulbapedia
gives the history of each rarity.

| Rarity | First English set in the era | Notes |
|---|---|---|
| Common | Black & White | |
| Uncommon | Black & White | |
| Rare | Black & White | Non-holo |
| Rare Holo | Black & White | Tinsel Holofoil pattern |
| Reverse holo | Black & White | A print style, not a rarity. From Emerging Powers, the pattern shows Energy symbols or a Poké Ball. |
| Rare Ultra (Full Art) | Black & White | Full Art cards debuted in Black & White |
| Rare Secret | Black & White | Numbered above the set total. Shiny Pokémon from Next Destinies. Gold borders from Boundaries Crossed. |
| Rare Holo EX (Pokémon-EX) | Next Destinies | |
| Rare ACE (ACE SPEC) | Boundaries Crossed | Takes the reverse holo slot |
| Radiant Collection | Legendary Treasures | A 25-card subset with its own numbers |

## Hit odds across the era

The Pokémon Company never published pull rates for this era. Bulbapedia
says community data is the only source.

### Community estimates (Flipside Gaming)

Flipside Gaming gives these figures and cites no source:

| Hit | Odds | Sets |
|---|---|---|
| Full Art (Ultra Rare) | ~1 in 36 packs | Black & White |
| Full Art | ~1 in 18 packs | Noble Victories |
| Secret rare | ~1 in 72 packs | Black & White, Noble Victories |
| Pokémon-EX | ~1 in 18 packs (at first) | Next Destinies to Plasma Blast |
| Full Art | ~1 in 36 packs | Next Destinies to Plasma Blast |
| Secret rare | ~1 in 2 boxes | Next Destinies to Plasma Blast |
| ACE SPEC | "on par with UR cards" | Boundaries Crossed to Plasma Blast |

### Box reports (PokeBeach)

I counted the hits in complete box reports in the PokeBeach "English
Booster Box Pull Rates" thread. Each set file lists the boxes. The
counts are per 36-pack box.

| Set | Boxes | Regular EX per box | Full Art per box | ACE SPEC per box | Secret per box |
|---|---|---|---|---|---|
| Next Destinies | 2 | 2.0 | 1.0 | — | 0.5 |
| Dark Explorers | 4 | 2.25 | 0.75 | — | 0.5 |
| Dragons Exalted | 8 | 1.9 | 1.4 | — | 0.25 |
| Boundaries Crossed | 6 | 2.3 | 1.5 | 2.0 | 0.17 |
| Plasma Storm | 8 | 2.25 | 1.6 | 1.4 (7 boxes) | 0.25 |
| Plasma Freeze | 17 | 2.1 | 1.6 | 1.2 (12 boxes) | 0.24 |
| Plasma Blast | 12 | 2.0 | 1.1 | 1.8 (9 boxes) | 0.5 |
| Legendary Treasures | 6 | 6.0 | 8.7 (Radiant Collection) | — | 0.5 (gold) |

Confidence: empirical, but weak. Members report their own boxes. Members
post good boxes more often than bad boxes. The samples are small. Some
posts do not say clearly which card is a Full Art.

## Sets that break the template

- **Black & White.** The first print run has no code card. Bulbapedia
  and the Emerging Powers page do not agree about later prints.
- **Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast.** An
  ACE SPEC can fill the reverse holo slot. The pack order does not
  change.
- **Dragon Vault.** Each pack has 5 cards, and all of them are holo.
  Packs came only in blisters. There was no booster box.
- **Legendary Treasures.** Each pack has 4 commons, 1 reverse holo or
  holo rare, 1 rare, 2 Radiant Collection cards, and 2 uncommons. Box
  reports show about three times more Pokémon-EX than other sets.

## Sources

- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Black & White TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Black_%26_White_TCG_Series_merchandise)
- [Bulbapedia — Black & White (TCG)](https://bulbapedia.bulbagarden.net/wiki/Black_%26_White_(TCG))
- [Bulbapedia — Emerging Powers (TCG)](https://bulbapedia.bulbagarden.net/wiki/Emerging_Powers_(TCG))
- [pokemontcg.io API — card data by set](https://api.pokemontcg.io/v2/cards?q=set.id:bw8)
- [PokeBeach — Ultra Rares in Rev. Holo Slots (pack order, slots)](https://www.pokebeach.com/forums/threads/ultra-rares-in-rev-holo-slots.117388/)
- [PokeBeach — Legendary Treasures scans thread, page 3 (Legendary Treasures pack order)](https://www.pokebeach.com/forums/threads/1-120-legendary-treasures-scans-10-26.116739/page-3)
- [PokeBeach — The English Booster Box "Pull Rates" Thread, page 25 (standardized boxes)](https://www.pokebeach.com/forums/threads/the-english-booster-box-pull-rates-thread.114550/page-25)
- [PokeBeach — The English Booster Box "Pull Rates" Thread, page 28 (case size)](https://www.pokebeach.com/forums/threads/the-english-booster-box-pull-rates-thread.114550/page-28)
- [PokeBeach — The English Booster Box "Pull Rates" Thread, page 35 (box guarantees)](https://www.pokebeach.com/forums/threads/the-english-booster-box-pull-rates-thread.114550/page-35)
- [PokeBeach — The English Booster Box "Pull Rates" Thread, page 49 (box mediation)](https://www.pokebeach.com/forums/threads/the-english-booster-box-pull-rates-thread.114550/page-49)
- [Flipside Gaming — A Comprehensive Review of Rarity in the Pokemon TCG, Part Two](https://flipsidegaming.com/blogs/pokemon-blog/a-comprehensive-review-of-rarity-in-the-pokemon-tcg-part-two)
- [NinePocket — The Pokémon Pack Trick](https://www.ninepocket.net/guides/pokemon-pack-trick)
- [Collector's Cache — Next Destinies Booster Box](https://www.collectorscache.com/buylist/pokemon_sealed_products-pokemon_booster_boxes/pokemon_black__white_bw4_next_destinies_booster_box/199103)
- [ToyWiz — Plasma Storm Booster Box 36 Packs](https://toywiz.com/pokemon-trading-card-game-black-white-plasma-storm-booster-box-36-packs/)

## Open topics

- **Pack direction.** No source says which end of the stack faces the
  player. The hit is not in the last three cards in either direction,
  but its exact position changes (card 7 or card 4).
- **Pack order evidence is thin.** One forum post gives the template
  order. No photo or video source confirms it. No source covers Black &
  White, Emerging Powers, Noble Victories, Next Destinies, Dark
  Explorers, or Boundaries Crossed by name.
- **Holo rare odds.** No source gives a holo rare rate per pack for any
  set in this era. Some box reports give holo counts per box.
- **Case size.** Only one community post gives 6 boxes per case.
- **Box collation.** Community posts say early boxes were controlled and
  later boxes were random. No source proves either claim.
- **Flipside vs. box reports.** Flipside puts ACE SPEC odds "on par with"
  Full Art odds (~1 in 36 packs). Box reports for Boundaries Crossed show
  about 2 ACE SPEC cards per box (~1 in 18 packs).
- **Excluded products.** No source confirms how the McDonald's
  Collection cards were packaged.
