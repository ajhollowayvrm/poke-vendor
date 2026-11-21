import Foundation

// Collections (docs/33-collections.md). People bring a whole collection to the player's table or store: a binder or a
// box with a few good cards, maybe a slab or sealed product, and a pile of bulk. The player offers for all of it, or
// cherry-picks the good cards, and pays in cash, store credit, or a trade. Some people only ask whether a card is worth
// grading. eBay sells collection lots blind: the contents show only when the box arrives.

extension Balance {
    /// The share of sellers who bring a whole collection: at a table, and at the player's store counter.
    static let collectionShare = 0.22
    static let collectionStoreShare = 0.35
    /// The share of sellers who only ask whether to grade a card.
    static let adviceShare = 0.12
    /// Cherry-picking: the seller adds this share of market to their prices, and some refuse it.
    static let cherryPremium = 0.15
    static let cherryRefuseChance = 0.4
    /// A seller who wants credit or a trade takes it at this share of their lowest cash price.
    static let preferredPayDiscount = 0.9
    /// What bulk is worth to a dealer, as a share of its market: shops pay half in store credit only, and it takes
    /// time to sort.
    static let collectionBulkShare = 0.25
    /// An eBay seller sells a card of this much or more on its own, so a lot stays under it.
    static let ebayLotMax = 2_500.0
    /// An offer under this share of market is a lowball on a collection.
    static let collectionLowball = 0.4
    /// Grading advice: the reputation for the right answer and the cost of the wrong one, the lie-and-buy price as a
    /// share of the raw market, and the gap in dollars that makes either answer right.
    static let adviceRightRep = 2
    static let adviceWrongRep = 1
    static let adviceBuyShare = 0.7
    static let adviceCloseCall = 5.0
    /// eBay collection lots: how many listings, how often they change, the shipping, and the days in transit.
    static let ebayLotCount = 4
    static let ebayLotDays = 3
    static let ebayLotShipping = 15.0
    static let ebayLotShipDays = 3...5
    /// The share of eBay lots that someone already searched for the good cards, and the share of those that say
    /// "unsearched" anyway.
    static let ebaySearchedShare = 0.4
    static let ebaySearchedLie = 0.5
    /// How much a listing shows, as shares: no photos, some photos, a card list, and full documentation.
    static let lotDocsShares: [(LotDocs, Double)] = [(.blind, 0.25), (.photos, 0.4), (.cardList, 0.2), (.full, 0.15)]
    /// The chance that a seller answers "Ask for more photos".
    static let lotPhotoReply = 0.65
    /// Saved searches: more listings, and new ones every day.
    static let ebayLotCountSaved = 6
    static let ebayLotDaysSaved = 1
    /// Seller research flags a seller who sells singles from their lots: most liars, and a few honest sellers.
    static let researchFlagLiar = 0.8
    static let researchFlagHonest = 0.1
    /// The worth per card of a lot of each kind before a search, until the game has seen some lots.
    static let lotRateStart = 1.0
}

/// The kinds of collection that people bring.
enum CollectionTheme: String, Codable, CaseIterable, Hashable {
    case childhoodBinder, modernBinder, mixedBox, estate

    var label: String {
        switch self {
        case .childhoodBinder: "Childhood binder"
        case .modernBinder: "Modern binder"
        case .mixedBox: "Shoebox of mixed cards"
        case .estate: "Estate collection"
        }
    }

    var sets: [String] {
        switch self {
        case .childhoodBinder, .estate: Balance.vintageSets + Balance.olderSets
        case .modernBinder: Balance.modernSets
        case .mixedBox: Balance.vintageSets + Balance.olderSets + Balance.modernSets
        }
    }

    /// Old collections were handled for years. A modern binder is mostly clean.
    var played: Bool {
        switch self {
        case .childhoodBinder, .estate: true
        case .modernBinder: false
        case .mixedBox: Bool.random()
        }
    }

    var singles: ClosedRange<Int> {
        switch self {
        case .childhoodBinder: 6...16
        case .modernBinder: 8...20
        case .mixedBox: 6...14
        case .estate: 10...24
        }
    }

    var slabs: ClosedRange<Int> {
        switch self {
        case .childhoodBinder: 0...0
        case .modernBinder: 0...2
        case .mixedBox: 0...1
        case .estate: 0...3
        }
    }

    var sealed: ClosedRange<Int> {
        switch self {
        case .childhoodBinder: 0...1
        case .modernBinder: 0...2
        case .mixedBox: 0...3
        case .estate: 1...3
        }
    }

    var bulk: ClosedRange<Int> {
        switch self {
        case .childhoodBinder: 60...250
        case .modernBinder: 100...400
        case .mixedBox: 80...300
        case .estate: 150...500
        }
    }

    var sellerLine: String {
        switch self {
        case .childhoodBinder: "This was my binder as a kid. I'm finally letting it go."
        case .modernBinder: "I'm done collecting. Here's my binder and the rest of my cards."
        case .mixedBox: "I found this box of cards when I moved."
        case .estate: "These were my dad's. I don't know what any of it is worth."
        }
    }

    var ebayTitle: String {
        switch self {
        case .childhoodBinder: "Vintage Pokemon binder lot - holos!"
        case .modernBinder: "HUGE modern Pokemon card lot - ex, full arts"
        case .mixedBox: "Shoebox of Pokemon cards - old and new"
        case .estate: "Estate Pokemon collection - binders, slabs, sealed"
        }
    }
}

/// One good item in a collection: a single, a slab, or sealed product. The bulk is apart.
struct CollectionPiece: Codable, Identifiable, Hashable {
    var id = UUID()
    let goods: VendorGoods
    let market: Double
    /// Hidden: the item is a fake. `looksOff` is the player's look by eye.
    var fake: FakeTier?
    var looksOff = false

    var name: String { VendorItem(goods: goods, price: 0, market: nil).name }

    var isSealed: Bool {
        if case .sealed = goods { return true }
        return false
    }

    var slug: String? {
        switch goods {
        case .single(_, let s, _), .slab(_, let s, _): s
        case .sealed(let p): p.homeSlug
        case .mystery: nil
        }
    }
}

/// A whole collection: the good items, and the bulk by set.
struct CollectionLot: Codable, Hashable {
    let theme: CollectionTheme
    var pieces: [CollectionPiece]
    /// Commons and uncommons under $1, by set.
    var bulk: [String: [CardPrint]]
    /// The wear of the bulk, as a share of the Near Mint price.
    var bulkWear: Double

    var bulkCount: Int { bulk.values.reduce(0) { $0 + $1.count } }
    var bulkValue: Double { bulk.values.reduce(0) { $0 + $1.reduce(0) { $0 + ($1.market ?? 0) } } * bulkWear }
    var piecesMarket: Double { pieces.reduce(0) { $0 + $1.market } }
    var market: Double { piecesMarket + bulkValue }
    /// What the collection is worth to a dealer: the good items at market, and the bulk at a share of its market. Prices,
    /// offers, and the cost split use it.
    var dealValue: Double { piecesMarket + bulkValue * Balance.collectionBulkShare }

    /// For example "212 cards: 14 singles, 1 slab, 196 bulk, and 2 sealed".
    var summary: String {
        let singles = pieces.filter { if case .single = $0.goods { return true }; return false }.count
        let slabs = pieces.filter { if case .slab = $0.goods { return true }; return false }.count
        let sealed = pieces.filter(\.isSealed).count
        var parts = ["\(singles) single\(singles == 1 ? "" : "s")"]
        if slabs > 0 { parts.append("\(slabs) slab\(slabs == 1 ? "" : "s")") }
        parts.append("\(bulkCount) bulk")
        var text = "\(singles + slabs + bulkCount) cards: " + parts.joined(separator: ", ")
        if sealed > 0 { text += ", and \(sealed) sealed" }
        return text
    }

    /// A new collection. Most cards are cheap, and now and then one is a real find. Fakes roll by the source.
    @MainActor
    static func make(_ theme: CollectionTheme, fakes source: FakeSource, tired: Double) -> CollectionLot {
        let played = theme.played
        // A real collection centers on a few sets. Fewer sets also means fewer set files to load.
        // A 1st Edition set file is not its own set here. randomPrint turns a card 1st Edition now and then.
        let sets = Array(theme.sets.filter { !SetLibrary.isFirstEdition($0) }.shuffled().prefix(Int.random(in: 2...4)))
        var pieces: [CollectionPiece] = []
        for _ in 0..<Int.random(in: theme.singles) {
            let hit = Double.random(in: 0..<1) < 0.15
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: hit ? 40 : 1.5, maxMarket: hit ? .infinity : 40)
            else { continue }
            let condition = played ? Condition.played() : .packFresh()
            let market = (print.market ?? 0) * condition.wear.valueFactor
            guard market >= 1 else { continue }
            pieces.append(CollectionPiece(goods: .single(print, slug: slug, condition: condition), market: market))
        }
        for _ in 0..<Int.random(in: theme.slabs) {
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: 10) else { continue }
            let grade = SlabGrade(company: Bool.random() ? .psa : .cgc, grade: [7.0, 8, 9, 9, 10].randomElement() ?? 9)
            let market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            pieces.append(CollectionPiece(goods: .slab(print, slug: slug, grade: grade), market: market))
        }
        let old = theme == .childhoodBinder || theme == .estate
        for _ in 0..<Int.random(in: theme.sealed) {
            let pool = VendorFloor.sealedPool(vintage: old ? 0.5 : 0.1, older: 0.3)
            guard let product = SetLibrary.catalog.filter({ pool.contains($0.homeSlug) && $0.market > 0 }).randomElement() else { continue }
            pieces.append(CollectionPiece(goods: .sealed(product), market: product.market))
        }
        for i in pieces.indices {
            pieces[i].fake = Counterfeit.roll(source: source, sealed: pieces[i].isSealed, slug: pieces[i].slug, market: pieces[i].market)
            if let fake = pieces[i].fake { pieces[i].looksOff = Counterfeit.eyeballCatches(fake, tired: tired) }
        }
        var bulk: [String: [CardPrint]] = [:]
        let commons = Dictionary(uniqueKeysWithValues: sets.map { slug in
            (slug, SetLibrary.set(slug).prints.filter { ($0.market ?? 0) < 1 && ["Common", "Uncommon"].contains($0.rarity) })
        })
        for _ in 0..<Int.random(in: theme.bulk) {
            guard let slug = sets.randomElement() else { break }
            if let print = commons[slug]?.randomElement() { bulk[slug, default: []].append(print) }
        }
        return CollectionLot(theme: theme, pieces: pieces.sorted { $0.market > $1.market }, bulk: bulk,
                             bulkWear: played ? Double.random(in: 0.6...0.85) : Double.random(in: 0.9...1.0))
    }
}

/// What a collection seller would like to get.
enum CollectionWant: Hashable {
    case cash, credit, trade

    var line: String {
        switch self {
        case .cash: "Cash is best."
        case .credit: "I'd take store credit. I play here."
        case .trade: "I'd rather trade for something on your table."
        }
    }
}

/// A card that someone asks about: grade it, or keep it raw. `worth` is hidden: what grading at PSA's cheapest tier is
/// worth over the raw card, on average.
struct AdviceAsk: Hashable {
    let print: CardPrint
    let slug: String
    let condition: Condition
    let worth: Double
}

/// How much an eBay listing shows.
enum LotDocs: String, Codable, Hashable {
    /// A title and a card count.
    case blind
    /// A few photos.
    case photos
    /// Every good card by name, priced at Near Mint. The conditions are not stated.
    case cardList
    /// Front and back photos of every good card.
    case full

    var label: String {
        switch self {
        case .blind: "NO PHOTOS"
        case .photos: "PHOTOS"
        case .cardList: "CARD LIST"
        case .full: "FULLY DOCUMENTED"
        }
    }
}

/// An eBay collection lot. How much the listing shows depends on the seller: nothing, a few photos, a card list, or
/// every card. The rest shows only when the box arrives.
struct EbayLot: Codable, Identifiable, Hashable {
    var id = UUID()
    let title: String
    let lot: CollectionLot
    /// The pieces in the photos.
    var shown: [UUID]
    /// The truth: someone already took the good cards out.
    let searched: Bool
    /// What the listing says.
    let claimsUnsearched: Bool
    let price: Double
    /// The card count in the title, rounded down to 50.
    let listedCards: Int
    var docs: LotDocs = .photos
    /// The player asked the seller for more photos. It works once.
    var asked = false
    /// The seller's feedback score and sales count, as eBay shows them.
    var feedback = 99.5
    var sales = 200
    /// Seller research finds singles from the seller's lots for sale. Most "unsearched" liars do it.
    var sellsSingles = false

    var shownPieces: [CollectionPiece] { lot.pieces.filter { shown.contains($0.id) } }
    /// The good items that the listing shows: every one in a card list or full documentation, else the photos.
    var visiblePieces: [CollectionPiece] { docs == .cardList || docs == .full ? lot.pieces : shownPieces }
    var total: Double { price + Balance.ebayLotShipping }

    /// What a card list says an item is worth: a single at its Near Mint price, whatever its true condition.
    static func listedValue(_ piece: CollectionPiece) -> Double {
        if case .single(let print, _, _) = piece.goods { return print.market ?? piece.market }
        return piece.market
    }
}

/// A save from before the listing levels has none of the new fields. A lot on its way must still load.
extension EbayLot {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        lot = try c.decode(CollectionLot.self, forKey: .lot)
        shown = try c.decode([UUID].self, forKey: .shown)
        searched = try c.decode(Bool.self, forKey: .searched)
        claimsUnsearched = try c.decode(Bool.self, forKey: .claimsUnsearched)
        price = try c.decode(Double.self, forKey: .price)
        listedCards = try c.decode(Int.self, forKey: .listedCards)
        docs = try c.decodeIfPresent(LotDocs.self, forKey: .docs) ?? .photos
        asked = try c.decodeIfPresent(Bool.self, forKey: .asked) ?? false
        feedback = try c.decodeIfPresent(Double.self, forKey: .feedback) ?? 99.5
        sales = try c.decodeIfPresent(Int.self, forKey: .sales) ?? 200
        sellsSingles = try c.decodeIfPresent(Bool.self, forKey: .sellsSingles) ?? false
    }
}

/// An eBay lot on its way.
struct LotOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let listing: EbayLot
    let arrivalDay: Int
}

@MainActor
extension GameStore {
    /// How a collection is paid for. A trade gives table items. A prepaid lot was paid when the player bought it.
    enum CollectionPayment {
        case cash, credit(Double), trade([ShowItem]), prepaid
    }

    /// Adds a bought collection to Inventory: all of it with its bulk (`pieces` nil), or only the picked pieces. The
    /// price splits by market. Each item gets its share as its cost. The bulk's share goes into the paid total of the
    /// portfolio header, as a moved bulk group does.
    func receiveCollection(_ lot: CollectionLot, pieces ids: Set<UUID>?, price: Double, payment: CollectionPayment,
                           from seller: String, at venue: String) {
        let chosen = ids.map { picked in lot.pieces.filter { picked.contains($0.id) } } ?? lot.pieces
        let withBulk = ids == nil
        let bulkWeight = withBulk ? lot.bulkValue * Balance.collectionBulkShare : 0
        let market = chosen.reduce(0) { $0 + $1.market } + bulkWeight
        guard market > 0 else { return }
        let day = data.day
        // Build every new item first, so nothing reads `data` while it changes.
        var cards: [OwnedCard] = []
        var slabs: [OwnedCard] = []
        var sealed: [SealedItem] = []
        for piece in chosen {
            let paid = (price * piece.market / market * 100).rounded() / 100
            let known: Bool? = piece.looksOff && piece.fake != nil ? true : nil
            switch piece.goods {
            case .single(let print, let slug, let condition):
                var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: paid, ripID: nil, condition: condition,
                                     acquiredDay: day)
                card.fake = piece.fake
                card.fakeKnown = known
                cards.append(card)
            case .slab(let print, let slug, let grade):
                var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: paid, ripID: nil, grade: grade, acquiredDay: day)
                card.fake = piece.fake
                card.fakeKnown = known
                slabs.append(card)
            case .sealed(let product):
                var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: paid,
                                      acquired: .now, source: "\(seller), \(venue)", productID: product.id, acquiredDay: day)
                item.fake = piece.fake
                item.fakeKnown = known
                sealed.append(item)
            case .mystery:
                break
            }
        }
        let groups = withBulk ? lot.bulk.map { slug, prints in
            BulkGroup(ripID: UUID(), setSlug: slug, date: .now, cards: prints, day: day, moved: true, wearFactor: lot.bulkWear)
        } : []
        let bulkPaid = price * bulkWeight / market

        var label = "Collection · \(chosen.count + (withBulk ? lot.bulkCount : 0)) items · \(seller)"
        switch payment {
        case .cash:
            addLedger(-price, .singles, label)
        case .credit(let credit):
            addStoreCredit(credit)
            label += " (store credit)"
        case .trade(let give):
            let giveIDs = Set(give.map(\.id))
            data.raw.removeAll { giveIDs.contains($0.id) }
            data.slabs.removeAll { giveIDs.contains($0.id) }
            data.sealed.removeAll { giveIDs.contains($0.id) }
            label += " (traded \(give.map(\.name).joined(separator: ", ")))"
        case .prepaid:
            break
        }
        data.raw += cards
        data.slabs += slabs
        data.sealed += sealed
        data.bulk += groups
        data.openedPaid += bulkPaid
        let what = withBulk ? lot.summary : "\(chosen.count) item\(chosen.count == 1 ? "" : "s") from a collection"
        var cash: Double?
        if case .cash = payment { cash = -price }
        log("Bought \(what) from \(seller) at \(venue) for \(money(price)).", cash: cash)
        save()
    }

    // MARK: Grading advice

    /// What grading at PSA's cheapest tier is worth over the raw card: the average slab value of 40 grade rolls, less
    /// the fee and the raw market. Above 0, the card is worth grading.
    static func gradingWorth(_ print: CardPrint, slug: String, condition: Condition) -> Double {
        let fee = GradingTier.psaStandard.fee
        let raw = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, condition: condition).market
        let rolls = 40
        var total = 0.0
        for _ in 0..<rolls {
            let grade = gradeResult(condition, company: .psa)
            total += OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, grade: grade).market
        }
        return total / Double(rolls) - fee - raw
    }

    // MARK: eBay collection lots

    /// New listings every few days, or every day with saved searches. The old ones sell to someone else.
    func refreshEbayLots() {
        let saved = hasUpgrade(.savedSearch)
        let days = saved ? Balance.ebayLotDaysSaved : Balance.ebayLotDays
        guard data.ebayLots.isEmpty || data.day - data.ebayLotsDay >= days else { return }
        data.ebayLots = (0..<(saved ? Balance.ebayLotCountSaved : Balance.ebayLotCount)).map { _ in makeEbayLot() }
        data.ebayLotsDay = data.day
    }

    /// The worth per card of an unsearched lot of this kind, from the lots the game made so far.
    func lotRate(_ theme: CollectionTheme) -> Double { data.lotRates[theme.rawValue] ?? Balance.lotRateStart }

    private func makeEbayLot() -> EbayLot {
        let theme = CollectionTheme.allCases.randomElement() ?? .mixedBox
        var lot = CollectionLot.make(theme, fakes: .ebay, tired: eyeFactor)
        // Photos do not show what an eye at the table would see. The look happens when the box arrives.
        for i in lot.pieces.indices { lot.pieces[i].looksOff = false }
        while lot.dealValue > Balance.ebayLotMax, lot.pieces.count > 1 { lot.pieces.removeFirst() }
        let fullMarket = lot.dealValue
        let count = max(1, lot.pieces.filter { !$0.isSealed }.count + lot.bulkCount)
        // Learn what a lot of this kind is worth per card, before anyone searches it.
        let sample = fullMarket / Double(count)
        data.lotRates[theme.rawValue] = data.lotRates[theme.rawValue].map { $0 * 0.7 + sample * 0.3 } ?? sample
        let docs = Self.rollDocs()
        let searched = Double.random(in: 0..<1) < Balance.ebaySearchedShare
        if searched {
            // Someone took the good cards out. A few cheap ones stay.
            lot.pieces = Array(lot.pieces.filter { $0.market < 15 }.prefix(3))
        }
        // A card list or full documentation shows the truth, so only a blind or photo listing can lie.
        let canLie = docs == .blind || docs == .photos
        let lies = canLie && searched && Double.random(in: 0..<1) < Balance.ebaySearchedLie
        let listed = max(50, count / 50 * 50)
        let basis: Double = switch docs {
        // Nothing to see, so the price comes from the card count and the kind of lot.
        case .blind: Double(listed) * lotRate(theme) * Double.random(in: 0.45...0.85)
        // An honest listing prices what is in the box. An "unsearched" lie prices what used to be in it.
        case .photos: searched && !lies ? lot.dealValue * Double.random(in: 0.8...1.15) : fullMarket * Double.random(in: 0.55...1.0)
        // A card list prices every card at Near Mint, so played cards cost too much.
        case .cardList: (lot.pieces.reduce(0) { $0 + EbayLot.listedValue($1) } + lot.bulkValue * Balance.collectionBulkShare)
            * Double.random(in: 0.7...0.95)
        // Full documentation: little risk, and little upside.
        case .full: lot.dealValue * Double.random(in: 0.85...1.05)
        }
        // The photos show the best cards. Sometimes the seller did not know which ones those were.
        let shown: [CollectionPiece] = docs != .photos ? []
            : Double.random(in: 0..<1) < 0.8 ? Array(lot.pieces.prefix(Int.random(in: 1...3))) : Array(lot.pieces.shuffled().prefix(2))
        var listing = EbayLot(title: theme.ebayTitle, lot: lot, shown: shown.map(\.id), searched: searched,
                              claimsUnsearched: canLie ? !searched || lies : !searched, price: max(10, ShowSession.round(basis)),
                              listedCards: listed, docs: docs)
        listing.feedback = lies ? Double.random(in: 94...99.5) : Double.random(in: 98.5...100)
        listing.feedback = (listing.feedback * 10).rounded() / 10
        listing.sales = Int.random(in: 20...3_000)
        listing.sellsSingles = Double.random(in: 0..<1) < (lies ? Balance.researchFlagLiar : Balance.researchFlagHonest)
        return listing
    }

    private static func rollDocs() -> LotDocs {
        var roll = Double.random(in: 0..<1)
        for (docs, share) in Balance.lotDocsShares {
            if roll < share { return docs }
            roll -= share
        }
        return .photos
    }

    /// The lot appraisal app: a range for what the lot is worth to a dealer, from what the listing shows. It does not
    /// know whether someone searched the lot.
    func appraisal(_ listing: EbayLot) -> ClosedRange<Double> {
        let rate = lotRate(listing.lot.theme) * Double(listing.listedCards)
        let shown = listing.visiblePieces.reduce(0) { $0 + $1.market }
        switch listing.docs {
        case .full:
            return listing.lot.dealValue...listing.lot.dealValue
        case .cardList:
            let listed = listing.lot.pieces.reduce(0) { $0 + EbayLot.listedValue($1) } + listing.lot.bulkValue * Balance.collectionBulkShare
            return listed * 0.65...listed
        case .photos:
            let base = max(shown, rate)
            return base * 0.6...base * 1.3
        case .blind:
            return rate * 0.4...rate * 1.4
        }
    }

    /// Asks the seller for more photos. It works once for each listing. Returns the reply.
    func askForPhotos(_ id: UUID) -> String {
        guard let i = data.ebayLots.firstIndex(where: { $0.id == id }), !data.ebayLots[i].asked else { return "You asked already." }
        data.ebayLots[i].asked = true
        defer { save() }
        guard Double.random(in: 0..<1) < Balance.lotPhotoReply else { return "The seller did not reply." }
        var listing = data.ebayLots[i]
        let hidden = listing.lot.pieces.filter { !listing.shown.contains($0.id) }.shuffled()
        let reply: String
        switch listing.docs {
        case .blind, .photos:
            if hidden.isEmpty {
                reply = "The seller wrote back: \"That's all the good stuff. The rest is bulk.\""
            } else if listing.docs == .photos, Double.random(in: 0..<1) < 0.3 {
                listing.docs = .cardList
                reply = "The seller sent a list of every good card."
            } else {
                listing.shown += hidden.prefix(2).map(\.id)
                listing.docs = .photos
                reply = "The seller sent \(min(2, hidden.count)) more photo\(hidden.count == 1 ? "" : "s")."
            }
        case .cardList:
            listing.docs = .full
            reply = "The seller sent front and back photos of every card."
        case .full:
            reply = "The listing already shows every card."
        }
        data.ebayLots[i] = listing
        return reply
    }

    /// Buys an eBay lot. Returns a problem, or nil when it worked.
    func buyEbayLot(_ id: UUID) -> String? {
        guard let i = data.ebayLots.firstIndex(where: { $0.id == id }) else { return "That lot sold." }
        let listing = data.ebayLots[i]
        guard canAfford(listing.total) else { return "You need \(money(listing.total))." }
        addLedger(-listing.total, .singles, "eBay collection lot · \(listing.title)")
        data.ebayLots.remove(at: i)
        let days = Int.random(in: Balance.ebayLotShipDays)
        data.lotOrders.append(LotOrder(listing: listing, arrivalDay: data.day + days))
        log("Bought an eBay collection lot for \(money(listing.total)): \(listing.title). It arrives in \(days) days.", cash: -listing.total)
        save()
        return nil
    }

    /// End Day: the lots that arrive go into Inventory, and the morning report shows what was in the box.
    func lotOrdersEndDay() -> [String] {
        let day = data.day
        let arrived = data.lotOrders.filter { $0.arrivalDay <= day }
        guard !arrived.isEmpty else { return [] }
        data.lotOrders.removeAll { $0.arrivalDay <= day }
        var lines: [String] = []
        for order in arrived {
            var lot = order.listing.lot
            // Now the player can look at each card by eye.
            for i in lot.pieces.indices {
                if let fake = lot.pieces[i].fake { lot.pieces[i].looksOff = Counterfeit.eyeballCatches(fake, tired: eyeFactor) }
            }
            receiveCollection(lot, pieces: nil, price: order.listing.total, payment: .prepaid, from: "an eBay seller", at: "eBay")
            let best = lot.pieces.first.map { " Best: \($0.name), \(money($0.market))." } ?? ""
            let off = lot.pieces.filter(\.looksOff).count
            lines.append("Your eBay collection lot arrived: \(lot.summary). Worth \(money(lot.dealValue)) to a dealer, and you paid \(money(order.listing.total)).\(best)"
                         + (off > 0 ? " \(off) item\(off == 1 ? " looks" : "s look") off." : ""))
        }
        return lines
    }
}

// MARK: - At the table

@MainActor
extension ShowSession {
    /// A seller with a whole collection.
    func makeCollectionSeller() -> Visitor? {
        let type = [VisitorType.closetCleaner, .closetCleaner, .collector, .dealer].randomElement() ?? .closetCleaner
        let theme: CollectionTheme = type == .closetCleaner ? [.childhoodBinder, .mixedBox, .estate].randomElement() ?? .mixedBox
            : CollectionTheme.allCases.randomElement() ?? .modernBinder
        let source = store.fakeSource(contact: nil, fallback: venue.fakeSource == .none ? .stranger : venue.fakeSource)
        var lot = CollectionLot.make(theme, fakes: source, tired: store.eyeFactor)
        // A seller at a show with the rule leaves the in-print sealed at home. The lot is a local value.
        if bansInPrintSealed {
            lot.pieces.removeAll { piece in
                if case .sealed(let p) = piece.goods { return p.isInPrint }
                return false
            }
        }
        let (askRange, floorRange) = Self.collectionRanges(type)
        let askShare = Double.random(in: askRange)
        // Most sellers bring what the player can pay for: they keep their best cards. Now and then, someone brings it all.
        let budget = max(60, store.cash * 1.3)
        if Double.random(in: 0..<1) >= 0.15 {
            while lot.dealValue * askShare > budget, lot.pieces.count > 1 { lot.pieces.removeFirst() }
        }
        guard lot.dealValue >= 10 else { return nil }
        let ask = max(5, Self.round(lot.dealValue * askShare))
        let floor = min(ask, lot.dealValue * Double.random(in: floorRange))
        let roll = Double.random(in: 0..<1)
        let want: CollectionWant = venue.kind == .store ? (roll < 0.35 ? .credit : roll < 0.5 ? .trade : .cash)
            : (hasTable && !table.isEmpty && roll < 0.25 ? .trade : .cash)
        let line = "\(theme.sellerLine) \(money(ask)) for all of it? \(want.line)"
        var v = Visitor(type: type, name: Self.names.randomElement() ?? "A seller", intent: .sell, item: nil, limit: floor,
                        offer: ask, patience: 2, line: line)
        v.goodsMarket = lot.dealValue
        v.collection = lot
        v.want = want
        return v
    }

    /// Someone who asks whether to grade a card.
    func makeAdviceSeeker() -> Visitor? {
        guard let (print, slug) = VendorFloor.randomPrint(from: Balance.modernSets + Balance.olderSets, minMarket: 8, maxMarket: 400) else {
            return nil
        }
        let condition: Condition = Balance.olderSets.contains(slug) && Bool.random() ? .played() : .packFresh()
        let raw = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, condition: condition).market
        let worth = GameStore.gradingWorth(print, slug: slug, condition: condition)
        let type = [VisitorType.collector, .player, .kid].randomElement() ?? .collector
        var v = Visitor(type: type, name: Self.names.randomElement() ?? "Someone", intent: .sell, item: nil, limit: raw, offer: raw,
                        patience: 2, line: "I pulled this \(print.name). Should I send it to PSA, or keep it raw?")
        v.goodsMarket = raw
        v.advice = AdviceAsk(print: print, slug: slug, condition: condition, worth: worth)
        return v
    }

    /// The first price and the lowest price of a whole collection, as shares of market. A collection goes for less than
    /// its singles would, because the buyer takes the bulk and the work of sorting it.
    static func collectionRanges(_ type: VisitorType) -> (ClosedRange<Double>, ClosedRange<Double>) {
        switch type {
        case .closetCleaner: (0.45...0.7, 0.3...0.45)
        case .dealer: (0.7...0.85, 0.55...0.7)
        default: (0.6...0.8, 0.45...0.6)
        }
    }

    /// The market of the whole collection (`picked` nil), or of the picked pieces.
    func collectionMarket(_ v: Visitor, _ picked: Set<UUID>?) -> Double {
        guard let lot = v.collection else { return 0 }
        guard let picked else { return lot.dealValue }
        return lot.pieces.filter { picked.contains($0.id) }.reduce(0) { $0 + $1.market }
    }

    /// The seller's price: their price for all of it, or a cherry-pick price with the premium on top.
    func collectionAsk(_ v: Visitor, _ picked: Set<UUID>?) -> Double {
        guard let picked, v.goodsMarket > 0 else { return v.offer }
        return Self.round(collectionMarket(v, picked) * (v.offer / v.goodsMarket + Balance.cherryPremium))
    }

    /// The seller's hidden lowest price, the same way.
    private func collectionFloor(_ v: Visitor, _ picked: Set<UUID>?) -> Double {
        guard let picked, v.goodsMarket > 0 else { return v.limit }
        return collectionMarket(v, picked) * (v.limit / v.goodsMarket + Balance.cherryPremium)
    }

    /// Some sellers want the whole collection gone, and refuse to be cherry-picked. Taking most of the value makes a
    /// no more likely. Returns false when they refuse.
    private func cherryAllowed(_ v: inout Visitor, _ picked: Set<UUID>) -> Bool {
        if v.cherryOK == nil {
            let share = (v.collection?.piecesMarket ?? 0) > 0 ? collectionMarket(v, picked) / (v.collection?.piecesMarket ?? 1) : 1
            v.cherryOK = Double.random(in: 0..<1) >= Balance.cherryRefuseChance + (share > 0.7 ? 0.2 : 0)
        }
        if v.cherryOK == false {
            v.line = "I'm not splitting it up. All of it, or none of it."
            setCurrent(v)
            spend(2)
            return false
        }
        return true
    }

    /// An offer on the whole collection (`picked` nil) or on the picked pieces, in cash or store credit. At or over the
    /// seller's lowest price, they sell. Under it, they come down part of the way, or walk away when their patience runs out.
    func offerOnCollection(_ picked: Set<UUID>?, price: Double, credit: Bool) {
        guard var v = current, v.collection != nil else { return }
        if let picked {
            guard !picked.isEmpty, cherryAllowed(&v, picked) else { return }
        }
        if credit, !canPayCredit { return }
        if !credit, !store.canAfford(price) {
            note = "You do not have \(money(price))."
            return
        }
        let ask = collectionAsk(v, picked)
        let market = collectionMarket(v, picked)
        var floor = collectionFloor(v, picked)
        if credit, v.want == .credit { floor *= Balance.preferredPayDiscount }
        if price >= floor - 0.001 {
            buyCollection(v, picked: picked, price: price, credit: credit, pushed: price < ask - 0.001)
            return
        }
        if market > 0, price < market * Balance.collectionLowball { store.lowballed(v.contactID) }
        if v.patience <= 0 {
            v.line = "Forget it. I'll take it somewhere else."
            setCurrent(v)
            recordWalkAway()
            finish(minutes: .random(in: 4...8))
            return
        }
        v.patience -= 1
        let counter = Self.round(max(floor, floor + (ask - floor) * Double.random(in: 0.2...0.5)))
        if picked == nil { v.offer = counter } else {
            v.stashCounter = counter
            v.stashCounterFor = picked ?? []
        }
        v.line = "\(Haggle.tell(market > 0 ? abs(price - floor) / market : 1)) I could do \(money(counter)) for \(picked == nil ? "all of it" : "those")."
        setCurrent(v)
        spend(2)
    }

    private func buyCollection(_ v: Visitor, picked: Set<UUID>?, price: Double, credit: Bool, pushed: Bool) {
        guard let lot = v.collection else { return }
        let creditAmount = credit ? store.storeCreditOffer(cash: price) : nil
        store.receiveCollection(lot, pieces: picked, price: price, payment: creditAmount.map { .credit($0) } ?? .cash,
                                from: v.name, at: venue.name)
        let count = picked?.count ?? lot.pieces.count
        recordBought(picked == nil ? "A collection (\(lot.summary))" : "\(count) cards from a collection", price)
        let market = collectionMarket(v, picked)
        store.recordDeal(v.contactID, what: picked == nil ? "Bought their collection" : "Bought \(count) cards from their collection",
                         price: price, market: market, slug: lot.pieces.first?.slug, scored: true)
        score(creditAmount == nil ? .buy : .credit, price: creditAmount ?? price, market: market, pushed: pushed, v)
        note = picked == nil ? "You bought the whole collection. It's in your Inventory." : "You bought \(count) cards. They kept the rest."
        maybePromote(v, points: 15)
        // Going through a whole collection takes time.
        finish(minutes: sortMinutes(whole: picked == nil))
        Haptics.hit()
    }

    /// Trades items from the table for the whole collection or the picked pieces. Each item counts at 110% of market,
    /// and a PC item at its PC price, the same as a trade instead of cash.
    func tradeForCollection(_ give: Set<UUID>, picked: Set<UUID>?) {
        guard var v = current, let lot = v.collection else { return }
        let items = table.filter { give.contains($0.id) && !store.isChallengeItem($0.id) }
        guard !items.isEmpty else { return }
        if let picked {
            guard !picked.isEmpty, cherryAllowed(&v, picked) else { return }
        }
        if v.want == .cash, !v.tradeAsked {
            v.tradeAsked = true
            if Bool.random() {
                v.line = "I'd rather have cash."
                setCurrent(v)
                spend(2)
                return
            }
        }
        let value = tradeValue(items)
        let market = collectionMarket(v, picked)
        var floor = collectionFloor(v, picked)
        if v.want == .trade { floor *= Balance.preferredPayDiscount }
        guard value >= floor - 0.001 else {
            v.line = "That's not enough for \(picked == nil ? "all of it" : "those")."
            setCurrent(v)
            spend(2)
            return
        }
        guard value <= market * Balance.tradeInsteadMax else {
            v.line = "That's too much. I can't take all that for this."
            setCurrent(v)
            spend(2)
            return
        }
        for item in items where buyerCatchesFake(v, item) { return }
        for item in items { store.settleOnlineListing(item.id, name: item.name) }
        let cost = items.reduce(0) { $0 + $1.market }
        store.receiveCollection(lot, pieces: picked, price: cost, payment: .trade(items), from: v.name, at: venue.name)
        for item in items {
            if let fake = item.fake {
                store.recordBadSale(item: item.name, channel: venue.name, price: item.market, fake: fake, known: item.fakeKnown,
                                    refunds: false, contactID: v.contactID, sealed: item.kind == .sealed)
            }
        }
        removeFromTable(Set(items.map(\.id)))
        recordTrade("\(items.map(\.name).joined(separator: " + ")) → \(picked == nil ? "a collection" : "\(picked?.count ?? 0) cards from a collection")")
        store.recordDeal(v.contactID, what: "Traded for their collection", price: cost, market: market, slug: lot.pieces.first?.slug, scored: true)
        score(.buy, price: cost, market: market, pushed: false, v)
        maybePromote(v, points: 15)
        finish(minutes: sortMinutes(whole: picked == nil))
        Haptics.hit()
    }

    /// The time to go through a collection. Sorting trays halve it.
    private func sortMinutes(whole: Bool) -> Double {
        (whole ? .random(in: 15...25) : .random(in: 8...14)) * (store.hasUpgrade(.sortingTrays) ? 0.5 : 1)
    }

    /// What table items count for in a trade for a collection.
    func tradeValue(_ items: [ShowItem]) -> Double {
        items.reduce(0) { $0 + ($1.pc ? $1.dealMarket : $1.market * Balance.tradeInstead) }
    }

    // MARK: Grading advice

    /// Honest advice: grade it, or keep it raw. The right answer earns reputation and standing. A close call counts
    /// either way. The wrong answer costs a little reputation, and the person sounds unsure.
    func advise(grade: Bool) {
        guard let v = current, let ask = v.advice else { return }
        let right = abs(ask.worth) < Balance.adviceCloseCall || grade == (ask.worth > 0)
        if right {
            store.addReputation(Balance.adviceRightRep)
            note = "\(v.name) nodded. \"That's what I thought. Thanks for being straight with me.\""
            if let id = v.contactID { store.addPoints(id, 4) } else { maybePromote(v, points: 15, chance: 0.4) }
        } else {
            store.addReputation(-Balance.adviceWrongRep)
            note = "\(v.name) looked unsure. \"Huh. Someone else told me the opposite.\""
        }
        finish(minutes: .random(in: 3...6))
    }

    /// The price for "Keep it raw. I'll buy it."
    func adviceBuyPrice(_ v: Visitor) -> Double { max(1, Self.round(v.goodsMarket * Balance.adviceBuyShare)) }

    /// "Keep it raw. I'll buy it." It always works now. When the card was worth grading, it was a lie, and the person can
    /// find out later, the same as a lie about value.
    func adviseAndBuy() {
        guard let v = current, let ask = v.advice else { return }
        let price = adviceBuyPrice(v)
        guard store.canAfford(price) else {
            note = "You do not have \(money(price))."
            return
        }
        buyGoods(.single(ask.print, slug: ask.slug, condition: ask.condition), price: price, from: v.name)
        if ask.worth > Balance.adviceCloseCall {
            store.recordScam(seller: v.name, contactID: v.contactID, item: ask.print.name)
        } else {
            store.recordDeal(v.contactID, what: "Bought \(ask.print.name)", price: price, market: v.goodsMarket, slug: ask.slug, scored: true)
            score(.buy, price: price, market: v.goodsMarket, pushed: false, v)
        }
        note = "\(v.name) took \(money(price)) for the \(ask.print.name)."
        finish(minutes: .random(in: 4...8))
        Haptics.hit()
    }
}
