import Foundation

// A visit that survives a quit (docs/40-resume-events.md). A show day, a meet, a sale, an opportunity, or the store
// counter keeps its session in the save. The player can step out to the hub and come back. While a visit runs, the
// day cannot end, and no other timed action can start.

@MainActor
extension GameStore {
    /// The session from the save, after a quit.
    func restoreActiveEvent() {
        guard let snap = data.activeEvent else { return }
        activeEvent = ShowSession(snapshot: snap, store: self)
    }

    /// The visit's screen opens, new or again. The store counter's money uses the business account while it is open.
    func enterEvent(_ session: ShowSession) {
        activeEvent = session
        counterSession = session.venue.kind == .store ? session : nil
        session.reconcile()
        save()
    }

    /// The player goes back to the hub. The visit waits, with its clock stopped.
    func stepOut(of session: ShowSession) {
        counterSession = nil
        log("Stepped out of \(session.venue.name) at \(session.clock). It waits for you on the hub.")
        save()
    }

    /// The visit is over: `finishEncounter` calls it first.
    func endActiveEvent() {
        activeEvent = nil
        data.activeEvent = nil
    }

    /// Why a timed action, another visit, or End Day must wait, or nil.
    var eventBlock: String? {
        activeEvent.map { "You are at \($0.venue.name) · go back or leave first" }
    }
}
