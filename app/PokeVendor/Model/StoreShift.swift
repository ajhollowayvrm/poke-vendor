import Foundation

// The owner's shift (docs/39-store-shift.md). With no staff, the owner runs the counter on each open day. The shift
// blocks other timed actions, and End Day waits for it. The owner can lock up instead, and the customers do not like it.

extension Balance {
    /// A lock-up: the loyalty it costs, the chance of a bad review, and the standing lost with each regular who came by.
    static let lockUpLoyalty = 4.0
    static let lockUpReviewChance = 0.4
    static let lockUpRegularPoints = 1
    static let lockUpRegulars = 2
    /// Each lock-up in the window makes the next one cost this much more.
    static let lockUpRepeatStep = 0.5
    static let lockUpWindowDays = 28
}

@MainActor
extension GameStore {
    /// True when the owner runs the store today: it is open today, and staff do not cover all of it
    /// (Model/StoreHours.swift).
    var storeShiftToday: Bool {
        guard storeOpenToday, ownerWindow != nil else { return false }
        return !lockedUpToday
    }

    /// True while the shift waits: the owner has not worked the counter and has not locked up.
    var storeShiftPending: Bool { storeShiftToday && data.cardStore?.counterDay != data.day }

    var lockedUpToday: Bool { business.lockedDays?.contains(data.day) == true }

    /// The shift: the part of the day with no staff. It starts when the day job ends, at the earliest.
    var storeShiftStart: Double {
        let start = ownerWindow?.start ?? storeOpenHour
        return worksToday ? max(start, Balance.workEnd) : start
    }
    var storeShiftEnd: Double { ownerWindow?.end ?? storeCloseHour }

    /// The reason a timed action from `start` to `end` cannot happen, because it runs into the shift. Nil: it can.
    func storeShiftBlock(from start: Double, to end: Double) -> String? {
        guard storeShiftPending, start < storeShiftEnd, end > storeShiftStart else { return nil }
        return "You run the store today · lock up to go"
    }

    /// Why End Day must wait, or nil.
    var endDayBlock: String? {
        eventBlock ?? (storeShiftPending ? "Work the counter at \(data.cardStore?.name ?? "the store") or lock up first" : nil)
    }

    /// The lock-ups in the window, before today.
    private var recentLockUps: Int {
        let today = data.day
        return (business.lockedDays ?? []).filter { $0 < today && $0 > today - Balance.lockUpWindowDays }.count
    }

    /// What a lock-up costs now. Each recent lock-up makes it cost more.
    var lockUpFactor: Double { 1 + Balance.lockUpRepeatStep * Double(recentLockUps) }

    var lockUpWarning: String {
        let loyalty = Int((Balance.lockUpLoyalty * lockUpFactor).rounded())
        let review = Int((min(0.9, Balance.lockUpReviewChance * lockUpFactor) * 100).rounded())
        let again = recentLockUps > 0 ? " You locked up \(recentLockUps) time\(recentLockUps == 1 ? "" : "s") in the last 4 weeks, so it costs more." : ""
        return "Customers find the door locked. Loyalty −\(loyalty), a \(review)% chance of a bad review, and the regulars who come by think less of you.\(again)"
    }

    /// Locks the store for the day. The shift is over, and the customers who come by are let down.
    @discardableResult
    func lockUp() -> String? {
        guard storeShiftPending, let s = data.cardStore else { return nil }
        let today = data.day
        let factor = lockUpFactor
        let window = Balance.lockUpWindowDays
        updateBusiness { b in b.lockedDays = (b.lockedDays ?? []).filter { $0 > today - window } + [today] }
        nudgeLoyalty(-Balance.lockUpLoyalty * factor)
        var line = "You locked up \(s.name) for the day."
        if Double.random(in: 0..<1) < min(0.9, Balance.lockUpReviewChance * factor) {
            let text = ["Drove across town and the door was locked. No sign, nothing.",
                        "Closed in the middle of the day again. Hard to count on this place.",
                        "Came by for packs with my kid. Locked. We went to the big store instead."].randomElement() ?? ""
            counterReview(Int.random(in: 1...2), text)
            line += " Someone left a bad review."
        }
        // The regulars who came by today. Read the IDs first: `addPoints` writes the contacts.
        let regulars = Array(storeRegulars().prefix(Balance.lockUpRegulars))
        for id in regulars { addPoints(id, -Balance.lockUpRegularPoints) }
        log(line)
        save()
        return line
    }
}
