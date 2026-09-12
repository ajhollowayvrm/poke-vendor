# e-Card era (2002–2003)

The shared pack template for the late Wizards of the Coast sets. Each
set file records its own data and exceptions. See
[../../13-sets.md](../../13-sets.md) for what a set file covers.

## Sets in this era

| Set | English release | Pack size | File |
|---|---|---|---|
| Legendary Collection (transition set) | May 24, 2002 | 11 cards | [../legendary-collection.md](../legendary-collection.md) |
| Expedition Base Set | September 15, 2002 | 9 cards | [../expedition-base-set.md](../expedition-base-set.md) |
| Aquapolis | January 15, 2003 | 9 cards | [../aquapolis.md](../aquapolis.md) |
| Skyridge | May 12, 2003 | 9 cards | [../skyridge.md](../skyridge.md) |

Skyridge is the last English expansion that Wizards of the Coast made
(Bulbapedia, Flipside Gaming).

### Why Legendary Collection is in this file

Legendary Collection is a transition set.

- It keeps the older 11-card pack and the older card frame. All its cards
  are reprints from Base Set, Jungle, Fossil, and Team Rocket.
- Bulbapedia puts it in the "Legendary Collection Series", not in the
  e-Card Series. Its navigation box groups it with the Neo releases.
- It introduced the two features that the e-Card sets kept: one reverse
  holo in every pack, and box toppers (Bulbapedia, PSA).

### English products with no booster packs (not in this era's set list)

- **Southern Islands** (July 31, 2001). Wizards of the Coast sold it as
  an 18-card collection in a folder. The folder included 3 booster packs
  (Bulbapedia). A retail blog says that these packs came from Neo
  Genesis and Neo Discovery, not from Southern Islands (Going Twice,
  search summary only). It is outside this era by date.
- **Best of Game** (December 2002 – July 2003). A 9-card promo set. Players
  got the cards at BattleZone tournaments (Bulbapedia).

## The e-Card pack template

Expedition Base Set, Aquapolis, and Skyridge share this template.

### Pack structure

- 9 cards per pack. Earlier English packs had 11 cards (Bulbapedia).
- Nominal slots: 5 common, 2 uncommon, 1 reverse holo, 1 rare (PSA,
  Bulbapedia).
- The reverse holo slot can hold a card of any rarity. That includes a
  rare, so a reverse holo can be a hit (Elite Fourum rarity guide).
- Each H-numbered or main-set holo also exists as a non-holo rare in the
  main numbering (Bulbapedia). Retro Pokémon TCG says that all holos have
  a non-holo version "except for the Crystal Pokémon in Skyridge". It does
  not name the non-holo versions of the Aquapolis Crystal cards.
- Box: 36 packs. One jumbo box topper sits on top of each box (PSA).

### Where the holo goes: a conflict

The sources disagree on the holo slot. The conflict changes the hit count.

- **Model A: the holo is the rare.** The rare slot holds a holo rare or a
  non-holo rare. PSA says this for Expedition, and Bulbapedia agrees.
- **Model B: the holo replaces a common.** Every pack has a non-holo
  rare. In about 1 pack in 3, a holo replaces one common. PSA says this
  for Aquapolis and Skyridge, from collector Zack Browning. The Elite
  Fourum rarity guide says this for Expedition and Aquapolis. It gives
  the average pack as "4 2/3 commons, 2 uncommons, 1 rare, 1/3 holos and
  1 reverse".

**Default for the simulation: Model B for all three e-Card sets.** Two
independent sources support it, and one of them (the rarity guide) comes
from print-sheet reconstruction. Confidence: community estimate.

### Rarity system

| Rarity | Where it shows | Notes |
|---|---|---|
| Common | Common slots, reverse slot | |
| Uncommon | Uncommon slots, reverse slot | |
| Rare (non-holo) | Rare slot, reverse slot | |
| Rare Holo | Holo slot (Model B) or rare slot (Model A) | Expedition numbers them 1–32. Aquapolis and Skyridge number them H1–H32. |
| Crystal (secret rare) | Aquapolis and Skyridge only | Numbered past the set total, for example 146/144. Holo. |
| Reverse holo | One per pack | A foil version of a normal card. Not a rarity of its own. |

### Hit odds shared by the template

| Figure | Value | Confidence |
|---|---|---|
| Rare or better per pack | 1 per pack (100%) | Community estimate (PSA, Bulbapedia) |
| Holo per pack | About 1 in 3 | Community estimate (PSA, Elite Fourum) |
| Holos per 36-pack box (Skyridge) | 11 in 1 box | Empirical study, very small (Loose Packs) |
| Holos per 72 packs (Aquapolis) | 19 in 2 boxes | Empirical study, very small (Loose Packs) |
| Crystal cards per box | 1 to 3 | Community estimate (PSA) |

Wizards of the Coast published no official odds for these sets. PSA
writes that there "was no official indication from WOTC" on Crystal
counts.

### Pack order

**Confidence: community estimate, low.** No source shows a photo or a
video of a real pack in order. The only sources are "card trick"
guides. A card trick guide gives a number N of cards to move.

The method in both guides:

1. Hold the stack face down, with the card backs to you.
2. Move the card nearest to you to the far end of the stack. Do this N
   times.
3. Turn the stack face up and look at the cards from front to back. The
   last card is the rare.

**How to read N as a pack order.** The trick works only if the rare is
the card at position (pack size − N). Position 1 is the first card that
the player sees with the card faces to them. So N cards come after the
rare. This is our reading of the guides, not a statement in them.

| Set | N (PokéPatch) | N (Card Collector) | Rare position in a 9-card pack |
|---|---|---|---|
| Expedition Base Set | 2 | 3 | 7 (N = 2) or 6 (N = 3). Sources conflict. |
| Aquapolis | 2 | 2 | 7 |
| Skyridge | Not listed | 3 | 6 |

- With N = 2, the rare is card 7 of 9. It is one of the last three cards.
- With N = 3, the rare is card 6 of 9. It is the fourth card from the
  end, so it is **not** one of the last three cards.
- PokéPatch says that for Expedition and Aquapolis, after the trick,
  "your 2nd to last card will generally be a reverse holo". In the
  natural order, that puts the reverse holo at card 6, directly before
  the rare.
- The position of the extra holo (Model B) is Unknown.
- The guides do not say how the stack leaves the wrapper. If the player
  pulls the stack out with the backs to them, the order is reversed.
  The rip screen must pick one direction.

**Default for the rip screen:** use the per-set position in each set
file. Mark each position as low confidence.

## Sets that break the template

- **Legendary Collection:** 11 cards, not 9. The pack is 9 cards in a row
  from one common/uncommon print sheet, plus 1 rare and 1 reverse holo.
  So the uncommon count is not fixed. One trick guide says the set has
  "No card trick". Its pack order is Unknown.
- **Expedition Base Set:** no Crystal cards and no secret rares. The holo
  rares are numbered 1–32 in the main set, not H1–H32. Reverse holos
  exist for cards 1–159. The 6 basic energy cards have none.
- **Aquapolis:** the first set with H-numbered holos and Crystal cards.
  The Crystal cards and the H cards have no reverse holo version. Four
  commons and uncommons have "a" and "b" versions with different e-Reader
  dot codes.
- **Skyridge:** 6 Crystal cards, not 3. The Crystal cards also exist as
  reverse holos, unlike Aquapolis. It had only one print run.

## Sources

- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [Bulbapedia — Legendary Collection (TCG)](https://bulbapedia.bulbagarden.net/wiki/Legendary_Collection_(TCG))
- [Bulbapedia — Expedition Base Set (TCG)](https://bulbapedia.bulbagarden.net/wiki/Expedition_Base_Set_(TCG))
- [Bulbapedia — Aquapolis (TCG)](https://bulbapedia.bulbagarden.net/wiki/Aquapolis_(TCG))
- [Bulbapedia — Skyridge (TCG)](https://bulbapedia.bulbagarden.net/wiki/Skyridge_(TCG))
- [Bulbapedia — Box Topper (TCG)](https://bulbapedia.bulbagarden.net/wiki/Box_Topper_(TCG))
- [Bulbapedia — Southern Islands (TCG)](https://bulbapedia.bulbagarden.net/wiki/Southern_Islands_(TCG))
- [Bulbapedia — Best of Game (TCG)](https://bulbapedia.bulbagarden.net/wiki/Best_of_Game_(TCG))
- [Going Twice — The Southern Islands Collection](https://www.goingtwice.com/blogs/pokemon/the-southern-islands-collection) (search summary only)
- [PSA — Collecting the 2002 Pokémon Expedition Set](https://www.psacard.com/articles/articleview/9581/psa-set-registry-collecting-2002-poke-mon-expedition-e-xciting-overlooked-card-issue)
- [PSA — Collecting the 2003 Pokémon Aquapolis Set](https://www.psacard.com/articles/articleview/9721/psa-set-registry-collecting-2003-poke-mon-aquapolis-its-appeal-crystal-clear)
- [PSA — Collecting the 2003 Pokémon Skyridge Set](https://www.psacard.com/articles/articleview/9747/psa-set-registry-collecting-2003-poke-mon-skyridge-high-flying-issue)
- [PSA — Collecting the 2002 Pokémon Legendary Collection Set](https://www.psacard.com/articles/articleview/9582/psa-set-registry-collecting-2002-poke-mon-legendary-collection)
- [Elite Fourum — The English Pokémon card rarity guide (Legendary Collection post)](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762/26)
- [Elite Fourum — The English Pokémon card rarity guide, page 2](https://www.elitefourum.com/t/the-english-pokemon-card-rarity-guide/39762?page=2)
- [Loose Packs — Pokemon Pack Weight Guide](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide)
- [Flipside Gaming — A Comprehensive Review of Rarity in the Pokemon TCG](https://flipsidegaming.com/blogs/pokemon-blog/a-comprehensive-review-of-rarity-in-the-pokemon-tcg)
- [Retro Pokémon TCG — e-Card: The Lost Age of the Pokémon TCG](https://jklaczpokemon.com/e-card/)
- [PokéPatch — Pokemon Card Tricks for Every Set](https://pokepatch.com/2022/07/26/how-to-open-pokemon-cards-card-trick-for-each-set/)
- [Card Collector — The Pokémon Card Trick](https://cardcollector.co.uk/pokemon-card-trick-pack-opening/)

## Open topics

- **Holo slot model (A or B).** PSA gives Model A for Expedition and
  Model B for Aquapolis and Skyridge. A photo of an opened pack with a
  holo and a rare together would settle it.
- **Pack order.** Only card trick guides exist. They conflict on
  Expedition (N = 2 or 3). No guide lists the position of the extra holo.
  No guide says which way the stack leaves the wrapper.
- **The "last three cards" default.** With N = 3, the rare is the fourth
  card from the end. Skyridge and possibly Expedition break the default.
- **Case size.** No source gives boxes per case for any set in this era.
- **Holo odds.** "1 in 3" has no official source. The empirical counts
  (11 of 36, 19 of 72) come from only 3 boxes.
- **PokéBeach threads.** PokéBeach blocked the fetch (HTTP 403). The
  "English Booster Box Pull Rates" thread may hold per-box counts.
