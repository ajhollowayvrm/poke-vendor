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
    case opportunity(UUID)
    case settings
    case job
    case upgrades
    case wholesale
    case chainSites
    case caseSplits
    case cardStore
    case supplies
    case loans
    case market
    case goals
    case messages
    case vending
    case masterSet(String)
    case shipQueue
}

struct StoreRunSession: Identifiable {
    let id = UUID()
    let stops: [LocalStore]
    /// The hour that the run started. Each stop arrives later by the drive time (Model/Retail.swift).
    let startHour: Double
}

struct ShowDaySession: Identifiable {
    let id = UUID()
    let show: CardShow
}

struct RipSession: Identifiable {
    let id = UUID()
    let items: [SealedItem]
    /// Hits only: one swipe opens every pack, and the stack holds only the hit slots (docs/18, Hits only).
    var hitsOnly = false
    /// Record & Rip: the series that the rip is filmed for (docs/32-short-form-video.md, Record & Rip).
    var recording: [SeriesFormat] = []
    /// A Rip & Ship rip: the rip ID that the order holds, and the order. Every card goes to the buyer.
    var ripID = UUID()
    var shipOrder: RipShipOrder?
}

/// A meet, league night, a garage or estate sale, or an opportunity, in the show day screen.
struct EncounterSession: Identifiable {
    let id = UUID()
    let session: ShowSession
}

/// A live stream, in its own cover.
struct StreamCover: Identifiable {
    let id = UUID()
    let session: StreamSession
}

/// The navigation path and the rip cover, shared by every screen.
@MainActor @Observable
final class AppNav {
    var path: [AppRoute] = []
    var rip: RipSession?
    var storeRun: StoreRunSession?
    var showDay: ShowDaySession?
    var encounter: EncounterSession?
    var stream: StreamCover?

    func startRip(_ items: [SealedItem], hitsOnly: Bool = false, recording: [SeriesFormat] = []) {
        // A closed case opens first (Model/Cases.swift). It never goes into a rip.
        let items = items.filter { !$0.isCase }
        guard !items.isEmpty else { return }
        rip = RipSession(items: items, hitsOnly: hitsOnly && recording.isEmpty, recording: recording)
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
            case .market: MarketView()
            case .vending: VendingView()
            case .goals: GoalsView()
            case .messages: MessagesView()
            case .buy: BuyView()
            case .buyLocal: BuyView(local: true)
            case .social: SocialHubView()
            case .store(let store): StoreView(store: store)
            case .shop(let shop): ShopView(shop: shop)
            case .card(let id): CardDetailView(id: id)
            case .sealed(let id): SealedDetailView(id: id)
            case .bulk(let id): BulkDetailView(id: id)
            case .masterSet(let slug): MasterSetDetailView(slug: slug)
            case .calendar: CalendarView()
            case .show(let id): ShowDetailView(id: id)
            case .contacts: ContactsView()
            case .opportunity(let id): OpportunityView(id: id)
            case .settings: SettingsView()
            case .job: JobView()
            case .upgrades: UpgradesView()
            case .wholesale: WholesaleView()
            case .chainSites: ChainSitesView()
            case .caseSplits: CaseSplitsView()
            case .cardStore: CardStoreView()
            case .supplies: SuppliesView()
            case .loans: LoansView()
            case .shipQueue: ShipQueueView()
            }
        }
    }
}
