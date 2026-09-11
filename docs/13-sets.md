# Sets

An index, not a knowledge base — each set's own quirks live in its own
file under `docs/sets/`, not here. This mirrors how
[00-overview.md](00-overview.md) indexes the whole doc folder, scoped
down to just sets.

## Why one file per set

This is the same scaling reasoning behind splitting
[09-upgrades.md](09-upgrades.md) from [10-grading.md](10-grading.md),
just at much bigger scale — there are roughly 150-180 official sets,
so a single combined doc would eventually be unmanageable. One file
per set keeps each set's data independently readable and editable
without touching the others.

## What goes in a set file

Primarily **pull rates** — see
[12-acquiring-product.md](12-acquiring-product.md) for why this is
real, researched-once data rather than a live pull: pack structure for
an already-printed set is fixed historical fact, not something that
drifts like a market price. A set file should cover:

- Pack slot structure (rarity breakdown per pack).
- Rare/holo slot odds, and confidence level for each figure (Wizards
  of the Coast and The Pokemon Company have rarely published exact
  odds, so most of this is community-derived).
- Box and case structure (packs per box, boxes per case), and whether
  collation is fixed or variable.
- Anything else set-specific that comes up: print-run notes, known
  errors, special mechanics unique to that set.

## Sets done so far

- [sets/base-set.md](sets/base-set.md) — pull rates researched, real
  empirical backing on holo odds via a community pack-weight study.

## Open topics

- The rest of the ~150-180 sets, added as the game actually needs
  them — not researched all up front (see
  [12-acquiring-product.md](12-acquiring-product.md)).
