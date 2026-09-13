# Base Set (1999)

Set-specific quirks and data for Base Set — one file per set (see
[../13-sets.md](../13-sets.md) for the general approach and index).
Currently just pull rates; anything else set-specific belongs here too
as it comes up (print-run notes, known errors, whatever's unique to
this set).

## Release

The era template is in
[eras/wizards-of-the-coast.md](eras/wizards-of-the-coast.md).

- **English release date:** January 9, 1999 (Bulbapedia).
- **Set symbol:** none. Bulbapedia shows no set symbol for Base Set.
  Abbreviation: Unknown. ThePriceDex uses the database ID `base1`.
- **Card count:** 102. No secret rares.
- **Print runs:** the Elite Fourum pack guide lists these English runs:
  - Demo Game: "released in December of 1998, but the pack shows
    Copyright 1999".
  - 1st Edition (1999): the "1st Edition" stamp is on the pack and the
    cards.
  - Shadowless and Unlimited (1999): older Shadowless packs say "11
    Tradeable Game Cards". Unlimited packs say "11 ADDITIONAL GAME
    CARDS".
  - 1999-2000 print: "Copyright 1999-2000" with a curved WotC logo.
- **Sheet notes:** the Elite Fourum rarity guide shows different sheet
  layouts across the print runs.
- **Pack wrapper arts:** Charizard, Blastoise, and Venusaur
  (PullMarket).

## Pack order

Base Set follows the era pack order. See
[eras/wizards-of-the-coast.md](eras/wizards-of-the-coast.md#pack-order).

- **Claim A** ([CardCollector](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)):
  "3" for Base Set. Hold the stack with the card backs toward you. Move
  the nearest card to the front three times. Then the rare is the last
  card that you see. Confidence: low. The page gives no method.
- **What Claim A means (our derivation):** the rare is card 8 of 11,
  the fourth card from the end. It is **not** one of the last three.
- **Claim B** ([NinePocket](https://www.ninepocket.net/guides/pokemon-pack-trick)):
  packs from this era "did not follow one reliably documented internal
  order". Confidence: low.
- **Energy card position:** Unknown. Base Set packs hold 1 or 2 energy
  cards (see Pack structure below).
- **Direction:** Unknown. No source says which way the cards face in
  the wrapper.

## Pull rates

The first concrete worked example for the pull-rate model described in
[../12-acquiring-product.md](../12-acquiring-product.md). Wizards of
the Coast never published exact odds for vintage product, so
everything here is community-derived rather than official — each
figure is labeled with its confidence level.

Unlike card prices, this data doesn't need a live source: pack
structure for a set printed in 1999 is fixed historical fact, not
something that drifts day to day. It only needs researching once.

## Pack structure

11 cards per Base Set booster pack. The community is split on the
exact non-rare breakdown:

- **Variant A** (more commonly cited): 1 rare, 3 uncommon, 5 common,
  2 energy.
- **Variant B**: 1 rare, 3 uncommon, 6 common, 1 energy.

Base Set energy cards carry common rarity, so this is partly a
labeling disagreement rather than a real structural conflict. **Use
Variant A as the default** for the simulation.

## Rare slot odds

The rare slot is always filled — every pack has exactly one rare-slot
card, which is either a holo rare or a non-holo rare.

- **Holo**: ~33% (1 in 3 packs). This is the one figure with real
  empirical backing: a community pack-weight-sorting study (Loose
  Packs) recorded 96 holos out of 288 opened packs — exactly 33.3%.
- **Non-holo rare**: ~67% (the remainder).

Base Set has 16 total rares: 4 holo, 12 non-holo. (Community sourcing
on the holo/non-holo split among named rares should be double-checked
against this before implementation — the ratio here describes overall
holo-vs-non-holo odds, not confirmed per-card weighting.)

**The 16 rares are not equally weighted on the print sheet.** The Elite
Fourum rarity guide, from its sheet reconstruction, states: "of the 16
rares, 9 appeared on the sheet 8 times and 7 appeared 7 times." So 9
rares are common inside the rare slot (weight 8) and 7 are less common
(weight 7). The guide does not name which specific rares carry each
weight. Confidence: empirical study (sheet reconstruction), per-card
names unconfirmed.

## Specific card odds (weakest confidence)

Community estimates: a named holo (e.g. Charizard) roughly 1 in 45
packs; a named non-holo rare roughly 1 in 24 packs. These assume even
weighting across all 16 rares, which **no source actually confirms**.
Real print sheets may weight individual cards unevenly (this is the
same open question flagged as a deferred fifth archetype tag —
print-sheet position — in
[../11-card-archetypes-and-scaling.md](../11-card-archetypes-and-scaling.md)).

**Default for the simulation**: treat all 4 holos as equally likely
within the holo slot, and all 12 non-holo rares as equally likely
within theirs, until better data says otherwise.

## Box and case structure

- 36 packs per booster box (396 cards) as the standard. [Loose Packs](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide)
  reports the factory was "not always consistent": it has logged a
  Base Set box with an extra pack, and two US boxes at 35 packs.
- 6 boxes per case. The [Elite Fourum rarity guide](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762)
  states this as its own working assumption for the era, in addition to
  the one Fossil case listing in the era file. Confidence: low-medium.
- Mean ~12 holos per box, but the real recorded range across opened
  boxes is 6 to 18 — collation is **not** a fixed, guaranteed count.

**Implementation implication**: don't hardcode "12 holos per box."
Model each pack's rare slot as an independent draw, and let the
per-box holo count emerge from that — this reproduces the real 6–18
spread naturally, and it's a good fit for the game's existing
variance/bust design (see
[../01-premise-and-loop.md](../01-premise-and-loop.md#variance-and-busts)):
opening a whole box is still a gamble, not a guaranteed haul.

## Sealed products

The booster box and case values are in "Box and case structure" above.

| Product | Packs | Collation | Source |
|---|---|---|---|
| Booster box | 36 | Variable (6 to 18 holos per box) | See above |
| Booster case | 6 boxes | Variable | See above |
| Hanger pack | 1 (a pack variant with a hanger crimp) | Not applicable | [Elite Fourum pack guide](https://www.elitefourum.com/t/guide-to-identifying-all-wotc-base-set-booster-packs/41521) |
| Base Set & Jungle League Promo blister | Unknown | Unknown | [Loose Packs — WotC collection](https://loosepacks.com/collections/wotc) (product name only) |
| 2-Player Starter Set | Unknown whether it holds booster packs | Unknown | — |

<!-- product-catalog:start (generated by tools/ppt/sealed_catalog.py; do not edit) -->
### Product catalog

Every physical sealed product that the TCGplayer catalog (TCGCSV) lists for this set, fetched 2026-09-12. Code cards are left out.

- **Packs** is the number of booster packs. **Packs from** names the source: the TCGplayer description, the product name, the Bulbapedia TCG merchandise page for the series, the set file's own table (Build & Battle Stadium: boxes × 4 plus the extra packs), or a default for the kind (booster box 36, booster bundle 6, Build & Battle Box 4). Check a default before the game uses it.
- **Holds** is what a case or a display holds.
- **Release** is the quarter from the TCGplayer release date. "(set)" means the quarter of the set's release date.
- **PPT price** is Yes when PokemonPriceTracker has a price. Prices are in `tools/ppt/cache/sealed/`, not in the docs.

TCGplayer group `604`, `1663`: 16 products.

| TCGplayer ID | Product | Kind | Packs | Packs from | Holds | Release | PPT price |
|---|---|---|---|---|---|---|---|
| 185731 | Base Set Booster Box [Revised Unlimited Edition] | Booster box | 36 | Kind default | — | 1999 Q1 (set) | Yes |
| 138130 | Base Set Booster Pack [Revised Unlimited Edition] | Booster pack | 1 | Kind default | — | 1999 Q1 (set) | Yes |
| 136401 | Base Set Theme Deck - "Blackout" (Revised Base Set Reprint Run) | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 136403 | Base Set Theme Deck - "Brushfire" (Revised Base Set Reprint Run) | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 136404 | Base Set Theme Deck - "Overgrowth" (Revised Base Set Reprint Run) | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 136402 | Base Set Theme Deck - "Zap!" (Revised Base Set Reprint Run) | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 136400 | Pokemon 2-Player Starter Set (Revised Base Set Reprint Run) | Other | Unknown | Unknown | — | 1999 Q1 (set) | Yes |
| 107596 | Pokemon Base Set (Shadowless) [1st Edition] Booster Box | Booster box | 36 | Description | — | 1999 Q1 (set) | Yes |
| 107597 | Pokemon Base Set (Shadowless) [Unlimited Edition] Booster Box | Booster box | 36 | Kind default | — | 1999 Q1 (set) | No |
| 138132 | Pokemon Base Set (Shadowless) [1st Edition] Booster Pack | Booster pack | 1 | Kind default | — | 1999 Q1 (set) | Yes |
| 138131 | Pokemon Base Set (Shadowless) [Unlimited Edition] Booster Pack | Booster pack | 1 | Kind default | — | 1999 Q1 (set) | Yes |
| 107603 | Base Set Theme Deck - "Blackout" | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 107604 | Base Set Theme Deck - "Brushfire" | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 107605 | Base Set Theme Deck - "Overgrowth" | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 107606 | Base Set Theme Deck - "Zap!" | Deck | 0 | Bulbapedia (no booster pack in contents) | — | 1999 Q1 (set) | Yes |
| 107602 | Pokemon 2-Player Starter Set | Other | Unknown | Unknown | — | 1999 Q1 (set) | No |
<!-- product-catalog:end -->

## 1st Edition vs. Unlimited

No source found showing a pull-rate difference. The two only differ
by the "1st Edition" stamp and a much smaller 1st Edition print run —
that affects scarcity/collector value (see
[../05-pricing-and-market.md](../05-pricing-and-market.md)), not the odds of
what comes out of a pack. Model both with identical pack-structure
odds.

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `base1`), fetched 2026-09-12. The list has 102 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 1/102 | Alakazam | Pokémon (Psychic) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 2/102 | Blastoise | Pokémon (Water) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 3/102 | Chansey | Pokémon (Colorless) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 4/102 | Charizard | Pokémon (Fire) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 5/102 | Clefairy | Pokémon (Colorless) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 6/102 | Gyarados | Pokémon (Water) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 7/102 | Hitmonchan | Pokémon (Fighting) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 8/102 | Machamp | Pokémon (Fighting) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 9/102 | Magneton | Pokémon (Lightning) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 10/102 | Mewtwo | Pokémon (Psychic) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 11/102 | Nidoking | Pokémon (Grass) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 12/102 | Ninetales | Pokémon (Fire) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 13/102 | Poliwrath | Pokémon (Water) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 14/102 | Raichu | Pokémon (Lightning) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 15/102 | Venusaur | Pokémon (Grass) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 16/102 | Zapdos | Pokémon (Lightning) | Rare | Holo (Unlimited), Holo (Shadowless, 1st Edition), Holo (Shadowless), Holo (1999–2000 copyright) |
| 17/102 | Beedrill | Pokémon (Grass) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 18/102 | Dragonair | Pokémon (Colorless) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 19/102 | Dugtrio | Pokémon (Fighting) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 20/102 | Electabuzz | Pokémon (Lightning) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 21/102 | Electrode | Pokémon (Lightning) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 22/102 | Pidgeotto | Pokémon (Colorless) | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 23/102 | Arcanine | Pokémon (Fire) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 24/102 | Charmeleon | Pokémon (Fire) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 25/102 | Dewgong | Pokémon (Water) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 26/102 | Dratini | Pokémon (Colorless) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 27/102 | Farfetch'd | Pokémon (Colorless) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 28/102 | Growlithe | Pokémon (Fire) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 29/102 | Haunter | Pokémon (Psychic) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 30/102 | Ivysaur | Pokémon (Grass) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 31/102 | Jynx | Pokémon (Psychic) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 32/102 | Kadabra | Pokémon (Psychic) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 33/102 | Kakuna | Pokémon (Grass) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 34/102 | Machoke | Pokémon (Fighting) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 35/102 | Magikarp | Pokémon (Water) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 36/102 | Magmar | Pokémon (Fire) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 37/102 | Nidorino | Pokémon (Grass) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 38/102 | Poliwhirl | Pokémon (Water) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 39/102 | Porygon | Pokémon (Colorless) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 40/102 | Raticate | Pokémon (Colorless) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 41/102 | Seel | Pokémon (Water) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 42/102 | Wartortle | Pokémon (Water) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 43/102 | Abra | Pokémon (Psychic) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 44/102 | Bulbasaur | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright), Normal (Pikachu, Jumbo) |
| 45/102 | Caterpie | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 46/102 | Charmander | Pokémon (Fire) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright), Normal (Pikachu, Jumbo) |
| 47/102 | Diglett | Pokémon (Fighting) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 48/102 | Doduo | Pokémon (Colorless) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 49/102 | Drowzee | Pokémon (Psychic) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 50/102 | Gastly | Pokémon (Psychic) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 51/102 | Koffing | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 52/102 | Machop | Pokémon (Fighting) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 53/102 | Magnemite | Pokémon (Lightning) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 54/102 | Metapod | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 55/102 | Nidoran♂ | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 56/102 | Onix | Pokémon (Fighting) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 57/102 | Pidgey | Pokémon (Colorless) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 58/102 | Pikachu | Pokémon (Lightning) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (Shadowless red cheek), Normal (Shadowless red cheek, 1st Edition), Normal (1999–2000 copyright), Normal (Jumbo), Normal (Unlimited, PokéTour 99) |
| 59/102 | Poliwag | Pokémon (Water) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 60/102 | Ponyta | Pokémon (Fire) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 61/102 | Rattata | Pokémon (Colorless) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 62/102 | Sandshrew | Pokémon (Fighting) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 63/102 | Squirtle | Pokémon (Water) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright), Normal (Pikachu, Jumbo) |
| 64/102 | Starmie | Pokémon (Water) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 65/102 | Staryu | Pokémon (Water) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 66/102 | Tangela | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 67/102 | Voltorb | Pokémon (Lightning) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 68/102 | Vulpix | Pokémon (Fire) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 69/102 | Weedle | Pokémon (Grass) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 70/102 | Clefairy Doll | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 71/102 | Computer Search | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 72/102 | Devolution Spray | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 73/102 | Impostor Professor Oak | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 74/102 | Item Finder | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 75/102 | Lass | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 76/102 | Pokémon Breeder | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 77/102 | Pokémon Trader | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 78/102 | Scoop Up | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 79/102 | Super Energy Removal | Trainer | Rare | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 80/102 | Defender | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 81/102 | Energy Retrieval | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 82/102 | Full Heal | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 83/102 | Maintenance | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 84/102 | PlusPower | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 85/102 | Pokémon Center | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 86/102 | Pokémon Flute | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 87/102 | Pokédex | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 88/102 | Professor Oak | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 89/102 | Revive | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 90/102 | Super Potion | Trainer | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 91/102 | Bill | Trainer | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 92/102 | Energy Removal | Trainer | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 93/102 | Gust of Wind | Trainer | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 94/102 | Potion | Trainer | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 95/102 | Switch | Trainer | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 96/102 | Double Colorless Energy | Energy (Special) | Uncommon | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 97/102 | Fighting Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 98/102 | Fire Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 99/102 | Grass Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 100/102 | Lightning Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 101/102 | Psychic Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |
| 102/102 | Water Energy | Energy (Normal) | Common | Normal (Unlimited), Normal (Shadowless, 1st Edition), Normal (Shadowless), Normal (1999–2000 copyright) |

## Slot map

How the game builds one pack from the card list. Each row is one
outcome of one slot. The game picks one outcome for each card in the
slot, then picks one card at random from the cards that match the row.

- **Slot** and **Count** come from the pack structure above.
- **Rarity list entry** links the outcome to the stop rule.
- **TCGdex rarity** and **Variant** match the card list exactly.
- **Cards** limits the matching cards: `All`, `Nos. a–b`, `Not nos. a–b`,
  `Part: <card list table>`, or `Category: <category>`.
- **Odds in slot** is the chance of the outcome for one card in the
  slot. `Rest` is the remainder. `—` means no source gives the odds.
- A variant that no row uses does not come from booster packs.

**Print runs:** a pack holds one print run. The run adds its text to
each variant: Unlimited (Unlimited), 1st Edition (Shadowless, 1st
Edition), Shadowless (Shadowless), and the 1999–2000 print (1999–2000
copyright). A product must name its print run.

Confidence: the slots use Variant A (5 commons, 2 energy). All cards
in one row have equal weight. The print sheet weights for the rares
are known only as counts (see "Rare slot odds").

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 5 | Common | Common | Common | Normal | Not nos. 97–102 | 100% |
| Energy | 2 | Basic Energy | Common | Common | Normal | Nos. 97–102 | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Rare slot | 1 | Rare Holo | Rare Holo | Rare | Holo | All | 33.3% |
| Rare slot | 1 | Rare | Rare | Rare | Normal | All | Rest |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Rare | Rarity | 67% | Yes |
| 4 | Rare Holo | Rarity | 1 in 3 | Yes |

## Sources

- [Loose Packs — Pokemon Pack Weight Guide](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide) (the empirical 288-pack study)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [CardGuide Wiki — Base Set](https://cardguide.fandom.com/wiki/Base_Set_(Pok%C3%A9mon_TCG))
- [Keepitsealdz — Pack Weight Guide](https://keepitsealdz.com/pages/pack-weight-guide)
- [ThePriceDex — Base Set Pull Rates](https://www.thepricedex.com/set/base1/base/pull-rates)
- [Flipside Gaming — Rarity in the Pokemon TCG](https://flipsidegaming.com/blogs/pokemon-blog/a-comprehensive-review-of-rarity-in-the-pokemon-tcg)
- [DA Card World — Base Set Booster Box](https://www.dacardworld.com/gaming/wotc-pokemon-base-set-1-booster-box)
- [PullMarket — Pokemon Original Sets Guide](https://pullmarket.io/learn/pokemon-original-sets-guide)
- [Bulbapedia — Base Set (TCG)](https://bulbapedia.bulbagarden.net/wiki/Base_Set_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Elite Fourum — Guide To Identifying All WotC Base Set Booster Packs](https://www.elitefourum.com/t/guide-to-identifying-all-wotc-base-set-booster-packs/41521)
- [Elite Fourum — The English Pokémon card rarity guide](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762)
- [CardCollector — The Pokémon Card Trick](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)
- [PokéPatch — Pokemon Card Tricks for EVERY Set](https://pokepatch.com/2022/07/26/how-to-open-pokemon-cards-card-trick-for-each-set/)
- [NinePocket — The Pokémon Pack Trick](https://www.ninepocket.net/guides/pokemon-pack-trick)
- [Loose Packs — WotC collection](https://loosepacks.com/collections/wotc)

## Open topics

- Resolve the 5-common-2-energy vs. 6-common-1-energy discrepancy —
  likely doesn't matter much for the simulation either way, but worth
  a firm answer before implementation.
- Resolved: the 16 rares are not equally weighted. 9 are weight-8 (R8)
  and 7 are weight-7 (R7) on the print sheet (Elite Fourum rarity
  guide). Which specific cards carry each weight stays unknown.
- The Elite Fourum rarity guide rebuilds the Unlimited sheets. It
  reports two weight levels for the holos and two for the rares. Our
  read of the per-card values was not consistent, so this file gives
  no codes. Check the guide directly for the per-card list.
- Pack order: find a source that shows real opened Base Set packs card
  by card. Confirm or reject Claim A (rare at card 8 of 11). Searched
  2026-09-12: PokéPatch agrees with Claim A (see the era file) but
  shows no real opened pack.
- Energy card position in the pack: Unknown. Searched 2026-09-12: no
  source found.
- The contents of the Base Set & Jungle League Promo blister: Unknown.
- Whether the 2-Player Starter Set holds booster packs: Unknown.
