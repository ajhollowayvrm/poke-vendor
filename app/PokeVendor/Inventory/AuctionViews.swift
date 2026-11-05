import SwiftUI

/// The request to consign one slab to an auction house.
struct AuctionRequest: Identifiable {
    let id: UUID
}

/// Consign a slab to an auction house (docs/15-selling.md, Auction houses): pick the house and the reserve, see the
/// auction day, the fees, and the expected payout.
struct AuctionConsignSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let cardID: UUID
    @State private var house: AuctionHouse = .fanatics
    @State private var reserveShare: Double?

    var body: some View {
        NavigationStack {
            if let card = store.data.slabs.first(where: { $0.id == cardID }) {
                content(card)
            } else {
                GoneView()
            }
        }
        .presentationDetents([.large])
        .onAppear {
            // Start on the first house that takes the slab.
            if let card = store.data.slabs.first(where: { $0.id == cardID }),
               let open = AuctionHouse.allCases.first(where: { store.auctionBlock($0, card: card) == nil }) {
                house = open
            }
        }
    }

    private func content(_ card: OwnedCard) -> some View {
        let market = card.realMarket
        let block = store.auctionBlock(house, card: card)
        let fee = store.auctionSellerFee(house, value: market)
        let hammer = store.expectedHammer(house, market: market)
        let net = hammer * (1 - fee)
        let day = store.nextAuctionDay(house, after: store.day)
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                DetailBox(title: "The slab") {
                    Text("\(card.print.name) \(card.grade?.label ?? "")").font(.subheadline.weight(.semibold))
                    Text("Market \(money(market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "House") {
                    ForEach(AuctionHouse.allCases) { h in
                        let hBlock = store.auctionBlock(h, card: card)
                        Button { house = h } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: house == h ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(house == h ? Theme.cyan : Theme.muted)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(h.rawValue).font(.subheadline.weight(.semibold))
                                    Text(h.blurb).font(.caption).foregroundStyle(Theme.muted)
                                    Text("Seller fee \(percent(store.auctionSellerFee(h, value: market))) · buyer's premium \(percent(h.buyerPremium)) · auction day \(store.nextAuctionDay(h, after: store.day) + 1)")
                                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    if let hBlock { Text(hBlock).font(.caption).foregroundStyle(Theme.orange) }
                                }
                                Spacer()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                DetailBox(title: "Reserve") {
                    Picker("Reserve", selection: $reserveShare) {
                        Text("None").tag(Double?.none)
                        ForEach(Balance.auctionReserveShares, id: \.self) { share in
                            Text("\(Int(share * 100))%").tag(Double?.some(share))
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(reserveShare.map { "The slab sells only at \(money(market * $0)) or more. If no bid gets there, it comes back, and you pay \(Int(Balance.auctionReserveFee * 100))% of the reserve." }
                         ?? "With no reserve, the slab sells to the top bid.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "Expected") {
                    HStack(spacing: 0) {
                        StatCell(label: "Hammer", value: money(hammer))
                        StatCell(label: "You get", value: money(net))
                    }
                    Text("The buyers pay the hammer plus the \(percent(house.buyerPremium)) premium, so the premium lowers the bids. The top bid can land about \(Int(Balance.auctionBidSpread * 100))% either way. The house pays \(Balance.auctionPayoutDays) days after the auction. Shipping costs \(money(Balance.auctionShipping)) now. The slab cannot come back before its auction on day \(day + 1).")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                Button("Send to \(house.rawValue)") {
                    store.consignToAuction(cardID, house: house, reserveShare: reserveShare)
                    dismiss()
                }
                .primaryButton()
                .controlSize(.large)
                .frame(maxWidth: .infinity)
                .disabled(block != nil || store.cash < Balance.auctionShipping)
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Auction house")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }

    private func percent(_ x: Double) -> String { "\(Int((x * 100).rounded()))%" }
}
