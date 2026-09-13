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

<!-- product-catalog:start (generated by tools/ppt/sealed_catalog.py; do not edit) -->
### Product catalog

Every physical sealed product that the TCGplayer catalog (TCGCSV) lists for this set, fetched 2026-09-12. Code cards, and deck products with no booster pack (fixed cards, no random pull), are left out.

- **Packs** is the number of booster packs. **Packs from** names the source: the TCGplayer description, the product name, the Bulbapedia TCG merchandise page for the series, the set file's own table (Build & Battle Stadium: boxes × 4 plus the extra packs), or a default for the kind (booster box 36, booster bundle 6, Build & Battle Box 4). Check a default before the game uses it.
- **Holds** is what a case or a display holds.
- **Release** is the quarter from the TCGplayer release date. "(set)" means the quarter of the set's release date.
- **PPT price** is Yes when PokemonPriceTracker has a price. Prices are in `tools/ppt/cache/sealed/`, not in the docs.

TCGplayer group `23353`: 37 products.

| TCGplayer ID | Product | Kind | Packs | Packs from | Holds | Release | PPT price |
|---|---|---|---|---|---|---|---|
| 528771 | Paldean Fates Booster Bundle | Booster bundle | 6 | Description | — | 2024 Q1 (set) | Yes |
| 528038 | Paldean Fates Booster Pack | Booster pack | 1 | Kind default | — | 2024 Q1 | Yes |
| 668624 | Paldean Fates Booster Pack Art Bundle [Set of 4] | Booster pack | 4 | Name | — | 2024 Q1 (set) | Yes |
| 530704 | Paldean Fates Booster Bundle Display | Case or display | — | — | 10 booster bundles | 2024 Q1 (set) | Yes |
| 635609 | Paldean Fates Booster Bundle Display Case | Case or display | — | — | Unknown number of booster bundles | 2024 Q1 (set) | Yes |
| 530700 | Paldean Fates Elite Trainer Box Case | Case or display | — | — | 10 elite trainer boxes | 2024 Q1 (set) | Yes |
| 528047 | Paldean Fates Mini Tin Display | Case or display | — | — | Unknown number of mini tins | 2024 Q1 (set) | Yes |
| 693612 | Paldean Fates Mini Tin Display Case | Case or display | — | — | Unknown number of mini tins | 2024 Q1 (set) | No |
| 536266 | Paldean Fates Pokemon Center Elite Trainer Box (Exclusive) Case | Case or display | — | — | Unknown | 2024 Q1 (set) | Yes |
| 693569 | Paldean Fates Premium Collection Case | Case or display | — | — | Unknown number of collections | 2024 Q1 (set) | No |
| 654599 | Paldean Fates Tech Sticker Collection Case | Case or display | — | — | Unknown number of collections | 2024 Q1 (set) | Yes |
| 688258 | Paldean Fates Tin Case | Case or display | — | — | 6 tins | 2024 Q1 (set) | No |
| 665113 | Paldean Fates Great Tusk ex & Iron Treads ex Premium Collection | Collection | 11 | Description | — | 2024 Q1 (set) | Yes |
| 528079 | Paldean Fates Premium Collection [Meowscarada ex] | Collection | 8 | Description | — | 2024 Q1 | Yes |
| 528082 | Paldean Fates Premium Collection [Quaquaval ex] | Collection | 8 | Description | — | 2024 Q1 | Yes |
| 528324 | Paldean Fates Premium Collection [Set of 3] | Collection | 8 | Description | — | 2024 Q1 | Yes |
| 528080 | Paldean Fates Premium Collection [Skeledirge ex] | Collection | 8 | Description | — | 2024 Q1 | Yes |
| 528043 | Paldean Fates Tech Sticker Collection [Fidough] | Collection | 3 | Description | — | 2024 Q1 | Yes |
| 528045 | Paldean Fates Tech Sticker Collection [Greavard] | Collection | 3 | Description | — | 2024 Q1 | Yes |
| 528044 | Paldean Fates Tech Sticker Collection [Maschiff] | Collection | 3 | Description | — | 2024 Q1 | Yes |
| 528040 | Paldean Fates Elite Trainer Box | Elite Trainer Box | 9 | Description | — | 2024 Q1 (set) | Yes |
| 528039 | Paldean Fates Pokemon Center Elite Trainer Box (Exclusive) | Elite Trainer Box | 11 | Description | — | 2024 Q1 (set) | Yes |
| 528229 | Paldean Fates Tech Sticker Collections [Set of 3] | Other | 3 | Description | — | 2024 Q1 | Yes |
| 528063 | Paldean Fates International Tin [Charizard ex] | Tin | 4 | Description | — | 2024 Q1 | Yes |
| 528060 | Paldean Fates International Tin [Great Tusk ex] | Tin | 4 | Description | — | 2024 Q1 | Yes |
| 528059 | Paldean Fates International Tin [Iron Treads ex] | Tin | 4 | Description | — | 2024 Q1 | Yes |
| 528227 | Paldean Fates International Tins [Set of 3] | Tin | 4 | Description | — | 2024 Q1 | Yes |
| 528055 | Paldean Fates Mini Tin [Finizen] | Tin | 2 | Description | — | 2024 Q1 (set) | Yes |
| 528050 | Paldean Fates Mini Tin [Flamigo] | Tin | 2 | Description | — | 2024 Q1 | Yes |
| 528051 | Paldean Fates Mini Tin [Maushold] | Tin | 2 | Description | — | 2024 Q1 | Yes |
| 529039 | Paldean Fates Mini Tin [Set of 5] | Tin | 2 | Description | — | 2024 Q1 | Yes |
| 528049 | Paldean Fates Mini Tin [Smoliv] | Tin | 2 | Description | — | 2024 Q1 | Yes |
| 528052 | Paldean Fates Mini Tin [Tinkatink] | Tin | 2 | Description | — | 2024 Q1 | Yes |
| 528056 | Paldean Fates Tin [Charizard ex] | Tin | 5 | Description | — | 2024 Q1 | Yes |
| 528057 | Paldean Fates Tin [Great Tusk ex] | Tin | 5 | Description | — | 2024 Q1 | Yes |
| 528058 | Paldean Fates Tin [Iron Treads ex] | Tin | 5 | Description | — | 2024 Q1 | Yes |
| 528228 | Paldean Fates Tins [Set of 3] | Tin | 5 | Description | — | 2024 Q1 | Yes |
<!-- product-catalog:end -->

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv04.5`), fetched 2026-09-12. The list has 245 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/091 | Pineco | Pokémon (Grass) | Common | Normal, Reverse holo |
| 002/091 | Forretress ex | Pokémon (Grass) | Double rare | Holo |
| 003/091 | Maractus | Pokémon (Grass) | Common | Normal, Reverse holo |
| 004/091 | Toedscool | Pokémon (Grass) | Common | Normal, Reverse holo |
| 005/091 | Toedscruel ex | Pokémon (Grass) | Double rare | Holo |
| 006/091 | Espathra ex | Pokémon (Grass) | Double rare | Holo |
| 007/091 | Charmander | Pokémon (Fire) | Common | Normal, Holo (Cosmos), Reverse holo |
| 008/091 | Charmeleon | Pokémon (Fire) | Uncommon | Normal, Holo (Cosmos), Reverse holo |
| 009/091 | Magmar | Pokémon (Fire) | Common | Normal, Reverse holo |
| 010/091 | Magmortar | Pokémon (Fire) | Rare | Holo, Reverse holo |
| 011/091 | Numel | Pokémon (Fire) | Common | Normal, Reverse holo |
| 012/091 | Camerupt | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 013/091 | Heat Rotom | Pokémon (Fire) | Rare | Holo, Reverse holo |
| 014/091 | Charcadet | Pokémon (Fire) | Common | Normal, Reverse holo |
| 015/091 | Armarouge | Pokémon (Fire) | Rare | Holo, Reverse holo |
| 016/091 | Lapras | Pokémon (Water) | Common | Normal, Reverse holo |
| 017/091 | Frigibax | Pokémon (Water) | Common | Normal, Reverse holo |
| 018/091 | Pikachu | Pokémon (Lightning) | Common | Normal, Reverse holo, Reverse holo (Cosmos) |
| 019/091 | Raichu | Pokémon (Lightning) | Rare | Holo, Reverse holo |
| 020/091 | Chinchou | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 021/091 | Lanturn | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 022/091 | Kilowattrel | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 023/091 | Exeggcute | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 024/091 | Exeggutor | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 025/091 | Natu | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 026/091 | Xatu | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 027/091 | Ralts | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 028/091 | Kirlia | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 029/091 | Gardevoir ex | Pokémon (Psychic) | Double rare | Holo |
| 030/091 | Chimecho | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 031/091 | Mime Jr. | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 032/091 | Woobat | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 033/091 | Swoobat | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 034/091 | Cottonee | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 035/091 | Whimsicott | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 036/091 | Dedenne | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 037/091 | Mimikyu | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 038/091 | Fidough | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Cosmos) |
| 039/091 | Dachsbun | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 040/091 | Ceruledge | Pokémon (Psychic) | Rare | Holo, Holo (Pokemon day), Reverse holo |
| 041/091 | Flittle | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 042/091 | Greavard | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Cosmos) |
| 043/091 | Houndstone | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 044/091 | Gimmighoul | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 045/091 | Mankey | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 046/091 | Primeape | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 047/091 | Annihilape | Pokémon (Fighting) | Rare | Holo, Reverse holo |
| 048/091 | Phanpy | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 049/091 | Donphan | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 050/091 | Barboach | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 051/091 | Clobbopus | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 052/091 | Grapploct | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 053/091 | Great Tusk ex | Pokémon (Fighting) | Double rare | Holo |
| 054/091 | Charizard ex | Pokémon (Darkness) | Double rare | Holo |
| 055/091 | Gastly | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 056/091 | Haunter | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 057/091 | Gengar | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 058/091 | Paldean Wooper | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 059/091 | Paldean Clodsire ex | Pokémon (Darkness) | Double rare | Holo |
| 060/091 | Scraggy | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 061/091 | Scrafty | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 062/091 | Maschiff | Pokémon (Darkness) | Common | Normal, Reverse holo, Reverse holo (Cosmos) |
| 063/091 | Mabosstiff | Pokémon (Darkness) | Rare | Holo, Reverse holo |
| 064/091 | Varoom | Pokémon (Metal) | Common | Normal, Reverse holo |
| 065/091 | Revavroom | Pokémon (Metal) | Rare | Holo, Reverse holo |
| 066/091 | Iron Treads ex | Pokémon (Metal) | Double rare | Holo |
| 067/091 | Gholdengo | Pokémon (Metal) | Rare | Holo, Reverse holo |
| 068/091 | Noibat | Pokémon (Dragon) | Common | Normal, Reverse holo |
| 069/091 | Noivern ex | Pokémon (Dragon) | Double rare | Holo |
| 070/091 | Cyclizar | Pokémon (Dragon) | Rare | Holo, Reverse holo |
| 071/091 | Lechonk | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 072/091 | Oinkologne | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 073/091 | Tandemaus | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 074/091 | Maushold | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 075/091 | Squawkabilly ex | Pokémon (Colorless) | Double rare | Holo |
| 076/091 | Artazon | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 077/091 | Atticus | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 078/091 | Clive | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 079/091 | Electric Generator | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 080/091 | Iono | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 081/091 | Moonlit Hill | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 082/091 | Nemona | Trainer (Supporter) | Common | Normal, Reverse holo |
| 083/091 | Nemona's Backpack | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 084/091 | Nest Ball | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 085/091 | Paldean Student | Trainer (Supporter) | Common | Normal, Reverse holo |
| 086/091 | Paldean Student | Trainer (Supporter) | Common | Normal, Reverse holo |
| 087/091 | Professor's Research | Trainer (Supporter) | Rare | Holo, Reverse holo |
| 088/091 | Professor's Research | Trainer (Supporter) | Rare | Holo, Reverse holo |
| 089/091 | Rare Candy | Trainer (Item) | Common | Normal, Reverse holo |
| 090/091 | Technical Machine: Crisis Punch | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 091/091 | Ultra Ball | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 092/091 | Oddish | Pokémon (Grass) | Shiny rare | Holo |
| 093/091 | Gloom | Pokémon (Grass) | Shiny rare | Holo |
| 094/091 | Vileplume | Pokémon (Grass) | Shiny rare | Holo |
| 095/091 | Scyther | Pokémon (Grass) | Shiny rare | Holo |
| 096/091 | Hoppip | Pokémon (Grass) | Shiny rare | Holo |
| 097/091 | Skiploom | Pokémon (Grass) | Shiny rare | Holo |
| 098/091 | Jumpluff | Pokémon (Grass) | Shiny rare | Holo |
| 099/091 | Pineco | Pokémon (Grass) | Shiny rare | Holo |
| 100/091 | Snover | Pokémon (Grass) | Shiny rare | Holo |
| 101/091 | Abomasnow | Pokémon (Grass) | Shiny rare | Holo |
| 102/091 | Smoliv | Pokémon (Grass) | Shiny rare | Holo |
| 103/091 | Dolliv | Pokémon (Grass) | Shiny rare | Holo |
| 104/091 | Arboliva | Pokémon (Grass) | Shiny rare | Holo |
| 105/091 | Toedscool | Pokémon (Grass) | Shiny rare | Holo |
| 106/091 | Capsakid | Pokémon (Grass) | Shiny rare | Holo |
| 107/091 | Scovillain | Pokémon (Grass) | Shiny rare | Holo |
| 108/091 | Rellor | Pokémon (Grass) | Shiny rare | Holo |
| 109/091 | Charmander | Pokémon (Fire) | Shiny rare | Holo |
| 110/091 | Charmeleon | Pokémon (Fire) | Shiny rare | Holo |
| 111/091 | Paldean Tauros | Pokémon (Fire) | Shiny rare | Holo |
| 112/091 | Entei | Pokémon (Fire) | Shiny rare | Holo |
| 113/091 | Oricorio | Pokémon (Fire) | Shiny rare | Holo |
| 114/091 | Charcadet | Pokémon (Fire) | Shiny rare | Holo |
| 115/091 | Armarouge | Pokémon (Fire) | Shiny rare | Holo |
| 116/091 | Slowpoke | Pokémon (Water) | Shiny rare | Holo |
| 117/091 | Slowbro | Pokémon (Water) | Shiny rare | Holo |
| 118/091 | Staryu | Pokémon (Water) | Shiny rare | Holo |
| 119/091 | Starmie | Pokémon (Water) | Shiny rare | Holo |
| 120/091 | Paldean Tauros | Pokémon (Water) | Shiny rare | Holo |
| 121/091 | Wiglett | Pokémon (Water) | Shiny rare | Holo |
| 122/091 | Wugtrio | Pokémon (Water) | Shiny rare | Holo |
| 123/091 | Finizen | Pokémon (Water) | Shiny rare | Holo |
| 124/091 | Palafin | Pokémon (Water) | Shiny rare | Holo |
| 125/091 | Veluza | Pokémon (Water) | Shiny rare | Holo |
| 126/091 | Dondozo | Pokémon (Water) | Shiny rare | Holo |
| 127/091 | Tatsugiri | Pokémon (Water) | Shiny rare | Holo |
| 128/091 | Frigibax | Pokémon (Water) | Shiny rare | Holo |
| 129/091 | Arctibax | Pokémon (Water) | Shiny rare | Holo |
| 130/091 | Baxcalibur | Pokémon (Water) | Shiny rare | Holo |
| 131/091 | Pikachu | Pokémon (Lightning) | Shiny rare | Holo |
| 132/091 | Raichu | Pokémon (Lightning) | Shiny rare | Holo |
| 133/091 | Voltorb | Pokémon (Lightning) | Shiny rare | Holo |
| 134/091 | Electrode | Pokémon (Lightning) | Shiny rare | Holo |
| 135/091 | Shinx | Pokémon (Lightning) | Shiny rare | Holo |
| 136/091 | Luxio | Pokémon (Lightning) | Shiny rare | Holo |
| 137/091 | Luxray | Pokémon (Lightning) | Shiny rare | Holo |
| 138/091 | Pachirisu | Pokémon (Lightning) | Shiny rare | Holo |
| 139/091 | Thundurus | Pokémon (Lightning) | Shiny rare | Holo |
| 140/091 | Toxel | Pokémon (Lightning) | Shiny rare | Holo |
| 141/091 | Toxtricity | Pokémon (Lightning) | Shiny rare | Holo |
| 142/091 | Pawmi | Pokémon (Lightning) | Shiny rare | Holo |
| 143/091 | Pawmo | Pokémon (Lightning) | Shiny rare | Holo |
| 144/091 | Pawmot | Pokémon (Lightning) | Shiny rare | Holo |
| 145/091 | Wattrel | Pokémon (Lightning) | Shiny rare | Holo |
| 146/091 | Kilowattrel | Pokémon (Lightning) | Shiny rare | Holo |
| 147/091 | Wigglytuff | Pokémon (Psychic) | Shiny rare | Holo |
| 148/091 | Abra | Pokémon (Psychic) | Shiny rare | Holo |
| 149/091 | Kadabra | Pokémon (Psychic) | Shiny rare | Holo |
| 150/091 | Cleffa | Pokémon (Psychic) | Shiny rare | Holo |
| 151/091 | Natu | Pokémon (Psychic) | Shiny rare | Holo |
| 152/091 | Xatu | Pokémon (Psychic) | Shiny rare | Holo |
| 153/091 | Ralts | Pokémon (Psychic) | Shiny rare | Holo |
| 154/091 | Kirlia | Pokémon (Psychic) | Shiny rare | Holo |
| 155/091 | Drifloon | Pokémon (Psychic) | Shiny rare | Holo |
| 156/091 | Drifblim | Pokémon (Psychic) | Shiny rare | Holo |
| 157/091 | Mime Jr. | Pokémon (Psychic) | Shiny rare | Holo |
| 158/091 | Spiritomb | Pokémon (Psychic) | Shiny rare | Holo |
| 159/091 | Klefki | Pokémon (Psychic) | Shiny rare | Holo |
| 160/091 | Mimikyu | Pokémon (Psychic) | Shiny rare | Holo |
| 161/091 | Dachsbun | Pokémon (Psychic) | Shiny rare | Holo |
| 162/091 | Ceruledge | Pokémon (Psychic) | Shiny rare | Holo |
| 163/091 | Rabsca | Pokémon (Psychic) | Shiny rare | Holo |
| 164/091 | Flittle | Pokémon (Psychic) | Shiny rare | Holo |
| 165/091 | Tinkatink | Pokémon (Psychic) | Shiny rare | Holo |
| 166/091 | Tinkatuff | Pokémon (Psychic) | Shiny rare | Holo |
| 167/091 | Tinkaton | Pokémon (Psychic) | Shiny rare | Holo |
| 168/091 | Houndstone | Pokémon (Psychic) | Shiny rare | Holo |
| 169/091 | Mankey | Pokémon (Fighting) | Shiny rare | Holo |
| 170/091 | Primeape | Pokémon (Fighting) | Shiny rare | Holo |
| 171/091 | Annihilape | Pokémon (Fighting) | Shiny rare | Holo |
| 172/091 | Paldean Tauros | Pokémon (Fighting) | Shiny rare | Holo |
| 173/091 | Riolu | Pokémon (Fighting) | Shiny rare | Holo |
| 174/091 | Lucario | Pokémon (Fighting) | Shiny rare | Holo |
| 175/091 | Hawlucha | Pokémon (Fighting) | Shiny rare | Holo |
| 176/091 | Nacli | Pokémon (Fighting) | Shiny rare | Holo |
| 177/091 | Naclstack | Pokémon (Fighting) | Shiny rare | Holo |
| 178/091 | Garganacl | Pokémon (Fighting) | Shiny rare | Holo |
| 179/091 | Glimmet | Pokémon (Fighting) | Shiny rare | Holo |
| 180/091 | Paldean Wooper | Pokémon (Darkness) | Shiny rare | Holo |
| 181/091 | Murkrow | Pokémon (Darkness) | Shiny rare | Holo |
| 182/091 | Sneasel | Pokémon (Darkness) | Shiny rare | Holo |
| 183/091 | Weavile | Pokémon (Darkness) | Shiny rare | Holo |
| 184/091 | Sableye | Pokémon (Darkness) | Shiny rare | Holo |
| 185/091 | Pawniard | Pokémon (Darkness) | Shiny rare | Holo |
| 186/091 | Bisharp | Pokémon (Darkness) | Shiny rare | Holo |
| 187/091 | Kingambit | Pokémon (Darkness) | Shiny rare | Holo |
| 188/091 | Mabosstiff | Pokémon (Darkness) | Shiny rare | Holo |
| 189/091 | Shroodle | Pokémon (Darkness) | Shiny rare | Holo |
| 190/091 | Grafaiai | Pokémon (Darkness) | Shiny rare | Holo |
| 191/091 | Scizor | Pokémon (Metal) | Shiny rare | Holo |
| 192/091 | Varoom | Pokémon (Metal) | Shiny rare | Holo |
| 193/091 | Revavroom | Pokémon (Metal) | Shiny rare | Holo |
| 194/091 | Noibat | Pokémon (Dragon) | Shiny rare | Holo |
| 195/091 | Cyclizar | Pokémon (Dragon) | Shiny rare | Holo |
| 196/091 | Pidgey | Pokémon (Colorless) | Shiny rare | Holo |
| 197/091 | Pidgeotto | Pokémon (Colorless) | Shiny rare | Holo |
| 198/091 | Jigglypuff | Pokémon (Colorless) | Shiny rare | Holo |
| 199/091 | Doduo | Pokémon (Colorless) | Shiny rare | Holo |
| 200/091 | Dodrio | Pokémon (Colorless) | Shiny rare | Holo |
| 201/091 | Ditto | Pokémon (Colorless) | Shiny rare | Holo |
| 202/091 | Snorlax | Pokémon (Colorless) | Shiny rare | Holo |
| 203/091 | Wingull | Pokémon (Colorless) | Shiny rare | Holo |
| 204/091 | Pelipper | Pokémon (Colorless) | Shiny rare | Holo |
| 205/091 | Skwovet | Pokémon (Colorless) | Shiny rare | Holo |
| 206/091 | Greedent | Pokémon (Colorless) | Shiny rare | Holo |
| 207/091 | Lechonk | Pokémon (Colorless) | Shiny rare | Holo |
| 208/091 | Oinkologne | Pokémon (Colorless) | Shiny rare | Holo |
| 209/091 | Tandemaus | Pokémon (Colorless) | Shiny rare | Holo |
| 210/091 | Maushold | Pokémon (Colorless) | Shiny rare | Holo |
| 211/091 | Flamigo | Pokémon (Colorless) | Shiny rare | Holo |
| 212/091 | Forretress ex | Pokémon (Grass) | Shiny Ultra Rare | Holo |
| 213/091 | Toedscruel ex | Pokémon (Grass) | Shiny Ultra Rare | Holo |
| 214/091 | Espathra ex | Pokémon (Grass) | Shiny Ultra Rare | Holo |
| 215/091 | Alakazam ex | Pokémon (Psychic) | Shiny Ultra Rare | Holo |
| 216/091 | Mew ex | Pokémon (Psychic) | Shiny Ultra Rare | Holo |
| 217/091 | Gardevoir ex | Pokémon (Psychic) | Shiny Ultra Rare | Holo |
| 218/091 | Glimmora ex | Pokémon (Fighting) | Shiny Ultra Rare | Holo |
| 219/091 | Paldean Clodsire ex | Pokémon (Darkness) | Shiny Ultra Rare | Holo |
| 220/091 | Noivern ex | Pokémon (Dragon) | Shiny Ultra Rare | Holo |
| 221/091 | Pidgeot ex | Pokémon (Colorless) | Shiny Ultra Rare | Holo |
| 222/091 | Wigglytuff ex | Pokémon (Colorless) | Shiny Ultra Rare | Holo |
| 223/091 | Squawkabilly ex | Pokémon (Colorless) | Shiny Ultra Rare | Holo |
| 224/091 | Wugtrio | Pokémon (Water) | Illustration rare | Holo |
| 225/091 | Palafin | Pokémon (Water) | Illustration rare | Holo |
| 226/091 | Pawmi | Pokémon (Lightning) | Illustration rare | Holo |
| 227/091 | Clive | Trainer (Supporter) | Ultra Rare | Holo |
| 228/091 | Judge | Trainer (Supporter) | Ultra Rare | Holo |
| 229/091 | Nemona | Trainer (Supporter) | Ultra Rare | Holo |
| 230/091 | Paldean Student | Trainer (Supporter) | Ultra Rare | Holo |
| 231/091 | Paldean Student | Trainer (Supporter) | Ultra Rare | Holo |
| 232/091 | Mew ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 233/091 | Gardevoir ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 234/091 | Charizard ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 235/091 | Arven | Trainer (Supporter) | Special illustration rare | Holo |
| 236/091 | Clive | Trainer (Supporter) | Special illustration rare | Holo |
| 237/091 | Iono | Trainer (Supporter) | Special illustration rare | Holo |
| 238/091 | Nemona | Trainer (Supporter) | Special illustration rare | Holo |
| 239/091 | Penny | Trainer (Supporter) | Special illustration rare | Holo |
| 240/091 | Wo-Chien ex | Pokémon (Grass) | Hyper rare | Holo |
| 241/091 | Chi-Yu ex | Pokémon (Fire) | Hyper rare | Holo |
| 242/091 | Chien-Pao ex | Pokémon (Water) | Hyper rare | Holo |
| 243/091 | Miraidon ex | Pokémon (Lightning) | Hyper rare | Holo |
| 244/091 | Ting-Lu ex | Pokémon (Fighting) | Hyper rare | Holo |
| 245/091 | Koraidon ex | Pokémon (Fighting) | Hyper rare | Holo |

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

Confidence: this map follows the pack structure above. Odds use the TCGplayer study (1,500+ packs). Reverse holo slot 1 can hold a Shiny Rare or a Shiny Ultra Rare instead of a plain reverse holo.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 4 | Common | Common | Common | Normal | All | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Reverse holo slot 1 | 1 | Shiny Rare | Shiny Rare | Shiny rare | Holo | All | 25.44% |
| Reverse holo slot 1 | 1 | Shiny Ultra Rare | Shiny Ultra Rare | Shiny Ultra Rare | Holo | All | 7.72% |
| Reverse holo slot 1 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Reverse holo slot 2 | 1 | Illustration Rare | Illustration Rare | Illustration rare | Holo | All | 7.22% |
| Reverse holo slot 2 | 1 | Special Illustration Rare | Special Illustration Rare | Special illustration rare | Holo | All | 1.72% |
| Reverse holo slot 2 | 1 | Hyper Rare | Hyper Rare | Hyper rare | Holo | All | 1.61% |
| Reverse holo slot 2 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Rare slot | 1 | Double Rare | Double Rare | Double rare | Holo | All | 15.89% |
| Rare slot | 1 | Ultra Rare | Ultra Rare | Ultra Rare | Holo | All | 6.61% |
| Rare slot | 1 | Rare | Rare | Rare | Holo | All | Rest |
| Basic Energy | 1 | Basic Energy | — | — | — | — | 100% |
| Code card | 1 | Code card | — | — | — | — | 100% |

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
