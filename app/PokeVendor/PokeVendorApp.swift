import SwiftUI

@main
struct PokeVendorApp: App {
    @State private var store = GameStore()
    @State private var nav = AppNav()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Card images come from the TCGplayer CDN. Keep them on disk between launches.
        URLCache.shared = URLCache(memoryCapacity: 64 << 20, diskCapacity: 512 << 20)
    }

    var body: some Scene {
        WindowGroup {
            HubView()
                .environment(store)
                .environment(nav)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { store.saveNow() }
        }
    }
}
