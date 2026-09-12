# Sword & Shield Era (2020–2023)

The pack template that most English sets in this era share. Each set file
records its own data and every exception (see
[../../13-sets.md](../../13-sets.md)). This file holds the evidence that all
set files use, so the set files do not repeat it.

## Template: pack structure

- Most packs have 10 game cards. They also have one basic Energy card and one
  code card ([TCGplayer booster box listings](https://www.tcgplayer.com/product/206027),
  [Bulbapedia — Evolving Skies](https://bulbapedia.bulbagarden.net/wiki/Evolving_Skies_(TCG))).
- From Brilliant Stars to Silver Tempest, a VSTAR marker card can replace the
  basic Energy card ([Bulbapedia — Brilliant Stars](https://bulbapedia.bulbagarden.net/wiki/Brilliant_Stars_(TCG))).
- Sword & Shield to Evolving Skies packs have a Pokémon Trading Card Game
  Online code card. Fusion Strike packs were the first with a Pokémon Trading
  Card Game Live code card ([Bulbapedia — Fusion Strike](https://bulbapedia.bulbagarden.net/wiki/Fusion_Strike_(TCG))).

| Slot | Cards | Source and confidence |
|---|---|---|
| Common | 5 | Derived: 10 minus the slots below. Only Crown Zenith has a direct source for 5 commons ([CardShopLive](https://cardshoplive.com/pages/hit-rates-for-pokemon-crown-zenith)). |
| Uncommon | 3 | Community guide ([NinePocket](https://www.ninepocket.net/guides/pokemon-pack-trick)); Bulbapedia says "generally 3" ([Booster pack](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))). |
| Reverse holo | 1 | Official: sets before Scarlet & Violet "only guarantee at least 1 reverse foil card per booster pack" ([Pokémon Center Support](https://support.pokemoncenter.com/hc/en-us/articles/360028979571-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-Booster-Pack)). |
| Rare or higher | 1 | Bulbapedia: every international pack has at least 1 rare. TCGplayer names this slot the "Rare slot". |
| Basic Energy (or VSTAR marker) | 1 | Bulbapedia set pages. |
| Code card | 1 | Bulbapedia set pages. |

### Subset cards replace the reverse holo

- A Trainer Gallery card sits in the reverse holo slot. It does not change the
  odds for the rare slot in the same pack (empirical study:
  [TCGplayer — Silver Tempest](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Silver-Tempest-Pull-Rates/6490d591-e582-4930-8446-00e190876d30/)).
- A Galarian Gallery card and a Radiant card sit in the reverse holo slot in
  Crown Zenith (empirical study:
  [TCGplayer — Crown Zenith](https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Crown-Zenith-Pull-Rates/56af3032-cb34-4da1-92fb-9cf206d10c0f/)).
- A Shiny Vault card replaces the reverse holo card in Shining Fates
  ([Bulbapedia — Shining Fates](https://bulbapedia.bulbagarden.net/wiki/Shining_Fates_(TCG))).
- Thus a pack can have two hits: one in the reverse holo slot and one in the
  rare slot.

## Template: pack order

**Confidence: community guide.** Two guides agree. No source with photos or
video of real opened packs was found.

- NinePocket covers "Sun & Moon through Sword & Shield", "2017–early 2023 ·
  includes Crown Zenith". It says: "From the back, the order runs: code card,
  three uncommons, one basic Energy, then the rare, then a reverse holo."
- NinePocket also says: "Since the Sun & Moon era the collation process
  leaves cards in a consistent order — commons and uncommons first, the rare
  and reverse holo toward the back, with the basic Energy and code card behind
  them."
- PokePatch says the Sword and Shield card trick moves "4 cards" from the back
  to the front. PokePatch also says Pokémon puts "the most valuable card near
  the middle of the pack".

The stack has 12 items. The two columns show the order for each reveal
direction. The commons count of 5 is derived.

| Position | Reveal starts at the commons end | Reveal starts at the code card end |
|---|---|---|
| 1–5 | Commons | 1: code card. 2–4: uncommons. 5: basic Energy |
| 6 | Reverse holo slot | Rare slot |
| 7 | Rare slot | Reverse holo slot |
| 8 | Basic Energy (or VSTAR marker) | Commons (8–12) |
| 9–11 | Uncommons | Commons |
| 12 | Code card | Commons |

**Where the hit sits:**

- In the natural order, the rare slot is position 6 or 7 of 12. **The rare is
  not one of the last three cards in either direction.** The whole era breaks
  the default in [18-ripping.md](../../18-ripping.md#where-the-hit-sits).
- The reverse holo slot is next to the rare slot. A Trainer Gallery, Galarian
  Gallery, Shiny Vault, or Radiant hit is also near the middle.
- The community "pack trick" changes the order. Remove the code card. Move the
  three uncommons and the Energy card to the front. Then "The last card is
  your rare (holo or better)" and "The second-to-last card is your reverse
  holo" ([NinePocket](https://www.ninepocket.net/guides/pokemon-pack-trick)).
  With the trick, the rip order is: 3 uncommons, Energy, 5 commons, reverse
  holo slot, rare slot.

**Conflicts and gaps:**

- Which end of the stack faces the front of the wrapper: Unknown.
- The two guides do not agree on how to hold the stack. PokePatch says to hold
  it face down and then "flip the stack over". NinePocket does not say.
- NinePocket puts the 4-card method on Celebrations. A Celebrations pack has
  only 4 cards, so the method cannot apply as written.

## Template: rarity system

Bulbapedia set lists use these rarity labels. The set files count cards per
label. The mapping to card types comes from the TCGplayer category counts,
which match the Bulbapedia counts for the sets that have both.

| Bulbapedia label | Card types |
|---|---|
| Common, Uncommon, Rare, Rare Holo | Standard cards. |
| Ultra-Rare Rare | Regular Pokémon V. |
| Rare VMAX, Rare VSTAR | Regular Pokémon VMAX and VSTAR. VSTAR starts in Brilliant Stars. |
| Rare Ultra | Full-art Pokémon V, full-art Trainers, and alternate-art Pokémon V. In Crown Zenith, also the textured Energy cards. |
| Rare Rainbow | Rainbow rares. Evolving Skies also puts its alternate-art VMAX cards here. |
| Rare Secret | Gold secret rares. |
| Amazing Rare ("A") | Vivid Voltage and Shining Fates only. |
| Rare Radiant | Astral Radiance, Pokémon GO, Lost Origin, Silver Tempest, Crown Zenith. |
| TGH, TGV, TGU, TGS | Trainer Gallery cards (Brilliant Stars to Silver Tempest). |
| GGH, GGU, GGS | Galarian Gallery cards (Crown Zenith). |
| Rare Shiny, Rare Shiny GX | Shining Fates Shiny Vault. |
| Rare Classic | Celebrations Classic Collection. |

### Pull-rate data in this era

- The Pokémon Company does not publish pull rates. Pokémon Support says "we do
  not have a specific ratio or pull rate for entire booster boxes" and "there
  are no guaranteed specific higher-than-rare cards or card types included in
  each booster box."
- TCGplayer published empirical studies for Evolving Skies, Brilliant Stars,
  Astral Radiance, Lost Origin, Silver Tempest, and Crown Zenith. Each study
  opened more than 1,900 packs.
- DigitalTQ published smaller community samples (371 to 1,004 packs). It says:
  "This data is compiled from our own card pulls and other third party
  sources, so it may not be accurate or reliable."
- No study was found for Sword & Shield, Rebel Clash, Darkness Ablaze,
  Champion's Path, Shining Fates, Battle Styles, Chilling Reign, or Fusion
  Strike.

## Template: sealed products and collation

- Booster box: 36 packs. Booster box case: 6 booster boxes (TCGplayer product
  listings for Sword & Shield, Rebel Clash, Evolving Skies, Brilliant Stars,
  Silver Tempest).
- Elite Trainer Box: 8 packs. From Evolving Skies onward, a Pokémon Center
  Elite Trainer Box has 10 packs.
- Build & Battle Box: 4 packs.
- Build & Battle Stadium (Evolving Skies onward): 2 Build & Battle Boxes plus
  more packs. The merchandise page says 4 more packs. The Bulbapedia booster
  pack page says 3 more packs. This is a conflict.
- Booster Bundle: 6 packs. Lost Origin was the first set with this product.
- Special expansions had no English booster box.
- **Collation: variable.** Official: no guaranteed ratio per box. Model each
  pack as an independent draw.

## Sets in this era

| Set | Released | Type | File |
|---|---|---|---|
| Sword & Shield | February 7, 2020 | Main | [../sword-shield.md](../sword-shield.md) |
| Rebel Clash | May 1, 2020 | Main | [../rebel-clash.md](../rebel-clash.md) |
| Darkness Ablaze | August 14, 2020 | Main | [../darkness-ablaze.md](../darkness-ablaze.md) |
| Champion's Path | September 25, 2020 | Special | [../champions-path.md](../champions-path.md) |
| Vivid Voltage | November 13, 2020 | Main | [../vivid-voltage.md](../vivid-voltage.md) |
| McDonald's Collection 2021 | February 9, 2021 | Promotional | [../mcdonalds-collection-2021.md](../mcdonalds-collection-2021.md) |
| Shining Fates | February 19, 2021 | Special | [../shining-fates.md](../shining-fates.md) |
| Battle Styles | March 19, 2021 | Main | [../battle-styles.md](../battle-styles.md) |
| Chilling Reign | June 18, 2021 | Main | [../chilling-reign.md](../chilling-reign.md) |
| Evolving Skies | August 27, 2021 | Main | [../evolving-skies.md](../evolving-skies.md) |
| Celebrations | October 8, 2021 | Special | [../celebrations.md](../celebrations.md) |
| Fusion Strike | November 12, 2021 | Main | [../fusion-strike.md](../fusion-strike.md) |
| Brilliant Stars | February 25, 2022 | Main | [../brilliant-stars.md](../brilliant-stars.md) |
| Astral Radiance | May 27, 2022 | Main | [../astral-radiance.md](../astral-radiance.md) |
| Pokémon GO | July 1, 2022 | Special | [../pokemon-go.md](../pokemon-go.md) |
| McDonald's Collection 2022 | August 3, 2022 | Promotional | [../mcdonalds-collection-2022.md](../mcdonalds-collection-2022.md) |
| Trick or Trade 2022 | September 1, 2022 | Promotional | [../trick-or-trade-2022.md](../trick-or-trade-2022.md) |
| Lost Origin | September 9, 2022 | Main | [../lost-origin.md](../lost-origin.md) |
| Silver Tempest | November 11, 2022 | Main | [../silver-tempest.md](../silver-tempest.md) |
| Crown Zenith | January 20, 2023 | Special | [../crown-zenith.md](../crown-zenith.md) |

### Excluded: English products of this era with no booster packs

- Pokémon Futsal (2020): five promo cards, given as gifts with purchase or in
  kit bundles ([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Futsal_(TCG))).
- SWSH Black Star Promos: promo cards in products, not in booster packs.
- Trainer's Toolkit (2020, 2021), Battle Academy 2022, theme decks, V Battle
  Decks, and League Battle Decks: fixed decks, not random packs.
- Sword & Shield Mini Packs, Rebel Clash Mini Packs, and Two Mini Pack
  Blisters: 3-card packs of existing sets, not separate sets.

## Sets that break the template

- **Every set:** the rare is in the middle of the pack, not in the last three
  cards (see pack order above).
- **Brilliant Stars, Astral Radiance, Lost Origin, Silver Tempest:** a Trainer
  Gallery card can replace the reverse holo. About 1 in 8 packs.
- **Crown Zenith:** a Galarian Gallery card or a Radiant card can replace the
  reverse holo. About 35% of packs have a Galarian Gallery card. No booster
  box.
- **Shining Fates:** a Shiny Vault card can replace the reverse holo. No
  booster box.
- **Celebrations:** 4 cards per pack. No commons, no uncommons, and no reverse
  holo parallel set. Classic Collection subset. No booster box. Pack order
  Unknown.
- **Champion's Path and Pokémon GO:** no English booster box. The set lists
  have no plain Rare cards, so the rare slot is Rare Holo or higher
  (derived from the Bulbapedia set lists).
- **Vivid Voltage:** Amazing Rares. Their slot is Unknown.
- **McDonald's Collection 2021 and 2022:** 4-card Happy Meal packs with one
  Confetti Holofoil card. Pack order Unknown.
- **Trick or Trade 2022:** 3-card mini packs in a BOOster Bundle. Pack order
  Unknown.

## Open topics

- Find a source that shows real opened packs for this era. Confirm the order
  and which end faces the wrapper front.
- Decide if the rip screen uses the natural order (hit in the middle) or the
  pack-trick order (hit last). This is a design decision for
  [18-ripping.md](../../18-ripping.md).
- Pull rates for eight sets are Unknown (see Pull-rate data above).
- McDonald's Collection 2021, McDonald's Collection 2022, and Trick or Trade
  2022 have no set file.
- Build & Battle Stadium: 3 or 4 extra packs.
- General Mills 25th Anniversary Mini Packs (2021) are on the Bulbapedia
  merchandise page. Their contents were not researched.
