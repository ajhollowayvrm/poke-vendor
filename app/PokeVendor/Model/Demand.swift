import Foundation

// The demand limit (docs/15-selling.md, The demand limit). Each sale uses up some of the buyers. A channel recovers in
// days. One item recovers in weeks, so a stack of one product sells slower and for less.

struct DemandState: Codable, Hashable {
    var items: [String: Double] = [:]
    var channels: [String: Double] = [:]
}

extension Balance {
    static let demandItemKeep = 0.93
    static let demandChannelKeep = 0.6
    static let demandItemChanceDrop = 0.3
    static let demandItemPriceDrop = 0.05
    static let demandItemPriceFloor = 0.6
    /// The sales in a short time that halve the sale chance on a channel, before reach.
    static let demandChannelRoom = 4.0
    static let demandRoomPerFollowerTier = 2.0
}

@MainActor
extension GameStore {
    func channelDemand(_ channel: Listing.Channel) -> Double {
        let heat = data.demand.channels[channel.rawValue] ?? 0
        let room = Balance.demandChannelRoom + (hasAccount ? Double(followerTier) * Balance.demandRoomPerFollowerTier : 0)
        return 1 / (1 + heat / room)
    }

    func itemDemand(_ name: String) -> Double {
        1 / (1 + (data.demand.items[name] ?? 0) * Balance.demandItemChanceDrop)
    }

    /// The share of market that buyers pay for an item that sold many times of late.
    func itemPriceFactor(_ name: String) -> Double {
        max(Balance.demandItemPriceFloor, 1 - (data.demand.items[name] ?? 0) * Balance.demandItemPriceDrop)
    }

    func noteDemand(_ name: String, channel: Listing.Channel, count: Double = 1) {
        data.demand.items[name, default: 0] += count
        data.demand.channels[channel.rawValue, default: 0] += count
    }

    func demandEndDay() {
        var demand = data.demand
        demand.items = demand.items.mapValues { $0 * Balance.demandItemKeep }.filter { $0.value >= 0.2 }
        demand.channels = demand.channels.mapValues { $0 * Balance.demandChannelKeep }.filter { $0.value >= 0.2 }
        data.demand = demand
    }
}
