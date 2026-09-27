import Foundation

/// One thing a storefront sells today.
struct StoreOffer: Identifiable, Hashable {
    enum Item: Hashable {
        case product(Product, String)
        case single(CardPrint, String)
    }

    let id: String
    let store: Storefront
    let item: Item
    let price: Double
    let shipping: Double
    let deliveryDays: Int
    var pickup = false
    var sellerRating: Double?
    var sellerSales: Int?
    var note: String?

    var title: String {
        switch item {
        case .product(let p, _): p.name
        case .single(let c, _): "\(c.name) · \(c.variant)"
        }
    }

    var market: Double {
        switch item {
        case .product(let p, _): p.market
        case .single(let c, _): c.market ?? 0
        }
    }

    var imageURL: URL? {
        switch item {
        case .product(let p, _): p.image.flatMap(URL.init(string:))
        case .single(let c, _): c.image.flatMap(URL.init(string:))
        }
    }

    var isSingle: Bool {
        if case .single = item { return true }
        return false
    }
}

extension SeededRandom {
    mutating func double(_ range: ClosedRange<Double>) -> Double {
        range.lowerBound + Double(next()) * (range.upperBound - range.lowerBound)
    }

    mutating func int(_ range: ClosedRange<Int>) -> Int {
        min(range.upperBound, range.lowerBound + Int(Double(next()) * Double(range.count)))
    }
}

/// Today's stock and prices for each storefront. The same day always gives the same stock.
@MainActor
enum Market {
    static let slug = "prismatic-evolutions"

    static func retail(_ x: Double) -> Double {
        x >= 5 ? x.rounded(.down) + 0.99 : (x * 100).rounded() / 100
    }

    private static func rng(_ store: Storefront, day: Int) -> SeededRandom {
        let salt = UInt64(Storefront.allCases.firstIndex(of: store) ?? 0) + 1
        return SeededRandom(seed: UInt64(day + 1) &* 104_729 &+ salt &* 7_919)
    }

    static func offers(for store: Storefront, day: Int) -> [StoreOffer] {
        let set = SetLibrary.set(slug)
        // Retail sells only in-print product. The reseller, eBay, and Facebook Marketplace also sell older sets.
        let retailOnly = [Storefront.amazon, .pokemonCenter].contains(store)
        let products = SetLibrary.catalog.filter { !retailOnly || $0.inPrint ?? true }
        var r = rng(store, day: day)
        let delivery = Balance.deliveryDays[store] ?? 3
        var out: [StoreOffer] = []
        func id(_ i: Int) -> String { "\(day)-\(store.rawValue)-\(i)" }

        switch store {
        case .amazon:
            for (i, p) in products.enumerated() where r.double(0...1) < Balance.amazonStockChance {
                // Usually a little over market, and on some days far over it.
                let markup = r.double(0...1) < Balance.amazonSpikeChance ? r.double(1.4...1.9) : r.double(1.0...1.25)
                out.append(StoreOffer(id: id(i), store: store, item: .product(p, slug),
                                      price: retail(p.market * markup), shipping: 0, deliveryDays: delivery))
            }
        case .reseller:
            for (i, p) in products.enumerated() {
                out.append(StoreOffer(id: id(i), store: store, item: .product(p, slug),
                                      price: retail(p.market * r.double(2.0...2.6)), shipping: 0, deliveryDays: delivery))
            }
        case .pokemonCenter:
            let dropKinds = products.filter { ["Booster bundle", "Elite Trainer Box", "Collection", "Tin"].contains($0.kind) && !$0.isClubExclusive }
            if let p = dropKinds.isEmpty ? nil : dropKinds[r.int(0...(dropKinds.count - 1))], let msrp = p.msrp {
                out.append(StoreOffer(id: id(0), store: store, item: .product(p, slug), price: msrp, shipping: 0,
                                      deliveryDays: delivery, note: "Drop · one attempt"))
            }
        case .ebay:
            let singles = set.prints.filter { ($0.market ?? 0) >= 3 }
            for i in 0..<8 {
                let international = r.double(0...1) < 0.2
                let rating = (r.double(95...100) * 10).rounded() / 10
                let sales = r.int(3...4000)
                if i < 4, !products.isEmpty {
                    let p = products[r.int(0...(products.count - 1))]
                    let cut = r.double(0.8...1.05) * (international ? 0.88 : 1)
                    out.append(StoreOffer(id: id(i), store: store, item: .product(p, slug), price: retail(p.market * cut),
                                          shipping: p.packs <= 2 ? 1.99 : 7.99, deliveryDays: international ? 10 : delivery,
                                          sellerRating: rating, sellerSales: sales,
                                          note: international ? "From another country" : nil))
                } else if !singles.isEmpty {
                    let c = singles[r.int(0...(singles.count - 1))]
                    let price = retail((c.market ?? 0) * r.double(0.75...1.05))
                    out.append(StoreOffer(id: id(i), store: store, item: .single(c, slug), price: price,
                                          shipping: price < 20 ? 1.25 : 4.99, deliveryDays: international ? 10 : delivery,
                                          sellerRating: rating, sellerSales: sales,
                                          note: international ? "From another country" : nil))
                }
            }
        case .facebook:
            for i in 0..<5 where !products.isEmpty {
                let p = products[r.int(0...(products.count - 1))]
                let pickup = r.double(0...1) < 0.5
                out.append(StoreOffer(id: id(i), store: store, item: .product(p, slug),
                                      price: retail(p.market * r.double(0.55...0.95)), shipping: pickup ? 0 : 7.99,
                                      deliveryDays: pickup ? 0 : delivery, pickup: pickup,
                                      note: pickup ? "Pickup today · 1 hour" : "Ships · \(delivery) days"))
            }
        }
        return out
    }
}
