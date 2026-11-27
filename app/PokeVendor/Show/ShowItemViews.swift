import SwiftUI

struct ItemLine: View {
    @Environment(GameStore.self) private var store
    let item: ShowItem
    /// False on the store's own screen, where every item is store stock.
    var storeTag = true

    var body: some View {
        HStack(spacing: 10) {
            ItemImage(item: item).frame(width: 34, height: 47)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(item.name).font(.subheadline).lineLimit(1)
                    if item.pc { Tag(text: item.showcase ? "SHOWCASE" : "PC", color: Theme.green) }
                    // Store stock away from the store: it goes back unsold, and its sale pays the business (docs/42).
                    if storeTag, item.fromStore, store.counterSession == nil { Tag(text: "STORE", color: Theme.cyan) }
                }
                if let c = item.condition {
                    RawLooks(condition: c)
                } else {
                    Text(item.detail).font(.caption.monospaced()).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
        }
    }
}

struct ItemImage: View {
    @Environment(GameStore.self) private var store
    let item: ShowItem

    var body: some View {
        Group {
            if item.kind == .sealed {
                // The player's own box: its real packs.
                let owned = store.data.sealed.first { $0.id == item.id && $0.brokenFrom == nil }
                ProductImage(url: item.image, setName: item.name).clipShape(RoundedRectangle(cornerRadius: 3))
                    .looksInside(owned.flatMap { SetLibrary.product($0.productID) }) { owned.map { store.packSlugs(of: $0) } }
            } else {
                CardOrSlab(image: item.image, name: item.name, grade: item.grade, subgrades: item.subgrades, certID: item.id)
            }
        }
    }
}
