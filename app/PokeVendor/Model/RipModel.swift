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
    let store: GameStore?
    /// A short note under the mode control, for example why Sift is off.
    var note: String?
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
    /// Hits only: one tear opens every pack in the queue, and the hit slots of all the packs make one stack
    /// (docs/18, Hits only). The player picks it in Inventory, before the rip starts.
    let hitsOnly: Bool
    /// The set of each pack that the Hits only tear opened, in queue order. Nil before that tear.
    private(set) var combinedSlugs: [String]?
    /// The cost of every pack that the Hits only tear opened.
    private var combinedCost: Double?
    /// The cards outside the hit slots. They do not show, but the totals and the summary count them.
    private(set) var aside: [RipCard] = []
    /// Hits only: the pack of each card, by queue order from 0. The stack keeps every pack together.
    private var packOf: [UUID: Int] = [:]
    /// Hits only: the place of each card in the face-up stack.
    private var rankOf: [UUID: Int] = [:]
    /// Hits only: the god pack in the row of tears, by queue order from 0. Its moment plays during the tears.
    private(set) var godIndex: Int?
    /// The cards that count toward the special pack moment. Nil: every card of the pack in hand.
    private var specialIDs: Set<UUID>?
    /// True when the next tear opens every pack left in the queue at once.
    var willCombine: Bool { hitsOnly && combinedSlugs == nil }
    /// The packs that the next Hits only tear opens.
    var packsLeft: Int { queue.count - packIndex }
    private(set) var lastReveal: Reveal?
    private var seen: Set<UUID> = []
    /// A demigod pack or a god pack, when this pack is one.
    private(set) var special: SpecialPack?
    /// Changes once for each special pack, when the player has seen two of its special hits.
    private(set) var specialMoment: UUID?
    private var specialSeen = 0
    /// Tests only: the next pack is this special pack kind.
    static var forcedSpecial: String?
    /// The rip modes this rip allows. A live stream allows Normal and Fast only (docs/18, Ripping on a live stream).
    var allowedModes: [RipMode] = RipMode.allCases {
        didSet { if !allowedModes.contains(mode) { mode = .normal } }
    }
    /// The mode for this rip. It starts from Settings, and the player can change it during the rip.
    var mode: RipMode
    /// A tap in Fast or Sift pauses. The player changes the mode or continues.
    var paused = false
    /// The card that the stop rule stopped on, so the rip does not stop on it twice.
    private(set) var stoppedID: UUID?
    /// The pack in hand came from a resealed product: only filler inside (docs/14-counterfeit-risk.md).
    private(set) var resealed = false
    /// Changes when a resealed pack opens, so the screen shows the banner once for each pack.
    private(set) var resealedMoment: UUID?

    init(items: [SealedItem], store: GameStore?, hitsOnly: Bool = false) {
        queue = items.flatMap { item in
            let product = item.brokenFrom == nil ? SetLibrary.product(item.productID) : nil
            let unbox = product.map { $0.kind != "Booster pack" || $0.packs > 1 } ?? false
            return (store?.packSlugs(of: item) ?? Array(repeating: item.setSlug, count: item.packs)).map { slug in
                QueuedPack(sourceID: item.id, setSlug: slug, paidPerPack: item.paidPerPack, productName: item.name,
                           productID: item.productID, unbox: unbox)
            }
        }
        self.store = store
        self.hitsOnly = hitsOnly
        // Hits only has no modes and no Flip: the player turns every hit by hand, face up.
        faceUp = hitsOnly || UserDefaults.standard.bool(forKey: "rip.faceUp")
        mode = hitsOnly ? .normal : store?.data.settings.ripMode ?? .normal
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
    /// Every card of the pack in hand, with the cards that Hits only put aside.
    var everyCard: [RipCard] { aside + allCards }
    /// Before the Hits only tear, the cost covers every pack that the tear opens.
    var packCost: Double {
        if let combinedCost { return combinedCost }
        if willCombine, phase == .sealed { return queue[packIndex...].reduce(0) { $0 + $1.paidPerPack } }
        return currentPack?.paidPerPack ?? 0
    }
    var valueSoFar: Double {
        everyCard.filter { seen.contains($0.id) }.reduce(0) { $0 + $1.market } + packExtras.reduce(0) { $0 + ($1.market ?? 0) }
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

    /// The hits from the packs that are done.
    private var doneHits: [RipCard] = []
    /// Every hit in the whole rip so far, the pack in hand included.
    var allHits: [RipCard] { doneHits + everyCard.filter { seen.contains($0.id) && $0.isHit } }

    func nextPack() {
        guard hasNextPack else { return }
        doneValue += valueSoFar
        donePaid += packCost
        doneHits += everyCard.filter { seen.contains($0.id) && $0.isHit }
        packIndex += 1
        loadPack()
    }

    private func loadPack() {
        let built = buildCards(currentPack)
        special = built.special
        specialMoment = nil
        specialSeen = 0
        resealed = built.resealed
        resealedMoment = nil
        // A face-down stack is the same cards turned over, so the back card (the Energy) is on top.
        stack = faceUp ? built.cards : built.cards.reversed()
        pile = []
        aside = []
        packOf = [:]
        rankOf = [:]
        godIndex = nil
        specialIDs = nil
        combinedSlugs = nil
        combinedCost = nil
        seen = []
        tuckingID = nil
        trickDone = false
        stoppedID = nil
        packExtras = []
        showcaseID = nil
        lastReveal = nil
        unboxing = willCombine ? nil : unboxProduct
        phase = unboxing == nil ? .sealed : .unbox
        ImageStore.shared.prefetch(stack.compactMap(\.imageURL), upright: true)
    }

    /// Hits only: the packs stay in queue order. Face down, each pack turns over on its own.
    private func combinedOrder(_ cards: [RipCard]) -> [RipCard] {
        cards.sorted {
            let a = packOf[$0.id] ?? 0, b = packOf[$1.id] ?? 0
            if a != b { return a < b }
            let ra = rankOf[$0.id] ?? 0, rb = rankOf[$1.id] ?? 0
            return faceUp ? ra < rb : ra > rb
        }
    }

    /// Hits only: the pack of the card in hand, by queue order from 0, and the number of packs.
    var shownPack: (index: Int, count: Int)? {
        guard let slugs = combinedSlugs, let card = stack.first ?? pile.last else { return nil }
        return (packOf[card.id] ?? 0, slugs.count)
    }

    /// The value of the pack in hand. In Hits only, it is the pack of the card in hand.
    var shownValue: Double {
        guard let i = shownPack?.index else { return valueSoFar }
        return everyCard.filter { packOf[$0.id] == i && seen.contains($0.id) }.reduce(0) { $0 + $1.market }
    }

    /// The cost of the pack in hand. In Hits only, it is the pack of the card in hand.
    var shownCost: Double {
        guard let i = shownPack?.index, queue.indices.contains(queue.count - combinedPacks + i) else { return packCost }
        return queue[queue.count - combinedPacks + i].paidPerPack
    }

    private var combinedPacks: Int { combinedSlugs?.count ?? 0 }

    /// The cards of one pack, in the physical pack order, front card first.
    private func buildCards(_ queued: QueuedPack?) -> (cards: [RipCard], special: SpecialPack?, resealed: Bool) {
        let cardSet = SetLibrary.set(queued?.setSlug ?? "prismatic-evolutions")
        let pack = PackBuilder(cardSet: cardSet, forced: Self.forcedSpecial).build()
        Self.forcedSpecial = nil
        var special = pack.special
        var cards = pack.cards
        #if DEBUG
        // Screenshot aid: `-sir` puts a Special Illustration Rare in the rare slot.
        if ProcessInfo.processInfo.arguments.contains("-sir"),
           let sir = cardSet.prints.filter({ $0.rarity == "Special illustration rare" }).randomElement() {
            cards[cards.count - 2] = RipCard(print: sir, energy: nil)
        }
        // Screenshot aid: `-break` puts a BREAK card at the front, to check the sideways image.
        if ProcessInfo.processInfo.arguments.contains("-break"),
           let card = cardSet.prints.filter({ $0.name.hasSuffix(" BREAK") }).randomElement() {
            cards[0] = RipCard(print: card, energy: nil)
        }
        #endif
        // A resealed product was opened and searched. Every hit is gone, and filler took its place.
        let resealed = queued.flatMap { store?.fakeOf(sourceID: $0.sourceID) } != nil
        if resealed {
            special = nil
            let filler = cardSet.prints.filter { ["Common", "Uncommon"].contains($0.rarity) && ($0.market ?? 0) < 1 }
            cards = cards.map { card in
                guard card.isHit, let print = filler.randomElement() else { return card }
                return RipCard(print: print, energy: nil)
            }
        }
        return (cards, special, resealed)
    }

    /// Hits only: opens every product and every pack left in the queue at once. The cards outside the hit
    /// slots go aside, and the hit slots of all the packs make one stack in queue order (docs/18, Hits only).
    private func openAll() {
        let packs = Array(queue[packIndex...])
        var extras: [CardPrint] = []
        for pack in packs where pack.unbox && !unboxed.contains(pack.sourceID) {
            unboxed.insert(pack.sourceID)
            extras += store?.openProduct(pack.sourceID, ripID: ripID) ?? []
        }
        var hits: [RipCard] = []
        var bulk: [RipCard] = []
        var firstSpecial: SpecialPack?
        var firstSpecialIndex: Int?
        var fakes: [QueuedPack] = []
        for (i, pack) in packs.enumerated() {
            // The stack in hand already holds the first pack's cards.
            let built = i == 0 ? (cards: faceUp ? stack : stack.reversed(), special: special, resealed: resealed)
                               : buildCards(pack)
            extras += store?.commitPack(from: pack.sourceID, setSlug: pack.setSlug, paidPerPack: pack.paidPerPack,
                                        ripID: ripID, cards: built.cards) ?? []
            if built.resealed, !fakes.contains(where: { $0.sourceID == pack.sourceID }) { fakes.append(pack) }
            if firstSpecial == nil, let special = built.special {
                firstSpecial = special
                firstSpecialIndex = i
            }
            for card in built.cards { packOf[card.id] = i }
            // A resealed pack holds only filler, so all of it goes aside. A god pack keeps every card.
            hits += built.resealed ? [] : built.cards.filter(\.keptInHitsOnly)
            bulk += built.resealed ? built.cards : built.cards.filter { !$0.keptInHitsOnly }
        }
        for (i, card) in hits.enumerated() { rankOf[card.id] = i }
        godIndex = firstSpecial?.isGod == true ? firstSpecialIndex : nil
        // A god pack shows itself during the tears. A demigod pack shows itself on its own cards.
        specialIDs = firstSpecialIndex.map { i in
            firstSpecial?.isGod == true ? [] : Set(hits.filter { packOf[$0.id] == i }.map(\.id))
        } ?? []
        for pack in fakes { store?.foundResealed(sourceID: pack.sourceID, name: pack.productName) }
        if !fakes.isEmpty { resealedMoment = UUID() }
        combinedSlugs = packs.map(\.setSlug)
        combinedCost = packs.reduce(0) { $0 + $1.paidPerPack }
        packIndex = queue.count - 1
        special = firstSpecial
        resealed = false
        packExtras = extras
        aside = bulk
        for card in bulk { seen.insert(card.id) }
        pile = []
        stack = combinedOrder(hits)
        trickDone = true
        ImageStore.shared.prefetch(stack.compactMap(\.imageURL), upright: true)
    }

    /// Turning the stack over reverses its order. `remember` saves the choice for the next rip. Sift turns the
    /// cards up for itself and does not save it.
    func setFaceUp(_ value: Bool, remember: Bool = true) {
        guard value != faceUp else { return }
        faceUp = value
        if remember { UserDefaults.standard.set(value, forKey: "rip.faceUp") }
        if combinedSlugs != nil { stack = combinedOrder(stack) } else { stack.reverse() }
        showcaseID = nil
        markFrontSeen()
    }

    func startOpening() {
        guard phase == .sealed else { return }
        phase = .opening
        if willCombine {
            openAll()
        } else if let pack = currentPack {
            let extras = store?.commitPack(from: pack.sourceID, setSlug: pack.setSlug, paidPerPack: pack.paidPerPack,
                                           ripID: ripID, cards: stack) ?? []
            if !extras.isEmpty { packExtras = extras }
        }
    }

    func finishOpening() {
        phase = .open
        if stack.isEmpty { phase = .done }
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

    /// False when the set's rare slot is already the back card, for example in an EX-era pack (trick 0).
    var trickNeeded: Bool { (cardSet.trick ?? 0) > 0 }

    /// How many cards this set's pack trick moves: every card behind the rare slot (tools/export/rip_set.py).
    var trickCount: Int { max(0, min(cardSet.trick ?? 0, stack.count - 1)) }

    /// Starts the pack trick. It works once for each pack.
    func beginTrick() -> Bool {
        guard phase == .open, trickCount > 0, tuckingID == nil, !trickDone else { return false }
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

    // MARK: - Fast and Sift

    /// True when Fast or Sift must stop on this card (docs/18, The stop rule). A resealed pack stops once, on
    /// its first card.
    func shouldStop(_ card: RipCard) -> Bool {
        if card.id == stoppedID { return false }
        if resealed { return pile.isEmpty }
        guard let slug = currentPack?.setSlug else { return card.isHit }
        return store?.stops(card, in: slug) ?? card.isHit
    }

    /// Stops on the card in hand: it stays on top, face up, and the rip waits for the player.
    func stop(on card: RipCard) {
        stoppedID = card.id
        paused = true
        if !faceUp { showcaseID = card.id }
        reveal(card)
    }

    func resume() {
        paused = false
    }

    /// Sift: no animation. The pack opens, the cards go to the pile in order, and the rip stops only on a card
    /// that matches the stop rule. Returns the card it stopped on, or nil when the pack is done.
    @discardableResult
    func sift() -> RipCard? {
        if phase == .unbox {
            openProduct()
            startPacks()
        }
        if phase == .sealed { startOpening() }
        if phase == .opening { finishOpening() }
        if !faceUp { setFaceUp(true, remember: false) }
        trickDone = true
        while phase == .open, let front = stack.first {
            if front.print != nil, shouldStop(front) {
                stop(on: front)
                return front
            }
            sendFrontToPile()
        }
        return nil
    }

    private func reveal(_ card: RipCard) {
        if seen.insert(card.id).inserted {
            lastReveal = Reveal(card: card)
            if let special, special.isSpecialHit(card), specialIDs?.contains(card.id) ?? true {
                specialSeen += 1
                if specialSeen == 2 { specialMoment = UUID() }
            }
        }
    }
}
