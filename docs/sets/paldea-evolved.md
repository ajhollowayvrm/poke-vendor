# Paldea Evolved (2023)

Set data for Paldea Evolved. The shared pack template, pack order, and rarity
system are in [eras/scarlet-violet.md](eras/scarlet-violet.md). This file
records the set data and every exception. See [../13-sets.md](../13-sets.md)
for the general approach.

## Release

- **English release:** June 9, 2023.
- **Set code:** PAL.
- **Card count:** 279 cards. The main set has 193 cards. The secret rares are
  86 cards, numbered 194/193 to 279/193.

| Part | Rarity | Cards |
|---|---|---|
| Main set | Common | 81 |
| Main set | Uncommon | 70 |
| Main set | Rare | 25 |
| Main set | Double Rare | 17 |
| Secret rares | Ultra Rare | 26 |
| Secret rares | Illustration Rare | 36 |
| Secret rares | Special Illustration Rare | 15 |
| Secret rares | Hyper Rare | 9 |

The counts come from the Bulbapedia set list. TCGplayer gives the same
counts.

## Pack structure

12 cards per pack: 10 set cards, 1 Basic Energy card, and 1 code card.

| Slot | Count | Can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo slot 1 | 1 | Reverse Holo |
| Reverse holo slot 2 | 1 | Reverse Holo, Illustration Rare, Special Illustration Rare, Hyper Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare |
| Basic Energy | 1 | Basic Energy card |
| Code card | 1 | Pokémon TCG Live code card |

**Confidence:** era-wide sources (PokeBeach report before release, Bulbapedia
table). TCGplayer's opened-pack study confirms the slot for each rarity in
this set. No source confirms the Basic Energy and code card for this set
specifically.

## Pack order

| Position | Slot |
|---|---|
| 1–4 | Common |
| 5–7 | Uncommon |
| 8 | Reverse holo slot 1 (Reverse Holo only) |
| 9 | Reverse holo slot 2 (Illustration Rare, Special Illustration Rare, Hyper Rare) |
| 10 | Rare slot (Double Rare, Ultra Rare) |
| 11 | Basic Energy |
| 12 | Code card |

**Confidence: industry news report before release** (PokeBeach, era-wide).
No source in this research shows an opened pack of this set card by card.

- **Double Rare and Ultra Rare:** card 10, the third card from the end. It is
  one of the last three cards.
- **Illustration Rare, Special Illustration Rare, and Hyper Rare:** card 9,
  the fourth card from the end. It is not one of the last three cards. If the
  rip screen hides the code card, card 9 is the third card from the end.
- **Exceptions for this set:** none found beyond the era conflicts (Hyper
  Rare slot, last card). See the era file.

## Rarities and hit odds

Primary source: the TCGplayer Authentication Center opened more than 8,000
packs. The ranges are 95% confidence intervals. The specific-card figures
assume that each card of a rarity has the same pull rate.

| Rarity | Slot | Cards | Any card of the rarity, per pack | Specific card, per pack | Confidence |
|---|---|---|---|---|---|
| Rare | Rare slot | 25 | 79.64% | Unknown | Derived from the empirical study (100% minus Double Rare and Ultra Rare) |
| Double Rare | Rare slot | 17 | 13.72% ± 0.73% (1 in 7) | 0.81% ± 0.19% (1 in 124) | Empirical study |
| Ultra Rare | Rare slot | 26 | 6.64% ± 0.53% (1 in 15) | 0.26% ± 0.11% (1 in 391) | Empirical study |
| Reverse Holo (in reverse holo slot 2) | Reverse holo slot 2 | — | 87.37% | — | Derived from the empirical study |
| Illustration Rare | Reverse holo slot 2 | 36 | 7.70% ± 0.56% (1 in 13) | 0.21% ± 0.10% (1 in 468) | Empirical study |
| Special Illustration Rare | Reverse holo slot 2 | 15 | 3.17% ± 0.37% (1 in 32) | 0.21% ± 0.10% (1 in 473) | Empirical study |
| Hyper Rare | Reverse holo slot 2 | 9 | 1.76% ± 0.28% (1 in 57) | 0.20% ± 0.09% (1 in 512) | Empirical study |
| ACE SPEC Rare | — | 0 | Not in this set | — | — |
| Shiny Rare | — | 0 | Not in this set | — | — |
| Shiny Ultra Rare | — | 0 | Not in this set | — | — |

Other figures:

- **Any Ultra Rare, Illustration Rare, Special Illustration Rare, or Hyper
  Rare:** about 18% of packs (TCGplayer). Empirical study.
- TCGplayer found the rates "at most 0.1% off" from Scarlet & Violet. The
  difference is not statistically significant.

## Special subsets and mechanics

- No ACE SPEC Rare and no shiny subset.
- No source in this research reports a god pack or a demi-god pack for this
  set.

## Sealed products

| Product | Packs of this set |
|---|---|
| Booster Display Box | 36. An 18-pack half display was also sold in European countries. |
| Elite Trainer Box | 9 |
| Pokémon Center Elite Trainer Box | 11 |
| Booster Bundle | 6 |
| Build & Battle Box | 4 |
| Build & Battle Stadium | 2 Build & Battle Boxes plus 3 packs (see Open topics) |
| Collector's Kit | 1 |
| Blisters | Unknown per blister |

Multi-set products with packs of this set. Bulbapedia calls these mixes
"typical", so the mix is variable:

- Paldea Legends Tins: 5 packs (hexagonal) or 4 packs (octagonal), usually 2
  Paldea Evolved.
- Trainer's Toolkit 2023: 4 packs, usually 2 Paldea Evolved.
- Annihilape ex Box: 4 packs, usually 2 Paldea Evolved.
- Charizard ex Premium Collection: 6 packs, usually 2 Paldea Evolved.

Collation:

- Boxes per case: 6 (era-wide retailer consensus; see
  [eras/scarlet-violet.md](eras/scarlet-violet.md#sealed-product-template)).
- Hits per booster box: Unknown.

<!-- product-catalog:start (generated by tools/ppt/sealed_catalog.py; do not edit) -->
### Product catalog

Every physical sealed product that the TCGplayer catalog (TCGCSV) lists for this set, fetched 2026-09-12. Code cards, and deck products with no booster pack (fixed cards, no random pull), are left out.

- **Packs** is the number of booster packs. **Packs from** names the source: the TCGplayer description, the product name, the Bulbapedia TCG merchandise page for the series, the set file's own table (Build & Battle Stadium: boxes × 4 plus the extra packs), or a default for the kind (booster box 36, booster bundle 6, Build & Battle Box 4). Check a default before the game uses it. "Research" means a researched entry in `tools/ppt/sealed_overrides.json`, with its sources. "(raised)" means that Bulbapedia and the TCGplayer description show a higher count than the first read. For a listing of several units, such as "[Set of 3]" or "Mini Tins 5-Pack", Packs is the total for all units.
- **Pack mix** is the number of packs from each set, from `tools/ppt/sealed_contents.py`. Mixes are typical, not guaranteed. "unknown set" means that no source names the set. "<series> Series (set unknown)" means that the source names only the series.
- **Mix confidence**: Exact (every pack has a named set), Partial (some packs have no named set), Product set (a single-set product with no mix stated), Conflict (the sources disagree), or Unknown (no mix).
- **Holds** is what a case or a display holds.
- **Release** is the quarter from the TCGplayer release date. "(set)" means the quarter of the set's release date.
- **PPT price** is Yes when PokemonPriceTracker has a price. Prices are in `tools/ppt/cache/sealed/`, not in the docs.

TCGplayer group `23120`: 27 products.

| TCGplayer ID | Product | Kind | Packs | Packs from | Pack mix | Mix confidence | Holds | Release | PPT price |
|---|---|---|---|---|---|---|---|---|---|
| 496908 | Paldea Evolved 3 Pack Blister [Set of 2] | Blister | 6 | Description | 6 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493997 | Paldea Evolved 3 Pack Blister [Tinkatink] | Blister | 3 | Description | 3 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493998 | Paldea Evolved 3 Pack Blister [Varoom] | Blister | 3 | Description | 3 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 622968 | Paldea Evolved Premium Checklane Blister [Arboliva] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 622967 | Paldea Evolved Premium Checklane Blister [Pawmot] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 618829 | Paldea Evolved Single Pack Blister [Armarouge] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 617015 | Paldea Evolved Single Pack Blister [Dondonzo] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 494001 | Paldea Evolved Single Pack Blister [Growlithe] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493999 | Paldea Evolved Single Pack Blister [Smoliv] | Blister | 1 | Description | 1 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493975 | Paldea Evolved Booster Box | Booster box | 36 | Description | 36 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 649413 | Paldea Evolved Half Booster Box | Booster box | 18 | Description | 18 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 496914 | Paldea Evolved Booster Bundle | Booster bundle | 6 | Description | 6 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493976 | Paldea Evolved Booster Pack | Booster pack | 1 | Kind default | 1 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 496913 | Paldea Evolved Booster Pack Art Bundle [Set of 5] | Booster pack | 5 | Name | 5 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 530106 | Paldea Evolved Fun Pack | Booster pack | 1 | Kind default | 1 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 496927 | Paldea Evolved Sleeved Booster Pack | Booster pack | 1 | Kind default | 1 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 502480 | Paldea Evolved Sleeved Booster Pack Art Bundle [Set of 5] | Booster pack | 5 | Name | 5 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 496929 | Paldea Evolved Build & Battle Box | Build & Battle | 4 | Description | 4 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 496935 | Paldea Evolved Build & Battle Stadium | Build & Battle | 11 | Set file | 11 Paldea Evolved | Product set | — | 2023 Q2 (set) | Yes |
| 496905 | Paldea Evolved Booster Box Case | Case or display | — | — | — | — | 6 booster boxes | 2023 Q2 (set) | Yes |
| 656928 | Paldea Evolved Booster Bundle Case | Case or display | — | — | — | — | 25 booster bundles | 2023 Q2 (set) | No |
| 496931 | Paldea Evolved Build & Battle Box Display | Case or display | — | — | — | — | Unknown number of build & battle boxes | 2023 Q2 (set) | Yes |
| 496911 | Paldea Evolved Elite Trainer Box Case | Case or display | — | — | — | — | Unknown number of elite trainer boxes | 2023 Q2 (set) | Yes |
| 537410 | Paldea Evolved Pokemon Center Elite Trainer Box (Exclusive) Case | Case or display | — | — | — | — | Unknown | 2023 Q2 (set) | Yes |
| 609027 | Paldea Evolved Sleeved Booster Case | Case or display | — | — | — | — | Unknown number of sleeved boosters | 2023 Q2 (set) | Yes |
| 493974 | Paldea Evolved Elite Trainer Box | Elite Trainer Box | 9 | Description | 9 Paldea Evolved | Exact | — | 2023 Q2 (set) | Yes |
| 493973 | Paldea Evolved Pokemon Center Elite Trainer Box (Exclusive) | Elite Trainer Box | 11 | Description | 9 Paldea Evolved | Partial | — | 2023 Q2 (set) | Yes |
<!-- product-catalog:end -->

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv02`), fetched 2026-09-12. The list has 279 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/193 | Hoppip | Pokémon (Grass) | Common | Normal, Reverse holo |
| 002/193 | Skiploom | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 003/193 | Jumpluff | Pokémon (Grass) | Rare | Holo, Reverse holo |
| 004/193 | Pineco | Pokémon (Grass) | Common | Normal, Reverse holo |
| 005/193 | Forretress ex | Pokémon (Grass) | Double rare | Holo |
| 006/193 | Heracross | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 007/193 | Tropius | Pokémon (Grass) | Common | Normal, Reverse holo |
| 008/193 | Combee | Pokémon (Grass) | Common | Normal, Reverse holo |
| 009/193 | Vespiquen | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 010/193 | Snover | Pokémon (Grass) | Common | Normal, Reverse holo |
| 011/193 | Abomasnow | Pokémon (Grass) | Rare | Holo, Reverse holo |
| 012/193 | Sprigatito | Pokémon (Grass) | Common | Normal, Normal (Horizons), Reverse holo |
| 013/193 | Sprigatito | Pokémon (Grass) | Common | Normal, Reverse holo |
| 014/193 | Floragato | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 015/193 | Meowscarada ex | Pokémon (Grass) | Double rare | Holo |
| 016/193 | Tarountula | Pokémon (Grass) | Common | Normal, Reverse holo |
| 017/193 | Tarountula | Pokémon (Grass) | Common | Normal, Reverse holo |
| 018/193 | Spidops | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 019/193 | Nymble | Pokémon (Grass) | Common | Normal, Reverse holo |
| 020/193 | Nymble | Pokémon (Grass) | Common | Normal, Reverse holo |
| 021/193 | Lokix | Pokémon (Grass) | Rare | Holo, Reverse holo |
| 022/193 | Bramblin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 023/193 | Bramblin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 024/193 | Brambleghast | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 025/193 | Rellor | Pokémon (Grass) | Common | Normal, Reverse holo |
| 026/193 | Rellor | Pokémon (Grass) | Common | Normal, Reverse holo |
| 027/193 | Wo-Chien ex | Pokémon (Grass) | Double rare | Holo |
| 028/193 | Paldean Tauros | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 029/193 | Fletchinder | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 030/193 | Talonflame | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 031/193 | Litleo | Pokémon (Fire) | Common | Normal, Reverse holo |
| 032/193 | Pyroar | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 033/193 | Oricorio | Pokémon (Fire) | Rare | Holo, Reverse holo |
| 034/193 | Fuecoco | Pokémon (Fire) | Common | Normal, Reverse holo |
| 035/193 | Fuecoco | Pokémon (Fire) | Common | Normal, Reverse holo |
| 036/193 | Crocalor | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 037/193 | Skeledirge ex | Pokémon (Fire) | Double rare | Holo |
| 038/193 | Charcadet | Pokémon (Fire) | Common | Normal, Reverse holo |
| 039/193 | Charcadet | Pokémon (Fire) | Common | Normal, Reverse holo |
| 040/193 | Chi-Yu ex | Pokémon (Fire) | Double rare | Holo |
| 041/193 | Paldean Tauros | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 042/193 | Magikarp | Pokémon (Water) | Common | Normal, Reverse holo |
| 043/193 | Gyarados | Pokémon (Water) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 044/193 | Marill | Pokémon (Water) | Common | Normal, Reverse holo |
| 045/193 | Azumarill | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 046/193 | Delibird | Pokémon (Water) | Common | Normal, Normal (Snowflake), Reverse holo |
| 047/193 | Luvdisc | Pokémon (Water) | Common | Normal, Reverse holo |
| 048/193 | Eiscue | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 049/193 | Quaxly | Pokémon (Water) | Common | Normal, Reverse holo |
| 050/193 | Quaxly | Pokémon (Water) | Common | Normal, Reverse holo |
| 051/193 | Quaxwell | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 052/193 | Quaquaval ex | Pokémon (Water) | Double rare | Holo |
| 053/193 | Cetoddle | Pokémon (Water) | Common | Normal, Holo (Cosmos, Snowflake), Reverse holo |
| 054/193 | Cetoddle | Pokémon (Water) | Common | Normal, Reverse holo |
| 055/193 | Cetitan | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 056/193 | Veluza | Pokémon (Water) | Rare | Holo, Reverse holo |
| 057/193 | Frigibax | Pokémon (Water) | Common | Normal, Reverse holo |
| 058/193 | Frigibax | Pokémon (Water) | Common | Normal, Holo (Cosmos, Snowflake), Reverse holo |
| 059/193 | Arctibax | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 060/193 | Baxcalibur | Pokémon (Water) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 061/193 | Chien-Pao ex | Pokémon (Water) | Double rare | Holo, Holo (Jumbo), Holo (Snowflake) |
| 062/193 | Pikachu | Pokémon (Lightning) | Common | Normal, Normal (Rain city, Jumbo), Reverse holo |
| 063/193 | Pikachu ex | Pokémon (Lightning) | Double rare | Holo, Holo (Snowflake) |
| 064/193 | Raichu | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 065/193 | Magnemite | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 066/193 | Voltorb | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 067/193 | Electrode | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 068/193 | Shinx | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 069/193 | Shinx | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 070/193 | Luxio | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 071/193 | Luxray | Pokémon (Lightning) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 072/193 | Pincurchin | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 073/193 | Pincurchin | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 074/193 | Pawmi | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 075/193 | Pawmo | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 076/193 | Pawmot | Pokémon (Lightning) | Rare | Holo, Reverse holo |
| 077/193 | Tadbulb | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 078/193 | Tadbulb | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 079/193 | Bellibolt ex | Pokémon (Lightning) | Double rare | Holo |
| 080/193 | Wattrel | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 081/193 | Wattrel | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 082/193 | Kilowattrel | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 083/193 | Jigglypuff | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 084/193 | Wigglytuff | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 085/193 | Slowpoke | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 086/193 | Slowking ex | Pokémon (Psychic) | Double rare | Holo |
| 087/193 | Misdreavus | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 088/193 | Mismagius | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 089/193 | Spiritomb | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 090/193 | Gothita | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 091/193 | Gothorita | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 092/193 | Gothitelle | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 093/193 | Dedenne ex | Pokémon (Psychic) | Double rare | Holo |
| 094/193 | Oranguru | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 095/193 | Sandygast | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 096/193 | Palossand | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 097/193 | Mimikyu | Pokémon (Psychic) | Rare | Holo, Holo (Trick or trade), Reverse holo |
| 098/193 | Ceruledge | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 099/193 | Rabsca | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 100/193 | Tinkatink | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 101/193 | Tinkatink | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 102/193 | Tinkatink | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 103/193 | Tinkatuff | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 104/193 | Tinkatuff | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 105/193 | Tinkaton | Pokémon (Psychic) | Rare | Holo, Holo (Gamestop), Holo (Set logo), Holo (Cosmos), Reverse holo |
| 106/193 | Mankey | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 107/193 | Primeape | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 108/193 | Paldean Tauros | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 109/193 | Sudowoodo | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 110/193 | Larvitar | Pokémon (Fighting) | Common | Normal, Holo (Cosmos), Reverse holo |
| 111/193 | Pupitar | Pokémon (Fighting) | Uncommon | Normal, Holo (Cosmos), Reverse holo |
| 112/193 | Makuhita | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 113/193 | Hariyama | Pokémon (Fighting) | Rare | Holo, Reverse holo |
| 114/193 | Croagunk | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 115/193 | Toxicroak | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 116/193 | Rockruff | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 117/193 | Lycanroc ex | Pokémon (Fighting) | Double rare | Holo, Holo (Jumbo) |
| 118/193 | Passimian | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 119/193 | Falinks | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 120/193 | Nacli | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 121/193 | Nacli | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 122/193 | Naclstack | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 123/193 | Garganacl | Pokémon (Fighting) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 124/193 | Glimmet | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 125/193 | Glimmet | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 126/193 | Glimmora | Pokémon (Fighting) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 127/193 | Ting-Lu ex | Pokémon (Fighting) | Double rare | Holo |
| 128/193 | Paldean Wooper | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 129/193 | Paldean Wooper | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 130/193 | Paldean Clodsire ex | Pokémon (Darkness) | Double rare | Holo |
| 131/193 | Murkrow | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 132/193 | Honchkrow | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 133/193 | Sneasel | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 134/193 | Weavile | Pokémon (Darkness) | Rare | Holo, Reverse holo |
| 135/193 | Tyranitar | Pokémon (Darkness) | Rare | Holo, Holo (Set logo), Holo (Cosmos), Reverse holo |
| 136/193 | Sableye | Pokémon (Darkness) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 137/193 | Seviper | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 138/193 | Deino | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 139/193 | Zweilous | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 140/193 | Hydreigon | Pokémon (Darkness) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 141/193 | Maschiff | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 142/193 | Maschiff | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 143/193 | Mabosstiff | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 144/193 | Shroodle | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 145/193 | Shroodle | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 146/193 | Grafaiai | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 147/193 | Bombirdier | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 148/193 | Corviknight | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 149/193 | Cufant | Pokémon (Metal) | Common | Normal, Reverse holo |
| 150/193 | Copperajah ex | Pokémon (Metal) | Double rare | Holo |
| 151/193 | Orthworm | Pokémon (Metal) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 152/193 | Noibat | Pokémon (Dragon) | Common | Normal, Reverse holo |
| 153/193 | Noivern ex | Pokémon (Dragon) | Double rare | Holo |
| 154/193 | Girafarig | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 155/193 | Farigiraf | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 156/193 | Dunsparce | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 157/193 | Dudunsparce | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 158/193 | Wingull | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 159/193 | Pelipper | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 160/193 | Slakoth | Pokémon (Colorless) | Common | Normal, Holo (Cosmos), Reverse holo |
| 161/193 | Vigoroth | Pokémon (Colorless) | Uncommon | Normal, Holo (Cosmos), Reverse holo |
| 162/193 | Slaking | Pokémon (Colorless) | Rare | Holo, Holo (Cosmos), Reverse holo |
| 163/193 | Fletchling | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 164/193 | Rookidee | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 165/193 | Corvisquire | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 166/193 | Tandemaus | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 167/193 | Tandemaus | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 168/193 | Maushold | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 169/193 | Squawkabilly ex | Pokémon (Colorless) | Double rare | Holo |
| 170/193 | Flamigo | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 171/193 | Artazon | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 172/193 | Boss's Orders | Trainer (Supporter) | Rare | Holo, Holo (Asia promo), Reverse holo |
| 173/193 | Bravery Charm | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 174/193 | Calamitous Snowy Mountain | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 175/193 | Calamitous Wasteland | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 176/193 | Choice Belt | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 177/193 | Clavell | Trainer (Supporter) | Common | Normal, Reverse holo |
| 178/193 | Delivery Drone | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 179/193 | Dendra | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 180/193 | Falkner | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 181/193 | Fighting Au Lait | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 182/193 | Giacomo | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 183/193 | Great Ball | Trainer (Item) | Common | Normal, Reverse holo |
| 184/193 | Grusha | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 185/193 | Iono | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 186/193 | Practice Studio | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 187/193 | Saguaro | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 188/193 | Super Rod | Trainer (Item) | Common | Normal, Reverse holo |
| 189/193 | Superior Energy Retrieval | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 190/193 | Jet Energy | Energy (Special) | Uncommon | Normal, Reverse holo |
| 191/193 | Luminous Energy | Energy (Special) | Uncommon | Normal, Reverse holo |
| 192/193 | Reversal Energy | Energy (Special) | Uncommon | Normal, Reverse holo |
| 193/193 | Therapeutic Energy | Energy (Special) | Uncommon | Normal, Reverse holo |
| 194/193 | Heracross | Pokémon (Grass) | Illustration rare | Holo |
| 195/193 | Tropius | Pokémon (Grass) | Illustration rare | Holo |
| 196/193 | Sprigatito | Pokémon (Grass) | Illustration rare | Holo |
| 197/193 | Floragato | Pokémon (Grass) | Illustration rare | Holo |
| 198/193 | Bramblin | Pokémon (Grass) | Illustration rare | Holo |
| 199/193 | Fletchinder | Pokémon (Fire) | Illustration rare | Holo |
| 200/193 | Pyroar | Pokémon (Fire) | Illustration rare | Holo |
| 201/193 | Fuecoco | Pokémon (Fire) | Illustration rare | Holo |
| 202/193 | Crocalor | Pokémon (Fire) | Illustration rare | Holo |
| 203/193 | Magikarp | Pokémon (Water) | Illustration rare | Holo |
| 204/193 | Marill | Pokémon (Water) | Illustration rare | Holo |
| 205/193 | Eiscue | Pokémon (Water) | Illustration rare | Holo |
| 206/193 | Quaxly | Pokémon (Water) | Illustration rare | Holo |
| 207/193 | Quaxwell | Pokémon (Water) | Illustration rare | Holo |
| 208/193 | Frigibax | Pokémon (Water) | Illustration rare | Holo |
| 209/193 | Arctibax | Pokémon (Water) | Illustration rare | Holo |
| 210/193 | Baxcalibur | Pokémon (Water) | Illustration rare | Holo |
| 211/193 | Raichu | Pokémon (Lightning) | Illustration rare | Holo |
| 212/193 | Mismagius | Pokémon (Psychic) | Illustration rare | Holo |
| 213/193 | Gothorita | Pokémon (Psychic) | Illustration rare | Holo |
| 214/193 | Sandygast | Pokémon (Psychic) | Illustration rare | Holo |
| 215/193 | Rabsca | Pokémon (Psychic) | Illustration rare | Holo |
| 216/193 | Tinkatink | Pokémon (Psychic) | Illustration rare | Holo |
| 217/193 | Tinkatuff | Pokémon (Psychic) | Illustration rare | Holo |
| 218/193 | Paldean Tauros | Pokémon (Fighting) | Illustration rare | Holo |
| 219/193 | Sudowoodo | Pokémon (Fighting) | Illustration rare | Holo |
| 220/193 | Nacli | Pokémon (Fighting) | Illustration rare | Holo |
| 221/193 | Paldean Wooper | Pokémon (Darkness) | Illustration rare | Holo |
| 222/193 | Tyranitar | Pokémon (Darkness) | Illustration rare | Holo |
| 223/193 | Grafaiai | Pokémon (Darkness) | Illustration rare | Holo |
| 224/193 | Orthworm | Pokémon (Metal) | Illustration rare | Holo |
| 225/193 | Rookidee | Pokémon (Colorless) | Illustration rare | Holo |
| 226/193 | Maushold | Pokémon (Colorless) | Illustration rare | Holo |
| 227/193 | Flamigo | Pokémon (Colorless) | Illustration rare | Holo |
| 228/193 | Farigiraf | Pokémon (Colorless) | Illustration rare | Holo |
| 229/193 | Dudunsparce | Pokémon (Colorless) | Illustration rare | Holo |
| 230/193 | Forretress ex | Pokémon (Grass) | Ultra Rare | Holo |
| 231/193 | Meowscarada ex | Pokémon (Grass) | Ultra Rare | Holo |
| 232/193 | Wo-Chien ex | Pokémon (Grass) | Ultra Rare | Holo |
| 233/193 | Skeledirge ex | Pokémon (Fire) | Ultra Rare | Holo |
| 234/193 | Chi-Yu ex | Pokémon (Fire) | Ultra Rare | Holo |
| 235/193 | Quaquaval ex | Pokémon (Water) | Ultra Rare | Holo |
| 236/193 | Chien-Pao ex | Pokémon (Water) | Ultra Rare | Holo |
| 237/193 | Bellibolt ex | Pokémon (Lightning) | Ultra Rare | Holo |
| 238/193 | Slowking ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 239/193 | Dedenne ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 240/193 | Tinkaton ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 241/193 | Lycanroc ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 242/193 | Annihilape ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 243/193 | Ting-Lu ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 244/193 | Paldean Clodsire ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 245/193 | Copperajah ex | Pokémon (Metal) | Ultra Rare | Holo |
| 246/193 | Noivern ex | Pokémon (Dragon) | Ultra Rare | Holo |
| 247/193 | Squawkabilly ex | Pokémon (Colorless) | Ultra Rare | Holo |
| 248/193 | Boss's Orders | Trainer (Supporter) | Ultra Rare | Holo |
| 249/193 | Clavell | Trainer (Supporter) | Ultra Rare | Holo |
| 250/193 | Dendra | Trainer (Supporter) | Ultra Rare | Holo |
| 251/193 | Falkner | Trainer (Supporter) | Ultra Rare | Holo |
| 252/193 | Giacomo | Trainer (Supporter) | Ultra Rare | Holo |
| 253/193 | Grusha | Trainer (Supporter) | Ultra Rare | Holo |
| 254/193 | Iono | Trainer (Supporter) | Ultra Rare | Holo |
| 255/193 | Saguaro | Trainer (Supporter) | Ultra Rare | Holo |
| 256/193 | Meowscarada ex | Pokémon (Grass) | Special illustration rare | Holo |
| 257/193 | Wo-Chien ex | Pokémon (Grass) | Special illustration rare | Holo |
| 258/193 | Skeledirge ex | Pokémon (Fire) | Special illustration rare | Holo |
| 259/193 | Chi-Yu ex | Pokémon (Fire) | Special illustration rare | Holo |
| 260/193 | Quaquaval ex | Pokémon (Water) | Special illustration rare | Holo |
| 261/193 | Chien-Pao ex | Pokémon (Water) | Special illustration rare | Holo |
| 262/193 | Tinkaton ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 263/193 | Ting-Lu ex | Pokémon (Fighting) | Special illustration rare | Holo |
| 264/193 | Squawkabilly ex | Pokémon (Colorless) | Special illustration rare | Holo |
| 265/193 | Boss's Orders | Trainer (Supporter) | Special illustration rare | Holo |
| 266/193 | Dendra | Trainer (Supporter) | Special illustration rare | Holo |
| 267/193 | Giacomo | Trainer (Supporter) | Special illustration rare | Holo |
| 268/193 | Grusha | Trainer (Supporter) | Special illustration rare | Holo |
| 269/193 | Iono | Trainer (Supporter) | Special illustration rare | Holo |
| 270/193 | Saguaro | Trainer (Supporter) | Special illustration rare | Holo |
| 271/193 | Meowscarada ex | Pokémon (Grass) | Hyper rare | Holo |
| 272/193 | Skeledirge ex | Pokémon (Fire) | Hyper rare | Holo |
| 273/193 | Quaquaval ex | Pokémon (Water) | Hyper rare | Holo |
| 274/193 | Chien-Pao ex | Pokémon (Water) | Hyper rare | Holo |
| 275/193 | Ting-Lu ex | Pokémon (Fighting) | Hyper rare | Holo |
| 276/193 | Super Rod | Trainer (Item) | Hyper rare | Holo |
| 277/193 | Superior Energy Retrieval | Trainer (Item) | Hyper rare | Holo |
| 278/193 | Basic Grass Energy | Energy (Normal) | Hyper rare | Holo |
| 279/193 | Basic Water Energy | Energy (Normal) | Hyper rare | Holo |

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

Confidence: this map follows the pack structure above. Odds use the TCGplayer study.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 4 | Common | Common | Common | Normal | All | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Reverse holo slot 1 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | 100% |
| Reverse holo slot 2 | 1 | Illustration Rare | Illustration Rare | Illustration rare | Holo | All | 7.70% |
| Reverse holo slot 2 | 1 | Special Illustration Rare | Special Illustration Rare | Special illustration rare | Holo | All | 3.17% |
| Reverse holo slot 2 | 1 | Hyper Rare | Hyper Rare | Hyper rare | Holo | All | 1.76% |
| Reverse holo slot 2 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Rare slot | 1 | Double Rare | Double Rare | Double rare | Holo | All | 13.72% |
| Rare slot | 1 | Ultra Rare | Ultra Rare | Ultra Rare | Holo | All | 6.64% |
| Rare slot | 1 | Rare | Rare | Rare | Holo | All | Rest |
| Basic Energy | 1 | Basic Energy | — | — | — | — | 100% |
| Code card | 1 | Code card | — | — | — | — | 100% |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | 79.64% | Yes |
| 5 | Double Rare | Rarity | 13.72% | Yes |
| 6 | Illustration Rare | Rarity | 7.70% | Yes |
| 7 | Ultra Rare | Rarity | 6.64% | Yes |
| 8 | Special Illustration Rare | Rarity | 3.17% | Yes |
| 9 | Hyper Rare | Rarity | 1.76% | Yes |

## Sources

- [Bulbapedia — Paldea Evolved (TCG)](https://bulbapedia.bulbagarden.net/wiki/Paldea_Evolved_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Scarlet & Violet TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Scarlet_%26_Violet_TCG_Series_merchandise)
- [Bulbapedia — Build & Battle Box (TCG)](https://bulbapedia.bulbagarden.net/wiki/Build_%26_Battle_Box_(TCG))
- [PokeBeach — "Scarlet & Violet" Booster Pack Configuration Finally Revealed](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes)
- [TCGplayer — Paldea Evolved Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Paldea-Evolved-Pull-Rates/1b7d3e70-9542-4a50-8692-1661e2316521/)

## Open topics

- **Physical pack order.** No opened-pack source confirms it for this set.
- **Era conflicts:** the Hyper Rare slot and the last card. See
  [eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template).
- **Boxes per case:** 6 (era-wide retailer consensus, not official).
- **Hits per box:** Unknown.
- **Build & Battle Stadium.** The merchandise page says 3 extra packs. The
  Build & Battle Box page says 4.
- **Blister contents** for this set: Unknown.
- **Rarity list order:** by this file's odds, Illustration Rare (7.70%) is more common than Ultra Rare (6.64%), even though Ultra Rare is the higher secret-rare tier by name.
