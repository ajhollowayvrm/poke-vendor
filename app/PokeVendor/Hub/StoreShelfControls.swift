import SwiftUI

/// The shelf price of a slab and the online listing of one item in the player's store, in the item's Status box
/// (docs/22-own-store.md). The parent shows the sell sheet for `sheet`.
struct StoreShelfControls: View {
    @Environment(GameStore.self) private var store
    let id: UUID
    @Binding var sheet: SellRequest?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let slab = store.data.slabs.first(where: { $0.id == id }) {
                HStack {
                    Text("Shelf price \(money(store.storePrice(card: slab)))").font(.subheadline)
                    Spacer()
                    Menu {
                        Button("Singles price") { store.setSlabPrice(id, nil) }
                        ForEach(Balance.storeSlabPrices, id: \.self) { p in
                            Button(CardStoreView.percent(p)) { store.setSlabPrice(id, p) }
                        }
                    } label: {
                        Text(store.slabPrice(id).map(CardStoreView.percent) ?? "Singles price")
                            .font(.caption.monospaced())
                    }
                }
            }
            if let listing = store.onlineListing(of: id) {
                if let end = listing.auctionEndDay {
                    Text("Also on eBay auction · ends day \(end + 1) · expected near \(money(listing.price))").font(.subheadline)
                } else {
                    Text("Also listed on \(listing.channel.rawValue) for \(money(listing.price))").font(.subheadline)
                    Text("Day \(store.day - listing.dayListed + 1) of \(Balance.listingDays)\(listing.insured ? " · insured" : "")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                Button("Remove online listing") { store.removeOnlineListing(id) }
                    .buttonStyle(.bordered)
            } else {
                Button("List online too") { sheet = SellRequest(ids: [id], startAll: false) }
                    .buttonStyle(.bordered)
            }
        }
    }
}
