import SwiftUI
import Observation

enum RipPhase {
    case sealed, opening, open, done
}

@MainActor @Observable
final class RipModel {
    let cardSet: SetData
    var phase: RipPhase = .sealed
    /// The cards in the hand. Index 0 is the front card.
    var stack: [RipCard] = []
    /// The cards the player took off the stack. The last card is the top card.
    var pile: [RipCard] = []
    /// The card that is on its way to the back of the stack.
    var tuckingID: UUID?
    var packNumber = 0
    private(set) var faceUp: Bool
    private var seen: Set<UUID> = []

    init(slug: String) {
        cardSet = SetData.load(slug)
        faceUp = UserDefaults.standard.bool(forKey: "rip.faceUp")
        newPack()
    }

    var allCards: [RipCard] { pile + stack }
    var packCost: Double { cardSet.packCost ?? 0 }
    var valueSoFar: Double { allCards.filter { seen.contains($0.id) }.reduce(0) { $0 + $1.market } }
    var net: Double { valueSoFar - packCost }

    /// The card that the info panel describes.
    var focusCard: RipCard? { faceUp ? (stack.first ?? pile.last) : pile.last }

    func newPack() {
        stack = PackBuilder(cardSet: cardSet).build()
        pile = []
        seen = []
        tuckingID = nil
        phase = .sealed
        packNumber += 1
        ImageStore.shared.prefetch(stack.compactMap(\.imageURL))
    }

    func setFaceUp(_ value: Bool) {
        faceUp = value
        UserDefaults.standard.set(value, forKey: "rip.faceUp")
        markFrontSeen()
    }

    func startOpening() {
        guard phase == .sealed else { return }
        phase = .opening
    }

    func finishOpening() {
        phase = .open
        markFrontSeen()
    }

    func sendFrontToPile() {
        guard phase == .open, !stack.isEmpty else { return }
        let card = stack.removeFirst()
        seen.insert(card.id)
        pile.append(card)
        markFrontSeen()
        if stack.isEmpty { phase = .done }
    }

    func returnFromPile() {
        guard phase == .open || phase == .done, let card = pile.popLast() else { return }
        stack.insert(card, at: 0)
        phase = .open
    }

    func startTuck() {
        guard phase == .open, stack.count > 1, tuckingID == nil else { return }
        tuckingID = stack.first?.id
    }

    func finishTuck() {
        guard let id = tuckingID, let index = stack.firstIndex(where: { $0.id == id }) else { return }
        stack.append(stack.remove(at: index))
        tuckingID = nil
        markFrontSeen()
    }

    private func markFrontSeen() {
        guard faceUp, phase == .open || phase == .done, let front = stack.first else { return }
        seen.insert(front.id)
    }
}
