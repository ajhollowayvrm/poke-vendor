# Resume a Visit

**Status: built** (`Model/EventResume.swift`, the snapshot in `Model/Shows.swift`, and hooks in
`Model/GameStore.swift`, `Show/ShowDayView.swift`, and `Hub/HubView.swift`). AJ asked for this on 2026-11-25:

- "If the app quits mid event, the time resets to before the event and just says the event is done. I'd like to be
  able to leave the screen of a show or a shift and be able to come back to it when the app loads again."

## The problem

A visit (a card show day, a meet, league night, a garage or estate sale, an opportunity, or the store counter) lived
only in memory. The visit's start was saved: the show day was marked as attended, or the counter day was set. Its end
was not. A quit lost the visit, the clock stayed at the start, and the hub said "Done for today".

## The change

- **The save holds the visit.** `GameData.activeEvent` is a snapshot of the session (`ShowSessionSnapshot`): the venue,
  the clock, the stage, the table, the load, the person at the table, the floor vendors, the people still to come, and
  the totals. Each save writes it. The session asks for a save at each new visitor, each stage change, and each time
  step. The app also saves when it goes to the background.
- **A quit resumes.** At launch, the game rebuilds the session from the save, and the hub opens it once.
- **Step out.** The circled chevron at the top left of the visit screen goes back to the hub. The visit waits with its
  clock stopped. The hub shows **Back to <visit>** at the top of "Plans for today". There is no step out at the summary.
- The visit's own buttons open it again too: the counter rows on the hub and the store screen say "Your counter
  waits", and the hub's show row says "Your show waits". The hub shows no free hours while a visit waits.
- **While a visit waits:** End Day, every timed action, and every other visit are greyed out. The reason is "You are at
  <visit> · go back or leave first". Free actions (Inventory, buying online, a rip) are allowed.
- **Back at the visit:** an item that left Inventory or changed status in the meantime leaves the table and the load.
  A buyer or a trader who wanted a gone item leaves.
- **The store counter.** Its money uses the business account only while its screen is open. A step out moves money back
  to the personal account.
- The visit ends as before, with the summary. The save then forgets it.

## Not saved

- The coin flip and the mystery reveal on screen. The deal behind a flip or a reveal is already done when it shows.
- The people who come next are rolled when they arrive. A quit cannot change the person at the table, because the save
  holds them.
