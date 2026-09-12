# Stellar Crown (2024)

Set-specific data for Stellar Crown. This is one file per set. See
[../13-sets.md](../13-sets.md) for the general approach and the index.
The shared pack template, pack order, and rarity system are in
[eras/scarlet-violet.md](eras/scarlet-violet.md). This file records the set
data and every exception.

## Release

| Field | Value | Source |
|---|---|---|
| English release date | September 13, 2024 | Bulbapedia |
| Series number | SV7 (English set number 101) | Bulbapedia |
| Japanese source set | Stellar Miracle, July 19, 2024 | Bulbapedia |
| Set code | SCR | Confirmed: Limitless TCG, pkmncards, tcg.pokemon.com expansion overview |
| Main set | 142 cards | Bulbapedia, Cardrake |
| Secret rares | 33 cards | Bulbapedia expansion list, Cardrake |
| Total | 175 cards | Bulbapedia |

### Cards per rarity

| Rarity | Count | Part of |
|---|---|---|
| Common | 71 | Main set |
| Uncommon | 39 | Main set |
| Rare | 15 | Main set |
| Double Rare | 14 | Main set |
| ACE SPEC Rare | 3 | Main set |
| Illustration Rare | 13 | Secret |
| Ultra Rare | 11 | Secret |
| Special Illustration Rare | 6 | Secret |
| Hyper Rare | 3 | Secret |

Source: Cardrake. Bulbapedia gives 13 Illustration Rares, 11 Ultra
Rares, 6 Special Illustration Rares, 3 Hyper Rares, and 3 ACE SPEC
cards.

## Pack structure

Official product text: each pack holds "10 cards and 1 Basic Energy"
(Pokémon Center, Booster Display Box). The official Pokémon Support
page says every Scarlet & Violet pack also holds a code card.

| Slot | Count | What the slot can hold |
|---|---|---|
| Common | 4 | Common |
| Uncommon | 3 | Uncommon |
| Reverse holo 1 | 1 | Reverse holo of a Common, Uncommon, or Rare |
| Reverse holo 2 | 1 | Reverse holo, or a hit: Illustration Rare or Special Illustration Rare |
| Rare slot | 1 | Rare, Double Rare, Ultra Rare, ACE SPEC Rare, or Hyper Rare (see conflict below) |
| Basic Energy | 1 | Basic Energy |
| Code card | 1 | Pokémon TCG Live code |

Confidence:
- **Official:** 10 cards plus 1 Basic Energy, and the Pokémon Support
  breakdown.
- **Secondary report of the official configuration:** the slot
  contents (PokeBeach 2023 extract, the Scarlet & Violet template).
- **Conflict (Hyper Rare slot):** PokeBeach puts it in the rare slot.
  Card Shop Live (1,728 base Scarlet & Violet packs) counts it in the
  second reverse holo slot.
- **Unknown:** the ACE SPEC slot.

## Pack order

Confidence: **secondary report** (PokeBeach 2023 extract) for the
Scarlet & Violet template. No source shows an opened Stellar Crown
pack.

| Position | Card |
|---|---|
| 1–4 | 4 Commons |
| 5–7 | 3 Uncommons |
| 8 | Reverse holo 1 |
| 9 | Reverse holo 2 (Illustration Rare or Special Illustration Rare if the pack has one) |
| 10 | Rare slot |
| 11 | Basic Energy |
| 12 | Code card |

Where the hit sits:
- **Rare-slot hit:** position 10 of 12, the third-last card. It **is**
  one of the last three cards.
- **Illustration Rare or Special Illustration Rare:** position 9 of
  12, the fourth-last card. It is **not** one of the last three cards,
  unless the rip screen skips the Energy and the code card.

Conflict: one extract puts the Energy and code card last. Another says
the code card is the first card the player sees. TheGamer's account
(see
[eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template))
suggests these agree: the code card sits last in the stack, but the
pack trick flips the stack for a reveal, so the player sees it first.

## Rarities and hit odds

The main figures come from a TCGplayer study of 8,000 packs. The
TCGplayer article needs JavaScript. This file reads it through Joseph
Writer Anderson and PokéPatch. The two copies do not agree on every
figure.

| Rarity | Any card (Joseph Writer Anderson) | Any card (PokéPatch) | Specific card | Confidence |
|---|---|---|---|---|
| Double Rare | 1 in 6 | 1 in 6 (16.9%) | 1 in 83 | Empirical study (TCGplayer) |
| Ultra Rare | 1 in 17 | 1 in 15 (6.8%) | 1 in 163 | Empirical study; copies conflict |
| ACE SPEC Rare | 1 in 20 | — | 1 in 60 | Empirical study (TCGplayer) |
| Illustration Rare | 1 in 13 | 1 in 13 (7.8%) | 1 in 167 | Empirical study (TCGplayer) |
| Special Illustration Rare | "~1%" (about 1 in 100) | 1 in 90 (1.1%) | 1 in 540 | Empirical study; copies conflict |
| Hyper Rare | — | 1 in 137 (0.7%) | 1 in 137 (listed as specific) | Empirical study; the copies label the same number as "any" and "specific" |
| Black White Rare | Not in this set | — | — | — |
| Pattern reverse holo | Not in this set | — | — | — |

Other data, for comparison only:

| Rarity | Rate | Sample | Confidence |
|---|---|---|---|
| Special Illustration Rare | about 1 in 130 | TCGplayer 8,000 packs (as reported) | Community estimate (TikTok, Infinite Chaos TCG). It conflicts with the other copies. |
| Ultra Rare | about 1 in 28 | TCGplayer 8,000 packs (as reported) | Community estimate (TikTok, Infinite Chaos TCG). It conflicts with the other copies. |
| Full Art Pokémon and Trainers | 6.6% | 1,000 packs (Clovr Cards) | Empirical study (via Screen Rant) |
| Illustration Rare | 7.6% | 1,000 packs (Clovr Cards) | Empirical study (via Screen Rant) |
| Special Illustration Rare | 4.9% | 1,000 packs (Clovr Cards) | Empirical study (via Screen Rant). This is much higher than every other figure. |
| Hyper Rare | 0.8% | 1,000 packs (Clovr Cards) | Empirical study (via Screen Rant) |

**Default for the simulation:** Double Rare 1 in 6, Ultra Rare 1 in
15, ACE SPEC 1 in 20, Illustration Rare 1 in 13, Special Illustration
Rare 1 in 90, Hyper Rare 1 in 137. These are the PokéPatch copy of the
TCGplayer study, plus the ACE SPEC figure from Joseph Writer Anderson.

## Special subsets and mechanics

- **Stellar Tera Pokémon ex debut.** Their attacks need "three
  different types of Energy" (Bulbapedia). This is a card mechanic. It
  does not change the pack.
- **ACE SPEC Rares:** 3 cards.
- **God packs:** no source found. Confidence: unknown.

## Sealed products

| Product | Packs | Source |
|---|---|---|
| Booster Display Box | 36 | Pokémon Center |
| Elite Trainer Box | 9 | Pokémon Center, pokemon.com |
| Pokémon Center Elite Trainer Box | 11 | Pokémon Center, pokemon.com |
| Booster Bundle | Unknown | Not found |
| Other products | Unknown | Bulbapedia mentions collection boxes without pack counts |

Collation: **unknown**. Model each pack as an independent draw.

Boxes per case: **6** (era-wide retailer consensus, not official; see
[eras/scarlet-violet.md](eras/scarlet-violet.md#sealed-product-template)).

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv07`), fetched 2026-09-12. The list has 175 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/142 | Venusaur ex | Pokémon (Grass) | Double rare | Holo, Holo (Set logo), Holo (Set logo, Jumbo) |
| 002/142 | Ledyba | Pokémon (Grass) | Common | Normal, Reverse holo |
| 003/142 | Ledian | Pokémon (Grass) | Rare | Holo, Reverse holo, Normal |
| 004/142 | Celebi | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 005/142 | Lileep | Pokémon (Grass) | Common | Normal, Reverse holo |
| 006/142 | Cradily | Pokémon (Grass) | Rare | Reverse holo, Holo |
| 007/142 | Carnivine | Pokémon (Grass) | Common | Normal, Reverse holo |
| 008/142 | Mow Rotom | Pokémon (Grass) | Common | Normal, Reverse holo |
| 009/142 | Grubbin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 010/142 | Gossifleur | Pokémon (Grass) | Common | Normal, Reverse holo |
| 011/142 | Eldegoss | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 012/142 | Applin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 013/142 | Dipplin | Pokémon (Grass) | Common | Normal, Reverse holo |
| 014/142 | Hydrapple ex | Pokémon (Grass) | Double rare | Holo |
| 015/142 | Nymble | Pokémon (Grass) | Common | Normal, Reverse holo |
| 016/142 | Lokix | Pokémon (Grass) | Common | Normal, Reverse holo |
| 017/142 | Toedscool | Pokémon (Grass) | Common | Normal, Reverse holo |
| 018/142 | Toedscruel | Pokémon (Grass) | Uncommon | Normal, Reverse holo |
| 019/142 | Ponyta | Pokémon (Fire) | Common | Normal, Reverse holo |
| 020/142 | Rapidash | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 021/142 | Pansear | Pokémon (Fire) | Common | Normal, Reverse holo |
| 022/142 | Reshiram | Pokémon (Fire) | Uncommon | Normal, Reverse holo, Normal (Set logo) |
| 023/142 | Salandit | Pokémon (Fire) | Common | Normal, Reverse holo |
| 024/142 | Salazzle | Pokémon (Fire) | Uncommon | Normal, Reverse holo |
| 025/142 | Turtonator | Pokémon (Fire) | Common | Normal, Reverse holo |
| 026/142 | Scorbunny | Pokémon (Fire) | Common | Normal, Reverse holo |
| 027/142 | Raboot | Pokémon (Fire) | Common | Normal, Reverse holo |
| 028/142 | Cinderace ex | Pokémon (Fire) | Double rare | Holo |
| 029/142 | Charcadet | Pokémon (Fire) | Common | Normal, Reverse holo |
| 030/142 | Blastoise ex | Pokémon (Water) | Double rare | Holo, Holo (Set logo) |
| 031/142 | Lapras | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 032/142 | Lapras ex | Pokémon (Water) | Double rare | Holo |
| 033/142 | Marill | Pokémon (Water) | Common | Normal, Reverse holo |
| 034/142 | Azumarill | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 035/142 | Finneon | Pokémon (Water) | Common | Normal, Reverse holo |
| 036/142 | Lumineon | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 037/142 | Tirtouga | Pokémon (Water) | Common | Normal, Reverse holo |
| 038/142 | Carracosta | Pokémon (Water) | Rare | Reverse holo, Holo |
| 039/142 | Froakie | Pokémon (Water) | Common | Normal, Reverse holo |
| 040/142 | Frogadier | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 041/142 | Greninja ex | Pokémon (Water) | Double rare | Holo, Holo (Set logo), Holo (Set logo, Jumbo) |
| 042/142 | Crabominable | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 043/142 | Chewtle | Pokémon (Water) | Common | Normal, Reverse holo |
| 044/142 | Drednaw | Pokémon (Water) | Rare | Holo, Reverse holo |
| 045/142 | Veluza | Pokémon (Water) | Uncommon | Normal, Reverse holo |
| 046/142 | Electabuzz | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 047/142 | Electivire | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 048/142 | Chinchou | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 049/142 | Lanturn | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 050/142 | Joltik | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 051/142 | Galvantula ex | Pokémon (Lightning) | Double rare | Holo |
| 052/142 | Charjabug | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 053/142 | Vikavolt | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 054/142 | Togedemaru | Pokémon (Lightning) | Uncommon | Normal, Reverse holo |
| 055/142 | Zeraora | Pokémon (Lightning) | Rare | Holo, Reverse holo |
| 056/142 | Pawmi | Pokémon (Lightning) | Common | Normal, Reverse holo |
| 057/142 | Slowpoke | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 058/142 | Slowking | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 059/142 | Mewtwo | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 060/142 | Drifloon | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 061/142 | Drifblim | Pokémon (Psychic) | Uncommon | Normal, Reverse holo |
| 062/142 | Yamask | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 063/142 | Comfey | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 064/142 | Milcery | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 065/142 | Alcremie | Pokémon (Psychic) | Rare | Holo, Reverse holo |
| 066/142 | Fidough | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 067/142 | Dachsbun ex | Pokémon (Psychic) | Double rare | Holo |
| 068/142 | Flittle | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 069/142 | Espathra | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 070/142 | Greavard | Pokémon (Psychic) | Common | Normal, Reverse holo |
| 071/142 | Iron Boulder | Pokémon (Psychic) | Rare | Reverse holo, Holo |
| 072/142 | Cubone | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 073/142 | Marowak | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 074/142 | Rhyhorn | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 075/142 | Rhydon | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 076/142 | Rhyperior | Pokémon (Fighting) | Rare | Holo, Reverse holo, Holo (Cosmos) |
| 077/142 | Meditite | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 078/142 | Meditite | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 079/142 | Medicham | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 080/142 | Medicham ex | Pokémon (Fighting) | Double rare | Holo |
| 081/142 | Riolu | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 082/142 | Lucario ex | Pokémon (Fighting) | Double rare | Holo |
| 083/142 | Mienfoo | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 084/142 | Mienshao | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 085/142 | Pancham | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 086/142 | Diancie | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 087/142 | Crabrawler | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 088/142 | Falinks | Pokémon (Fighting) | Common | Normal, Reverse holo |
| 089/142 | Garganacl ex | Pokémon (Fighting) | Double rare | Holo |
| 090/142 | Koraidon | Pokémon (Fighting) | Uncommon | Normal, Reverse holo |
| 091/142 | Gulpin | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 092/142 | Swalot | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 093/142 | Pangoro | Pokémon (Darkness) | Uncommon | Normal, Reverse holo |
| 094/142 | Impidimp | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 095/142 | Morgrem | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 096/142 | Grimmsnarl | Pokémon (Darkness) | Rare | Reverse holo, Holo, Normal (League) |
| 097/142 | Bombirdier | Pokémon (Darkness) | Common | Normal, Reverse holo |
| 098/142 | Jirachi | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 099/142 | Klink | Pokémon (Metal) | Common | Normal, Reverse holo |
| 100/142 | Klang | Pokémon (Metal) | Common | Normal, Reverse holo |
| 101/142 | Klinklang | Pokémon (Metal) | Rare | Holo, Reverse holo, Holo (Cosmos) |
| 102/142 | Meltan | Pokémon (Metal) | Common | Normal, Reverse holo, Normal (Set logo) |
| 103/142 | Meltan | Pokémon (Metal) | Common | Normal, Reverse holo |
| 104/142 | Melmetal | Pokémon (Metal) | Rare | Holo, Reverse holo, Holo (Cosmos) |
| 105/142 | Melmetal ex | Pokémon (Metal) | Double rare | Holo, Holo (Set logo), Holo (Set logo, Jumbo) |
| 106/142 | Duraludon | Pokémon (Metal) | Common | Normal, Reverse holo |
| 107/142 | Archaludon | Pokémon (Metal) | Rare | Holo, Reverse holo, Holo (Gamestop), Holo (Eb games), Holo (Set logo), Holo (Cosmos), Normal (League) |
| 108/142 | Varoom | Pokémon (Metal) | Common | Normal, Reverse holo |
| 109/142 | Revavroom | Pokémon (Metal) | Uncommon | Normal, Reverse holo |
| 110/142 | Orthworm ex | Pokémon (Metal) | Double rare | Holo |
| 111/142 | Raging Bolt | Pokémon (Dragon) | Rare | Holo, Reverse holo, Holo (Set logo) |
| 112/142 | Tauros | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 113/142 | Eevee | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 114/142 | Hoothoot | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 115/142 | Noctowl | Pokémon (Colorless) | Rare | Holo, Reverse holo |
| 116/142 | Glameow | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 117/142 | Purugly | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 118/142 | Fan Rotom | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 119/142 | Bouffalant | Pokémon (Colorless) | Rare | Holo, Reverse holo, Normal |
| 120/142 | Tornadus | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 121/142 | Fletchling | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 122/142 | Fletchinder | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 123/142 | Talonflame | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 124/142 | Wooloo | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 125/142 | Dubwool | Pokémon (Colorless) | Uncommon | Normal, Reverse holo |
| 126/142 | Lechonk | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 127/142 | Cyclizar | Pokémon (Colorless) | Common | Normal, Reverse holo |
| 128/142 | Terapagos ex | Pokémon (Colorless) | Double rare | Holo, Holo (Jumbo) |
| 129/142 | Antique Cover Fossil | Trainer (Item) | Common | Normal, Reverse holo |
| 130/142 | Antique Root Fossil | Trainer (Item) | Common | Normal, Reverse holo |
| 131/142 | Area Zero Underdepths | Trainer (Stadium) | Uncommon | Normal, Reverse holo |
| 132/142 | Briar | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 133/142 | Crispin | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 134/142 | Deluxe Bomb | Trainer (Tool) | ACE SPEC Rare | Holo |
| 135/142 | Glass Trumpet | Trainer (Item) | Uncommon | Normal, Reverse holo |
| 136/142 | Grand Tree | Trainer (Stadium) | ACE SPEC Rare | Holo |
| 137/142 | Gravity Gemstone | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 138/142 | Kofu | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 139/142 | Lacey | Trainer (Supporter) | Uncommon | Normal, Reverse holo |
| 140/142 | Occa Berry | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 141/142 | Payapa Berry | Trainer (Tool) | Uncommon | Normal, Reverse holo |
| 142/142 | Sparkling Crystal | Trainer (Tool) | ACE SPEC Rare | Holo |
| 143/142 | Bulbasaur | Pokémon (Grass) | Illustration rare | Holo |
| 144/142 | Ledian | Pokémon (Grass) | Illustration rare | Holo |
| 145/142 | Lileep | Pokémon (Grass) | Illustration rare | Holo |
| 146/142 | Turtonator | Pokémon (Fire) | Illustration rare | Holo |
| 147/142 | Raboot | Pokémon (Fire) | Illustration rare | Holo |
| 148/142 | Squirtle | Pokémon (Water) | Illustration rare | Holo |
| 149/142 | Crabominable | Pokémon (Water) | Illustration rare | Holo, Holo (Snowflake) |
| 150/142 | Joltik | Pokémon (Lightning) | Illustration rare | Holo |
| 151/142 | Zeraora | Pokémon (Lightning) | Illustration rare | Holo |
| 152/142 | Milcery | Pokémon (Psychic) | Illustration rare | Holo |
| 153/142 | Meditite | Pokémon (Fighting) | Illustration rare | Holo |
| 154/142 | Gulpin | Pokémon (Darkness) | Illustration rare | Holo |
| 155/142 | Archaludon | Pokémon (Metal) | Illustration rare | Holo |
| 156/142 | Hydrapple ex | Pokémon (Grass) | Ultra Rare | Holo |
| 157/142 | Cinderace ex | Pokémon (Fire) | Ultra Rare | Holo |
| 158/142 | Lapras ex | Pokémon (Water) | Ultra Rare | Holo |
| 159/142 | Galvantula ex | Pokémon (Lightning) | Ultra Rare | Holo |
| 160/142 | Dachsbun ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 161/142 | Medicham ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 162/142 | Orthworm ex | Pokémon (Metal) | Ultra Rare | Holo |
| 163/142 | Briar | Trainer (Supporter) | Ultra Rare | Holo |
| 164/142 | Crispin | Trainer (Supporter) | Ultra Rare | Holo |
| 165/142 | Kofu | Trainer (Supporter) | Ultra Rare | Holo |
| 166/142 | Lacey | Trainer (Supporter) | Ultra Rare | Holo |
| 167/142 | Hydrapple ex | Pokémon (Grass) | Special illustration rare | Holo |
| 168/142 | Galvantula ex | Pokémon (Lightning) | Special illustration rare | Holo |
| 169/142 | Dachsbun ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 170/142 | Terapagos ex | Pokémon (Colorless) | Special illustration rare | Holo |
| 171/142 | Briar | Trainer (Supporter) | Special illustration rare | Holo |
| 172/142 | Lacey | Trainer (Supporter) | Special illustration rare | Holo |
| 173/142 | Terapagos ex | Pokémon (Colorless) | Hyper rare | Holo |
| 174/142 | Area Zero Underdepths | Trainer (Stadium) | Hyper rare | Holo (Gold) |
| 175/142 | Bravery Charm | Trainer (Tool) | Hyper rare | Holo (Gold) |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. Odds use the file's default
simulation values (the PokéPatch copy of the TCGplayer study, plus the
Joseph Writer Anderson ACE SPEC figure).

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | — | Yes |
| 5 | Double Rare | Rarity | 1 in 6 | Yes |
| 6 | Illustration Rare | Rarity | 1 in 13 | Yes |
| 7 | Ultra Rare | Rarity | 1 in 15 | Yes |
| 8 | ACE SPEC Rare | Rarity | 1 in 20 | Yes |
| 9 | Special Illustration Rare | Rarity | 1 in 90 | Yes |
| 10 | Hyper Rare | Rarity | 1 in 137 | Yes |

## Sources

- [Bulbapedia — Stellar Crown (TCG)](https://bulbapedia.bulbagarden.net/wiki/Stellar_Crown_(TCG))
- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Cardrake — Stellar Crown master set](https://www.cardrake.com/expansions/sv7)
- [TCGplayer — Pokémon TCG: Stellar Crown Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Stellar-Crown-Pull-Rates/2c0743dd-dbd0-4504-9ff8-be5a72dd04d1/) (needs JavaScript; figures read through the next two sources)
- [Joseph Writer Anderson — Stellar Crown Pull Rates](https://www.josephwriteranderson.com/blog/pokemon-tcg-stellar-crown-pull-rates-are-they-good)
- [PokéPatch — Stellar Crown Pull Rates](https://pokepatch.com/2025/05/24/stellar-crown-pull-rates-in-pokemon-tcg-set/)
- [TikTok — Infinite Chaos TCG, Stellar Crown pull rates](https://www.tiktok.com/@infinitechaostcg/video/7427130032008580383) (search extract only)
- [Screen Rant — Stellar Crown Hit Rate Revealed After 1000 Packs](https://screenrant.com/pokemon-tcg-stellar-crown-hit-rate-revealed/)
- [Pokémon Center — Stellar Crown Booster Display Box](https://www.pokemoncenter.com/product/699-42279/pokemon-tcg-scarlet-and-violet-stellar-crown-booster-display-box-36-packs)
- [PokeBeach — Scarlet & Violet Booster Pack Configuration Finally Revealed](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes) (search extract only)
- [Pokémon Support — What can I expect in a booster pack](https://support.pokemon.com/hc/en-us/articles/360000981613-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-booster-pack)
- [Card Shop Live — Hit Rates for Scarlet & Violet](https://cardshoplive.com/pages/hit-rates-for-pokemon-tcg-scarlet-and-violet)
- [Limitless TCG — Stellar Crown (SCR)](https://limitlesstcg.com/cards/SCR)
- [Pokémon Center — Stellar Crown Elite Trainer Box](https://www.pokemoncenter.com/product/190-85923/pokemon-tcg-scarlet-and-violet-stellar-crown-pokemon-center-elite-trainer-box)
- [pokemon.com — Stellar Crown Elite Trainer Box](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-stellar-crown-elite-trainer-box)

## Open topics

- **Pack order:** no source shows an opened Stellar Crown pack.
- **Code card and Energy position:** sources disagree (first or last).
  TheGamer's account gives a resolution (one source, Community estimate): see
  [eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template).
- **Hit in the last three cards:** an Illustration Rare or Special
  Illustration Rare is the fourth-last card if the Energy and code card
  count.
- **Pull-rate conflicts:** Ultra Rare (1 in 15, 1 in 17, or 1 in 28),
  Special Illustration Rare (1 in 90, 1 in 100, 1 in 130, or 4.9%), and
  whether 1 in 137 is the "any" or the "specific" Hyper Rare rate.
- **Hyper Rare slot and ACE SPEC slot:** not confirmed. Searched
  2026-09-12: no opened-pack source found for this set.
- **Product pack counts:** Booster Display Box, Elite Trainer Box, and
  Pokémon Center Elite Trainer Box are confirmed. The Booster Bundle and
  other collection products are not.
- **Box collation:** not found. Boxes per case is 6 (era-wide retailer
  consensus).
- **Rarity list odds:** no source gives odds for Rare. The era's rarity system decides its place in the rarity list.
- **Rarity list order:** by this file's default odds, Illustration Rare (1 in 13) is more common than Ultra Rare (1 in 15), even though Ultra Rare is the higher secret-rare tier by name.
