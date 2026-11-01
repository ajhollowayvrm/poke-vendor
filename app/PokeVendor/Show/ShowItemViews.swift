import SwiftUI

struct ItemLine: View {
    @Environment(GameStore.self) private var store
    let item: ShowItem

    var body: some View {
        HStack(spacing: 10) {
            ItemImage(item: item).frame(width: 34, height: 47)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.subheadline).lineLimit(1)
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
    let item: ShowItem

    var body: some View {
        Group {
            if item.kind == .sealed {
                ProductImage(url: item.image, setName: item.name).clipShape(RoundedRectangle(cornerRadius: 3))
            } else {
                CardOrSlab(image: item.image, name: item.name, grade: item.grade, subgrades: item.subgrades, certID: item.id)
            }
        }
    }
}
