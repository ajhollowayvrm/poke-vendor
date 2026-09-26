import SwiftUI
import Observation

enum RipPhase {
    case sealed, opening, open, done
}

/// The moment a card is seen for the first time.
struct Reveal: Equatable {
    let id = UUID()
    let card: RipCard
}

@MainActor @Observable
final class RipModel {
    let cardSet: SetData
    var phase: RipPhase = .sealed
    /// The cards in the hand. Index 0 is the top card: the front card face up, or the back card face down.
    var stack: [RipCard] = []
    /// The cards the player took off the stack. The last card is the top card.
    var pile: [RipCard] = []
    /// The card that is on its way to the back of the stack.
    var tuckingID: UUID?
    /// A face-down hit that the player flipped in place. The next tap sends it to the pile.
    var showcaseID: UUID?
    var packNumber = 0
    private(set) var faceUp: Bool
    private(set) var lastReveal: Reveal?
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
    var focusCard: RipCard? {
        if let id = showcaseID, let card = stack.first(where: { $0.id == id }) { return card }
        return faceUp ? (stack.first ?? pile.last) : pile.last
    }

    func isShownFaceUp(_ card: RipCard) -> Bool {
        faceUp || card.id == showcaseID
    }

    func newPack() {
        // The builder gives pack order, front card first. A face-down stack is the same cards turned over,
        // so the last card of the pack (the Energy) is on top.
        var cards = PackBuilder(cardSet: cardSet).build()
        #if DEBUG
        // Screenshot aid: `-sir` puts a Special Illustration Rare in the rare slot.
        if ProcessInfo.processInfo.arguments.contains("-sir"),
           let sir = cardSet.prints.filter({ $0.rarity == "Special illustration rare" }).randomElement() {
            cards[cards.count - 2] = RipCard(print: sir, energy: nil)
        }
        #endif
        stack = faceUp ? cards : cards.reversed()
        pile = []
        seen = []
        tuckingID = nil
        showcaseID = nil
        lastReveal = nil
        phase = .sealed
        packNumber += 1
        ImageStore.shared.prefetch(stack.compactMap(\.imageURL))
    }

    /// Turning the stack over reverses its order.
    func setFaceUp(_ value: Bool) {
        guard value != faceUp else { return }
        faceUp = value
        UserDefaults.standard.set(value, forKey: "rip.faceUp")
        stack.reverse()
        showcaseID = nil
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

    /// Flips a face-down top card in place, so the player can see a hit before it goes to the pile.
    func showcaseFront() {
        guard phase == .open, !faceUp, let front = stack.first else { return }
        showcaseID = front.id
        reveal(front)
    }

    func sendFrontToPile() {
        guard phase == .open, !stack.isEmpty else { return }
        let card = stack.removeFirst()
        showcaseID = nil
        reveal(card)
        pile.append(card)
        markFrontSeen()
        if stack.isEmpty { phase = .done }
    }

    func returnFromPile() {
        guard phase == .open || phase == .done, let card = pile.popLast() else { return }
        showcaseID = nil
        stack.insert(card, at: 0)
        phase = .open
    }

    func startTuck() {
        guard phase == .open, stack.count > 1, tuckingID == nil else { return }
        showcaseID = nil
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
        reveal(front)
    }

    private func reveal(_ card: RipCard) {
        if seen.insert(card.id).inserted {
            lastReveal = Reveal(card: card)
        }
    }
}
