import Foundation

// Haggling and deal reputation (docs/30-haggling-and-deal-reputation.md): the fair band, tells, deal fairness with a
// daily cap, and deal stories that come out days later.

extension Balance {
    /// The fair band, as a share of market: the player sells at or under, buys at or over, values trade cards at or over.
    static let fairSellMax = 1.00
    static let fairBuyMin = 0.70
    static let fairTradeMin = 80.0
    /// A trader's lowest valuation of their own cards, in percent, and the cash they carry as a share of the item.
    static let traderValuationRange = 70.0...90.0
    static let traderCashShare = 0.5
    /// Tells: a gap at or under the first is close, at or under the second is not far.
    static let tellClose = 0.05
    static let tellNear = 0.15
    /// Deal fairness.
    static let dealScoreMinPrice = 20.0
    static let dealRepDailyCap = 6
    static let dealRepGenerous = 2
    static let dealRepFair = 1
    /// Final offer: how near the limit it must be, and how often each kind of person meets it.
    static let finalOfferReach = 0.10
    static let finalOfferMeet = 0.6
    static let finalOfferMeetHard = 0.3
    /// Offer trade instead of cash: the seller's value on the player's item, and the largest trade they take.
    static let tradeInstead = 1.10
    static let tradeInsteadMax = 1.5
    /// A trader's binder, and the share of buyers who ask for a bundle.
    static let binderSize = 3...5
    static let bundleChance = 0.20
    /// Stories.
    static let storyGenerous = 0.08
    static let storyHard = 0.12
    static let storyLostFlip = 0.04
    static let storyNotorietyStep = 0.02
    static let storyBigDeal = 200.0
    static let storyDelay = 1...10
    static let storyViral = 0.2
    static let storyGoodRep = 3
    static let storyGoodViralRep = 10
    static let storyBadRep = 4
    static let storyBadViralRep = 12
    static let storyGoodFollowers = 20
    static let storyViralFollowerShare = 0.02
    static let storyViralFollowerMin = 100
    static let storyBadViralFollowerShare = 0.01
    static let storyRandomWeekly = 0.03
    static let storyRandomRep = 3
}

/// How a deal looked from the other side.
enum DealGrade: String, Codable { case generous, fair, hard, plain }

/// What the player did in a deal, for the fairness score.
enum DealSide { case sell, buy, trade, credit }

/// Reputation from deals today, for the daily cap.
struct DealRepState: Codable, Hashable {
    var day = -1
    var points = 0
}

/// A deal that comes back as a post some days later.
struct DealStory: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let good: Bool
    let viral: Bool
    let text: String
}

enum Haggle {
    /// The words for how far apart the two sides are. `gap` is a share of market.
    static func tell(_ gap: Double) -> String {
        gap <= Balance.tellClose ? "That's close." : gap <= Balance.tellNear ? "We're not far apart." : "That's a long way off."
    }

    /// True when the player's number is inside the fair band.
    static func fair(_ side: DealSide, share: Double) -> Bool {
        switch side {
        case .sell: share <= Balance.fairSellMax + 0.001
        case .buy, .credit: share >= Balance.fairBuyMin - 0.001
        case .trade: share * 100 >= Balance.fairTradeMin - 0.001
        }
    }

    /// The grade of a deal. `share` is the price over market (for a trade, the valuation over 100). `pushed` is true
    /// when the player moved the price past the other side's first number.
    static func grade(_ side: DealSide, share: Double, pushed: Bool, kid: Bool) -> DealGrade {
        switch side {
        case .sell:
            if kid, share <= 0.90 { return .generous }
            if share > 1.15, pushed { return .hard }
            return share >= 0.80 && share <= 1.10 ? .fair : .plain
        case .buy, .credit:
            if share >= 1.0 { return .generous }
            if share < 0.55, pushed { return .hard }
            return share >= 0.70 ? .fair : .plain
        case .trade:
            if share >= 1.0 { return .generous }
            if share < 0.65, pushed { return .hard }
            return share >= 0.80 ? .fair : .plain
        }
    }
}

@MainActor
extension GameStore {
    /// Scores a deal at a table. Gives reputation under the daily cap, and can queue a story. Returns the reputation
    /// given.
    @discardableResult
    func scoreDeal(_ side: DealSide, price: Double, market: Double, share: Double, pushed: Bool, kid: Bool, with name: String,
                   at venue: String) -> Int {
        guard price >= Balance.dealScoreMinPrice, market > 0 else { return 0 }
        let grade = Haggle.grade(side, share: share, pushed: pushed, kid: kid)
        var given = 0
        let want = grade == .generous ? Balance.dealRepGenerous : grade == .fair ? Balance.dealRepFair : 0
        if want > 0 {
            var state = data.dealRep
            if state.day != data.day { state = DealRepState(day: data.day, points: 0) }
            given = min(want, max(0, Balance.dealRepDailyCap - state.points))
            state.points += given
            data.dealRep = state
            if given > 0 { addReputation(given) }
        }
        switch grade {
        // A good story needs a deal that gave reputation, so the daily cap holds for stories too.
        case .generous where given > 0: maybeStory(good: true, chance: Balance.storyGenerous, price: price, text: goodStory(side, name: name, venue: venue, kid: kid))
        case .hard: maybeStory(good: false, chance: Balance.storyHard, price: price, text: badStory(side, name: name, venue: venue))
        case .generous, .fair, .plain: break
        }
        return given
    }

    /// A coin flip that the player lost can make a fun story.
    func lostFlipStory(name: String, venue: String, price: Double) {
        maybeStory(good: true, chance: Balance.storyLostFlip, price: price,
                   text: "\(name) posted a video of the coin flip they won against you at \(venue).")
    }

    private func maybeStory(good: Bool, chance: Double, price: Double, text: String) {
        var p = chance + Balance.storyNotorietyStep * Double(notoriety)
        if price >= Balance.storyBigDeal { p *= 2 }
        guard Double.random(in: 0..<1) < p else { return }
        data.dealStories.append(DealStory(day: data.day + Int.random(in: Balance.storyDelay), good: good,
                                          viral: Double.random(in: 0..<1) < Balance.storyViral, text: text))
    }

    private func goodStory(_ side: DealSide, name: String, venue: String, kid: Bool) -> String {
        switch side {
        case .sell: kid ? "\(name) posted about the deal you gave their kid at \(venue)." : "\(name) posted about the deal you gave them at \(venue)."
        case .buy, .credit: "\(name) posted that you paid them more than they asked at \(venue)."
        case .trade: "\(name) posted about the fair trade you gave them at \(venue)."
        }
    }

    private func badStory(_ side: DealSide, name: String, venue: String) -> String {
        switch side {
        case .sell: "\(name) posted that you overcharged them at \(venue)."
        case .buy, .credit: "\(name) posted that you lowballed them at \(venue)."
        case .trade: "\(name) posted that you ripped them off in a trade at \(venue)."
        }
    }

    /// End Day: the stories that come out today, and now and then a random one. Returns the report lines.
    func storiesEndDay() -> [String] {
        let today = data.day
        var lines: [String] = []
        var due = data.dealStories.filter { $0.day <= today }
        if today % 7 == 0, Double.random(in: 0..<1) < Balance.storyRandomWeekly {
            let bad = reputationTier >= 2 && Bool.random()
            due.append(DealStory(day: today, good: !bad, viral: false,
                                 text: bad ? "A rival vendor is telling people that your prices are inflated."
                                           : "A regular vouched for you in a local Discord."))
        }
        for story in due {
            // A random story is small: reputation only, no followers (docs/30-haggling-and-deal-reputation.md).
            let random = !data.dealStories.contains(story)
            let rep: Int
            var text = story.text
            if random {
                rep = story.good ? Balance.storyRandomRep : -Balance.storyRandomRep
            } else if story.good {
                rep = story.viral ? Balance.storyGoodViralRep : Balance.storyGoodRep
                if hasAccount {
                    let gain = story.viral ? max(Balance.storyViralFollowerMin, Int(Double(data.social.followers) * Balance.storyViralFollowerShare))
                                           : Balance.storyGoodFollowers
                    data.social.followers += gain
                    text += " You gained \(gain) followers."
                }
            } else {
                rep = -(story.viral ? Balance.storyBadViralRep : Balance.storyBadRep)
                if hasAccount, story.viral {
                    let loss = Int(Double(data.social.followers) * Balance.storyBadViralFollowerShare)
                    data.social.followers = max(0, data.social.followers - loss)
                    data.social.authenticity = max(0, data.social.authenticity - 0.1)
                    text += " You lost \(loss) followers."
                }
            }
            addReputation(rep)
            lines.append("\(story.viral ? "Viral: " : "")\(text) Reputation \(rep >= 0 ? "+" : "")\(rep).")
            log(text)
        }
        data.dealStories.removeAll { $0.day <= today }
        return lines
    }
}
