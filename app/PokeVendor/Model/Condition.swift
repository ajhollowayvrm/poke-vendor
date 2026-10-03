import Foundation

// Raw condition grades (docs/10-grading.md, Condition grades). The standard scale is the `Wear` enum:
// Near Mint, Lightly Played, Moderately Played, Heavily Played, and Damaged. Each raw card gets its grade from
// its hidden subgrades. Every buyer prices a raw card by it.

extension Balance {
    /// What each condition pays, as a share of the Near Mint market value of a raw card.
    static let conditionFactor: [Wear: Double] = [
        .nearMint: 1, .lightlyPlayed: 0.8, .moderatelyPlayed: 0.65, .heavilyPlayed: 0.45, .damaged: 0.3,
    ]
}

extension Wear {
    /// The share of the Near Mint price that a raw card in this condition sells for.
    var valueFactor: Double { Balance.conditionFactor[self] ?? 1 }

    /// The condition as a listing shows it, for example "NM · Looks clean".
    var label: String { "\(short) · \(looks)" }

    /// Best first: Near Mint is rank 0.
    var rank: Int { Wear.allCases.firstIndex(of: self) ?? 0 }
}

extension OwnedCard {
    /// What a raw copy sells for in a condition. A graded card has no condition price.
    func market(as wear: Wear) -> Double { rawMarket * wear.valueFactor }

    /// The condition of a raw card in a listing. A listing with no chosen condition uses the true condition.
    func listedWear(in listing: Listing) -> Wear { listing.listedWear ?? condition.wear }

    /// True when the listing says a better condition than the card has. The returns system reads this flag.
    func overstates(_ listing: Listing) -> Bool {
        grade == nil && (listing.overstatedCondition ?? (listedWear(in: listing).rank < condition.wear.rank))
    }
}

@MainActor
extension GameStore {
    /// True when the live listing of a raw card says a better condition than the card has.
    func overstatesListing(_ id: UUID) -> Bool {
        guard let card = card(id) else { return false }
        if case .listed(let listing) = card.status { return card.overstates(listing) }
        if let listing = card.onlineListing { return card.overstates(listing) }
        return false
    }

    /// The lowest competing listing on TCGplayer for a raw card in a condition.
    static func tcgLowest(for print: CardPrint, wear: Wear) -> Double {
        max(0.05, (tcgLowest(for: print) * wear.valueFactor * 100).rounded() / 100)
    }
}
