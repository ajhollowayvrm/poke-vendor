# Add purchase limits, rival flippers, cases, and trust

PokeVendor already has most of the parts for a bigger sealed-product game. The missing parts are competition and consequence. Today, no other buyer takes stock from a shelf. No store limits what one person buys. A case is not an item that the player can hold. Only fixed random stories post about the player. The real US market in November 2026 gives numbers for each missing part. Big-box chains get their normal allotment but limit each buyer to 1 to 5 items. Hobby stores get 10% to 50% of what they order. A sealed ETB case trades at about 1.13 times the price of ten single ETBs. Plain rip and ship is the one live format that every large platform still permits. This report recommends six extensions. Each one plugs into an existing `Model/*.swift` file and an existing End Day hook, and none of them touches a rejected feature. Build the store limits and the case item first, because the flipper, distributor, Rip & Ship, and callout systems all read from them.

## Designer constraints that every proposal obeys

The table below lists the hard rules from the designer. Each proposal in this report was checked against them.

| Rule | How this report applies it |
|---|---|
| No slab cracking or resubmission | No proposal touches grading. A returned grade stays final ([D/10 L400-406](/Users/ajholloway/personal/PokeVendor/docs/10-grading.md)). |
| No Japanese product | No proposal adds Japanese product. The eBay "international" listing stays the same English catalog. Japan facts appear only as context. |
| No preorders, no new set releases during a run | Every supply event uses sets and products that already exist in `catalog.json`. The gray "plug" sells only in-print stock that exists now. |
| No livestream group breaks | Rip & Ship is permitted only as **one buyer, one whole manufacturer-sealed product**. All contents go to that one buyer. No spots, no teams, no random assignment, and no split of one product among buyers. |
| Real graded prices never change by game logic | Flipper pressure, dumps, and callouts move only sealed prices and sale chances. They never edit a real graded price. |
| Challenge cash is one book number | Every new cost and income (alerts, plug prepayment, Rip & Ship sales) uses the one cash balance. No proposal adds a second wallet or a buy toggle. |

## Big-box stores get full allotments and ration them at 1 to 5 items

### The real market

Big-box chains are the main retail source in a shortage. At the Prismatic Evolutions launch (January 2025), Target, Walmart, and Best Buy expected their "typical allotment", while local hobby stores got severe cuts ([PokeBeach](https://www.pokebeach.com/2025/01/prismatic-evolutions-allocations-severely-cut-to-local-stores-demand-higher-than-supply)). Store staff do not stock the card aisle at Walmart and Target. A third-party merchandiser stocks it. An internal Target notice from August 2026 says that the card inventory is **"vendor owned, not Target owned"** ([Dexerto](https://www.dexerto.com/pokemon/target-orders-stores-to-stop-cutting-open-pokemon-cards-over-legal-risk-3397840/)). Each Target has a stable restock day, but the day differs from store to store. Trackers name weekday mornings from Tuesday to Friday ([Ripster: Target](https://www.ripster.gg/blog/when-does-target-restock-pokemon-cards)). One blog says that a Walmart vendor visit stocks **about 300 packs** that often sell out within one hour. No primary source confirms this number. The same blog says that the vendor changed its days after crowds formed before setup ([Ripster: Walmart](https://www.ripster.gg/blog/when-does-walmart-restock-pokemon-cards)).

Online drops follow clearer patterns. Walmart.com drops most often on Wednesday at about 9 PM ET. On Target.com, one tracker logged 408 restocks in 116 days: **46% on Friday** and **87% between 10 PM and 6 AM ET** ([Ripster: Walmart](https://www.ripster.gg/blog/when-does-walmart-restock-pokemon-cards); [Ripster: Target](https://www.ripster.gg/blog/when-does-target-restock-pokemon-cards)).

Purchase limits are now standard at every chain. The table gives the limits that the sources report for 2025 and 2026.

| Chain | Reported limit | Source |
|---|---|---|
| Walmart | 5 trading-card items per visit, in store and online, from 2025-11-05 (a reported internal memo, not a public policy) | [Kotaku](https://kotaku.com/pokemon-trading-card-tcg-scalper-walmart-purchase-limit-2000641073); [Daily Dot](https://www.dailydot.com/news/walmart-trading-cards-purchase-limit-pokemon/) |
| Target | 2 per SKU per guest, set at enterprise level; 1 per item on the June 2026 Target collaboration; 1 Pokemon purchase per payment card on the 30th Anniversary release | [Notebookcheck](https://www.notebookcheck.net/Pokemon-30th-Anniversary-restock-marred-by-Target-altercation-that-injures-4-year-old.1406433.0.html); [ScreenRant](https://screenrant.com/target-pokemon-card-limits-policy-changes/); [The Bulletin Time](https://www.thebulletintime.com/news/target-pokemon-30th-anniversary-tcg-release-limits) |
| GameStop | 2 per customer; 1 per SKU on Destined Rivals; 5 sleeved boosters | [esports.gg](https://esports.gg/news/pokemon/gamestop-restricts-pokemon-tcg-destined-rivals-purchases-ahead-of-may-30-release) |
| Best Buy | 1 to 5 by product (blog claim); tickets for each product at release events | [PokeInsider](https://pokeinsider.com/2025/11/05/major-retailers-tighten-purchase-limits-on-pokemon-tcg-products-to-combat-scalping/); [Brobible](https://brobible.com/culture/article/pokemons-30th-anniversary-crowd-control-security-precautions/) |
| Barnes & Noble | Local managers set it; often 1 (blog claim) | [PokeInsider](https://pokeinsider.com/2025/11/05/major-retailers-tighten-purchase-limits-on-pokemon-tcg-products-to-combat-scalping/) |
| Pokemon Center | Usually 1 on premium items; up to 6 sleeved boosters (blog claim) | [PokeInsider](https://pokeinsider.com/2025/11/05/major-retailers-tighten-purchase-limits-on-pokemon-tcg-products-to-combat-scalping/) |
| Costco | 1 per membership per day on one online bundle (single source); some stores used no limit | [Eat This](https://www.eatthis.com/costco-pokemon-cards-purchase-limits/) |

Stores move up a ladder of stricter limits after a viral incident. The Walmart memo came just after a viral TikTok of one buyer who took a full display ([Kotaku](https://kotaku.com/pokemon-trading-card-tcg-scalper-walmart-purchase-limit-2000641073)). In May 2021, Target stopped in-store card sales after a parking-lot gun incident, and it restored sales from about June 1, 2021 ([Dexerto](https://www.dexerto.com/pokemon/target-is-no-longer-selling-pokemon-cards-amid-scalper-crisis-1572507/); [Game Rant](https://gamerant.com/target-pokemon-cards-in-store-sell/)). Walmart moved hot items to an online **Collectibles Draw** in August 2026, with one free entry per account per drawing ([GodisaGeek](https://godisageek.com/2026/09/walmart-pokemon-tcg-lottery-drawing-system/)). Pokemon Center added a virtual queue in February 2025 and cancels bulk orders in waves. In September 2026, it cancelled a large number of 30th Celebration orders, and some buyers who stayed within the limits also lost orders ([Kotaku](https://kotaku.com/pokemon-tcg-30th-celebration-orders-cancelled-bots-scalpers-center-company-2000732116)). GameStop is the exception to MSRP: it charged **$7 for a $4.49 sleeved pack** and $239.99 for a box with a $143.64 MSRP ([Kotaku](https://kotaku.com/gamestop-pokemon-tcg-prices-booster-box-etb-perfect-order-2000681798)).

### What the game already has

The store run visits Target, Walmart, Best Buy, GameStop, Barnes & Noble, and two game shops. Each stop costs 40 minutes ([D/12 L88-108](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)). A big store has stock on 12% of days, with 1 to 2 products at MSRP. Loose packs come 2 to 8 at a time, and other products 1 to 2 ([LocalStores.swift L13, L106-121](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LocalStores.swift)). Each big store posts a restock about every 14 days. Camping takes 6 hours, succeeds at 60% at the door, and gives 2 to 4 products of 2 to 6 each ([Camping.swift L22-33, L76-99](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Camping.swift)). Pokemon Center drops are live on 15% of days, and the one attempt succeeds at 30% ([D/19 L25](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)). The only purchase limit is the shelf quantity, which `shelfBought` tracks and End Day resets ([GameStore.swift L22-25, L782](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)). The restock alert bot ($150) adds 25% at a camped restock ([D/19 L372-378](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)). The code defines "hot" as a market price at 1.2 times MSRP or more ([WholesaleAccount.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)). The catalog marks club-exclusive products, but no store sells them at retail.

### Proposals

**1.1 Replace the daily 12% stock roll with one weekly vendor day for each big store.** Give each big store a hidden, fixed weekday from Tuesday to Friday, seeded per run, with a random morning hour. On that day the store gets a large batch, and the batch drains through the day. This change gives the designer's "huge allocation", because the shelf holds far more stock than today. It also keeps the existing rule that the same day gives the same stock, because the seed stays the day. The batch sizes below scale the 300-pack blog figure into item counts. They are starting values, not research facts.

| Store | Batch on vendor day | Products in the batch |
|---|---|---|
| Walmart | 30 items | 4 to 6 |
| Target | 24 items | 3 to 5 |
| Best Buy | 12 items | 2 to 4 |
| GameStop | 10 items | 2 to 4 |
| Barnes & Noble | 6 items | 1 to 3 |

Model the drain so that arrival time matters. For a hot product, the share left after `h` hours is `exp(-h × (0.5 + 1.5 × pressure))`, where `pressure` is the flipper pressure from proposal 2.1. At a pressure of 0.5, about 29% of a hot product is left after one hour. That matches the "sold out within one hour" reports. A product that is not hot drains at 0.05 per hour, so it stays on the shelf for days. On other days, the shelf shows only the stock that is left.

**1.2 Add a purchase limit to each chain, and apply it at the shelf and at camping.** Add a `PurchaseLimit` value to `LocalStore` with three kinds: per visit, per SKU per day, and per payment card. Use the real limits as the starting values.

| Store | Limit kind | Normal product | Hot product |
|---|---|---|---|
| Walmart | Per visit, all card items | 5 | 5 |
| Target | Per SKU per day | 2 | 1 |
| GameStop | Per SKU per day | 2 | 1 |
| Best Buy | Per SKU per day | 2 | 1 |
| Barnes & Noble | Per visit | 2 | 1 |
| Game shops | No limit | — | — |

A per-visit limit lets the player make a second visit on the same day. The second visit costs another 40-minute stop. Track per-SKU limits in the existing `shelfBought`, which resets at End Day. Keep the success formula in `Camping.swift`, but cap each camp haul at the chain limit. With this cap, a camped Target restock gives 1 or 2 of each product, not 2 to 6.

**1.3 Give each chain a strictness level that rises after incidents.** Use five levels. Level 0 is the base limit. Level 1 sets every product to 1 per day. Level 2 also limits each payment card to one card purchase each day. Level 3 sells hot product only through a drawing. Level 4 stops in-store card sales for 21 days, which matches the 2021 Target stop. A new market news kind, "restock incident", raises one chain by one level. Its chance on each vendor day is `0.02 × pressure`. Each level falls by one after 45 days. Show the level on the store row so that the player can see why a limit changed.

**1.4 Add a weekly drawing to the online storefronts.** Model the Walmart Collectibles Draw as a free weekly entry for one hot product at MSRP. The result comes the next day. A win charges the cash balance at once. If the cash is too low, the win is lost. Use an 8% win chance as a starting value, because no source gives real odds. Allow one entry only.

**1.5 Add a cancellation roll after a successful Pokemon Center drop.** Within 3 days, roll a 5% chance that Pokemon Center cancels the order and refunds the cash. The real purges hit honest buyers too, so the chance must never be zero. Proposal 2.6 raises the chance for a player who uses a checkout bot.

**1.6 Mark up hot product at GameStop.** Keep GameStop at MSRP for products that are not hot. Price hot products at 1.35 to 1.6 times MSRP. The real anchors are $7 for a $4.49 pack (1.56) and $199.99 for a $143.64 box (1.39) ([SNKRDUNK](https://snkrdunk.com/en/magazine/2025/05/29/pokemon-tcg-gamestop-raises-prices-of-destined-rivals-dri-products/)). The player can then buy there when other shelves are empty, but the margin is thin.

**1.7 Add a club store stop that sells the club-exclusive products in the catalog.** The catalog already flags `isClubExclusive`. Add one club store to the store run with a yearly membership fee and a limit of 1 hot bundle per membership per day. Use the vendor-day model from proposal 1.1. Club bundles trade as their own products on StockX ([StockX](https://stockx.com/2025-pokemon-scarlet-violet-pristmatic-evolutions-elite-trainer-box-booster-costco-bundle)), so the game can price them from the existing catalog.

**1.8 Convert the restock alert bot into a base tier and add two monthly tiers.** Real Pokemon alert groups cost **$5.99 to $25 per month** ([whopreviews: pokealerts](https://sites.google.com/view/whopreviews/pokealerts); [Lunch Money](https://sites.google.com/view/whopreviews/lunchmoney)). Keep the $150 bot and its +25% at camping. Add an $8 monthly tier that shows the vendor day of one chain one day ahead. Add a $25 monthly tier that shows every chain. Charge the fee on the 1st of each month with rent.

## Flippers compete for the same shelf and lose money on reprints

### The real market

A flipper buys at MSRP through alerts and drops, then lists on eBay or TCGplayer. Platform fees take about **10% to 15%** of each sale, and the sources disagree on the exact rate. One guide shows that a **30% price rise becomes about 4% profit** after fees and shipping ([Underpriced](https://www.underpriced.app/blog/where-to-sell-pokemon-cards)). Bots work at scale. In 2025, a scalper group claimed more than **42,000 Phantasmal Flames items** from Pokemon Center after a site error. Pokemon Center cancelled the orders ([PC Gamer](https://www.pcgamer.com/games/card-games/let-the-criers-cry-42-000-pokemon-tcg-phantasmal-flames-products-have-been-swiped-by-a-scalper-group-thanks-to-a-massive-error-on-the-pokemon-center)).

Hyped products follow a clear price cycle. The Prismatic Evolutions ETB fell **29%** during the 2025 restock window, from $135.79 to $95.90. It then rose to $212.83 in March 2026 and fell to $140.40 by September 2026 ([TCGinvest](https://tcginvest.io/blog/pokemon-reprints-2026)). The Destined Rivals ETB sold for $349.99 in presale, fell to $80.99 by June 2025, peaked at $224.95, and was $116.18 in September 2026 ([TCGinvest](https://tcginvest.io/blog/pokemon-reprints-2026)). After the holidays, prices historically fall another 15% to 25% when gift recipients sell ([PokemonPriceTracker](https://www.pokemonpricetracker.com/blog/posts/pokemon-card-bubble-2026-market-crash-or-correction)). Old reprinted products stayed flat for about three years and then climbed. The Hidden Fates ETB went from $137 to $186 (2022 to 2024) to $564.69 in 2026 ([TCGinvest](https://tcginvest.io/blog/pokemon-reprints-2026)).

The 30th Celebration launch in September 2026 is the clearest flipper loss. One flipper said that they bought more than 2,000 units. Another used the full limit of three credit cards and could not sell at a profit. Special illustration rare singles fell 40% to 50% after a large first wave. Fans called the flippers "parasites", and the flippers called themselves "secondary distributors". ICv2 notes that some of these posts can be satire ([ICv2](https://icv2.com/articles/news/view/63449/pokmon-tcg-flippers-melt-down-discord-wave-schadenfreude-washes-over-some-fans)). The US has no law against card scalping. A change.org petition asks for one, but no source shows a bill in Congress ([change.org](https://www.change.org/p/enact-the-trading-card-fair-access-and-anti-scalping-act-of-2026)).

**Source conflict on print volume.** ComicBook.com lists TPCi print figures of 52.9 billion (2023), 64.8 billion (2024), 75 billion (2025), and 85 billion (2026). It presents them as yearly prints ([ComicBook.com](https://comicbook.com/gaming/news/new-report-confirms-pokemon-tcg-massively-increased-production-in-2026-but-its-still-not-enough/)). TCGinvest also reads 85 billion as one year of production ([TCGinvest](https://tcginvest.io/blog/pokemon-reprints-2026)). PokeBeach says that 64.8 billion is the total of all cards ever printed ([PokeBeach](https://pokebeach.com/2025/05/tpci-dramatically-increases-tcg-vending-machines-across-the-united-states)). **This report uses the PokeBeach reading**: the figures are cumulative totals, so TPCi adds about 10 billion new cards each year. For the game, this means that supply grows steadily but does not flood the market each year.

### What the game already has

No NPC flipper, scalper, or rival buyer exists in the code. A code search for rival terms finds only the show visitor `VisitorType.flipper`, the "rival vendor" story text, and the rival game shop message ([current_game_systems.md, Q4](/Users/ajholloway/personal/PokeVendor/research_notes/Sealed%20product%20and%20flipper%20play/current_game_systems.md)). D/02 names "other flippers undercutting your prices" as a risk, but no mechanic is behind it ([D/02 L17-45](/Users/ajholloway/personal/PokeVendor/docs/02-playstyles.md)). The moving market already has booms, corrections, `sealedHype` and `characterSellOut` news, print runs, and seasons. A reprint wave reaches shelves 7 to 21 days after the news, and a reprinted product falls 15% to 35% ([D/05 L182-223](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)). After the holidays, sealed falls up to 10% ([D/05 L225-264](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)). The demand limit lowers the sale chance after recent sales on a channel ([Demand.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Demand.swift)).

### Proposals

**2.1 Add one market-wide "flipper pressure" value from 0.1 to 0.9.** Put it in a new `Model/Flippers.swift` with a `flippersEndDay()` hook, which follows the pattern of every other system. A single value is easier to read on a phone than a crowd of NPCs. The research also says that a full social simulation is not practical ([Gossamer, CoG 2023](https://mkremins.github.io/publications/Gossamer_CoG2023.pdf)). Start a run at 0.5, which matches the high pressure of 2025 and 2026. The inputs below reuse events that the game already makes.

| Input | Change to pressure |
|---|---|
| `sealedHype` or `characterSellOut` news | +0.15 once |
| Boom regime | +0.002 each day |
| Holiday season (mid October to December) | +0.10 once |
| A reprint wave reaches shelves | −0.25 once |
| Correction regime | −0.003 each day |
| Post-holiday period starts | −0.10 once |

Pressure drives four effects. It sets the shelf drain in proposal 1.1. It multiplies the camp success by `1.2 − 0.6 × pressure`. It lowers the online sale chance of hot in-print sealed by up to 20% at 0.9, because flippers list the same product. Put that effect in `Demand.swift`. It also scales the drop from a reprint, as proposal 2.2 explains.

**2.2 Add a "flipper dump" when a reprint or correction meets high pressure.** The trigger is a reprint wave that reaches shelves, or a correction that starts, while pressure is 0.6 or more. Hot in-print products of that set then fall an extra 10% to 20% over 14 to 28 days. Then the existing 120-day pull brings them back. Cap the total drop from the reprint and the dump together at 45%, so that the two do not stack past the real range. The real anchors are the 29% Prismatic fall and the 40% to 50% fall of 30th Celebration singles. Report the event in the day report as a market news line, for example "Flippers are dumping Prismatic Evolutions stock."

**2.3 Add two or three named rival flippers.** Show them in camp lines and on store runs. When a hot shelf is empty, use a line such as "Already gone. A flipper with three carts got here first." Give each rival a short memory of the last three meetings with the player, in the style of the Nemesis system ([Game Informer](https://www.gameinformer.com/b/news/archive/2015/01/20/shadow-of-mordor-s-nemesis-system-was-once-a-bit-more-complicated.aspx)). A rival who loses to the player can post a callout later (area 6). At a show, a rival can take a nearby table and list the same sealed product at 5% below the player. This gives the D/02 risk a mechanic.

**2.4 Track a hidden "scalper heat" value for the player.** Add 1 for each hot buy at the full limit at a big store. Add 2 for a same-day repeat visit. Add 3 for each checkout bot use. Reduce it by 5% each day. At 10 heat at one store, the staff refuse card sales to the player at that store for 7 days. No source confirms a store ban of a named reseller, so this is a design choice. The nearest real precedent is the permanent GameStop ban for customers who weigh packs ([Kotaku](https://kotaku.com/pokemon-scalpers-tcg-gamestop-weigh-scale-lifetime-ban-2000646859)). Scalper heat also raises the chance of a "greed" callout in area 6.

**2.5 Add a flip-margin line to the expected value readout.** The EV readout upgrade ($120) already shows the value of opening each sealed item ([D/09 L55](/Users/ajholloway/personal/PokeVendor/docs/09-upgrades.md)). Add one line that shows the market price minus the price paid minus the platform fee. current_game_systems.md does not report a platform fee on sealed sales. Check D/15 before you add a fee. If the game has no fee, add one near 13% for eBay and TCGplayer sealed sales. That fee is what makes a small price rise unprofitable.

**2.6 Offer a checkout bot as a dark upgrade.** The bot raises the Pokemon Center attempt from 30% to 60% and allows two Target.com attempts. It raises the cancellation roll from 5% to 35%, and it adds 3 scalper heat for each use. The drop-alert Discord ($60) and the restock alert bot stay as the clean options.

## A case is a product with its own price, not six loose boxes

### The real market

Distributor solicitations give fixed case counts for the 2025 to 2027 releases ([PHD Delta Reign](https://www.phdgames.com/2026/08/20/pokemon-tcg-mega-evolution-delta-reign/); [PHD Pitch Black](https://www.phdgames.com/2026/05/01/pokemon-tcg-mega-evolution-pitch-black/); [PHD 30th Celebration](https://www.phdgames.com/2026/07/10/pokemon-tcg-30th-celebration/)).

| Product | Units per case | Case MSRP |
|---|---|---|
| Booster display (booster box) | 6 boxes of 36 packs | $969.84 ($161.64 a box) |
| Elite Trainer Box | 10 | $499.90 |
| Booster bundle | 25 | $673.50 |
| Sleeved booster | 144 packs | $646.56 |
| 3-pack blister | 24 | $335.76 |
| Build & Battle display | 10 kits (6 displays per case) | $219.90 per display |
| Ultra-Premium Collection | 4 | $708.84 |
| Most collections and tins | 6 | varies |
| Mini tin display | 10 tins (4 displays per case) | $99.90 per display |

These numbers confirm the game's MSRP estimates for a pack ($4.49), a bundle ($26.94), and a booster box ($161.64). ETB MSRP varies from $49.99 to $59.99 by set ([Ripster: Target](https://www.ripster.gg/blog/when-does-target-restock-pokemon-cards)). Distributor prices are not public. One commercial guide says that authorized distributors sell at **40% to 55% below MSRP** ([Digital Media Vending](https://www.digitalmediavending.com/pokemon-card-wholesale-sourcing-distributor-guide)). That guide sells to vending operators and has a reason to show good margins.

A case trades as its own product with its own price. On 2026-11-20, a booster box case traded at **0.93 to 1.18 times** the price of six single boxes (median about 1.0). An ETB case traded at **1.03 to 1.30 times** ten single ETBs (median about 1.13). A bundle case traded at 0.84 to 1.26 times 25 bundles. The premium grows as a set ages and when demand is high ([tcgcsv archive](https://tcgcsv.com/tcgplayer/3/groups)). Against MSRP, a new booster box case traded at 1.03 to 1.12 times. A hot 2025 set traded at 2 to 2.5 times. An ETB case more than three years old traded at about 7 times ([tcgcsv Delta Reign](https://tcgcsv.com/tcgplayer/3/24831/prices); [tcgcsv Crown Zenith](https://tcgcsv.com/tcgplayer/3/17688/prices)).

"Case fresh" is a seller claim that no one searched the boxes. It is a trust signal, and no study shows that case-fresh boxes pull better. No reliable data shows guaranteed hits per English Pokemon case. One source says that pack mapping happened once in Pokemon and was fixed ([Grail Bible](https://grailbible.com/the-truth-about-rare-cards/)). Resealed cases are the main case scam. A 2022 "1st Edition Base Set" case sold for $3.5 million, and its boxes held resealed G.I. Joe packs ([CGM](https://www.cgmagonline.com/news/logan-paul-fake-pokemon-cards-2022)). Reseal signs include tape under the shrink and a second seam, but no single check is proof ([Pushas](https://pushas.com/en-us/blogs/editorial/how-to-tell-if-a-pokemon-booster-box-is-resealed)).

### What the game already has

The code sets the case sizes at 6 booster boxes, 10 ETBs, 12 bundles, and 36 packs ([Wholesale.swift L45](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift)). The distributor offers 8 in-print products each week. A case arrives as loose units: `advanceSealed` writes one report line for each product, not for each box ([GameStore.swift L1218-1224](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)). Case splits cover only booster boxes and ETBs, at 85% of market per box ([D/19 L362](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)). The folding cart carries 30 sealed spaces instead of 8 ([D/09 L60, L85](/Users/ajholloway/personal/PokeVendor/docs/09-upgrades.md)). The own store holds 40 sealed items, and the sealed wall adds 60 ([D/22 L126, L223](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)). Wholesale and case splits carry no fake risk ([D/14 L35-38](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)). No item type represents an unopened case.

### Proposals

**3.1 Correct the case counts.** Change the bundle case from 12 to 25. Replace the 36-pack case with a 144-pack sleeved booster case. Add the other real counts: 3-pack blister 24, Build & Battle display 10, mini tin display 10, Ultra-Premium Collection 4, collections and tins 6.

**3.2 Make an unopened case an item that the player owns.** Add a unit count to `SealedItem`, for example `caseOf: Int?`, or add a small `SealedCase` type. Price the case from the real tcgcsv case price when the price refresh has one. The tcgcsv archive lists case SKUs as their own products ([tcgcsv Delta Reign products](https://tcgcsv.com/tcgplayer/3/24831/products)), so the existing `pull.py` pipeline can fetch them. When no real price exists, use `units × unit market × case factor`. A real price always wins over the factor. "Open the case" is a free action. It gives N sealed units with source "Case", and each unit costs the case price divided by N. The units stay sealed, and the case loses its case premium.

**3.3 Use a case factor table built from the 2026 ratios.**

| Case type | In print | Out of print, under 2 years | Out of print 2 years or more, or older era |
|---|---|---|---|
| Booster box case | 0.95 | 1.05 | 1.15 |
| ETB case | 1.05 | 1.15 | 1.25 |
| Booster bundle case | 0.95 | 1.05 | 1.10 |
| Other cases | 1.00 | 1.05 | 1.10 |

The out-of-print timer already exists in `PrintRuns.swift`, so the factor can read it directly.

**3.4 Tag units from a trusted case as "case fresh".** A case from the distributor or a case split already carries zero fake risk. Keep that zero for every unit that comes out of it, and show a "case fresh" tag. No data shows a price premium for case-fresh boxes. Give the tag a small sale-chance bonus with sealed collectors, for example +5%, and mark it as a design value.

**3.5 Add case sources outside the distributor, with reseal risk.** At a show, the sealed dealer (12 to 18 sealed items) carries one case 20% of the time. eBay and Facebook show a case listing on about 1 day in 10. A case from a stranger rolls the existing `Counterfeit.roll` once for the whole case, and a fake result means a resealed case. Add a free "check the tape and label" action that halves the fake chance. The check never removes the risk, because the research says that no outside check is proof.

**3.6 Count case space by its units, and add a back room.** A booster box case uses 6 sealed spaces and an ETB case uses 10, so the folding cart carries 3 ETB cases. For the own store, add a back room upgrade that stores cases without using shelf space. The shelf then shows only opened units.

**3.7 Keep every pack an independent draw.** Do not give guaranteed hits per case, because no data supports them. A "loaded case" rumor can appear in market news as flavor, but it must never be true.

## The distributor rewards a storefront and tenure; the plug charges for risk

### The real market

Most lists name GTS Distribution, Southern Hobby, PHD, Alliance, and ACD as the main US hobby distributors of Pokemon ([tcgsupplierlist.com](https://tcgsupplierlist.com/pokemon-wholesale-suppliers)). That list comes from a commercial directory. No current official TPCi list exists in the sources. Both large distributors require a state resale certificate and sales tax documents ([GTS](https://www.gtsdistribution.com/info/open-a-gts-business-account.asp)). Southern Hobby accepts only brick-and-mortar stores in 2026. It asks for a photo of the storefront with signage and rejects online-only stores and kiosks. Review of an application takes up to 10 business days ([Southern Hobby](https://www.southernhobby.com/new_account.php)). Commercial guides give a first order of $250 to $2,500 and volume tiers at about $500, $1,000, and $5,000 a month ([Digital Media Vending](https://www.digitalmediavending.com/pokemon-card-wholesale-sourcing-distributor-guide)).

Distributors, not stores, decide how much hot product a store gets. In the Prismatic Evolutions shortage, the average US store got **less than 10% to 15%** of its request. A store that asked for 100 ETBs got 15. A Maryland store owner said that distributors still gave "loyal Pokemon stores a higher percentage of the supply" ([PokeBeach](https://www.pokebeach.com/2025/01/prismatic-evolutions-allocations-severely-cut-to-local-stores-demand-higher-than-supply)). Unofficial estimates put 2026 fill rates at **30% to 50%** ([Samurai Sword Tokyo](https://samuraiswordtokyo.com/blogs/news/why-japanese-pokemon-boxes-sell-out-scalpers-allocation)). A 2026 lawsuit alleges that one distributor, Gold River Distributors, ran a "milestone-driven" allocation network. The plaintiff alleges that he spent $39,560 in about one year to meet milestones. He alleges that an executive said "I'm going to have our people shut down your account" after he complained. He also alleges that the distributor sold withheld stock on its own marketplace. These are allegations, not findings ([Ford County Chronicle](https://www.fordcountychronicle.com/articles/local/supplier-of-pokemon-merchandise-for-card-shop-suing-wholesale-distributor/)).

A gray tier of wholesalers exists below the authorized distributors. Tier-2 wholesalers buy allocation from tier 1, break cases, and often need no application. One commercial guide says that **each layer adds 5% to 15%** to the price ([tcgsupplierlist.com](https://tcgsupplierlist.com/pokemon-wholesale-suppliers)). No source found a US court record of a "distro plug" prepayment scam. The documented risks are nearby. Singapore police reported at least 477 Pokemon card scam cases with losses of at least $958,000, where buyers paid and got nothing ([Bitdefender](https://www.bitdefender.com/en-us/blog/hotforsecurity/pokemon-card-scams-2026)). A Taipei card shop closed overnight, and customers suspect that the owner took up to NT$300 million ([Taipei Times](https://www.taipeitimes.com/News/taiwan/archives/2026/08/03/2003861871)). Police allege that a Wisconsin man posed as a delivery driver and stole 125 packages of 30th anniversary boosters from Walmart ([WMTV 15](https://wmtv15news.com/2026/11/19/man-arrested-accused-posing-delivery-driver-stealing-pokmon-packs-dodgeville-walmart)). eBay removed early 30th Celebration listings under its stolen property policy at TPCi's request ([Resell Calendar](https://resellcalendar.com/news/news/pokemon-tcg-reseller-rules-banned-30th-celebration/)). TPCi has no public US rule against selling above MSRP ([Fact Crescendo](https://english.factcrescendo.com/2026/09/02/pokemon-did-not-ban-resale-at-unreasonable-prices-us/)). The realistic penalty for a store is lost allocation or a closed account.

### What the game already has

The distributor opens at reputation Respected, or with the player's own store from the build-out day ([D/12 L185-201](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)). With no store, the price is 72% of MSRP or 62% of market, whichever is higher. The minimum order is $250, delivery takes 5 days, and the player gets 1 case of each product and 2 cases a week. The distributor ships 12% of orders short ([WholesaleAccount.swift L50-58](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)). With a store, the price is 58% of MSRP or 50% of market, with no minimum. The weekly allocation per product is 1 case, plus 1 for each $6,000 spent, up to 5. A product that is not hot gets 1 more case ([D/22 L404-424](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)). The 58% store price falls inside the real 45% to 60% band. A lease requires the seller's permit ($50). D/26 says that the permit is "not a requirement for the card show table or for wholesale" ([D/26 L47-56](/Users/ajholloway/personal/PokeVendor/docs/26-taxes.md)). D/04 and D/12 promise Elite "priority case allocation", but the code gives no Elite effect on allocation ([current_game_systems.md, Q1 Gaps](/Users/ajholloway/personal/PokeVendor/research_notes/Sealed%20product%20and%20flipper%20play/current_game_systems.md)).

### Proposals

**4.1 Name the two legitimate tiers for what they are.** Call the no-store route a "secondary wholesaler". It keeps its prices and limits, and it matches the real tier-2 layer, which needs no application. Call the store route a "hobby distributor account". Extend `DistributorAccount`. Do not add a second distributor model.

**4.2 Require an application for the hobby distributor account.** The account needs a signed lease, a finished build-out, and the $50 seller's permit. Review takes 14 game days after the player applies. Change the D/26 line so that the permit is required for this tier. This change delays the account by two weeks compared with the current build, so the designer must approve it.

**4.3 Add a distributor rep as a contact with a 0 to 100 relationship.** Add `distributorRep` to `ContactKind` ([Relationships.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Relationships.swift)). The relationship rises by 1 for each $1,000 spent, up to 3 a week. It rises by 1 for each week that the own store runs its Friday tournament or League. Event hosting keeps a store in good standing with the channel. A "push for more allocation" message option costs 5 points, which reflects the alleged GRD response to a complaint.

**4.4 Apply a fill rate to hot product.** For a hot product, each requested case arrives with a chance equal to the fill rate. Use `fill = 0.15 + 0.35 × (1 − pressure) + 0.2 × (rep relationship ÷ 100)`, capped at 0.9. At high pressure and a new account, the fill is near the real 10% to 15%. A normal hot product with a loyal account gets 30% to 50% or more. Products that are not hot keep the full allocation and the existing +1 case.

**4.5 Give Elite reputation its promised priority.** At Elite, add one hot case each week that ignores the fill roll. This change closes the gap between D/04, D/12, and the code.

**4.6 Detect back-door sales of hot allocation.** Track the hot cases that the account delivers and the share of their units that the own store shelf sells within 21 days. If the shelf share is under 40%, each week has a 15% chance that the rep notices. A notice costs 15 relationship points and sends a warning message. Two warnings within 12 weeks set hot allocation to zero for 4 weeks. A third warning closes the account for 12 weeks, and the player falls back to the secondary wholesaler. No public case shows a distributor that cut off a store for sales to flippers, so these are design values. The GRD allegations show only that a distributor can close an account.

**4.7 Add a gray "plug" contact for players without an account.** The plug arrives through a message at follower tier 1 or reputation Known. It sells only full cases of hot in-print products that already exist, so it is not a preorder. The table gives starting values. They are design values, because no source gives real plug terms or failure rates.

| Term | Starting value |
|---|---|
| Price | 85% of MSRP or 65% of market, whichever is higher |
| Payment | 100% prepaid from the cash balance |
| Delivery | 5 to 10 days |
| No delivery (the plug vanishes) | 6%, plus 1% for each $1,000 of the order above $2,000, up to 16% |
| Short shipment | 10% |
| Resealed or fake units | Roll `Counterfeit.roll` with a new source "Plug" at 4% |
| Stock seized as stolen | 2%; the units are removed after arrival with no refund |
| Trust | Each clean order lowers the vanish chance by 1 point, to a floor of 3% |

The size-based vanish chance follows the real pattern, where a seller disappears with a large prepayment. A clean history lowers the risk, but a very large order stays dangerous.

**4.8 Set the consequences of the gray channel.** A sold fake from the plug uses the existing path: reputation −40 and a scam accusation ([D/19 L334](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)). Seized stock sends a message that police asked about the product. A player can have a hobby account and also buy from a plug. Then each week has a 10% chance that the rep learns of it, which costs 20 relationship points. Plug orders come with no invoice, so the income tax step must not count them as a cost. This last rule follows general tax logic. No Pokemon-specific source supports it. Do not add criminal charges for buying from a plug, because the real criminal cases come from counterfeits, theft, and fraud.

## Rip & Ship sells one whole product to one buyer, and nothing else

### The rule

**Rip & Ship in PokeVendor means this: one buyer buys one whole manufacturer-sealed product. The player opens it on stream. Every card goes to that one buyer.** The product can be a pack, a box, or a full case. No product is ever split among buyers. The game sells no spots, no teams, and no random assignment. It has no wheels, no pull boxes, no prizes that depend on the result, and no "rip until you hit" sale to viewers. This rule keeps Rip & Ship apart from the rejected group break.

### The real market

Whatnot draws the same line. It defines a card break as a sale where "the contents of sealed product(s) are split among multiple buyers". It exempts the sale of an entire sealed product opened for one person, which it calls "personals" or "rip-and-ship". The visibility rule still applies: the product must stay on screen from the sale to the end of the opening ([Whatnot Card Breaks Policy](https://help.whatnot.com/hc/en-us/articles/34107485220237-Card-Breaks-Policy)). TikTok Shop US banned eight break formats and all spins on 2026-06-25, but it still permits a "Personal Break" ([PPC Land](https://ppc.land/tiktok-shop-kills-8-break-formats-and-bans-lucky-spins-under-gambling-rules/)). eBay limited repacks to pre-approved sellers from 2026-06-15 ([Value Added Resource](https://www.valueaddedresource.net/ebay-trading-card-repack-rules-live/)). Each platform tightened random formats from 2025 to 2026, and plain rip and ship survived each change.

Whatnot charges US trading card sellers **8% commission** at the standard tier, which covers sales under $15,000 per 4 weeks. The rate falls to 6.5% at $500,000 and up. Processing is **2.9% + $0.30** on the full amount that the buyer pays, shipping included. eBay Live charges 6% + 2.9% + $0.30. USPS Ground Advantage up to 4 oz costs about $4.47. Whatnot sellers must ship within two business days ([Underpriced](https://www.underpriced.app/blog/selling-pokemon-cards-on-whatnot-guide-2026); [eBay Live](https://www.ebay.com/ebaylive/seller-pricing)). The same guide uses $0.50 for supplies in its floor-price example. No source gives the typical rip-and-ship price compared with the market price of a pack. The audience is large. More than 10 million Pokemon cards sold on Whatnot in September 2026, and the top Pokemon sellers have about 640,000 followers ([The Toy Book](https://toybook.com/whatnot-2027-consumer-trends-report-news/); [viewfromalove](https://viewfromalove.com/blog/most-followed-whatnot-sellers/)).

The scandals that reach the press have two shapes: a seller who does not ship, or a seller caught on camera with tampered product. In August 2023, Whatnot permanently removed the "Blakes Breaks" account of a former NFL player. Customers had alleged unshipped orders and other wrongdoing. Whatnot said that all affected buyers got refunds ([CBS Sports](https://www.cbssports.com/nfl/news/former-giants-linebacker-blake-martinez-banned-from-online-marketplace-after-alleged-pokemon-scam/)). In 2025, viewers accused a father-and-son Whatnot host of selling resealed packs after one pack showed two identical reverse holos ([Dexerto](https://www.dexerto.com/gaming/dad-caught-teaching-son-to-scam-pokemon-fans-with-resealed-packs-3246738/)). Whatnot reported that shill bidding fell nearly 80% over six months in 2026 after enforcement ([Value Added Resource](https://www.valueaddedresource.net/whatnot-shill-bidding-report/)).

### What the game already has

A live stream is a time-cost action of 2 or 3 hours. Its actions are rip (Normal or Fast only), give away, auction a card, Buy Now, show a card, and talk to chat. Whatnot opens at follower tier 1 ([D/06 L43-72](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)). A stream rips only the player's own pre-selected product. No action rips a product that a viewer bought ([D/06 L45-51](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)). A slow shipment already causes a scam accusation ([D/06 L105-117](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)). `SealedItem` assumes that the player owns it, so a sold-but-unopened product needs a new field ([Inventory.swift L561-597](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Inventory.swift)).

### Proposals

**5.1 Add a "Rip & Ship" stream action.** Before the stream, the player marks sealed items "For Rip & Ship". During the stream, a viewer buys one whole item at a Buy Now price or through the existing Whatnot auction. Add `soldToViewer` to `ItemStatus` and a buyer name to `SealedItem`. The player rips the item at Normal or Fast speed. The pulled cards go to a ship queue, not to the player's inventory.

**5.2 Charge the real fees.** Net income is `sale − 8% of sale − 2.9% of (sale + $4.47) − $0.30 − $0.50 supplies − cost of the product`. Drop the commission in steps to 6.5% as the player's 4-week Rip & Ship sales grow. The sources give only the 8% and 6.5% end points, so the middle steps are design values. Every dollar goes to the one cash balance.

**5.3 Set the buyer price band.** At Buy Now, viewers accept 95% to 120% of market for hot products and 90% to 105% for others. No source gives real markups, so these are design values. Viewer count comes from the existing stream model.

**5.4 Add a ship deadline to End Day.** Each Rip & Ship order must ship within 2 days. Shipping is a free action that takes 10 minutes for each order. From day 3, each unshipped order has a 20% chance each day to cause a scam accusation through the existing path. A shipped order raises the buyer's relationship as a regular buyer contact.

**5.5 Turn a big hit into a clip, not a card.** When a viewer's product gives a big hit, the player gets the existing pull-reveal reach and follower gain, but the card belongs to the viewer. This split is the core trade of Rip & Ship: the player earns a fee and followers, and the viewer takes the card risk.

**5.6 Offer an optional integrity choice.** When a big hit lands, the player can "palm the hit" and swap it off camera. The swap is a scam. On camera, the find-out chance is 50%. A find-out costs reputation −40, bans the player from Whatnot streams for 8 weeks, and starts a callout at heat 90. The Blakes Breaks ban is the real precedent for a platform ban. The designer can drop this choice and keep Rip & Ship clean.

**5.7 Permit a whole-case Rip & Ship for one buyer.** One buyer can buy a full case, and the player opens the whole case on stream. This links Rip & Ship to the case item in area 3, and it stays inside the one-buyer rule.

## Callouts carry heat, a hidden truth, and four replies

### The real market

Pokemon callouts fall into five kinds. The kinds are product integrity, fairness in live openings, treatment of kids, greed, and forbidden product such as pre-release stock. Examples are alleged resealed packs on Whatnot ([Dexerto](https://www.dexerto.com/gaming/dad-caught-teaching-son-to-scam-pokemon-fans-with-resealed-packs-3246738/)), a trade with a child at an event ([Dexerto](https://www.dexerto.com/pokemon/pokemon-xp-trader-denies-stealing-boys-legendary-after-viral-claims-3404156/)), price complaints against Target's online store ([Kotaku](https://kotaku.com/pokemon-tcg-where-target-stock-prices-gouging-scalpers-2000711454)), and pre-release product on video ([Kotaku](https://kotaku.com/roush-pokemon-tcg-30th-celebration-set-stolen-cards-ultimate-premium-2000735067)). A callout usually starts on X, TikTok, or Reddit. It then gets long-form treatment on YouTube and reaches gaming news. One YouTube creator made an eight-part series on the Blakes Breaks allegations in 2023 ([Nintendo Life](https://www.nintendolife.com/news/2023/08/report-ex-nfl-player-blake-martinez-banned-from-reselling-pokemon-cards-on-whatnot)). Collector forums keep "busted" threads that work as informal blacklists after the wave fades ([Elite Fourum](https://www.elitefourum.com/t/cautious-with-seller-resealed-packs/27000)).

The life cycle is accusation, receipts, pile-on, response, and fade. The response decides how fast the story ends. At Pokemon XP in 2025, a parent posted on X that a trader took his son's PSA 9 card. The trader denied it but reversed the trade within days, and the story ended. The trader said that he got no apology ([Dexerto](https://www.dexerto.com/pokemon/pokemon-xp-trader-denies-stealing-boys-legendary-after-viral-claims-3404156/)). In 2026, a creator with about 1.4 million Instagram followers opened pre-release 30th Celebration product. She deleted the video and did not apologize, and the criticism continued ([Kotaku](https://kotaku.com/roush-pokemon-tcg-30th-celebration-set-stolen-cards-ultimate-premium-2000735067)). False callouts also happen. In 2025, fans accused a TCG Pocket illustrator of tracing, and The Pokemon Company later cleared the artist and took the blame ([GamesRadar](https://www.gamesradar.com/games/pokemon/the-pokemon-company-begs-tcg-pocket-fans-not-to-blame-artist-behind-plagiarized-ho-oh-takes-full-responsibility-after-removing-it)). Formal penalties are rare. They come mostly from platforms, such as the Whatnot ban and eBay listing removals.

Kindness is also content. A vendor's clip of a free card for a girl at a card show reached **more than 17.8 million TikTok views**. Vendors say that they post these moments on purpose to answer the scalper image ([Kotaku](https://kotaku.com/pokemon-card-tcg-vendor-scalper-reseller-stream-shows-2000630658)). Other games give tested patterns. Crusader Kings III uses hidden secrets that can come out ([Paradox dev diary 5](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-5-schemes-secrets-and-hooks.1289167)). Football Manager uses press answers that change public image ([FM Scout](https://www.fmscout.com/a-morale-and-relationships-in-football-manager.html)). One AIIDE paper changes reputation only from acts that witnesses see ([AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/download/12950/12798)).

### What the game already has

Deal stories already exist. A generous or hard table deal can make a story 1 to 10 days later. A bad story costs −4 reputation, and a viral bad story costs −12 reputation, −1% followers, and −0.1 authenticity ([D/30 L129-156](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)). From reputation tier 2, a random story has a 3% weekly chance: "A rival vendor is telling people that your prices are inflated." It costs −3 and is never viral ([Haggling.swift L174](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Haggling.swift)). Scam accusations, overhype backlash, and the "this is just gambling" backlash on shorts also exist ([D/06 L105-117](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md); [D/32 L119-121](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)). D/30 lists "Answer a bad story with a post" as not done, because "It needs a new post type in the social system" ([D/30 L274-280](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)). D/32 lists "Pack battles against another creator" as out of scope. No rival creator exists.

### Proposals

**6.1 Add a callout object.** Put it in a new `Model/Callouts.swift` with a `calloutsEndDay()` hook. Each callout holds an accuser, a type from the five real kinds, and a start day. It also holds a hidden truth flag, a heat value from 0 to 100, and a receipts flag. Show open callouts in the social inbox with a heat bar and one line that explains why the heat moved. Players complain when a score moves for no clear reason, so the reason line matters ([Steam discussion](https://steamcommunity.com/app/239820/discussions/0/3269058337189255198)).

**6.2 Make true callouts come from the player's own hidden acts.** Each shady act becomes a "secret" with a daily discovery chance. The existing `ScamRecord` already works this way: a scam is found out 35% of the time in 3 to 20 days ([D/21 L224-229](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)). Add five new secrets. They are a late Rip & Ship shipment, a palmed hit, scalper heat of 10 or more, a back-door sale of hot allocation, and seized plug stock. Raise the discovery chance with the number of witnesses, for example a large show or a stream with many viewers.

**6.3 Make false callouts come from named rivals.** Extend the existing 3% weekly "rival vendor" story into a callout from a named rival. The rival is a rival flipper (area 2), a drama creator, or a rival game shop. The two rival game shops already turn cold when the player signs a lease ([D/22 L101-118](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)). Make 60% of rival callouts false. Each rival remembers the last three meetings, and a rival who lost a deal or a shelf to the player posts more often.

**6.4 Set the starting heat by type, and let it decay.**

| Type | Starting heat |
|---|---|
| Treatment of kids | 70 |
| Product integrity | 60 |
| Fairness in live openings | 60 |
| Greed (scalping, price gouging) | 40 |
| Forbidden product (stolen plug stock) | 50 |

Heat falls by 15% each day. Each reply from either side adds 20. The kid value is highest because the real kid case spread fastest and drew public gifts for the child.

**6.5 Add the missing response post type.** This post type fills the D/30 gap. The player picks one of four replies, which match the four real response patterns.

| Reply | True callout | False callout |
|---|---|---|
| Stay silent | Heat decays at the normal rate | Heat decays at the normal rate |
| Deny | Heat ×1.5; a 50% find-out roll on the receipts adds −8 reputation | Heat falls to 0 in 2 days; +3 reputation; the rival loses credibility |
| Make it right (refund or reverse) | Pay the refund; heat falls to 0 in 1 day; half the reputation loss | Pay the refund; heat falls to 0; no reputation change |
| Counter-callout | Both sides gain 30 heat; +2% followers; −0.05 authenticity | Same as true, but the rival takes the larger loss |

"Make it right" is the expensive and fast reply, as in the Pokemon XP case. "Deny" works only when the callout is false.

**6.6 Map the end of a callout to the existing story costs.** When a callout fades, a peak heat of 70 or more uses the viral bad story values (−12 reputation, −1% followers, −0.1 authenticity). A peak heat of 30 to 69 uses the bad story value (−4). A true product-integrity callout that peaks at 80 or more also bans the player from Whatnot streams for 4 to 8 weeks. Callouts never change any real graded price.

**6.7 Leave a permanent record after a serious true callout.** A true callout that peaks at 50 or more leaves a record. For 90 days, each new contact starts 5 relationship points lower. This follows the role of forum threads, which keep a callout findable after the wave fades.

**6.8 Let the player call out a rival.** The player can post a callout about a rival. With receipts, for example a fake bought from that rival, a true callout gives +3 reputation and a follower gain. Without receipts, the post is a false callout, and the heat lands on the player.

**6.9 Add a "give a kid a card" table action.** At a show or meet, the player can give a low-value card to a young visitor. The action has a 25% chance to make a good deal story. It has a 5% chance to make a viral good story (+10 reputation, +2% followers), which reuses the D/30 values. This action gives the player a visible way to earn back goodwill.

## More mechanics that the notes support

The notes support several smaller additions. Each one extends an existing system. The table gives the real basis and a starting value.

| Mechanic | Real basis | Existing hook | Starting value |
|---|---|---|---|
| Shows that ban in-print sealed | A Maryland card show banned "all sealed product that is currently for sale at retail" in April 2026 ([ComicBook.com](https://comicbook.com/collectibles/news/pokemon-card-show-strikes-back-at-scalpers-with-long-awaited-ban/)) | Card shows ([D/20](/Users/ajholloway/personal/PokeVendor/docs/20-card-shows.md)) | 1 show in 6 carries the rule; the player must bring singles, slabs, or out-of-print sealed |
| Opened-at-MSRP offer | A retailer removed the wrap and cut pack corners to sell at MSRP ([Dexerto](https://dexerto.com/pokemon/pokemon-retailer-takes-drastic-measures-to-combat-prismatic-evolutions-scalpers-3029143)) | Game shop standing and ripping ([D/12 L129-158](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [D/18](/Users/ajholloway/personal/PokeVendor/docs/18-ripping.md)) | At Regular, a game shop sells one hot item at MSRP if the player rips it in the shop |
| Official card vending machines as a source | TPCi listed 1,473 machines in 25 states in May 2025 and added purchase limits ([PokeBeach](https://pokebeach.com/2025/05/tpci-dramatically-increases-tcg-vending-machines-across-the-united-states)) | Camping ([Camping.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Camping.swift)) | A posted machine restock with a limit of 2; camp time 2 hours |
| Missing distributor shipment | A Delaware shop lost "several pallets" of 30th Celebration product when a subcontracted truck vanished ([Wargamer](https://www.wargamer.com/pokemon-trading-card-game/30th-celebration-van-heist)) | Wholesale short shipments ([WholesaleAccount.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)) | 1% of orders do not arrive; refund after 14 days |
| Store break-in scaled by stored value | Thieves took about $50,000 from a Tacoma card shop ([Attack of the Fanboy](https://attackofthefanboy.com/news/thieves-rammed-a-pickup-through-a-tacoma-card-shops-doors-filled-the-truck-bed-with-pokemon-and-magic-cards-and-were-gone-in-minutes/)) | Theft and insurance ([D/24](/Users/ajholloway/personal/PokeVendor/docs/24-theft-and-insurance.md)) | Break-in chance rises with the sealed value in the store; cases make this value large |
| MSRP step | The US pack MSRP rose from $3.99 to $4.49 ([Kotaku](https://kotaku.com/gamestop-pokemon-tcg-prices-booster-box-etb-perfect-order-2000681798)) | Market news ([PriceCycle.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift)) | At most once per run, in-print MSRP rises 12.5%; stock bought before the step gains margin |
| Stronger post-holiday sell-off | Post-holiday prices historically fall 15% to 25% ([PokemonPriceTracker](https://www.pokemonpricetracker.com/blog/posts/pokemon-card-bubble-2026-market-crash-or-correction)) | Seasons ([Seasons.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Seasons.swift)) | Scale the existing −10% winter drop to −15% when flipper pressure is 0.6 or more |

Three ideas from the notes do not fit, and this report does not recommend them. A fast-food promo week adds new product during a run, which conflicts with the no-new-releases rule. Mystery "Lucky Box" machines that sell random graded cards draw gambling complaints ([404 Media](https://404media.co/theres-a-lootbox-with-rare-pokemon-cards-sitting-in-the-pentagon-food-court)), and they sit close to the random formats that the designer rejected. Japan's marketplace bans and facial recognition apply only to Japanese product and shops.

## Recommended build order

The phases follow the data flow. Phase 1 makes the shelf and the case real. Later phases read from them.

| Phase | Build | Main files | Why this order |
|---|---|---|---|
| 1. Shelf and case | Correct case counts (3.1); case item, case factor, open action, case fresh (3.2 to 3.4); vendor days and batches (1.1); per-chain limits and camp cap (1.2) | `Wholesale.swift`, `Inventory.swift`, `LocalStores.swift`, `Camping.swift`, `GameStore.swift` | Every later system reads limits, batches, or cases |
| 2. Flipper market | Flipper pressure (2.1); flipper dump (2.2); scalper heat (2.4); GameStop markup (1.6); strictness ladder (1.3); alert tiers (1.8); flip-margin line (2.5) | New `Flippers.swift`, `Demand.swift`, `PriceCycle.swift`, `Upgrades.swift` | Pressure drives the shelf drain from phase 1 |
| 3. Online retail | Drawing (1.4); Pokemon Center cancellation (1.5); checkout bot (2.6); club store (1.7) | `Market.swift`, `Storefront`, `LocalStores.swift` | Uses pressure and scalper heat |
| 4. Distribution | Tier names (4.1); application (4.2); distributor rep (4.3); fill rate (4.4); Elite priority (4.5); back-door check (4.6); plug (4.7, 4.8); case sources outside the distributor (3.5) | `WholesaleAccount.swift`, `Relationships.swift`, `Messages.swift`, `Counterfeits.swift` | Needs the case item and pressure |
| 5. Rip & Ship | Stream action, fees, ship queue, clips, case Rip & Ship (5.1 to 5.7) | `LiveStream.swift`, `StreamView.swift`, `Inventory.swift` | Needs the case item and makes callout secrets |
| 6. Callouts and rivals | Named rival flippers (2.3); callout object, secrets, rivals, heat, replies, record, player callouts, kid action (6.1 to 6.9) | New `Callouts.swift`, `Haggling.swift`, `Social.swift` | Reads secrets from phases 2 to 5 |
| 7. Smaller mechanics | The table in the section above | `Shows.swift`, `Vending.swift`, `Seasons.swift`, theft files | Independent; build when time permits |

After each phase, run `-test` (about 2 seconds), because every phase changes End Day, money, or items. Each new `xEndDay()` hook must not read one part of `data` inside a closure that changes another part.

## Cleanup items from current_game_systems.md

These are doc and code inconsistencies that the game-systems notes found. They are separate from the proposals above.

| Item | Location | Fix |
|---|---|---|
| D/19 says a game shop has stock on 45% of days with 1 to 3 products; D/12 and the code say 92% and 5 to 9 | [D/19 L66-67](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md) | Update D/19 to the code values |
| D/04 says a Respected player with no store has "no limit"; D/12, D/19, and the code limit that player to 1 case of each product and 2 cases a week | [D/04 L30-31](/Users/ajholloway/personal/PokeVendor/docs/04-reputation-and-followers-unlocks.md) | Update D/04 |
| The `buyWholesale` comment says "The minimum order is $500"; the constant is $250 | [Wholesale.swift L35, L83](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift) | Correct the comment |
| D/13 says the catalog has 1,836 sealed products; the file has 1,853 | [D/13 L63-65](/Users/ajholloway/personal/PokeVendor/docs/13-sets.md) | Update the count |
| D/19 "The moving market" table is stale: out of print +5% to +15%, and a card-name reprint event that commit `503ff3c` removed | [D/19 L563-570](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md) | Copy the D/05 values |
| D/21 says reputation "is designed but not built"; its status line says built | [D/21 L3, L18-20](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md) | Remove the stale sentence |
| D/19 says "Holds are not built"; D/21 says saved items at a game shop are built | [D/19 L72](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md) | Check the code, then correct one doc |
| D/12 says eBay "carries international product that the other stores do not sell"; in code it is the same English catalog with 10-day delivery and 12% off | [D/12 L34-36](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md) | Reword so that no reader takes it as Japanese product |
| D/04 and D/12 promise Elite "priority case allocation"; the code has no Elite effect on allocation | [D/12 L185-201](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md) | Build proposal 4.5, or remove the promise |
| D/12 says camping fails when "other buyers get the stock first"; no buyer is modeled, only a probability | [D/12 L83-86](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md) | Proposals 1.1 and 2.1 make the text true; until then, reword it |

## What the evidence does not settle

Several numbers in this report rest on weak sources. The 300-pack Walmart visit, the Best Buy and Barnes & Noble limits, and the Pokemon Center limits come from tracker blogs. The Walmart five-item limit is a reported memo that Walmart did not confirm in public. The 40% to 55% wholesale discount comes from one commercial guide with a reason to show good margins. No source gives real drawing odds, plug failure rates, rip-and-ship markups, or the effect of a callout on a small vendor's sales. The proposals mark each of these as a design value. Treat them as starting points for the `-marketsim` and `-test` runs, not as facts. No source reached Reddit or Discord, where most plug scams and store-owner complaints appear, so the gray-channel risks rest on non-US cases and nearby crimes.

## Conclusion

The research changes the main design question. The question is not "how scarce is product". The question is "who gets the product, and what does it cost them to take more than their share". Real scarcity in 2026 is a rationing system with many layers. The limits, the fill rates, the drawings, and the cancellation waves all decide who gets stock. Each layer becomes stricter when someone abuses it. PokeVendor already models the price side of this market well. The proposals add the rationing side. They add a limit at the shelf, a fill rate at the distributor, a risk premium at the plug, and a public record of cheating. These parts connect in one loop. Pressure empties shelves, empty shelves push the player toward bots and plugs, and those choices create the secrets that become callouts.

The case item is the base of the whole plan. It turns the distributor, the plug, the case split, the own store, and Rip & Ship into choices about one physical object. The player can hold it sealed, open it for units, sell it to one buyer on stream, or break it for the shop. The real data supports a clear split for that choice. A case earns its money from the wholesale discount and from age, not from a large "case fresh" premium. That split gives the player a real choice between a fast flip and a long hold. No part of it needs a new set, a group break, or a second wallet.
