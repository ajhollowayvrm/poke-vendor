import SwiftUI

/// Auctions (docs/36-auctions.md): the player's own auctions with live bids, eBay lots to bid on, and the auction house
/// catalogs of big slabs.
struct AuctionsView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var tab: Tab = .selling
    @State private var bidLot: AuctionLot?

    enum Tab: String, CaseIterable { case selling = "Selling", ebay = "eBay", houses = "Houses" }

    #if DEBUG
    /// Screenshot aid: `-route auctions-ebay` and `-route auctions-houses` (Hub/HubView+Debug.swift).
    static var debugTab: Tab = .selling
    #endif

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Tab", selection: $tab) {
                    ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                HStack {
                    Text(store.buyCashLabel).font(.subheadline.monospaced())
                    Spacer()
                    Text("Day \(store.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                switch tab {
                case .selling: selling
                case .ebay: ebay
                case .houses: houses
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Auctions")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            store.refreshLots()
            #if DEBUG
            tab = Self.debugTab
            #endif
        }
        .sheet(item: $bidLot) { BidSheet(lotID: $0.id) }
    }

    // MARK: - Selling

    /// The player's eBay auctions: cards, slabs, and sealed product.
    private var myAuctions: [(id: UUID, name: String, listing: Listing, route: AppRoute)] {
        store.ownAuctions().map { a in
            (id: a.id, name: a.name, listing: a.listing, route: store.data.sealed.contains { $0.id == a.id } ? .sealed(a.id) : .card(a.id))
        }.sorted { ($0.listing.auctionEndDay ?? 0) < ($1.listing.auctionEndDay ?? 0) }
    }

    /// Slabs and sealed product at the houses: id, name, route, and the consignment.
    private var consigned: [(id: UUID, name: String, route: AppRoute, a: AuctionConsignment)] {
        let slabs = store.data.slabs.compactMap { c -> (id: UUID, name: String, route: AppRoute, a: AuctionConsignment)? in
            if case .atAuctionHouse(let a) = c.status { return (c.id, "\(c.print.name) \(c.grade?.label ?? "")", .card(c.id), a) }
            return nil
        }
        let sealed = store.data.sealed.compactMap { i -> (id: UUID, name: String, route: AppRoute, a: AuctionConsignment)? in
            if case .atAuctionHouse(let a) = i.status { return (i.id, i.name, .sealed(i.id), a) }
            return nil
        }
        return (slabs + sealed).sorted { $0.a.auctionDay < $1.a.auctionDay }
    }

    @ViewBuilder private var selling: some View {
        DetailBox(title: "Your eBay auctions") {
            if myAuctions.isEmpty {
                Text("None now. Select items in Inventory, tap Sell, and pick eBay auction.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(myAuctions, id: \.id) { a in
                Button { nav.path.append(a.route) } label: { OwnAuctionRow(name: a.name, listing: a.listing, id: a.id) }
                    .buttonStyle(.plain)
            }
        }
        DetailBox(title: "At the auction houses") {
            if consigned.isEmpty {
                Text("None now. A house takes a slab or sealed product worth \(money(Balance.auctionMinValue)) or more. Open the item and tap Auction.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(consigned, id: \.id) { c in
                let a = c.a
                Button { nav.path.append(c.route) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).font(.subheadline.weight(.medium)).lineLimit(1)
                            Text("\(a.house.rawValue) · auction day \(a.auctionDay + 1) · in \(max(0, a.auctionDay - store.day)) days")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("est. \(money(a.estimate))").font(.caption.monospaced())
                            Text(a.reserve.map { "reserve \(money($0))" } ?? "no reserve").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            ForEach(AuctionHouse.allCases) { house in
                let ok = store.reputationTier >= house.minReputationTier
                HStack {
                    Image(systemName: ok ? "checkmark.circle.fill" : "lock.fill").foregroundStyle(ok ? Theme.green : Theme.muted)
                    Text(house.rawValue).font(.caption)
                    Spacer()
                    Text(ok ? "takes your slabs" : "needs \(ReputationTier.names[house.minReputationTier]) seller")
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            Text("Your reputation: \(store.reputationName).").font(.caption2).foregroundStyle(Theme.muted)
        }
        if !store.data.auctionPayouts.isEmpty {
            DetailBox(title: "Payouts on the way") {
                ForEach(store.data.auctionPayouts) { p in
                    HStack {
                        Text("\(p.name) · \(p.house.rawValue)").font(.caption).lineLimit(1)
                        Spacer()
                        Text("\(money(p.amount)) · day \(p.day + 1)").font(.caption.monospaced())
                    }
                }
            }
        }
        let bidding = store.openLots.filter { $0.playerMax != nil }
        if !bidding.isEmpty {
            DetailBox(title: "Your bids") {
                ForEach(bidding) { lot in lotRow(lot) }
            }
        }
    }

    // MARK: - Buying

    @ViewBuilder private var ebay: some View {
        Text("Set your top bid. eBay bids for you, one step at a time, up to it. Other bidders often wait for the last day. A lot can be a fake. Buy It Now goes away with the first bid.")
            .font(.caption).foregroundStyle(Theme.muted)
        let held = store.committedBids(account: store.buyAccount)
        if held > 0 {
            Text("Your top bids hold \(money(held)) of your cash. A new bid can use \(money(max(0, store.buyCash - held))).")
                .font(.caption.monospaced()).foregroundStyle(Theme.cyan)
        }
        ForEach(store.ebayLots) { lot in lotRow(lot) }
    }

    @ViewBuilder private var houses: some View {
        Text("Big slabs and high-end sealed product, \(money(Balance.lotHouseMinValue)) and up. Each catalog opens \(Balance.lotHousePreviewDays) days before its auction day. The house checks every slab and every seal, so none are fake. You pay the buyer's premium on top of the hammer.")
            .font(.caption).foregroundStyle(Theme.muted)
        ForEach(AuctionHouse.allCases) { house in
            let lots = store.houseLots(house)
            let day = store.nextCatalogDay(house)
            DetailBox(title: "\(house.rawValue) · day \(day + 1)") {
                Text("\(house.blurb) Buyer's premium \(Int((house.buyerPremium * 100).rounded()))%.").font(.caption).foregroundStyle(Theme.muted)
                if lots.isEmpty {
                    Text("The catalog opens on day \(day - Balance.lotHousePreviewDays + 1).").font(.subheadline).foregroundStyle(Theme.muted)
                }
                ForEach(lots) { lot in lotRow(lot) }
            }
        }
    }

    private func lotRow(_ lot: AuctionLot) -> some View {
        let view = store.lotView(lot)
        return HStack(alignment: .top, spacing: 10) {
            GoodsImage(item: VendorItem(goods: lot.goods, price: view.bid, market: lot.market), contentsKey: lot.id.uuidString)
                .frame(width: 44, height: 62)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(lot.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                    if lot.looksOff == true { Tag(text: "LOOKS OFF", color: Theme.orange) }
                }
                GoodsDetail(goods: lot.goods, tool: store.data.centeringTool)
                Text("mkt \(money(lot.market)) · \(view.bids) bid\(view.bids == 1 ? "" : "s") · \(view.daysLeft == 0 ? "ends tonight" : "\(view.daysLeft)d left")")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                if let mine = lot.playerMax {
                    Text(view.playerLeads ? "You lead · your top bid \(money(mine))" : "Outbid · your top bid \(money(mine))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(view.playerLeads ? Theme.green : Theme.orange)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                Text(money(view.bid)).font(.subheadline.monospaced().weight(.semibold))
                Button(lot.playerMax == nil ? "Bid" : "Raise") { bidLot = lot }
                    .primaryButton()
                    .controlSize(.small)
                if let price = lot.buyNow, lot.playerMax == nil, view.bids == 0 {
                    Button("Buy \(money(price))") { store.buyNow(lot.id) }
                        .buttonStyle(.bordered)
                        .tint(Theme.green)
                        .controlSize(.small)
                        .disabled(!store.canBuyNow(lot))
                }
            }
        }
        .padding(10)
        .background(Theme.surface)
        .framed()
    }
}

/// One of the player's own eBay auctions, with its live bid.
struct OwnAuctionRow: View {
    @Environment(GameStore.self) private var store
    let name: String
    let listing: Listing
    let id: UUID

    var body: some View {
        let view = store.ownAuctionView(listing, id: id)
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline.weight(.medium)).lineLimit(1)
                Text("\(view?.bids ?? 0) bid\(view?.bids == 1 ? "" : "s") · \(view?.watchers ?? 0) watching · \(daysText(view?.daysLeft ?? 0))")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(view?.bid.map(money) ?? (listing.auctionStart.map { "Starts \(money($0))" } ?? "No bids"))
                    .font(.subheadline.monospaced().weight(.semibold))
                    .foregroundStyle(view?.bid == nil ? Theme.muted : Theme.green)
                Text("mkt \(money(listing.price))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
            }
        }
        .contentShape(Rectangle())
    }

    private func daysText(_ d: Int) -> String { d <= 0 ? "ends tonight" : "\(d)d left" }
}

/// Set or raise the top bid on a lot.
struct BidSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let lotID: UUID
    @State private var amount: Double = 0

    var body: some View {
        NavigationStack {
            if let lot = store.data.auctionLots.first(where: { $0.id == lotID }) {
                let view = store.lotView(lot)
                let least = store.minimumBid(lot)
                Form {
                    Section {
                        Text(lot.name).font(.headline)
                        Text("\(lot.venue.name) · market \(money(lot.market)) · current bid \(money(view.bid))").font(.caption.monospaced())
                        if let mine = lot.playerMax {
                            Text("Your top bid now: \(money(mine)). \(view.playerLeads ? "You lead." : "You are outbid.")")
                                .font(.caption).foregroundStyle(view.playerLeads ? Theme.green : Theme.orange)
                        }
                    }
                    Section("Your top bid") {
                        TextField("Top bid", value: $amount, format: .currency(code: "USD"))
                            .keyboardType(.decimalPad)
                            .font(.title3.monospaced())
                        // Quick picks: the lowest bid, or a share of the market. A pick never goes under the lowest bid.
                        HStack {
                            Button("Lowest") { amount = least }.buttonStyle(.bordered)
                            ForEach([0.8, 1.0, 1.1], id: \.self) { f in
                                Button("\(Int((f * 100).rounded()))% mkt") { amount = max(least, ShowSession.round(lot.market * f)) }
                                    .buttonStyle(.bordered)
                            }
                        }
                        .font(.caption)
                        Text("If you win at your top bid, you pay \(money(store.lotTotal(lot, hammer: amount)))\(lot.venue.buyerPremium > 0 ? ", with the \(Int((lot.venue.buyerPremium * 100).rounded()))% buyer's premium and shipping" : ", with shipping"). You often win for less: one step over the next bidder.")
                            .font(.caption).foregroundStyle(Theme.muted)
                        if let block = store.bidBlock(lot, max: amount) {
                            Text(block).font(.caption).foregroundStyle(Theme.orange)
                        }
                    }
                }
                .navigationTitle("Bid")
                .navigationBarTitleDisplayMode(.inline)
                .onAppear { amount = least }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Bid") {
                            if store.placeBid(lot.id, max: amount) { dismiss() }
                        }
                        .disabled(store.bidBlock(lot, max: amount) != nil)
                    }
                }
            } else {
                Text("The auction is over.").foregroundStyle(Theme.muted)
            }
        }
    }
}
