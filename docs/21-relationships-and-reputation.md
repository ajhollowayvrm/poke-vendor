# Relationships and Reputation

**Status: built.** The numbers are starting values for balancing. The
code is in `app/PokeVendor/Model/Relationships.swift`, the Contacts
screen is on the hub's Reputation tile, and the Test menu has
**Relationships** tools.

**Also built:** selling fakes (see
[14-counterfeit-risk.md](14-counterfeit-risk.md)) and regulars at meets
(see [15-selling.md](15-selling.md#local-meets)). A stranger who
completes a deal gives their number 1 time in 4. The roster holds at most
60 contacts.

The trading world is people. A player who deals fairly with the same
people again and again gets better prices, more patience, first looks,
and items saved for them. A player who lowballs, flakes, or sells fakes
gets the opposite. This doc joins three things that the game has now:

- **Reputation**: the global track, from Unknown to Elite (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers)).
  It is designed but not built.
- **Game shop standing**: 0 to 100 with each game shop (see
  [12-acquiring-product.md](12-acquiring-product.md#standing-levels)).
  It is built, and it changes the buylist price.
- **Card show people**: the vendors, buyers, traders, and sellers (see
  [20-card-shows.md](20-card-shows.md)). Now they are random strangers
  each time, so no relationship can form.

## Two layers

| Layer | What it is | Who has one |
| --- | --- | --- |
| **Relationship** | How one person or business feels about the player, from 0 to 100 | Each contact: the two game shops, the recurring show vendors, and the regulars |
| **Reputation** | What the whole local trading scene says about the player | One number for the player |

A relationship is personal. Reputation is word of mouth: it grows from
the sum of fair deals with everyone, and a stranger reads it before they
deal with the player.

## Contacts

A **contact** is a person or a business that the game remembers. Each
contact has:

- A **name** and a **kind**: game shop, vintage dealer, modern dealer,
  collector, trader, or regular buyer.
- A **relationship** from 0 to 100, and a **level** from it.
- **Interests**: what they collect or look for, for example "Eevee
  line", "Base Set holos", or "sealed Sword & Shield". They buy these
  for more, and they look for these for the player when they know that
  the player wants them.
- A **memory** of the last few deals, for a one-line note on their card,
  for example "You paid fair for the Charizard last month."
- **Where they turn up**: which shop, which shows (local, regional, or
  both), and how often.

**The roster:** the two game shops, about 12 recurring show vendors (a
regional show has most of them, and a local show has a few), and about
20 regulars (collectors, traders, and buyers who come to shows and, later,
to meets). A show still fills its other tables and visitors with
strangers. A stranger who deals with the player well enough can become a
contact.

## Relationship levels

The game shop levels stay as they are, and every contact uses them.

| Level | Points | What the contact does |
| --- | --- | --- |
| Stranger | 0–9 | Normal prices and patience. |
| Familiar | 10–29 | 5% better prices. One more patience point in a haggle. Says hello, and remembers the last deal. |
| Regular | 30–59 | 10% better prices. **Saves things for the player** (see below). A game shop gives holds and consignment. |
| Trusted | 60–89 | 15% better prices. First look before the doors open or before the shelf. Sends the player an offer before a show. |
| Friend | 90–100 | 20% better prices. Private offers: a whole collection, a grail, or a case split. Tells the player about finds. |

"Better prices" means the contact asks less when selling and offers
more when buying.

## Saved for you

At **Regular** and above, a contact sets things aside for the player.

- **What:** items that match the player's **want list** first, then
  items that match what the player has bought from them before.
- **Game shop:** a "Saved for you" box on the shop screen, with 1 or 2
  items. The shop holds each item for 3 days. A hold that the player
  does not pick up costs 5 points (this is already in the shop design).
- **Show vendor:** before a show, the vendor sends a message: "I'll
  have a PSA 9 Base Set Blastoise at the Riverside show. Want me to hold
  it?" The item waits at their table. It costs the same 5 points if the
  player says yes and does not buy it.
- **Regulars:** at Trusted, a regular brings a card that they know the
  player wants, and offers it at the table first.
- The number of saved items grows with the level: 1 at Regular, 2 at
  Trusted, and 3 at Friend.

## The want list

The player keeps a short **want list**: up to 10 cards, sets, or kinds
of sealed. Contacts at Regular and above look for these. A want list
item that turns up is saved for the player, and a contact at Trusted or
above tells the player where it is.

## What moves a relationship

| Action | Points |
| --- | --- |
| A completed deal (buy, sell, or trade) | +2 |
| A deal at a fair price (within 10% of market) | +1 more |
| Paying more than a naive seller asked (see Fair dealing) | +4, and reputation |
| Picking up a saved item | +3 |
| A counter under 60% of market (a lowball) | −2 |
| Walking away after three counters | −1 |
| A saved item that the player does not pick up | −5 |
| Selling them a fake | −20 (the game shop rule, for everyone) |
| No deal for 8 weeks | −1 each week after that |

## Fair dealing

Some sellers do not know what they have, for example someone cleaning
out a closet who asks $40 for a card worth $200. The player can take
the deal, or tell them what it is worth and pay fair.

- **Paying fair** costs the player money now. It raises the
  relationship, and it raises reputation. That seller comes back with
  more, and they tell others.
- **Taking the deal** is not a scam. It costs nothing, but it earns no
  reputation.
- **Buying low and saying it is worthless** is a scam. There is a
  chance that the seller finds out later. Then the player loses
  reputation, and the story can reach social media (see
  [06-social-media.md](06-social-media.md#consequences)).

## Reputation

Reputation is a points total. It sets the five tiers from
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers).

| Tier | Name | Points |
| --- | --- | --- |
| 0 | Unknown | 0–49 |
| 1 | Known | 50–149 |
| 2 | Trusted | 150–349 |
| 3 | Respected | 350–699 |
| 4 | Elite | 700+ |

- **What raises it:** each fair deal with anyone (+1), paying fair to a
  naive seller (+5), each contact who reaches Trusted (+10) and Friend
  (+20), and good word from social media.
- **What lowers it:** a scam that comes out (−30), selling a fake (−40),
  a missed booked show day (−5), and backlash from social media.
- **What it does with strangers:** a stranger's first offer, patience,
  and deal chance start better at a higher tier. More sellers come to
  the player's show table at a higher tier, because they hear that the
  player pays fair.
- The tier unlocks in doc 04 stay as they are (trading circles, first
  look, wholesale, case splits, private consignment).

## Where the player sees it

- **The hub's Reputation tile** (now "Not built yet") opens a
  **Contacts** screen: the reputation tier and points, the want list,
  and each contact with their level, interests, the last deal, and where
  they turn up.
- **A contact's card** in a deal shows their level and one line from
  memory.
- **Messages** from contacts ("Saved for you", "I'll bring it to the
  show") arrive in the morning report and on the calendar.

## Decisions

1. **Contacts:** the roster (the two game shops, about 12 recurring show
   vendors, and about 20 regulars), plus strangers: a stranger who deals
   well with the player can become a contact.
2. **Fair dealing is in**, with all three choices: pay fair, take the
   deal, or lie.
3. **Saved items** use the want list first, then what the player bought
   from that contact before.
4. **Everything in this doc is built together.**

## How it plays now

- **Game shops:** the shop's standing is its relationship. Each shop buy
  or buylist sale is a deal (+2, or +3 at a fair price), on top of +1
  for each $50. At Regular, the shop's prices drop by the level's bonus,
  and the shop can save 1 item for 3 days ("Saved for you" on the shop
  screen and at a store run stop). Each day, a shop with room for a
  saved item saves one 1 time in 4.
- **Show vendors:** the recurring vendors take some tables at each show.
  A regional show has every vendor who goes to regional shows. A local
  show has about 70% of those who go to local shows. Their prices drop
  by the level's bonus, and asking for a deal works 10% more often for
  each level. Three days before a show, each vendor at Regular or higher
  offers to bring something ("Offers and holds" in Contacts). A held
  item waits at their table under "Saved for you".
- **Regulars:** about 1 visitor in 3 at a show is a regular who goes to
  that kind of show. A regular has their name, their level, and a line
  about the last deal. At Trusted, a regular sometimes brings a card from
  the want list to sell.
- **Fair dealing:** a seller cleaning out a closet who asks 65% of market
  or less is naive. The player can buy at their price, **Pay fair** (90%
  of market: +5 reputation, and they become a contact), or **Say it's not
  worth much** (half their price). The lie finds out 35% of the time,
  3 to 20 days later: −30 reputation, −30 with that contact, and, with
  a social media account, less authenticity.
- **Strangers and reputation:** at each tier, strangers pay 2% more and
  ask 2% less, and 3% more of the visitors to the player's table are
  sellers.
