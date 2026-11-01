import Foundation

// Goals (docs/03-currencies.md, Goals). Each currency has a ladder of goals. The top goal of any ladder is one way to
// "make it". The run goes on after that.

enum GoalRoute: String, Codable, CaseIterable, Hashable {
    case cash = "Cash", followers = "Followers", reputation = "Reputation", collection = "Collection"

    var icon: String {
        switch self {
        case .cash: "dollarsign.circle"
        case .followers: "person.3"
        case .reputation: "star"
        case .collection: "sparkles.rectangle.stack"
        }
    }

    /// The words on the "you made it" screen.
    var madeItText: String {
        switch self {
        case .cash: "You can buy anything on any table at any show."
        case .followers: "A million people watch what you pull."
        case .reputation: "Every dealer in the hall knows your name and trusts it."
        case .collection: "You own a collection that people travel to see."
        }
    }
}

struct Goal: Identifiable, Hashable {
    let route: GoalRoute
    let title: String
    let target: Double
    /// The reward for a goal, in reputation points and followers.
    var reputation = 0
    var followers = 0

    var id: String { "\(route.rawValue):\(Int(target))" }
}

extension Balance {
    static let goals: [Goal] = [
        Goal(route: .cash, title: "Three months of rent saved", target: 5_000),
        Goal(route: .cash, title: "Quit-your-job money", target: 25_000, reputation: 10),
        Goal(route: .cash, title: "Six figures", target: 100_000, reputation: 20),
        Goal(route: .cash, title: "Half a million in the bank", target: 500_000),
        Goal(route: .followers, title: "A small audience", target: 1_000, reputation: 5),
        Goal(route: .followers, title: "A known channel", target: 10_000, reputation: 10),
        Goal(route: .followers, title: "A big channel", target: 100_000, reputation: 25),
        Goal(route: .followers, title: "One million followers", target: 1_000_000),
        Goal(route: .reputation, title: "Known at the local shops", target: Double(ReputationTier.thresholds[1]), followers: 50),
        Goal(route: .reputation, title: "Trusted by dealers", target: Double(ReputationTier.thresholds[2]), followers: 150),
        Goal(route: .reputation, title: "Respected in the hobby", target: Double(ReputationTier.thresholds[3]), followers: 500),
        Goal(route: .reputation, title: "Elite", target: Double(ReputationTier.thresholds[4])),
        Goal(route: .collection, title: "A binder worth showing", target: 1_000, reputation: 5, followers: 50),
        Goal(route: .collection, title: "A serious collection", target: 10_000, reputation: 25, followers: 300),
        Goal(route: .collection, title: "A collection dealers talk about", target: 50_000, reputation: 60, followers: 1_500),
        Goal(route: .collection, title: "A museum piece", target: 250_000),
    ]
}

@MainActor
extension GameStore {
    func goalProgress(_ route: GoalRoute) -> Double {
        switch route {
        case .cash: data.cash
        case .followers: Double(data.social.followers)
        case .reputation: Double(data.reputation)
        case .collection: collectionValue
        }
    }

    func isReached(_ goal: Goal) -> Bool { data.goalsReached[goal.id] != nil }

    func nextGoal(_ route: GoalRoute) -> Goal? {
        Balance.goals.first { $0.route == route && !isReached($0) }
    }

    /// The goal that is closest to done, for the hub.
    var closestGoal: Goal? {
        GoalRoute.allCases.compactMap(nextGoal).max { goalProgress($0.route) / $0.target < goalProgress($1.route) / $1.target }
    }

    /// Marks new goals, and gives their rewards. Runs at End Day, and returns the lines for the report.
    func goalsEndDay() -> [String] {
        var lines: [String] = []
        for goal in Balance.goals where !isReached(goal) && goalProgress(goal.route) >= goal.target {
            data.goalsReached[goal.id] = data.day
            if goal.reputation > 0 { addReputation(goal.reputation) }
            if goal.followers > 0, hasAccount { data.social.followers += goal.followers }
            lines.append("Goal reached: \(goal.title).")
            let top = Balance.goals.last { $0.route == goal.route }
            if goal.id == top?.id { madeIt = goal.route }
        }
        return lines
    }
}
