import SwiftUI

@main
struct PokeVendorApp: App {
    @State private var store = InventoryStore()

    init() {
        // Card images come from the TCGplayer CDN. Keep them on disk between launches.
        URLCache.shared = URLCache(memoryCapacity: 64 << 20, diskCapacity: 512 << 20)
    }

    var body: some Scene {
        WindowGroup {
            InventoryView()
                .environment(store)
                .preferredColorScheme(.dark)
        }
    }
}
