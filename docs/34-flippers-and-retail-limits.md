# Flippers and Retail Limits

**Status: built.** The code is in `app/PokeVendor/Model/Retail.swift`, `Flippers.swift`, `RetailOnline.swift`, `Rivals.swift`, and `Camping.swift`. The numbers are starting values for balancing. They are in [19-prototype-values.md](19-prototype-values.md).

Hot sealed product is scarce, and other flippers want it too. This doc describes how a big store releases stock, what limits a buyer, what a flipper crowd does to the market, and what a player risks by buying too much. [12-acquiring-product.md](12-acquiring-product.md) has the buying screens. [35-callouts.md](35-callouts.md) has the public result of shady acts.

The rules apply to big stores: Walmart, Target, Best Buy, GameStop, Barnes & Noble, and the warehouse club. A game shop has no vendor day and no limit. Every big store sells existing in-print product only. No store sells a new set, a preorder, or Japanese product.

## Hot product

A product is hot when its market price is 1.2 times its retail price or more. The retail price is the MSRP. After the MSRP step, it is the stepped MSRP. A hot product sells out faster, has a lower limit, and attracts rivals.

## Vendor days

Each big store has one vendor day in each week. The vendor brings the stock for the week on that day.

- The slot is a weekday from Tuesday to Saturday, and an hour of 8, 10, 13, or 16. Each store keeps one slot for the whole run. Each run has its own slots.
- The player does not know the slot. The player learns it by seeing a fresh batch: a visit on the vendor day, at or after the vendor hour. The restock alert also shows it (see [Restock alerts](#restock-alerts)).
- A visit before the vendor hour shows last week's batch, after the drain.
- The same run and vendor day always give the same batch.
- A batch holds a fixed number of units and 1 to 6 products. Each product has at least 2 units. The rest of the units go to the products by random weight.
- A hot product in a batch drains while the store is open (from 8 AM to 10 PM). A product that is not hot drains slowly.
- Camping a posted restock is separate. A camp is a visit. The planner says "vendor stock" for the weekly batch and "restock" for a posted restock day.

| Store | Units in a batch | Products in a batch |
| --- | --- | --- |
| Walmart | 30 | 4 to 6 |
| Target | 24 | 3 to 5 |
| Best Buy | 12 | 2 to 4 |
| GameStop | 10 | 2 to 4 |
| Barnes & Noble | 6 | 1 to 3 |
| Warehouse club | 12 | 2 to 4 |

### The drain

The share of a batch item that is left at a visit is `exp(-total)`. The total is the sum of rate × open hours, from the vendor hour to the visit.

- A hot item has a rate of `0.2 + 0.6 × pressure` an hour. The rate uses the pressure of each day.
- An item that is not hot has a rate of 0.05 an hour.
- The game keeps the pressure of the last 8 days for this formula.

### Waiting for the vendor

A player who arrives on the vendor day, before the vendor hour, can wait. The player must know the slot. The wait is at most 2 hours. The wait costs the hours, and the work-hour rule applies. A hostile rival (hostility 0.5 or more) at the store takes 1 unit of a hot item from the vendor's cart first.

### Rival lines

At the start of a visit, the game writes a line for each hot item that is gone. The item must have lost units to the drain, with no unit left. The player must not have taken the last unit. The line says that the rival of that store got there first. Each line has a 5% chance to give the player a receipt against the rival (see [35-callouts.md](35-callouts.md#receipts)). A line also records the meeting in the rival's memory.

## Purchase limits

Each chain has a base limit. The limit is for card items.

| Store | Kind | Normal item | Hot item |
| --- | --- | --- | --- |
| Walmart | Per visit | 5 | 5 |
| Target | Per item each day | 2 | 1 |
| Best Buy | Per item each day | 2 | 1 |
| GameStop | Per item each day | 2 | 1 |
| Barnes & Noble | Per visit | 2 | 1 |
| Warehouse club | Per item each day | 2 | 1, and 1 hot item a day for the membership |

A per-visit limit counts all card items that the player buys in one visit. A per-item limit counts one product for the whole day, across all visits. A camp haul holds at most the limit of the chain for each product.

### Strictness

Each chain has a strictness level from 0 to 4. Strictness raises the limit step by step. The game shows the level as text on the stop and in the market news.

| Level | Rule |
| --- | --- |
| 0 | The base limit. |
| 1 | One of each item a day. |
| 2 | One checkout a day at the chain. This is the "per payment card" limit of the research report. |
| 3 | Hot product sells only through a drawing. |
| 4 | No card sales for 21 days. Then the level falls to 3. |

- On the vendor day of a chain, the chain can have an incident. The chance is `0.05 × pressure`, plus a boost from the buyouts of the player. An incident raises the level by 1. The market news shows the cause.
- Each buyout of the player adds 0.03 to the boost of that chain. The boost keeps 90% of its value each day. A boosted incident says that a video of a buyer who cleared the shelf went viral.
- A level falls by 1 after 90 days with no change. Level 4 does not fall this way.

### Drawings

At level 3, a chain draws its hot items. The player enters a free drawing. Entries close on the chain's next vendor day. A win works like the Walmart drawing below.

## Scalper heat

Scalper heat is hidden. The game never shows the number. It shows hints.

| Act | Heat | Hidden act |
| --- | --- | --- |
| A hot buy that reaches the limit | 1.5, at most once for each chain each day | None. This is not a secret. |
| A buyout: the player's buy takes the last unit of a hot item, and the player took 2 units or more of that product in the visit | 1.0 | `shelfBuyout` |
| The first buy of a second visit to one chain on one day | 2.0 | `limitEvasion` |
| A checkout bot use | 3.0 (global) | `botCheckout` |

- A single hot buy that empties an item adds no buyout heat. An honest player does not collect heat for one buy.
- Heat decays 5% each day. Each chain has its own heat. The player also has one global heat. The global heat raises the chance that a greed act comes out (see [35-callouts.md](35-callouts.md#discovery)).
- At 60% of the ban level, the cashier looks at the cart of the player. At 85%, the staff say that one more push ends the sales. The game shows each hint once a day.
- At heat 10 at one chain, the chain refuses card sales for 21 days. The heat at that chain then falls to half. The ban is a hidden act, `storeBan`.
- A ban closes the limit to 0 at that chain, and the player cannot camp there. The shelf stays visible.
- A game shop never adds heat.

## Rivals

The player has three rival flippers and two rival creators. The game names them at the start of a run. All names are invented.

- A rival flipper works at 2 chains. The same chain always has the same rival.
- A rival has hostility from 0 to 1. The base is 0.15 to 0.35. Hostility pulls back toward the base by 2% of the gap each day.
- Hostility rises when the player acts against the rival: the player takes the last units of a batch at the rival's store (+0.08), or beats the rival in a camp line (+0.05).
- A rival creator reacts when the follower tier of the player rises (+0.10).
- A rival keeps the last 3 meetings. Callouts read them as grudges (see [35-callouts.md](35-callouts.md)).
- At a camp, a rival flipper of that store stands in line with a 50% chance. The camp screen says who was there.
- A hostile rival flipper (hostility 0.35 or more) can take a table near the table of the player at a booked show (see [20-card-shows.md](20-card-shows.md)).

## Flipper pressure

Flipper pressure is one number from 0.1 to 0.9. A run starts at 0.5. It changes once a day, at End Day.

| Input | Change |
| --- | --- |
| Sealed hype news, or a character sell-out | +0.15 each |
| A boom | +0.002 each day |
| A correction | −0.003 each day |
| The holiday season starts | +0.10 |
| The after-holiday season starts | −0.10 |
| A reprint that reaches shelves | −0.25 each |
| The pull toward 0.5 | 1% of the gap each day |

The End Day report says something when the pressure moves 0.1 or more in one day.

| Effect | Rule |
| --- | --- |
| The shelf drain | A hot item drains faster at high pressure. |
| Store incidents | The incident chance of a vendor day grows with pressure. |
| Camp success | Multiplied by `1.2 − 0.6 × pressure`: 1.14 at 0.1, 0.9 at 0.5, 0.66 at 0.9. |
| Online sale chance | Hot in-print sealed on eBay and TCGplayer sells less often, up to 20% less at pressure 0.9. Flippers list the same product. |

The distributor fill rate and the plug offers also read the pressure (see [12-acquiring-product.md](12-acquiring-product.md)).

### The flipper dump

When the pressure is 0.6 or more, flippers sell stock that they cannot move.

- The dump starts on the day a reprint reaches shelves, or on the first day of a correction.
- A reprint dump hits the hot in-print products of the reprinted set. A correction dump hits the 2 sets with the most hot in-print products.
- The prices of those products fall 10% to 20% over 14 to 28 days. They then recover over 120 days.
- A reprint and a dump together never cut a price by more than 45%.
- The market news shows the dump.

### The winter dip

The after-holiday dip of sealed prices is 50% deeper (−15%) when the pressure is 0.6 or more on its first day. The game sets the size on that day and keeps it for the whole dip.

### The MSRP step

Once in a run, the Pokemon Company raises the retail price by 12.5%.

- The step can start after day 90. Each day has a 1 in 300 chance.
- The game gives 28 days of notice. Stock bought before the step day costs less.
- From the step day, big stores and the Pokemon Center charge the stepped price. The market price of in-print sealed rises by 60% of the step, over 30 days.

## Online drops and drawings

### The Walmart drawing

- Each week has one drawing. The entry opens on Monday. The draw happens at the End Day of Wednesday. The result is in the report of the next morning.
- The product is one hot in-print product, chosen on Monday. It stays the same all week.
- The entry is free. Each entry wins with a chance of 8%.
- A win waits 2 days for the player to press "Pay and claim" on the hub. The game charges nothing before then. A win that the player does not claim lapses.
- A Walmart win arrives in 4 days. A win at a strict chain arrives for pickup in 1 day.

### The Target.com drop

- A drop is likely on Friday (50%). Any other day has an 8% chance.
- A drop is one hot in-print product at MSRP, limit 1.
- An attempt works with a chance of 20%. A player gets 1 attempt a day. A player with the checkout bot gets 2, and the second one needs the bot.
- The order arrives in 3 days.

### Cancelled orders

A Pokemon Center or Target.com order can cancel before it arrives. The roll comes 1 to 3 days after the purchase. It never comes later than the day before arrival.

- A normal order has a 5% chance to cancel.
- A bot order has a 35% chance. A cancelled bot order is a hidden act, `botOrderCancelled`.
- The store refunds the full price.

### The checkout bot

The checkout bot is an upgrade ($400). It raises the Pokemon Center chance from 30% to 60%, and it gives a second Target.com attempt. Each use adds 3.0 global heat and records `botCheckout`. A bot order has the higher cancel chance.

## Restock alerts

Restock alerts are a monthly service. They are not an upgrade. The $150 restock alert bot upgrade stays as it was: it adds 25% to the camp chance.

| Tier | Fee each month |
| --- | --- |
| One chain | $8 |
| Every chain | $25 |

- An alert tells the player the evening before a vendor day, with the hour. It also counts as knowing the slot, so the player can wait for the vendor.
- A new alert with more than 7 days before the 1st starts at once and charges the month now. A new alert in the last 7 days starts on the 1st.
- A move to a dearer tier charges the difference now. A move to a cheaper tier, or to a new chain, charges nothing.
- The fee is a business cost. The game charges it on the 1st with the other monthly costs. A player who cannot pay loses the alerts.

## The warehouse club

- A membership costs $65 and lasts 364 days. The fee is a business cost. The report warns 7 days before it ends.
- The club sells club-exclusive product. The price is the MSRP, but never under $3.75 for each pack.
- A member can buy 2 of each item a day, and 1 hot item a day.
- Only a member can buy at the club.

## GameStop

GameStop sells hot product at 1.35 to 1.6 times the MSRP.

## Official card machines

A grocery store machine and a pharmacy machine sell Pokemon product. A machine restocks about every 10 days, at an hour from 10 to 16.

- The calendar posts the restock 2 days ahead.
- The player waits 2 hours. The wait follows the work-hour rule: it cannot overlap a work shift.
- A wait works with a chance of 70%. A late start keeps 75% of the chance for each hour. Pressure scales the chance like a camp.
- A success gives 1 to 3 products at MSRP, at most 2 of each. The player pays cash. A machine adds no heat.

## Shows

- 1 show in 6 bans in-print sealed product. Floor vendors bring none, and the player cannot bring any to the table. Older sealed product is allowed. The calendar marks these shows.
- A hostile rival flipper can take a table near the table of the player. The rival sells 3 to 5 hot in-print sealed products at 95% of market. Some of it is resealed, at the plug fake rate. A buyer pays at most 95% of the ask of the player for a product that the rival also lists.
- A resealed product that the player buys from a rival table, and later finds, gives the player a receipt against that rival (see [35-callouts.md](35-callouts.md#receipts)).

## The opened-at-MSRP offer

A game shop can open a hot in-print product and sell it at MSRP to a player at standing Regular or higher. The shop makes this offer once a week. The same week gives the same product. The player must rip the product. It has the status "Opened · rip it", so no sell path takes it. A game shop has no limit and adds no heat.

## Price gouging

A player who posts hot in-print sealed product at 1.25 times its market price or more commits a gouge. The post must be at the player's own store, or at a show table. The game rounds posted prices, so a price within $0.50 of the line counts.

- The product does not need to sell. The post is enough.
- A gouge is a hidden act, `priceGouge`. At most 1 gouge records each day. The worst post sets its weight.
- A shelf price that stays high at the own store counts again each night, once a day.
- An online listing is not a gouge.

## Money

- Every cost and income uses the one cash balance. A refund of a cancelled order or a missing shipment nets the cost it repays (see [26-taxes.md](26-taxes.md)).
- Challenge cash stays a book number. No rule here adds a second wallet or a buy toggle.
- No screen flashes white. Results show as banners in the theme colors.

## Balance tool

`-retailsim <days> [honest|flipper|shop]` plays End Day with every hook and prints the retail state. It is a debug tool. Use it after a change to a value above.
