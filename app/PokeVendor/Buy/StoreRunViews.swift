import SwiftUI

/// The local list plans a store run: select stores, see the trip time, start (docs/08-ui-direction.md, Buy screen).
struct StoreRunPlanner: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var chosen: [LocalStore] = []
    @State private var message: String?

    var body: some View {
        let hours = chosen.reduce(0) { $0 + $1.hours }
        VStack(spacing: 12) {
            VStack(spacing: 0) {
                ForEach(LocalStore.allCases, id: \.self) { s in
                    HStack(spacing: 10) {
                        Button {
                            if let i = chosen.firstIndex(of: s) { chosen.remove(at: i) } else { chosen.append(s) }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: chosen.contains(s) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(chosen.contains(s) ? Theme.cyan : Theme.muted)
                                    .font(.title3)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.rawValue).font(.subheadline.weight(.medium))
                                    Text(s.isGameShop ? "Game shop · near market · \(store.standing(s).rawValue) · credit \(money(store.shop(s).credit))" : "Big store · MSRP · stock is rare")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Text("40m").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if s.isGameShop {
                            Button("Shop") { nav.path.append(.shop(s)) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                    }
                    .padding(12)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                }
            }
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))

            if let message { Banner(text: message, color: Theme.orange) }

            let start = store.slot(for: hours)
            Button {
                guard store.startStoreRun(chosen) else {
                    message = "You do not have \(formatHours(hours)) free today."
                    return
                }
                nav.storeRun = StoreRunSession(stops: chosen)
                chosen = []
            } label: {
                Text(chosen.isEmpty ? "Select stores" :
                     start.map { "Start run · \(formatHours(hours)) · \(GameStore.clock($0))–\(GameStore.clock($0 + hours))" }
                     ?? "Not enough time today · \(formatHours(hours))")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
            .disabled(chosen.isEmpty || start == nil)
        }
    }
}

/// The run goes stop by stop: the shelf, then buy or move on. A summary closes the run.
struct StoreRunView: View {
    @Environment(GameStore.self) private var store
    let stops: [LocalStore]
    let onClose: () -> Void
    @State private var index = 0
    @State private var useCredit = false
    @State private var startPoints: [LocalStore: Int] = [:]
    @State private var spent = 0.0
    @State private var bought: [String] = []

    var body: some View {
        NavigationStack {
            Group {
                if index < stops.count {
                    stopView(stops[index])
                } else {
                    summary
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(index < stops.count ? "Stop \(index + 1) of \(stops.count)" : "Run summary")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(Theme.cyan)
        .onAppear {
            for s in stops where s.isGameShop { startPoints[s] = store.shop(s).points }
        }
    }

    private func stopView(_ s: LocalStore) -> some View {
        let shelf = Market.shelf(s, day: store.day, discount: store.shopDiscount(s))
        return ScrollView {
            VStack(spacing: 14) {
                HStack {
                    Text(s.rawValue).font(.title2.bold())
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if s.isGameShop {
                    HStack {
                        Text("\(store.standing(s).rawValue) · \(store.shop(s).points) pts · credit \(money(store.shop(s).credit))")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                        Spacer()
                        Toggle("Pay with credit", isOn: $useCredit).labelsHidden()
                        Text("Credit").font(.caption)
                    }
                }
                if s.isGameShop {
                    SavedBox(shop: s, useCredit: useCredit)
                    BuyInBox(shop: s, useCredit: useCredit)
                }
                DetailBox(title: "The shelf") {
                    if shelf.isEmpty {
                        Text("The shelf is empty. This stop is a bust.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    ForEach(SetLibrary.grouped(shelf, by: { $0.product.homeSlug }), id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "shelf") {
                            ForEach(group.items) { item in
                                let left = store.shelfLeft(item)
                                HStack(spacing: 10) {
                                    RemoteCardImage(url: item.product.image.flatMap(URL.init(string:)), name: "")
                                        .aspectRatio(contentMode: .fit)
                                        .padding(2)
                                        .background(Color.white)
                                        .frame(width: 44, height: 56)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.product.name).font(.subheadline).lineLimit(2)
                                        Text("\(left) left · mkt \(money(item.product.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    Button(money(item.price)) {
                                        if store.buyShelf(item, at: s, credit: useCredit && s.isGameShop) {
                                            spent += item.price
                                            bought.append(item.product.name)
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .foregroundStyle(.black)
                                    .controlSize(.small)
                                    .disabled(left == 0)
                                }
                            }
                        }
                    }
                }
                if s.isGameShop {
                    SellToShopBox(shop: s)
                }
                Button {
                    index += 1
                    useCredit = false
                } label: {
                    Text(index + 1 < stops.count ? "Next stop: \(stops[index + 1].rawValue)" : "Finish the run")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .controlSize(.large)
            }
            .padding(16)
        }
    }

    private var summary: some View {
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "Bought") {
                    if bought.isEmpty { Text("Nothing. Every shelf was a bust, or you passed.").font(.subheadline).foregroundStyle(Theme.muted) }
                    ForEach(Array(bought.enumerated()), id: \.offset) { _, name in Text(name).font(.subheadline) }
                    Text("Spent \(money(spent))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                let shops = stops.filter(\.isGameShop)
                if !shops.isEmpty {
                    DetailBox(title: "Standing earned") {
                        ForEach(shops, id: \.self) { s in
                            let gained = store.shop(s).points - (startPoints[s] ?? 0)
                            HStack {
                                Text(s.rawValue).font(.subheadline)
                                Spacer()
                                Text("\(gained >= 0 ? "+" : "")\(gained) · \(store.standing(s).rawValue)").font(.subheadline.monospaced())
                            }
                        }
                    }
                }
                Button { onClose() } label: {
                    Text("Done").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .controlSize(.large)
            }
            .padding(16)
        }
    }
}

/// The "Sell to the shop" row: singles for cash on the buylist, bulk for store credit.
struct SellToShopBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore

    var body: some View {
        let cards = (store.data.raw + store.data.slabs).filter { $0.status == nil && !$0.keep }.sorted { $0.market > $1.market }
        DetailBox(title: "Sell to the shop · buylist \(Int(store.standing(shop).buylistRate * 100))% of market") {
            if cards.isEmpty && store.data.bulk.isEmpty {
                Text("You have nothing the shop can buy.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(cards) { card in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(card.print.name)\(card.grade.map { " · " + $0.label } ?? "")").font(.subheadline).lineLimit(1)
                        Text("mkt \(money(card.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button("Sell \(money(store.buylistPrice(card, at: shop)))") { store.sellToShop(card.id, at: shop) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
            ForEach(store.data.bulk) { group in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bulk · \(group.cards.count) cards").font(.subheadline)
                        Text("mkt \(money(group.value)) · store credit only").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button("Credit \(money(store.bulkCredit(group)))") { store.sellBulk(group.id, at: shop) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
    }
}

/// The game shop's own screen: standing, store credit, the display case (docs/08-ui-direction.md).
struct ShopView: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    @State private var useCredit = false

    var body: some View {
        let state = store.shop(shop)
        let level = store.standing(shop)
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "Standing") {
                    HStack(spacing: 0) {
                        StatCell(label: "Level", value: level.rawValue)
                        StatCell(label: "Points", value: "\(state.points) / 100")
                        StatCell(label: "Store credit", value: money(state.credit))
                    }
                    Text("Buylist pays \(Int(level.buylistRate * 100))% of market. Each $50 spent here is +1 point. Holds and consignment open at Regular (30 points).")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                SavedBox(shop: shop, useCredit: useCredit)
                BuyInBox(shop: shop, useCredit: useCredit)
                DetailBox(title: "Display case · changes weekly") {
                    Toggle("Pay with store credit", isOn: $useCredit).font(.subheadline)
                    ForEach(Market.displayCase(shop, day: store.day, discount: store.shopDiscount(shop))) { single in
                        let bought = store.data.weekBought.contains(single.id)
                        HStack(spacing: 10) {
                            RemoteCardImage(url: single.print.image.flatMap(URL.init(string:)), name: "")
                                .frame(width: 40, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(single.print.name).font(.subheadline)
                                Text("\(single.print.rarity) · mkt \(money(single.print.market ?? 0))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Button(bought ? "Bought" : money(single.price)) {
                                store.buyCaseSingle(single, at: shop, credit: useCredit)
                            }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                            .controlSize(.small)
                            .disabled(bought)
                        }
                    }
                    Text("Buying from the case here needs no store run in this build.").font(.caption2).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "League night") {
                    Text("Not built yet. League night gives +3 standing.").font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(shop.rawValue)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// What a game shop bought from local sellers this week (Market.buyIns).
struct BuyInBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    let useCredit: Bool

    var body: some View {
        let items = Market.buyIns(shop, day: store.day, discount: store.shopDiscount(shop))
        DetailBox(title: "Just came in · changes weekly") {
            Text("People sell their collections to the shop. Sometimes it is old and good.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            ForEach(items) { item in
                let bought = store.data.weekBought.contains(item.id)
                HStack(alignment: .top, spacing: 10) {
                    GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market))
                        .frame(width: 44, height: 62)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.name).font(.subheadline).lineLimit(2)
                        GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                        HStack(spacing: 6) {
                            Text("mkt \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            if item.steal {
                                Text("PRICED TO MOVE")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(Theme.green.opacity(0.2))
                                    .foregroundStyle(Theme.green)
                            }
                        }
                    }
                    Spacer()
                    Button(bought ? "Bought" : money(item.price)) {
                        store.buyBuyIn(item, at: shop, credit: useCredit)
                    }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
                    .controlSize(.small)
                    .disabled(bought)
                }
            }
        }
    }
}

/// What a game shop set aside for the player, at Regular and up (docs/21-relationships-and-reputation.md).
struct SavedBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    let useCredit: Bool

    var body: some View {
        let items = store.savedAtShop(shop)
        if !items.isEmpty {
            DetailBox(title: "Saved for you") {
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: 10) {
                        GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market))
                            .frame(width: 44, height: 62)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.name).font(.subheadline).lineLimit(2)
                            GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                            Text("mkt \(money(item.market)) · held until day \(item.untilDay + 1)")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button(money(item.price)) { store.pickUp(item, credit: useCredit) }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.green)
                            .foregroundStyle(.black)
                            .controlSize(.small)
                    }
                }
                Text("A hold you do not pick up costs standing.").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }
}
