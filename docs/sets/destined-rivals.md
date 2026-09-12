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
  sees. No source settles which face of the stack faces the front of
  the wrapper.

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

Boxes per case: **unknown**.

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

- **Pack order:** no source shows an opened Destined Rivals pack.
- **Code card and Energy position:** sources disagree (first or last).
- **Hit in the last three cards:** an Illustration Rare or Special
  Illustration Rare is the fourth-last card if the Energy and code card
  count.
- **Hyper Rare slot:** rare slot or second reverse holo slot.
- **Premium Collection and Ultra-Premium Collection pack counts:** not
  found.
- **Case size and box collation:** not found.
- **Demi-god packs:** social media claims only.
- **Set code DRI:** not confirmed in a fetched source.
