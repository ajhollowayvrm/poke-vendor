# Shop Experience: Nine Improvements

**Status: plan.** AJ asked for this plan on 2026-11-25, after the loose packs (docs/38), the owner's shift (docs/39), and
resume a visit (docs/40). The theme: the store feels like a real job, and no progress is lost.

Each part names the files it changes, the save fields it adds, and its tests. Every new save field is optional or has
a default, and decodes with `decodeIfPresent` (memory `project_store_business.md`). Store parts read `data.cardStore`
and do nothing without a store.

## Order

| Phase | Parts | Why this order |
|---|---|---|
| 1 | 1. Resume streams and store runs | Same pattern as docs/40. No balance change. |
| 2 | 3. Store hours, 4. Planned closures, 5. Part-time staff and call-outs | One change to the store day. Hours come first, because staff schedules and closures use them. |
| 3 | 2. Quick shift | It uses the shift window from phase 2. |
| 4 | 6. Display refill, 7. Pack price | Both change the pack display. |
| 5 | 8. Opinions on the visitor card, 9. Pull boxes | Both are about regulars. Part 9 is the largest new system. |

Each phase is one commit, with `-test` green and a build on the phone.

---

## 1. Resume live streams and store runs

**Finding:** rips are already safe. `RipModel.startOpening` and `openAll` commit each pack's cards to Inventory when
the pack opens (`Model/RipModel.swift:412`, `:466`). The packs that are not opened stay as loose packs. A quit loses only
the reveal screen. No change for rips.

**Live stream (`Model/LiveStream.swift`).** Each sale books at once (`sellOnStream`). The tips, the followers, the burnout,
the post, and the clock book only in `finishStream`. A quit now keeps the sales, loses the tips and the followers, and
gives a stream with no burnout and no time cost.

- Add `StreamSnapshot: Codable` and `StreamSession.init(snapshot:store:)` / `snapshot()`, the same way as
  `ShowSessionSnapshot`. It holds the minute, the viewers, the interest, the tips, the followers, the items, the chat
  (last 30 lines), the auction or buy-now in progress, the sold list, the giveaways, and the Rip & Ship order that waits.
- `StreamItem`, `ChatLine`, `StreamAuction`, `StreamBuyNow` get `Codable`. The tuple lists become small structs in the
  snapshot.
- `GameData.activeStream: StreamSnapshot?`. `saveNow` writes it. The stream asks for a save each simulated minute
  block that changes state.
- At launch the hub opens the stream again, the same as `nav.encounter` (`AppNav.launchResumeDone`).
- An auction in progress resumes with its timer. A rip on camera (`ripping`) resumes as "back on camera" with the pack
  sealed: the rip itself is safe, as above.
- No step-out for a stream: a stream is live. A quit pauses it, and the chat says "Sorry, connection dropped" when it
  resumes.

**Store run (`Buy/StoreRunViews.swift`, `AppNav.StoreRunSession`).** `startStoreRun` spends all the hours at the start.
The stop index, the wait, the spend, and the buys are `@State` in the view. A quit loses the stops that are left.

- Move the run state into a `StoreRun: Codable` model: the stops, the start hour, the current stop, the wait, the spend,
  the buys, and the store points at the start. `GameData.activeStoreRun: StoreRun?`.
- The view reads and writes the model through the store. The run saves after each stop.
- At launch the hub opens the run again at its current stop. A shop encounter in progress (`ShopEncounter`) starts over
  at that stop. Its buy has not booked yet.

**Blocks.** `eventBlock` (Model/EventResume.swift) covers a stream and a run too, so End Day and timed actions wait.

**Tests.** A stream snapshot round trip through JSON: minute, tips, items, and sold. A run round trip: the current stop
and the spend. End Day waits for both.

---

## 3. Store hours

**Now:** `Balance.storeOpen` (11) and `Balance.storeClose` (19), in 17 places in 8 files.

**Change**
- `CardStoreState.hours: StoreHours?` with `open` and `close`. Nil: 11 to 7, so an old save does not change.
- One accessor, `storeOpenHour` / `storeCloseHour`, replaces every use of the two constants. Wages (`Employee.dailyWage`,
  `Balance.clerkWage`), the counter venue, the shift, `finishCounter`, the event times (`Model/Events.swift`), and the
  views all read it.
- Choices: open at 9, 10, 11, 12, 1, 2, or 3. Length 6, 8, 10, or 12 hours. Close at 11 PM at the latest.
- **A new schedule starts tomorrow.** The posted hours of today do not move. `pendingHours` holds the change.
- **Traffic by hour.** `expectedCustomers` scales by the hours open, weighted by the time of day:

  | Hours | Weight |
  |---|---|
  | 9 AM – 12 PM | 0.6 |
  | 12 – 3 PM | 1.0 |
  | 3 – 7 PM | 1.3 (after school and work) |
  | 7 – 11 PM | 0.8 |

  The weights are scaled so that 11 to 7 gives exactly today's traffic.
- With a day job, the shift fits after work only when the store opens at 5 PM or later. The setup screen says so.

**Tests.** 11 to 7 gives the same `expectedCustomers` as before. A 3 PM to 11 PM store pays 8 hours of wages. A change
today keeps today's hours.

---

## 4. Planned closures

**Change**
- `BusinessState.plannedClosures: [Int]?`. The store screen gets **Plan a closed day**, for a day 3 or more days ahead.
- A planned day is closed: no clerk sales, no owner shift, no lock-up cost. The posted notice costs loyalty −1 (people
  still miss the store), not −4, and no bad review.
- Up to 4 planned days in 28 days at that cost. Past that, each planned day costs as a lock-up.
- The calendar shows the planned days. A planned day can be cancelled up to the day before.

**Tests.** A planned day has no shift and costs 1 loyalty. A day 2 days ahead cannot be planned. The fifth day in 28
costs as a lock-up.

---

## 5. Part-time staff and call-outs

**Now:** staff is all or nothing (`s.clerk`). Sick days roll at End Day in `staffDay`, after the day is over, so they
never make the owner cover.

**Change**
- `Employee.schedule: StaffSchedule?`: the weekdays they work, and `full`, `opening` (first half), or `closing` (second
  half). Nil: every open day, full. Wages pay only the scheduled hours.
- **Coverage.** Each open day has a covered window from the schedules. The owner's shift is the part with no cover. With
  one opener and no closer, the owner works the second half.
- **Call-outs in the morning.** The sick roll moves from `staffDay` (End Day) to the start of the day, right after
  `data.day += 1`. `BusinessState.absentToday: [UUID]?` holds who called out. The morning report says "Priya called in
  sick. Cover the counter or lock up." Their window becomes part of the owner's shift.
- `storeShiftToday` and `storeShiftStart` read the window with no cover, not `s.clerk`. The clerk sales in
  `rollStoreSales` use the covered share.
- The staff screen gets a week grid: who works which day and which half, with the uncovered half in orange.

**Tests.** An opener and no closer gives a shift in the second half. A call-out in the morning makes a shift. Wages pay
only the scheduled hours. A standard clerk from an old save covers every day, full.

---

## 2. Quick shift

**Change**
- A **Quick shift** button on the counter's table stage (`Show/ShowTableStage.swift`), only at the store.
- It runs visitors until one needs the player. It rings up a straight buyer (`visitor.straight`) and a pack buyer
  through `accept()`, with the usual payment and fake checks.
- It stops for: a haggle, a seller, a trader, a collection, a walk-in with a job, a whale, a regular at Trusted or
  higher, a kid (for the gift choice), and a payment problem.
- It stops at closing time and shows the summary. The banner counts what it rang up: "Rang up 14 sales for $212."
- It skips nothing that is a choice, so it gives the same money as tapping "Ring it up" each time.

**Tests.** A quick shift on a counter with only straight buyers reaches the summary with every sale booked. It stops at
a seller.

---

## 6. Keep the pack display full

**Change**
- A store setting: **Refill the pack display**, off by default, with a level: refill below 25%, 50%, or 75%.
- Each night in `backRoomRestock` (`Model/Cases.swift`), when the display is under the level, the store breaks sealed
  units from the back room into packs (`breakIntoPacks`), until the display is full.
- It breaks only products where the loose packs are worth at least the sealed market (`loosePackValue >= market`), so
  it never breaks an ETB at a loss. It breaks the oldest stock first.
- It never breaks a case: a case opens through the existing back-room restock first.
- The report says: "The store broke 2 Surging Sparks booster boxes into 72 packs for the display."

**Tests.** With the setting on and a booster box in the back room, a low display fills at End Day. An ETB stays sealed.
With the setting off, nothing breaks.

---

## 7. A price for loose packs

**Change**
- `CardStoreState.packFactor: Double?`, with choices 100%, 110%, 120%, 130%, 140%, and 150% of market. Nil: the sealed
  price, so an old save does not change.
- `shelfPrice` uses it for a loose pack. `StoreShelfItem` and `ShowItem` already know a loose pack.
- **Impulse buyers pay more for one pack.** The pack buyer's limit at the display is market × 0.95 to 1.45 (now 0.92 to
  1.28). A single pack at $5.49 against a $4.20 market still sells, but slower. This matches real shops, where a pack
  often sells over the price per pack of a box.
- The store screen shows the pack price next to the singles and sealed prices.

**Tests.** A loose pack uses the pack price, and a booster box uses the sealed price. At 150%, fewer pack lots sell than
at 100% over the same days.

---

## 8. Both opinions on the visitor card

**Change**
- On the counter and show visitor card (`Show/ShowTableStage.swift`, by `LevelBadge`), a contact shows one line:
  "They think: Regular · You think: 45 · Rapport 30".
- Under it, the last deal from `Contact.memory`.
- A straight buy from a contact says why: "They know you, so they ask for a deal" when the rapport is high.

**Tests.** None (view only).

---

## 9. Pull boxes for regulars

**Change**
- **The ask.** A regular at Regular or higher can ask at the counter to start a pull: one in-print product (a booster
  box, an ETB, or a booster bundle) every 2 or 4 weeks. It is a new counter walk-in kind, `.pullRequest`, with its own
  panel (`Show/CounterEventViews.swift`). The player says yes or no.
- **The list.** `BusinessState.pulls: [Pull]?` with the contact, the product, the cycle, the next pickup day, and the
  misses. At most 6 pulls, and 10 with a store level of 3 or more. The store screen shows the pull list, and the
  calendar shows the pickup days.
- **Pickup.** At End Day on a pickup day (an open day), the store needs one unit of that product: free, in the store
  or in hand, not a known fake. The regular pays the shelf price less 5%. The money goes to the business account, with a
  receipt. Standing +2 and opinion +2.
- **A miss.** No unit on the day: standing −3, and the pickup moves 3 days. Two misses in a row end the pull with a
  1-star review chance.
- **An out-of-print product.** When the product goes out of print (`announcePrintChange`), the pull ends at the next
  pickup. The regular thanks the player. This is the moment when a sealed product's price climbs, so the player can
  choose to keep the last unit instead.
- **Why it matters.** It gives a steady reason to buy the distributor allocation, and it rewards keeping regulars happy.

**Tests.** A pull picks up at End Day with a unit in stock and books the sale. With no unit, it misses and moves 3 days.
Two misses end it. A store with no pulls has no change.

---

## Docs

Each phase adds or updates its doc: docs/39 (hours, closures, staff, quick shift), docs/40 (streams, runs), docs/38
(refill, pack price), and a new docs/41-pull-boxes.md. Memory `project_store_business.md` gets the new save fields.

## Open choices for AJ

1. Store hours: is a 12-hour day allowed, or 10 at most?
2. Planned closures: 4 days in 28 at the low cost. Is that the right allowance?
3. Pull discount: 5% under the shelf price. Real shops give 5–10%.
4. Pack price default: the sealed price (no change), or 110%?
