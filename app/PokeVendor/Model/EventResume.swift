import Foundation

// A visit that survives a quit (docs/40-resume-events.md). A show day, a meet, a sale, an opportunity, or the store
// counter keeps its session in the save. The player can step out to the hub and come back. While a visit runs, the
// day cannot end, and no other timed action can start.

@MainActor
extension GameStore {
    /// The session from the save, after a quit.
    func restoreActiveEvent() {
        if let snap = data.activeEvent { activeEvent = ShowSession(snapshot: snap, store: self) }
        if let snap = data.activeStream { activeStream = StreamSession(snapshot: snap, store: self) }
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

    /// The store counter, when it is the visit that waits. Its buttons open it again.
    var waitingCounter: ShowSession? { activeEvent?.venue.kind == .store ? activeEvent : nil }

    /// Why a timed action, another visit, or End Day must wait, or nil.
    var eventBlock: String? {
        if let event = activeEvent { return "You are at \(event.venue.name) · go back or leave first" }
        if data.activeStoreRun != nil { return "You are on a store run · finish it first" }
        if activeStream != nil { return "You are live · end the stream first" }
        return nil
    }

    // MARK: - Store runs

    /// Saves the run's progress after a stop changes.
    func updateStoreRun(_ change: (inout StoreRunState) -> Void) {
        guard var run = data.activeStoreRun else { return }
        change(&run)
        data.activeStoreRun = run
        save()
    }

    func endStoreRun() {
        data.activeStoreRun = nil
        save()
    }
}

/// A store run in progress: the stops, and how far the player got (docs/40-resume-events.md).
struct StoreRunState: Codable, Hashable {
    let stops: [LocalStore]
    let startHour: Double
    var index = 0
    /// The hours spent waiting for a vendor. Every later arrival moves by this time.
    var waited = 0.0
    var spent = 0.0
    var bought: [String] = []
    /// A game shop's points at the start, for the summary.
    var startPoints: [String: Int] = [:]
}
