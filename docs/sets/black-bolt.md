# Black Bolt (2025)

Set-specific data for Black Bolt. This is one file per set. See
[../13-sets.md](../13-sets.md) for the general approach and the index.
The shared pack template, pack order, and rarity system are in
[eras/scarlet-violet.md](eras/scarlet-violet.md). This file records the set
data and every exception.

Black Bolt is one half of a split special expansion. The other half is
[White Flare](white-flare.md). The two sets share release date, pack
template, and the only pull-rate study. Bulbapedia calls them "the
fifth and final special expansion released during the Scarlet &
Violet Series" and "the first international special expansion to be
localized from a Japanese main expansion."

## Release

| Field | Value | Source |
|---|---|---|
| English release date | July 18, 2025 (some products August 1 and August 22, 2025) | Bulbapedia, TCGplayer seller blog |
| Prerelease | None ("No Prereleases") | TCGplayer seller blog |
| Series number | SV10.5 | Bulbapedia |
| Set code | BLK | Not confirmed in a fetched source (Cardrake uses "zsv10pt5") |
| Japanese source set | Black Bolt (SV11B), June 6, 2025, 7 cards per Japanese pack | PokiPair |
| Main set | 86 cards | Bulbapedia, Cardrake |
| Secret rares | 86 cards | Cardrake |
| Total | 172 cards | Bulbapedia |

Together, Black Bolt and White Flare hold "all and only the 156
Pokémon from the Unova Pokédex" (TCGplayer seller blog).

### Cards per rarity

| Rarity | Count | Part of |
|---|---|---|
| Common | 39 | Main set |
| Uncommon | 31 | Main set |
| Rare | 10 | Main set |
| Double Rare | 6 | Main set |
| Illustration Rare | 69 | Secret |
| Ultra Rare | 8 | Secret |
| Special Illustration Rare | 7 | Secret |
| Black White Rare | 2 | Secret |

Source: Cardrake. Ultima Supply gives the same Illustration Rare,
Double Rare, Ultra Rare, and Special Illustration Rare counts.

### Reverse holo variants

| Variant | Cards | Source |
|---|---|---|
| Regular reverse holo | 80 | Cardrake |
| Poké Ball pattern | 80 | Ultima Supply |
| Master Ball pattern | 72 | Ultima Supply |

Bulbapedia: "Pokémon cards of common, uncommon, and rare rarity are
available in all three variants; Trainer and Special Energy cards of
common and uncommon rarity are available in the regular and Poké Ball
variants."

## Pack structure

Official product text: each pack holds "10 cards and 1 Basic Energy"
(pokemon.com, Elite Trainer Box). The official Pokémon Support page
says every Scarlet & Violet pack also holds a code card. No fetched
source confirms the code card for this set.

| Slot | Count | What the slot can hold |
|---|---|---|
| Common | 4 | Common (assumed from the Scarlet & Violet template) |
| Uncommon | 3 | Uncommon (assumed from the Scarlet & Violet template) |
| Reverse holo 1 | 1 | Unknown. Expected: regular reverse holo or Poké Ball pattern |
| Reverse holo 2 | 1 | Unknown. Expected: regular reverse holo, Master Ball pattern, Illustration Rare, Special Illustration Rare, or Black White Rare |
| Rare slot | 1 | Unknown. Expected: Rare, Double Rare, or Ultra Rare |
| Basic Energy | 1 | Basic Energy |
| Code card | 1 | Pokémon TCG Live code (not confirmed for this set) |

Confidence:
- **Official:** 10 cards plus 1 Basic Energy.
- **Unknown:** the slot contents. No fetched source describes the slots
  for this set. The "expected" values copy the Prismatic Evolutions
  slot report (see [prismatic-evolutions.md](prismatic-evolutions.md)),
  because both sets use Poké Ball and Master Ball patterns. Confirm
  them before implementation.

## Pack order

Confidence: **unknown** for this set. The table below is the Scarlet &
Violet template with the Prismatic Evolutions slot report. No source
shows an opened Black Bolt pack.

| Position | Card |
|---|---|
| 1–4 | 4 Commons |
| 5–7 | 3 Uncommons |
| 8 | Reverse holo 1 (Poké Ball pattern if the pack has one) |
| 9 | Reverse holo 2 (Master Ball, Illustration Rare, Special Illustration Rare, or Black White Rare if the pack has one) |
| 10 | Rare slot (Double Rare or Ultra Rare if the pack has one) |
| 11 | Basic Energy |
| 12 | Code card |

Where the hit sits (if the expected layout is correct):
- **Rare-slot hit:** position 10 of 12, the third-last card. It **is**
  one of the last three cards.
- **Master Ball, Illustration Rare, Special Illustration Rare, Black
  White Rare:** position 9 of 12, the fourth-last card. It is **not**
  one of the last three cards.
- **Poké Ball pattern:** position 8 of 12, the fifth-last card. It is
  **not** one of the last three cards.
- About 1 pack in 6 holds an Illustration Rare. Many hits in this set
  thus sit before the last three cards.

Conflict: one extract puts the Energy and code card last. Another says
the code card is the first card the player sees. TheGamer's account
gives a resolution (one source, Community estimate): see
[eras/scarlet-violet.md](eras/scarlet-violet.md#conflicts-in-the-template).

## Rarities and hit odds

Two sources exist. Both combine Black Bolt and White Flare.

- **A:** TCGplayer study, "more than 700 booster packs" (350+ per set),
  July 22, 2025. Read through Game Rant and Ultima Supply. Ultima
  Supply gives the error margins.
- **B:** PokeBeach English set guide, as a search extract. It gives "1
  in N" rates. The origin of these figures is not stated in the
  extract.

| Rarity | A: TCGplayer 700+ packs | B: PokeBeach | Confidence |
|---|---|---|---|
| Poké Ball pattern | 30.56% ± 3.36% (about 1 in 3) | 1 in 3 | Empirical study (A); community estimate, source not stated (B) |
| Double Rare | 21.11% ± 2.98% (about 1 in 5) | — | Empirical study, small sample |
| Illustration Rare | 16.39% ± 2.70% (about 1 in 6) | 1 in 6 | Empirical study (A); community estimate (B) |
| Ultra Rare | 5.83% ± 1.71% (about 1 in 17) | — | Empirical study, small sample |
| Master Ball pattern | 5.14% ± 1.61% (about 1 in 19) | 1 in 15 | Empirical study (A); community estimate (B); conflict |
| Special Illustration Rare | 1.25% ± 0.81% (about 1 in 80) | 1 in 76 | Empirical study (A); community estimate (B) |
| Black White Rare | "Unable to determine" | — | Unknown in A |
| Black White Rare | 1 in 496 (0.2%) | — | Community estimate (PokéPatch, "over 1,000" packs, combined sets) |
| Black White Rare | 1 in 500 to 1 in 1,200 | — | Community estimate ("early case break data", search extract) |
| Hyper Rare | Not in this set | — | — |
| ACE SPEC Rare | None in the rarity counts | — | — |
| Specific Master Ball card | about 1 in 2,802 (0.04%) | — | Community estimate (search extract) |

**Default for the simulation:** use column A. Use 1 in 496 for the
Black White Rare. Treat Black Bolt and White Flare as having the same
odds. No source measures them apart.

## Special subsets and mechanics

- **Poké Ball and Master Ball pattern reverse holos**, as in
  Prismatic Evolutions.
- **Black White Rare.** A rarity exclusive to Black Bolt and White
  Flare. The TCGplayer seller blog says "Zekrom ex and Reshiram ex
  feature a Black White Rare rarity". Game Rant also names Victini. Game
  Rant describes the cards as "full illustration in a monochromatic
  color scheme". Black Bolt has 2 Black White Rares (Cardrake): Zekrom
  ex and the Victini promo. Wargamer confirms "All the Zekroms are in
  the Black Bolt set and the Reshirams can be found in White Flare." A
  PokeBeach search extract places the Victini BWR promo as card 171 in
  Black Bolt and card 172 in White Flare.
- **Very high Illustration Rare count.** 69 of 86 secret cards are
  Illustration Rares. The PokeBeach extract says "each of the 156 Unova
  Pokemon will get a regular card, a reverse holo, a Poke Ball reverse
  holo, a Master Ball reverse holo, and an Illustration Rare or Special
  Illustration Rare." TCGplayer says Illustration Rares are "much easier
  than in any other expansion" of the era.
- **Split set.** Victini appears in both sets with different collector
  numbers (TCGplayer seller blog).
- **No booster box.** The PokeBeach extract: "Since these are special
  sets, there are no booster boxes releasing."
- **God packs:** no source found. Confidence: unknown.

## Sealed products

Each product exists in a Black Bolt version and a White Flare version.

| Product | Packs | MSRP | Source |
|---|---|---|---|
| Elite Trainer Box | 9 | $49.99 | pokemon.com (search extract), TCGplayer seller blog |
| Pokémon Center Elite Trainer Box | Unknown | — | pokemon.com lists the product |
| Booster Bundle | 6 | $26.94 | pokemon.com (search extract), TCGplayer seller blog |
| Binder Collection | 5 | $29.99 | pokemon.com (search extract), TCGplayer seller blog |
| Poster Collection | Unknown | $14.99 | TCGplayer seller blog |
| Mini Tin | Unknown | $9.99 | TCGplayer seller blog |
| Tech Sticker Collection | Unknown | $14.99 | TCGplayer seller blog |
| Victini Illustration Collection | Unknown | $21.99 | TCGplayer seller blog |
| Unova Heavy Hitters Premium Collection | Unknown | — | Bulbapedia names it |

Collation: **unknown**. Model each pack as an independent draw.

## Card list

Every card in the set, with its variants. Source: the TCGdex API (set `sv10.5b`), fetched 2026-09-12. The list has 172 cards.

- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.
- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil pattern, for example "Reverse holo (Poké Ball pattern)". "1st Edition" is a stamp.
- A variant in this list can come from a product other than a booster pack.

| No. | Card | Category | Rarity | Variants |
|---|---|---|---|---|
| 001/086 | Snivy | Pokémon (Grass) | Common | Normal, Reverse holo, Holo (Tinsel), Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 002/086 | Servine | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 003/086 | Serperior ex | Pokémon (Grass) | Double rare | Holo |
| 004/086 | Pansage | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 005/086 | Simisage | Pokémon (Grass) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 006/086 | Petilil | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 007/086 | Lilligant | Pokémon (Grass) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 008/086 | Maractus | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 009/086 | Karrablast | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 010/086 | Foongus | Pokémon (Grass) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 011/086 | Amoonguss | Pokémon (Grass) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 012/086 | Victini | Pokémon (Fire) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern), Holo (Cosmos, Set logo) |
| 013/086 | Darumaka | Pokémon (Fire) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 014/086 | Darmanitan | Pokémon (Fire) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 015/086 | Larvesta | Pokémon (Fire) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 016/086 | Volcarona | Pokémon (Fire) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 017/086 | Panpour | Pokémon (Water) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 018/086 | Simipour | Pokémon (Water) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 019/086 | Tympole | Pokémon (Water) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 020/086 | Palpitoad | Pokémon (Water) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 021/086 | Seismitoad | Pokémon (Water) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 022/086 | Tirtouga | Pokémon (Water) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 023/086 | Carracosta | Pokémon (Water) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 024/086 | Alomomola | Pokémon (Water) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 025/086 | Cubchoo | Pokémon (Water) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 026/086 | Beartic | Pokémon (Water) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 027/086 | Cryogonal | Pokémon (Water) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 028/086 | Kyurem ex | Pokémon (Water) | Double rare | Holo, Holo (Player rewards program), Holo (Jumbo) |
| 029/086 | Emolga | Pokémon (Lightning) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 030/086 | Tynamo | Pokémon (Lightning) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern), Holo (Cosmos, Player rewards program) |
| 031/086 | Eelektrik | Pokémon (Lightning) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern), Holo (Cosmos, Player rewards program), Normal (Gym challenge) |
| 032/086 | Eelektross | Pokémon (Lightning) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 033/086 | Thundurus | Pokémon (Lightning) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 034/086 | Zekrom ex | Pokémon (Lightning) | Double rare | Holo, Holo (Set logo), Holo (Player rewards program), Holo (Ultra ball league) |
| 035/086 | Munna | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 036/086 | Musharna | Pokémon (Psychic) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 037/086 | Solosis | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 038/086 | Duosion | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 039/086 | Reuniclus | Pokémon (Psychic) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 040/086 | Elgyem | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 041/086 | Beheeyem | Pokémon (Psychic) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 042/086 | Golett | Pokémon (Psychic) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 043/086 | Golurk | Pokémon (Psychic) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 044/086 | Meloetta ex | Pokémon (Psychic) | Double rare | Holo |
| 045/086 | Drilbur | Pokémon (Fighting) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 046/086 | Excadrill ex | Pokémon (Fighting) | Double rare | Holo |
| 047/086 | Timburr | Pokémon (Fighting) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 048/086 | Gurdurr | Pokémon (Fighting) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 049/086 | Conkeldurr | Pokémon (Fighting) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern), Normal (Player rewards program) |
| 050/086 | Throh | Pokémon (Fighting) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 051/086 | Dwebble | Pokémon (Fighting) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 052/086 | Crustle | Pokémon (Fighting) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 053/086 | Landorus | Pokémon (Fighting) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 054/086 | Venipede | Pokémon (Darkness) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 055/086 | Whirlipede | Pokémon (Darkness) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 056/086 | Scolipede | Pokémon (Darkness) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 057/086 | Sandile | Pokémon (Darkness) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 058/086 | Krokorok | Pokémon (Darkness) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 059/086 | Krookodile | Pokémon (Darkness) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 060/086 | Escavalier | Pokémon (Metal) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 061/086 | Klink | Pokémon (Metal) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 062/086 | Klang | Pokémon (Metal) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 063/086 | Klinklang | Pokémon (Metal) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 064/086 | Pawniard | Pokémon (Metal) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 065/086 | Bisharp | Pokémon (Metal) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 066/086 | Cobalion | Pokémon (Metal) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 067/086 | Genesect ex | Pokémon (Metal) | Double rare | Holo, Holo (Player rewards program), Normal (Liao fu guan), Holo (Gym challenge) |
| 068/086 | Axew | Pokémon (Dragon) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 069/086 | Fraxure | Pokémon (Dragon) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 070/086 | Haxorus | Pokémon (Dragon) | Rare | Holo, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 071/086 | Pidove | Pokémon (Colorless) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 072/086 | Tranquill | Pokémon (Colorless) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 073/086 | Unfezant | Pokémon (Colorless) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 074/086 | Audino | Pokémon (Colorless) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 075/086 | Minccino | Pokémon (Colorless) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 076/086 | Cinccino | Pokémon (Colorless) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 077/086 | Rufflet | Pokémon (Colorless) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 078/086 | Braviary | Pokémon (Colorless) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Master Ball pattern) |
| 079/086 | Air Balloon | Trainer (Tool) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Holo (Cosmos, Player rewards program), Holo (Cosmos, Great ball league), Normal (Gym challenge), Normal (Liao fu guan), Normal (Jose cruz galindo resendiz) |
| 080/086 | Antique Cover Fossil | Trainer (Item) | Common | Normal, Reverse holo, Reverse holo (Poké Ball pattern) |
| 081/086 | Energy Coin | Trainer (Item) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern) |
| 082/086 | Fennel | Trainer (Supporter) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern) |
| 083/086 | N's Plan | Trainer (Supporter) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern) |
| 084/086 | Pokégear 3.0 | Trainer (Item) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Normal (Liao fu guan) |
| 085/086 | Professor's Research | Trainer (Supporter) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern), Reverse holo (Poké Ball pattern, Professor program) |
| 086/086 | Prism Energy | Energy (Normal) | Uncommon | Normal, Reverse holo, Reverse holo (Poké Ball pattern) |
| 087/086 | Snivy | Pokémon (Grass) | Illustration rare | Holo |
| 088/086 | Servine | Pokémon (Grass) | Illustration rare | Holo |
| 089/086 | Pansage | Pokémon (Grass) | Illustration rare | Holo |
| 090/086 | Simisage | Pokémon (Grass) | Illustration rare | Holo |
| 091/086 | Petilil | Pokémon (Grass) | Illustration rare | Holo |
| 092/086 | Lilligant | Pokémon (Grass) | Illustration rare | Holo |
| 093/086 | Maractus | Pokémon (Grass) | Illustration rare | Holo |
| 094/086 | Karrablast | Pokémon (Grass) | Illustration rare | Holo |
| 095/086 | Foongus | Pokémon (Grass) | Illustration rare | Holo |
| 096/086 | Amoonguss | Pokémon (Grass) | Illustration rare | Holo |
| 097/086 | Darumaka | Pokémon (Fire) | Illustration rare | Holo |
| 098/086 | Darmanitan | Pokémon (Fire) | Illustration rare | Holo |
| 099/086 | Larvesta | Pokémon (Fire) | Illustration rare | Holo |
| 100/086 | Volcarona | Pokémon (Fire) | Illustration rare | Holo |
| 101/086 | Panpour | Pokémon (Water) | Illustration rare | Holo |
| 102/086 | Simipour | Pokémon (Water) | Illustration rare | Holo |
| 103/086 | Tympole | Pokémon (Water) | Illustration rare | Holo |
| 104/086 | Palpitoad | Pokémon (Water) | Illustration rare | Holo |
| 105/086 | Seismitoad | Pokémon (Water) | Illustration rare | Holo |
| 106/086 | Tirtouga | Pokémon (Water) | Illustration rare | Holo |
| 107/086 | Carracosta | Pokémon (Water) | Illustration rare | Holo |
| 108/086 | Alomomola | Pokémon (Water) | Illustration rare | Holo |
| 109/086 | Cubchoo | Pokémon (Water) | Illustration rare | Holo |
| 110/086 | Beartic | Pokémon (Water) | Illustration rare | Holo |
| 111/086 | Cryogonal | Pokémon (Water) | Illustration rare | Holo |
| 112/086 | Emolga | Pokémon (Lightning) | Illustration rare | Holo |
| 113/086 | Tynamo | Pokémon (Lightning) | Illustration rare | Holo |
| 114/086 | Eelektrik | Pokémon (Lightning) | Illustration rare | Holo |
| 115/086 | Eelektross | Pokémon (Lightning) | Illustration rare | Holo |
| 116/086 | Munna | Pokémon (Psychic) | Illustration rare | Holo |
| 117/086 | Musharna | Pokémon (Psychic) | Illustration rare | Holo |
| 118/086 | Solosis | Pokémon (Psychic) | Illustration rare | Holo |
| 119/086 | Duosion | Pokémon (Psychic) | Illustration rare | Holo |
| 120/086 | Elgyem | Pokémon (Psychic) | Illustration rare | Holo |
| 121/086 | Beheeyem | Pokémon (Psychic) | Illustration rare | Holo |
| 122/086 | Golett | Pokémon (Psychic) | Illustration rare | Holo |
| 123/086 | Golurk | Pokémon (Psychic) | Illustration rare | Holo |
| 124/086 | Drilbur | Pokémon (Fighting) | Illustration rare | Holo |
| 125/086 | Timburr | Pokémon (Fighting) | Illustration rare | Holo |
| 126/086 | Gurdurr | Pokémon (Fighting) | Illustration rare | Holo |
| 127/086 | Conkeldurr | Pokémon (Fighting) | Illustration rare | Holo |
| 128/086 | Throh | Pokémon (Fighting) | Illustration rare | Holo |
| 129/086 | Dwebble | Pokémon (Fighting) | Illustration rare | Holo |
| 130/086 | Crustle | Pokémon (Fighting) | Illustration rare | Holo |
| 131/086 | Landorus | Pokémon (Fighting) | Illustration rare | Holo |
| 132/086 | Venipede | Pokémon (Darkness) | Illustration rare | Holo |
| 133/086 | Whirlipede | Pokémon (Darkness) | Illustration rare | Holo |
| 134/086 | Scolipede | Pokémon (Darkness) | Illustration rare | Holo |
| 135/086 | Sandile | Pokémon (Darkness) | Illustration rare | Holo |
| 136/086 | Krokorok | Pokémon (Darkness) | Illustration rare | Holo |
| 137/086 | Krookodile | Pokémon (Darkness) | Illustration rare | Holo |
| 138/086 | Escavalier | Pokémon (Metal) | Illustration rare | Holo |
| 139/086 | Klink | Pokémon (Metal) | Illustration rare | Holo |
| 140/086 | Klang | Pokémon (Metal) | Illustration rare | Holo |
| 141/086 | Klinklang | Pokémon (Metal) | Illustration rare | Holo |
| 142/086 | Pawniard | Pokémon (Metal) | Illustration rare | Holo |
| 143/086 | Bisharp | Pokémon (Metal) | Illustration rare | Holo |
| 144/086 | Cobalion | Pokémon (Metal) | Illustration rare | Holo |
| 145/086 | Axew | Pokémon (Dragon) | Illustration rare | Holo |
| 146/086 | Fraxure | Pokémon (Dragon) | Illustration rare | Holo |
| 147/086 | Haxorus | Pokémon (Dragon) | Illustration rare | Holo |
| 148/086 | Pidove | Pokémon (Colorless) | Illustration rare | Holo |
| 149/086 | Tranquill | Pokémon (Colorless) | Illustration rare | Holo |
| 150/086 | Unfezant | Pokémon (Colorless) | Illustration rare | Holo |
| 151/086 | Audino | Pokémon (Colorless) | Illustration rare | Holo |
| 152/086 | Minccino | Pokémon (Colorless) | Illustration rare | Holo |
| 153/086 | Cinccino | Pokémon (Colorless) | Illustration rare | Holo |
| 154/086 | Rufflet | Pokémon (Colorless) | Illustration rare | Holo |
| 155/086 | Braviary | Pokémon (Colorless) | Illustration rare | Holo |
| 156/086 | Serperior ex | Pokémon (Grass) | Ultra Rare | Holo |
| 157/086 | Kyurem ex | Pokémon (Water) | Ultra Rare | Holo |
| 158/086 | Zekrom ex | Pokémon (Lightning) | Ultra Rare | Holo |
| 159/086 | Meloetta ex | Pokémon (Psychic) | Ultra Rare | Holo |
| 160/086 | Excadrill ex | Pokémon (Fighting) | Ultra Rare | Holo |
| 161/086 | Genesect ex | Pokémon (Metal) | Ultra Rare | Holo |
| 162/086 | Fennel | Trainer (Supporter) | Ultra Rare | Holo |
| 163/086 | N's Plan | Trainer (Supporter) | Ultra Rare | Holo |
| 164/086 | Serperior ex | Pokémon (Grass) | Special illustration rare | Holo |
| 165/086 | Kyurem ex | Pokémon (Water) | Special illustration rare | Holo |
| 166/086 | Zekrom ex | Pokémon (Lightning) | Special illustration rare | Holo |
| 167/086 | Meloetta ex | Pokémon (Psychic) | Special illustration rare | Holo |
| 168/086 | Excadrill ex | Pokémon (Fighting) | Special illustration rare | Holo |
| 169/086 | Genesect ex | Pokémon (Metal) | Special illustration rare | Holo |
| 170/086 | N's Plan | Trainer (Supporter) | Special illustration rare | Holo |
| 171/086 | Victini | Pokémon (Fire) | Black White Rare | Holo |
| 172/086 | Zekrom ex | Pokémon (Lightning) | Black White Rare | Holo |
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

Confidence: this map follows the pack structure above. The slot
contents are "Expected", not confirmed.

| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |
|---|---|---|---|---|---|---|---|
| Common | 4 | Common | Common | Common | Normal | All | 100% |
| Uncommon | 3 | Uncommon | Uncommon | Uncommon | Normal | All | 100% |
| Reverse holo 1 | 1 | Poké Ball pattern | Poké Ball pattern | Common, Uncommon, Rare | Reverse holo (Poké Ball pattern) | All | 30.56% |
| Reverse holo 1 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Reverse holo 2 | 1 | Illustration Rare | Illustration Rare | Illustration rare | Holo | All | 16.39% |
| Reverse holo 2 | 1 | Master Ball pattern | Master Ball pattern | Common, Uncommon, Rare | Reverse holo (Master Ball pattern) | All | 5.14% |
| Reverse holo 2 | 1 | Special Illustration Rare | Special Illustration Rare | Special illustration rare | Holo | All | 1.25% |
| Reverse holo 2 | 1 | Black White Rare | Black White Rare | Black White Rare | Holo | All | 0.2% |
| Reverse holo 2 | 1 | Reverse holo | Reverse holo | Common, Uncommon, Rare | Reverse holo | All | Rest |
| Rare slot | 1 | Double Rare | Double Rare | Double rare | Holo | All | 21.11% |
| Rare slot | 1 | Ultra Rare | Ultra Rare | Ultra Rare | Holo | All | 5.83% |
| Rare slot | 1 | Rare | Rare | Rare | Holo | All | Rest |
| Basic Energy | 1 | Basic Energy | — | — | — | — | 100% |
| Code card | 1 | Code card | — | — | — | — | 100% |

## Rarity list

The stop rule menu on the rip screen shows this list (see
[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from
the most common entry to the rarest entry. Black Bolt has no booster
box; packs came only in Elite Trainer Boxes and other set products.
The Poké Ball and Master Ball patterns replace the reverse holo in
Common, Uncommon, and Rare cards. Odds use the TCGplayer study (column
A), the only large study, which combines Black Bolt and White Flare.

| # | Entry | Type | Odds per pack | Default stop |
|---|---|---|---|---|
| 1 | Common | Rarity | Every pack | No |
| 2 | Uncommon | Rarity | Every pack | No |
| 3 | Reverse holo | Variant | Every pack | No |
| 4 | Rare | Rarity | — | Yes |
| 5 | Poké Ball pattern | Variant | 30.56% (about 1 in 3) | No |
| 6 | Double Rare | Rarity | 21.11% (about 1 in 5) | Yes |
| 7 | Illustration Rare | Rarity | 16.39% (about 1 in 6) | Yes |
| 8 | Ultra Rare | Rarity | 5.83% (about 1 in 17) | Yes |
| 9 | Master Ball pattern | Variant | 5.14% (about 1 in 19) | No |
| 10 | Special Illustration Rare | Rarity | 1.25% (about 1 in 80) | Yes |
| 11 | Black White Rare | Rarity | 1 in 496 (0.2%) | Yes |

## Sources

- [Bulbapedia — Black Bolt & White Flare (TCG)](https://bulbapedia.bulbagarden.net/wiki/Black_Bolt_%26_White_Flare_(TCG))
- [Cardrake — Black Bolt master set](https://www.cardrake.com/expansions/zsv10pt5)
- [TCGplayer seller blog — Black Bolt and White Flare Quick Facts](https://seller.tcgplayer.com/blog/black-bolt-and-white-flare-quick-facts)
- [TCGplayer — Pokémon TCG: Black Bolt and White Flare Pull Rates](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Black-Bolt-and-White-Flare-Pull-Rates/bac92199-a2a7-4668-b4a4-2647a111776f/) (needs JavaScript; figures read through the next two sources)
- [Game Rant — Pull Rates for Black Bolt and White Flare](https://gamerant.com/pokemon-tcg-black-bolt-white-flare-pull-rates-odds/)
- [Ultima Supply — Black Bolt & White Flare Pull Rates](https://ultimasupply.com/blogs/news/black-bolt-white-flare-pull-rates-illustration-rares-abundant)
- [PokéPatch — Black Bolt & White Flare Pull Rates](https://pokepatch.com/2025/07/20/black-bolt-white-flare-pull-rates-in-pokemon-tcg-sets/)
- [PokeBeach — Black Bolt and White Flare English Set Guides](https://www.pokebeach.com/2025/07/black-bolt-and-white-flare-english-set-guides-full-card-lists-pull-rates-cut-cards-products-and-more) (search extract only)
- [PokeBeach forum — All 176 Black Bolt and White Flare Secret Rares and Pull Rates Revealed](https://www.pokebeach.com/forums/threads/all-176-%E2%80%9Cblack-bolt%E2%80%9D-and-%E2%80%9Cwhite-flare%E2%80%9D-secret-rares-and-pull-rates-revealed.156055/page-8) (search extract only)
- [PokiPair — Black Bolt and White Flare Everything You Need To Know](https://www.pokipair.com/black-bolt-white-flare-everything-you-need-to-know/)
- [pokemon.com — Black Bolt and White Flare Elite Trainer Boxes](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-black-bolt-elite-trainer-box-scarlet-violet-white-flare-elite-trainer-box)
- [pokemon.com — Black Bolt and White Flare Pokémon Center Elite Trainer Boxes](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-black-bolt-pokemon-center-elite-trainer-box-scarlet-violet-white-flare-pokemon-center-elite-trainer-box)
- [pokemon.com — Black Bolt and White Flare Booster Bundles](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-black-bolt-and-white-flare-booster-bundles)
- [pokemon.com — Black Bolt and White Flare Binder Collections](https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-black-bolt-binder-collection-scarlet-violet-white-flare-binder-collection)
- [Pokémon Support — What can I expect in a booster pack](https://support.pokemon.com/hc/en-us/articles/360000981613-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-booster-pack)
- [Wargamer — The 9 biggest chase cards in Pokémon Black Bolt and White Flare](https://www.wargamer.com/pokemon-trading-card-game/chase-cards-black-bolt-white-flare)

## Open topics

- **Slot structure:** no source describes the slots for this set. This
  is the largest gap for this set. Searched 2026-09-12: no opened-pack
  source or official breakdown found beyond the sources already cited.
- **Pack order:** no source shows an opened pack. Searched 2026-09-12:
  no source found.
- **Hits outside the last three cards:** if the Prismatic Evolutions
  layout applies, Poké Ball, Master Ball, Illustration Rare, Special
  Illustration Rare, and Black White Rare cards sit before the last
  three cards.
- **Black White Rare odds:** TCGplayer could not measure them. The
  community range is 1 in 496 to 1 in 1,200.
- **Black White Rare card names per set:** Zekrom ex and the Victini
  promo (card 171) for Black Bolt (Wargamer, PokeBeach search extract).
  The White Flare pair is Reshiram ex and the Victini promo (card 172).
- **Master Ball odds:** 1 in 15 (PokeBeach) or 1 in 19 (TCGplayer).
- **Per-set odds:** every study combines both sets.
- **Code card:** not confirmed for this set.
- **Pack counts:** Pokémon Center Elite Trainer Box, Poster Collection,
  Mini Tin, Tech Sticker Collection, Victini Illustration Collection,
  and Unova Heavy Hitters Premium Collection.
- **Set code BLK:** not confirmed in a fetched source.
- **Rarity list odds:** no source gives odds for Rare. The era's rarity system decides its place in the rarity list.
- **Rarity list order:** Master Ball pattern uses 5.14% from the TCGplayer study (700+ packs, combined sets). PokeBeach gives 1 in 15 (6.67%).
- **Rarity list order:** by this file's odds, Illustration Rare (16.39%) is far more common than Ultra Rare (5.83%), even though Ultra Rare is the higher secret-rare tier by name.
