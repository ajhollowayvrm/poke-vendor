import SwiftUI

// The boxes on the store screen for credit that expires, the sealed buylist, consignment, and the bigger space
// (docs/22-own-store.md).

/// The credit that the store owes, and what expires.
struct StoreCreditBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let owed = store.storeCreditOwed
        let soon = store.creditExpiring(within: Balance.creditWarnDays)
        DetailBox(title: "Credit that expires") {
            HStack(spacing: 0) {
                StatCell(label: "Credit owed", value: money(owed), color: owed > 0 ? Theme.orange : Theme.text)
                StatCell(label: "Expires in \(Balance.creditWarnDays) d", value: money(soon), color: soon > 0 ? Theme.orange : Theme.text)
                StatCell(label: "Expired so far", value: money(store.creditExpiredTotal), color: Theme.green)
            }
            if let next = store.nextCreditExpiry {
                Text("The oldest credit, \(money(next.amount)), expires on day \(next.day + 1).")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.cyan)
            }
            Text("Store credit expires \(Balance.creditExpiryDays / 7) weeks after the store gives it. Customers use the oldest credit first. Credit that expires is a gain for the store: the store does not owe it any more.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// The buylist for sealed product only.
struct StoreSealedBuylistBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let g = store.cardStore?.growth ?? StoreExtras()
        DetailBox(title: "Sealed buylist") {
            HStack(spacing: 0) {
                StatCell(label: "Sealed buylist", value: g.sealedRate > 0 ? "\(Int((g.sealedRate * 100).rounded()))%" : "Off")
                StatCell(label: "Daily budget", value: g.sealedRate > 0 ? money(g.sealedBudget) : "-")
            }
            Picker("Sealed buylist", selection: Binding(get: { g.sealedRate },
                                                        set: { store.setSealedBuylist(rate: $0, budget: g.sealedBudget) })) {
                Text("Off").tag(0.0)
                ForEach(Balance.sealedBuyRates, id: \.self) { r in Text("\(Int((r * 100).rounded()))%").tag(r) }
            }
            .pickerStyle(.segmented)
            Picker("Sealed budget", selection: Binding(get: { g.sealedBudget },
                                                       set: { store.setSealedBuylist(rate: g.sealedRate, budget: $0) })) {
                ForEach(Balance.sealedBuyBudgets, id: \.self) { b in Text(money(b)).tag(b) }
            }
            .pickerStyle(.segmented)
            Text("On each open day with a clerk, walk-in customers sell sealed product only. The clerk pays this share of market, in cash, up to the daily budget. A higher share brings more sellers. The clerk does not check for resealed or fake product. Bought items go to Inventory.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// Consignment in the player's own cases.
struct StoreConsignmentBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let g = store.cardStore?.growth ?? StoreExtras()
        DetailBox(title: "Consignment") {
            HStack(spacing: 0) {
                StatCell(label: "Cards in the case", value: "\(g.consigned.count)")
                StatCell(label: "Sold", value: "\(g.consignedSold)")
                StatCell(label: "Cuts earned", value: money(g.consignEarned), color: Theme.green)
            }
            Toggle(isOn: Binding(get: { g.consignOn }, set: { store.setConsignment(on: $0, cut: g.consignCut) })) {
                Text("Take cards on consignment").font(.subheadline.weight(.medium))
            }
            .tint(Theme.cyan)
            Picker("Store cut", selection: Binding(get: { g.consignCut }, set: { store.setConsignment(on: g.consignOn, cut: $0) })) {
                ForEach(Balance.ownConsignCuts, id: \.self) { c in Text("\(Int((c * 100).rounded()))%").tag(c) }
            }
            .pickerStyle(.segmented)
            if !g.consigned.isEmpty {
                ForEach(g.consigned) { card in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(card.name).font(.subheadline)
                            Text("day \(card.dayIn + 1) · back to the owner on day \(card.dayIn + Balance.ownConsignDays + 1)")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(money(store.storePrice(card.market))).font(.subheadline.monospaced())
                            Text("mkt \(money(card.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
            Text("On each open day with a clerk, customers leave cards in your cases. The store keeps its cut when a card sells at your singles price, and the owner gets the rest. A lower cut brings more cards. Each card uses one case slot. A card that does not sell in \(Balance.ownConsignDays) days goes back to the owner. These cards are not your stock. A thief who takes one costs you the owner's payout.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// A bigger unit: more room, and a higher rent.
struct StoreSpaceBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let s = store.cardStore {
            DetailBox(title: "Space") {
                HStack(spacing: 0) {
                    StatCell(label: "Unit", value: s.growth.space == 0 ? "Standard" : Balance.spaceNames[s.growth.space - 1])
                    StatCell(label: "Card slots", value: "\(store.storeCardSlots)")
                    StatCell(label: "Sealed slots", value: "\(store.storeSealedSlots)")
                }
                if let step = store.nextSpaceStep {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.name).font(.subheadline.weight(.semibold))
                            Text("\(Balance.spaceSlotsPerLevel) more card slots and \(Balance.spaceSlotsPerLevel) more sealed slots. Rent goes from \(money(s.rent)) to \(money(store.rentAfterUpgrade(s))) every 28 days, from the next rent day. Insurance and utilities go up \(Int(Balance.spaceOverheadStep * 100))% too.")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button(money(step.cost)) { store.upgradeSpace() }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                            .controlSize(.small)
                            .disabled(!store.canUpgradeSpace)
                    }
                } else {
                    Text("You have the largest unit.").font(.caption).foregroundStyle(Theme.muted)
                }
                Text("The bigger unit stays with the lease. A new lease starts with the standard unit.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}
