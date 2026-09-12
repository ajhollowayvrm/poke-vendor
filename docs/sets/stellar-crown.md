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
