# Platform and Scope

## Platform

Native iOS, built in Swift.

## Build status

Private build. This is not, at this stage, intended for public release.

The app is in `app/`. XcodeGen makes the Xcode project from
`app/project.yml`. The first playable part is the rip screen for
Prismatic Evolutions. `python3 tools/export/rip_set.py <set>` writes the
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
