# Paldean Fates (2024)

Set data for Paldean Fates, the second special set of the Scarlet & Violet
era. The shared pack template, pack order, and rarity system are in
[eras/scarlet-violet.md](eras/scarlet-violet.md). This file records the set
data and every exception. See [../13-sets.md](../13-sets.md) for the general
approach.

## Release

- **English release:** January 26, 2024.
- **Set code:** PAF.
- **Card count:** 245 cards. The main set has 91 cards. The secret rares are
  154 cards, numbered 92/91 to 245/91.
- The Japanese source set, Shiny Treasure ex, has 360 cards. Do not use the
  Japanese count.

| Part | Rarity | Cards |
|---|---|---|
| Main set | Common | 41 |
| Main set | Uncommon | 24 |
| Main set | Rare | 16 |
| Main set | Double Rare | 10 |
| Secret rares | Shiny Rare | 120 |
| Secret rares | Shiny Ultra Rare | 12 |
| Secret rares | Ultra Rare | 5 |
| Secret rares | Illustration Rare | 3 |
| Secret rares | Special Illustration Rare | 8 |
| Secret rares | Hyper Rare | 6 |

The counts come from the Bulbapedia set list. TCGplayer gives the same
counts.

## Pack structure

12 cards per pack: 10 set cards, 1 Basic Energy card, and 1 code card.

| Slot | Count | Can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo slot 1 | 1 | Reverse Holo, **Shiny Rare, Shiny Ultra Rare** |
| Reverse holo slot 2 | 1 | Reverse Holo, Illustration Rare, Special Illustration Rare, Hyper Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare |
| Basic Energy | 1 | Basic Energy card |
| Code card | 1 | Pokémon TCG Live code card |

**Confidence:** TCGplayer's opened-pack study places the Shiny Rare and the
Shiny Ultra Rare in "the first Reverse Holo slot". Bulbapedia's table agrees.
The Basic Energy and code card come from era-wide sources only.

**Exception:** reverse holo slot 1 can hold a Shiny Rare or a Shiny Ultra
Rare. In main sets, this slot holds only a Reverse Holo.

## Pack order

| Position | Slot |
|---|---|
| 1–4 | Common |
| 5–7 | Uncommon |
| 8 | Reverse holo slot 1 (Shiny Rare, Shiny Ultra Rare) |
| 9 | Reverse holo slot 2 (Illustration Rare, Special Illustration Rare, Hyper Rare) |
| 10 | Rare slot (Double Rare, Ultra Rare) |
| 11 | Basic Energy |
| 12 | Code card |

**Confidence: industry news report before release** (PokeBeach, era-wide,
about the Scarlet & Violet set). No source in this research shows an opened
pack of this set card by card.

- **Double Rare and Ultra Rare:** card 10, the third card from the end. It is
  one of the last three cards.
- **Illustration Rare, Special Illustration Rare, and Hyper Rare:** card 9,
  the fourth card from the end. It is not one of the last three cards.
- **Shiny Rare and Shiny Ultra Rare:** card 8, the fifth card from the end.
  It is not one of the last three cards. About one in three packs holds a
  shiny card here.
- If the rip screen hides the code card, card 9 is the third card from the
  end, and card 8 is the fourth.
- **Era conflicts** (Hyper Rare slot, last card): see the era file.

## Rarities and hit odds

Primary source: the TCGplayer Authentication Center opened more than 1,500
packs. This sample is smaller than for main sets, so the intervals are wider.
The ranges are 95% confidence intervals. The specific-card figures assume that
each card of a rarity has the same pull rate.

| Rarity | Slot | Cards | Any card of the rarity, per pack | Specific card, per pack | Confidence |
|---|---|---|---|---|---|
| Rare | Rare slot | 16 | 77.50% | Unknown | Derived from the empirical study (100% minus Double Rare and Ultra Rare) |
| Double Rare | Rare slot | 10 | 15.89% ± 1.69% (1 in 6) | 1.59% ± 0.58% (1 in 63) | Empirical study |
| Ultra Rare | Rare slot | 5 | 6.61% ± 1.15% (1 in 15) | 1.32% ± 0.53% (1 in 76) | Empirical study |
| Reverse Holo (in reverse holo slot 1) | Reverse holo slot 1 | — | 66.84% | — | Derived from the empirical study |
| Shiny Rare | Reverse holo slot 1 | 120 | 25.44% ± 2.01% (1 in 4) | 0.21% ± 0.21% (1 in 472) | Empirical study |
| Shiny Ultra Rare | Reverse holo slot 1 | 12 | 7.72% ± 1.23% (1 in 13) | 0.64% ± 0.37% (1 in 155) | Empirical study |
| Reverse Holo (in reverse holo slot 2) | Reverse holo slot 2 | — | 89.45% | — | Derived from the empirical study |
| Illustration Rare | Reverse holo slot 2 | 3 | 7.22% ± 1.20% (1 in 14) | 2.41% ± 0.71% (1 in 42) | Empirical study |
| Special Illustration Rare | Reverse holo slot 2 | 8 | 1.72% ± 0.60% (1 in 58) | 0.22% ± 0.21% (1 in 465) | Empirical study |
| Hyper Rare | Reverse holo slot 2 | 6 | 1.61% ± 0.58% (1 in 62) | 0.27% ± 0.24% (1 in 372) | Empirical study |
| ACE SPEC Rare | — | 0 | Not in this set | — | — |

Other figures:

- **Any shiny card in reverse holo slot 1:** "roughly 1 in 3" packs
  (TCGplayer). The table figures sum to 33.16%. Empirical study.
- **Shiny Tera Charizard ex (Special Illustration Rare):** 0.22% per pack
  (TCGplayer). Empirical study.
- After 1,500 packs, TCGplayer had not found some Shiny Rare cards at all.
  The specific Shiny Rare figure is therefore weak.

## Special subsets and mechanics

### Shiny subset

- 132 of the 154 secret rares are shiny cards: 120 Shiny Rares and 12 Shiny
  Ultra Rares (TCGplayer, Bulbapedia).
- Shiny Rares are shiny versions of non-ex Pokémon. Shiny Ultra Rares are
  shiny Full Art Pokémon ex (TCGplayer).
- Bulbapedia says the Shiny Rare and Shiny Ultra Rare rarities appear in
  Paldean Fates only.

### God packs

- A community guide (Pullmarket) lists Paldean Fates as a god pack set with
  "10 cards, all Shiny SIR / SAR". "SAR" is a Japanese rarity name. The guide
  may describe the Japanese set. Confidence: community claim, unverified.
- Social media posts claim English god packs. This research found no reliable
  source that confirms an English god pack, its contents, or its odds.
- Status: Unknown.

## Sealed products

Paldean Fates has **no booster box**. Bulbapedia says single packs "cannot be
purchased separately". They come only in set products. The Bulbapedia
merchandise list has no Paldean Fates Booster Display Box.

| Product | Packs of this set |
|---|---|
| Elite Trainer Box (Mimikyu promo) | 9 |
| Pokémon Center Elite Trainer Box | 11 |
| Booster Bundle | 6 |
| Premium Collections | 8 |
| Tins | 5 (hexagonal) or 4 (octagonal) |
| Tech Sticker Collections | 3 |
| Mini Tins | 2 |
| Paldean Fates Mini Tin 5-Pack | 5 Mini Tins. Each Mini Tin holds 2 packs. |
| Poké Ball & Paldean Fates Mini Tin 3-Pack | Unknown |
| Charizard ex Special Collection (June 27, 2025) | Unknown |

- Pack counts per product are fixed.
- Hits per product: Unknown.

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. Paldean Fates has no
booster box; packs came only in Elite Trainer Boxes and other set
products. Reverse holo slot 1 can hold a Shiny Rare or a Shiny Ultra
Rare instead of a plain reverse holo.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | 77.50% | Yes |
| 5 | Shiny Rare | Rarity | 25.44% | Yes |
| 6 | Double Rare | Rarity | 15.89% | Yes |
| 7 | Shiny Ultra Rare | Rarity | 7.72% | Yes |
| 8 | Illustration Rare | Rarity | 7.22% | Yes |
| 9 | Ultra Rare | Rarity | 6.61% | Yes |
| 10 | Special Illustration Rare | Rarity | 1.72% | Yes |
| 11 | Hyper Rare | Rarity | 1.61% | Yes |

## Sources

- [Bulbapedia — Paldean Fates (TCG)](https://bulbapedia.bulbagarden.net/wiki/Paldean_Fates_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Scarlet & Violet TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Scarlet_%26_Violet_TCG_Series_merchandise)
- [PokeBeach — "Scarlet & Violet" Booster Pack Configuration Finally Revealed](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes)
- [TCGplayer — Paldean Fates Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Paldean-Fates-Pull-Rates/23de3e93-0d0f-4ae0-abc4-13664f3001a3/)
- [Pullmarket — Pokémon God Pack: What It Is, the Odds, and the 151 God Pack](https://pullmarket.io/learn/pokemon-god-pack)

## Open topics

- **God packs.** Confirm whether English god packs exist, what they hold,
  and their odds.
- **TCGplayer text conflicts.** The Illustration Rare text says "Around 8-9%"
  but the table says 7.22%. The Special Illustration Rare heading says "1 in
  32" but the table says 1 in 58. This file uses the tables.
- **Small sample.** Only about 1,500 packs. The specific-card intervals are
  as wide as the rates.
- **Physical pack order.** No opened-pack source confirms it for this set.
- **Basic Energy and code card.** No set-specific source confirms them.
- **Era conflicts:** the Hyper Rare slot and the last card.
- **Pack counts** for the Mini Tin 3-Pack and the Charizard ex Special
  Collection: Unknown.
- **Rarity list order:** by this file's odds, Illustration Rare (7.22%) is more common than Ultra Rare (6.61%), even though Ultra Rare is the higher secret-rare tier by name.
