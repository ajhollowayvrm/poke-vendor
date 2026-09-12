# Sun & Moon Era (2017–2019)

The pack template that most English Sun & Moon Series sets share. Each
set file under `docs/sets/` records its own data and its exceptions to
this template. See [../../13-sets.md](../../13-sets.md) for the general
approach.

## Confidence labels

All set files in this era use these labels.

- **Official**: The Pokémon Company published the figure. No official
  pull odds were found for any set in this era.
- **Empirical study**: a model that a researcher fitted to counts from
  opened packs. The main study is the Elite Fourum "English Pokémon Card
  Rarity Guide" by sturzflugbombardieru (2024). It uses YouTube box
  openings, the @burpies data set, and large openings by Derium
  (about 1,000 packs per set) and TheGameCapital.
- **Community guide**: a guide that states a fact but shows no data in
  its text.
- **Community estimate**: a figure with no stated method.
- **Unknown**: no source found.

ThePriceDex publishes per-pack odds for every set in this era. Each
ThePriceDex page names the Elite Fourum post as its source. Thus the
ThePriceDex figures and the Elite Fourum box ratios are one source, not
two independent sources.

## Pack structure

Main sets use 11 game cards plus 1 code card (12 items).

| Slot | Count | Contents |
|------|-------|----------|
| Common | 5 | Common cards |
| Uncommon | 3 | Uncommon cards |
| Reverse holo slot | 1 | A reverse holo of any common, uncommon, rare, or holo rare. Some sets put special cards here (see below). |
| Rare slot | 1 | Rare, holo rare, Pokémon-GX, full art, rainbow rare, or gold secret rare |
| Basic Energy | 1 | One Basic Energy card. Sun & Moon was the first set with it. |
| Code card | 1 | Pokémon TCG Online code card |

- Confidence: well documented. Bulbapedia, ThePriceDex, and a PokeBeach
  news article agree on the 11 cards.
- Bulbapedia counts the code card and writes that pack size went "from
  11 to 12". This is the same structure.
- The rare slot is never empty. Every pack has a card of rare rarity or
  higher, so every pack has a hit by the rule in
  [../../18-ripping.md](../../18-ripping.md#what-counts-as-a-hit).

### Print sheets (Elite Fourum model)

The study models the rare slot as 5 print sheets: non-holo rares, holo
rares, "regular" Pokémon-GX, full art Pokémon-GX, and one shared sheet of
full art Trainers plus secret rares. Thus a full art Pokémon-GX and a
full art Trainer come from different sheets. Rainbow rares and gold
secret rares share the full art Trainer sheet.

## Pack order

### Raw order (community guide)

This is the order of the stack when it comes out of the wrapper, front
card first.

| Position | Card |
|----------|------|
| 1–5 | 5 commons |
| 6 | Reverse holo slot |
| 7 | Rare slot |
| 8 | Basic Energy |
| 9–11 | 3 uncommons |
| 12 | Code card |

- Source: NinePocket writes: "From the back, the order runs: code card,
  three uncommons, one basic Energy, then the rare, then a reverse
  holo." The table above is that order in reverse.
- NinePocket does not name the commons. The table puts them at the
  front because they are the cards that remain. This step is an
  inference.
- PokéPatch agrees: move 4 cards from the back to the front, and "your
  2nd to last card will generally be a reverse holo, and your final
  card will be your rare".
- Both sources are pack-trick guides. They cover "Sun & Moon through
  Sword & Shield" as one group. Neither source shows photos or video of
  an opened pack in its text.

**Is the hit one of the last three cards?** In the raw order, no. The
rare slot is card 7 of 12 (card 7 of 11 without the code card).

### Pack-trick order (community guide)

Players often remove the code card and move the back 4 cards (the Energy
and the 3 uncommons) to the front. Then the order is:

| Position | Card |
|----------|------|
| 1–4 | Basic Energy and 3 uncommons |
| 5–9 | 5 commons |
| 10 | Reverse holo slot |
| 11 | Rare slot |

In this order, the rare slot is the last card. The reverse holo slot is
second to last. Both are in the last three.

### Orientation

PokéPatch tells the reader to hold the cards "face down (so the blue
Pokemon logo is facing you)". NinePocket does not define "back". No
source describes the order with the wrapper front facing the player.
This is an open topic.

## Rarity system

| Rarity | Slot | Sets |
|--------|------|------|
| Common, Uncommon | Common, uncommon, reverse | All |
| Rare | Rare slot | All main sets. Not in Shining Legends or Dragon Majesty. |
| Rare Holo | Rare slot | All |
| Rare Holo GX ("regular" Pokémon-GX) | Rare slot | All except Detective Pikachu |
| Rare Ultra (full art Pokémon-GX, full art Trainer) | Rare slot | All except Detective Pikachu |
| Rare Rainbow (rainbow rare) | Rare slot | All except Detective Pikachu |
| Rare Secret (gold items, gold Energy, some gold Pokémon-GX) | Rare slot | All except Detective Pikachu. Not all sets have gold Pokémon-GX. |
| Rare Prism Star | Reverse slot | Ultra Prism to Team Up, and Dragon Majesty (slot Unknown for Dragon Majesty) |
| TAG TEAM Pokémon-GX | Rare slot (inside the GX, full art, and rainbow counts) | Team Up to Cosmic Eclipse |
| Rare Shining | Rare slot | Shining Legends |
| Shiny Vault cards | Reverse slot | Hidden Fates |
| Character rare | Reverse slot | Cosmic Eclipse |

Slot sources: Elite Fourum posts 140, 144, 146, 156, and 157.

### Hits outside the rare slot

From Ultra Prism, some special cards come in the reverse holo slot:
Prism Star cards (Ultra Prism to Team Up), Shiny Vault cards (Hidden
Fates), and character rares (Cosmic Eclipse). A reverse rare also counts
as a hit. Thus a pack can have two hits: card 6 and card 7 in the raw
order.

### Typical odds per pack (main sets)

These ranges come from the ThePriceDex set pages (empirical study).

| Rarity | Range across main sets |
|--------|------------------------|
| Rare (non-holo) | 1 in 1.5 |
| Rare Holo | 1 in 5.3 to 1 in 7.2 |
| Rare Holo GX | 1 in 7.8 to 1 in 12 |
| Ultra Rare (full art) | 1 in 22.2 to 1 in 26.2 |
| Rainbow Rare | 1 in 56.5 to 1 in 83.3 |
| Secret Rare (gold) | 1 in 93.8 to 1 in 131.9 |
| Rare Prism Star | 1 in 8.2 to 1 in 18 |

A check on Sun & Moon: the ThePriceDex "Ultra Rare" figure equals the
full art Pokémon-GX plus the full art Trainers in the Elite Fourum box
ratios. Its "Rainbow Rare" plus "Secret Rare" figures equal the secret
rares on the full art Trainer sheet.

## Box and case structure

- Booster box: 36 packs (ThePriceDex; the Elite Fourum sample sizes of
  1,008 packs from 28 boxes also agree).
- Elite Trainer Box: 8 packs for main sets, 10 packs for Shining
  Legends, Dragon Majesty, and Hidden Fates (Bulbapedia).
- Boxes per case: Unknown.
- **Collation: variable.** The study reports average "box ratios", not
  a guaranteed count per box. The study also finds that machines fill
  packs from print sheets in sequence. For example, the reverses in one
  36-pack box are one run from the sheet, and uncommons come from two
  alternating stacks.

## Sets in this era

| Set | Released | Booster boxes | File |
|-----|----------|---------------|------|
| Sun & Moon | 2017-02-03 | Yes | [sun-moon.md](../sun-moon.md) |
| Guardians Rising | 2017-05-05 | Yes | [guardians-rising.md](../guardians-rising.md) |
| Burning Shadows | 2017-08-04 | Yes | [burning-shadows.md](../burning-shadows.md) |
| Shining Legends | 2017-10-06 | No | [shining-legends.md](../shining-legends.md) |
| Crimson Invasion | 2017-11-03 | Yes | [crimson-invasion.md](../crimson-invasion.md) |
| Ultra Prism | 2018-02-02 | Yes | [ultra-prism.md](../ultra-prism.md) |
| Forbidden Light | 2018-05-04 | Yes | [forbidden-light.md](../forbidden-light.md) |
| Celestial Storm | 2018-08-03 | Yes | [celestial-storm.md](../celestial-storm.md) |
| Dragon Majesty | 2018-09-07 | No | [dragon-majesty.md](../dragon-majesty.md) |
| Lost Thunder | 2018-11-02 | Yes | [lost-thunder.md](../lost-thunder.md) |
| Team Up | 2019-02-01 | Yes | [team-up.md](../team-up.md) |
| Detective Pikachu | 2019-03-29 | No | [detective-pikachu.md](../detective-pikachu.md) |
| Unbroken Bonds | 2019-05-03 | Yes | [unbroken-bonds.md](../unbroken-bonds.md) |
| Unified Minds | 2019-08-02 | Yes | [unified-minds.md](../unified-minds.md) |
| Hidden Fates | 2019-08-23 | No | [hidden-fates.md](../hidden-fates.md) |
| Cosmic Eclipse | 2019-11-01 | Yes | [cosmic-eclipse.md](../cosmic-eclipse.md) |

### Products without booster packs (not in this list)

- SM Black Star Promos: single promo cards in other products.
- McDonald's Collection 2017, 2018, and 2019: the English versions gave
  single cards in Happy Meals. Only the French 2018 version used 4-card
  mini boosters, and it was French only.
- Theme Decks, Trainer Kits, Battle Arena Decks, and World Championships
  Decks: fixed decks.

## Sets that break the template

- **Shining Legends**: no booster boxes. The rare slot is always a holo
  rare or higher. Shining Pokémon come in the rare slot. Reverse holo
  Basic Energy cards exist.
- **Ultra Prism, Forbidden Light, Celestial Storm, Lost Thunder, Team
  Up**: Prism Star cards come in the reverse holo slot.
- **Dragon Majesty**: no booster boxes. The rare slot is always a holo
  rare or higher. A hit (Pokémon-GX, full art, or secret rare) comes in
  about 1 in 4 packs. Prism Star cards exist.
- **Detective Pikachu**: no booster boxes. A pack has 4 holofoil cards:
  3 common holos and 1 rare holo. The pack order is Unknown.
- **Hidden Fates**: no booster boxes. Shiny Vault cards come in the
  reverse holo slot, about 1 in 3 packs.
- **Cosmic Eclipse**: character rares come in the reverse holo slot.

## Sources

- [Bulbapedia — List of Pokémon Trading Card Game expansions](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_Trading_Card_Game_expansions)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Sun & Moon (TCG)](https://bulbapedia.bulbagarden.net/wiki/Sun_%26_Moon_(TCG))
- [Bulbapedia — Sun & Moon TCG Series merchandise](https://bulbapedia.bulbagarden.net/wiki/Sun_%26_Moon_TCG_Series_merchandise)
- [Bulbapedia — McDonald's Collection 2018 (TCG)](https://bulbapedia.bulbagarden.net/wiki/McDonald%27s_Collection_2018_(TCG))
- [Elite Fourum — English Pokémon Card Rarity Guide, Sun & Moon Series box ratios (post 140)](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762/140)
- [Elite Fourum — How to reconstruct an uncommons sheet (post 155)](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762/155)
- [Elite Fourum — Pull rates in modern sets (@burpies)](https://www.elitefourum.com/t/pull-rates-in-modern-sets/25220)
- [ThePriceDex — Sun & Moon Pull Rates](https://www.thepricedex.com/set/sm1/sun-moon/pull-rates)
- [NinePocket — The Pokémon Pack Trick: How It Works for Every Set](https://www.ninepocket.net/guides/pokemon-pack-trick)
- [PokéPatch — Pokemon Card Tricks for Every Set](https://pokepatch.com/2022/07/26/how-to-open-pokemon-cards-card-trick-for-each-set/)
- [PokeBeach — 'Sun & Moon' Boosters Reintroducing 11 Cards Per Pack, New Reverse Holo Style!](https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style)

## Open topics

- **The pack order has no source that shows real opened packs.** Both
  sources are pack-trick guides. Confirm the order with a pack-opening
  video for at least one set.
- **Orientation**: no source says how the order looks with the wrapper
  front facing the player. Confirm which end of the stack a player sees
  first.
- **The rip screen rule and this era**: in the raw order, the rare slot
  is card 7 of 12, not one of the last three. The hit is in the last
  three only in the pack-trick order. The design must choose one order
  for this era (see [../../18-ripping.md](../../18-ripping.md#where-the-hit-sits)).
- The position of the commons in the raw order is an inference.
- NinePocket and PokéPatch do not name exceptions for the special sets.
  The pack order for Shining Legends, Dragon Majesty, and Hidden Fates
  is not confirmed. The Detective Pikachu pack order is Unknown.
- No source gives separate odds for TAG TEAM Pokémon-GX.
- Boxes per case: Unknown.
- A second, independent pull-rate source was not available.
  Pokecompare returned HTTP 429 on each try.
- Bulbapedia lists three-card "Mini Packs" for most sets. Only the Sun &
  Moon Mini Pack contents were read.
