# Sets

An index, not a knowledge base — each set's own quirks live in its own
file under `docs/sets/`, not here. This mirrors how
[00-overview.md](00-overview.md) indexes the whole doc folder, scoped
down to just sets.

## Why one file per set

This is the same scaling reasoning behind splitting
[09-upgrades.md](09-upgrades.md) from [10-grading.md](10-grading.md),
just at much bigger scale — there are roughly 150-180 official sets,
so a single combined doc would eventually be unmanageable. One file
per set keeps each set's data independently readable and editable
without touching the others.

## What goes in a set file

Primarily **pull rates** — see
[12-acquiring-product.md](12-acquiring-product.md) for why this is
real, researched-once data rather than a live pull: pack structure for
an already-printed set is fixed historical fact, not something that
drifts like a market price. A set file should cover:

- Pack slot structure (rarity breakdown per pack).
- Rare/holo slot odds, and confidence level for each figure (Wizards
  of the Coast and The Pokemon Company have rarely published exact
  odds, so most of this is community-derived).
- Box and case structure (packs per box, boxes per case), and whether
  collation is fixed or variable.
- Pack order: the order the cards come out of a pack, and where the
  hit sits. The default is that the hit is one of the last three cards.
  The set file records every exception, because the rip screen follows
  it (see [18-ripping.md](18-ripping.md#where-the-hit-sits)).
- Rarity list: every rarity, variant, and subset in the set, for
  example the Poké Ball pattern, in order of pull odds from the most
  common to the rarest. The stop rule menu
  on the rip screen shows this list (see
  [18-ripping.md](18-ripping.md#the-stop-rule)).
- Anything else set-specific that comes up: print-run notes, known
  errors, special mechanics unique to that set.

## Era files

Each era file holds the pack template that the sets of that era share:
the slot structure, the pack order, and the rarity system. A set file
records only its set data and its exceptions to the template.

## Sets done so far

133 set files in 11 eras. Every English set with booster packs has a
file.

- **Wizards of the Coast (1999–2002)** —
  [eras/wizards-of-the-coast.md](sets/eras/wizards-of-the-coast.md):
  [Base Set](sets/base-set.md), [Jungle](sets/jungle.md),
  [Fossil](sets/fossil.md), [Base Set 2](sets/base-set-2.md),
  [Team Rocket](sets/team-rocket.md), [Gym Heroes](sets/gym-heroes.md),
  [Gym Challenge](sets/gym-challenge.md), [Neo Genesis](sets/neo-genesis.md),
  [Neo Discovery](sets/neo-discovery.md),
  [Neo Revelation](sets/neo-revelation.md),
  [Neo Destiny](sets/neo-destiny.md),
  [Southern Islands](sets/southern-islands.md).
- **e-Card (2002–2003)** — [eras/e-card.md](sets/eras/e-card.md):
  [Legendary Collection](sets/legendary-collection.md),
  [Expedition Base Set](sets/expedition-base-set.md),
  [Aquapolis](sets/aquapolis.md), [Skyridge](sets/skyridge.md).
- **EX (2003–2007)** — [eras/ex.md](sets/eras/ex.md):
  [EX Ruby & Sapphire](sets/ruby-sapphire.md),
  [EX Sandstorm](sets/sandstorm.md), [EX Dragon](sets/dragon.md),
  [EX Team Magma vs Team Aqua](sets/team-magma-vs-team-aqua.md),
  [EX Hidden Legends](sets/hidden-legends.md),
  [EX FireRed & LeafGreen](sets/firered-leafgreen.md),
  [EX Team Rocket Returns](sets/team-rocket-returns.md),
  [EX Deoxys](sets/deoxys.md), [EX Emerald](sets/emerald.md),
  [EX Unseen Forces](sets/unseen-forces.md),
  [EX Delta Species](sets/delta-species.md),
  [EX Legend Maker](sets/legend-maker.md),
  [EX Holon Phantoms](sets/holon-phantoms.md),
  [EX Crystal Guardians](sets/crystal-guardians.md),
  [EX Dragon Frontiers](sets/dragon-frontiers.md),
  [EX Power Keepers](sets/power-keepers.md). POP Series 1–5 are EX era
  promotional sets; they are in [POP Series 1–9](sets/pop-series.md).
- **Diamond & Pearl and Platinum (2007–2009)** —
  [eras/diamond-pearl-platinum.md](sets/eras/diamond-pearl-platinum.md):
  [Diamond & Pearl](sets/diamond-and-pearl.md),
  [Mysterious Treasures](sets/mysterious-treasures.md),
  [Secret Wonders](sets/secret-wonders.md),
  [Great Encounters](sets/great-encounters.md),
  [Majestic Dawn](sets/majestic-dawn.md),
  [Legends Awakened](sets/legends-awakened.md),
  [Stormfront](sets/stormfront.md), [Platinum](sets/platinum.md),
  [Rising Rivals](sets/rising-rivals.md),
  [Supreme Victors](sets/supreme-victors.md), [Arceus](sets/arceus.md),
  [POP Series 1–9](sets/pop-series.md).
- **HeartGold & SoulSilver (2010–2011)** —
  [eras/heartgold-soulsilver.md](sets/eras/heartgold-soulsilver.md):
  [HeartGold & SoulSilver](sets/heartgold-soulsilver.md),
  [Unleashed](sets/unleashed.md), [Undaunted](sets/undaunted.md),
  [Triumphant](sets/triumphant.md),
  [Call of Legends](sets/call-of-legends.md).
- **Black & White (2011–2013)** —
  [eras/black-white.md](sets/eras/black-white.md):
  [Black & White](sets/black-white.md),
  [Emerging Powers](sets/emerging-powers.md),
  [Noble Victories](sets/noble-victories.md),
  [Next Destinies](sets/next-destinies.md),
  [Dark Explorers](sets/dark-explorers.md),
  [Dragons Exalted](sets/dragons-exalted.md),
  [Dragon Vault](sets/dragon-vault.md),
  [Boundaries Crossed](sets/boundaries-crossed.md),
  [Plasma Storm](sets/plasma-storm.md),
  [Plasma Freeze](sets/plasma-freeze.md),
  [Plasma Blast](sets/plasma-blast.md),
  [Legendary Treasures](sets/legendary-treasures.md).
- **XY (2014–2016)** — [eras/xy.md](sets/eras/xy.md):
  [XY](sets/xy.md), [Flashfire](sets/flashfire.md),
  [Furious Fists](sets/furious-fists.md),
  [Phantom Forces](sets/phantom-forces.md),
  [Primal Clash](sets/primal-clash.md),
  [Double Crisis](sets/double-crisis.md),
  [Roaring Skies](sets/roaring-skies.md),
  [Ancient Origins](sets/ancient-origins.md),
  [BREAKthrough](sets/breakthrough.md), [BREAKpoint](sets/breakpoint.md),
  [Generations](sets/generations.md),
  [Fates Collide](sets/fates-collide.md),
  [Steam Siege](sets/steam-siege.md), [Evolutions](sets/evolutions.md).
- **Sun & Moon (2017–2019)** — [eras/sun-moon.md](sets/eras/sun-moon.md):
  [Sun & Moon](sets/sun-moon.md),
  [Guardians Rising](sets/guardians-rising.md),
  [Burning Shadows](sets/burning-shadows.md),
  [Shining Legends](sets/shining-legends.md),
  [Crimson Invasion](sets/crimson-invasion.md),
  [Ultra Prism](sets/ultra-prism.md),
  [Forbidden Light](sets/forbidden-light.md),
  [Celestial Storm](sets/celestial-storm.md),
  [Dragon Majesty](sets/dragon-majesty.md),
  [Lost Thunder](sets/lost-thunder.md), [Team Up](sets/team-up.md),
  [Detective Pikachu](sets/detective-pikachu.md),
  [Unbroken Bonds](sets/unbroken-bonds.md),
  [Unified Minds](sets/unified-minds.md),
  [Hidden Fates](sets/hidden-fates.md),
  [Cosmic Eclipse](sets/cosmic-eclipse.md).
- **Sword & Shield (2020–2023)** —
  [eras/sword-shield.md](sets/eras/sword-shield.md):
  [Sword & Shield](sets/sword-shield.md),
  [Rebel Clash](sets/rebel-clash.md),
  [Darkness Ablaze](sets/darkness-ablaze.md),
  [Champion's Path](sets/champions-path.md),
  [Vivid Voltage](sets/vivid-voltage.md),
  [Shining Fates](sets/shining-fates.md),
  [Battle Styles](sets/battle-styles.md),
  [Chilling Reign](sets/chilling-reign.md),
  [Evolving Skies](sets/evolving-skies.md),
  [Celebrations](sets/celebrations.md),
  [Fusion Strike](sets/fusion-strike.md),
  [Brilliant Stars](sets/brilliant-stars.md),
  [Astral Radiance](sets/astral-radiance.md),
  [Pokémon GO](sets/pokemon-go.md), [Lost Origin](sets/lost-origin.md),
  [Silver Tempest](sets/silver-tempest.md),
  [Crown Zenith](sets/crown-zenith.md),
  [McDonald's Collection 2021](sets/mcdonalds-collection-2021.md),
  [McDonald's Collection 2022](sets/mcdonalds-collection-2022.md),
  [Trick or Trade 2022](sets/trick-or-trade-2022.md).
- **Scarlet & Violet (2023–2025)** —
  [eras/scarlet-violet.md](sets/eras/scarlet-violet.md):
  [Scarlet & Violet](sets/scarlet-violet.md),
  [Paldea Evolved](sets/paldea-evolved.md),
  [Obsidian Flames](sets/obsidian-flames.md), [151](sets/151.md),
  [Paradox Rift](sets/paradox-rift.md),
  [Paldean Fates](sets/paldean-fates.md),
  [Temporal Forces](sets/temporal-forces.md),
  [Twilight Masquerade](sets/twilight-masquerade.md),
  [Shrouded Fable](sets/shrouded-fable.md),
  [Stellar Crown](sets/stellar-crown.md),
  [Surging Sparks](sets/surging-sparks.md),
  [Prismatic Evolutions](sets/prismatic-evolutions.md),
  [Journey Together](sets/journey-together.md),
  [Destined Rivals](sets/destined-rivals.md),
  [Black Bolt](sets/black-bolt.md), [White Flare](sets/white-flare.md).
- **Mega Evolution (2025–2026)** —
  [eras/mega-evolution.md](sets/eras/mega-evolution.md):
  [Mega Evolution](sets/mega-evolution.md),
  [Phantasmal Flames](sets/phantasmal-flames.md),
  [Ascended Heroes](sets/ascended-heroes.md),
  [Perfect Order](sets/perfect-order.md),
  [Chaos Rising](sets/chaos-rising.md), [Pitch Black](sets/pitch-black.md).

## Open topics

- Rarity lists (see [18-ripping.md](18-ripping.md#the-stop-rule)): every
  set file has one. Each set file records, in its own Open
  topics, the entries with no odds and each choice about the order.
  A new set file must also get a rarity list.
- At least six of the ten eras do not put the hit in the last three
  cards: Wizards of the Coast, Diamond & Pearl and Platinum,
  HeartGold & SoulSilver, Black & White, XY, and Sword & Shield. Decide
  if the rip screen uses the real order or the pack-trick order (see
  [18-ripping.md](18-ripping.md#where-the-hit-sits)).
