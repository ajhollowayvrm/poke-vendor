# Wizards of the Coast era (1999–2002)

This file holds the pack template that most English sets from Wizards
of the Coast (WotC) share. Each set file records only its own
differences from this template. For the general approach, see
[../../13-sets.md](../../13-sets.md).

Legendary Collection and the e-Card sets are also WotC products. A
different research task covers them, so this file does not describe
them in detail.

## The pack template

| Item | Template value | Source | Confidence |
|---|---|---|---|
| Cards per pack | 11 | [Bulbapedia — Booster pack](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG)), PSA set articles, Base Set pack text "11 Tradeable Game Cards" ([Elite Fourum pack guide](https://www.elitefourum.com/t/guide-to-identifying-all-wotc-base-set-booster-packs/41521)) | Official (printed on the pack) |
| Rare slot | 1 card, always a rare. The rare is a holo or a non-holo rare. | Bulbapedia, PSA set articles | High |
| Uncommon slots | 3 | Bulbapedia ("generally 3 Uncommon cards"), PSA | High |
| Other slots | 7 cards. Sources disagree on the energy count (see below). | PSA, ThePriceDex | Conflict |
| Holo rate | About 1 in 3 packs | PSA set articles, ThePriceDex, Loose Packs weight study | Community estimate, with empirical support for most sets |
| Reverse holo | None. Reverse holos start with Legendary Collection. | Bulbapedia | High |
| Packs per booster box | 36 | PSA set articles, auction listings | High |
| Boxes per case | 6 (one Fossil case listing only) | [Goldin](https://goldin.co/item/1999-pokemon-fossil-booster-1st-edition-wizards-of-the-coast-factory-sav9rc) | Low. Only one set is confirmed. |
| Print runs | 1st Edition and Unlimited. Base Set 2 has no 1st Edition. | Bulbapedia, PSA | High |

### The energy disagreement

- PSA and PullMarket give "seven common cards, three uncommon cards, and
  one rare card" for every set.
- ThePriceDex gives 6 commons and 1 energy for Base Set, Gym Heroes,
  Gym Challenge, and Neo Genesis. It gives 5 commons and 2 energy for
  Base Set 2.
- ThePriceDex gives 7 commons and no energy row for Jungle, Fossil,
  Team Rocket, Neo Discovery, Neo Revelation, and Neo Destiny.
- The Elite Fourum rarity guide describes separate basic energy sheets
  for Base Set, Base Set 2, and Gym Heroes.

For the simulation, the energy question changes only which bulk card
appears. It does not change the hit odds.

### How packs were assembled

An Elite Fourum study by sturzflugbombardieru rebuilt the print sheets
from uncut sheet photos and from recorded box openings. Its findings
for this era:

- Each rarity prints on its own sheet. Most sheets hold 121 cards
  (11 × 11). Holo sheets hold 110 cards (10 × 11).
- The rarity code shows how many times a card appears on its sheet.
  For example, "H7" is a holo that appears 7 times on the holo sheet.
- English packs mostly use "sequential collation". The machine cuts
  the sheet and stacks the cards in sheet order. So "each pack contains
  a run of cards from the sheet".
- A Belgian print of Neo Discovery used "striped collation".

This study gives per-card weights, but it does not describe the order
of the cards inside one pack.

## Pack order

**Confidence: low.** No source that we found shows a card-by-card
record of an opened WotC pack. Two community sources disagree.

- **Claim A.** [CardCollector — The Pokémon Card Trick](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)
  lists "3" for Base Set, Jungle, Fossil, Base Set 2, Team Rocket,
  Gym Heroes, Gym Challenge, and all four Neo sets. The trick is:
  "you need to have the back of the cards facing you", then "take the
  card that's closest to you, and put it to the front. Do this another
  two times." After that, "the rare card will be the last one you
  reveal". The page gives no method or evidence.
- **What Claim A means (our derivation).** Three cards sit behind the
  rare. When the player shows the cards from the front of the stack to
  the back, the rare is **card 8 of 11**. So the rare is the fourth card
  from the end. It is **not** one of the last three cards.
- **Claim B.** [NinePocket — The Pokémon Pack Trick](https://www.ninepocket.net/guides/pokemon-pack-trick)
  says: "Packs from Black & White and earlier did not follow one
  reliably documented internal order, so nothing consistently puts the
  rare last." The page gives no evidence.
- **Energy card position:** Unknown.
- **Commons and uncommons position:** Unknown.
- **Direction:** Unknown. No source says which way the cards face
  inside the wrapper. If the player shows the stack from the other end,
  Claim A puts the rare at card 4 of 11.

### Suggested default for the rip screen

Put the rare slot at card 8 of 11, with 3 bulk cards after it. This
follows Claim A, the only source with a position. It makes every set in
this era an exception to the "last three cards" rule in
[../../18-ripping.md](../../18-ripping.md#where-the-hit-sits). Replace
this default when a better source shows real opened packs.

## Rarity system

- **Common, Uncommon, Rare:** the three base rarities (Bulbapedia).
- **Rare Holo:** a rare with holofoil in the artwork window. It fills
  the rare slot.
- **Basic Energy:** no rarity symbol. PSA counts 6 "no-rarity Energy
  cards" in Base Set.
- **Secret rare:** a card numbered above the set total. The first one
  is Dark Raichu in Team Rocket.
- **Shining Pokémon:** a secret rare type in Neo Revelation and
  Neo Destiny.

## Sets in this era

| Set | English release | Cards | 1st Edition | Set file |
|---|---|---|---|---|
| Base Set | January 9, 1999 | 102 | Yes | [base-set.md](../base-set.md) |
| Jungle | June 16, 1999 | 64 | Yes | [jungle.md](../jungle.md) |
| Fossil | October 10, 1999 | 62 | Yes | [fossil.md](../fossil.md) |
| Base Set 2 | February 24, 2000 | 130 | No | [base-set-2.md](../base-set-2.md) |
| Team Rocket | April 24, 2000 | 82 + 1 secret | Yes | [team-rocket.md](../team-rocket.md) |
| Gym Heroes | August 14, 2000 | 132 | Yes | [gym-heroes.md](../gym-heroes.md) |
| Gym Challenge | October 16, 2000 | 132 | Yes | [gym-challenge.md](../gym-challenge.md) |
| Neo Genesis | December 16, 2000 | 111 | Yes | [neo-genesis.md](../neo-genesis.md) |
| Neo Discovery | June 1, 2001 | 75 | Yes | [neo-discovery.md](../neo-discovery.md) |
| Neo Revelation | September 21, 2001 | 64 + 2 secret | Yes | [neo-revelation.md](../neo-revelation.md) |
| Neo Destiny | February 28, 2002 | 105 + 8 secret | Yes (the last English set with it) | [neo-destiny.md](../neo-destiny.md) |
| Legendary Collection | May 24, 2002 | 110 | No data here | Other research task |

Release dates and card counts come from the
[Bulbapedia expansion list](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions).

### Excluded: no booster packs of its own

- **Southern Islands** (July 31, 2001): 18 cards in a collection
  folder. It had no Southern Islands booster packs. The folder held
  "three packs from the new Neo era, a mix of Neo Discovery and Neo
  Genesis" ([Going Twice](https://www.goingtwice.com/blogs/pokemon/the-southern-islands-collection)).
  Set file: [southern-islands.md](../southern-islands.md).

## Sets that break the template

- **Base Set 2:** no 1st Edition print. ThePriceDex gives 2 energy per
  pack, not 1.
- **Jungle:** some 1st Edition packs hold an error Pikachu promo. Some
  error packs hold "ONLY promo Pikachus in the uncommon slot".
- **Team Rocket:** the first secret rare (Dark Raichu, 83/82). Its
  rarity matches the other holos.
- **Neo Genesis:** the first artificial rarity inside the holo slot.
  The six holos of the final starter forms are rarer (about 1 in 82.5
  packs each).
- **Neo Revelation:** two Shining Pokémon secret rares. The set has
  only 13 non-holo rares.
- **Neo Destiny:** eight Shining Pokémon, rarer than holos. An
  Unlimited error print run puts extra Shining Pokémon in a common slot.
- **Legendary Collection (other task):** adds a reverse holo to every
  pack. CardCollector lists "No card trick" for it.

## Sources

- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Elite Fourum — The English Pokémon card rarity guide (sturzflugbombardieru, 2024)](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762)
- [CardCollector — The Pokémon Card Trick](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)
- [NinePocket — The Pokémon Pack Trick](https://www.ninepocket.net/guides/pokemon-pack-trick)
- [Loose Packs — Pokémon Pack Weight Guide](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide)
- [PullMarket — Pokémon Original Sets Guide](https://pullmarket.io/learn/pokemon-original-sets-guide)
- [ThePriceDex — Base Set pull rates](https://www.thepricedex.com/set/base1/base/pull-rates) (and the per-set pages linked from each set file)
- [Goldin — 1999 Fossil 1st Edition booster case](https://goldin.co/item/1999-pokemon-fossil-booster-1st-edition-wizards-of-the-coast-factory-sav9rc)
- [Going Twice — The Southern Islands Collection](https://www.goingtwice.com/blogs/pokemon/the-southern-islands-collection)
- PSA set articles: see each set file.

## Open topics

- **Pack order.** Find a source that shows real opened WotC packs card
  by card. Confirm or reject Claim A (rare at card 8 of 11).
- **Card direction in the wrapper.** Find which way the card faces
  point when the wrapper front faces the player.
- **Energy slot.** Resolve 7 commons vs. 6 commons and 1 energy vs.
  5 commons and 2 energy, per set.
- **Printed odds.** Bulbapedia says "early Wizards of the Coast sets
  even provided approximate odds for pulling Holo Rares". We did not
  find the printed text.
- **Boxes per case.** Only one Fossil listing confirms 6 boxes per case.
- **Blister products.** Single-pack blisters exist for some sets. Bulbapedia
  says Team Rocket was "the first set not to be packaged in cardboard
  backed blister packs". The full blister history is unknown.
