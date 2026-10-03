import Foundation

// Buyer problems after an online sale (docs/15-selling.md, Buyer problems). A shipped sale on TCGplayer, eBay,
// Whatnot, or social media can lose its package, bring an item-not-received claim, bring a return, or bring a
// false return from a scam buyer. Each problem arrives some days after the sale, at End Day.

enum SaleProblemKind: String, Codable, Hashable {
    /// The carrier lost the package.
    case lost
    /// The buyer says the package did not arrive. It did.
    case notReceived
    /// The buyer returns the item as "not as described". It is a true return.
    case notAsDescribed
    /// The buyer makes a false "not as described" claim, and returns a different, worse card.
    case scamReturn
}

/// One problem that waits for its day. The record holds the sold item, so a return can put it back in Inventory.
struct SaleProblem: Codable, Identifiable, Hashable {
    var id = UUID()
    let kind: SaleProblemKind
    let name: String
    let channel: Listing.Channel
    let price: Double
    let insured: Bool
    let tracked: Bool
    /// The sale listed a better condition than the true one.
    let overstated: Bool
    let day: Int
    var card: OwnedCard?
    var sealed: SealedItem?
}

extension Balance {
    /// A package is tracked from this price. It matches the tracked shipping in `shippingCost`.
    static let trackedFromPrice = 20.0
    /// A lost package surfaces 7 to 14 days after the sale. The chance is `lossChance`.
    static let lostDays = 7...14
    /// An item-not-received claim on a package that arrived. It comes 5 to 12 days after the sale.
    static let inrChance = 0.015
    static let inrDays = 5...12
    /// A return as not as described. A small base chance, and a high chance when the sale overstated the condition.
    static let inadBaseChance = 0.02
    static let inadOverstatedChance = 0.40
    static let inadDays = 6...14
    /// A scam buyer makes a false return claim.
    static let scamReturnChance = 0.015
    static let scamReturnDays = 8...16
    /// The chance that the platform sides with the seller on a scam return, by platform.
    /// eBay favors the buyer. TCGplayer protects a tracked or insured order well. Social media has no protection.
    static let ebayScamProtection = 0.30
    static let tcgScamProtection = 0.60
    static let tcgScamProtectionPlain = 0.20
    static let whatnotScamProtection = 0.30
    static let socialScamProtection = 0.0
    /// The scam buyer returns a card that is worth at most this share of the price.
    static let scamReturnCardShare = 0.15
    /// Seller rating cost of a claim that the player loses.
    static let claimLostReputation = 2
}

@MainActor
extension GameStore {
    /// Rolls the problems for one finished sale. Call it after the sale. A fake has its own bad-sale roll, so it gets none here.
    func scheduleSaleProblems(name: String, channel: Listing.Channel, price: Double, insured: Bool, overstated: Bool,
                              card: OwnedCard?, sealed: SealedItem?) {
        guard channel.ships, card != nil || sealed != nil, card?.fake == nil, sealed?.fake == nil else { return }
        let tracked = price >= Balance.trackedFromPrice
        func add(_ kind: SaleProblemKind, _ days: ClosedRange<Int>) {
            data.saleProblems.append(SaleProblem(kind: kind, name: name, channel: channel, price: price, insured: insured,
                                                 tracked: tracked, overstated: overstated, day: data.day + Int.random(in: days),
                                                 card: card, sealed: sealed))
        }
        if Double.random(in: 0..<1) < Balance.lossChance {
            add(.lost, Balance.lostDays)
        } else if Double.random(in: 0..<1) < Balance.inrChance {
            add(.notReceived, Balance.inrDays)
        } else if Double.random(in: 0..<1) < (overstated ? Balance.inadOverstatedChance : Balance.inadBaseChance) {
            add(.notAsDescribed, Balance.inadDays)
        } else if Double.random(in: 0..<1) < Balance.scamReturnChance {
            add(.scamReturn, Balance.scamReturnDays)
        }
    }

    /// The chance that the platform sides with the seller on a scam return.
    private func scamProtection(_ problem: SaleProblem) -> Double {
        switch problem.channel {
        case .ebay, .ebayAuction: Balance.ebayScamProtection
        case .tcgplayer: problem.tracked || problem.insured ? Balance.tcgScamProtection : Balance.tcgScamProtectionPlain
        case .whatnot: Balance.whatnotScamProtection
        case .social, .facebook: Balance.socialScamProtection
        }
    }

    /// A cheap card from the set of the sold item. The scam buyer sends it back in place of the real one.
    private func scamReturnCard(_ problem: SaleProblem) -> OwnedCard? {
        guard let slug = problem.card?.setSlug ?? problem.sealed?.setSlug else { return nil }
        let prints = SetLibrary.set(slug).prints.filter { ($0.market ?? 0) > 0 }
        let limit = problem.price * Balance.scamReturnCardShare
        let cheap = prints.filter { ($0.market ?? 0) <= limit }
        guard let print = cheap.randomElement() ?? prints.min(by: { ($0.market ?? 0) < ($1.market ?? 0) }) else { return nil }
        return OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, condition: .played(),
                         acquiredDay: data.day)
    }

    /// Puts the sold item back in Inventory.
    private func returnToInventory(_ problem: SaleProblem) {
        if var card = problem.card {
            card.status = nil
            card.onlineListing = nil
            if card.grade == nil { data.raw.append(card) } else { data.slabs.append(card) }
        } else if var item = problem.sealed {
            item.status = nil
            item.onlineListing = nil
            data.sealed.append(item)
        }
    }

    private func refundBuyer(_ problem: SaleProblem, _ why: String) {
        addLedger(-problem.price, .refund, "\(why) · \(problem.name)")
    }

    private func lostClaim(_ line: inout String) {
        addReputation(-Balance.claimLostReputation)
        line += " Your seller rating took a hit."
    }

    /// Problems that arrive today (docs/15-selling.md, Buyer problems). Returns the Activity lines.
    func saleProblemsEndDay() -> [String] {
        let today = data.day
        let due = data.saleProblems.filter { $0.day <= today }
        guard !due.isEmpty else { return [] }
        data.saleProblems.removeAll { $0.day <= today }
        var lines: [String] = []
        for problem in due {
            let name = problem.name
            let channel = problem.channel.rawValue
            var line: String
            switch problem.kind {
            case .lost:
                refundBuyer(problem, "Lost package")
                if problem.insured {
                    addLedger(problem.price, .refund, "Insurance paid · \(name)")
                    line = "The package with your \(name) got lost. \(channel) refunded the buyer, and the insurance paid you \(money(problem.price))."
                } else {
                    line = "The package with your \(name) got lost with no insurance. \(channel) refunded the buyer \(money(problem.price)) from your account, and the card is gone."
                }
            case .notReceived:
                if problem.tracked || problem.insured {
                    line = "The buyer of your \(name) on \(channel) said it did not arrive. The tracking shows it was delivered, so you won the claim."
                } else {
                    refundBuyer(problem, "Item not received")
                    line = "The buyer of your \(name) on \(channel) said it did not arrive. You sent it in a plain envelope with no tracking, so you lost the claim and refunded \(money(problem.price))."
                    lostClaim(&line)
                }
            case .notAsDescribed:
                refundBuyer(problem, "Return")
                line = "The buyer of your \(name) on \(channel) returned it as not as described. You refunded \(money(problem.price))."
                if problem.channel == .ebay || problem.channel == .ebayAuction {
                    let shipping = Balance.shippingCost(for: problem.price, sealed: problem.sealed != nil)
                    addLedger(-shipping, .refund, "Return shipping · \(name)")
                    line += " You paid \(money(shipping)) for return shipping."
                }
                returnToInventory(problem)
                line += " The item is back in Inventory."
                if problem.overstated {
                    line += " You listed a better condition than the true one."
                    lostClaim(&line)
                }
            case .scamReturn:
                if Double.random(in: 0..<1) < scamProtection(problem) {
                    line = "The buyer of your \(name) on \(channel) claimed it was not as described. \(channel) ruled for you, and you kept the sale."
                } else if let swapped = scamReturnCard(problem) {
                    refundBuyer(problem, "Return")
                    data.raw.append(swapped)
                    line = "The buyer of your \(name) on \(channel) returned a different card, \(swapped.print.name), and got \(money(problem.price)) back. \(channel) did not side with you."
                    lostClaim(&line)
                } else {
                    continue
                }
            }
            lines.append(line)
        }
        return lines
    }
}
