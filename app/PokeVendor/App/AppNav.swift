import SwiftUI
import Observation

enum AppRoute: Hashable {
    case inventory(InventoryTab)
    case wallet
    case activity
    case buy
    case buyLocal
    case social
    case store(Storefront)
    case shop(LocalStore)
    case card(UUID)
    case sealed(UUID)
    case bulk(UUID)
    case calendar
    case show(UUID)
    case contacts
}

struct StoreRunSession: Identifiable {
    let id = UUID()
    let stops: [LocalStore]
}

struct ShowDaySession: Identifiable {
    let id = UUID()
    let show: CardShow
}

struct RipSession: Identifiable {
    let id = UUID()
    let items: [SealedItem]
}

/// The navigation path and the rip cover, shared by every screen.
@MainActor @Observable
final class AppNav {
    var path: [AppRoute] = []
    var rip: RipSession?
    var storeRun: StoreRunSession?
    var showDay: ShowDaySession?

    func startRip(_ items: [SealedItem]) {
        guard !items.isEmpty else { return }
        rip = RipSession(items: items)
    }
}

extension View {
    /// Every destination in the app.
    func appDestinations() -> some View {
        navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .inventory(let tab): InventoryView(startTab: tab)
            case .wallet: WalletView()
            case .activity: ActivityView()
            case .buy: BuyView()
            case .buyLocal: BuyView(local: true)
            case .social: SocialHubView()
            case .store(let store): StoreView(store: store)
            case .shop(let shop): ShopView(shop: shop)
            case .card(let id): CardDetailView(id: id)
            case .sealed(let id): SealedDetailView(id: id)
            case .bulk(let id): BulkDetailView(id: id)
            case .calendar: CalendarView()
            case .show(let id): ShowDetailView(id: id)
            case .contacts: ContactsView()
            }
        }
    }
}
