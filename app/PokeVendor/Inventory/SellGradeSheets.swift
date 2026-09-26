import SwiftUI

/// List the selected items on TCGplayer or eBay (docs/15-selling.md).
struct SellSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let ids: Set<UUID>
    @State private var channel: Listing.Channel = .tcgplayer
    @State private var percent: Double = 100
    @State private var auctionDays = 7
    @State private var insured = false

    private struct Line: Identifiable {
        let id: UUID
        let name: String
        let reference: Double
        let sealed: Bool
        let isRaw: Bool
    }

    private var lines: [Line] {
        var out: [Line] = []
        for c in store.data.raw where ids.contains(c.id) {
            out.append(Line(id: c.id, name: c.print.name, reference: 0, sealed: false, isRaw: true))
        }
        for c in store.data.slabs where ids.contains(c.id) {
            out.append(Line(id: c.id, name: "\(c.print.name) \(c.grade?.label ?? "")", reference: c.market, sealed: false, isRaw: false))
        }
        for s in store.data.sealed where ids.contains(s.id) {
            out.append(Line(id: s.id, name: s.name, reference: store.market(of: s), sealed: true, isRaw: false))
        }
        return out
    }

    /// TCGplayer prices against the lowest listing. eBay prices against the market price.
    private func reference(_ line: Line) -> Double {
        guard line.isRaw, let card = store.card(line.id) else { return line.reference }
        return channel == .tcgplayer ? GameStore.tcgLowest(for: card.print) : card.market
    }

    private func price(_ line: Line) -> Double {
        max(0.05, (reference(line) * percent / 100 * 100).rounded() / 100)
    }

    private var tcgAllowed: Bool { lines.allSatisfy(\.isRaw) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Channel") {
                    Picker("Channel", selection: $channel) {
                        if tcgAllowed { Text("TCGplayer").tag(Listing.Channel.tcgplayer) }
                        Text("eBay Buy It Now").tag(Listing.Channel.ebay)
                        Text("eBay auction").tag(Listing.Channel.ebayAuction)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    Text(channelNote).font(.caption).foregroundStyle(Theme.muted)
                }
                if channel == .ebayAuction {
                    Section("Auction length") {
                        Picker("Days", selection: $auctionDays) {
                            ForEach(Balance.auctionLengths, id: \.self) { Text("\($0) d").tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                } else {
                    Section(channel == .tcgplayer ? "Price vs. the lowest listing" : "Price vs. market") {
                        HStack {
                            Slider(value: $percent, in: 70...140, step: 1)
                            Text("\(Int(percent))%").font(.body.monospaced()).frame(width: 56, alignment: .trailing)
                        }
                        Text(channel == .tcgplayer
                             ? "At or under the lowest listing sells fast. Each step above it sells far less."
                             : "A price above market waits longer. Listings end after \(Balance.listingDays) days.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }
                Section {
                    Toggle("Shipping insurance", isOn: $insured)
                }
                Section("Items") {
                    ForEach(lines) { line in
                        let p = channel == .ebayAuction ? reference(line) : price(line)
                        let costs = GameStore.saleCosts(price: p, channel: channel, sealed: line.sealed, insured: insured)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(line.name).font(.subheadline.weight(.medium))
                            HStack {
                                Text(channel == .ebayAuction ? "Expected \(money(p))" : "Price \(money(p))")
                                Spacer()
                                Text("You get about \(money(p - costs.fees - costs.shipping - costs.insurance))")
                                    .foregroundStyle(Theme.green)
                            }
                            .font(.caption.monospaced())
                            Text("Fees \(money(costs.fees)) · shipping \(money(costs.shipping))\(insured ? " · insurance \(money(costs.insurance))" : "")")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .navigationTitle("Sell")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("List \(lines.count)") {
                        let snapshot = Dictionary(uniqueKeysWithValues: lines.map { ($0.id, channel == .ebayAuction ? reference($0) : price($0)) })
                        store.list(ids, channel: channel, price: { snapshot[$0] ?? 0 },
                                   auctionDays: channel == .ebayAuction ? auctionDays : nil, insured: insured)
                        dismiss()
                    }
                    .disabled(lines.isEmpty)
                }
            }
            .onAppear { if !tcgAllowed { channel = .ebay } }
        }
    }

    private var channelNote: String {
        switch channel {
        case .tcgplayer: "Raw singles. The lowest listing sells first. Fees \(Int(Balance.tcgFeeRate * 1000) / 10)% + \(money(Balance.tcgFeeFlat))."
        case .ebay: "A fixed price. Slower, but the price is known. The highest fees."
        case .ebayAuction: "The bids set the price. It can end high or well below value."
        case .social: "Post it for sale on the social media hub."
        }
    }
}

/// Send raw cards to a grading company (docs/10-grading.md).
struct GradeSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let ids: Set<UUID>
    @State private var company: GradingCompany = .psa
    @State private var tierIndex = 0

    var body: some View {
        let cards = store.data.raw.filter { ids.contains($0.id) && $0.status == nil }
        let tiers = Balance.gradingTiers[company] ?? []
        let tier = tiers[min(tierIndex, tiers.count - 1)]
        let total = tier.fee * Double(cards.count)
        NavigationStack {
            Form {
                Section("Company") {
                    Picker("Company", selection: $company) {
                        ForEach(GradingCompany.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Text(companyNote).font(.caption).foregroundStyle(Theme.muted)
                }
                Section("Service") {
                    Picker("Service", selection: $tierIndex) {
                        ForEach(tiers.indices, id: \.self) { i in
                            Text("\(tiers[i].name) · \(money(tiers[i].fee)) · \(tiers[i].days) days").tag(i)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section("Cards") {
                    ForEach(cards) { card in
                        HStack {
                            Text(card.print.name).font(.subheadline)
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text("raw \(money(card.market))").font(.caption.monospaced())
                                let ten = card.print.gradedPrice("\(company.rawValue.lowercased())10")
                                Text("\(company.rawValue) 10 \(ten.map(money) ?? "—")").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                Section {
                    HStack {
                        Text("Total fee")
                        Spacer()
                        Text(money(total)).font(.body.monospaced().weight(.semibold))
                    }
                    if !store.canAfford(total) {
                        Text("You have \(money(store.cash)). That is not enough.").foregroundStyle(Theme.orange)
                    }
                }
            }
            .navigationTitle("Grade")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: company) { _, _ in tierIndex = 0 }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") {
                        store.submit(Set(cards.map(\.id)), to: company, tier: tier)
                        dismiss()
                    }
                    .disabled(cards.isEmpty || !store.canAfford(total))
                }
            }
        }
    }

    private var companyNote: String {
        switch company {
        case .psa: "Slowest and most expensive. The highest resale value for the same grade."
        case .bgs: "Mid speed and cost. Prints all four subgrades. All 10s is a Black Label."
        case .cgc: "Fastest and cheapest. Less resale value for the same grade."
        }
    }
}
