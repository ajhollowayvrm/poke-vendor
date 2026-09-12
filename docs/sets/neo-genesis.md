# Neo Genesis (2000)

Set data for Neo Genesis. The era template is in
[eras/wizards-of-the-coast.md](eras/wizards-of-the-coast.md). This file
records the Neo Genesis values and the differences from the template.

## Release

- **English release date:** December 16, 2000.
- **Set symbol:** yes (Bulbapedia). Abbreviation: Unknown. ThePriceDex
  uses the database ID `neo1`.
- **Card count:** 111. No secret rares. Cards 1 to 19 are holo rares
  (PSA).
- **1st Edition vs. Unlimited:** both exist (PSA, Loose Packs). PSA
  says collectors believe Neo cards had smaller print runs than the
  first-generation sets. No source shows a pull-rate difference.

## Pack structure

- 11 cards per pack.
- 1 rare slot and 3 uncommons.
- Sources disagree on the other 7 cards:
  - PSA: "seven common cards, three uncommon cards, and one rare card".
  - ThePriceDex: 6 commons and 1 energy.

## Pack order

Neo Genesis follows the era pack order. See
[eras/wizards-of-the-coast.md](eras/wizards-of-the-coast.md#pack-order).

- **Claim A** ([CardCollector](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)):
  "3" for Neo Genesis. The rare is card 8 of 11, the fourth card from
  the end (our derivation). **Not** one of the last three.
  Confidence: low.
- **Claim B** ([NinePocket](https://www.ninepocket.net/guides/pokemon-pack-trick)):
  no reliable order for this era. Confidence: low.
- **Energy card position:** Unknown.

## Rarities and hit odds

| Figure | Value | Source | Confidence |
|---|---|---|---|
| Rare slot | 1 per pack, always | PSA | High |
| Holo | About 1 in 3 packs | [PSA](https://www.psacard.com/articles/articleview/9409/psa-set-registry-collecting-2000-poke-mon-neo-genesis-1st-edition), [ThePriceDex](https://www.thepricedex.com/set/neo1/neo-genesis/pull-rates) | Community estimate |
| Holo, Unlimited | 12 holos in 36 packs (1 box) = 33.3% | [Loose Packs](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide) | Empirical study (small sample) |
| Holo, 1st Edition | 23 holos in 107 packs (3 boxes) = 21.5% | Loose Packs | Empirical study. Conflicts with the 1 in 3 figure. |
| Non-holo rare | About 1 in 1.5 packs | ThePriceDex | Community estimate |
| Holo sheet weights | "H7, H6 and H4 cards" | [Elite Fourum rarity guide](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762) | Empirical study (sheet reconstruction) |
| Final starter holos (each) | 1 in 82.5 packs | Elite Fourum | Empirical study |

### The starter holos

The Elite Fourum guide says: "The six cards featuring the final states
of the starters are among the seven cards with the lowest observed pull
rates". The guide adds: "with a pull rate of 1 : 82.5, these are the
rarest Pokémon cards to appear to date." These are H4 cards. The other
holos are H7 or H6.

This is the first set in the era with an artificial rarity difference
among valuable cards. The simulation must not weight all 19 holos
equally.

## Special subsets and mechanics

- **Baby Pokémon:** "They evolve into Basic Pokémon" (Bulbapedia).
- **New energy types:** Darkness Energy and Metal Energy (Bulbapedia).
- **Pokémon Tools:** a new Trainer subclass (Bulbapedia).
- **Card design:** "the Evolution box was changed to a circular design,
  HP was changed to black text instead of red" (Bulbapedia).
- **Art change:** Moo-Moo Milk has a different English illustration
  (Bulbapedia).

## Sealed products

| Product | Packs | Collation | Source |
|---|---|---|---|
| Booster box | 36 | Variable per pack | PSA |
| Booster case | Unknown | Unknown | — |
| Southern Islands Collection | 3 packs in total, "a mix of Neo Discovery and Neo Genesis". The split per set is unknown. | Unknown | [Going Twice](https://www.goingtwice.com/blogs/pokemon/the-southern-islands-collection), [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Southern_Islands_(TCG)) |
| Blister | Unknown | Unknown | — |

Pack wrapper arts: Unknown.

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. The six final starter holos
pull rarer than the other holos, but they still hold Rare Holo rarity,
so the stop rule does not split them into their own entry.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Rare | Rarity | 1 in 1.5 | Yes |
| 4 | Rare Holo | Rarity | 1 in 3 | Yes |

## Sources

- [Bulbapedia — Neo Genesis (TCG)](https://bulbapedia.bulbagarden.net/wiki/Neo_Genesis_(TCG))
- [PSA — Collecting the 2000 Pokémon Neo Genesis 1st Edition Set](https://www.psacard.com/articles/articleview/9409/psa-set-registry-collecting-2000-poke-mon-neo-genesis-1st-edition)
- [ThePriceDex — Neo Genesis pull rates](https://www.thepricedex.com/set/neo1/neo-genesis/pull-rates)
- [Loose Packs — Pokémon Pack Weight Guide](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide)
- [Elite Fourum — The English Pokémon card rarity guide](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762)
- [Going Twice — The Southern Islands Collection](https://www.goingtwice.com/blogs/pokemon/the-southern-islands-collection)
- [Bulbapedia — Southern Islands (TCG)](https://bulbapedia.bulbagarden.net/wiki/Southern_Islands_(TCG))
- [CardCollector — The Pokémon Card Trick](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)
- [NinePocket — The Pokémon Pack Trick](https://www.ninepocket.net/guides/pokemon-pack-trick)

## Open topics

- Pack order: see the era file. No Neo Genesis-specific source exists.
- Energy count: 7 commons (PSA) vs. 6 commons and 1 energy
  (ThePriceDex).
- Holo rate conflict: about 33% (PSA, ThePriceDex, Loose Packs
  Unlimited) vs. 21.5% (Loose Packs 1st Edition, 107 packs). Loose
  Packs says the weights "overlap" for this set. It does not explain
  the low count.
- Which holos are H7 and which are H6: Unknown.
- The counts of rares, uncommons, and commons: Unknown.
- Wrapper arts, boxes per case, and blister formats: Unknown.
- **Rarity list order:** Rare Holo uses 1 in 3 from PSA and ThePriceDex. Loose Packs gives 21.5% for 1st Edition packs (23 holos in 107 packs).
