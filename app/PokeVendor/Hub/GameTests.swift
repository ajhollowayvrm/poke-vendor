import Foundation

#if DEBUG
/// The test run: `-test` plays fresh runs through the main systems and checks the rules that matter most. It prints
/// one line for each failed check, then "TEST OK" or "TEST FAILED" with the count and the time. It replaces the save
/// on the simulator.
///
/// Keep it fast and small. Add a check only for a rule that broke before, or for a rule that moves money or items.
@MainActor
final class GameTests {
    private let store: GameStore
    private var fails: [String] = []
    private var checks = 0

    init(store: GameStore) { self.store = store }

    func run() {
        let start = Date()
        var times: [String] = []
        func timed(_ name: String, _ group: () -> Void) {
            let t = Date()
            group()
            times.append("\(name) \(Int(Date().timeIntervalSince(t) * 1000))")
        }
        timed("collection", collection)
        timed("shorts", shorts)
        timed("listings", listings)
        timed("psa", psaBills)
        timed("collections", collections)
        timed("upgrades", upgrades)
        timed("editions", editions)
        timed("seasons", seasonsAndSave)
        timed("days", days)
        let ms = Int(Date().timeIntervalSince(start) * 1000)
        for line in fails { print("TEST FAIL:", line) }
        print("TEST TIMES (ms): " + times.joined(separator: ", "))
        print(fails.isEmpty ? "TEST OK: \(checks) checks in \(ms) ms" : "TEST FAILED: \(fails.count) of \(checks) checks in \(ms) ms")
        // The console is a pipe, so stdout is buffered. Push the report out now.
        fflush(stdout)
    }

    private func check(_ ok: Bool, _ what: @autoclosure () -> String) {
        checks += 1
        if !ok { fails.append(what()) }
    }

    /// A fresh run with cash and a social account.
    private func fresh() {
        store.startRun()
        store.addTestCash(20_000)
        store.testFollowers(1_200)
    }

    private var prismatic: [CardPrint] { SetLibrary.set("prismatic-evolutions").prints }

    /// Opens every pack of a rip in Sift mode.
    private func ripAll(_ items: [SealedItem]) -> RipModel {
        let model = RipModel(items: items, store: store)
        model.mode = .sift
        var steps = 0
        while model.phase != .done || model.hasNextPack, steps < 40 {
            steps += 1
            if model.phase == .done { model.nextPack() } else { _ = model.sift(); model.resume() }
        }
        return model
    }

    // MARK: - The PC, the master sets, and the showcase (docs/08-ui-direction.md)

    private func collection() {
        fresh()
        for print in prismatic.filter({ ($0.market ?? 0) > 10 }).prefix(3) { store.addTestCard(print) }
        let cards = Array(store.data.raw.suffix(3))
        guard cards.count == 3 else { return check(false, "the collection test has no cards") }
        store.setPC([cards[0].id], true)
        store.startMasterSet(cards[1].setSlug)
        check(store.addToMasterSet([cards[1].id]) == 1, "a card did not go into its started master set")
        let stock = Set(store.showStock.cards.map(\.id))
        check(stock.contains(cards[0].id), "a PC card cannot go to a show")
        check(!stock.contains(cards[1].id), "a master set card can go to a show")

        store.data.upgrades.append(Upgrade.showcaseCase.rawValue)
        if let dear = prismatic.max(by: { ($0.market ?? 0) < ($1.market ?? 0) }) {
            let id = store.addTestSlab(dear, grade: SlabGrade(company: .psa, grade: 10))
            store.addToShowcase(id)
            check(store.card(id)?.inShowcase == true, "a PSA 10 of the dearest Prismatic card did not go into the showcase")
            check(!store.showStock.cards.contains { $0.id == id }, "a showcase card is in the show stock")
        }
        if cards[2].market < Balance.showcaseMinValue {
            check(store.showcaseBlock(cards[2]) != nil, "a card under \(money(Balance.showcaseMinValue)) can go into the showcase")
        }

        // The smallest set, with two copies of each print: the start rule, the spares, the reward, and one payment.
        guard let slug = SetLibrary.index.filter({ $0.prints > 0 }).min(by: { $0.prints < $1.prints })?.slug else { return }
        let slots = MasterSet.slots(slug)
        let before = Set(store.data.raw.map(\.id))
        for print in slots + slots { store.addTestCard(print, slug: slug) }
        let ids = Set(store.data.raw.map(\.id)).subtracting(before)
        check(store.addToMasterSet(ids) == 0, "a card went into a master set that was not started")
        store.startMasterSet(slug)
        let spares = store.masterSetSpares(slug)
        check(spares.count == slots.count, "\(spares.count) spares for \(slots.count) empty slots")
        let rep = store.data.reputation
        store.addToMasterSet(Set(spares.map(\.id)))
        check(store.isMasterSetCompleted(slug), "the \(slug) master set did not complete")
        check(store.data.reputation > rep, "the master set paid no reputation")
        check(store.masterSetSpares(slug).isEmpty, "a full master set still has spares")
        if let one = spares.first {
            let paid = store.data.reputation
            store.removeFromMasterSet(one.id)
            store.addToMasterSet([one.id])
            check(store.data.reputation == paid, "a master set paid twice")
        }
    }

    // MARK: - Short-form video (docs/32-short-form-video.md)

    private func shorts() {
        fresh()
        store.startPnL(start: 500, goal: 5, days: 30)
        for _ in 0..<3 { store.addTestPack() }
        let packs = store.data.sealed.filter { $0.source == "Test pack" }
        guard store.series(.pnl) != nil, packs.count == 3 else { return check(false, "the P&L test did not start") }
        func cash() -> Double { store.series(.pnl)?.cash ?? 0 }

        store.addToChallenge([packs[0].id])
        check(abs(cash() - (500 - packs[0].paid)) < 0.01, "adding a pack moved the challenge cash to \(money(cash()))")

        let formats = store.recordableSeries([packs[1]])
        check(formats == [.pnl], "a pack that can join the challenge records for \(formats)")
        store.prepareRecording([packs[1]], for: formats)
        check(store.isChallengeItem(packs[1].id), "Record & Rip did not add the pack to the challenge")
        let model = ripAll([packs[1]])
        let pulled = store.data.raw.filter { $0.ripID == model.ripID }
        check(!pulled.isEmpty && pulled.allSatisfy { store.isChallengeItem($0.id) }, "the pulls of a challenge pack did not join it")

        if let card = pulled.max(by: { $0.realMarket < $1.realMarket }) {
            let before = cash()
            let price = (card.realMarket * store.standing(.castle).buylistRate * 100).rounded() / 100
            if store.sellToShop(card.id, at: .castle) {
                check(abs(cash() - before - price) < 0.01, "a shop sale added \(money(cash() - before)) to the challenge, not \(money(price))")
                check(!store.isChallengeItem(card.id), "a sold card stayed in the challenge")
            }
        }

        check(store.postPnLEpisode(rip: model.episode) != nil, "the P&L episode of a recorded rip did not post")
        check(store.postPnLEpisode() == nil, "a series posted twice in one day")
        check(!store.recordableSeries([packs[2]]).contains(.pnl), "a series with an episode today can be recorded")

        store.startRipSeries(target: 100)
        let hit = RipEpisode(packs: 1, spent: 5, bestValue: 150, bestName: "Test card", hitCardID: nil)
        check(store.postRipEpisode(hit) != nil, "the Rip until I hit finale did not post")
        check(store.series(.ripUntil) == nil, "the rip series stayed after its finale")
    }

    // MARK: - Bulk unlist (docs/08-ui-direction.md, Bulk unlist)

    private func listings() {
        fresh()
        for print in prismatic.filter({ ($0.market ?? 0) > 5 }).prefix(4) { store.addTestCard(print) }
        let cards = Array(store.data.raw.suffix(4))
        guard cards.count == 4 else { return check(false, "the listing test has no cards") }
        let fixed = Set(cards.prefix(3).map(\.id))
        store.list(fixed, channel: .ebay, price: { _ in 20 }, auctionDays: nil, insured: false)
        store.list([cards[3].id], channel: .ebay, price: { _ in 20 }, auctionDays: 3, insured: false)
        let taken = store.removeListings(fixed.union([cards[3].id]))
        check(taken == fixed.count, "took down \(taken) of \(fixed.count) listings")
        check(!fixed.contains { store.canRemoveListing($0) }, "a listing stayed up")
        check(store.card(cards[3].id)?.status != nil, "a running eBay auction came down")
        check(!store.data.fbOffers.contains { fixed.contains($0.itemID) }, "an offer outlived its listing")
    }

    // MARK: - Paying PSA (docs/10-grading.md, Paying PSA)

    /// PSA bills when the grades come back. With no cash for the bill, PSA holds the order until the player pays.
    private func psaBills() {
        fresh()
        for print in prismatic.filter({ ($0.market ?? 0) > 5 }).prefix(2) { store.addTestCard(print) }
        let ids = Set(store.data.raw.suffix(2).map(\.id))
        guard ids.count == 2, let tier = Balance.gradingTiers[.psa]?.last else { return check(false, "the PSA test has no cards") }
        let fee = tier.fee * 2
        let cashBefore = store.cash
        store.submit(ids, to: .psa, tier: tier)
        // Card savers can cost a little. The fee must not leave now.
        check(cashBefore - store.cash < fee - 0.01, "PSA took the fee when the cards went in")
        check(abs(store.unpaidGradingTotal - fee) < 0.01, "the PSA bill is \(money(store.unpaidGradingTotal)), not \(money(fee))")

        // The grades come back tomorrow, and the cash does not cover the bill.
        for i in store.data.raw.indices {
            if case .atGrader(let company, let name, _, let id) = store.data.raw[i].status {
                store.data.raw[i].status = .atGrader(company: company, tier: name, daysLeft: 1, ledgerID: id)
            }
        }
        store.addTestCash(10 - store.cash)
        store.report = nil
        store.endDay()
        guard let bill = store.gradingBills.first else { return check(false, "the PSA bill went away with no payment") }
        check(bill.held, "an unpaid PSA order is not held")
        check(store.heldCards(bill.id).count == 2, "PSA holds \(store.heldCards(bill.id).count) of 2 cards")
        check(store.data.slabs.filter { ids.contains($0.id) }.allSatisfy { $0.status != nil }, "a held slab is free to sell")

        store.addTestCash(1_000)
        let before = store.cash
        check(store.payGradingBill(bill.id), "the PSA bill did not pay")
        check(abs(before - store.cash - fee) < 0.01, "paying PSA took \(money(before - store.cash)), not \(money(fee))")
        check(store.gradingBills.isEmpty && store.heldCards(bill.id).isEmpty, "paid PSA cards are still held")
    }

    // MARK: - Collections (docs/33-collections.md)

    /// A whole collection bought at a table, honest grading advice, and an eBay lot from purchase to arrival.
    private func collections() {
        fresh()
        // A plain table with no vendor floor: a show's floor loads many set files, and this test does not need one.
        let venue = Venue(kind: .meet, name: "Test table", open: 10, close: 16, hours: 6, visitorsMean: 4, hasFloor: false, hasTable: true)
        let session = ShowSession(venue: venue, store: store, vendors: [], regulars: [])
        session.openTable()
        guard let seller = session.makeCollectionSeller(), let lot = seller.collection else {
            return check(false, "no collection seller")
        }
        session.testSeat(seller)
        // Now and then a seller brings more than the player can pay. The test pays any of them.
        store.addTestCash(seller.offer)
        let cash = store.cash
        let paidBefore = store.data.openedPaid
        let ids = Set(store.data.raw.map(\.id) + store.data.slabs.map(\.id) + store.data.sealed.map(\.id))
        let bulkBefore = store.data.bulk.count
        session.offerOnCollection(nil, price: seller.offer, credit: false)
        check(abs(cash - store.cash - seller.offer) < 0.01, "a collection at its price took \(money(cash - store.cash)), not \(money(seller.offer))")
        let new = store.data.raw.filter { !ids.contains($0.id) }.compactMap(\.paid)
            + store.data.slabs.filter { !ids.contains($0.id) }.compactMap(\.paid)
            + store.data.sealed.filter { !ids.contains($0.id) }.map(\.paid)
        check(new.count == lot.pieces.count, "\(new.count) of \(lot.pieces.count) collection items went into Inventory")
        check(store.data.bulk.count - bulkBefore == lot.bulk.count, "the collection bulk did not go into bulk groups")
        let split = new.reduce(0, +) + store.data.openedPaid - paidBefore
        check(abs(split - seller.offer) < 0.01 * Double(lot.pieces.count + 1), "the collection cost split to \(money(split)), not \(money(seller.offer))")

        // Honest advice on a card that is clearly not worth grading.
        if let print = prismatic.first(where: { ($0.market ?? 0) > 5 }) {
            let beat = Condition(cut: Cut(frontLR: 70, frontTB: 65, backLR: 70, backTB: 70), corners: 3, edges: 3, surface: 3)
            check(GameStore.gradingWorth(print, slug: "prismatic-evolutions", condition: beat) < 0, "a beat-up card is worth grading")
            var asker = Visitor(type: .collector, name: "Test", intent: .sell, item: nil, limit: 5, offer: 5, patience: 2, line: "")
            asker.advice = AdviceAsk(print: print, slug: "prismatic-evolutions", condition: beat, worth: -50)
            session.testSeat(asker)
            let rep = store.data.reputation
            session.advise(grade: false)
            check(store.data.reputation > rep, "honest grading advice paid no reputation")
        }

        // An eBay lot: the cash goes when the player buys it, and the contents come when it arrives.
        store.refreshEbayLots()
        check(store.data.ebayLots.count == Balance.ebayLotCount, "\(store.data.ebayLots.count) eBay lots, not \(Balance.ebayLotCount)")
        guard let listing = store.data.ebayLots.first else { return }

        // A listing saved before the listing levels must still load, or a paid lot on its way is lost.
        if let json = try? JSONEncoder().encode(listing), var dict = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any] {
            for key in ["docs", "asked", "feedback", "sales", "sellsSingles"] { dict.removeValue(forKey: key) }
            let old = (try? JSONSerialization.data(withJSONObject: dict)).flatMap { try? JSONDecoder().decode(EbayLot.self, from: $0) }
            check(old?.docs == .photos, "an eBay listing from an older save does not load")
        }
        // "Ask for more photos" works once. A fully documented listing appraises at its exact worth.
        let shownBefore = listing.shown.count
        _ = store.askForPhotos(listing.id)
        let asked = store.data.ebayLots.first { $0.id == listing.id }
        check(asked?.asked == true && (asked?.shown.count ?? 0) >= shownBefore, "asking for photos did not mark the listing")
        check(store.askForPhotos(listing.id) == "You asked already.", "a listing took a second photo request")
        var full = listing
        full.docs = .full
        check(store.appraisal(full).lowerBound == full.lot.dealValue, "the appraisal of a fully documented lot is not its worth")
        // Saved searches: more listings.
        store.data.upgrades.append(Upgrade.savedSearch.rawValue)
        store.data.ebayLotsDay = -99
        store.refreshEbayLots()
        check(store.data.ebayLots.count == Balance.ebayLotCountSaved, "saved searches show \(store.data.ebayLots.count) lots, not \(Balance.ebayLotCountSaved)")
        guard let listing = store.data.ebayLots.first else { return }
        let before = store.cash
        check(store.buyEbayLot(listing.id) == nil, "could not buy an eBay lot")
        check(abs(before - store.cash - listing.total) < 0.01, "an eBay lot took \(money(before - store.cash)), not \(money(listing.total))")
        let held = Set(store.data.raw.map(\.id) + store.data.slabs.map(\.id) + store.data.sealed.map(\.id))
        if let order = store.data.lotOrders.first { store.data.lotOrders = [LotOrder(listing: order.listing, arrivalDay: store.day)] }
        _ = store.lotOrdersEndDay()
        let arrived = (store.data.raw.map(\.id) + store.data.slabs.map(\.id) + store.data.sealed.map(\.id)).filter { !held.contains($0) }
        check(store.data.lotOrders.isEmpty && arrived.count == listing.lot.pieces.count,
              "\(arrived.count) of \(listing.lot.pieces.count) eBay lot items arrived")
    }

    // MARK: - Upgrades (docs/09-upgrades.md)

    /// Each upgrade with a number changes that number.
    private func upgrades() {
        fresh()
        func own(_ u: Upgrade) { store.data.upgrades.append(u.rawValue) }
        let before = store.saleCosts(price: 50, channel: .tcgplayer, sealed: false, insured: false)
        let tier = Balance.gradingTiers[.psa]?.last ?? GradingTier(name: "Test", fee: 100, days: 10)
        let fee = store.gradingFee(tier, .psa), days = store.gradingDays(tier, .psa)
        let binder = store.capacity(.binder)
        let edit = store.editHours(long: false)
        let supplies = store.supplyPackPrice(.mailer)
        for u in [Upgrade.shippingKit, .proSeller, .psaMembership, .betterCar, .cargoVan, .editingSoftware, .supplyAccount, .repricer, .bulkBroker] { own(u) }
        let after = store.saleCosts(price: 50, channel: .tcgplayer, sealed: false, insured: false)
        check(after.shipping < before.shipping, "the shipping kit did not lower shipping")
        check(after.fees < before.fees, "the Pro seller upgrade did not lower the TCGplayer fee")
        check(store.gradingFee(tier, .psa) < fee && store.gradingDays(tier, .psa) < days, "the PSA membership did not lower the fee and the days")
        check(store.gradingFee(tier, .cgc) == tier.fee, "the PSA membership lowered a CGC fee")
        check(store.capacity(.binder) > binder, "the cargo van did not add carry space")
        check(store.editHours(long: false) < edit, "the editing software did not cut the editing time")
        check(store.supplyPackPrice(.mailer) < supplies, "the supply account did not lower supply prices")

        // The repricer drops to the lowest listing, but never under 85% of the player's price.
        var listing = Listing(channel: .tcgplayer, price: 100, dayListed: 0, insured: false)
        check(store.reprice(&listing, lowest: 90) && abs(listing.price - 90) < 0.01, "the repricer did not match the lowest listing")
        _ = store.reprice(&listing, lowest: 10)
        check(abs(listing.price - 100 * Balance.repricerFloor) < 0.01, "the repricer went to \(money(listing.price)), under its floor")

        // The bulk broker pays cash for bulk.
        if let print = prismatic.first {
            store.data.bulk.append(BulkGroup(ripID: UUID(), setSlug: "prismatic-evolutions", date: .now, cards: Array(repeating: print, count: 40)))
            let cash = store.cash
            if let group = store.data.bulk.last {
                store.sellBulkForCash(group.id)
                check(store.cash > cash && !store.data.bulk.contains { $0.id == group.id }, "the bulk broker did not pay cash")
            }
        }
    }

    // MARK: - 1st Edition and Unlimited (docs/13-sets.md, Print runs)

    /// A WOTC set with two runs has an Unlimited set file with patched images, and a 1st Edition set file with the
    /// stamped images and its own packs.
    private func editions() {
        check(SetLibrary.firstEdition(of: "jungle") == "jungle-1st-edition", "Jungle has no 1st Edition set file")
        check(SetLibrary.firstEdition(of: "prismatic-evolutions") == nil, "a modern set has a 1st Edition set file")
        let unlimited = SetLibrary.set("jungle").prints
        let first = SetLibrary.set("jungle-1st-edition").prints
        check(unlimited.filter { $0.image?.hasSuffix("#destamp") == true }.count >= unlimited.count - 2,
              "Jungle Unlimited prints do not ask for the stamp patch")
        check(first.allSatisfy { $0.variant.contains("1st Edition") && $0.image?.contains("#") != true },
              "the Jungle 1st Edition file holds a print that is not 1st Edition, or a patched image")
        check(SetLibrary.catalog.contains { $0.homeSlug == "jungle-1st-edition" && $0.kind == "Booster pack" },
              "the catalog has no Jungle 1st Edition pack")
        // A card saved before the patches gets the patched image when the save loads.
        if let print = unlimited.first(where: { $0.image?.hasSuffix("#destamp") == true }) {
            var old = print
            old.image = print.image?.replacingOccurrences(of: "#destamp", with: "")
            var card = OwnedCard(print: old, setSlug: "jungle", acquired: .now, paid: nil, ripID: nil)
            Destamp.migrate(&card)
            check(card.print.image == print.image, "an old Jungle card did not get the patched image")
        }
    }

    // MARK: - Seasons and the save (docs/05-pricing-and-market.md)

    private func seasonsAndSave() {
        var seasonFails = 0
        for d in 0..<366 {
            let w = PriceCycle.weekOfYear(day: d)
            if w < 0 || w >= Balance.weeksPerYear { seasonFails += 1 }
            for f in [PriceCycle.seasonDemand(sealed: true, day: d), PriceCycle.seasonDemand(sealed: false, day: d),
                      PriceCycle.seasonSealedPrice(day: d), PriceCycle.seasonTraffic(day: d)] where f < 0.85 || f > 1.16 {
                seasonFails += 1
            }
            if d > 0, abs(PriceCycle.seasonSealedPrice(day: d) - PriceCycle.seasonSealedPrice(day: d - 1)) > 0.01 { seasonFails += 1 }
        }
        check(seasonFails == 0, "\(seasonFails) season factors are out of range or jump")

        guard let saved = try? JSONEncoder().encode(store.data),
              let loaded = try? JSONDecoder().decode(GameData.self, from: saved) else {
            return check(false, "the save did not encode and decode")
        }
        check(PriceCycle.startWeek(seed: loaded.marketSeed) == PriceCycle.startWeek, "a save and a load changed the start week")
        check(loaded.raw.count == store.data.raw.count && loaded.sealed.count == store.data.sealed.count
              && loaded.shorts == store.data.shorts, "a save and a load lost items or shorts")
    }

    // MARK: - Fourteen days of play

    /// Plays 14 days: a booked show, the store counter, meets, vending machines, an auction fake, a rip, and End Day.
    /// End Day touches every system, so an exclusivity crash shows up here (memory: the exclusivity trap).
    private func days() {
        fresh()
        store.data.vendorKit = true
        store.addReputation(400)
        for print in prismatic.filter({ ($0.market ?? 0) > 10 }).prefix(8) { store.addTestCard(print) }
        for _ in 0..<16 { store.addTestPack() }

        store.buyMachine()
        store.buyMachine()
        check(store.machines.count == 2, "bought \(store.machines.count) vending machines, not 2")
        for (k, m) in store.machines.enumerated() {
            check(store.placeMachine(m.id, at: k == 0 ? .gasStation : .laundromat), "could not place a vending machine")
        }
        var stocked = 0
        func visitMachines() {
            for m in store.machines where m.host != nil {
                if !store.atMachine(m.id) { _ = store.visitMachine(m.id) }
                guard store.atMachine(m.id) else { continue }
                stocked += store.stockMachine(m.id, items: Set(store.vendableSealed.filter { $0.packs <= 3 }.prefix(6).map(\.id)))
            }
        }
        visitMachines()

        var fakeID: UUID?
        if let dear = prismatic.max(by: { ($0.market ?? 0) < ($1.market ?? 0) }) {
            let id = store.addTestSlab(dear, grade: SlabGrade(company: .psa, grade: 10), fake: .convincing)
            check(store.consignToAuction(id, house: .heritage, reserveShare: nil, ignoreGate: true), "could not consign a slab")
            fakeID = id
        }

        // A series with no episodes must die after 3 missed days.
        store.startRipSeries(target: 1_000)
        store.testOpenCardStore(.stripMall, term: 1)
        store.setClerk(true)
        let pick = store.stockable
        store.stockStore(Set(pick.cards.prefix(4).map(\.id) + pick.sealed.prefix(4).map(\.id)))
        store.addTestShow(.local)

        var shows = 0
        for day in 0..<14 {
            if day == 0, store.canGoToShowToday, let started = store.startShowDay() {
                play(ShowSession(show: started, store: store))
                shows += 1
            }
            if day % 4 == 2, let s = store.startCounter() { play(s) }
            for kind in store.meetsToday { if let s = store.startMeet(kind) { play(s) } }
            if day == 3 { _ = ripAll(Array(store.data.sealed.filter { $0.status == nil && !$0.setAside }.prefix(2))) }
            if day == 7 { visitMachines() }
            if let id = fakeID, store.day == Balance.auctionIntakeDays + 1 {
                var back = false
                if case .arriving = store.card(id)?.status { back = true }
                check(store.card(id)?.isKnownFake == true && back, "the auction house did not catch the fake")
            }
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: false) }
            store.endDay()
        }
        check(shows == 1, "the booked test show did not start")
        check(store.series(.ripUntil) == nil, "a series with no episodes did not die")
        let inStock = store.machines.reduce(0) { $0 + $1.stock.count }
        let out = store.machines.reduce(0) { $0 + $1.soldCount + $1.stolenCount + $1.returnedCount }
        check(stocked > 0 && stocked == inStock + out, "vending: \(stocked) stocked, but \(inStock) in stock and \(out) out")
        check(!store.machines.contains { $0.cashBox < 0 }, "a vending cash box is negative")
        check(!store.data.dealStories.contains { $0.day < store.day }, "a deal story stayed in the queue past its day")
    }

    /// Plays one show, meet, or counter session with simple moves. The load must fit its bins, and every item that
    /// leaves the stock must come from the load (docs/29-packing-and-crowds.md).
    private func play(_ session: ShowSession) {
        let stockIDs = { () -> Set<UUID> in let s = self.store.showStock; return Set(s.cards.map(\.id) + s.sealed.map(\.id)) }
        let before = stockIDs()
        if session.phase == .setup {
            let used = session.usage(session.loadItems)
            for bin in CarryBin.allCases where used[bin, default: 0] > store.capacity(bin) {
                check(false, "the load at \(session.venue.name) overfills the \(bin.name)")
            }
            if session.hasTable { session.openTable() } else { session.walkFloor() }
        }
        let load = session.bring
        var steps = 0
        while session.phase != .summary, steps < 60 {
            steps += 1
            if let v = session.current {
                switch v.intent {
                case .buy: session.accept()
                case .trade: session.proposeTrade(valuing: 100)
                case .sell: if v.naive { session.payFair() } else { session.counter(v.goodsMarket * 0.75) }
                }
            } else if session.phase == .table {
                session.nextVisitor()
            } else if session.phase == .floor {
                session.packUp()
            } else {
                break
            }
        }
        if session.venue.limitsLoad {
            let gone = before.subtracting(stockIDs())
            check(gone.isSubset(of: load), "\(gone.subtracting(load).count) items left the stock at \(session.venue.name) from outside the load")
        }
        store.finishEncounter(session)
    }
}
#endif
