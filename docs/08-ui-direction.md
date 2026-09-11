# UI Direction

## Status

First screen designed and approved: the home hub (see below). Mockups live
outside this repo for now, in Claude Design canvases — this doc records the
decisions so they survive independent of any single mockup file.

## Aesthetic

Modern fintech/dashboard direction, chosen over a retro trading-card look and
a playful mobile-game look. Dark background, monospace numerals, sharp
rectangular cards, cyan/green accent lines. Treats the game like a real
portfolio app — numbers up front, minimal chrome.

## The home hub is the density ceiling

The home hub is the single most information-dense screen in the game, by
design. Every other screen should read as calmer than it by comparison — if
another screen feels as dense as the hub, that is a signal to simplify it.

## The home hub is an info + launch screen, not read-only

Nearly every element on the hub is a tap target into a deeper screen, not
just a display of a number. The hub's job is to summarize the whole game
state and be the fastest way to get anywhere in the app.

### Confirmed tap targets and their destinations

1. **Cash** → Wallet / cash ledger
2. **Followers** → Social media hub
3. **Reputation** → Reputation & meets
4. **Collection** → Inventory / collection
5. **Alert banner** (rare surprise event) → Opportunity detail
6. **Local meet row** → Meet encounter
7. **Garage sale row** → Garage sale encounter
8. **Go Live row** → Live stream setup
9. **Card show row** → Show detail / planner
10. **Recent activity** → Activity log
11. **Free-action icon row** (packs / grade / buy / post) → their own
    individual flows

## What's next

Designing the destination screens these tap targets link to, starting with
whichever the user prioritizes first (see conversation for current order).
