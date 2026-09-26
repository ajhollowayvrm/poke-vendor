# Platform and Scope

## Platform

Native iOS, built in Swift.

## Build status

Private build. This is not, at this stage, intended for public release.

The app is in `app/`. XcodeGen makes the Xcode project from
`app/project.yml`. The app opens on the home hub. It has days and a clock, End Day, the
day job and the paycheck, rent (and game over when the player cannot
pay it), the Wallet ledger, and the Activity log. The player buys
Prismatic Evolutions product online from five storefronts, rips it in
Inventory, lists cards on TCGplayer or eBay, and grades cards at PSA,
CGC, or BGS. The values that the design leaves to balancing are in
[19-prototype-values.md](19-prototype-values.md). Social media, meets,
garage sales, shows, the store run, and the local game shop are not
built yet.
`python3 tools/export/rip_set.py <set>` writes the
set data that the app reads.

## Pokemon IP note

The game uses full, real Pokemon branding. The Pokemon Company does not
license fan-made trading-card-shop games, so a public App Store release
using real Pokemon IP would very likely be rejected or pulled after the
fact. This is not a concern for a private build.

If public release ever becomes a goal, this would need revisiting — likely
by designing the data model so it can be reskinned to a generic "TCG" layer
without a rewrite. That reskin has not been designed, and is not needed
while this stays private.
