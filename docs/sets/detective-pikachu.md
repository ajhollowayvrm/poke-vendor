# Detective Pikachu (2019)

Set data for Detective Pikachu, a special expansion for the movie. It
has a 4-card pack and no booster boxes. The era template is in
[eras/sun-moon.md](eras/sun-moon.md), but this set does not follow it.
See [../13-sets.md](../13-sets.md) for the general approach.

## Release

- English release date: March 29, 2019 (Europe); April 5, 2019 (North
  America and Canada). Source: Bulbapedia.
- Abbreviation: DET. No English set number ("special expansion").
- Card count: 18 (9 Common Holo, 9 Rare Holo). No secret rares.
- Source: Bulbapedia.

## Pack structure

4 cards per pack. All 4 cards are holofoil.

| Slot | Count | Contents |
|------|-------|----------|
| Common Holo | 3 | Common Holo cards |
| Rare Holo | 1 | Rare Holo cards |
| Basic Energy | Unknown | No source says |
| Code card | Unknown | No source says |

- Sources: Bulbapedia ("Each booster pack contained four Holofoil
  cards"); Elite Fourum post 152 ("3 holofoil commons and 1 holofoil
  rare"); ThePriceDex (4 cards).
- Confidence: well documented.
- Every pack has one Rare Holo, so every pack has a hit.
- The Japanese Great Detective Pikachu set is different: 25 cards, 3
  commons plus 1 uncommon or better, 20-pack boxes. Do not use it for
  the English set.

## Pack order

**Unknown.** No source describes the order of the 4 cards.

- **Is the hit one of the last three cards?** Unknown. With 4 cards, the
  Rare Holo is in the last three unless it is the first card.
- Confidence: Unknown.

## Rarities and hit odds

| Rarity | Odds per pack | Confidence |
|--------|---------------|------------|
| Rare Holo (any) | 1 in 1 (every pack) | Well documented (pack structure) |
| One specific Rare Holo | 1 in 10 (ThePriceDex) | Conflict: see Open topics |
| One specific Common Holo | 1 in 2.7 (ThePriceDex) | Conflict: see Open topics |

Holo rare, GX, full art, rainbow, gold, and Prism Star cards: this set
has none of these rarities.

The Elite Fourum author assumes no artificial rarity differences between
cards. Mewtwo appeared the fewest times in a very small sample.

## Special subsets or mechanics

- Movie tie-in set. All cards are holofoil.
- Most products also hold other Sun & Moon Series packs.

## Sealed products

No booster boxes. Packs came only in set merchandise (Bulbapedia).

| Product | Detective Pikachu packs | Other packs | Collation |
|---------|------------------------|-------------|-----------|
| Detective Pikachu Collector Chest | 7 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Greninja-GX Case File | 5 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Charizard-GX Special Case File (GameStop) | 5 | 2 Sun & Moon Series (from the regular Case File) | Variable |
| Detective Pikachu Charizard-GX Case File | 4 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Mewtwo-GX Case File | 4 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Café Figure Collection | 4 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Tins (Walmart) | 4 | 0 | Variable |
| Detective Pikachu On the Case Figure Collection | 3 | 2 Sun & Moon Series | Variable |
| Detective Pikachu Case File | 2 | 1 Sun & Moon Series | Variable |
| Detective Pikachu Two Pack Blister (7-Eleven) | 1 | 1 Sun & Moon Series | Variable |
| Detective Pikachu Greninja-GX Special Case File | Unknown | Unknown | Unknown |

"Sun & Moon Series" packs: Bulbapedia does not name the set, so the mix
is Unknown. Source: Bulbapedia merchandise page.

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `det1`), fetched 2026-09-12. The list has 18 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.
- Where TCGdex records no Normal, Holo, or Reverse holo version of a card, the list adds that print type from the TCGplayer catalog (TCGCSV group `2409`, fetched 2026-09-12). This added 10 variants.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 1/18 | Bulbasaur | Pokémon (Grass) | Common | Normal |
| 2/18 | Ludicolo | Pokémon (Grass) | Rare | Normal, Holo |
| 3/18 | Morelull | Pokémon (Grass) | Common | Normal |
| 4/18 | Charmander | Pokémon (Fire) | Common | Normal |
| 5/18 | Charizard | Pokémon (Fire) | Ultra Rare | Normal, Holo |
| 6/18 | Arcanine | Pokémon (Fire) | Rare | Normal, Holo |
| 7/18 | Psyduck | Pokémon (Water) | Common | Normal |
| 8/18 | Magikarp | Pokémon (Water) | Common | Normal |
| 9/18 | Greninja | Pokémon (Water) | Ultra Rare | Normal, Holo |
| 10/18 | Detective Pikachu | Pokémon (Lightning) | Rare | Normal, Holo |
| 11/18 | Mr. Mime | Pokémon (Psychic) | Rare | Normal, Holo |
| 12/18 | Mewtwo | Pokémon (Psychic) | Ultra Rare | Normal, Holo |
| 13/18 | Machamp | Pokémon (Fighting) | Rare | Normal, Holo |
| 14/18 | Jigglypuff | Pokémon (Fairy) | Common | Normal |
| 15/18 | Snubbull | Pokémon (Fairy) | Common | Normal |
| 16/18 | Lickitung | Pokémon (Colorless) | Common | Normal |
| 17/18 | Ditto | Pokémon (Colorless) | Ultra Rare | Normal, Holo |
| 18/18 | Slaking | Pokémon (Colorless) | Rare | Normal, Holo |

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

Confidence: this map follows the 4-card pack structure above. TCGdex
splits the Rare Holo cards into two rarities, Rare and Ultra Rare; the
Rare Holo outcome draws from both. TCGdex records the Common Holo cards
with only a Normal variant, not a Holo variant. Basic Energy and the
code card are Unknown for this set, so the map gives them no row of
their own beyond the placeholder below.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common Holo | 3 | Common Holo | Common Holo | Common | Normal | All | 100% |
| Rare Holo | 1 | Rare Holo | Rare Holo | Rare, Ultra Rare | Holo | All | 100% |
| Basic Energy | Unknown | Basic Energy | — | — | — | — | — |
| Code card | Unknown | Code card | — | — | — | — | — |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. Detective Pikachu packs
come only in special collections and boxes, each holding 4 cards;
there is no booster box. This set has only two rarities.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common Holo | Rarity | Every pack | No |
| 2 | Rare Holo | Rarity | Every pack | Yes |

## Sources

- [Bulbapedia — Detective Pikachu (TCG)](https://bulbapedia.bulbagarden.net/wiki/Detective_Pikachu_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Sun & Moon TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Sun_%26_Moon_TCG_Series_merchandise)
- [ThePriceDex — Detective Pikachu Pull Rates](https://www.thepricedex.com/set/det1/detective-pikachu/pull-rates)
- [Elite Fourum — Rarity Guide, Detective Pikachu (post 152)](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762/152)

## Open topics

- **Slot map:** TCGdex tags 4 of the 10 Rare Holo cards (Charizard,
  Greninja, Mewtwo, Ditto) as Ultra Rare rather than Rare. The Rare
  Holo outcome draws from both TCGdex rarities as one pool, since the
  set's rarity list has only Common Holo and Rare Holo.
- **Slot map:** TCGdex records the 8 Common Holo cards with only a
  Normal variant. No source confirms whether the physical print is
  holo, plain, or both.
- **Slot map:** Basic Energy and the code card are Unknown for this
  set. The map keeps a placeholder row for each with no odds.
- **Slot map:** the Normal variant of the 10 Rare and Ultra Rare cards
  stays unused. The Rare Holo outcome uses their Holo variant instead.
- **Pack order: Unknown.** Searched 2026-09-12: no pack-opening video
  or guide found for this set.
- **Per-card odds conflict.** With 9 Rare Holos and even weighting, one
  specific Rare Holo is 1 in 9 packs. ThePriceDex gives 1 in 10. With 9
  Common Holos and 3 per pack, one specific Common Holo is 1 in 3 packs.
  ThePriceDex gives 1 in 2.7. The method behind the ThePriceDex figures
  is Unknown.
- Basic Energy or code card in the pack: Unknown. Searched 2026-09-12:
  Bulbapedia states only "Each booster pack contained four Holofoil
  cards" and does not mention Basic Energy or a code card. No source
  found.
- The set of the "other Sun & Moon Series" packs in each product:
  Unknown.
