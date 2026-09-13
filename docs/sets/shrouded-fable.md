# Shrouded Fable (2024)

Set data for Shrouded Fable, the third special set of the Scarlet & Violet
era. The shared pack template, pack order, and rarity system are in
[eras/scarlet-violet.md](eras/scarlet-violet.md). This file records the set
data and every exception. See [../13-sets.md](../13-sets.md) for the general
approach.

## Release

- **English release:** August 2, 2024.
- **Set code:** SFA.
- **Card count:** 99 cards. The main set has 64 cards. The secret rares are
  35 cards, numbered 065/064 to 099/064.

| Part | Rarity | Cards |
|---|---|---|
| Main set | Common | 28 |
| Main set | Uncommon | 20 |
| Main set | Rare | 7 |
| Main set | Double Rare | 6 |
| Main set | ACE SPEC Rare | 3 |
| Secret rares | Ultra Rare | 10 |
| Secret rares | Illustration Rare | 15 |
| Secret rares | Special Illustration Rare | 5 |
| Secret rares | Hyper Rare | 5 |

The counts come from the Bulbapedia set list.

## Pack structure

| Slot | Count | Can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo slot 1 | 1 | Reverse Holo, ACE SPEC Rare |
| Reverse holo slot 2 | 1 | Reverse Holo, Illustration Rare, Special Illustration Rare, Hyper Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare |
| Basic Energy | 1 | Basic Energy card |
| Code card | 1 | Pokémon TCG Live code card |

**Confidence: era-wide sources only.** Bulbapedia's international table puts
the ACE SPEC Rare in reverse holo slot 1 "from Temporal Forces to Prismatic
Evolutions". No opened-pack study in this research names the slots for this
set.

- **Cards per pack conflict:** ThePriceDex says "11 cards per pack". The era
  template has 12 cards (10 set cards, 1 Basic Energy, 1 code card). The
  ThePriceDex count may leave out the code card. Unknown.
- The Japanese source set, Night Wanderer, has 5 cards per pack. Do not use
  the Japanese structure.

## Pack order

| Position | Slot |
|---|---|
| 1–4 | Common |
| 5–7 | Uncommon |
| 8 | Reverse holo slot 1 (ACE SPEC Rare) |
| 9 | Reverse holo slot 2 (Illustration Rare, Special Illustration Rare, Hyper Rare) |
| 10 | Rare slot (Double Rare, Ultra Rare) |
| 11 | Basic Energy |
| 12 | Code card |

**Confidence: industry news report before release** (PokeBeach, era-wide,
about the Scarlet & Violet set). No source in this research shows an opened
pack of this set. The slot for each rarity in this set is also unconfirmed.

- **Double Rare and Ultra Rare:** card 10, the third card from the end. It is
  one of the last three cards.
- **Illustration Rare, Special Illustration Rare, and Hyper Rare:** card 9,
  the fourth card from the end. It is not one of the last three cards.
- **ACE SPEC Rare:** card 8, the fifth card from the end. It is not one of
  the last three cards.
- If the rip screen hides the code card, card 9 is the third card from the
  end, and card 8 is the fourth.
- **Era conflicts** (Hyper Rare slot, last card): see the era file.

## Rarities and hit odds

No TCGplayer study for this set was found in this research. Three community
sources give figures. They disagree.

| Rarity | Cards | Dripshop (about 1,500 packs) | Pokemon Engage (2,354 packs) | ThePriceDex (no sample size) | Confidence |
|---|---|---|---|---|---|
| Rare | 7 | — | — | 1 in 1.3 | Community estimate |
| Double Rare | 6 | 1 in 6 ("EX"); specific 1 in 60 | — | 1 in 6 | Community estimate |
| Ultra Rare | 10 | 1 in 15; specific 1 in 270 | "Full Art" 1 in 24 (97 pulls) and "FA-SP" 1 in 36 (66 pulls) | 1 in 14.3 | Community estimate |
| ACE SPEC Rare | 3 | 1 in 20; specific 1 in 140 | — | 1 in 20 | Community estimate |
| Illustration Rare | 15 | 1 in 12; specific 1 in 180 | 1 in 12 (190 pulls) | 1 in 13.0 | Community estimate |
| Special Illustration Rare | 5 | 1 in 67; specific 1 in 335 | 1 in 64 (37 pulls) | 1 in 87.2 | Community estimate |
| Hyper Rare | 5 | 1 in 144; specific 1 in 720 | "Gold" 1 in 118 (20 pulls) | 1 in 128.3 | Community estimate |
| Shiny Rare | 0 | Not in this set | | | — |
| Shiny Ultra Rare | 0 | Not in this set | | | — |

Notes on the sources:

- **Dripshop** (retailer, published August 2, 2024): "Based on data from
  approximately 1,500 packs". It gives no method. Its summary also says
  "Secret Rare: 1 in 75 packs" and "Holo Rare: 1 in 5 packs". These do not
  match its own detail figures.
- **Dripshop specific-card figures.** The Ultra Rare (1 in 270) and ACE SPEC
  (1 in 140) figures do not match this set's card counts. They are the same
  as the TCGplayer Temporal Forces figures. The Double Rare, Illustration
  Rare, Special Illustration Rare, and Hyper Rare figures match 6, 15, 5, and
  5 cards.
- **Pokemon Engage** (blog, August 15, 2024): 2,354 packs. It credits the
  data to skool.com and r/PokeInvesting. It does not define "Full Art" and
  "FA-SP". If both are Ultra Rares, the sum is 163 pulls, about 1 in 14.4
  packs (derived).
- **PokéPatch** repeats the Dripshop figures. It is not an independent
  source.
- **ThePriceDex:** "estimates primarily sourced from Shrouded Fable pull rates
  research and based on community data". No sample size.

**Default for the simulation, if one figure is needed:** no source is
reliable enough to choose. See Open topics.

## Special subsets and mechanics

- **ACE SPEC cards:** three ACE SPEC Rares in the main set (Bulbapedia set
  list).
- **Parallel foil:** Bulbapedia says Shrouded Fable "introduces a new unique
  Holofoil pattern ... known as 'parallel foil'". It is a type of Reverse
  Holofoil, marked by a white expansion code box with black text, against
  the black-with-white-text box on a regular card (PokeBeach set guide,
  search extract). It is the look of every reverse holo in this set, not a
  separate pull rate: it replaces the plain Reverse Holo in both reverse
  holo slots. A PokeBeach set guide extract also says Shrouded Fable packs
  can hold a reverse holo Basic Energy, the same kind of exception as the
  151 Cosmos Holofoil Basic Energy. No source gives its rate for this set.
- No source in this research reports a god pack or a demi-god pack for this
  set.

## Sealed products

Shrouded Fable has **no booster box**. The Bulbapedia merchandise list has no
Shrouded Fable Booster Display Box. Dripshop and Pokemon Engage also say the
set has no booster boxes. No official statement was found.

| Product | Packs of this set |
|---|---|
| Elite Trainer Box (Okidogi, Munkidori, Fezandipiti) | 9 |
| Pokémon Center Elite Trainer Box | 11 |
| Booster Bundle (two styles, September 6, 2024) | 6 |
| Kingdra ex Special Illustration Collection | 5 |
| Greninja ex Special Illustration Collection | 5 |
| Kingambit Illustration Collection | 4 |
| Three-Booster Pack and Promo Card Blister | 3 |
| Mini Tins | 2 |
| Shrouded Fable Mini Tin Bundle | Unknown |

- Pack counts per product are fixed.
- Hits per product: Unknown.

<!-- product-catalog:start (generated by tools/ppt/sealed_catalog.py; do not edit) -->
### Product catalog

Every physical sealed product that the TCGplayer catalog (TCGCSV) lists for this set, fetched 2026-09-12. Code cards are left out.

- **Packs** is the number of booster packs. **Packs from** names the source: the TCGplayer description, the product name, the Bulbapedia TCG merchandise page for the series, or a default for the kind (booster box 36, booster bundle 6, Build & Battle Box 4). Check a default before the game uses it.
- **Holds** is what a case or a display holds.
- **Release** is the quarter from the TCGplayer release date. "(set)" means the quarter of the set's release date.
- **PPT price** is Yes when PokemonPriceTracker has a price. Prices are in `tools/ppt/cache/sealed/`, not in the docs.

TCGplayer group `23529`: 23 products.

| TCGplayer ID | Product | Kind | Packs | Packs from | Holds | Release | PPT price |
|---|---|---|---|---|---|---|---|
| 553007 | Shrouded Fable 3 Pack Blister [Pecharunt] | Blister | 3 | Description | — | 2024 Q3 | Yes |
| 553031 | Shrouded Fable Booster Bundle | Booster bundle | 6 | Description | — | 2024 Q3 (set) | Yes |
| 552997 | Shrouded Fable Booster Pack | Booster pack | 1 | Kind default | — | 2024 Q3 | Yes |
| 553094 | Kingambit Illustration Collection Case | Case or display | — | — | 1 collections | 2024 Q3 (set) | Yes |
| 665643 | Shrouded Fable 3 Pack Blister Case | Case or display | — | — | Unknown number of blisters | 2024 Q3 (set) | No |
| 635736 | Shrouded Fable Booster Bundle Case | Case or display | — | — | 20 booster bundles | 2024 Q3 (set) | Yes |
| 618355 | Shrouded Fable Booster Bundle Display | Case or display | — | — | 10 booster bundles | 2024 Q3 (set) | Yes |
| 635485 | Shrouded Fable Booster Bundle Display Case | Case or display | — | — | 6 booster bundles | 2024 Q3 (set) | No |
| 553099 | Shrouded Fable Elite Trainer Box Case | Case or display | — | — | Unknown number of elite trainer boxes | 2024 Q3 (set) | Yes |
| 553008 | Shrouded Fable Mini Tin Display | Case or display | — | — | 2 mini tins | 2024 Q3 (set) | Yes |
| 553102 | Shrouded Fable Pokemon Center Elite Trainer Box (Exclusive) Case | Case or display | — | — | 4 elite trainer boxes | 2024 Q3 | Yes |
| 553075 | Shrouded Fable Special Illustration Collection Case | Case or display | — | — | Unknown number of collections | 2024 Q3 | Yes |
| 553002 | Greninja ex Special Illustration Collection | Collection | 5 | Description | — | 2024 Q3 | Yes |
| 553000 | Kingambit Illustration Collection | Collection | 4 | Description | — | 2024 Q3 | Yes |
| 553001 | Kingdra ex Special Illustration Collection | Collection | 5 | Description | — | 2024 Q3 | Yes |
| 552999 | Shrouded Fable Elite Trainer Box | Elite Trainer Box | 9 | Description | — | 2024 Q3 | Yes |
| 552998 | Shrouded Fable Pokemon Center Elite Trainer Box (Exclusive) | Elite Trainer Box | 11 | Description | — | 2024 Q3 | Yes |
| 553023 | Shrouded Fable Mini Tin (Dusknoir) | Tin | 2 | Description | — | 2024 Q3 | Yes |
| 553018 | Shrouded Fable Mini Tin (Fezandipiti) | Tin | 2 | Description | — | 2024 Q3 | Yes |
| 553011 | Shrouded Fable Mini Tin (Munkidori) | Tin | 2 | Description | — | 2024 Q3 | Yes |
| 553012 | Shrouded Fable Mini Tin (Okidogi) | Tin | 2 | Description | — | 2024 Q3 | Yes |
| 553010 | Shrouded Fable Mini Tin (Zoroark) | Tin | 2 | Description | — | 2024 Q3 | Yes |
| 553009 | Shrouded Fable Mini Tin [Set of 5] | Tin | 2 | Description | — | 2024 Q3 | Yes |
<!-- product-catalog:end -->

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv06.5`), fetched 2026-09-12. The list has 99 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/064 | Joltik | Pokémon (Grass) | Common | Normal, Reverse holo |
| 002/064 | Galvantula | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 003/064 | Rowlet | Pokémon (Grass) | Common | Normal, Reverse holo |
| 004/064 | Dartrix | Pokémon (Grass) | Common | Normal, Reverse holo |
| 005/064 | Decidueye | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 006/064 | Tapu Bulu | Pokémon (Grass) | Rare | Holo, Reverse holo |
| 007/064 | Houndour | Pokémon (Fire) | Common | Normal, Reverse holo |
| 008/064 | Houndoom | Pokémon (Fire) | Common | Normal, Reverse holo |
| 009/064 | Iron Moth | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 010/064 | Horsea | Pokémon (Water) | Common | Normal, Holo (Cosmos), Reverse holo |
| 011/064 | Seadra | Pokémon (Water) | Common | Normal, Holo (Cosmos), Reverse holo |
| 012/064 | Kingdra ex | Pokémon (Water) | Double rare | Holo, Holo (Set logo) |
| 013/064 | Sneasel | Pokémon (Water) | Common | Normal, Reverse holo |
| 014/064 | Weavile | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 015/064 | Revavroom ex | Pokémon (Lightning) | Double rare | Holo |
| 016/064 | Drowzee | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 017/064 | Hypno | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 018/064 | Duskull | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 019/064 | Dusclops | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 020/064 | Dusknoir | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 021/064 | Cresselia | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 022/064 | Sylveon | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 023/064 | Croagunk | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 024/064 | Toxicroak | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 025/064 | Bloodmoon Ursaluna | Pokémon (Fighting) | Rare | Holo, Reverse holo |
| 026/064 | Slither Wing | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 027/064 | Zubat | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 028/064 | Golbat | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 029/064 | Crobat | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 030/064 | Absol | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 031/064 | Zorua | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 032/064 | Zoroark | Pokémon (Darkness) | Rare | Holo, Reverse holo |
| 033/064 | Inkay | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 034/064 | Malamar | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 035/064 | Yveltal | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 036/064 | Okidogi ex | Pokémon (Darkness) | Double rare | Holo |
| 037/064 | Munkidori ex | Pokémon (Darkness) | Double rare | Holo |
| 038/064 | Fezandipiti ex | Pokémon (Darkness) | Double rare | Holo |
| 039/064 | Pecharunt ex | Pokémon (Darkness) | Double rare | Holo |
| 040/064 | Genesect | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 041/064 | Cufant | Pokémon (Metal) | Common | Normal, Reverse holo |
| 042/064 | Copperajah | Pokémon (Metal) | Rare | Holo, Reverse holo |
| 043/064 | Varoom | Pokémon (Metal) | Common | Normal, Reverse holo |
| 044/064 | Axew | Pokémon (Dragon) | Common | Normal, Reverse holo |
| 045/064 | Fraxure | Pokémon (Dragon) | Common | Normal, Reverse holo |
| 046/064 | Haxorus | Pokémon (Dragon) | Rare | Holo, Reverse holo |
| 047/064 | Kyurem | Pokémon (Dragon) | Uncommon | Normal, Reverse holo |
| 048/064 | Meowth | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 049/064 | Persian | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 050/064 | Eevee | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 051/064 | Furfrou | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 052/064 | Stufful | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 053/064 | Bewear | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 054/064 | Academy at Night | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 055/064 | Binding Mochi | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 056/064 | Cassiopeia | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 057/064 | Colress's Tenacity | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 058/064 | Dangerous Laser | Trainer (Item) | ACE SPEC Rare | Holo |
| 059/064 | Janine's Secret Art | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 060/064 | Neutralization Zone | Trainer (Stadium) | ACE SPEC Rare | Holo |
| 061/064 | Night Stretcher | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 062/064 | Poké Vital A | Trainer (Item) | ACE SPEC Rare | Holo |
| 063/064 | Powerglass | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 064/064 | Xerosic's Machinations | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 065/064 | Tapu Bulu | Pokémon (Grass) | Illustration rare | Holo |
| 066/064 | Houndoom | Pokémon (Fire) | Illustration rare | Holo |
| 067/064 | Horsea | Pokémon (Water) | Illustration rare | Holo |
| 068/064 | Duskull | Pokémon (Psychic) | Illustration rare | Holo |
| 069/064 | Dusclops | Pokémon (Psychic) | Illustration rare | Holo |
| 070/064 | Dusknoir | Pokémon (Psychic) | Illustration rare | Holo |
| 071/064 | Cresselia | Pokémon (Psychic) | Illustration rare | Holo |
| 072/064 | Munkidori | Pokémon (Psychic) | Illustration rare | Holo |
| 073/064 | Fezandipiti | Pokémon (Psychic) | Illustration rare | Holo |
| 074/064 | Okidogi | Pokémon (Fighting) | Illustration rare | Holo |
| 075/064 | Zorua | Pokémon (Darkness) | Illustration rare | Holo |
| 076/064 | Cufant | Pokémon (Metal) | Illustration rare | Holo |
| 077/064 | Fraxure | Pokémon (Dragon) | Illustration rare | Holo |
| 078/064 | Persian | Pokémon (Colorless) | Illustration rare | Holo |
| 079/064 | Bewear | Pokémon (Colorless) | Illustration rare | Holo |
| 080/064 | Kingdra ex | Pokémon (Water) | Ultra Rare | Holo |
| 081/064 | Revavroom ex | Pokémon (Lightning) | Ultra Rare | Holo |
| 082/064 | Okidogi ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 083/064 | Munkidori ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 084/064 | Fezandipiti ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 085/064 | Pecharunt ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 086/064 | Cassiopeia | Trainer (Supporter) | Ultra Rare | Holo |
| 087/064 | Colress's Tenacity | Trainer (Supporter) | Ultra Rare | Holo |
| 088/064 | Janine's Secret Art | Trainer (Supporter) | Ultra Rare | Holo |
| 089/064 | Xerosic's Machinations | Trainer (Supporter) | Ultra Rare | Holo |
| 090/064 | Okidogi ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 091/064 | Munkidori ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 092/064 | Fezandipiti ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 093/064 | Pecharunt ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 094/064 | Cassiopeia | Trainer (Supporter) | Special illustration rare | Holo |
| 095/064 | Pecharunt ex | Pokémon (Darkness) | Hyper rare | Holo, Holo (Gold) |
| 096/064 | Earthen Vessel | Trainer (Item) | Hyper rare | Holo, Holo (Gold) |
| 097/064 | Powerglass | Trainer (Tool) | Hyper rare | Holo, Holo (Gold) |
| 098/064 | Basic Darkness Energy | Energy (Normal) | Hyper rare | Holo, Holo (Gold) |
| 099/064 | Basic Metal Energy | Energy (Normal) | Hyper rare | Holo, Holo (Gold) |

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

Confidence: this map follows the pack structure above. No source gives reliable odds for this set (see the rarity list), so every outcome but Common, Uncommon, and the fixed slots uses `—`.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 4 | Common | Common | Common | Normal | All | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Reverse holo slot 1 | 1 | ACE SPEC Rare | ACE SPEC Rare | ACE SPEC Rare | Holo | All | — |
| Reverse holo slot 1 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | — |
| Reverse holo slot 2 | 1 | Illustration Rare | Illustration Rare | Illustration rare | Holo | All | — |
| Reverse holo slot 2 | 1 | Special Illustration Rare | Special Illustration Rare | Special illustration rare | Holo | All | — |
| Reverse holo slot 2 | 1 | Hyper Rare | Hyper Rare | Hyper rare | Holo (Gold) | All | — |
| Reverse holo slot 2 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | — |
| Rare slot | 1 | Double Rare | Double Rare | Double rare | Holo | All | — |
| Rare slot | 1 | Ultra Rare | Ultra Rare | Ultra Rare | Holo | All | — |
| Rare slot | 1 | Rare | Rare | Rare | Holo | All | — |
| Basic Energy | 1 | Basic Energy | — | — | — | — | 100% |
| Code card | 1 | Code card | — | — | — | — | 100% |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. Shrouded Fable has no
booster box; packs came only in Elite Trainer Boxes and other set
products. Reverse holo slot 1 can hold an ACE SPEC Rare instead of a
plain reverse holo. No source gives reliable odds for this set, so the
order follows the era's rarity system.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | — | Yes |
| 5 | Double Rare | Rarity | — | Yes |
| 6 | Ultra Rare | Rarity | — | Yes |
| 7 | Illustration Rare | Rarity | — | Yes |
| 8 | Special Illustration Rare | Rarity | — | Yes |
| 9 | Hyper Rare | Rarity | — | Yes |
| 10 | ACE SPEC Rare | Rarity | — | Yes |

## Sources

- [Bulbapedia — Shrouded Fable (TCG)](https://bulbapedia.bulbagarden.net/wiki/Shrouded_Fable_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Scarlet & Violet TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Scarlet_%26_Violet_TCG_Series_merchandise)
- [PokeBeach — "Scarlet & Violet" Booster Pack Configuration Finally Revealed](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes)
- [Dripshop — Shrouded Fable Pull Rates – Full Breakdown & Rarest Cards!](https://www.dripshop.live/blog/pokemon-trading-cards/you-ll-never-guess-the-pull-rates-in-shrouded-fable)
- [Pokemon Engage — Shrouded Fable Pull Rates](https://pokemonengage.wordpress.com/2024/08/15/shrouded-fable-pull-rates/)
- [ThePriceDex — Shrouded Fable Pull Rates](https://www.thepricedex.com/set/sv6pt5/shrouded-fable/pull-rates)
- [PokéPatch — Shrouded Fable Pull Rates](https://pokepatch.com/2025/05/24/shrouded-fable-pull-rates-in-pokemon-tcg-set/)
- [PokeBeach — "Shrouded Fable" Set Guide! Card Images, Special Reverse Holos, and Product List!](https://www.pokebeach.com/2024/07/shrouded-fable-set-guide-card-images-special-reverse-holos-and-product-list) (search extract only)

## Open topics

- **Slot map:** all 5 Hyper Rare cards carry both a plain Holo print
  and a Holo (Gold) print. The slot map uses Holo (Gold) as the pack
  print, per the era rule that Hyper Rares are gold cards, so the
  plain Holo print stays unused.
- **No reliable odds.** Find a large, documented study (for example, a
  TCGplayer study) for this set. Until then, every figure is a community
  estimate. Searched 2026-09-12: no TCGplayer Authentication Center
  study was found for this set; only the three community sources
  already in this file.
- **Source conflicts.** Special Illustration Rare: 1 in 64, 1 in 67, or 1 in
  87.2. Hyper Rare: 1 in 118, 1 in 128.3, or 1 in 144.
- **Dripshop specific-card figures** for the Ultra Rare and ACE SPEC Rare
  match Temporal Forces, not this set.
- **"Full Art" and "FA-SP"** in the Pokemon Engage data: meaning Unknown.
- **Slot confirmation.** No opened-pack source confirms the slot for each
  rarity in this set.
- **Cards per pack.** ThePriceDex says 11. The era template says 12.
- **Parallel foil:** resolved as the look of every reverse holo in this
  set, not a separate rarity. See "Special subsets and mechanics" above.
- **Reverse holo Basic Energy rate:** Unknown.
- **Physical pack order.** No opened-pack source confirms it.
- **Era conflicts:** the Hyper Rare slot and the last card.
- **Pack count** for the Mini Tin Bundle: Unknown.
- **Rarity list odds:** no source gives reliable odds per pack for Rare, Double Rare, Ultra Rare, Illustration Rare, Special Illustration Rare, Hyper Rare and ACE SPEC Rare. The era's rarity system decides the place of each one in the rarity list.
- **Rarity list order:** the era's rarity system places ACE SPEC Rare after Hyper Rare, but community estimates put ACE SPEC Rare around 1 in 20, more common than Special Illustration Rare and Hyper Rare. This file follows the era order because no source is reliable enough to choose specific odds.
