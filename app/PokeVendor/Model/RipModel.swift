import SwiftUI
import Observation

enum RipPhase {
    /// The sealed product, before its packs (a blister, a box, a tin).
    case unbox
    case sealed, opening, open, done
}

/// One pack in the rip queue. A product with several packs gives several entries.
struct QueuedPack: Hashable {
    let sourceID: UUID
    let setSlug: String
    let paidPerPack: Double
    let productName: String
    var productID: String?
    /// True when the product opens in its own step before its first pack.
    var unbox = false
}

/// The moment a card is seen for the first time.
struct Reveal: Equatable {
    let id = UUID()
    let card: RipCard
}

@MainActor @Observable
final class RipModel {
    /// The set of the pack in hand. A mixed product changes set from pack to pack.
    var cardSet: SetData { SetLibrary.set(currentPack?.setSlug ?? "prismatic-evolutions") }
    /// The promo cards that came out when this pack broke its product's seal.
    private(set) var packExtras: [CardPrint] = []
    /// The rip queue. The whole queue is one rip (docs/18-ripping.md, The rip queue).
    private(set) var queue: [QueuedPack]
    let ripID = UUID()
    private(set) var packIndex = 0
    private let store: GameStore?
    /// The value and the cost of the packs that are done.
    private var doneValue: Double = 0
    private var donePaid: Double = 0
    var phase: RipPhase = .sealed
    /// The cards in the hand. Index 0 is the top card: the front card face up, or the back card face down.
    var stack: [RipCard] = []
    /// The cards the player took off the stack. The last card is the top card.
    var pile: [RipCard] = []
    /// The card that is moving around the stack in the pack trick.
    var tuckingID: UUID?
    /// True when the pack trick takes the back card to the front (face up).
    var tuckFromBack = false
    /// The pack trick works once for each pack.
    private(set) var trickDone = false
    /// A face-down hit that the player flipped in place. The next tap sends it to the pile.
    var showcaseID: UUID?
    private(set) var faceUp: Bool
    private(set) var lastReveal: Reveal?
    private var seen: Set<UUID> = []
    /// A demigod pack or a god pack, when this pack is one.
    private(set) var special: SpecialPack?
    /// Changes once for each special pack, when the player has seen two of its special hits.
    private(set) var specialMoment: UUID?
    private var specialSeen = 0
    /// Tests only: the next pack is this special pack kind.
    static var forcedSpecial: String?
    /// The pack in hand came from a resealed product: only filler inside (docs/14-counterfeit-risk.md).
    private(set) var resealed = false
    /// Changes when a resealed pack opens, so the screen shows the banner once for each pack.
    private(set) var resealedMoment: UUID?

    init(items: [SealedItem], store: GameStore?) {
        queue = items.flatMap { item in
            let product = item.brokenFrom == nil ? SetLibrary.product(item.productID) : nil
            let unbox = product.map { $0.kind != "Booster pack" || $0.packs > 1 } ?? false
            return (store?.packSlugs(of: item) ?? Array(repeating: item.setSlug, count: item.packs)).map { slug in
                QueuedPack(sourceID: item.id, setSlug: slug, paidPerPack: item.paidPerPack, productName: item.name,
                           productID: item.productID, unbox: unbox)
            }
        }
        self.store = store
        faceUp = UserDefaults.standard.bool(forKey: "rip.faceUp")
        #if DEBUG
        // Screenshot aid: `-special god` or `-special demigod` makes the first pack special.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-special"), i + 1 < args.count { Self.forcedSpecial = args[i + 1] }
        #endif
        loadPack()
    }

    var currentPack: QueuedPack? { queue.indices.contains(packIndex) ? queue[packIndex] : nil }
    var hasNextPack: Bool { packIndex + 1 < queue.count }
    var ripValue: Double { doneValue + valueSoFar }
    var ripPaid: Double { donePaid + (phase == .sealed || phase == .unbox ? 0 : packCost) }

    private var unboxed: Set<UUID> = []
    /// The product on the unbox screen. It stays until the player moves on to the packs.
    private(set) var unboxing: Product?

    /// The product to open before this pack, if it is still closed.
    var unboxProduct: Product? {
        guard let pack = currentPack, pack.unbox, !unboxed.contains(pack.sourceID) else { return nil }
        return SetLibrary.product(pack.productID)
    }

    /// The set of each pack in the product that is opening.
    var unboxPackSlugs: [String] { queue.filter { $0.sourceID == currentPack?.sourceID }.map(\.setSlug) }

    func openProduct() -> [CardPrint] {
        guard let pack = currentPack else { return [] }
        unboxed.insert(pack.sourceID)
        packExtras = store?.openProduct(pack.sourceID, ripID: ripID) ?? []
        return packExtras
    }

    /// Goes from the opened product to its packs. The pack at `index` of the product's packs rips first.
    func startPacks(at index: Int = 0) {
        guard phase == .unbox else { return }
        let target = packIndex + index
        if index > 0, queue.indices.contains(target), queue[target].sourceID == currentPack?.sourceID {
            // The stack in hand was built for the first pack. A pack from another set needs its own cards.
            let rebuild = queue[target].setSlug != queue[packIndex].setSlug
            queue.swapAt(packIndex, target)
            if rebuild {
                let extras = packExtras
                loadPack()
                packExtras = extras
            }
        }
        unboxing = nil
        phase = .sealed
    }

    var allCards: [RipCard] { pile + stack }
    var packCost: Double { currentPack?.paidPerPack ?? 0 }
    var valueSoFar: Double {
        allCards.filter { seen.contains($0.id) }.reduce(0) { $0 + $1.market } + packExtras.reduce(0) { $0 + ($1.market ?? 0) }
    }
    var net: Double { valueSoFar - packCost }

    /// The card that the info panel describes.
    var focusCard: RipCard? {
        if let id = showcaseID, let card = stack.first(where: { $0.id == id }) { return card }
        return faceUp ? (stack.first ?? pile.last) : pile.last
    }

    /// The player's centering tool, for the cut reading.
    var centeringTool: Int { store?.data.centeringTool ?? 0 }

    /// "Post this pull" shows only when the player has a social media account.
    var canPost: Bool { store?.hasAccount ?? false }

    func postPull(_ card: RipCard) -> SocialPost? {
        store?.post(.pullReveal, subject: card.name, value: card.market)
    }

    func isShownFaceUp(_ card: RipCard) -> Bool {
        faceUp || card.id == showcaseID
    }

    func nextPack() {
        guard hasNextPack else { return }
        doneValue += valueSoFar
        donePaid += packCost
        packIndex += 1
        loadPack()
    }

    private func loadPack() {
        // The builder gives the physical pack order, front card first. A face-down stack is the same cards
        // turned over, so the back card (the Energy) is on top.
        let pack = PackBuilder(cardSet: cardSet, forced: Self.forcedSpecial).build()
        Self.forcedSpecial = nil
        special = pack.special
        specialMoment = nil
        specialSeen = 0
        var cards = pack.cards
        #if DEBUG
        // Screenshot aid: `-sir` puts a Special Illustration Rare in the rare slot.
        if ProcessInfo.processInfo.arguments.contains("-sir"),
           let sir = cardSet.prints.filter({ $0.rarity == "Special illustration rare" }).randomElement() {
            cards[cards.count - 2] = RipCard(print: sir, energy: nil)
        }
        #endif
        // A resealed product was opened and searched. Every hit is gone, and filler took its place.
        resealed = currentPack.flatMap { store?.fakeOf(sourceID: $0.sourceID) } != nil
        resealedMoment = nil
        if resealed {
            special = nil
            let filler = cardSet.prints.filter { ["Common", "Uncommon"].contains($0.rarity) && ($0.market ?? 0) < 1 }
            cards = cards.map { card in
                guard card.isHit, let print = filler.randomElement() else { return card }
                return RipCard(print: print, energy: nil)
            }
        }
        stack = faceUp ? cards : cards.reversed()
        pile = []
        seen = []
        tuckingID = nil
        trickDone = false
        packExtras = []
        showcaseID = nil
        lastReveal = nil
        unboxing = unboxProduct
        phase = unboxing == nil ? .sealed : .unbox
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
        if let pack = currentPack {
            let extras = store?.commitPack(from: pack.sourceID, setSlug: pack.setSlug, paidPerPack: pack.paidPerPack,
                                           ripID: ripID, cards: stack) ?? []
            if !extras.isEmpty { packExtras = extras }
        }
    }

    func finishOpening() {
        phase = .open
        markFrontSeen()
        if resealed, let pack = currentPack {
            store?.foundResealed(sourceID: pack.sourceID, name: pack.productName)
            resealedMoment = UUID()
        }
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

    /// Skips the rest of the pack: every card left goes to the pile, seen, with no hit effects.
    func skipRest() {
        guard phase == .open, !stack.isEmpty else { return }
        showcaseID = nil
        tuckingID = nil
        for card in stack { seen.insert(card.id) }
        pile.append(contentsOf: stack)
        stack = []
        phase = .done
    }

    func returnFromPile() {
        guard phase == .open || phase == .done, let card = pile.popLast() else { return }
        showcaseID = nil
        stack.insert(card, at: 0)
        phase = .open
    }

    /// How many cards this set's pack trick moves.
    var trickCount: Int { max(1, min(cardSet.trick ?? 1, stack.count - 1)) }

    /// Starts the pack trick. It works once for each pack.
    func beginTrick() -> Bool {
        guard phase == .open, stack.count > 1, tuckingID == nil, !trickDone else { return false }
        trickDone = true
        return true
    }

    /// One move of the pack trick. Face up, the back card comes to the front.
    /// Face down, the top card goes to the bottom. Both are the same move on the physical pack.
    func startTuck() {
        guard phase == .open, stack.count > 1, tuckingID == nil else { return }
        showcaseID = nil
        tuckFromBack = faceUp
        tuckingID = faceUp ? stack.last?.id : stack.first?.id
    }

    func finishTuck() {
        guard let id = tuckingID, let index = stack.firstIndex(where: { $0.id == id }) else { return }
        let card = stack.remove(at: index)
        if tuckFromBack { stack.insert(card, at: 0) } else { stack.append(card) }
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
            if let special, special.isSpecialHit(card) {
                specialSeen += 1
                if specialSeen == 2 { specialMoment = UUID() }
            }
        }
    }
}
