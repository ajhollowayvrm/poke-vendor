# Scarlet & Violet era (2023–2025)

This file holds the pack template that most English Scarlet & Violet sets
share. Each set file under `docs/sets/` records the data for one set and
every exception to this template. See [../../13-sets.md](../../13-sets.md)
for the general approach.

## Pack template

### Pack contents

An English Scarlet & Violet booster pack holds 12 cards: 10 set cards,
1 Basic Energy card, and 1 Pokémon TCG Live code card.

- PokeBeach reported this configuration on March 7, 2023, before the first
  set released.
- The Bulbapedia booster pack table for international releases "starting in
  Scarlet & Violet" shows the same slots.
- Card Shop Live counted the same 12 cards in its opened Scarlet & Violet
  packs.

| Slot | Count | Can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo slot 1 | 1 | Reverse Holo. Paldean Fates only: Shiny Rare or Shiny Ultra Rare. Temporal Forces to Prismatic Evolutions: ACE SPEC Rare. |
| Reverse holo slot 2 | 1 | Reverse Holo, Illustration Rare, Special Illustration Rare, Hyper Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare |
| Basic Energy | 1 | Basic Energy card |
| Code card | 1 | Pokémon TCG Live code card |

All cards of Rare rarity or higher are holofoil in this era. Thus each pack
holds at least three foil cards: the two reverse holo slots and the Rare
slot.

### Rarity system

| Rarity | Symbol | Slot | Secret rare? | Notes |
|---|---|---|---|---|
| Common | — | Common | No | |
| Uncommon | — | Uncommon | No | |
| Rare | 1 black star | Rare slot | No | Holofoil |
| Double Rare | 2 black stars | Rare slot | No | Regular Pokémon ex |
| Ultra Rare | 2 white stars | Rare slot | Yes | Full Art Pokémon ex and Full Art Trainers |
| Illustration Rare | 1 gold star | Reverse holo slot 2 | Yes | Full-card art of non-ex Pokémon |
| Special Illustration Rare | 2 gold stars | Reverse holo slot 2 | Yes | Full-card art of Pokémon ex and Trainers |
| Hyper Rare | 3 gold stars | Reverse holo slot 2 | Yes | Gold cards |
| ACE SPEC Rare | Pink star | Reverse holo slot 1 | No | Temporal Forces to Prismatic Evolutions |
| Shiny Rare | Unknown | Reverse holo slot 1 | Yes | Paldean Fates only |
| Shiny Ultra Rare | Unknown | Reverse holo slot 1 | Yes | Paldean Fates only |

The symbols for the first eight rarities come from PokeBeach. The ACE SPEC
symbol comes from TCGplayer. The slot for each rarity comes from the
TCGplayer opened-pack studies and the Bulbapedia booster pack table.

### Pack order

The order below is the order the cards come out of the pack, first card
first.

| Position | Slot | Can hold |
|---|---|---|
| 1–4 | Common | Common |
| 5–7 | Uncommon | Uncommon |
| 8 | Reverse holo slot 1 | Reverse Holo, and the set-specific extras in the pack contents table |
| 9 | Reverse holo slot 2 | Reverse Holo, Illustration Rare, Special Illustration Rare, Hyper Rare |
| 10 | Rare slot | Rare, Double Rare, Ultra Rare |
| 11 | Basic Energy | Basic Energy card |
| 12 | Code card | Pokémon TCG Live code card |

**Confidence: industry news report before release.** PokeBeach wrote:
"each pack will now be ordered with the rarest cards in the back. The order
will be: 4x common cards, 3x uncommons, 2x reverse holos, and 1x holo. After
this, you'll find 1x Basic Energy and 1x code card."

- No source in this research shows an opened pack card by card.
- The TCGplayer studies come from opened packs. They name the slot for each
  rarity, but they do not give physical positions.
- PokeBeach does not say which face of the pack is the front. It also does
  not say whether a pack can open from either end.

### Where the hit sits

- **Rare slot (card 10):** the third card from the end. It is one of the last
  three cards. It holds the Double Rare and the Ultra Rare.
- **Reverse holo slot 2 (card 9):** the fourth card from the end. It is not
  one of the last three cards. It holds the Illustration Rare, the Special
  Illustration Rare, and the Hyper Rare.
- **Reverse holo slot 1 (card 8):** the fifth card from the end. It holds the
  ACE SPEC Rare, the Shiny Rare, and the Shiny Ultra Rare.
- If the rip screen does not show the code card, card 9 is the third card
  from the end, and card 8 is the fourth.
- The Rare slot always holds a card of Rare rarity or higher. By the rarity
  rule in [../../18-ripping.md](../../18-ripping.md#what-counts-as-a-hit),
  every pack in this era holds at least one hit.

### Conflicts in the template

1. **Hyper Rare slot.** PokeBeach (before release) put the Hyper Rare in the
   Rare slot. The TCGplayer studies for every set in this era up to Twilight
   Masquerade put it in reverse holo slot 2. Card Shop Live and Bulbapedia
   agree with TCGplayer. The set files use reverse holo slot 2.
2. **Last card.** PokeBeach puts the code card last. The TCGplayer 151
   article says: "As with all booster packs in the Scarlet & Violet Series,
   the last card in a pack of 151 is a Basic Energy card". A third source,
   from the later-set research, says the code card is the first card the
   player sees. It is unknown which source is correct, or whether the
   position changes between packs.

## Odds by set

All figures are per pack, from the TCGplayer Authentication Center studies.
**Confidence: empirical study.** The set files give the 95% confidence
intervals and the specific-card odds.

| Set | Packs opened | Double Rare | Ultra Rare | Illustration Rare | Special Illustration Rare | Hyper Rare | ACE SPEC Rare | Shiny Rare | Shiny Ultra Rare |
|---|---|---|---|---|---|---|---|---|---|
| Scarlet & Violet | 8,000+ | 13.76% | 6.57% | 7.67% | 3.15% | 1.85% | — | — | — |
| Paldea Evolved | 8,000+ | 13.72% | 6.64% | 7.70% | 3.17% | 1.76% | — | — | — |
| Obsidian Flames | 8,000+ | 13.61% | 6.63% | 7.60% | 3.13% | 1.92% | — | — | — |
| 151 | 1,500+ | 13.28% | 6.44% | 8.50% | 3.11% | 1.94% | — | — | — |
| Paradox Rift | 8,000+ | 15.57% | 6.64% | 7.70% | 2.11% | 1.22% | — | — | — |
| Paldean Fates | 1,500+ | 15.89% | 6.61% | 7.22% | 1.72% | 1.61% | — | 25.44% | 7.72% |
| Temporal Forces | 8,000+ | 16.83% | 6.67% | 7.72% | 1.17% | 0.72% | 5.00% | — | — |
| Twilight Masquerade | 8,000+ | 16.93% | 6.61% | 7.73% | 1.17% | 0.68% | 5.06% | — | — |
| Shrouded Fable | No TCGplayer study found | See set file | | | | | | | |

The data shows three rate groups:

- Scarlet & Violet to 151: the same rates within the confidence intervals.
- Paradox Rift: lower Special Illustration Rare and Hyper Rare rates, and a
  higher Double Rare rate.
- Temporal Forces and Twilight Masquerade: lower rates again, and the ACE SPEC
  Rare in reverse holo slot 1.

The Ultra Rare rate stays near 6.6% and the Illustration Rare rate stays near
7.7% in every set with a TCGplayer study.

## Sealed product template

| Product | Packs | Notes |
|---|---|---|
| Booster Display Box | 36 | Main sets only. Some European markets also got an 18-pack half display. |
| Elite Trainer Box | 9 | From Scarlet & Violet onward. |
| Pokémon Center Elite Trainer Box | 11 | Two more packs and a stamped promo card. |
| Booster Bundle | 6 | Introduced in the Scarlet & Violet Series. |
| Build & Battle Box | 4 | Main sets. |
| Build & Battle Stadium | 2 Build & Battle Boxes plus 3 or 4 packs | Sources disagree. Up to Paradox Rift only. |
| Collector's Kit | 1 | Main sets. |
| Checklane Blister | 1 | |
| Mini Tin | 2 | Special sets. |

- The special sets 151, Paldean Fates, and Shrouded Fable have no Booster
  Display Box in the Bulbapedia merchandise list.
- Boxes per case: Unknown.
- Collation (a fixed or variable number of hits per box): Unknown for every
  set in this era.
- Multi-set products (tins, "ex Box" products, Premium Collections) list a
  "typical" pack mix. The mix is variable.

## Sets in the era

| Set | Code | English release | Set file |
|---|---|---|---|
| Scarlet & Violet | SVI | March 31, 2023 | [../scarlet-violet.md](../scarlet-violet.md) |
| Paldea Evolved | PAL | June 9, 2023 | [../paldea-evolved.md](../paldea-evolved.md) |
| Obsidian Flames | OBF | August 11, 2023 | [../obsidian-flames.md](../obsidian-flames.md) |
| 151 | MEW | September 22, 2023 | [../151.md](../151.md) |
| Paradox Rift | PAR | November 3, 2023 | [../paradox-rift.md](../paradox-rift.md) |
| Paldean Fates | PAF | January 26, 2024 | [../paldean-fates.md](../paldean-fates.md) |
| Temporal Forces | TEF | March 22, 2024 | [../temporal-forces.md](../temporal-forces.md) |
| Twilight Masquerade | TWM | May 24, 2024 | [../twilight-masquerade.md](../twilight-masquerade.md) |
| Shrouded Fable | SFA | August 2, 2024 | [../shrouded-fable.md](../shrouded-fable.md) |
| Stellar Crown | See set file | See set file | [../stellar-crown.md](../stellar-crown.md) |
| Surging Sparks | See set file | See set file | [../surging-sparks.md](../surging-sparks.md) |
| Prismatic Evolutions | See set file | See set file | [../prismatic-evolutions.md](../prismatic-evolutions.md) |
| Journey Together | See set file | See set file | [../journey-together.md](../journey-together.md) |
| Destined Rivals | See set file | See set file | [../destined-rivals.md](../destined-rivals.md) |
| Black Bolt | See set file | See set file | [../black-bolt.md](../black-bolt.md) |
| White Flare | See set file | See set file | [../white-flare.md](../white-flare.md) |

- The Bulbapedia expansion list shows no other English Scarlet & Violet
  Series expansions. The Mega Evolution Series follows White Flare.
- A second research pass wrote the set files from Stellar Crown onward. Its
  era-level findings are in "Sets that break the template" below.

### English products with no standard booster packs

These products have no set file:

- **SVP Black Star Promos** and **SVE Basic Energies**: no booster packs.
- **Trick or Trade 2023**: a 30-card Halloween set, released September 1,
  2023. It came in three-card mini booster packs in a BOOster Bundle of 50
  (later 120) mini packs.
- **Trick or Trade 2024**: three-card mini packs in bundles of 35, 80, or 120
  mini packs.
- **McDonald's Collection 2023**: four-card packs in Happy Meals, from
  September 12, 2023 in the U.S.
- **McDonald's Collection 2024** ("Dragon Discovery"): four-card packs in
  Happy Meals, from January 21, 2025 in the U.S.
- **Holiday Calendar 2023 and 2024**: seven three-card "Fun Packs" of
  existing sets, not a separate set.

## Sets that break the template

- **151:** No booster box. The Basic Energy slot can hold a Cosmos Holofoil
  Basic Energy (about 1 in 4 packs). Sources report god packs. TCGplayer says
  the Basic Energy is the last card.
- **Paradox Rift:** The same structure. The Special Illustration Rare and
  Hyper Rare rates drop to about two-thirds of earlier sets.
- **Paldean Fates:** No booster box. Reverse holo slot 1 holds a Shiny Rare
  (about 1 in 4 packs) or a Shiny Ultra Rare (about 1 in 13). Secret rares
  are 154 of 245 cards.
- **Temporal Forces and Twilight Masquerade:** Reverse holo slot 1 holds an
  ACE SPEC Rare in about 1 in 20 packs. The Special Illustration Rare and
  Hyper Rare rates drop again.
- **Shrouded Fable:** No booster box. It has ACE SPEC Rares. No TCGplayer
  study was found, so only community data exists.
- **Stellar Crown to White Flare:** Bulbapedia says the ACE SPEC Rare slot
  continues to Prismatic Evolutions. See each set file for other changes.
- **Journey Together:** the box topper returns. The Enhanced Booster Display
  Box holds a stamped N's Reshiram. Journey Together has no ACE SPEC Rares.
- **Destined Rivals:** no ACE SPEC Rares.
- **Prismatic Evolutions:** no booster box. The reverse holo slots can hold
  Poké Ball pattern and Master Ball pattern reverse holos. The set has no
  Illustration Rares. The Poké Ball pattern rate is Unknown.
- **Black Bolt and White Flare:** no booster box. Both sets have Poké Ball
  and Master Ball pattern reverse holos, and they add the Black White Rare.
  About 1 pack in 6 holds an Illustration Rare. The slot structure is not
  sourced: the set files copy the Prismatic Evolutions layout and mark it
  Unknown. Every study combines the two sets.

**Odds data for the later sets (confidence: empirical study).** Most figures
come from TCGplayer studies of about 8,000 packs per set. Prismatic
Evolutions has a study of 1,200 packs. Black Bolt and White Flare have one
study of 700 packs for both sets together.

## Sources

- [PokeBeach — "Scarlet & Violet" Booster Pack Configuration Finally Revealed (March 7, 2023)](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Scarlet & Violet TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Scarlet_%26_Violet_TCG_Series_merchandise)
- [Bulbapedia — Elite Trainer Box (TCG)](https://bulbapedia.bulbagarden.net/wiki/Elite_Trainer_Box_(TCG))
- [Bulbapedia — Build & Battle Box (TCG)](https://bulbapedia.bulbagarden.net/wiki/Build_%26_Battle_Box_(TCG))
- [Bulbapedia — Trick or Trade 2023 (TCG)](https://bulbapedia.bulbagarden.net/wiki/Trick_or_Trade_2023_(TCG))
- [Bulbapedia — McDonald's Collection 2023 (TCG)](https://bulbapedia.bulbagarden.net/wiki/McDonald%27s_Collection_2023_(TCG))
- [Bulbapedia — McDonald's Collection 2024 (TCG)](https://bulbapedia.bulbagarden.net/wiki/McDonald%27s_Collection_2024_(TCG))
- [Bulbapedia — SVP Black Star Promos (TCG)](https://bulbapedia.bulbagarden.net/wiki/SVP_Black_Star_Promos_(TCG))
- [Card Shop Live — Hit Rates for Pokemon TCG Scarlet & Violet](https://cardshoplive.com/pages/hit-rates-for-pokemon-tcg-scarlet-and-violet)
- [TCGplayer — Scarlet & Violet Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Scarlet-Violet-Pull-Rates/a7702fce-dd64-4a58-beb1-0f871c853215/)
- [TCGplayer — Paldea Evolved Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Paldea-Evolved-Pull-Rates/1b7d3e70-9542-4a50-8692-1661e2316521/)
- [TCGplayer — Obsidian Flames Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Obsidian-Flames-Pull-Rates/e2a66999-a7b5-4621-9765-c9a132e04bd2/)
- [TCGplayer — Scarlet & Violet—151 Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Scarlet-Violet%E2%80%94151-Pull-Rates/b237df74-fbb0-40d0-9e13-d69ee6e804d9/)
- [TCGplayer — Paradox Rift Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Paradox-Rift-Pull-Rates/0b5fb648-38fc-4f61-a6af-57c2737b4a48/)
- [TCGplayer — Paldean Fates Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Paldean-Fates-Pull-Rates/23de3e93-0d0f-4ae0-abc4-13664f3001a3/)
- [TCGplayer — Temporal Forces Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Temporal-Forces-Pull-Rates/28c0ad22-00a4-428f-b22d-e7fee9ec50bc/)
- [TCGplayer — Twilight Masquerade Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Twilight-Masquerade-Pull-Rates/f3eea967-e5fb-4108-8655-bb1c89587628/)

## Open topics

- **Physical pack order.** Confirm the order with an opened-pack source (a
  video or photos) for each set. The current order comes from one report
  made before release.
- **Last card.** Find out whether the code card (PokeBeach) or the Basic
  Energy (TCGplayer 151 article) is the last card.
- **Pack direction.** Find out which face is the front, and whether a pack
  can open from either end.
- **Hits outside the last three cards.** Illustration Rares, Special
  Illustration Rares, and Hyper Rares sit at card 9 of 12. The rip screen
  default ("one of the last three cards") does not hold for them unless the
  game hides the code card.
- **Boxes per case.** No source in this research gives the number.
- **Collation.** No source gives the hit spread per booster box.
- **Mini-pack products.** Decide whether the game needs the Trick or Trade
  and McDonald's mini packs.
- **Build & Battle Stadium.** One Bulbapedia page says 3 extra packs. Another
  says 4.
