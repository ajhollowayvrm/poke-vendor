# Current game systems: sealed product, retail buying, flipping, cases, distributors, rip-and-ship, and social media

Scope: the design docs and the Swift code of PokeVendor at commit `503ff3c` (2026-11-17). All sources are local files. Links use the repo path. `D` = `/Users/ajholloway/personal/PokeVendor/docs`, `M` = `/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model`.

## Q1. How does the player acquire product today? What stores, limits, restocks, case splits, distributors, or wholesale exist? What is open or out of scope?

### Takeaway
The game already has a full acquisition layer: five online storefronts, a store run to six local stores, camping a posted restock day, a distributor (reputation Respected or an own store), case splits (Respected), Facebook pickups, garage and estate sales, collections, messages, and opportunities. Purchase limits exist only as shelf quantity per day, one Pokemon Center attempt per day, one-per-week weekly buy-ins, and the weekly wholesale case allocation. There is no per-customer retail limit, no NPC scalper, and no rival flipper competing for retail stock.

### Cited Findings

**Online storefronts (free action)**
- Five storefronts, each with a different price, availability, and risk tradeoff: Pokemon Center, Amazon, Hyped Reseller, eBay, Facebook Marketplace. — [D/12-acquiring-product.md L13-50](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Pokemon Center: MSRP, only in timed drops. A drop stays open one day. The player gets one attempt. The attempt succeeds at 30%. A miss costs no time and no cash. A drop comes with no notice. — [D/12 L52-63](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- A drop is live on 15% of days. Drop kinds in code are only "Booster bundle", "Elite Trainer Box", "Collection", "Tin" at MSRP, with the note "Drop · one attempt". — [D/19-prototype-values.md L25](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Market.swift L121-126](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Market.swift)
- Amazon: each product is in stock on 45% of days, at 100% to 125% of market, or 140% to 190% on 30% of days. Amazon does not sell store exclusives. — [D/19 L23](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Market.swift L103-111](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Market.swift)
- Hyped Reseller: every product every day at 200% to 260% of market. It sells in-print and out-of-print product. It "does not care if an item is fake". — [D/12 L28-33](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [D/19 L24](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- eBay: 8 listings each day, 4 sealed at 80% to 105% of market, 4 singles. 20% ship from another country with 10-day delivery and a lower price. The seller rating is the one visible fake signal. — [D/19 L26](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [D/14-counterfeit-risk.md L53-61](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)
- Facebook Marketplace: 5 sealed listings each day at 55% to 95% of market. Half are pickups that cost 1 hour, half ship. Some pickups are set for a later day. — [D/19 L27](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [D/12 L37-44](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Delivery times: Pokemon Center 5 days, Amazon 2, Hyped Reseller 3, eBay 4 (10 from another country), Facebook shipped 4. Every purchase goes to Inventory. The buy flow never offers "open now". — [D/12 L275-295](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Only in-print product (Scarlet & Violet and Mega Evolution at run start) sells at Amazon, Pokemon Center, and local shelves. The Hyped Reseller, eBay, and Facebook also sell older sets. — [D/19 L50-52](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [D/05-pricing-and-market.md L186-188](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)

**Store run (time-cost)**
- Local stores: Target, Walmart, Best Buy, GameStop, Barnes & Noble, and two game shops (Cardboard Castle and Top Deck Games). Each stop costs 40 minutes. The run goes stop by stop. An empty shelf is a bust. The player learns the stock only on arrival. — [D/12 L88-108](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [D/19 L60-70](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- Big store: stock on 12% of days, 1 to 2 products at MSRP. Loose packs come 2 to 8 at a time, other products 1 to 2. Big stores carry only packs, blisters, tins, bundles, ETBs, and collections of 11 packs or fewer, in print, not club exclusives. — [M/LocalStores.swift L13, L106-121](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LocalStores.swift)
- Game shop: stock on about 92% of days, 5 to 9 products. About 80% in print at 92% to 105% of market, about 20% older out-of-print at 100% to 120%. No store exclusives. It "does not scalp". — [D/12 L161-166](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [M/LocalStores.swift L126-145](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LocalStores.swift)
- Conflict: D/19 still says "Stock chance 12% for a big store, 45% for a game shop" and "1 to 3 products at a game shop". D/12 and the code say 92% and 5 to 9. D/19 is stale. — [D/19 L66-67](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md) vs [M/LocalStores.swift L13](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LocalStores.swift)
- Purchase limit on a shelf: the shelf quantity only. `shelfBought` counts the items bought today and resets at End Day. `boughtToday` removes an online listing for the rest of the day. — [M/GameStore.swift L22-25, L782, L1139-1141](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)
- Game shop extras: "Just came in" weekly buy-ins (leans vintage, 1 in 7 underpriced at 70% to 85%), a weekly singles display case, league night, a buylist, bulk for credit, and consignment. A weekly item that the player buys stays bought for the week (`weekBought`). — [D/12 L160-183](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [M/GameStore.swift L37, L805-824](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)
- Game shop standing is 0 to 100 per shop: Stranger, Familiar, Regular (holds, consignment), Trusted (first pick on hot product), Friend (private offers). — [D/12 L129-158](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)

**Camping a restock day (time-cost event)**
- Each big store posts a restock about every 14 days, usually a weekday at 8 AM, 2 to 3 days ahead. Camping takes 6 hours. Success is 60% at the door, ×0.75 each hour late, +25% with the restock alert bot. A success gives 2 to 4 products, 2 to 6 each, at MSRP. A bust message: "It sold out before you got in." — [D/17-calendar-and-events.md L76-95](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md); [D/19 L322](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Camping.swift L22-33, L76-99](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Camping.swift)
- Doc text: camping "carries real variance: the store sells out before the player arrives, or other buyers get the stock first". The "other buyers" are only a probability. No NPC is modeled. — [D/12 L83-86](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)

**Distributor / wholesale**
- Opens at reputation tier 3 (Respected), or with the player's own store from the day the build-out is done. Priority case allocation on hot releases is listed at tier 4 (Elite). — [D/12 L185-201](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [M/Wholesale.swift L60](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift)
- No store: 72% of MSRP or 62% of market (the higher price), $250 minimum order, 5-day delivery, 1 case of each product and 2 cases a week. 12% of orders ship 60% to 90% of the boxes and refund the rest. — [D/19 L360](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Wholesale.swift L33-45](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift); [M/WholesaleAccount.swift L50-58](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)
- Store account: 58% of MSRP or 50% of market, no minimum. Weekly allocation per product: 1 case, +1 for each $6,000 spent with the distributor, up to 5. +1 case for a product that is not hot. "Hot" = market at 1.2 × MSRP or more. — [D/22-own-store.md L404-424](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md); [M/WholesaleAccount.swift L15-24](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)
- Case sizes: 6 booster boxes, 10 ETBs, 12 bundles, 36 packs. The distributor offers 8 in-print products each week, the same for the whole week. — [M/Wholesale.swift L45, L64-80](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift)
- Conflict: D/04 says "A player at Respected with no store keeps the 72% price with no limit". D/12, D/19, and the code all limit that player to 1 case of each product and 2 cases a week. — [D/04-reputation-and-followers-unlocks.md L30-31](/Users/ajholloway/personal/PokeVendor/docs/04-reputation-and-followers-unlocks.md) vs [M/WholesaleAccount.swift L53-55](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift)
- Minor code comment conflict: `buyWholesale` says "The minimum order is $500". The constant is $250. — [M/Wholesale.swift L35, L83](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift)
- Wholesale and case splits carry no fake risk: "Part of what reputation is buying is trust in the supply chain itself." — [D/14 L35-38](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)

**Case splits**
- Doc definition: "A few trusted people pool money to buy a full case together, then divide the actual boxes among themselves afterward — informal, no livestream, no organizer margin, no random assignment. (Deliberately excluding the livestreamed 'group break' format some real hobbyists run — not a fit for this game.)" — [D/12 L218-224](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Gate: reputation (trust), not followers (reach). "This is capital-pooling, not scale/reach." — [D/12 L226-232](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Numbers: 85% of market a box (80% from a Friend vendor). Respected: 1 invite a week, at most 2 boxes. Elite: 2 invites a week, up to half the case. A split closes in 3 days and arrives 4 days later. Invites come on Monday. Only booster boxes and ETBs. Organizers are vendor contacts at Regular or above, or the names Marcus, Priya, Dev, Olivia. — [D/19 L362](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Wholesale.swift L16-31, L46-55, L117-182](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift)

**Other sources of sealed product**
- Garage sale: 1 to 3 chances at old sealed, each hits 75%, worth at most $1,500. Estate sale: 1 to 4 chances, at most $6,000. Half vintage, half older. — [D/17 L117-121](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md); [M/Vendors.swift L270-271](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Vendors.swift)
- Show vendors: vintage dealer (4 to 7 sealed), modern dealer (4 to 8), game shop booth, collector clearing out, sealed dealer (12 to 18 sealed items). — [D/20-card-shows.md L140-149](/Users/ajholloway/personal/PokeVendor/docs/20-card-shows.md)
- Messages "Offers a card" are sealed 35% of the time, at 65% to 90% of market. Game shop encounter "A seller" is old sealed 35% of the time. "The owner's hold" holds a sealed product at 85% of market at standing Regular. — [D/28-messages-and-encounters.md L29, L49-55](/Users/ajholloway/personal/PokeVendor/docs/28-messages-and-encounters.md)
- Opportunities include a vendor closeout at 60% and a sealed buyer at 115% to 130%. — [M/Opportunities.swift L6-50](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Opportunities.swift); [D/19 L323](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- Own-store sealed buylist: walk-in sellers bring one sealed product of $15 or more, with a hidden floor of 55% to 85% of market. The clerk does not check for reseals. — [D/22 L340-361](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)

**Product types and catalog**
- Product kinds in `catalog.json` (1,853 entries): Collection 450, Tin 378, Blister 340, Booster pack 313, Elite Trainer Box 134, Booster box 123, Build & Battle 42, Other 41, Booster bundle 32. 637 are in print. — counted from [Resources/catalog.json](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Resources/catalog.json)
- D/13 says the catalog has 1,836 sealed products. The file now holds 1,853 entries. The doc count is slightly stale. — [D/13-sets.md L63-65](/Users/ajholloway/personal/PokeVendor/docs/13-sets.md)
- Premium collector items (UPC, SPC) sell through the same storefronts. — [D/12 L234-242](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Estimated MSRP table: pack $4.49, bundle $26.94, ETB $54.99, SPC $119.99, booster box $161.64, and others. — [D/19 L30-45](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- "Look inside a box": the front 2 packs show. An assorted box draws its other packs from the newest 4 sets of its era. Online and wholesale show only the box label. — [D/12 L244-273](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- Expected value readout upgrade: $120, shows the EV of opening each sealed item. — [D/09-upgrades.md L55](/Users/ajholloway/personal/PokeVendor/docs/09-upgrades.md)
- Upgrades that touch buying: drop-alert Discord ($60), restock alert bot ($150, +25% at a camped restock), folding cart ($120, carry 30 spaces of sealed instead of 8). — [D/19 L372-378](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [D/09 L60, L85](/Users/ajholloway/personal/PokeVendor/docs/09-upgrades.md)

**Open topics in D/12 (verbatim list)**
- Exact restock-alert-bot design; the exact Pokemon Center drop chance; whether a bought package can get lost in transit; the time each local store adds to a run and the stock odds per store; "How the local game shop's events connect to meets and reputation"; pull-rate data per set. — [D/12 L343-354](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)

### Rejected-feature touch points
- **Group breaks.** D/12 excludes "the livestreamed 'group break' format" from case splits as "not a fit for this game". The doc gives no further reason. D/32 lists "Group breaks. The docs exclude them" under Out of scope. — [D/12 L222-224](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [D/32-short-form-video.md L294-302](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)
- The case-split text defines what a split is NOT: no livestream, no organizer margin, no random assignment. A "Rip & Ship" proposal (a creator rips product the buyer owns on stream and ships the hits) avoids all three if the buyer picks a whole product and keeps its contents. It differs from a group break, which pools buyers into one case with random team or spot assignment. This distinction is an inference; no doc mentions rip-and-ship. — inference from [D/12 L218-224](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)
- **Preorders and new set releases.** "The set list is fixed. No new sets release during a run... the game has no prereleases and no preorders." The game shop offers holds, not preorders. — [D/17 L194-202](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md); [D/12 L114-118](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [D/08-ui-direction.md L193-207](/Users/ajholloway/personal/PokeVendor/docs/08-ui-direction.md)
- **Japanese product.** D/12 still says eBay "carries international product that the other stores do not sell". In code, an "international" eBay listing is the same English catalog with 10-day delivery and 12% off. No Japanese product exists in code. A proposal must not expand this line into Japanese product. — [D/12 L34-36](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md); [M/Market.swift L127-140](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Market.swift)
- **Slab cracking / resubmission.** "A returned grade is final — there is no in-game path to appeal or resubmit." — [D/10-grading.md L400-406](/Users/ajholloway/personal/PokeVendor/docs/10-grading.md); [D/14 L84-87](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)
- AJ's memory entry lists all four rejected features and says: "check this list before you suggest a new feature." — [memory feedback_rejected_features.md](/Users/ajholloway/.claude/projects/-Users-ajholloway-personal-PokeVendor/memory/feedback_rejected_features.md)

### Inferences
- Retail scarcity today is pure probability (stock chance, camp success, drop success). A rival-flipper or scalper system would be new. It must plug into `Market.shelf`, `Camping`, and `attemptDrop`, which are all seeded by day, so the same day gives the same stock.
- Retail has no "limit N per customer" rule. The shelf quantity (1 to 2 non-pack items at a big store) acts as a de facto limit.
- The distributor already models allocation, hot product (1.2 × MSRP), short shipments, and growth by spend. A proposal on "distributor relationships" must extend `DistributorAccount`, not add a second distributor model.
- Case splits already exist with fixed organizers and fixed box shares. A "case break" proposal that adds random assignment or a livestream would contradict D/12 directly.

### Gaps
- No doc gives a reason for the group-break exclusion beyond "not a fit for this game". AJ's own reason is not recorded.
- Elite "priority case allocation on hot releases" is in D/12 and D/04. The code gives Elite more split invites and half the case, but I found no Elite effect on the distributor allocation.
- Holds: D/19 L72 says "Holds are not built". D/21 says saved items at a game shop are built. I did not trace which is current in code.

## Q2. What do the social, reputation, relationship, haggling, and message docs say? Is there a callout, drama, or rival creator mechanic?

### Takeaway
Social media is one optional presence with quick posts, live streams (with Whatnot auctions, Buy Now, giveaways), sponsors, follower tips, and short-form series. Drama exists only as player-caused consequences: scam accusations, backlash, bad deal stories, the gambling backlash, and one random "rival vendor" story. There is no rival creator, no callout post, no reply to a bad story, and no pack battle. D/30 lists "Answer a bad story with a post" as not done because "It needs a new post type". D/32 lists "Pack battles against another creator" as out of scope.

### Cited Findings

**Social media (D/06)**
- Optional. The player starts with no account. All social UI hides until the player creates one. — [D/06-social-media.md L10-26](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Quick posts are a free action: pull reveals, flexes, hot takes, show promos. Live streams are a time-cost action of 2 or 3 hours. — [D/06 L28-47](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Stream actions: rip (Normal or Fast only), give away a card or product, auction a card, Buy Now sale, show a card, talk to chat. "A stream has no trading segment." Whatnot opens at follower tier 1. — [D/06 L43-72](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- A stream rips only the player's own pre-selected sealed products and cards. No stream action rips a product that a viewer bought. — [D/06 L45-51](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Reach = base follower reach × content quality × timing × luck. Authenticity is a hidden modifier. — [D/06 L84-103](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Consequences: burnout; backlash from overhype or a bad grading call, which "can cost reputation too, if it is bad enough to spill into the in-person trading world"; scam accusations from a slow shipment or a bad trade. A player with no account still gets accusations on the buyer's account. — [D/06 L105-117](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Growth: sponsor offers in the social inbox (a missed deadline costs authenticity), follower tips that reveal hidden garage sales, follower decay. — [D/06 L119-133](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md)
- Limits: a post about the same subject within 14 days has low quality (×0.35). Only the first 3 posts a day gain followers. — [D/06 L135-140](/Users/ajholloway/personal/PokeVendor/docs/06-social-media.md); [D/19 L592-597](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)

**Short-form video (D/32)**
- Series formats built: Rip until I hit, P&L challenge, Card show vlogs, Grading reveals. 2 series at a time. Momentum 1.0 to 2.0. — [D/32 L71-93](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md); [M/Shorts.swift L58-65](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Shorts.swift)
- Research table lists "Rip and give away" as a real format. The game has "Give it away" on the Rip until I hit finale only. — [D/32 L18-27, L115-118](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)
- Gambling backlash: after $1,000 spent in a series with no hit, each episode has a 20% chance of "this is just gambling" comments, authenticity −0.03. — [D/32 L119-121](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)
- Pay: view pay from 10,000 followers ($0.06 per 1,000 normal, $0.60 per 1,000 long). "Views pay very little. The money comes from what the followers bring: sponsor deals, stream viewers, and sales." — [D/32 L43-44, L241-250](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)
- Out of scope: separate platforms, trade-up challenges, "Pack battles against another creator", "Group breaks. The docs exclude them". — [D/32 L294-302](/Users/ajholloway/personal/PokeVendor/docs/32-short-form-video.md)

**Reputation and followers (D/04)**
- "Reputation unlocks exclusivity and quality. Followers unlock speed and scale." — [D/04 L10-11](/Users/ajholloway/personal/PokeVendor/docs/04-reputation-and-followers-unlocks.md)
- Reputation tiers: 0 Unknown, 1 Known (trading circles), 2 Trusted (first look, better table spot), 3 Respected (wholesale, case splits, traders bring pulls), 4 Elite (priority case allocation, private vintage collection). — [D/04 L19-25](/Users/ajholloway/personal/PokeVendor/docs/04-reputation-and-followers-unlocks.md)
- Follower tiers: 1 at 1,000 (sponsors, tips, Whatnot), 2 at 10,000 (better trade deals, free product; "does not change Pokemon Center drop odds"), 3 at 100,000 (larger sponsors, faster sales), 4 at 1,000,000 ("posting about a card can move its price"). — [D/04 L53-59](/Users/ajholloway/personal/PokeVendor/docs/04-reputation-and-followers-unlocks.md)
- Tier 4 price effect in code: `priceBoostFactor = 1.15` for `priceBoostDays = 7`. Tier 2 free product: "a sponsor sends free product every 4 weeks". — [M/Social.swift L85-87, L194, L258](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Social.swift)

**Relationships (D/21)**
- Two layers: a relationship (0 to 100 per contact) and reputation (one number). Contact kinds: game shop, vintage dealer, modern dealer, collector, trader, regular buyer. — [D/21-relationships-and-reputation.md L28-54](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)
- Friend level gives "Private offers: a whole collection, a grail, or a case split." — [D/21 L92](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)
- Want list: up to 10 cards, sets, or "kinds of sealed". — [D/21 L115-120](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)
- Reputation points: Unknown 0–49, Known 50–149, Trusted 150–349, Respected 350–699, Elite 700+. Lowered by a bad deal story (−4, −12 viral), a scam that comes out (−30), selling a fake (−40), a missed show day (−5), and social backlash. — [D/21 L153-182](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)
- Fair dealing with a naive seller: buy at their price, "Pay fair" (+5 reputation), or "Say it's not worth much" (a scam; found out 35% of the time in 3 to 20 days: −30 reputation, less authenticity). — [D/21 L224-229](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)
- Internal inconsistency: D/21 L18-20 says reputation "is designed but not built", but the doc status line says built. — [D/21 L3, L18-20](/Users/ajholloway/personal/PokeVendor/docs/21-relationships-and-reputation.md)

**Haggling and deal stories (D/30)**
- The "Flipper" visitor opens at about 49% to 74% of market, pays at most 68% to 82%, and has 1 patience point. — [D/30-haggling-and-deal-reputation.md L12-15](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md); [D/20 L70](/Users/ajholloway/personal/PokeVendor/docs/20-card-shows.md)
- Deal fairness: each table deal of $20 or more is generous (+2), fair (+1), or hard (0). Cap 6 reputation a day. — [D/30 L105-127](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)
- Deal stories: generous 8%, hard 12%, lost coin flip 4%, +2% per notoriety step, ×2 at $200 or more. Delay 1 to 10 days. Good +3 rep / +20 followers; viral good +10 / +2%; bad −4; viral bad −12 / −1% followers / authenticity −0.1. — [D/30 L129-156](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)
- Example story text: "Marcus posted that you lowballed him at Riverside Card Show." — [D/30 L149-150](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)
- Random stories: 3% a week. From reputation tier 2, a bad one: "A rival vendor says your prices are inflated" (−3). Never viral. Code text: "A rival vendor is telling people that your prices are inflated." — [D/30 L151-155](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md); [M/Haggling.swift L174](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Haggling.swift)
- Not in this change: "Answer a bad story with a post — It needs a new post type in the social system." "Score direct messages and Facebook offers." — [D/30 L274-280](/Users/ajholloway/personal/PokeVendor/docs/30-haggling-and-deal-reputation.md)

**Messages and encounters (D/28)**
- Notoriety = reputation tier + follower tier (0 to 8). Messages per day = 0.08 + 0.12 × notoriety. — [D/28 L8-19](/Users/ajholloway/personal/PokeVendor/docs/28-messages-and-encounters.md)
- Message kinds: Wants your card (100% to 125%), Looking for (110% to 130%), Offers a card (65% to 90%; 35% sealed, mostly vintage or older). — [D/28 L25-29](/Users/ajholloway/personal/PokeVendor/docs/28-messages-and-encounters.md)
- Game shop encounters (30% + 4% per notoriety, up to 60%): a kid with a hit, a buyer, a seller, the owner's hold, a tip. — [D/28 L43-55](/Users/ajholloway/personal/PokeVendor/docs/28-messages-and-encounters.md)
- Extra opportunities: a bulk buyer, a sealed buyer at 115% to 130%. — [D/28 L57-67](/Users/ajholloway/personal/PokeVendor/docs/28-messages-and-encounters.md)

### Inferences
- The "drama" hooks that exist are all reactive and player-caused. A rival-creator or callout system would be new. The cleanest hooks are the deal-story queue (`storiesEndDay`), the scam-accusation path, and authenticity.
- A "respond to a callout" post would fill the gap that D/30 names ("Answer a bad story with a post").
- The "rival vendor" random story and the two "rival game shops" (D/22) are the only rival entities. Neither is an agent with its own stock or behavior.
- A "Rip & Ship" service would sit between live streams (D/06: rip on stream, Whatnot sales) and selling (D/15). The stream has no action that rips a buyer-owned product today.

### Gaps
- No doc or code models a named rival creator, rival flipper, or scalper group.
- No doc says how retail-store or community sentiment reacts to scalping by the player.

## Q3. What do the ripping, store, pricing, calendar, sets, counterfeit, shows, vending, currencies, time, theft, and tax docs say about sealed product, supply, scarcity, flippers, or legal risk?

### Takeaway
Sealed product has its own price logic (sealed premium, out-of-print growth, seasons, booms, reprint waves, character sell-outs). Supply changes through print runs: a set goes out of print with 14 to 28 days of notice, and reprint waves bring product back. Legal risk is limited to taxes (sales tax, seller's permit, income tax, 1099-K) and counterfeits. There is no retail-policy risk (bans, purchase-limit enforcement) and no legal risk for scalping.

### Cited Findings

**Pricing and market (D/05, newest commit)**
- Sealed premium, age-driven appreciation, reseal risk, and the EV tension (open vs. hold) are design pillars. — [D/05 L68-85](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)
- Booms and corrections: Steady 120–360 days (−3% to +3% a year), Boom 120–300 days (+30% to +80%), Correction 180–360 days (−15% to −35%). Sealed follows 60% of a boom and 20% of a correction. — [D/05 L99-121](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md); [M/PriceCycle.swift L54-58, L72-103](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift)
- Daily steps: sealed has a 20% chance of a step each day, median 0.6%, 90th percentile 3%. Random walk with a 120-day half-life pull back to the real price. — [D/05 L123-143](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)
- Out-of-print sealed growth a year: WOTC and e-Card +10% to +15%; EX and later +15% to +25%. In print: 0% to +2%. — [D/05 L155-167](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md); [M/PriceCycle.swift L60, L116-122](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift)
- Conflict: D/19 "The moving market" table is stale: "out of print +5% to +15% a year", "Reprint −15% to −35%, 30 to 70 days" as a card-name event. The latest commit removed the card-name reprint event and did not update D/19. — [D/19 L563-570](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [commit 503ff3c stat](/Users/ajholloway/personal/PokeVendor)
- Market news kinds in code: `hype`, `reprint` (old saves only), `sealedHype`, `characterProduct`, `characterSellOut`. 6% chance a day, at most 3 at once. — [M/PriceCycle.swift L7-50](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift)
- Character sell-out news: "When stores sell out of a character's products, sealed product with that character in its name rises for 4 to 8 weeks (+20% to +50%)." Code text: "Stores sold out of \(subject) products." — [D/05 L176-179](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md); [M/PriceCycle.swift L529](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift)
- Print runs: about once in 25 days a print change is announced. 60% take one of the 3 oldest in-print sets out of print, with 14 to 28 days notice; its sealed rises 10% to 30% over a month. 40% bring a reprint wave of a Sun & Moon or later set; products reach shelves 7 to 21 days after the news. 70% of waves reprint 1 to 3 product kinds; 30% the whole set. A reprinted product falls 15% to 35%. At least 8 sets stay in print. At most 2 announced changes wait at a time. — [D/05 L182-223](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md); [M/PrintRuns.swift L7-60](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PrintRuns.swift)
- After a set leaves print, "stores, camping, wholesale, and the sponsor offers stop carrying the set." — [D/05 L193-195](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)
- Seasons: holiday season (mid October to December) sealed sells up to 15% more often and rises up to 5%. After the holidays (January to mid March) sealed falls up to 10%, "the best time to buy sealed product". Summer slump −5% sale chance. — [D/05 L225-264](/Users/ajholloway/personal/PokeVendor/docs/05-pricing-and-market.md)
- Demand limit: recent sales on a channel lower its sale chance (room 4, +2 per follower tier). Recent sales of one item lower its chance and its price by 5% each, down to 60%. — [D/15-selling.md L34-40](/Users/ajholloway/personal/PokeVendor/docs/15-selling.md); [D/19 L584-590](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md); [M/Demand.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Demand.swift)

**Ripping (D/18)**
- A product's seal breaks when the rip reaches its first pack. It then loses its sealed premium. Unopened packs go back as loose packs. — [D/18-ripping.md L390-440](/Users/ajholloway/personal/PokeVendor/docs/18-ripping.md)
- The rip always stops on counterfeit or resealed product. — [D/18 L133](/Users/ajholloway/personal/PokeVendor/docs/18-ripping.md)
- A rip on a live stream allows only Normal and Fast. — [D/18 L483-488](/Users/ajholloway/personal/PokeVendor/docs/18-ripping.md)
- Open topics: real pack order per set, a reseal found on opening, condition of pulled cards. — [D/18 L496-503](/Users/ajholloway/personal/PokeVendor/docs/18-ripping.md)

**Own store (D/22)**
- Rival game shops: Cardboard Castle and Top Deck Games each take 15 standing points when the player signs a lease, and stop consigning: "We don't consign for the competition." — [D/22 L101-118](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md); [M/CardStore.swift L238](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/CardStore.swift)
- Sealed shelf prices: 90%, market, 110%, 120%, 135%, 150%. "Sealed product sells near MSRP. Hot product goes above market." A customer pays 92% to 128% of market. — [D/22 L137-150](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)
- The store holds 40 sealed items; the sealed wall ($400) adds 60. — [D/22 L126, L223](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)
- Store events: Friday tournament (prizes are loose packs), Pokemon League (promo card each). — [D/17 L170-178](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md)
- Open topics: balancing; a second store. — [D/22 L497-500](/Users/ajholloway/personal/PokeVendor/docs/22-own-store.md)

**Calendar and time (D/17, D/16)**
- Calendar kinds: recurring, posted (2 to 3 days ahead: garage sales, estate sales, restock days), scheduled (weeks ahead: shows, rent, streams, taxes), surprise (Pokemon Center drops, store-run stock, opportunities). — [D/17 L25-32](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md)
- A restock day usually falls on a weekday morning, "so camping usually needs a day off work". — [D/17 L87-95](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md)
- A run starts on Monday, January 1, 2029. — [D/16-time-and-day.md L40-48](/Users/ajholloway/personal/PokeVendor/docs/16-time-and-day.md)

**Sets (D/13)**
- 133 English sets. Only Scarlet & Violet and Mega Evolution product is in print at the start, so only it sells at retail. — [D/13 L56-108](/Users/ajholloway/personal/PokeVendor/docs/13-sets.md)
- Era groups: Vintage (WOTC, e-Card), Older (EX to Sword & Shield), Modern (SV and ME). — [D/13 L100-104](/Users/ajholloway/personal/PokeVendor/docs/13-sets.md)

**Counterfeits (D/14)**
- Sealed risk is none at Pokemon Center, Amazon, camping, local stores, game shop, wholesale, case splits. Risk at the Hyped Reseller, garage and estate sales (out-of-print), and highest at eBay and Facebook. — [D/14 L17-38](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)
- Fake rates: Reseller 4%, eBay 8%, Facebook 10%, garage 12%, estate 8%, stranger 5%. Sealed ×0.5. Vintage ×3, older ×1.5. Hyped sealed ×1.5. — [D/19 L329](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- The player can knowingly sell a fake. The find-out chance rises by 30%, and a scam accusation follows. Cost: reputation −40. — [D/14 L3](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md); [D/19 L334](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)

**Card shows (D/20)**
- Visitor types include Flipper (68% to 82% of market, less patience) and Sealed collector (90% to 105%). Sealed dealer tables carry 12 to 18 sealed items. — [D/20 L70-75, L145](/Users/ajholloway/personal/PokeVendor/docs/20-card-shows.md)

**Vending machines (D/31)**
- A machine sells sealed product at a host (gas station, laundromat, mall at Known, own store). Up to 5 machines, $2,850 each, 40 sealed items each. Break-ins take the cash box and 30% to 60% of stock. — [D/31-vending-machines.md L1-46](/Users/ajholloway/personal/PokeVendor/docs/31-vending-machines.md); [D/19 L556](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- Not in this version: a "Passive income" goal ladder; singles and slabs in a machine. — [D/31 L89-97](/Users/ajholloway/personal/PokeVendor/docs/31-vending-machines.md)

**Currencies (D/03)**
- Four tracks (cash, followers, reputation, collection value), "never directly convertible into each other". — [D/03-currencies.md L1-30](/Users/ajholloway/personal/PokeVendor/docs/03-currencies.md)

**Theft (D/24)**
- At a show, one card or slab can walk off the table. "Sealed product cannot." Water damage spares slabs and sealed. Car break-in is 1.5% a show day or store run with stock in hand. — [D/24-theft-and-insurance.md L18, L38](/Users/ajholloway/personal/PokeVendor/docs/24-theft-and-insurance.md); [D/19 L467](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)

**Taxes (D/26) — the only "legal" system**
- Sales tax at the store and show table. Online platforms (TCGplayer, eBay, Whatnot) collect it themselves. A missed payment adds a 10% penalty. — [D/26-taxes.md L30-45](/Users/ajholloway/personal/PokeVendor/docs/26-taxes.md)
- Seller's permit ($50) is required for a store lease, "not a requirement for the card show table or for wholesale". — [D/26 L47-56](/Users/ajholloway/personal/PokeVendor/docs/26-taxes.md)
- The 1099-K note: platforms report gross sales over $2,000 in the game. Wholesale and sealed product count as costs for income tax. — [D/26 L68-73, L101-102](/Users/ajholloway/personal/PokeVendor/docs/26-taxes.md)
- Open topics: balancing; costing inventory only when it sells; sales tax on a trade or consignment. — [D/26 L129-136](/Users/ajholloway/personal/PokeVendor/docs/26-taxes.md)

**Playstyles (D/02)**
- The Flipper archetype (meets and shows) has the risk "other flippers undercutting your prices". The Grinder archetype (packs and singles arbitrage) is the sealed-acquisition loop. — [D/02-playstyles.md L17-45](/Users/ajholloway/personal/PokeVendor/docs/02-playstyles.md)

### Inferences
- "Other flippers undercutting your prices" (D/02) is a stated design risk with no mechanic behind it. The TCGplayer listing ladder (competing sellers, D/15) is the nearest existing model of competition.
- Supply scarcity already rises naturally with print changes and character sell-outs. A "hype release" or "sell-out" proposal can reuse `PrintChange` and the `characterSellOut` event rather than add a parallel system.
- No doc models store purchase-limit enforcement, a store ban, or any legal risk for reselling. A proposal there would be new ground. It must respect the "no new set releases" rule.

### Gaps
- No doc covers shipping for a service sale (rip-and-ship) or buyer-owned product in the player's care.
- No doc covers insurance or liability for product that a customer pays for but the player holds.

## Q4. Which Swift types and files model stores, sealed products, restocks, limits, market movement, followers, reputation, and rivals?

### Takeaway
Each system has its own `Model/*.swift` file with `extension GameStore` functions and `extension Balance` constants. All persistent state lives in `GameData` in `GameStore.swift`. Daily stock is seeded by day (same day = same stock). No type models a rival flipper, scalper, or rival creator.

### Cited Findings
| System | File | Main types and members |
|---|---|---|
| Sealed product catalog | [M/SetData.swift L46-111](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/SetData.swift) | `Product` (`id`, `name`, `kind` String, `packs`, `mix: [PackMix]`, `promos`, `baseMarket`, `msrp`, `inPrint`, `pools`; `market`, `isAssorted`, `isClubExclusive`, `isStoreExclusive`) |
| Owned sealed item | [M/Inventory.swift L561-597](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Inventory.swift) | `SealedItem` (`setSlug`, `paid`, `source` String, `productID`, `status: ItemStatus?`, `brokenFrom`, `fake`, `contents`) |
| Item status | [M/Inventory.swift L388](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Inventory.swift) | `ItemStatus` (`.onTheWay`, `.arriving`, `.listed`, `.inStore`, and others) |
| Online storefronts | [M/Balance.swift L182-185](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Balance.swift); [M/Market.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Market.swift) | `enum Storefront` (pokemonCenter, amazon, reseller, ebay, facebook); `StoreOffer`; `enum Market` with `offers(for:day:)`; `Balance.amazonStockChance = 0.45`, `storeListingCap = 40` |
| Local stores and game shops | [M/LocalStores.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LocalStores.swift) | `enum LocalStore` (`stockChance` 0.92 / 0.12), `ShelfItem` (`quantity`), `BuyIn`, `CaseSingle`, `ShopState`, `StandingLevel`; `Market.shelf(_:day:discount:)`, `gameShopShelf` |
| Store run UI | [Buy/StoreRunViews.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Buy/StoreRunViews.swift); [Buy/BuyViews.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Buy/BuyViews.swift) | drop attempt message "Missed. The drop sold out before your checkout went through." (BuyViews L182) |
| Daily purchase limits | [M/GameStore.swift L22-37, L782](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift) | `boughtToday`, `shelfBought`, `pokemonCenterAttempted`, `weekBought`, `shelfLeft(_:)` |
| Camping restocks | [M/Camping.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Camping.swift) | `Restock`, `CampHaul`; `restockDay`, `postedRestocks`, `restocksToday`; `campSuccess 0.6`, `restockCycleDays 14` |
| Wholesale and case splits | [M/Wholesale.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Wholesale.swift) | `WholesaleOffer`, `CaseSplit`; `wholesaleOpen`, `wholesaleOffers`, `buyWholesale`, `splitLimit`, `joinSplit`, `splitsEndDay`; `caseSizes` |
| Distributor account | [M/WholesaleAccount.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/WholesaleAccount.swift) | `DistributorAccount` (`spent`, `week`, `cases`); `isHot`, `wholesaleLeft`, `recordWholesale`; `hotProductRatio 1.2` |
| Wholesale UI | [Buy/WholesaleViews.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Buy/WholesaleViews.swift) | — |
| Box contents | [M/BoxContents.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/BoxContents.swift) | `enum BoxContents` |
| Moving market | [M/PriceCycle.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PriceCycle.swift) | `MarketEvent` (Kind: hype, reprint, sealedHype, characterProduct, characterSellOut), `MarketRegime` (flat, boom, correction), `StepTier`, `enum PriceCycle`; `Product.marketFactor()` |
| Print runs | [M/PrintRuns.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/PrintRuns.swift) | `PrintChange`; `printEndDay`; `printChangeChance 1/25`, `printMinInPrint 8` |
| Seasons | [M/Seasons.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Seasons.swift) | `SeasonBump`; `seasonWinterSealedPrice`, `seasonHolidaySealedPrice` |
| Demand limit | [M/Demand.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Demand.swift) | `DemandState`; `demandEndDay` |
| Market UI | [Hub/GoalsMarketViews.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Hub/GoalsMarketViews.swift) | Market screen: news, period, print news, season |
| Followers and posts | [M/Social.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Social.swift) | `PostType`, `SocialPost`, `SponsorOffer`, `SocialState` (`followers`, `burnout`, `authenticity 0.7`), `enum FollowerTier` |
| Live streams | [M/LiveStream.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/LiveStream.swift); [Stream/StreamView.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Stream/StreamView.swift) | stream setup, rips, giveaways, Whatnot auctions, Buy Now |
| Short-form video | [M/Shorts.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Shorts.swift); [Social/ShortsViews.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Social/ShortsViews.swift); [Social/RecordEpisodeSheet.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Social/RecordEpisodeSheet.swift) | series formats `ripUntil`, `pnl`, `vlog`, `reveal` |
| Reputation and contacts | [M/Relationships.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Relationships.swift) | `ContactKind`, `Interest`, `WantItem`, `Contact`, `SavedItem`, `ScamRecord`, `enum ReputationTier` (thresholds 0, 50, 150, 350, 700); `GameData.reputation` Int |
| Deal stories and haggling | [M/Haggling.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Haggling.swift) | stories queue; "rival vendor" random story (L174) |
| Show visitors (incl. Flipper) | [M/Shows.swift L542-573, L1169, L1233, L1739](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Shows.swift); [M/Packing.swift L13-17](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Packing.swift) | `VisitorType.flipper` (pays 68% to 82%, patience 1) |
| Vendors and garage/estate sealed | [M/Vendors.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Vendors.swift) | `VendorKind`, `MysteryPack`, `VendorItem`, `Vendor`; `garageSealedCap 1500`, `estateSealedCap 6000` |
| Messages, encounters, opportunities | [M/Messages.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Messages.swift); [M/ShopEncounters.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/ShopEncounters.swift); [M/Opportunities.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Opportunities.swift) | `OpportunityKind` (collectionForSale, vendorLiquidating, lastMinuteTable, privateBuyer, estateTipOff, vintageCollection, bulkBuyer, sealedBuyer) |
| Counterfeits | [M/Counterfeits.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Counterfeits.swift) | `Counterfeit.roll(source:sealed:slug:market:msrp:)`, `FakeTier` |
| Own store | [M/CardStore.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/CardStore.swift), [M/StoreSealedBuylist.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/StoreSealedBuylist.swift), plus `Store*.swift` | `GameData.cardStore`; `rivalStandingLoss` (CardStore L238) |
| Vending | [M/Vending.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Vending.swift) | machines, hosts |
| Upgrades | [M/Upgrades.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/Upgrades.swift) | restock bot, drop Discord, EV readout, folding cart |
| Tests | [Hub/GameTests.swift](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Hub/GameTests.swift) | `-test` launch argument, about 2 s; latest commit added market checks and `-marketsim` |

- A grep for "rival", "scalper", "flipper", "competitor" over the Swift code finds only: `VisitorType.flipper` (show and meet visitors), the "rival vendor" story text, and the rival game shops message. No other rival entity exists. — grep over [app/PokeVendor](/Users/ajholloway/personal/PokeVendor/app/PokeVendor)
- A grep for "japanese", "crack", "resubmit", "preorder", "group break" over Model, Buy, Hub, Social, Stream finds nothing. — same grep

### Inferences
- New systems in this codebase follow one pattern: a new `Model/X.swift` with a `Codable` state struct on `GameData`, `extension Balance` constants, an `xEndDay() -> [String]` hook in `GameStore.endDay()`, and a `-test` check. A proposal should follow it.
- `SealedItem.source` is a free String ("Wholesale", "Case split with Marcus"). A rip-and-ship or customer-owned product would need a new status or owner field, because `SealedItem` assumes the player owns it.

### Gaps
- I did not read `LiveStream.swift` or `StreamView.swift` in full. Stream code details (viewer model, auction rules) are from D/06 and D/19.

## Q5. What does the game do day to day (the core loop and End Day)?

### Takeaway
A day is 7 AM to 11 PM (16 hours). A weekday job takes 9 AM to 5 PM. Free actions (buy online, open packs, list, post, grade) cost no time. Time-cost actions (store runs, camping, sales, meets, streams, shows) use hours. The player taps End Day, and the game advances every system by one day and writes a report.

### Cited Findings
- Start: a solo trader with no business, a bedroom or car trunk. "Making it" has no win screen. The player loses if they cannot pay rent. — [D/01-premise-and-loop.md L3-33](/Users/ajholloway/personal/PokeVendor/docs/01-premise-and-loop.md)
- Four playstyles in one toolbox: Sourcer, Flipper, Creator, Grinder. — [D/01 L35-40](/Users/ajholloway/personal/PokeVendor/docs/01-premise-and-loop.md); [D/02](/Users/ajholloway/personal/PokeVendor/docs/02-playstyles.md)
- Free actions: open a pack, send to a grader, buy online, quick post, list a card, answer a trade offer. Time-cost: garage sale, camping, store run, Facebook pickup, meet, live stream. Multi-day: card shows. — [D/01 L42-78](/Users/ajholloway/personal/PokeVendor/docs/01-premise-and-loop.md)
- "Time-cost actions carry real variance, including the chance of a bust... The risk is the point." — [D/01 L80-85](/Users/ajholloway/personal/PokeVendor/docs/01-premise-and-loop.md)
- The day does not end by itself. With no hours left, the player can still do free actions until End Day. Time-cost actions can run to 2 AM (late nights). — [D/16 L3, L28-38](/Users/ajholloway/personal/PokeVendor/docs/16-time-and-day.md)
- Paycheck $640 on Friday. Rent $1,200 on the 1st of each month, +5% each January 1. — [D/19 L15-17](/Users/ajholloway/personal/PokeVendor/docs/19-prototype-values.md)
- A typical week: weekday evenings for trade night, league night, store runs, streams; weekends for garage sales, park swap, trading circle, shows; days off for estate sales and camping. — [D/17 L180-192](/Users/ajholloway/personal/PokeVendor/docs/17-calendar-and-events.md)
- `GameStore.endDay()` order: paycheck (Friday), missed show, job, store day, shorts, day += 1, demand, market sync, print news, market news, reset `boughtToday` / `shelfBought` / `pokemonCenterAttempted` (and `weekBought` each 7 days), standing decay, sealed deliveries and listing sales (`advanceSealed`), cards, grading bills, lots, eBay lots, social, schedule shows and sales, relationships, stories, follower tips, opportunities, messages, counterfeits, sale problems, payments, streams, splits, meetups, offers, lots, auction houses, vending, rent (game over if unpaid), store rent, taxes, debt, collections, losses, store growth, business costs, goals, then the drop-live line, the log, and the `DayReport`. — [M/GameStore.swift L1106-1210](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)
- `advanceSealed` writes one line per product for a case ("A case is many boxes. One line for each product, not one for each box."). — [M/GameStore.swift L1218-1224](/Users/ajholloway/personal/PokeVendor/app/PokeVendor/Model/GameStore.swift)
- AJ's memory: run `-test` (about 2 s) after End Day, money, or item changes. Never read `data.y` inside a closure that mutates `data.x` (the exclusivity trap). — [memory project_game_tests.md and project_exclusivity_and_soak.md](/Users/ajholloway/.claude/projects/-Users-ajholloway-personal-PokeVendor/memory/MEMORY.md)
- Other AJ rules that bind proposals: no screen flash, no oversize cards, real prices win, "challenge cash stays a book number; no buy toggle or second wallet". — [memory MEMORY.md](/Users/ajholloway/.claude/projects/-Users-ajholloway-personal-PokeVendor/memory/MEMORY.md)

### Inferences
- A new feature that needs daily resolution (a rival's restock haul, a callout that arrives later, a rip-and-ship order that ships) fits as one more `xEndDay()` call in this list, and a line in the report.
- Retail flipping today is a free-action plus time-cost mix: buy at MSRP on a store run or camp, then list online or sell at a table. The margin comes from MSRP vs. market, the hot-product ratio, out-of-print growth, and seasons. No NPC competes for the same shelf.

### Gaps
- Recent git history shows feature order (store, splits, market, seasons, vending, shorts, calendar). It does not record AJ's reasons for each design choice beyond the commit text.
