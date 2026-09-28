import Foundation

// Social media (docs/06-social-media.md).

enum PostType: String, Codable, CaseIterable, Hashable {
    case pullReveal = "Pull reveal", collectionFlex = "Collection flex", hotTake = "Hot take"
    case forSale = "For sale", sponsored = "Sponsored post"
    /// A post about a card show the player will be at (docs/20-card-shows.md). It picks a show, not an item.
    case showPromo = "Show promo"
    /// The record of a live stream in the post list. Streams start from the hub, not from this sheet.
    case stream = "Live stream"

    var needsItem: Bool { self == .pullReveal || self == .collectionFlex || self == .forSale }
    var needsShow: Bool { self == .showPromo }
}

struct SocialPost: Codable, Identifiable, Hashable {
    enum SaleResult: Codable, Hashable {
        case open(cardID: UUID, price: Double)
        case sold(Double)
        case noSale
    }

    var id = UUID()
    let day: Int
    let type: PostType
    let subject: String?
    let views: Int
    let followerChange: Int
    let likes: Int
    let quality: Double
    let timing: Double
    let luck: Double
    var sale: SaleResult?
}

struct SponsorOffer: Codable, Identifiable, Hashable {
    var id = UUID()
    let brand: String
    let pay: Double
    let posts: Int
    let days: Int
    let dayOffered: Int
    var accepted = false
    var postsDone = 0
    var deadlineDay: Int?
}

struct SocialState: Codable, Hashable {
    var handle: String?
    var followers = 0
    /// 0 is fresh, 1 is burnt out. Hidden without the analytics upgrade.
    var burnout = 0.0
    /// The hidden track record. Burned followers suppress future reach.
    var authenticity = 0.7
    var posts: [SocialPost] = []
    var offers: [SponsorOffer] = []
    var analytics = false
    var lastPostDay = 0
}

enum FollowerTier {
    static let thresholds = [0, 1_000, 10_000, 100_000, 1_000_000]
    static let unlocks = [
        "Baseline reach only.",
        "Sponsor offers from small brands. Whatnot. Follower tips.",
        "Better trade deals and free product.",
        "Larger sponsor deals. Reach speeds up sales.",
        "Your posts can move a card's price.",
    ]

    static func tier(_ followers: Int) -> Int {
        thresholds.lastIndex { followers >= $0 } ?? 0
    }
}

extension Balance {
    static let analyticsUpgradeCost = 150.0
    static let sponsorBrands = ["SleeveCo", "Vault Binders", "SnapCase Toploaders", "GradeRight", "DeckBox Depot", "Mint Mailers"]
    /// A show promo post brings this many more visitors to the table (docs/20-card-shows.md).
    static let showPromoVisitorBonus = 1.25
    /// Follower tier 4: a post moves a card's price this much, for this many days (docs/04).
    static let priceBoostFactor = 1.15
    static let priceBoostDays = 7
    /// Follower tier 2: better deals with strangers, and a free product from a sponsor now and then (docs/04).
    static let followerDealBonus = 0.03
    static let freeProductDays = 28
    /// Follower tier 3: the sponsor deals pay more.
    static let bigSponsorFactor = 2.0
}

@MainActor
extension GameStore {
    var social: SocialState { data.social }
    var hasAccount: Bool { data.social.handle != nil }
    var followerTier: Int { FollowerTier.tier(data.social.followers) }

    /// The market trend today. Posting into a hot moment reaches more people.
    var postTiming: Double {
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 49_979_687 &+ 5)
        return 0.6 + Double(r.next()) * 0.9
    }

    func createAccount(_ handle: String) {
        let clean = handle.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
        guard !clean.isEmpty, !hasAccount else { return }
        data.social.handle = "@" + clean
        data.social.lastPostDay = data.day
        log("You started the account \(data.social.handle!).")
        save()
    }

    func buyAnalytics() {
        guard !data.social.analytics, canAfford(Balance.analyticsUpgradeCost) else { return }
        addLedger(-Balance.analyticsUpgradeCost, .upgrade, "Analytics upgrade")
        data.social.analytics = true
        log("Bought the analytics upgrade.", cash: -Balance.analyticsUpgradeCost)
        save()
    }

    /// Content quality from what the post shows: a big pull posts better than a bulk pull.
    static func contentQuality(type: PostType, value: Double) -> Double {
        switch type {
        case .pullReveal: 0.5 + min(2.6, log10(value + 1) * 1.1)
        case .collectionFlex: 0.4 + min(2.2, log10(value + 1) * 0.9)
        case .hotTake: Double.random(in: 0.4...1.5)
        case .forSale: 0.5 + min(1.2, log10(value + 1) * 0.5)
        case .sponsored: 0.8
        case .showPromo: 0.9
        case .stream: 1.0
        }
    }

    /// A quick post: a free action (docs/06-social-media.md, Quick posts).
    @discardableResult
    func post(_ type: PostType, subject: String?, value: Double, saleCardID: UUID? = nil, salePrice: Double? = nil,
              showID: UUID? = nil) -> SocialPost? {
        guard hasAccount else { return nil }
        var s = data.social
        let quality = Self.contentQuality(type: type, value: value)
        let timing = postTiming
        var luck = exp((Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.5)
        if Double.random(in: 0..<1) < 0.02 { luck *= Double.random(in: 8...20) }
        let base = 40 + Double(s.followers) * 0.35
        let reach = base * quality * timing * luck * (1 - s.burnout * 0.7) * (0.4 + s.authenticity) * productionQuality
        let views = max(1, Int(reach))
        let gainRate = 0.02 * (quality - 0.7) * (0.5 + s.authenticity)
        let change = Int((Double(views) * gainRate).rounded()) - (s.burnout > 0.8 ? Int(Double(s.followers) * 0.01) : 0)
        let likes = Int(Double(views) * Double.random(in: 0.04...0.12) * min(2, quality))
        s.followers = max(0, s.followers + change)
        s.burnout = min(1, s.burnout + (quality < 0.9 ? 0.2 : 0.12))
        if type == .sponsored { s.authenticity = max(0, s.authenticity - 0.04) }
        if type == .pullReveal && value >= 50 { s.authenticity = min(1, s.authenticity + 0.02) }
        s.lastPostDay = data.day
        var post = SocialPost(day: data.day, type: type, subject: subject, views: views, followerChange: change,
                              likes: likes, quality: quality, timing: timing, luck: luck)
        if let saleCardID, let salePrice { post.sale = .open(cardID: saleCardID, price: salePrice) }
        s.posts.append(post)
        data.social = s
        if type == .sponsored, let i = data.social.offers.firstIndex(where: { $0.accepted }) {
            let offer = data.social.offers[i]
            let perPost = (offer.pay / Double(offer.posts) * 100).rounded() / 100
            addLedger(perPost, .sponsorship, "\(offer.brand) · paid post")
            data.social.offers[i].postsDone += 1
            if data.social.offers[i].postsDone >= offer.posts { data.social.offers.remove(at: i) }
        }
        if let saleCardID, let salePrice {
            setStatus(saleCardID, .listed(Listing(channel: .social, price: salePrice, dayListed: data.day, insured: false)))
        }
        // A show promo: more people come to the table at that show (docs/20-card-shows.md).
        if type == .showPromo, let showID, let i = data.shows.firstIndex(where: { $0.id == showID }) {
            data.shows[i].promoted = true
        }
        // Follower tier 4: a post about a card moves its price for a week (docs/04).
        if followerTier >= 4, type == .pullReveal || type == .collectionFlex, let subject, value > 0 {
            data.priceBoosts[subject] = data.day + Balance.priceBoostDays
        }
        log("Posted a \(type.rawValue.lowercased())\(subject.map { ": \($0)" } ?? ""). \(views) views, \(change >= 0 ? "+" : "")\(change) followers.")
        save()
        return post
    }

    /// The price factor for a card the player posted about at follower tier 4.
    func priceBoost(for name: String) -> Double {
        guard let until = data.priceBoosts[name], until >= data.day else { return 1 }
        return Balance.priceBoostFactor
    }

    private func setStatus(_ id: UUID, _ status: ItemStatus?) {
        for i in data.raw.indices where data.raw[i].id == id { data.raw[i].status = status }
        for i in data.slabs.indices where data.slabs[i].id == id { data.slabs[i].status = status }
    }

    func acceptOffer(_ id: UUID) {
        guard let i = data.social.offers.firstIndex(where: { $0.id == id }),
              !data.social.offers.contains(where: { $0.accepted }) else { return }
        data.social.offers[i].accepted = true
        data.social.offers[i].deadlineDay = data.day + data.social.offers[i].days
        log("Accepted a deal with \(data.social.offers[i].brand).")
        save()
    }

    func declineOffer(_ id: UUID) {
        data.social.offers.removeAll { $0.id == id }
        save()
    }

    var activeDeal: SponsorOffer? { data.social.offers.first { $0.accepted } }

    /// Runs at End Day: burnout recovery, follower decay, sponsor offers, and deadlines.
    func advanceSocial() -> [String] {
        guard hasAccount else { return [] }
        var lines: [String] = []
        var s = data.social
        s.burnout = max(0, s.burnout - 0.1)
        let idle = data.day - s.lastPostDay
        var decay = Double(s.followers) * (idle >= 3 ? 0.01 : 0.003)
        if Double.random(in: 0..<1) < 0.05 {
            decay += Double(s.followers) * 0.02
            if s.followers > 100 { lines.append("An algorithm shift cost you some reach and followers.") }
        }
        s.followers = max(0, s.followers - Int(decay.rounded()))
        for i in s.offers.indices.reversed() {
            let o = s.offers[i]
            if o.accepted, let end = o.deadlineDay, data.day > end {
                s.offers.remove(at: i)
                s.authenticity = max(0, s.authenticity - 0.15)
                lines.append("You missed the deadline for the \(o.brand) deal. The deal is off, and it cost you authenticity.")
            } else if !o.accepted, data.day - o.dayOffered > 5 {
                s.offers.remove(at: i)
            }
        }
        let tier = FollowerTier.tier(s.followers)
        if tier >= 1, s.offers.count < 3, Double.random(in: 0..<1) < 0.12 {
            let posts = Int.random(in: 1...3)
            // Follower tier 3: larger sponsor deals (docs/04).
            let pay = max(25, (Double(s.followers) * 0.015 * Double(posts) * (tier >= 3 ? Balance.bigSponsorFactor : 1)).rounded())
            let brand = Balance.sponsorBrands.randomElement() ?? "SleeveCo"
            s.offers.append(SponsorOffer(brand: brand, pay: pay, posts: posts, days: Int.random(in: 5...10), dayOffered: data.day))
            lines.append("A sponsor offer from \(brand) is in your inbox: \(money(pay)) for \(posts) post\(posts == 1 ? "" : "s").")
        }
        data.social = s
        // Follower tier 2: a sponsor sends free product every 4 weeks (docs/04).
        if tier >= 2, data.day - data.lastFreeProductDay >= Balance.freeProductDays {
            let options = SetLibrary.catalog.filter { ($0.inPrint ?? true) && ["Elite Trainer Box", "Booster bundle", "Collection"].contains($0.kind) }
            if let p = options.randomElement() {
                data.lastFreeProductDay = data.day
                data.sealed.append(SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: 0, acquired: .now,
                                              source: "Free from a sponsor", productID: p.id, acquiredDay: data.day))
                lines.append("A sponsor sent you a free \(p.name).")
            }
        }
        return lines
    }

    /// A for-sale post sells when the followers want it. With a small audience, nothing sells.
    func socialSaleChance(price: Double, market: Double) -> Double {
        let audience = min(1, Double(data.social.followers) / 5_000)
        return min(0.3, audience * 0.3 * exp(-(price / max(market, 0.01) - 1) * 6))
    }

    func markPostSale(cardID: UUID, result: SocialPost.SaleResult) {
        for i in data.social.posts.indices {
            if case .open(let id, _) = data.social.posts[i].sale, id == cardID {
                data.social.posts[i].sale = result
            }
        }
    }
}
