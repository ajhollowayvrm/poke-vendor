import Foundation

// The quick shift at the store counter (docs/39-store-shift.md, docs/proposals/shop-experience.md part 2). It rings up
// the routine buyers, the ones who pay the price on the item, and stops at the first person who needs a choice.

@MainActor
extension ShowSession {
    /// A routine buyer: a straight buy at the store, with no job, no collection, and no kid (the gift is a choice). A
    /// regular at Trusted or higher stops the run, because the player may want to talk.
    func isRoutine(_ v: Visitor) -> Bool {
        guard venue.kind == .store, v.intent == .buy, v.straight, v.type != .kid, v.event == nil, v.collection == nil,
              v.advice == nil else { return false }
        if let id = v.contactID, store.level(id).rank >= StandingLevel.trusted.rank { return false }
        return true
    }

    /// Rings up routine buyers through the normal sale, with its payment and fake checks. It stops at the first buyer who
    /// is not routine, at a sale that falls through, or at closing time. Returns the sales and their total.
    @discardableResult
    func quickShift() -> (count: Int, total: Double) {
        var count = 0
        var total = 0.0
        for _ in 0..<500 {
            guard phase == .table, !isOver, let v = visitor, isRoutine(v) else { break }
            let before = sold.count
            accept()
            // A sale that fell through (a caught fake, a walk-out at the register) stops the run: the player looks.
            guard sold.count > before else { break }
            count += sold.count - before
            total += sold.suffix(sold.count - before).reduce(0) { $0 + $1.price }
        }
        if count > 0 { note = "Rang up \(count) sale\(count == 1 ? "" : "s") for \(money(total))." }
        return (count, total)
    }
}
