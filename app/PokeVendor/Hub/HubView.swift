import SwiftUI

/// The home hub: the summary of the whole game and the fastest way to anywhere (docs/08-ui-direction.md).
struct HubView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.path) {
            ScrollView {
                VStack(spacing: 12) {
                    dayHeader
                    alerts
                    tiles
                    todayCard
                    freeActions
                    timeActions
                    recentActivity
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Theme.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { endDayBar }
            .navigationTitle("PokeVendor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { testMenu }
            }
            .appDestinations()
        }
        .tint(Theme.cyan)
        .fullScreenCover(item: $nav.rip) { session in
            RipView(items: session.items, store: store) { nav.rip = nil }
        }
        .fullScreenCover(item: $nav.storeRun) { session in
            StoreRunView(stops: session.stops) { nav.storeRun = nil }
        }
        .sheet(item: Binding(get: { store.report }, set: { store.report = $0 })) { report in
            DayReportView(report: report)
                .presentationDetents([.medium, .large])
        }
        .fullScreenCover(isPresented: Binding(get: { store.data.gameOver != nil }, set: { _ in })) {
            GameOverView()
        }
        .onAppear {
            #if DEBUG
            runDemo()
            #endif
        }
    }

    // MARK: - Pieces

    private var dayHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(store.weekdayName) · Week \(store.week)").font(.title3.bold())
                Text("Day \(store.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(GameStore.clock(store.data.hour)).font(.title3.monospaced().weight(.semibold))
                Text("\(formatHours(store.hoursLeft)) free today").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder private var alerts: some View {
        if store.daysUntilRent <= Balance.rentWarningDays {
            Banner(text: "Rent of \(money(Balance.rent)) is due in \(store.daysUntilRent) day\(store.daysUntilRent == 1 ? "" : "s"). You have \(money(store.cash)).",
                   color: store.canAfford(Balance.rent) ? Theme.cyan : Theme.orange)
        }
        if store.isPokemonCenterDropLive && !store.data.pokemonCenterAttempted {
            Button { nav.path.append(.store(.pokemonCenter)) } label: {
                Banner(text: "A Pokemon Center drop is live today. You get one attempt.", color: Theme.green)
            }
            .buttonStyle(.plain)
        }
    }

    private var tiles: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            Tile(label: "Cash", value: money(store.cash), detail: "Wallet") { nav.path.append(.wallet) }
            Tile(label: "Collection", value: money(store.collectionValue),
                 detail: "Inventory \(money(store.marketValue))") { nav.path.append(.inventory(.sealed)) }
            Tile(label: "Followers", value: store.hasAccount ? store.social.followers.formatted() : "Start posting",
                 detail: store.hasAccount ? "Tier \(store.followerTier) · \(store.social.handle ?? "")" : "Social media") { nav.path.append(.social) }
            Tile(label: "Reputation", value: "Unknown", detail: "Not built yet", action: nil)
        }
    }

    private var todayCard: some View {
        DetailBox(title: "Today") {
            if let job = store.job {
                if store.isWorkDay {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.data.sickToday ? "Sick day · paid" : "Work 9 AM – 5 PM").font(.subheadline.weight(.medium))
                            Text(job.title).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if !store.data.sickToday {
                            Button("Call in sick (\(store.data.sickDaysLeft))") { store.callInSick() }
                                .buttonStyle(.bordered)
                                .disabled(store.data.sickDaysLeft == 0 || store.data.hour >= Balance.workStart)
                        }
                    }
                } else {
                    Text("Day off · \(job.title)").font(.subheadline.weight(.medium))
                }
                Text("Payday is Friday: \(money(job.weeklyPay)).").font(.caption).foregroundStyle(Theme.muted)
            }
            Divider().overlay(Theme.line)
            HStack {
                Text("Rent \(money(Balance.rent))").font(.subheadline)
                Spacer()
                Text("due in \(store.daysUntilRent) day\(store.daysUntilRent == 1 ? "" : "s")")
                    .font(.subheadline.monospaced())
                    .foregroundStyle(store.daysUntilRent <= Balance.rentWarningDays ? Theme.orange : Theme.muted)
            }
        }
    }

    private var freeActions: some View {
        HStack(spacing: 8) {
            ActionTile(title: "Inventory", icon: "shippingbox") { nav.path.append(.inventory(.sealed)) }
            ActionTile(title: "Grade", icon: "seal") { nav.path.append(.inventory(.raw)) }
            ActionTile(title: "Buy", icon: "cart") { nav.path.append(.buy) }
            if store.hasAccount {
                ActionTile(title: "Post", icon: "square.and.pencil") { nav.path.append(.social) }
            } else {
                ActionTile(title: "Sell", icon: "tag") { nav.path.append(.inventory(.raw)) }
            }
        }
    }

    private var timeActions: some View {
        DetailBox(title: "Plans for today") {
            Button { nav.path.append(.buyLocal) } label: {
                HStack {
                    Image(systemName: "car").foregroundStyle(Theme.cyan)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Store run").font(.subheadline.weight(.medium))
                        Text("40 min per store · big stores and game shops").font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("Meets, garage sales, card shows, and live streams are not built yet.")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
    }

    private var recentActivity: some View {
        Button { nav.path.append(.activity) } label: {
            DetailBox(title: "Recent activity") {
                ForEach(store.data.activity.suffix(4).reversed()) { entry in
                    HStack(alignment: .top) {
                        Text("D\(entry.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted).frame(width: 34, alignment: .leading)
                        Text(entry.text).font(.caption).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                }
                Text("See all").font(.caption.weight(.semibold)).foregroundStyle(Theme.cyan)
            }
        }
        .buttonStyle(.plain)
    }

    private var endDayBar: some View {
        Button {
            store.endDay()
        } label: {
            Text("End Day \(store.day + 1)")
                .font(.headline)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .foregroundStyle(.black)
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.background)
    }

    /// The products to test: collection boxes and packs with each era's pack trick.
    private static let testProducts: [(section: String, items: [(label: String, id: String)])] = [
        ("Collection boxes", [
            ("Ogerpon ex Premium Collection · 4 sets", "576482"),
            ("Houndstone ex Box · 2 sets", "561521"),
            ("Prismatic Surprise Box · 1 random promo", "593466"),
            ("Prismatic ETB · 9 packs + promo", "593355"),
            ("Prismatic Super-Premium · 15 packs", "622770"),
        ]),
        ("Pack tricks", [
            ("Prismatic pack · trick 1", "593294"),
            ("Evolving Skies pack · trick 4", "244337"),
            ("Cosmic Eclipse pack · trick 4", "199263"),
            ("Base Set pack · trick 3", "138130"),
            ("Evolving Skies ETB · 8 packs", "242434"),
        ]),
    ]

    private var testMenu: some View {
        Menu {
            ForEach(Self.testProducts, id: \.section) { group in
                Menu("Rip now: \(group.section.lowercased())") {
                    ForEach(group.items, id: \.id) { item in
                        Button(item.label) {
                            if let added = store.addTestProduct(item.id) { nav.startRip([added]) }
                        }
                    }
                }
            }
            Menu("Add to Inventory") {
                ForEach(Self.testProducts, id: \.section) { group in
                    Section(group.section) {
                        ForEach(group.items, id: \.id) { item in
                            Button(item.label) { store.addTestProduct(item.id) }
                        }
                    }
                }
            }
            Divider()
            Button("Add $500 test cash") { store.addTestCash(500) }
            Button("Start a new run", role: .destructive) { store.startRun() }
        } label: {
            Label("Test", systemImage: "hammer")
        }
    }

    #if DEBUG
    /// Screenshot aid: `-demo` rips a pack at launch.
    private func runDemo() {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-route"), i + 1 < args.count {
            switch args[i + 1] {
            case "wallet": nav.path = [.wallet]
            case "buy": nav.path = [.buy]
            case "amazon": nav.path = [.buy, .store(.amazon)]
            case "ebay": nav.path = [.buy, .store(.ebay)]
            case "shop": nav.path = [.shop(.castle)]
            case "local": nav.path = [.buyLocal]
            case "raw": nav.path = [.inventory(.raw)]
            case "slabs": nav.path = [.inventory(.slabs)]
            case "activity": nav.path = [.activity]
            case "sealed": nav.path = [.inventory(.sealed)]
            default: break
            }
        }
        if args.contains("-sim") {
            store.startRun()
            store.addTestCash(2000)
            for offer in Market.offers(for: .reseller, day: 0).prefix(2) { _ = store.buy(offer) }
            let hits = SetLibrary.set(Market.slug).prints.filter { ($0.market ?? 0) > 20 }.shuffled().prefix(5)
            for print in hits { store.addTestCard(print) }
            let ids = store.data.raw.map(\.id)
            store.list(Set(ids.prefix(2)), channel: .tcgplayer, price: { id in GameStore.tcgLowest(for: store.card(id)!.print) }, auctionDays: nil, insured: false)
            store.list(Set(ids.dropFirst(2).prefix(1)), channel: .ebayAuction, price: { id in store.card(id)!.market }, auctionDays: 3, insured: true)
            store.submit(Set(ids.suffix(2)), to: .cgc, tier: Balance.gradingTiers[.cgc]![2])
            for _ in 0..<12 { store.endDay() }
            store.report = nil
        }
        if args.contains("-run") {
            store.startRun()
            for print in SetLibrary.set(Market.slug).prints.filter({ ($0.market ?? 0) > 10 }).prefix(2) { store.addTestCard(print) }
            // Find a day when the first game shop has stock.
            while Market.shelf(.castle, day: store.day).isEmpty { store.endDay() }
            store.report = nil
            if store.worksToday { store.callInSick() }
            if store.startStoreRun([.castle, .target]) { nav.storeRun = StoreRunSession(stops: [.castle, .target]) }
        }
        if args.contains("-social") {
            store.startRun()
            store.createAccount("ajrips")
            store.data.social.followers = 1_150
            store.buyAnalytics()
            let prints = SetLibrary.set(Market.slug).prints.filter { ($0.market ?? 0) > 15 }.shuffled()
            for print in prints.prefix(3) { store.addTestCard(print) }
            for day in 0..<10 {
                if let card = store.data.raw.first, day == 0 {
                    store.post(.forSale, subject: card.print.name, value: card.market, saleCardID: card.id, salePrice: card.market)
                }
                if day % 2 == 0, let card = store.data.raw.last {
                    store.post(.pullReveal, subject: card.print.name, value: card.market)
                } else {
                    store.post(.hotTake, subject: nil, value: 0)
                }
                if let offer = store.social.offers.first(where: { !$0.accepted }) { store.acceptOffer(offer.id) }
                if store.activeDeal != nil { store.post(.sponsored, subject: nil, value: 0) }
                store.endDay()
            }
            store.report = nil
            nav.path = [.social]
        }
        if args.contains("-bulk") {
            store.startRun()
            for print in SetLibrary.set(Market.slug).prints.filter({ ($0.market ?? 0) > 1 }).prefix(3) { store.addTestCard(print) }
            store.moveToBulk(Set(store.data.raw.prefix(2).map(\.id)))
            nav.path = [.inventory(.bulk)]
        }
        if args.contains("-stack") {
            store.startRun()
            for _ in 0..<3 { store.addTestPack() }
            store.addTestProduct("576482")
            if let print = SetLibrary.set(Market.slug).prints.first(where: { ($0.market ?? 0) > 5 }) {
                store.addTestCard(print)
                store.addTestCard(print)
            }
            nav.path = [.inventory(args.contains("raw") ? .raw : .sealed)]
            if args.contains("-autosell"), let pack = store.data.sealed.first(where: { $0.packs == 1 }) {
                nav.path.append(.sealed(pack.id))
            }
        }
        if args.contains("-coll") {
            store.startRun()
            store.addTestProduct("576482")
            if let item = store.data.sealed.first { nav.path = [.sealed(item.id)] }
        }
        if args.contains("-collrip") {
            store.startRun()
            store.addTestProduct("576482")
            nav.startRip(store.data.sealed)
        }
        if args.contains("-demo") && !args.contains("-collrip") {
            if let i = args.firstIndex(of: "-set"), i + 1 < args.count {
                store.startRun()
                store.addTestPack(slug: args[i + 1])
            }
            if store.data.sealed.filter({ $0.status == nil }).isEmpty { store.addTestPack() }
            nav.startRip(Array(store.data.sealed.filter { $0.status == nil }.prefix(1)))
        }
    }
    #endif
}

func formatHours(_ h: Double) -> String {
    let m = Int((h * 60).rounded())
    return m % 60 == 0 ? "\(m / 60)h" : "\(m / 60)h \(m % 60)m"
}

struct Banner: View {
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
            Text(text).font(.subheadline).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .foregroundStyle(color)
        .padding(12)
        .background(color.opacity(0.12))
        .overlay(Rectangle().stroke(color.opacity(0.5)))
    }
}

struct Tile: View {
    let label: String
    let value: String
    let detail: String
    let action: (() -> Void)?

    var body: some View {
        Button { action?() } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                Text(value)
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
                    .foregroundStyle(action == nil ? Theme.muted : Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(detail).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

struct ActionTile: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3)
                Text(title).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.cyan)
    }
}

struct DayReportView: View {
    @Environment(\.dismiss) private var dismiss
    let report: DayReport

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Good morning. Day \(report.day + 1)").font(.title2.bold())
            if report.lines.isEmpty {
                Text("Nothing happened overnight.").foregroundStyle(Theme.muted)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(report.lines, id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(Theme.cyan).frame(width: 6, height: 6).padding(.top, 7)
                            Text(line).font(.subheadline)
                        }
                    }
                }
            }
            Button { dismiss() } label: {
                Text("Start the day").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
        }
        .padding(20)
        .background(Theme.surface.ignoresSafeArea())
    }
}

struct GameOverView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("Game over").font(.largeTitle.bold())
            Text(store.data.gameOver ?? "").multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            DetailBox(title: "Your run") {
                HStack(spacing: 0) {
                    StatCell(label: "Days", value: "\(store.day + 1)")
                    StatCell(label: "Inventory", value: money(store.marketValue))
                    StatCell(label: "Collection", value: money(store.collectionValue))
                }
            }
            Spacer()
            Button { store.startRun() } label: {
                Text("Start a new run").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
        }
        .padding(24)
        .background(Theme.background.ignoresSafeArea())
    }
}
