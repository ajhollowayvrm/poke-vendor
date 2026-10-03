import SwiftUI

/// The store list (docs/08-ui-direction.md, Buy screen).
struct BuyView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var local: Bool

    init(local: Bool = false) {
        _local = State(initialValue: local)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Picker("Where", selection: $local) {
                    Text("Online").tag(false)
                    Text("Local").tag(true)
                }
                .pickerStyle(.segmented)
                if local {
                    StoreRunPlanner()
                } else {
                    VStack(spacing: 0) {
                        ForEach(Storefront.allCases, id: \.self) { s in
                            channelRow(title: s.rawValue, detail: status(s)) { nav.path.append(.store(s)) }
                        }
                        channelRow(title: "Supplies", detail: store.suppliesSummary) { nav.path.append(.supplies) }
                        // Locked channels do not show (docs/12, Distributor / wholesale; Case splits).
                        if store.wholesaleOpen {
                            channelRow(title: "Distributor", detail: "Cases at \(Int((store.wholesaleDiscountNow * 100).rounded()))% of MSRP · \(store.wholesaleOffers.count) this week") {
                                nav.path.append(.wholesale)
                            }
                            channelRow(title: "Case splits", detail: store.openSplits.isEmpty ? "No invites right now" : "\(store.openSplits.count) open") {
                                nav.path.append(.caseSplits)
                            }
                        }
                    }
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.line))
                }
                Text(local ? "A store run costs time. Each store adds 40 minutes. You learn what a store has only when you get there."
                           : "Buying online is a free action. You pay now, and the item arrives after its delivery time.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Buy")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func channelRow(title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline)
                    Text(detail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .padding(14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func status(_ s: Storefront) -> String {
        let offers = Market.offers(for: s, day: store.day)
        switch s {
        case .pokemonCenter:
            guard store.isPokemonCenterDropLive, let o = offers.first else { return "No drop live" }
            return store.data.pokemonCenterAttempted ? "Drop live · you already tried" : "Drop live: \(o.title)"
        case .amazon: return "\(offers.count) items in stock · \(Balance.deliveryDays[s] ?? 0)-day delivery"
        case .reseller: return "Always in stock · 2x market or more"
        case .ebay: return "\(offers.count) listings today · sealed and singles"
        case .facebook: return "\(offers.count) listings nearby · pickup or shipped"
        }
    }
}

struct StoreView: View {
    @Environment(GameStore.self) private var store
    let store_: Storefront
    @State private var confirm: StoreOffer?
    @State private var message: String?

    init(store: Storefront) {
        store_ = store
    }

    var body: some View {
        let offers = store_ == .pokemonCenter && !store.isPokemonCenterDropLive ? [] : Market.offers(for: store_, day: store.day)
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Text(header).font(.caption).foregroundStyle(Theme.muted)
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if let message {
                    Banner(text: message, color: Theme.cyan)
                }
                if offers.isEmpty {
                    EmptyTab(text: store_ == .pokemonCenter ? "No drop live. Drops come with no notice." : "Nothing for sale today.")
                        .background(Theme.surface)
                        .overlay(Rectangle().stroke(Theme.line))
                }
                VStack(spacing: 0) {
                    ForEach(SetLibrary.grouped(offers, by: { $0.setSlug }), id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "store") {
                            ForEach(group.items) { offer in
                                OfferRow(offer: offer, bought: store.data.boughtToday.contains(offer.id),
                                         locked: store_ == .pokemonCenter && store.data.pokemonCenterAttempted) {
                                    confirm = offer
                                }
                            }
                        }
                    }
                }
                .background(Theme.surface)
                .overlay(Rectangle().stroke(Theme.line))
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(store_.rawValue)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(confirm?.title ?? "", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                            titleVisibility: .visible, presenting: confirm) { offer in
            Button(buttonTitle(offer)) { purchase(offer) }
        } message: { offer in
            Text(confirmText(offer))
        }
    }

    private var header: String {
        switch store_ {
        case .pokemonCenter: "MSRP · drops only · one attempt at \(Int(Balance.pokemonCenterSuccessChance * 100))% · 5-day delivery"
        case .amazon: "At or over market, sometimes far over · 2-day delivery"
        case .reseller: "Always in stock at 2x market or more · 3-day delivery"
        case .ebay: "Individual sellers · check the seller rating · 4-day delivery"
        case .facebook: "Local sellers · pickups cost 1 hour today"
        }
    }

    private func buttonTitle(_ offer: StoreOffer) -> String {
        let total = money(offer.price + offer.shipping)
        if store_ == .pokemonCenter { return "Try the drop · \(total)" }
        return offer.pickup ? "Pick up · \(total)" : "Buy · \(total)"
    }

    private func confirmText(_ offer: StoreOffer) -> String {
        var parts = ["Market price \(money(offer.market))."]
        if offer.shipping > 0 { parts.append("Shipping \(money(offer.shipping)).") }
        if let day = offer.pickupDay, day > store.day {
            parts.append("The seller can meet on day \(day + 1). You pay now, and the pickup takes 1 hour that day.")
        } else if offer.pickup {
            if let start = store.slot(for: Balance.facebookPickupHours) {
                parts.append("The pickup takes 1 hour, starting at \(GameStore.clock(start)).")
            } else {
                parts.append("You have no free hour left today for a pickup.")
            }
        } else {
            parts.append("It arrives in \(offer.deliveryDays) days.")
        }
        return parts.joined(separator: " ")
    }

    private func purchase(_ offer: StoreOffer) {
        let total = offer.price + offer.shipping
        guard store.canAfford(total) else {
            message = "You need \(money(total)). You have \(money(store.cash))."
            return
        }
        if store_ == .pokemonCenter {
            message = store.attemptDrop(offer) ? "You got it! It arrives in \(offer.deliveryDays) days." : "Missed. The drop sold out before your checkout went through."
            return
        }
        let later = (offer.pickupDay ?? store.day) > store.day
        if offer.pickup && !later && store.slot(for: Balance.facebookPickupHours) == nil {
            message = "You have no free hour left today for this pickup."
            return
        }
        if store.buy(offer) {
            message = later ? "Paid. The pickup is on your calendar." : offer.pickup ? "Picked up. It is in your Inventory now." : "Bought. It arrives in \(offer.deliveryDays) days."
        }
    }
}

struct OfferRow: View {
    let offer: StoreOffer
    let bought: Bool
    let locked: Bool
    let onBuy: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if offer.isSingle {
                    RemoteCardImage(url: offer.imageURL, name: "")
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                } else {
                    RemoteCardImage(url: offer.imageURL, name: "", upright: false)
                        .aspectRatio(contentMode: .fit)
                        .padding(2)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
            }
            .frame(width: 50, height: 64)
            VStack(alignment: .leading, spacing: 3) {
                Text(offer.title).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("mkt \(money(offer.market))\(offer.shipping > 0 ? " · ship \(money(offer.shipping))" : "")")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                if let rating = offer.sellerRating, let sales = offer.sellerSales {
                    Text("Seller \(String(format: "%.1f", rating))% · \(sales) sales")
                        .font(.caption2.monospaced())
                        .foregroundStyle(rating < 97 ? Theme.orange : Theme.muted)
                }
                if let note = offer.note {
                    Text(note).font(.caption2).foregroundStyle(Theme.cyan)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                Text(money(offer.price)).font(.subheadline.monospaced().weight(.semibold))
                Button(bought ? "Bought" : offer.store == .pokemonCenter ? "Try" : "Buy", action: onBuy)
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
                    .controlSize(.small)
                    .disabled(bought || locked)
            }
        }
        .padding(12)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}
