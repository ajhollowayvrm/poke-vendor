import SwiftUI

/// List the selected items on TCGplayer or eBay (docs/15-selling.md).
struct SellSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let ids: Set<UUID>
    /// True: each stack starts at its full count. False: each stack starts at 1 (a sale from a detail screen).
    var startAll = true
    /// True: the items are in the player's store and stay there. The listing is online too (docs/22-own-store.md).
    var alsoOnline = false
    @State private var channel: Listing.Channel = .tcgplayer
    /// How many items of each stack to list, by the stack's first item.
    @State private var quantity: [UUID: Int] = [:]
    @State private var percent: Double = 100
    @State private var auctionDays = 7
    @State private var insured = false

    /// One stack of identical items.
    private struct Line: Identifiable {
        let id: UUID
        let ids: [UUID]
        let name: String
        let reference: Double
        let sealed: Bool
        let isRaw: Bool
    }

    /// The prices are what a real copy sells for: a buyer does not know a fake until they look (docs/14).
    private var lines: [Line] {
        var out: [Line] = []
        for st in stacks(store.data.raw.filter { ids.contains($0.id) }, key: store.stackKey) {
            out.append(Line(id: st.id, ids: st.items.map(\.id), name: st.items[0].print.name, reference: 0, sealed: false, isRaw: true))
        }
        for st in stacks(store.data.slabs.filter { ids.contains($0.id) }, key: store.stackKey) {
            let c = st.items[0]
            out.append(Line(id: st.id, ids: st.items.map(\.id), name: "\(c.print.name) \(c.grade?.label ?? "")", reference: c.realMarket,
                            sealed: false, isRaw: false))
        }
        for st in stacks(store.data.sealed.filter { ids.contains($0.id) }, key: store.stackKey) {
            let s = st.items[0]
            out.append(Line(id: st.id, ids: st.items.map(\.id), name: s.name, reference: store.realMarket(of: s), sealed: true, isRaw: false))
        }
        return out
    }

    /// True when any item to list is a fake that the player knows about.
    private var sellingKnownFake: Bool {
        (store.data.raw + store.data.slabs).contains { ids.contains($0.id) && $0.isKnownFake }
            || store.data.sealed.contains { ids.contains($0.id) && $0.isKnownFake }
    }

    private func count(_ line: Line) -> Int {
        min(line.ids.count, max(1, quantity[line.id] ?? (startAll ? line.ids.count : 1)))
    }

    private func quantityBinding(_ line: Line) -> Binding<Int> {
        Binding(get: { count(line) }, set: { quantity[line.id] = $0 })
    }

    /// The items to list: the chosen number from each stack.
    private var chosenIDs: [UUID] { lines.flatMap { Array($0.ids.prefix(count($0))) } }

    /// TCGplayer prices against the lowest listing. eBay prices against the market price.
    private func reference(_ line: Line) -> Double {
        guard line.isRaw, let card = store.card(line.id) else { return line.reference }
        return channel == .tcgplayer ? GameStore.tcgLowest(for: card.print) : card.realMarket
    }

    private func price(_ line: Line) -> Double {
        max(0.05, (reference(line) * percent / 100 * 100).rounded() / 100)
    }

    private var tcgAllowed: Bool { lines.allSatisfy(\.isRaw) }

    /// What the player paid for each chosen item of a stack, on average. Nil when every one was pulled from a pack.
    private func paidEach(_ line: Line) -> Double? {
        let paid = line.ids.prefix(count(line)).map { store.paidFor($0) }
        guard paid.contains(where: { $0 != nil }) else { return nil }
        return paid.reduce(0) { $0 + ($1 ?? 0) } / Double(paid.count)
    }

    /// The profit on every chosen item, after fees and shipping.
    private var totalProfit: Double {
        lines.reduce(0) { sum, line in
            let p = channel == .ebayAuction ? reference(line) : price(line)
            let costs = GameStore.saleCosts(price: p, channel: channel, sealed: line.sealed, insured: insured)
            let net = p - costs.fees - costs.shipping - costs.insurance
            return sum + (net - (paidEach(line) ?? 0)) * Double(count(line))
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if sellingKnownFake {
                    Section {
                        Label("You know this is a fake. If the buyer finds out, it is a scam: a refund, a hit to your reputation, and maybe a public accusation.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Theme.orange)
                    }
                }
                if alsoOnline {
                    Section {
                        Text("The items stay in your store. If one sells online, it leaves the store. If it sells in the store first, the listing goes away. On rare days both happen: you cancel the online order, and your reputation goes down.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }
                Section("Channel") {
                    Picker("Channel", selection: $channel) {
                        if tcgAllowed { Text("TCGplayer").tag(Listing.Channel.tcgplayer) }
                        Text("eBay Buy It Now").tag(Listing.Channel.ebay)
                        Text("eBay auction").tag(Listing.Channel.ebayAuction)
                        if !alsoOnline { Text("Facebook Marketplace").tag(Listing.Channel.facebook) }
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
                if channel.ships {
                    Section {
                        Toggle("Shipping insurance", isOn: $insured)
                    }
                }
                if store.hasSalesAnalytics {
                    Section("Sales analytics") {
                        let total = totalProfit
                        HStack {
                            Text(total >= 0 ? "You make money" : "You lose money")
                            Spacer()
                            Text(signedMoney(total))
                                .font(.title3.monospaced().weight(.semibold))
                                .foregroundStyle(total >= 0 ? Theme.green : Theme.orange)
                        }
                        Text("The profit on all \(chosenIDs.count) item\(chosenIDs.count == 1 ? "" : "s") at this price, after fees and shipping, against what you paid. A pulled card counts as free.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }
                Section("Items") {
                    ForEach(lines) { line in
                        let p = channel == .ebayAuction ? reference(line) : price(line)
                        let costs = GameStore.saleCosts(price: p, channel: channel, sealed: line.sealed, insured: insured)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(line.name).font(.subheadline.weight(.medium))
                            if line.ids.count > 1 {
                                Stepper("Quantity \(count(line)) of \(line.ids.count)", value: quantityBinding(line), in: 1...line.ids.count)
                                    .font(.subheadline)
                            }
                            let each = line.ids.count > 1 ? " each" : ""
                            HStack {
                                Text(channel == .ebayAuction ? "Expected \(money(p))\(each)" : "Price \(money(p))\(each)")
                                Spacer()
                                Text("You get about \(money(p - costs.fees - costs.shipping - costs.insurance))\(each)")
                                    .foregroundStyle(Theme.green)
                            }
                            .font(.caption.monospaced())
                            Text("Fees \(money(costs.fees)) · shipping \(money(costs.shipping))\(insured ? " · insurance \(money(costs.insurance))" : "")")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Theme.muted)
                            if store.hasSalesAnalytics {
                                ProfitLine(net: p - costs.fees - costs.shipping - costs.insurance, paid: paidEach(line), each: each)
                            }
                        }
                    }
                }
            }
            .navigationTitle(alsoOnline ? "List online too" : "Sell")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("List \(chosenIDs.count)") {
                        var snapshot: [UUID: Double] = [:]
                        for line in lines {
                            let p = channel == .ebayAuction ? reference(line) : price(line)
                            for id in line.ids { snapshot[id] = p }
                        }
                        let days = channel == .ebayAuction ? auctionDays : nil
                        if alsoOnline {
                            store.listOnline(Set(chosenIDs), channel: channel, price: { snapshot[$0] ?? 0 }, auctionDays: days,
                                             insured: insured)
                        } else {
                            store.list(Set(chosenIDs), channel: channel, price: { snapshot[$0] ?? 0 }, auctionDays: days,
                                       insured: insured)
                        }
                        dismiss()
                    }
                    .disabled(chosenIDs.isEmpty)
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
        case .whatnot: "Sold live on a stream."
        case .facebook: "Local buyers, cash, no fees, no shipping. Buyers offer low, and the meetup takes 1 hour. Some do not show up."
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
                            VStack(alignment: .leading, spacing: 3) {
                                Text(card.print.name).font(.subheadline)
                                RawLooks(condition: card.condition)
                                HStack(spacing: 4) {
                                    Text("Back").font(.caption).foregroundStyle(Theme.muted)
                                    CutLine(reading: .back(card.condition.cut, tool: store.data.centeringTool))
                                }
                            }
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

/// The sales analytics line under an item: what the player paid, and the profit at this price.
struct ProfitLine: View {
    let net: Double
    let paid: Double?
    var each = ""

    var body: some View {
        let profit = net - (paid ?? 0)
        HStack {
            Text(paid.map { "Paid \(money($0))\(each)" } ?? "Pulled from a pack")
                .foregroundStyle(Theme.muted)
            Spacer()
            Text("\(profit >= 0 ? "Profit" : "Loss") \(signedMoney(profit))\(each)")
                .foregroundStyle(profit >= 0 ? Theme.green : Theme.orange)
        }
        .font(.caption.monospaced())
    }
}
