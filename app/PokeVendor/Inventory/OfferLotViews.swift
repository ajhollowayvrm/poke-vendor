import SwiftUI

/// The Best Offer settings in the sell sheet (docs/15-selling.md, eBay).
struct BestOfferSection: View {
    @Binding var acceptOffers: Bool
    @Binding var autoAcceptOn: Bool
    @Binding var autoDeclineOn: Bool
    @Binding var autoAccept: Double
    @Binding var autoDecline: Double

    var body: some View {
        Section("Best Offer") {
            Toggle("Accept offers", isOn: $acceptOffers)
            if acceptOffers {
                Toggle("Auto-accept", isOn: $autoAcceptOn)
                if autoAcceptOn {
                    HStack {
                        Slider(value: $autoAccept, in: (Balance.autoAcceptRange.lowerBound * 100)...(Balance.autoAcceptRange.upperBound * 100), step: 1)
                        Text("\(Int(autoAccept))%").font(.body.monospaced()).frame(width: 56, alignment: .trailing)
                    }
                }
                Toggle("Auto-decline", isOn: $autoDeclineOn)
                if autoDeclineOn {
                    HStack {
                        Slider(value: $autoDecline, in: (Balance.autoDeclineRange.lowerBound * 100)...(Balance.autoDeclineRange.upperBound * 100), step: 1)
                        Text("\(Int(autoDecline))%").font(.body.monospaced()).frame(width: 56, alignment: .trailing)
                    }
                }
            }
            Text("Buyers send offers over the listing time, often under your price. An offer waits \(Balance.offerDays) days for your answer. Auto-accept sells at once at or above its share of your price. Auto-decline turns down any offer below its share.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// The offers that wait for an answer, and the counters that wait for a buyer (docs/15-selling.md, Best Offer).
struct BestOfferBox: View {
    @Environment(GameStore.self) private var store
    @State private var countering: BestOffer?

    var body: some View {
        let pending = store.pendingBestOffers
        let countered = store.counteredBestOffers
        if !pending.isEmpty || !countered.isEmpty {
            DetailBox(title: "Offers on eBay") {
                ForEach(pending) { o in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(o.itemName).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Spacer()
                            Text(money(o.amount)).font(.subheadline.monospaced()).foregroundStyle(Theme.green)
                        }
                        let left = o.day + Balance.offerDays - store.day
                        Text("\(o.buyer) offers \(Int(o.amount / max(o.listPrice, 0.01) * 100))% of your \(money(o.listPrice)). \(left <= 0 ? "Answer today." : "Open for \(left) more day\(left == 1 ? "" : "s").")")
                            .font(.caption).foregroundStyle(Theme.muted)
                        HStack {
                            Button("Accept") { store.acceptBestOffer(o.id) }.buttonStyle(.borderedProminent).foregroundStyle(.black)
                            Button("Counter") { countering = o }.buttonStyle(.bordered)
                            Button("Decline") { store.declineBestOffer(o.id) }.buttonStyle(.bordered)
                        }
                        .controlSize(.small)
                    }
                    .padding(.vertical, 4)
                }
                ForEach(countered) { o in
                    HStack {
                        Text(o.itemName).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text("Counter \(money(o.counter ?? 0)) · \(o.buyer) answers at End Day")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 2)
                }
            }
            .sheet(item: $countering) { CounterSheet(offer: $0) }
        }
    }
}

/// The counter: a price above the offer, and at or under the listing price.
struct CounterSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let offer: BestOffer
    @State private var price: Double

    init(offer: BestOffer) {
        self.offer = offer
        _price = State(initialValue: ShowSession.round((offer.amount + offer.listPrice) / 2))
    }

    private var low: Double { offer.amount + 0.25 }
    private var high: Double { max(offer.listPrice, low) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Counter") {
                    Text("\(offer.buyer) offers \(money(offer.amount)) for \(offer.itemName). Your price is \(money(offer.listPrice)).")
                        .font(.subheadline)
                    HStack {
                        Slider(value: $price, in: low...high, step: 0.25)
                        Text(money(price)).font(.body.monospaced()).frame(width: 80, alignment: .trailing)
                    }
                    Text("A buyer who pays more than he planned says no. You get one counter. The buyer answers at End Day. The listing stays up if he says no.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("Counter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        store.counterBestOffer(offer.id, price: min(price, offer.listPrice))
                        dismiss()
                    }
                    .disabled(offer.listPrice <= offer.amount)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// The lots on sale. The player can take a lot down: its items go back to Inventory.
struct LotsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if !store.data.lots.isEmpty {
            DetailBox(title: "Lots on sale") {
                ForEach(store.data.lots) { lot in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(lot.name).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text(money(lot.price)).font(.subheadline.monospaced()).foregroundStyle(Theme.green)
                        }
                        Text("\(lot.channel.rawValue) · day \(store.day - lot.dayListed + 1) of \(Balance.listingDays) · market \(money(store.lotMarket(lot)))\(lot.insured ? " · insured" : "")")
                            .font(.caption).foregroundStyle(Theme.muted)
                        Button("Take down") { store.removeLot(lot.id) }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }
}

/// List the selected items as one lot on eBay or Facebook Marketplace (docs/15-selling.md, Lots).
struct LotSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let ids: Set<UUID>
    @State private var channel: Listing.Channel = .ebay
    @State private var percent = Balance.lotBuyerShare * 100
    @State private var insured = false

    private var raw: [OwnedCard] { store.data.raw.filter { ids.contains($0.id) } }
    private var slabs: [OwnedCard] { store.data.slabs.filter { ids.contains($0.id) } }
    private var sealed: [SealedItem] { store.data.sealed.filter { ids.contains($0.id) } }
    private var count: Int { raw.count + slabs.count + sealed.count }

    private var market: Double {
        (raw + slabs).reduce(0) { $0 + $1.realMarket } + sealed.reduce(0) { $0 + store.realMarket(of: $1) }
    }

    private var price: Double { max(0.5, (market * percent / 100 * 100).rounded() / 100) }

    private var sellingKnownFake: Bool {
        (raw + slabs).contains(where: \.isKnownFake) || sealed.contains(where: \.isKnownFake)
    }

    var body: some View {
        let costs = GameStore.saleCosts(price: price, channel: channel, sealed: !sealed.isEmpty, insured: insured && channel.ships)
        let net = price - costs.fees - costs.shipping - costs.insurance
        NavigationStack {
            Form {
                if sellingKnownFake {
                    Section {
                        Label("A fake that you know about is in this lot. If the buyer finds out, it is a scam.", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Theme.orange)
                    }
                }
                Section("Channel") {
                    Picker("Channel", selection: $channel) {
                        Text("eBay").tag(Listing.Channel.ebay)
                        Text("Facebook Marketplace").tag(Listing.Channel.facebook)
                    }
                    .pickerStyle(.segmented)
                    Text(channel == .ebay
                         ? "One listing, one shipment. eBay fees apply to the whole price."
                         : "Cash, no fees, no shipping. The buyer takes the whole lot. No meetup in this version: the sale happens at End Day.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                Section("Price vs. market value") {
                    HStack {
                        Slider(value: $percent, in: (Balance.lotPriceRange.lowerBound * 100)...(Balance.lotPriceRange.upperBound * 100), step: 1)
                        Text("\(Int(percent))%").font(.body.monospaced()).frame(width: 56, alignment: .trailing)
                    }
                    Text("Lot buyers pay about \(Int(Balance.lotBuyerShare * 100))% of the sum of market values. A lot of cheap or mid-value cards sells much faster than the same cards one by one. A price above the buyer price waits longer. The listing ends after \(Balance.listingDays) days.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                if channel.ships {
                    Section { Toggle("Shipping insurance", isOn: $insured) }
                }
                Section("Lot") {
                    row("Items", "\(count)")
                    row("Sum of market values", money(market))
                    row("Lot price", money(price))
                    row(channel.ships ? "You get about" : "You get", money(net))
                    if channel.ships {
                        Text("Fees \(money(costs.fees)) · shipping \(money(costs.shipping))\(insured ? " · insurance \(money(costs.insurance))" : "")")
                            .font(.caption2.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .navigationTitle("List as a lot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("List") {
                        store.listLot(ids, channel: channel, price: price, insured: insured)
                        dismiss()
                    }
                    .disabled(count < Balance.lotMinItems)
                }
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).font(.body.monospaced())
        }
    }
}
