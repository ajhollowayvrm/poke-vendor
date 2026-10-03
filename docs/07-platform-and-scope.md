# Platform and Scope

## Platform

Native iOS, built in Swift.

## Build status

Private build. This is not, at this stage, intended for public release.

The app is in `app/`. XcodeGen makes the Xcode project from
`app/project.yml`. Build it with `cd app && xcodegen generate &&
xcodebuild -scheme PokeVendor -destination 'platform=iOS
Simulator,name=iPhone 17 Pro' build`. The app opens on the home hub.

Every system in this folder is built. The list:

- **Time**: days and a clock, End Day, the day job with the job board,
  time off, sick days, unexcused skips, and quitting, rent (and game
  over when the player cannot pay it), late nights with the morning
  choice, the Wallet ledger, and the Activity log.
- **Buying**: all 131 English booster sets. Five online storefronts,
  store runs to big stores and two game shops, camping a restock day,
  wholesale and case splits from reputation Respected, and Facebook
  pickups set for a later day.
- **Ripping**: each era's pack order and pack trick, demigod and god
  packs, and three modes: Normal, Fast, and Sift with a stop rule.
- **Inventory and selling**: TCGplayer, eBay, eBay auctions, Facebook
  Marketplace meetups, social posts, Whatnot on a stream, the game shop
  buylist, bulk for credit, and consignment. Shipped online sales also
  bring buyer problems: lost packages, item-not-received claims, returns,
  and scam returns.
- **Grading**: PSA, CGC, and BGS, the centering tools, the reveal tools
  for corners, edges, and surface, and a grading booth at regional
  shows.
- **Counterfeits**: fakes from risky sources, a look by eye, paid
  authentication, the authentication tool, graders that flag fakes,
  resealed product, and bad sales that come back to the player.
- **The world**: card shows, weekly meets, league night, garage and
  estate sales, follower tips, surprise opportunities, and the calendar
  that holds them.
- **People**: contacts, relationship levels, saved items, the want
  list, fair dealing, and the reputation tiers with their unlocks.
- **Social media**: quick posts, sponsors, the analytics upgrade, live
  streams with auctions, Buy Now, giveaways, and tips, scheduled
  streams, and the show promo post.
- **Upgrades**: one screen with every upgrade.
- **Your own store**: the lease, three locations, the shelves, the
  clerk, working the counter, fixtures, store rent, and eviction.
- **Supplies**: the Supplies storefront, use of supplies by shipped
  sales, grading, and show tables, the rush price, and accessories for
  the store.

The values that the design leaves to balancing are in
[19-prototype-values.md](19-prototype-values.md).
`python3 tools/export/rip_set.py <set>` writes the
set data that the app reads, and `python3 tools/export/catalog.py`
writes the sealed product catalog with each product's pack mix and
promo cards.

The hub has no test menu.
`-soak <days>` as a launch argument plays that many days by itself and
prints a report to the console.

## Pokemon IP note

The game uses full, real Pokemon branding. The Pokemon Company does not
license fan-made trading-card-shop games, so a public App Store release
using real Pokemon IP would very likely be rejected or pulled after the
fact. This is not a concern for a private build.

If public release ever becomes a goal, this would need revisiting — likely
by designing the data model so it can be reskinned to a generic "TCG" layer
without a rewrite. That reskin has not been designed, and is not needed
while this stays private.
