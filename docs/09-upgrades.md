# Upgrades

**Status: built.** The Upgrades screen (hub, Today card) has every upgrade: the centering tools, the vendor kit, the analytics upgrade, the expected value readout, the better car, the drop alert Discord, the restock alert bot, the authentication tool, the corner loupe, the edge light, the raking lamp, the studio lights, and the camera kit. Upgrades are cash only. The camera kit needs the studio lights. The costs are in [19-prototype-values.md](19-prototype-values.md).

## Status

Early. Upgrades will eventually cover every system in the game, not
just grading — this doc is the general concept; per-system upgrade
lists belong in that system's own doc, linked below as they're
defined.

## What an upgrade is

A one-time purchase that permanently improves what you can do. Not a
consumable, not a subscription, not a per-use fee — you buy it once
and the improvement is yours for the rest of the game. This is
deliberately different from spending cash on inventory or entry fees,
which are recurring costs; an upgrade is a durable investment in your
own capability.

## Scope

Upgrades are meant to eventually touch every system: sourcing,
flipping, grading, social media, reputation, inventory management, and
whatever else gets added. Each system can define its own upgrades as
that system is designed. Nothing about the upgrade system itself is
specific to grading or centering.

## First defined upgrades

See [10-grading.md](10-grading.md) for the grading subgrade-reveal
upgrades (centering, corners, edges, surface) — the first concrete
examples.

## Centering tools

The first grading upgrades that the game has. Each tool replaces the
one before it, and the player buys them in order. The player buys the
next tool from the Condition box of any raw card.

| Tool | What it reads |
| --- | --- |
| Centering ruler | Numbers for the front cut, to about ±2 points. The back cut shows as words. |
| Centering scanner | Exact numbers for the front cut and the back cut |

Without a tool, the cut shows only as words, for example "Off center".

Costs: see [19-prototype-values.md](19-prototype-values.md#grading).
How the cut works: see [10-grading.md](10-grading.md#cut-and-wear).

## Vendor kit

A table cover, display cases, card stands, and a card reader. The
player must own it to book a table at a card show and sell there.
Without it, the player can only walk in and buy on the floor. It costs
$200, and the player buys it from the detail screen of any card show
(see [20-card-shows.md](20-card-shows.md#shows-on-the-calendar)).

## Contacts and selling

| Upgrade | Cost | What it does |
|---|---|---|
| Sales analytics | $150 | The sell screen and the consign screen show what the player paid for each item, the profit after fees and shipping, and the total profit, before the player lists. A pulled card counts as free. |
| Card reader | $80 | Take card payments at shows, meets, and the store counter. Buyers with no cash stop walking away. A card sale costs 2.6% plus $0.15. See [23-payment-methods.md](23-payment-methods.md). |
| Contact book | $200 | Room for 8 contacts in the contact book instead of 4. |
| Big contact book | $600 | Room for 15 contacts. Needs the contact book. |

See [21-relationships-and-reputation.md](21-relationships-and-reputation.md#the-contact-book).

## Open questions

- How upgrades are purchased (cash only, or gated by other currencies
  too — see [03-currencies.md](03-currencies.md)).
- Whether upgrades have tiers/prerequisites or are all independent.
- The full roster of upgrades beyond the centering-reveal example.
