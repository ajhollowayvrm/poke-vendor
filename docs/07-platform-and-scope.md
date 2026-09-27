# Platform and Scope

## Platform

Native iOS, built in Swift.

## Build status

Private build. This is not, at this stage, intended for public release.

The app is in `app/`. XcodeGen makes the Xcode project from
`app/project.yml`. The app opens on the home hub. It has days and a clock, End Day, the
day job and the paycheck, rent (and game over when the player cannot
pay it), the Wallet ledger, and the Activity log. The player buys
product from eight sets online from five storefronts: Prismatic
Evolutions, Surging Sparks, Stellar Crown, Twilight Masquerade, and
Paradox Rift (in print), and Evolving Skies, Cosmic Eclipse, and Base
Set (out of print). Amazon, Pokemon Center drops, and local shelves
sell only in-print product. Each era rips with its own pack order and
pack trick, rips it in
Inventory, lists cards on TCGplayer or eBay, and grades cards at PSA,
CGC, or BGS. A store run visits big stores and two game shops, where the
player buys at MSRP, sells singles on the buylist, and sells bulk for
store credit. The player can start a social media account, make quick
posts, grow followers, take sponsor deals, and post cards for sale. The values that the design leaves to balancing are in
[19-prototype-values.md](19-prototype-values.md). Live streams, meets,
garage sales, shows, holds, consignment, and league night are not
built yet.
`python3 tools/export/rip_set.py <set>` writes the
set data that the app reads, and `python3 tools/export/catalog.py`
writes the sealed product catalog with each product's pack mix and
promo cards.

## Pokemon IP note

The game uses full, real Pokemon branding. The Pokemon Company does not
license fan-made trading-card-shop games, so a public App Store release
using real Pokemon IP would very likely be rejected or pulled after the
fact. This is not a concern for a private build.

If public release ever becomes a goal, this would need revisiting — likely
by designing the data model so it can be reskinned to a generic "TCG" layer
without a rewrite. That reskin has not been designed, and is not needed
while this stays private.
