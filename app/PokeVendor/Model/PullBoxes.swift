import Foundation

// Pull boxes (docs/41-pull-boxes.md). A regular asks at the counter to reserve one product every 2 or 4 weeks. On the
// pickup day the store sells it to them at a discount. With none in stock, they are let down, and two misses in a row
// end the pull. A pull ends when its product goes out of print.

/// One regular's standing order.
struct Pull: Codable, Hashable, Identifiable {
    var id = UUID()
    let contactID: String
    let productID: String
    let name: String
    /// Days between pickups.
    let cycle: Int
    var nextDay: Int
    var misses = 0
    var pickups = 0
}

extension Balance {
    static let pullDiscounts = [0.0, 0.05, 0.10, 0.15]
    static let pullDiscountDefault = 0.05
    static let pullMax = 6
    static let pullMaxDestination = 10
    static let pullCycles = [14, 28]
    /// A miss: standing lost, the days to the next try, and the misses in a row that end the pull.
    static let pullMissPoints = 3
    static let pullRetryDays = 3
    static let pullMaxMisses = 2
    static let pullKinds: Set<String> = ["Booster box", "Elite Trainer Box", "Booster bundle"]
}

@MainActor
extension GameStore {
    var pulls: [Pull] { business.pulls ?? [] }

    var pullDiscount: Double { data.cardStore?.pullDiscount ?? Balance.pullDiscountDefault }

    var pullLimit: Int { storeLevel == .destination ? Balance.pullMaxDestination : Balance.pullMax }

    func setPullDiscount(_ d: Double) {
        guard var s = data.cardStore else { return }
        s.pullDiscount = d
        data.cardStore = s
        save()
    }

    /// The price of a pickup: the shelf price, less the pull discount.
    func pullPrice(_ product: Product) -> Double {
        ShowSession.round(product.market * (data.cardStore?.sealedPrice ?? 1) * (1 - pullDiscount))
    }

    /// A regular who could ask for a pull now, and what they ask for. Nil: nobody, or the list is full.
    func pullAsk() -> (contact: Contact, product: Product, cycle: Int)? {
        guard data.cardStore != nil, pulls.count < pullLimit else { return nil }
        let pulling = Set(pulls.map(\.contactID))
        let regulars = data.contacts.filter { c in
            c.shop == nil && !c.kind.isVendor && c.kind != .gameShop && !c.kind.isSupplier && !pulling.contains(c.id)
                && level(c.id).rank >= StandingLevel.regular.rank
        }
        guard let contact = regulars.randomElement() else { return nil }
        let products = SetLibrary.catalog.filter { Balance.pullKinds.contains($0.kind) && $0.msrp != nil && $0.market > 0 && $0.market < 300 && $0.isInPrint }
        guard let product = products.randomElement() else { return nil }
        return (contact, product, Balance.pullCycles.randomElement() ?? 14)
    }

    /// The player says yes: the first pickup is one cycle away.
    func startPull(contactID: String, name: String, productID: String, cycle: Int) {
        guard let product = SetLibrary.product(productID), pulls.count < pullLimit else { return }
        let pull = Pull(contactID: contactID, productID: productID, name: product.name, cycle: cycle, nextDay: data.day + cycle)
        updateBusiness { $0.pulls = ($0.pulls ?? []) + [pull] }
        log("\(name) has a pull now: a \(product.name) every \(cycle / 7) weeks, first on \(GameCalendar.date(pull.nextDay).text).")
        save()
    }

    func endPull(_ id: UUID) {
        updateBusiness { $0.pulls = $0.pulls?.filter { $0.id != id } }
        save()
    }

    /// A unit for a pickup: the same product, free in hand or on the shelf, not a known fake, not in the PC, not listed,
    /// and not on hold. The oldest first.
    private func pullUnit(_ productID: String) -> SealedItem? {
        let held = heldItemIDs
        return data.sealed.filter { s in
            s.productID == productID && !s.isCase && !s.isKnownFake && !s.pc && s.onlineListing == nil && !held.contains(s.id)
                && (s.status == nil || (Self.isInStore(s.status) && !s.inBackRoom))
        }.min { $0.acquiredDay < $1.acquiredDay }
    }

    /// End Day: each pull that is due picks up, or misses. A closed day moves it to the next day.
    func pullsEndDay() -> [String] {
        guard let s = data.cardStore, !pulls.isEmpty else { return [] }
        let today = data.day
        var lines: [String] = []
        var keep: [Pull] = []
        for var p in pulls {
            guard p.nextDay <= today else { keep.append(p); continue }
            let name = contact(p.contactID)?.name ?? "A regular"
            // A closed or locked day moves the pickup to the next day. The lock-up already cost the player.
            guard (storeOpenToday && !lockedUpToday) || data.cardStore?.counterDay == today else {
                p.nextDay = today + 1
                keep.append(p)
                continue
            }
            let product = SetLibrary.product(p.productID)
            if let unit = pullUnit(p.productID), let product {
                let price = pullPrice(product)
                let item = StoreShelfItem(id: unit.id, name: unit.name, market: realMarket(of: unit), paid: unit.paid, setSlug: unit.setSlug,
                                          isCard: false, isPack: false, productKey: unit.productID ?? unit.name, fake: unit.fake,
                                          known: unit.isKnownFake)
                sellFromStore(item, price: price, storeName: s.name)
                recordDeal(p.contactID, what: "Picked up their pull, \(unit.name)", price: price, market: product.market, slug: unit.setSlug)
                p.misses = 0
                p.pickups += 1
                p.nextDay = today + p.cycle
                if product.isInPrint {
                    lines.append("\(name) picked up their pull: \(unit.name) for \(money(price)).")
                    keep.append(p)
                } else {
                    lines.append("\(name) picked up their last pull of \(unit.name). It is out of print now. \"Thanks for holding them all this time.\"")
                }
                continue
            }
            // A miss: no unit on the day.
            p.misses += 1
            addPoints(p.contactID, -Balance.pullMissPoints)
            if p.misses >= Balance.pullMaxMisses || product?.isInPrint == false {
                lines.append("\(name) came for their \(p.name) again, and you had none. They ended their pull.")
                if Bool.random() { counterReview(1, "Had a pull box here. Twice they didn't have it. Done.") }
            } else {
                p.nextDay = today + Balance.pullRetryDays
                lines.append("\(name) came for their pull, and you had no \(p.name). They will try again in \(Balance.pullRetryDays) days.")
                keep.append(p)
            }
        }
        updateBusiness { $0.pulls = keep }
        return lines
    }
}

@MainActor
extension ShowSession {
    /// The player says yes to a pull request at the counter.
    func acceptPull() {
        guard let v = current, let e = v.event, e.kind == .pullRequest, let id = v.contactID, let product = e.productID else { return }
        store.startPull(contactID: id, name: v.name, productID: product, cycle: e.cycle)
        store.addOpinion(id, 2)
        note = "\(v.name) is on your pull list."
        finish(minutes: .random(in: 3...5))
    }
}
