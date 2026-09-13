# Destined Rivals (2025)

Set-specific data for Destined Rivals. This is one file per set. See
[../13-sets.md](../13-sets.md) for the general approach and the index.
This set is a priority set for the first playable loop.
The shared pack template, pack order, and rarity system are in
[eras/scarlet-violet.md](eras/scarlet-violet.md). This file records the set
data and every exception.

## Release

| Field | Value | Source |
|---|---|---|
| English release date | May 30, 2025 | Bulbapedia |
| Series number | SV10 (English set number 104) | Bulbapedia |
| Set code | DRI | Not confirmed in a fetched source |
| Main set | 182 cards | Bulbapedia, Cardrake |
| Secret rares | 62 cards | Bulbapedia expansion list, Cardrake |
| Total | 244 cards | Bulbapedia |

Bulbapedia calls it "the tenth and final main expansion of cards from
the Scarlet & Violet Series." Some cards were available from May 16,
2025 in the Marnie and Steven Rival Battle Decks. Those are decks, not
booster packs.

### Cards per rarity

| Rarity | Count | Part of |
|---|---|---|
| Common | 85 | Main set |
| Uncommon | 62 | Main set |
| Rare | 18 | Main set |
| Double Rare | 17 | Main set |
| ACE SPEC Rare | 0 | No source lists ACE SPEC cards in this set |
| Illustration Rare | 23 | Secret |
| Ultra Rare | 22 | Secret (14 Pokémon ex, 8 full-art Trainers) |
| Special Illustration Rare | 11 | Secret |
| Hyper Rare | 6 | Secret (gold) |

Source: Cardrake. Game Rant gives the same counts for Double Rare,
Ultra Rare, Illustration Rare, Special Illustration Rare, and Hyper
Rare. Bulbapedia gives 23 Illustration Rares, 11 Special Illustration
Rares, and 6 Hyper Rares.

## Pack structure

Official product text: each pack holds "10 cards and 1 Basic Energy
(cards vary by pack)" (Sleeved Booster Pack, tcg.pokemon.com). The
official Pokémon Support page says every Scarlet & Violet pack also
holds a code card.

| Slot | Count | What the slot can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo 1 | 1 | Reverse holo of a Common, Uncommon, or Rare |
| Reverse holo 2 | 1 | Reverse holo, or a hit: Illustration Rare or Special Illustration Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare, or Hyper Rare (see conflict below) |
| Basic Energy | 1 | Basic Energy |
| Code card | 1 | Pokémon TCG Live code |

Confidence:
- **Official:** 10 cards plus 1 Basic Energy. Pokémon Support: "4
  commons, 3 uncommons, and 3 foils (at least one of which will be
  rare or higher)".
- **Secondary report of the official configuration:** the slot
  contents (PokeBeach 2023 extract, the Scarlet & Violet template).
  No Destined Rivals source changes the template.
- **Conflict (Hyper Rare slot):** PokeBeach puts it in the rare slot.
  Card Shop Live (1,728 base Scarlet & Violet packs) counts it in the
  second reverse holo slot.

## Pack order

Confidence: **secondary report** (PokeBeach 2023 extract) for the
Scarlet & Violet template. No source shows an opened Destined Rivals
pack.

With the front card toward the player:

| Position | Card |
|---|---|
| 1–4 | 4 Commons |
| 5–7 | 3 Uncommons |
| 8 | Reverse holo 1 |
| 9 | Reverse holo 2 (Illustration Rare or Special Illustration Rare if the pack has one) |
| 10 | Rare slot (Double Rare, Ultra Rare, Hyper Rare, or Rare) |
| 11 | Basic Energy |
| 12 | Code card |

Where the hit sits:
- **Rare-slot hit:** position 10 of 12, the third-last card. It **is**
  one of the last three cards.
- **Illustration Rare or Special Illustration Rare:** position 9 of
  12, the fourth-last card. It is **not** one of the last three cards,
  unless the rip screen skips the Energy and the code card.
- A pack can have two hits (positions 9 and 10).

Exceptions and conflicts:
- **Energy and code card position:** one extract puts them last.
  Another extract says the code card is the first card the player
  sees. TheGamer's account (see
  [eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template))
  suggests these describe the same fixed stack, seen from two ends: the
  code card sits last in the stack, but becomes the first card the
  player sees after the pack trick flips the stack for a reveal. No
  source settles which face of the wrapper is the "front".

## Rarities and hit odds

The main figures come from a TCGplayer study of "more than 8,000
booster packs". The TCGplayer article needs JavaScript. This file
reads the figures through Game Rant (May 31, 2025) and pullrates.gg.
Both give the same numbers.

| Rarity | Any card of the rarity | Specific card | Confidence |
|---|---|---|---|
| Double Rare | 1 in 5 | 1 in 86 | Empirical study (TCGplayer, 8,000+ packs) |
| Ultra Rare | 1 in 16 | 1 in 344 | Empirical study (TCGplayer, 8,000+ packs) |
| Illustration Rare | 1 in 12 | 1 in 278 | Empirical study (TCGplayer, 8,000+ packs) |
| Special Illustration Rare | 1 in 94 | 1 in 1,033 | Empirical study (TCGplayer, 8,000+ packs) |
| Hyper Rare | 1 in 149 | 1 in 894 | Empirical study (TCGplayer, 8,000+ packs) |
| ACE SPEC Rare | Not in this set | — | — |
| Black White Rare | Not in this set | — | — |
| Pattern reverse holo | Not in this set | — | — |
| Any secret rare | about 16% per pack | — | Community estimate (TikTok summary of the same 8,000-pack data) |

Other data, for comparison only:

| Rarity | Rate | Sample | Confidence |
|---|---|---|---|
| Special Illustration Rare | 2 pulled (about 1 in 50) | 100 packs | Empirical study, very small sample (tcgtalk) |
| Hyper Rare | 1 pulled | 100 packs | Empirical study, very small sample (tcgtalk) |
| Full art (Ultra Rare) | 6 pulled | 100 packs | Empirical study, very small sample (tcgtalk) |
| Special Illustration Rare | "~1 in 100" | Not given | Community estimate (tcgtalk) |
| Hyper Rare | "~1 in 50" | Not given | Community estimate (tcgtalk). It conflicts with the TCGplayer study. Do not use it. |

**Default for the simulation:** use the TCGplayer study. Treat all
cards in one rarity as equally likely. The specific-card column agrees
with equal weight: 1 in 94 split over 11 cards is 1 in 1,034. The
study gives 1 in 1,033. The source can derive the specific figure by
this division, so the match does not prove equal weight.

## Special subsets and mechanics

- **Trainer's Pokémon and Team Rocket.** The set has "83 cards
  relating to Team Rocket" and "17 Pokémon ex, including 10 Trainer's
  Pokémon ex" (Bulbapedia). This is a card mechanic. It does not change
  the pack.
- **Four booster pack artworks:** Giovanni and Mewtwo, Team Rocket,
  Cynthia and Garchomp, and Ethan and Ho-Oh (Bulbapedia). No source
  links an artwork to the contents.
- **No ACE SPEC Rares** in the rarity counts.
- **God packs:** social media posts mention "demi-god packs". No
  reliable source confirms them. Confidence: unknown.
- The set includes cards from the Japanese Hot Wind Arena and Glory of
  the Rocket Gang sets and two ex Starter Sets (Bulbapedia).

## Sealed products

| Product | Packs | Other contents | Source |
|---|---|---|---|
| Booster Display Box | 36 | — | Pokémon Center |
| Elite Trainer Box | 9 | 1 Team Rocket's Wobbuffet full-art foil promo, 65 sleeves, 45 Energy cards, dice, markers, code card | tcg.pokemon.com |
| Pokémon Center Elite Trainer Box | 11 | 2 Team Rocket's Wobbuffet full-art foil promos, 65 sleeves, 45 Energy cards, accessories | tcg.pokemon.com |
| Booster Bundle | 6 | — | tcg.pokemon.com, Pokémon Center |
| Build & Battle Box | 4 | 40-card deck with 1 of 4 foil promos | tcg.pokemon.com |
| Sleeved Booster Pack | 1 | — | tcg.pokemon.com |
| Premium Collections | Unknown | — | Bulbapedia names them without pack counts |
| Ultra-Premium Collection | Unknown | — | Bulbapedia names it without a pack count |

Collation: **unknown**. No source describes fixed hits per box. Model
each pack as an independent draw.

Boxes per case: **6** (era-wide retailer consensus, not official; see
[eras/scarlet-violet.md](eras/scarlet-violet.md#sealed-product-template)).

<!-- product-catalog:start (generated by tools/ppt/sealed_catalog.py; do not edit) -->
### Product catalog

Every physical sealed product that the TCGplayer catalog (TCGCSV) lists for this set, fetched 2026-09-12. Code cards, and deck products with no booster pack (fixed cards, no random pull), are left out.

- **Packs** is the number of booster packs. **Packs from** names the source: the TCGplayer description, the product name, the Bulbapedia TCG merchandise page for the series, the set file's own table (Build & Battle Stadium: boxes × 4 plus the extra packs), or a default for the kind (booster box 36, booster bundle 6, Build & Battle Box 4). Check a default before the game uses it.
- **Holds** is what a case or a display holds.
- **Release** is the quarter from the TCGplayer release date. "(set)" means the quarter of the set's release date.
- **PPT price** is Yes when PokemonPriceTracker has a price. Prices are in `tools/ppt/cache/sealed/`, not in the docs.

TCGplayer group `24269`: 25 products.

| TCGplayer ID | Product | Kind | Packs | Packs from | Holds | Release | PPT price |
|---|---|---|---|---|---|---|---|
| 625683 | Destined Rivals 3 Pack Blister [Kangaskhan] | Blister | 3 | Description | — | 2025 Q2 | Yes |
| 635328 | Destined Rivals 3 Pack Blister [Set of 2] | Blister | 3 | Description | — | 2025 Q2 (set) | Yes |
| 625684 | Destined Rivals 3 Pack Blister [Zebstrika] | Blister | 3 | Description | — | 2025 Q2 | Yes |
| 628395 | Destined Rivals Premium Checklane Blister [Gastrodon] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 628396 | Destined Rivals Premium Checklane Blister [Rabsca] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 625687 | Destined Rivals Premium Checklane Blister [Skeledirge] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 625688 | Destined Rivals Premium Checklane Blister [Togekiss] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 633105 | Destined Rivals Single Pack Blister [Eevee] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 633106 | Destined Rivals Single Pack Blister [Zarude] | Blister | 1 | Description | — | 2025 Q2 | Yes |
| 624679 | Destined Rivals Booster Box | Booster box | 36 | Description | — | 2025 Q2 | Yes |
| 624681 | Destined Rivals Half Booster Box | Booster box | 18 | Description | — | 2025 Q2 | Yes |
| 625670 | Destined Rivals Booster Bundle | Booster bundle | 6 | Description | — | 2025 Q2 | Yes |
| 624683 | Destined Rivals Booster Pack | Booster pack | 6 | Bulbapedia | — | 2025 Q2 | Yes |
| 649711 | Destined Rivals Booster Pack Art Bundle [Set of 4] | Booster pack | 4 | Name | — | 2025 Q2 (set) | Yes |
| 650765 | Destined Rivals Fun Pack | Booster pack | 1 | Kind default | — | 2025 Q2 (set) | Yes |
| 624684 | Destined Rivals Sleeved Booster Pack | Booster pack | 1 | Kind default | — | 2025 Q2 | Yes |
| 635053 | Destined Rivals Sleeved Booster Pack Art Bundle [Set of 4] | Booster pack | 4 | Name | — | 2025 Q2 (set) | Yes |
| 625677 | Destined Rivals Build & Battle Box | Build & Battle | 4 | Description | — | 2025 Q2 | Yes |
| 624678 | Destined Rivals Booster Box Case | Case or display | — | — | Unknown number of tins | 2025 Q2 | Yes |
| 628428 | Destined Rivals Booster Bundle Case | Case or display | — | — | Unknown number of tins | 2025 Q2 | Yes |
| 634383 | Destined Rivals Build & Battle Box Display | Case or display | — | — | 10 build & battle boxes | 2025 Q2 | Yes |
| 628398 | Destined Rivals Elite Trainer Box Case | Case or display | — | — | 10 elite trainer boxes | 2025 Q2 | Yes |
| 628413 | Destined Rivals Sleeved Booster Case | Case or display | — | — | Unknown number of tins | 2025 Q2 | Yes |
| 624676 | Destined Rivals Elite Trainer Box | Elite Trainer Box | 9 | Description | — | 2025 Q2 (set) | Yes |
| 624675 | Destined Rivals Pokemon Center Elite Trainer Box (Exclusive) | Elite Trainer Box | 11 | Description | — | 2025 Q2 | Yes |
<!-- product-catalog:end -->

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv10`), fetched 2026-09-12. The list has 244 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.
- Where the TCGplayer catalog lists a card only as holo, the list removes the plain Normal print that TCGdex gives it. This removed 5 prints.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/182 | Ethan's Pinsir | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 002/182 | Yanma | Pokémon (Grass) | Common | Normal, Reverse holo |
| 003/182 | Yanmega ex | Pokémon (Grass) | Double rare | Holo |
| 004/182 | Pineco | Pokémon (Grass) | Common | Normal, Reverse holo |
| 005/182 | Shroomish | Pokémon (Grass) | Common | Normal, Reverse holo |
| 006/182 | Breloom | Pokémon (Grass) | Common | Normal, Reverse holo |
| 007/182 | Cynthia's Roselia | Pokémon (Grass) | Common | Normal, Reverse holo |
| 008/182 | Cynthia's Roserade | Pokémon (Grass) | Rare | Reverse holo, Holo |
| 009/182 | Mow Rotom | Pokémon (Grass) | Common | Normal, Reverse holo |
| 010/182 | Shaymin | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 011/182 | Dwebble | Pokémon (Grass) | Common | Normal, Reverse holo |
| 012/182 | Crustle | Pokémon (Grass) | Rare | Reverse holo, Holo |
| 013/182 | Fomantis | Pokémon (Grass) | Common | Normal, Reverse holo |
| 014/182 | Lurantis | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 015/182 | Team Rocket's Blipbug | Pokémon (Grass) | Common | Normal, Reverse holo |
| 016/182 | Applin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 017/182 | Dipplin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 018/182 | Hydrapple | Pokémon (Grass) | Rare | Reverse holo, Holo, Holo (Cosmos) |
| 019/182 | Team Rocket's Tarountula | Pokémon (Grass) | Common | Normal, Reverse holo |
| 020/182 | Team Rocket's Spidops | Pokémon (Grass) | Rare | Reverse holo, Holo |
| 021/182 | Smoliv | Pokémon (Grass) | Common | Normal, Reverse holo |
| 022/182 | Dolliv | Pokémon (Grass) | Common | Normal, Reverse holo |
| 023/182 | Arboliva ex | Pokémon (Grass) | Double rare | Holo |
| 024/182 | Rellor | Pokémon (Grass) | Common | Normal, Reverse holo, Holo (Cosmos) |
| 025/182 | Rabsca ex | Pokémon (Grass) | Double rare | Holo |
| 026/182 | Teal Mask Ogerpon | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 027/182 | Growlithe | Pokémon (Fire) | Common | Normal, Reverse holo |
| 028/182 | Arcanine | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 029/182 | Ponyta | Pokémon (Fire) | Common | Normal, Reverse holo |
| 030/182 | Rapidash | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 031/182 | Team Rocket's Moltres ex | Pokémon (Fire) | Double rare | Holo, Holo (Set logo) |
| 032/182 | Ethan's Cyndaquil | Pokémon (Fire) | Common | Normal, Reverse holo |
| 033/182 | Ethan's Quilava | Pokémon (Fire) | Common | Normal, Reverse holo |
| 034/182 | Ethan's Typhlosion | Pokémon (Fire) | Rare | Reverse holo, Holo, Holo (Set logo), Holo (Staff) |
| 035/182 | Ethan's Slugma | Pokémon (Fire) | Common | Normal, Reverse holo |
| 036/182 | Ethan's Magcargo | Pokémon (Fire) | Rare | Reverse holo, Holo |
| 037/182 | Team Rocket's Houndour | Pokémon (Fire) | Common | Normal, Reverse holo |
| 038/182 | Team Rocket's Houndoom | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 039/182 | Ethan's Ho-Oh ex | Pokémon (Fire) | Double rare | Holo |
| 040/182 | Torchic | Pokémon (Fire) | Common | Normal, Reverse holo |
| 041/182 | Combusken | Pokémon (Fire) | Common | Normal, Reverse holo |
| 042/182 | Blaziken | Pokémon (Fire) | Rare | Reverse holo, Holo, Holo (Cosmos) |
| 043/182 | Heat Rotom | Pokémon (Fire) | Common | Normal, Reverse holo |
| 044/182 | Hearthflame Mask Ogerpon | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 045/182 | Misty's Psyduck | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 046/182 | Misty's Staryu | Pokémon (Water) | Common | Normal, Reverse holo |
| 047/182 | Misty's Starmie | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 048/182 | Misty's Magikarp | Pokémon (Water) | Common | Normal, Reverse holo |
| 049/182 | Misty's Gyarados | Pokémon (Water) | Rare | Reverse holo, Holo, Holo (Set logo), Holo (Set logo, Staff) |
| 050/182 | Misty's Lapras | Pokémon (Water) | Common | Normal, Reverse holo |
| 051/182 | Team Rocket's Articuno | Pokémon (Water) | Rare | Reverse holo, Holo, Holo (Set logo), Holo (Cosmos) |
| 052/182 | Cynthia's Feebas | Pokémon (Water) | Common | Normal, Reverse holo |
| 053/182 | Cynthia's Milotic | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 054/182 | Clamperl | Pokémon (Water) | Common | Normal, Reverse holo |
| 055/182 | Huntail | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 056/182 | Gorebyss | Pokémon (Water) | Rare | Reverse holo, Holo |
| 057/182 | Buizel | Pokémon (Water) | Common | Normal, Reverse holo |
| 058/182 | Floatzel | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 059/182 | Snover | Pokémon (Water) | Common | Normal, Reverse holo |
| 060/182 | Abomasnow | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 061/182 | Wash Rotom | Pokémon (Water) | Common | Normal, Reverse holo |
| 062/182 | Arrokuda | Pokémon (Water) | Common | Normal, Reverse holo |
| 063/182 | Barraskewda | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 064/182 | Cetoddle | Pokémon (Water) | Common | Normal, Reverse holo |
| 065/182 | Cetitan ex | Pokémon (Water) | Double rare | Holo |
| 066/182 | Dondozo ex | Pokémon (Water) | Double rare | Holo |
| 067/182 | Wellspring Mask Ogerpon | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 068/182 | Electabuzz | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 069/182 | Electivire ex | Pokémon (Lightning) | Double rare | Holo |
| 070/182 | Team Rocket's Zapdos | Pokémon (Lightning) | Rare | Reverse holo, Holo, Holo (Set logo), Holo (Cosmos, Eb games), Holo (Cosmos) |
| 071/182 | Ethan's Pichu | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 072/182 | Team Rocket's Mareep | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 073/182 | Team Rocket's Flaaffy | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 074/182 | Team Rocket's Ampharos | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 075/182 | Electrike | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 076/182 | Manectric | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 077/182 | Rotom | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 078/182 | Zeraora | Pokémon (Lightning) | Rare | Reverse holo, Holo |
| 079/182 | Team Rocket's Drowzee | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 080/182 | Team Rocket's Hypno | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 081/182 | Team Rocket's Mewtwo ex | Pokémon (Psychic) | Double rare | Holo |
| 082/182 | Team Rocket's Wobbuffet | Pokémon (Psychic) | Rare | Reverse holo, Holo |
| 083/182 | Steven's Baltoy | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 084/182 | Steven's Claydol | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 085/182 | Team Rocket's Chingling | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 086/182 | Steven's Carbink | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 087/182 | Team Rocket's Mimikyu | Pokémon (Psychic) | Uncommon | Normal, Reverse holo, Holo (Set logo), Holo (Set logo, Staff) |
| 088/182 | Team Rocket's Dottler | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 089/182 | Team Rocket's Orbeetle | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 090/182 | Mankey | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 091/182 | Primeape | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 092/182 | Annihilape | Pokémon (Fighting) | Rare | Reverse holo, Holo |
| 093/182 | Ethan's Sudowoodo | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 094/182 | Team Rocket's Larvitar | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 095/182 | Team Rocket's Pupitar | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 096/182 | Team Rocket's Tyranitar | Pokémon (Fighting) | Rare | Reverse holo, Holo, Holo (Set logo), Holo (Set logo, Staff), Holo (Cosmos) |
| 097/182 | Nosepass | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 098/182 | Probopass | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 099/182 | Meditite | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 100/182 | Medicham | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 101/182 | Regirock ex | Pokémon (Fighting) | Double rare | Holo |
| 102/182 | Cynthia's Gible | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 103/182 | Cynthia's Gabite | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 104/182 | Cynthia's Garchomp ex | Pokémon (Fighting) | Double rare | Holo |
| 105/182 | Hippopotas | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 106/182 | Hippowdon | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 107/182 | Mudbray | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 108/182 | Mudsdale | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 109/182 | Arven's Toedscool | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 110/182 | Arven's Toedscruel | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 111/182 | Cornerstone Mask Ogerpon | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 112/182 | Team Rocket's Ekans | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 113/182 | Team Rocket's Arbok | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 114/182 | Team Rocket's Nidoran♀ | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 115/182 | Team Rocket's Nidorina | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 116/182 | Team Rocket's Nidoqueen | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 117/182 | Team Rocket's Nidoran♂ | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 118/182 | Team Rocket's Nidorino | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 119/182 | Team Rocket's Nidoking ex | Pokémon (Darkness) | Double rare | Holo |
| 120/182 | Team Rocket's Zubat | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 121/182 | Team Rocket's Golbat | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 122/182 | Team Rocket's Crobat ex | Pokémon (Darkness) | Double rare | Holo |
| 123/182 | Team Rocket's Grimer | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 124/182 | Team Rocket's Muk | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 125/182 | Team Rocket's Koffing | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 126/182 | Team Rocket's Weezing | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 127/182 | Team Rocket's Murkrow | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 128/182 | Team Rocket's Sneasel | Pokémon (Darkness) | Rare | Reverse holo, Holo |
| 129/182 | Cynthia's Spiritomb | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 130/182 | Marnie's Purrloin | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 131/182 | Marnie's Liepard | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 132/182 | Marnie's Scraggy | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 133/182 | Marnie's Scrafty | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 134/182 | Marnie's Impidimp | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 135/182 | Marnie's Morgrem | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 136/182 | Marnie's Grimmsnarl ex | Pokémon (Darkness) | Double rare | Holo |
| 137/182 | Marnie's Morpeko | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 138/182 | Arven's Maschiff | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 139/182 | Arven's Mabosstiff ex | Pokémon (Darkness) | Double rare | Holo |
| 140/182 | Forretress | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 141/182 | Skarmory | Pokémon (Metal) | Common | Normal, Reverse holo |
| 142/182 | Steven's Skarmory | Pokémon (Metal) | Common | Normal, Reverse holo |
| 143/182 | Steven's Beldum | Pokémon (Metal) | Common | Normal, Reverse holo |
| 144/182 | Steven's Metang | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 145/182 | Steven's Metagross ex | Pokémon (Metal) | Double rare | Holo |
| 146/182 | Zamazenta | Pokémon (Metal) | Rare | Reverse holo, Holo |
| 147/182 | Team Rocket's Rattata | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 148/182 | Team Rocket's Raticate | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 149/182 | Team Rocket's Meowth | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 150/182 | Team Rocket's Persian ex | Pokémon (Colorless) | Double rare | Holo |
| 151/182 | Kangaskhan | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 152/182 | Tauros | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 153/182 | Team Rocket's Porygon | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 154/182 | Team Rocket's Porygon2 | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 155/182 | Team Rocket's Porygon-Z | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 156/182 | Taillow | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 157/182 | Swellow | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 158/182 | Arven's Skwovet | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 159/182 | Arven's Greedent | Pokémon (Colorless) | Rare | Reverse holo, Holo, Holo (Cosmos) |
| 160/182 | Squawkabilly | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 161/182 | Arven's Sandwich | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 162/182 | Cynthia's Power Weight | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 163/182 | Emcee's Hype | Trainer (Supporter) | Common | Normal, Reverse holo |
| 164/182 | Energy Recycler | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 165/182 | Ethan's Adventure | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 166/182 | Granite Cave | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 167/182 | Judge | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 168/182 | Sacred Ash | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 169/182 | Spikemuth Gym | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 170/182 | Team Rocket's Archer | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 171/182 | Team Rocket's Ariana | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 172/182 | Team Rocket's Bother-Bot | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 173/182 | Team Rocket's Factory | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 174/182 | Team Rocket's Giovanni | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 175/182 | Team Rocket's Great Ball | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 176/182 | Team Rocket's Petrel | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 177/182 | Team Rocket's Proton | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 178/182 | Team Rocket's Transceiver | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 179/182 | Team Rocket's Venture Bomb | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 180/182 | Team Rocket's Watchtower | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 181/182 | TM Machine | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 182/182 | Team Rocket's Energy | Energy (Special) | Uncommon | Normal, Reverse holo |
| 183/182 | Yanma | Pokémon (Grass) | Illustration rare | Holo |
| 184/182 | Cynthia's Roserade | Pokémon (Grass) | Illustration rare | Holo |
| 185/182 | Shaymin | Pokémon (Grass) | Illustration rare | Holo |
| 186/182 | Crustle | Pokémon (Grass) | Illustration rare | Holo |
| 187/182 | Team Rocket's Spidops | Pokémon (Grass) | Illustration rare | Holo |
| 188/182 | Hydrapple | Pokémon (Grass) | Illustration rare | Holo |
| 189/182 | Rapidash | Pokémon (Fire) | Illustration rare | Holo |
| 190/182 | Ethan's Typhlosion | Pokémon (Fire) | Illustration rare | Holo |
| 191/182 | Team Rocket's Houndoom | Pokémon (Fire) | Illustration rare | Holo |
| 192/182 | Blaziken | Pokémon (Fire) | Illustration rare | Holo |
| 193/182 | Misty's Psyduck | Pokémon (Water) | Illustration rare | Holo |
| 194/182 | Misty's Lapras | Pokémon (Water) | Illustration rare | Holo |
| 195/182 | Clamperl | Pokémon (Water) | Illustration rare | Holo |
| 196/182 | Electrike | Pokémon (Lightning) | Illustration rare | Holo |
| 197/182 | Rotom | Pokémon (Lightning) | Illustration rare | Holo |
| 198/182 | Team Rocket's Orbeetle | Pokémon (Psychic) | Illustration rare | Holo |
| 199/182 | Team Rocket's Weezing | Pokémon (Darkness) | Illustration rare | Holo |
| 200/182 | Team Rocket's Murkrow | Pokémon (Darkness) | Illustration rare | Holo |
| 201/182 | Zamazenta | Pokémon (Metal) | Illustration rare | Holo |
| 202/182 | Team Rocket's Raticate | Pokémon (Colorless) | Illustration rare | Holo |
| 203/182 | Team Rocket's Meowth | Pokémon (Colorless) | Illustration rare | Holo |
| 204/182 | Kangaskhan | Pokémon (Colorless) | Illustration rare | Holo |
| 205/182 | Arven's Greedent | Pokémon (Colorless) | Illustration rare | Holo |
| 206/182 | Yanmega ex | Pokémon (Grass) | Ultra Rare | Holo |
| 207/182 | Arboliva ex | Pokémon (Grass) | Ultra Rare | Holo |
| 208/182 | Team Rocket's Moltres ex | Pokémon (Fire) | Ultra Rare | Holo, Holo (Set logo) |
| 209/182 | Ethan's Ho-Oh ex | Pokémon (Fire) | Ultra Rare | Holo |
| 210/182 | Cetitan ex | Pokémon (Water) | Ultra Rare | Holo |
| 211/182 | Dondozo ex | Pokémon (Water) | Ultra Rare | Holo |
| 212/182 | Electivire ex | Pokémon (Lightning) | Ultra Rare | Holo |
| 213/182 | Team Rocket's Mewtwo ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 214/182 | Regirock ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 215/182 | Cynthia's Garchomp ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 216/182 | Team Rocket's Nidoking ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 217/182 | Team Rocket's Crobat ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 218/182 | Arven's Mabosstiff ex | Pokémon (Darkness) | Ultra Rare | Holo |
| 219/182 | Team Rocket's Persian ex | Pokémon (Colorless) | Ultra Rare | Holo |
| 220/182 | Emcee's Hype | Trainer (Supporter) | Ultra Rare | Holo |
| 221/182 | Ethan's Adventure | Trainer (Supporter) | Ultra Rare | Holo |
| 222/182 | Judge | Trainer (Supporter) | Ultra Rare | Holo |
| 223/182 | Team Rocket's Archer | Trainer (Supporter) | Ultra Rare | Holo |
| 224/182 | Team Rocket's Ariana | Trainer (Supporter) | Ultra Rare | Holo |
| 225/182 | Team Rocket's Giovanni | Trainer (Supporter) | Ultra Rare | Holo |
| 226/182 | Team Rocket's Petrel | Trainer (Supporter) | Ultra Rare | Holo |
| 227/182 | Team Rocket's Proton | Trainer (Supporter) | Ultra Rare | Holo |
| 228/182 | Yanmega ex | Pokémon (Grass) | Special illustration rare | Holo |
| 229/182 | Team Rocket's Moltres ex | Pokémon (Fire) | Special illustration rare | Holo, Holo (Set logo) |
| 230/182 | Ethan's Ho-Oh ex | Pokémon (Fire) | Special illustration rare | Holo |
| 231/182 | Team Rocket's Mewtwo ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 232/182 | Cynthia's Garchomp ex | Pokémon (Fighting) | Special illustration rare | Holo |
| 233/182 | Team Rocket's Nidoking ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 234/182 | Team Rocket's Crobat ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 235/182 | Arven's Mabosstiff ex | Pokémon (Darkness) | Special illustration rare | Holo |
| 236/182 | Ethan's Adventure | Trainer (Supporter) | Special illustration rare | Holo |
| 237/182 | Team Rocket's Ariana | Trainer (Supporter) | Special illustration rare | Holo |
| 238/182 | Team Rocket's Giovanni | Trainer (Supporter) | Special illustration rare | Holo |
| 239/182 | Ethan's Ho-Oh ex | Pokémon (Fire) | Hyper rare | Holo (Gold) |
| 240/182 | Team Rocket's Mewtwo ex | Pokémon (Psychic) | Hyper rare | Holo (Gold) |
| 241/182 | Cynthia's Garchomp ex | Pokémon (Fighting) | Hyper rare | Holo (Gold) |
| 242/182 | Team Rocket's Crobat ex | Pokémon (Darkness) | Hyper rare | Holo (Gold) |
| 243/182 | Jamming Tower | Trainer (Stadium) | Hyper rare | Holo (Gold) |
| 244/182 | Levincia | Trainer (Stadium) | Hyper rare | Holo (Gold) |

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

Confidence: this map follows the pack structure above. Odds use the TCGplayer study (via Game Rant and pullrates.gg). This set has no ACE SPEC Rares. Reverse holo slot 2 can hold an Illustration Rare or a Special Illustration Rare; the rare slot can hold a Double Rare, an Ultra Rare, or a Hyper Rare.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 4 | Common | Common | Common | Normal | All | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Reverse holo slot 1 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | 100% |
| Reverse holo slot 2 | 1 | Illustration Rare | Illustration Rare | Illustration rare | Holo | All | 1 in 12 |
| Reverse holo slot 2 | 1 | Special Illustration Rare | Special Illustration Rare | Special illustration rare | Holo | All | 1 in 94 |
| Reverse holo slot 2 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Rare slot | 1 | Double Rare | Double Rare | Double rare | Holo | All | 1 in 5 |
| Rare slot | 1 | Ultra Rare | Ultra Rare | Ultra Rare | Holo | All | 1 in 16 |
| Rare slot | 1 | Hyper Rare | Hyper Rare | Hyper rare | Holo (Gold) | All | 1 in 149 |
| Rare slot | 1 | Rare | Rare | Rare | Holo | All | Rest |
| Basic Energy | 1 | Basic Energy | — | — | — | — | 100% |
| Code card | 1 | Code card | — | — | — | — | 100% |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. This set has no ACE SPEC
Rares.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | — | Yes |
| 5 | Double Rare | Rarity | 1 in 5 | Yes |
| 6 | Illustration Rare | Rarity | 1 in 12 | Yes |
| 7 | Ultra Rare | Rarity | 1 in 16 | Yes |
| 8 | Special Illustration Rare | Rarity | 1 in 94 | Yes |
| 9 | Hyper Rare | Rarity | 1 in 149 | Yes |

## Sources

- [Bulbapedia — Destined Rivals (TCG)](https://bulbapedia.bulbagarden.net/wiki/Destined_Rivals_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Cardrake — Destined Rivals master set](https://www.cardrake.com/expansions/sv10)
- [Game Rant — Pokemon TCG Reveals Pull Rates for Destined Rivals](https://gamerant.com/pokemon-tcg-destined-rivals-expansion-pull-rates/)
- [pullrates.gg — Destined Rivals](https://www.pullrates.gg/sets/destined-rivals)
- [tcgtalk — Destined Rivals Pull Rates and Case Opening](https://tcgtalk.com/guides/destined-rivals-pull-rates-case-opening)
- [TikTok — theukpokeman, Destined Rivals pull rates](https://www.tiktok.com/@theukpokeman/video/7510655292573519126) (search extract only)
- [tcg.pokemon.com — Destined Rivals expansion overview](https://tcg.pokemon.com/en-us/expansions/destined-rivals/)
- [pokemon.com — Destined Rivals Elite Trainer Box](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-destined-rivals-elite-trainer-box)
- [pokemon.com — Destined Rivals Pokémon Center Elite Trainer Box](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-destined-rivals-pokemon-center-elite-trainer-box)
- [pokemon.com — Destined Rivals Booster Bundle](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-destined-rivals-booster-bundle)
- [Pokémon Center — Destined Rivals Booster Display Box](https://www.pokemoncenter.com/product/10-10157-101/pokemon-tcg-scarlet-and-violet-destined-rivals-booster-display-box-36-packs)
- [Pokémon Center — Destined Rivals Booster Bundle](https://www.pokemoncenter.com/product/100-10638/pokemon-tcg-scarlet-and-violet-destined-rivals-booster-bundle-6-packs)
- [PokeBeach — Scarlet & Violet Booster Pack Configuration Finally Revealed](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes) (search extract only)
- [Pokémon Support — What can I expect in a booster pack](https://support.pokemon.com/hc/en-us/articles/360000981613-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-booster-pack)
- [Card Shop Live — Hit Rates for Scarlet & Violet](https://cardshoplive.com/pages/hit-rates-for-pokemon-tcg-scarlet-and-violet)

## Open topics

- **Slot map:** two Rare cards (Team Rocket's Spidops, Team Rocket's
  Articuno) carry an extra plain Normal print, with no promo or
  special tag. The era rule makes Rare cards holofoil, so the slot map
  treats this print as not from packs. It stays unused.
- **Pack order:** no source shows an opened Destined Rivals pack.
- **Code card and Energy position:** sources disagree (first or last).
  TheGamer's account gives a resolution (one source, Community estimate): see
  [eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template).
- **Hit in the last three cards:** an Illustration Rare or Special
  Illustration Rare is the fourth-last card if the Energy and code card
  count.
- **Hyper Rare slot:** rare slot or second reverse holo slot.
- **Premium Collection and Ultra-Premium Collection pack counts:** not
  found.
- **Box collation:** not found. Boxes per case is 6 (era-wide retailer
  consensus).
- **Demi-god packs:** social media claims only.
- **Set code DRI:** not confirmed in a fetched source.
- **Rarity list odds:** no source gives odds for Rare. The era's rarity system decides its place in the rarity list.
- **Rarity list order:** by this file's odds, Illustration Rare (1 in 12) is more common than Ultra Rare (1 in 16), even though Ultra Rare is the higher secret-rare tier by name.
