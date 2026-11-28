import SwiftUI

/// The shelf price of a slab and the online listing of one item in the player's store, in the item's Status box
/// (docs/22-own-store.md). The parent shows the sell sheet for `sheet`.
struct StoreShelfControls: View {
    @Environment(GameStore.self) private var store
    let id: UUID
    /// The copies that List online too lists: `id` alone, or a quantity of its stack.
    var ids: [UUID] = []
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
                // A running auction cannot come down, as on eBay.
                if listing.auctionEndDay == nil {
                    Button("Remove online listing") { store.removeOnlineListing(id) }
                        .buttonStyle(.bordered)
                }
            } else {
                let list = ids.isEmpty ? [id] : ids
                Button(list.count > 1 ? "List \(list.count) online too" : "List online too") { sheet = SellRequest(ids: Set(list), startAll: false) }
                    .buttonStyle(.bordered)
            }
        }
    }
}
