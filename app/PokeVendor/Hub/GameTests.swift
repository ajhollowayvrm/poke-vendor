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
        timed("upcharges", psaUpcharges)
        timed("collections", collections)
        timed("upgrades", upgrades)
        timed("editions", editions)
        timed("seasons", seasonsAndSave)
        timed("opportunities", opportunities)
        timed("boxes", boxes)
        timed("series", seriesJoin)
        timed("market", market)
        timed("callouts", callouts)
        timed("sealed", sealedFoundation)
        timed("cases", cases)
        timed("distro", distro)
        timed("retail", retail)
        timed("online", online)
        timed("ripship", ripShip)
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

    /// The cards with a print that the last `ripAll` showed, Energy cards not counted.
    private var ripSeen = 0

    /// Opens every pack of a rip in Sift mode. `ripID` and `prepare` let a test build the model for a Rip & Ship order.
    private func ripAll(_ items: [SealedItem], ripID: UUID = UUID(), steps limit: Int = 40, prepare: ((RipModel) -> Void)? = nil) -> RipModel {
        let model = RipModel(items: items, store: store, ripID: ripID)
        prepare?(model)
        model.mode = .sift
        ripSeen = 0
        var steps = 0
        while model.phase != .done || model.hasNextPack, steps < limit {
            steps += 1
            if model.phase == .done {
                ripSeen += model.everyCard.filter { $0.print != nil }.count
                model.nextPack()
            } else {
                _ = model.sift()
                model.resume()
            }
        }
        if model.phase == .done { ripSeen += model.everyCard.filter { $0.print != nil }.count }
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

    /// PSA upcharges to the cheapest level that covers the graded value, for the fee difference.
    private func psaUpcharges() {
        let up = store.psaUpcharge(tier: "Regular", value: 3_000)
        check(up?.tier.name == "Super Express", "a $3,000 card at Regular went to \(up?.tier.name ?? "nothing"), not Super Express")
        check(abs((up?.fee ?? 0) - (349 - 79.99)) < 0.01, "the upcharge is \(money(up?.fee ?? 0)), not the fee difference")
        check(store.psaUpcharge(tier: "Regular", value: 1_000) == nil, "a card under its level's cap got an upcharge")
        check(store.psaUpcharge(tier: "Premium 10", value: 1_000_000) == nil, "Premium 10 has an upcharge")

        // Value Bulk is for members with 20 cards or more.
        fresh()
        for print in prismatic.filter({ ($0.market ?? 0) > 5 }).prefix(2) { store.addTestCard(print) }
        let pair = Set(store.data.raw.suffix(2).map(\.id))
        if let bulk = Balance.gradingTiers[.psa]?.first(where: { $0.membersOnly }) {
            store.submit(pair, to: .psa, tier: bulk)
            check(store.data.raw.filter { pair.contains($0.id) }.allSatisfy { $0.status == nil }, "a non-member sent 2 cards at Value Bulk")
        }

        // A full upcharge: a card worth more than Regular's cap at any grade comes back, and the bill grows.
        // The Skyridge Charizard is worth more than $5,000 at every PSA grade, so any grade brings an upcharge.
        let dear = ["skyridge", "dragon-frontiers", "holon-phantoms"].lazy.compactMap { slug in
            SetLibrary.set(slug).prints.first { p in (1...10).allSatisfy { (p.gradedPrice("psa\($0)") ?? 0) > 2_000 } }.map { ($0, slug) }
        }.first
        guard let (print, slug) = dear, let regular = Balance.gradingTiers[.psa]?.first(where: { $0.name == "Regular" }) else {
            return check(false, "no card for the upcharge test")
        }
        store.addTestCard(print, slug: slug)
        guard let id = store.data.raw.last?.id else { return }
        store.submit([id], to: .psa, tier: regular)
        for i in store.data.raw.indices where store.data.raw[i].id == id {
            if case .atGrader(let c, let t, _, let order) = store.data.raw[i].status {
                store.data.raw[i].status = .atGrader(company: c, tier: t, daysLeft: 1, ledgerID: order)
            }
        }
        // Not enough cash for the bill, so PSA holds it and the bill stays to read.
        store.addTestCash(5 - store.cash)
        store.report = nil
        store.endDay()
        guard let bill = store.gradingBills.first, let slab = store.data.slabs.first(where: { $0.id == id }) else {
            return check(false, "the upcharge test card did not come back")
        }
        let expected = store.psaUpcharge(tier: "Regular", value: slab.market)?.fee ?? 0
        check(expected > 0 && abs((bill.upcharge ?? 0) - expected) < 0.01, "the bill's upcharge is \(money(bill.upcharge ?? 0)), not \(money(expected))")
        check(abs(bill.amount - regular.fee - expected) < 0.01, "the bill is \(money(bill.amount)), not the fee and the upcharge")
        store.addTestCash(bill.amount + 100)
        let before = store.cash
        check(store.payGradingBill(bill.id) && abs(before - store.cash - bill.amount) < 0.01, "paying the upcharged bill took the wrong amount")

        // A bill saved before upcharges loads with no upcharge.
        let old = #"{"id":"\#(UUID().uuidString)","company":"PSA","tier":"Regular","cards":1,"amount":79.99,"dueDay":3,"held":true}"#
        let loaded = try? JSONDecoder().decode(GradingBill.self, from: Data(old.utf8))
        check(loaded?.amount == 79.99 && loaded?.upcharge == nil, "a PSA bill from an older save does not load")
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
        guard ids.count == 2, let tier = Balance.gradingTiers[.psa]?.first(where: { $0.name == "Express" }) else {
            return check(false, "the PSA test has no cards")
        }
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

    // MARK: - Opportunities and flips

    /// A failed accept keeps the opportunity, the bulk buyer pays for the bulk at pickup, and a PC item never flips.
    private func opportunities() {
        fresh()
        let gone = Opportunity(kind: .privateBuyer, postedDay: store.day, day: store.day, title: "Test buyer", detail: "",
                               hours: 0, price: 50, cardID: UUID())
        store.data.opportunities.append(gone)
        if case .failed = store.acceptOpportunity(gone.id) {} else { check(false, "a private buyer took a card the player does not have") }
        check(store.data.opportunities.first { $0.id == gone.id }?.answered == false, "a failed accept used up the opportunity")

        // The offer was $10 for 100 cards. The player has fewer at pickup, so the teacher pays less.
        for print in prismatic.prefix(12) { store.addTestCard(print) }
        store.moveToBulk(Set(store.data.raw.map(\.id)))
        let count = store.data.bulk.reduce(0) { $0 + $1.cards.count }
        let teacher = Opportunity(kind: .bulkBuyer, postedDay: store.day, day: store.day, title: "Test teacher", detail: "",
                                  hours: 0, price: 10, cards: 100)
        store.data.opportunities.append(teacher)
        let cash = store.cash
        _ = store.acceptOpportunity(teacher.id)
        let pay = ShowSession.round(10 * Double(count) / 100)
        check(count > 0 && abs(store.cash - cash - pay) < 0.01, "the bulk buyer paid \(money(store.cash - cash)) for \(count) cards, not \(money(pay))")
        check(store.data.bulk.isEmpty, "the bulk buyer left bulk behind")

        // A PC item does not go to a coin flip: a flip could close under the PC price.
        guard let print = prismatic.first(where: { ($0.market ?? 0) > 5 }) else { return check(false, "no card for the flip test") }
        store.addTestCard(print)
        guard let i = store.data.raw.indices.last else { return check(false, "no card for the flip test") }
        store.data.raw[i].pc = true
        guard let item = store.showItems((cards: [store.data.raw[i]], sealed: [])).first else { return check(false, "no PC item") }
        let venue = Venue(kind: .leagueNight, name: "Test table", open: 10, close: 16, hours: 6, visitorsMean: 4, hasFloor: false, hasTable: true)
        let session = ShowSession(venue: venue, store: store, vendors: [], regulars: [])
        check(session.canFlip, "league night has no coin flip")
        let buyer = Visitor(type: .collector, name: "Test", intent: .buy, item: item, limit: 500, offer: 5, patience: 2, line: "")
        check(session.flipFull(buyer) == nil, "a PC item can go to a coin flip")
    }

    // MARK: - Callouts and rivals (docs/proposals/sealed-product, Part C section 12 and Part A phase 6)

    /// No full End Day here. It calls the hooks that it needs, once each. `days()` runs the full steps.
    private func callouts() {
        /// A clean slate for the callout state, with no new run. A new run costs about 80 ms.
        func reset() {
            store.data.callouts = CalloutState()
            store.data.hiddenActs = []
            store.data.badSales = []
            store.data.scams = []
            store.data.dealStories = []
        }
        // 1. Counter, then deny is blocked. Counter, then make it right pays $40 once and takes the counter gain back.
        fresh()
        guard let rid = store.data.rivals.first(where: { $0.kind == .flipper })?.id else { return check(false, "no flipper rival to test") }
        let followers = store.data.social.followers
        if let id = store.testCallout(.greed, truth: true, receipts: false, heat: 40, accuser: .rival(.rival(rid)), refund: 40) {
            store.replyToCallout(id, .counter)
            check(store.data.social.followers > followers, "a counter-callout gave no followers")
            check(store.callout(id).flatMap { store.replyBlock($0, .deny) } != nil, "a deny was allowed after a counter")
            let cash = store.cash
            store.replyToCallout(id, .makeRight)
            check(abs(cash - store.cash - 40) < 0.005 && store.data.social.followers == followers,
                  "make it right did not cost exactly $40 and take back the counter gain")
            // The callout is now ending. A second make-it-right cannot pay again.
            let paid = store.cash
            store.replyToCallout(id, .makeRight)
            check(store.cash == paid, "make it right paid twice")
        } else {
            check(false, "could not open the counter test callout")
        }

        // 2. A baseless callout of the player's own cannot be countered.
        reset()
        if let id = store.testCallout(.smear, truth: true, receipts: true, heat: 40, accuser: .rival(.rival(rid))) {
            check(store.callout(id).flatMap { store.replyBlock($0, .counter) } != nil, "a smear callout could be countered")
        } else {
            check(false, "could not open the smear callout")
        }

        // 3. Make it right halves the fade cost. A viral kids callout still leaves a record. A new contact starts lower.
        reset()
        store.addReputation(100)
        if let id = store.testCallout(.kids, truth: true, receipts: false, heat: 75) {
            store.replyToCallout(id, .makeRight)
            store.testSettle(id)
            check(store.data.callouts.closed.last?.repApplied == 6 && store.activeRecords.count == 1,
                  "make it right on a viral kids callout did not cost 6 reputation and leave one record")
            let contact = store.promote(name: "Record Test", kind: .collector, interest: nil, points: 20)
            check(store.data.contacts.first { $0.id == contact }?.points == 15, "a record did not lower the start points of a new contact")
        } else {
            check(false, "could not open the kids callout")
        }

        // 4. The cap: a fourth callout joins an open true callout. A forced callout still opens. A claim with no act, and
        // nothing true to join, drops.
        reset()
        for _ in 0..<Balance.calloutMaxOpen { store.testCallout(.greed, truth: true, receipts: false, heat: 40) }
        let hotBefore = store.hottestCallout
        check(store.testCallout(.greed, truth: true, receipts: false, heat: 40) == nil && store.data.callouts.open.count == Balance.calloutMaxOpen
              && store.hottestCallout > hotBefore, "a callout at the cap did not add its heat to an open one")
        store.startCallout(.greed, truth: true, receipts: false, accuser: .person("Test"), text: "Forced.", force: true)
        check(store.data.callouts.open.count == Balance.calloutMaxOpen + 1, "a forced callout did not open past the cap")
        reset()
        for _ in 0..<Balance.calloutMaxOpen { store.testCallout(.greed, truth: false, receipts: false, heat: 40) }
        check(store.testCallout(.greed, truth: false, receipts: false, heat: 40) == nil && store.data.callouts.open.count == Balance.calloutMaxOpen
              && store.data.callouts.open.allSatisfy { $0.heat == 40 }, "a false callout at the cap joined a false callout")

        // 4b. A full cap with a denied false callout: an act that comes out opens its own callout. It never joins the
        // denied one, so it does not vanish and does not end as won.
        if let denied = store.data.callouts.open.first?.id {
            store.replyToCallout(denied, .deny)
            let heatDenied = store.callout(denied)?.heat
            let act = store.recordHiddenAct(.shelfBuyout, weight: 1, note: "test")
            if let a = store.data.hiddenActs.first(where: { $0.id == act }), store.openCallout(from: a) != nil {
                let own = store.data.callouts.open.first { $0.actID == act }
                check(own != nil && own?.truth == true && store.data.callouts.open.count == Balance.calloutMaxOpen + 1
                      && store.callout(denied)?.heat == heatDenied, "an act at a full cap with a denied callout joined it or vanished")
                if let own { store.testSettle(own.id) }
                check(store.data.callouts.closed.last?.repApplied == Balance.storyBadRep, "a true callout that opened at a full cap ended as won")
            } else {
                check(false, "the act did not open a callout")
            }
        } else {
            check(false, "no callout to deny")
        }

        // 5. The kid lowball is a hidden act. It is not a scam record.
        reset()
        let scams = store.data.scams.count
        // The encounter picks a random card and can fail, so try again. Do not use a lazy compactMap here:
        // it calls the closure twice, and a random nil on the second call crashes.
        var kid: ShopEncounter?
        for _ in 0..<20 where kid == nil { kid = store.makeShopEncounter(.castle, kind: .kidWithHit) }
        if let e = kid {
            store.lowballKid(e)
            check(store.data.scams.count == scams && store.data.hiddenActs.filter { $0.kind == .lowballKid }.count == 1,
                  "the kid lowball did not record exactly one act and no scam")
        } else {
            check(false, "could not make the kid encounter")
        }

        // 6. A sold fake that goes public: one reputation cost, no followers lost at once, one callout that costs no reputation at the end.
        reset()
        store.addReputation(100)
        GameStore.forcePublicScam = true
        defer { GameStore.forcePublicScam = nil }
        store.data.badSales.append(BadSale(item: "Test", channel: "eBay", price: 100, known: true, refunds: true, dayFound: store.day))
        let rep = store.data.reputation
        let fans = store.data.social.followers
        _ = store.counterfeitsEndDay()
        GameStore.forcePublicScam = nil
        check(rep - store.data.reputation == Balance.fakeSoldReputationCost && store.data.social.followers == fans
              && store.data.callouts.open.count == 1 && store.data.callouts.open.first?.repPaid == true,
              "a public fake post did not cost exactly 40 reputation and open one paid callout")
        if let id = store.data.callouts.open.first?.id {
            store.testSettle(id)
            check(store.data.callouts.closed.last?.repApplied == 0, "a public fake post took a second reputation cost at the end")
        }

        // 7. A resealed sale records a bad sale or a hidden act, never both.
        reset()
        var sawAct = false, sawSale = false, both = 0
        for _ in 0..<300 where !(sawAct && sawSale) {
            let sales = store.data.badSales.count, acts = store.data.hiddenActs.count
            store.recordBadSale(item: "Test box", channel: "eBay", price: 80, fake: .convincing, known: true, refunds: true, sealed: true)
            let dSales = store.data.badSales.count - sales, dActs = store.data.hiddenActs.count - acts
            if dSales + dActs != 1 { both += 1 }
            if dSales == 1 { sawSale = true }
            if dActs == 1 { sawAct = true }
        }
        check(both == 0 && sawAct && sawSale && store.data.hiddenActs.allSatisfy { $0.kind == .sellResealed },
              "a resealed sale did not record exactly one bad sale or one act")

        // 8. The kid gift: free, once a day, and it books what the player paid.
        reset()
        if let print = prismatic.first(where: { ($0.market ?? 0) >= 5 && ($0.market ?? 0) <= 30 }) {
            let a = OwnedCard(print: print, setSlug: "prismatic-evolutions", acquired: .now, paid: 12, ripID: nil, acquiredDay: store.day)
            let b = OwnedCard(print: print, setSlug: "prismatic-evolutions", acquired: .now, paid: 3, ripID: nil, acquiredDay: store.day)
            store.data.raw += [a, b]
            let items = store.showItems((cards: [a, b], sealed: []))
            let venue = Venue(kind: .leagueNight, name: "Test table", open: 10, close: 16, hours: 6, visitorsMean: 4, hasFloor: false, hasTable: true)
            let session = ShowSession(venue: venue, store: store, vendors: [], regulars: [])
            func kid(_ item: ShowItem) -> Visitor {
                Visitor(type: .kid, name: "Kid", intent: .buy, item: item, limit: 20, offer: 5, patience: 2, line: "")
            }
            // `showItems` can reorder equal items, so find each card by its ID.
            if let itemA = items.first(where: { $0.id == a.id }), let itemB = items.first(where: { $0.id == b.id }) {
                session.testSeat(kid(itemA))
                let cash = store.cash, paid = store.data.openedPaid
                check(session.canGiveToKid, "a kid could not get a gift")
                session.giveToKid()
                check(!store.data.raw.contains { $0.id == a.id } && store.cash == cash && abs(store.data.openedPaid - paid - 12) < 0.005,
                      "the kid gift did not remove the card for free and book its cost")
                session.testSeat(kid(itemB))
                check(!session.canGiveToKid, "a second kid gift in one day was allowed")
            } else {
                check(false, "could not make the kid gift items")
            }
        } else {
            check(false, "no card for the kid gift")
        }

        // 9. A late order that Whatnot charged back is made right with the goodwill sum only. Whatnot pays the buyer once.
        reset()
        if let blister = SetLibrary.catalog.first(where: { $0.kind == "Blister" && $0.packs == 3 && $0.market > 0 }),
           let item = store.addTestProduct(blister.id),
           let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) {
            _ = store.beginRipShipRip(o.id, ripID: UUID())
            store.finishRipShip(o.id)
            if let k = store.data.ripShip.orders.firstIndex(where: { $0.id == o.id }) {
                let act = store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test", revealDay: store.day, refund: o.price, sourceID: o.id)
                store.data.ripShip.orders[k].lateActID = act
            }
            _ = store.calloutsEndDay()
            let late = store.data.callouts.open.first { $0.sourceID == o.id }
            check(late?.actKind == .unshippedOrder && late?.truth == true, "a late order act did not open a callout on its reveal day")
            store.refundRipShipOrder(o.id, reason: .chargeback)
            if let late {
                let refunds = store.data.ledger.filter { $0.category == .refund && $0.label.hasPrefix("Whatnot refund") }.count
                let cash = store.cash
                store.replyToCallout(late.id, .makeRight)
                check(refunds == 1 && abs(cash - store.cash - store.lateGoodwill(o.price)) < 0.005,
                      "make it right on a refunded late order did not pay only the goodwill sum")
            }
        } else {
            check(false, "could not make the late order")
        }

        // 10. Rivals (Part A phase 6): the hostility pull, the weekly credibility, the creator reaction, and the show rival.
        fresh()
        guard let creator = store.data.rivals.first(where: { $0.kind == .creator }), let flipper = store.data.rivals.first(where: { $0.kind == .flipper }) else {
            return check(false, "no rivals for the rival checks")
        }
        while store.data.day % 7 != 0 || store.data.day == 0 { store.data.day += 1 }
        if let i = store.data.rivals.firstIndex(where: { $0.id == creator.id }) {
            store.data.rivals[i].hostility = creator.baseHostility + 0.3
            store.data.rivals[i].credibility = 0.5
        }
        store.data.retail.followerTierMark = max(0, store.followerTier - 1)
        let lines = store.rivalsEndDay()
        let after = store.rival(creator.id)
        check(after.map { abs($0.credibility - 0.55) < 0.0001 } == true, "a rival did not regain credibility on the weekly day")
        check(after.map { $0.hostility > creator.baseHostility + 0.3 + Balance.rivalCreatorTierRise - 0.02 } == true
              && lines.contains { $0.contains("noticed your channel grow") }, "a creator rival did not react when the follower tier rose")
        check(store.data.retail.followerTierMark == store.followerTier, "the follower tier mark did not move")
        for i in store.data.rivals.indices { store.data.rivals[i].hostility = 0.1 }
        check((0..<30).allSatisfy { _ in store.pickShowRival() == nil }, "a calm rival followed the player to a show")
        // A buy from a rival's table goes on the watch list. A fake that comes out of it gives a receipt, once.
        // (The full show floor takes about a second to build, so this uses a hand-made table. `days()` builds a real one.)
        let sealedPick = SetLibrary.catalog.first { $0.kind == "Blister" && $0.market > 0 }
        if let sealedPick {
            var rivalTable = Vendor(name: "\(flipper.name) (rival)", kind: .sealedDealer,
                                    items: [VendorItem(goods: .sealed(sealedPick), price: 10, market: sealedPick.market)])
            rivalTable.rivalID = flipper.id
            let venue = Venue(kind: .leagueNight, name: "Test table", open: 10, close: 16, hours: 6, visitorsMean: 4, hasFloor: false, hasTable: true)
            let session = ShowSession(venue: venue, store: store, vendors: [rivalTable], regulars: [])
            let cash = store.cash
            session.buy(rivalTable.items[0], from: rivalTable)
            check(store.cash < cash && store.data.retail.rivalBuys.count == 1, "a buy from a rival table was not put on the watch list")
            if let id = store.data.retail.rivalBuys.keys.first, let n = store.data.sealed.firstIndex(where: { $0.id.uuidString == id }) {
                store.data.sealed[n].fake = .convincing
                store.data.sealed[n].fakeKnown = true
                store.data.callouts.receiptDay[flipper.id] = nil
                let proof = store.rivalTableReceipts()
                check(proof.count == 1 && store.data.retail.rivalBuys.isEmpty && store.receipts(against: flipper.id).count == 1,
                      "a found fake from a rival table did not give exactly one receipt")
                check(store.rivalTableReceipts().isEmpty, "a rival table receipt paid twice")
            } else {
                check(false, "the rival table item is missing")
            }
        } else {
            check(false, "no product for the rival table")
        }

        // 11. Calling out a rival: a receipt makes it true. Without one, the heat lands on the player. The cooldown stops a farm.
        fresh()
        guard let target = store.data.rivals.first?.id else { return }
        let rep0 = store.data.reputation
        let out = store.calloutRival(target)
        check(out.contains("no proof") && store.data.reputation == rep0 && store.openCallouts.count == 1, "a callout with no proof did not backfire")
        check(store.playerCalloutBlock(target) != nil, "a player callout had no cooldown")
        store.noteRivalReceipt(target, note: "test")
        store.data.callouts.playerCalloutDay[target] = nil
        let rep1 = store.data.reputation
        store.calloutRival(target)
        check(store.data.reputation - rep1 == Balance.playerCalloutRep && store.receipts(against: target).isEmpty, "a callout with proof gave no reputation, or kept its receipt")

        // 14. Make it right on a palm pays `palmRefundDue` once and returns the cards. A palm found through the log is banned
        // once at peak 80 or more. A palm caught on camera gets only Part B's ban. `unshippedOrder` and `palmedHit` open past a full cap.
        reset()
        store.data.ripShip = RipShipState()
        GameStore.forcePalmCaught = false
        defer { GameStore.forcePalmCaught = nil }
        let blister = SetLibrary.catalog.first { $0.kind == "Blister" && $0.packs == 3 && $0.market > 0 }
        let big = prismatic.max { ($0.market ?? 0) < ($1.market ?? 0) }
        func rippedOrder() -> RipShipOrder? {
            guard let blister, let item = store.addTestProduct(blister.id),
                  let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) else { return nil }
            _ = store.beginRipShipRip(o.id, ripID: UUID())
            store.finishRipShip(o.id)
            return store.data.ripShip.orders.first { $0.id == o.id }
        }
        if let big, let blister, let item = store.addTestProduct(blister.id),
           let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) {
            let pid = UUID()
            _ = store.beginRipShipRip(o.id, ripID: pid)
            var hit = OwnedCard(print: big, setSlug: "prismatic-evolutions", acquired: .now, paid: nil, ripID: pid, acquiredDay: store.day)
            hit.status = .soldToViewer(orderID: o.id)
            store.data.raw.append(hit)
            store.notePalm(orderID: o.id, ripID: pid, print: big, value: big.market ?? 0)
            store.finishRipShip(o.id)
            if let act = store.data.hiddenActs.first(where: { $0.kind == .palmedHit && $0.sourceID == o.id }) {
                store.openCallout(from: act)
                let due = store.palmRefundDue(o.id)
                let cash = store.cash
                if let c = store.data.callouts.open.first(where: { $0.sourceID == o.id }) {
                    store.replyToCallout(c.id, .makeRight)
                    let back = store.data.ripShip.orders.first { $0.id == o.id }
                    check(abs(cash - store.cash - due) < 0.005 && due > 20 && back?.cards.contains { $0.id == hit.id } == true
                          && !store.data.raw.contains { $0.id == hit.id } && back?.refunded == true,
                          "make it right on a palm did not pay the price plus the card once and return the card")
                    let after = store.cash
                    store.replyToCallout(c.id, .makeRight)
                    check(store.cash == after, "make it right on a palm paid twice")
                } else {
                    check(false, "the palm act opened no callout")
                }
            } else {
                check(false, "the palm recorded no act")
            }
        } else {
            check(false, "could not make the palm order")
        }

        // 14b. Make it right on an open late order ships it and pays only the goodwill sum.
        reset()
        if let o = rippedOrder() {
            let act = store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test", refund: o.price, sourceID: o.id)
            if let k = store.data.ripShip.orders.firstIndex(where: { $0.id == o.id }) { store.data.ripShip.orders[k].lateActID = act }
            if let a = store.data.hiddenActs.first(where: { $0.id == act }), store.openCallout(from: a) != nil,
               let c = store.data.callouts.open.first(where: { $0.sourceID == o.id }) {
                let cash = store.cash, hour = store.data.hour
                store.replyToCallout(c.id, .makeRight)
                let live = store.data.ripShip.orders.first { $0.id == o.id }
                check(live?.shipped == true && live?.refunded == false && abs(cash - store.cash - store.lateGoodwill(o.price)) < 0.005
                      && abs(store.data.hour - hour - 10.0 / 60) < 0.0001 && !store.data.hiddenActs.contains { $0.id == act },
                      "make it right on an open late order did not ship it and pay only the goodwill sum")
            } else {
                check(false, "the late order opened no callout")
            }
        } else {
            check(false, "could not make the late order for make it right")
        }

        // 14c. A palm from the log that peaks at 80 or more is banned once. A caught palm gets only Part B's ban.
        reset()
        store.data.ripShip = RipShipState()
        store.data.activity = []
        store.startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person("Jess"), text: "Log palm.", force: true,
                           actID: UUID(), actKind: .palmedHit)
        if let id = store.data.callouts.open.last?.id { store.testSettle(id) }
        let bans = store.data.activity.filter { $0.text.hasPrefix("Whatnot banned you from streams until") }.count
        check(bans == 1 && store.data.ripShip.bannedUntil == store.day + Balance.palmBanDays, "a palm from the log was not banned exactly once for 56 days")
        store.data.ripShip = RipShipState()
        store.startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person("Jess"), text: "Caught palm.", force: true,
                           actKind: .palmedHit)
        if let id = store.data.callouts.open.last?.id { store.testSettle(id) }
        check(store.data.ripShip.bannedUntil == nil, "a caught palm got a second ban from the callout")

        // 14d. A late order and a palm open their own callout past a full cap.
        reset()
        for _ in 0..<Balance.calloutMaxOpen { store.testCallout(.fairness, truth: true, receipts: false, heat: 40) }
        let lateAct = store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test", refund: 20)
        let palmAct = store.recordHiddenAct(.palmedHit, weight: 1.5, note: "test", refund: 40)
        for id in [lateAct, palmAct] {
            if let a = store.data.hiddenActs.first(where: { $0.id == id }) { store.openCallout(from: a) }
        }
        check(store.data.callouts.open.count == Balance.calloutMaxOpen + 2
              && store.data.callouts.open.contains { $0.actID == lateAct } && store.data.callouts.open.contains { $0.actID == palmAct },
              "a late order or a palm did not open its own callout past a full cap")

        // 13. A gouge: hot in-print sealed posted at 1.25 times market or more records one act each day, and nothing else does.
        reset()
        store.data.retail.gougeDay = -1
        if let hot = SetLibrary.catalog.first(where: { $0.msrp != nil && !$0.isStoreExclusive && $0.isInPrint && $0.isHot() }) {
            let fair = SealedSale(productID: hot.id, name: hot.name, price: hot.market, market: hot.market)
            let high = SealedSale(productID: hot.id, name: hot.name, price: hot.market * 2, market: hot.market)
            store.noteGouge([fair])
            check(store.data.hiddenActs.isEmpty, "a post at market recorded a gouge")
            store.noteGouge([fair, high])
            store.noteGouge([high])
            check(store.data.hiddenActs.filter { $0.kind == .priceGouge }.count == 1 && store.data.retail.gougeDay == store.day,
                  "a gouge did not record exactly one act in a day")
        } else {
            check(false, "no hot product for the gouge check")
        }
        // 13b. On the store shelf: a hot in-print item at 1.35 times market is a gouge when the price is set, even with no sale.
        // A second post the same day adds none. A price under the line adds none.
        reset()
        store.data.retail.gougeDay = -1
        store.testOpenCardStore(.stripMall, term: 1)
        if let hot = SetLibrary.catalog.first(where: { $0.msrp != nil && !$0.isStoreExclusive && $0.isInPrint && $0.isHot() }),
           let item = store.addTestProduct(hot.id) {
            store.stockStore([item.id])
            store.setSealedPrice(1.2)
            check(!store.data.hiddenActs.contains { $0.kind == .priceGouge }, "a shelf price of 120% recorded a gouge")
            store.setSealedPrice(1.35)
            check(store.data.hiddenActs.filter { $0.kind == .priceGouge }.count == 1, "a hot item at 1.35 times market on the shelf recorded no gouge")
            store.setSealedPrice(1.5)
            check(store.data.hiddenActs.filter { $0.kind == .priceGouge }.count == 1, "a second post on the same day recorded a second gouge")
            store.setSealedPrice(Balance.storeDefaultSealedPrice)
        } else {
            check(false, "no hot product for the shelf gouge check")
        }

        // 12. A good story cools every open callout.
        fresh()
        if let id = store.testCallout(.greed, truth: false, receipts: false, heat: 40) {
            store.coolCallouts(by: Balance.goodStoryHeatCut)
            check(store.callout(id)?.heat == 30, "a good story did not cool an open callout")
        }
    }

    // MARK: - Look inside a box (docs/12-acquiring-product.md)

    /// Each copy keeps its packs, an assorted box stays in one era, and a bought box holds the packs that the player saw.
    private func boxes() {
        fresh()
        var unstable: [String] = [], wrongCount: [String] = [], mixedEra: [String] = []
        for product in SetLibrary.catalog {
            let packs = BoxContents.draw(product, key: "test")
            if packs != BoxContents.draw(product, key: "test") { unstable.append(product.name) }
            if packs.count != product.packs { wrongCount.append(product.name) }
            for pool in product.pools ?? [] where Set(pool.slugs.compactMap { SetLibrary.info($0)?.era }).count != 1 {
                mixedEra.append(product.name)
            }
        }
        check(unstable.isEmpty, "one key drew different packs: \(unstable.prefix(3))")
        check(wrongCount.isEmpty, "a draw has the wrong pack count: \(wrongCount.prefix(3))")
        check(mixedEra.isEmpty, "an assorted pool mixes eras: \(mixedEra.prefix(3))")
        guard let product = SetLibrary.catalog.first(where: { $0.isAssorted && $0.packs >= 3 }) else {
            return check(false, "no assorted product")
        }
        // A box from a vendor table.
        let listing = VendorItem(goods: .sealed(product), price: 1, market: 1)
        let seen = BoxContents.draw(product, key: listing.id.uuidString)
        let bought = store.buySealedAtShow(product, price: 1, vendor: "Test", at: "Test", contentsKey: listing.id.uuidString)
        check(store.packSlugs(of: bought) == seen, "a box from a table does not hold the packs that the player saw")
        // The front box on a shop shelf.
        let shelf = ShelfItem(id: "test-shelf", product: product, price: 1, quantity: 2)
        let front = BoxContents.draw(product, key: BoxContents.shelfKey(shelf.id, copy: 0))
        if let shop = LocalStore.allCases.first, store.buyShelf(shelf, at: shop, credit: false), let item = store.data.sealed.last {
            check(store.packSlugs(of: item) == front, "a box from a shelf does not hold the packs that the player saw")
        } else {
            check(false, "could not buy from a shelf")
        }
    }

    // MARK: - Record today's episode (docs/32-short-form-video.md)

    /// An item bought before the P&L challenge joins at today's market. One bought during it joins at its price paid.
    private func seriesJoin() {
        fresh()
        store.startPnL(start: 1_000, goal: 2, days: 14)
        guard let s = store.series(.pnl), let product = SetLibrary.catalog.first(where: { $0.market > 20 && $0.market < 300 }),
              let old = store.addTestProduct(product.id), let new = store.addTestProduct(product.id),
              let i = store.data.sealed.firstIndex(where: { $0.id == old.id }) else {
            return check(false, "no P&L challenge or product for the join test")
        }
        store.data.sealed[i].acquiredDay = s.startDay - 1
        let market = store.market(of: store.data.sealed[i])
        check(store.challengeBlock(old.id) == nil, "an older item cannot join the challenge: \(store.challengeBlock(old.id) ?? "")")
        check(abs(store.joinCost(old.id) - market) < 0.01, "an older item joins at \(money(store.joinCost(old.id))), not its market \(money(market))")
        check(abs(store.joinCost(new.id) - new.paid) < 0.01, "a new item joins at \(money(store.joinCost(new.id))), not its price \(money(new.paid))")
        let items = store.data.sealed.filter { $0.id == old.id || $0.id == new.id }
        check(store.recordableSeries(items).contains(.pnl), "the P&L challenge cannot record a rip of these items")
        store.prepareRecording(items, for: [.pnl])
        let cash = store.series(.pnl)?.cash ?? 0
        check(abs(1_000 - cash - market - new.paid) < 0.01, "the challenge cash is \(money(cash)) after the join")
        check(store.isChallengeItem(old.id) && store.isChallengeItem(new.id), "the recorded items did not join the challenge")
    }

    // MARK: - The moving market (docs/05-pricing-and-market.md)

    /// Daily steps, booms and corrections, era growth, and reprints by set and product.
    private func market() {
        fresh()
        // Regimes: the same seed gives the same schedule, and a long run has all three kinds.
        let regimes = PriceCycle.makeRegimes(seed: 42)
        check(regimes == PriceCycle.makeRegimes(seed: 42), "one seed gave two regime schedules")
        let kinds = Set(regimes.filter { $0.start < 3_000 }.map(\.kind))
        check(kinds.count == 3, "3,000 days of regimes hold only \(kinds)")

        // Daily steps: the share of days with a step is near the tier's chance. A warm walk equals a cold one.
        for (name, tier) in [("mid", StepTier.mid), ("top", StepTier.top), ("sealed", StepTier.sealed)] {
            let key = PriceCycle.hash("test-walk-" + name)
            var moves = 0
            for d in 1...200 where PriceCycle.walkCold(key, tier: tier, day: d) != PriceCycle.walkCold(key, tier: tier, day: d - 1) * pow(0.5, 1 / Balance.stepHalfLife) {
                moves += 1
            }
            check(abs(Double(moves) / 200 - tier.chance) < 0.1, "\(name) prices stepped on \(moves) of 200 days")
        }
        store.data.day = 40
        store.syncMarket()
        let key = PriceCycle.hash("test-warm")
        _ = PriceCycle.walk(key, tier: .mid, day: 40)
        store.data.day = 41
        store.syncMarket()
        let warm = PriceCycle.walk(key, tier: .mid, day: 41)
        check(abs(warm - PriceCycle.walkCold(key, tier: .mid, day: 41)) < 1e-12, "a warm walk differs from a cold one")

        // A card under $1 stays flat. 2,000 price reads are fast.
        let prints = SetLibrary.set("prismatic-evolutions").prints + SetLibrary.set("base-set").prints + SetLibrary.set("evolving-skies").prints
        if let cheap = prints.first(where: { ($0.baseMarket ?? 0) < 1 && ($0.baseMarket ?? 0) > 0 }) {
            let days = Set((0..<60).map { cheap.marketFactor(day: $0) })
            check(days.count == 1, "a card under $1 moved")
        }
        let start = Date()
        var total = 0.0
        for i in 0..<2_000 { total += prints[i % prints.count].market ?? 0 }
        let ms = Date().timeIntervalSince(start) * 1000
        check(ms < 400 && total > 0, "2,000 price reads took \(Int(ms)) ms")

        // Era growth: an out-of-print WOTC chase card grows. An in-print Scarlet & Violet card does not.
        if let old = SetLibrary.set("base-set").prints.first(where: { ($0.baseMarket ?? 0) >= 25 }),
           let new = SetLibrary.set("prismatic-evolutions").prints.first(where: { ($0.baseMarket ?? 0) >= 25 }) {
            let k1 = PriceCycle.hash(old.name), k2 = PriceCycle.hash(new.name)
            check(PriceCycle.ageGrowth(k1, slug: "base-set", base: old.baseMarket ?? 0, day: 728) > 1.15, "a WOTC card did not grow in 2 years")
            check(PriceCycle.ageGrowth(k2, slug: "prismatic-evolutions", base: new.baseMarket ?? 0, day: 728) == 1, "an in-print card grew")
        }

        // A reprint wave: only its products come back, the fall comes at the news, and it comes back after the wave.
        store.data.day = 0
        store.syncMarket()
        var wave: PrintChange?
        for _ in 0..<40 where wave == nil {
            store.data.printChanges.removeAll()
            store.syncMarket()
            _ = store.announcePrintChange(reprint: true)
            wave = store.data.printChanges.first { $0.inPrint && !$0.endsWave && $0.products != nil }
        }
        guard let wave, let ids = wave.products, let id = ids.first,
              let end = store.data.printChanges.first(where: { $0.endsWave && $0.waveID == wave.id }) else {
            return check(false, "no product reprint wave")
        }
        store.data.day = wave.day
        store.syncMarket()
        check(SetLibrary.product(id)?.isInPrint == true, "a reprinted product is not in print during its wave")
        check(!PriceCycle.inPrint(wave.slug), "a product reprint put the whole set in print")
        if let other = SetLibrary.catalog.first(where: { $0.homeSlug == wave.slug && !ids.contains($0.id) && $0.mix.count == 1 }) {
            check(!other.isInPrint, "a product that the wave did not reprint is in print")
        }
        let fall = PriceCycle.printJumps(wave.slug, product: id, day: wave.announcedDay + 21)
        check(fall > 0.64 && fall < 0.86, "a reprinted product fell to \(fall) of its price")
        let back = PriceCycle.printJumps(wave.slug, product: id, day: end.day + 181)
        check(abs(back - 1) < 0.001, "a reprinted product came back to \(back) of its price")
        check(PriceCycle.singlesReprintFactor(wave.slug, day: wave.announcedDay + 21) >= 0.899, "the set's singles fell more than 10%")
        store.data.printChanges.removeAll()
        store.data.day = 0
        store.syncMarket()
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
        let tier = GradingTier.psaStandard
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
        // A 1st Edition raw price is at least its Unlimited raw price. PPT once gave 1st Edition Shining Charizard
        // the price of one played copy ($19.99), below the Unlimited price ($1300).
        let twoRuns = ["jungle", "fossil", "team-rocket", "gym-heroes", "gym-challenge", "neo-genesis", "neo-discovery",
                       "neo-revelation", "neo-destiny"]
        var below: [String] = []
        for slug in twoRuns {
            guard let firstSlug = SetLibrary.firstEdition(of: slug) else { continue }
            var unlimitedRaw: [String: Double] = [:]
            for p in SetLibrary.set(slug).prints { unlimitedRaw[p.num + p.variant] = p.baseMarket }
            for p in SetLibrary.set(firstSlug).prints {
                let variant = p.variant.replacingOccurrences(of: ", 1st Edition)", with: ")")
                    .replacingOccurrences(of: " (1st Edition)", with: "")
                if let u = unlimitedRaw[p.num + variant], let f = p.baseMarket, f < u - 0.005 {
                    below.append("\(firstSlug) \(p.name)")
                }
            }
        }
        check(below.isEmpty, "1st Edition raw prices below Unlimited: \(below.prefix(5))")
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
        check(loaded.calendarStart == store.data.calendarStart, "a save and a load changed the calendar start")
        check(loaded.raw.count == store.data.raw.count && loaded.sealed.count == store.data.sealed.count
              && loaded.shorts == store.data.shorts, "a save and a load lost items or shorts")

        // The calendar: a new run starts on Monday, January 1, 2029. Rent is due on the 1st of each month.
        store.startRun()
        let jan1 = GameCalendar.date(0)
        check(jan1 == GameDate(year: 2029, month: 1, day: 1, dayOfYear: 0, daysInYear: 365) && store.weekdayName == "Monday",
              "day 0 is \(store.weekdayName), \(jan1.text), \(jan1.year), not Monday, January 1, 2029")
        check(store.daysUntilRent == 31 && GameCalendar.isFirstOfMonth(31) && GameCalendar.date(31).text == "February 1",
              "the first rent is not on February 1")
        let leap = GameCalendar.date(365 * 3 + 31 + 28) // 2032 is a leap year.
        check(leap.text == "February 29" && leap.year == 2032, "2032 has no February 29")
        check(PriceCycle.monthName(day: 0) == "January" && PriceCycle.seasonName(day: 14) == "After the holidays"
              && PriceCycle.seasonName(day: 334) == "Holiday season", "the seasons do not follow the calendar")
        store.addTestCash(5_000)
        while store.day < 31 { store.endDay() }
        let rents = store.data.ledger.filter { $0.category == .rent }
        check(rents.count == 1 && rents.first?.day == 31, "rent was paid on days \(rents.map(\.day)), not on February 1 (day 31)")
        check(store.data.gameOver == nil, "the run ended in January: \(store.data.gameOver ?? "")")

        // Settings > Reset save: a played run goes back to Day 1 with only the starting cash.
        let seed = store.data.marketSeed
        store.endDay()
        store.resetSave()
        check(store.day == 0 && abs(store.cash - Balance.startingCash) < 0.01 && store.data.raw.isEmpty
              && store.data.slabs.isEmpty && store.data.sealed.isEmpty && store.report == nil && store.data.marketSeed != seed,
              "the save reset left day \(store.day), \(money(store.cash)), or old items")
    }

    // MARK: - Fourteen days of play

    /// The sealed product foundation (phase 0): the seeded rivals, the hidden log, and the save of the new fields.
    private func sealedFoundation() {
        fresh()
        let rivals = store.data.rivals
        check(rivals.count == 5 && Set(rivals.map(\.id)).count == 5, "seedRivals made \(rivals.count) rivals with duplicate IDs")
        check(rivals.filter { $0.kind == .flipper }.count == 3 && rivals.filter { $0.kind == .creator }.count == 2,
              "the rivals are not 3 flippers and 2 creators")
        check(rivals.filter { $0.kind == .flipper }.allSatisfy { $0.homeStores.count == 2 && !$0.name.isEmpty },
              "a rival flipper has no home stores")
        store.seedRivals()
        check(store.data.rivals == rivals, "a second seedRivals changed or duplicated the rivals")

        // The hidden log: record, then retire, leaves it empty.
        let act = store.recordHiddenAct(.shelfBuyout, weight: 1, note: "test", witnesses: 5)
        check(store.data.hiddenActs.count == 1, "recordHiddenAct did not add an act")
        store.retireHiddenAct(act)
        check(store.data.hiddenActs.isEmpty, "retireHiddenAct left the act in the log")

        // A save keeps every new field.
        guard let first = store.data.rivals.first else { return check(false, "no rival to test") }
        store.rememberRival(first.id, .playerTookShelf, note: "test", byPlayer: true, hostility: 0.1)
        store.noteRivalReceipt(first.id, note: "test")
        store.recordHiddenAct(.priceGouge, weight: 1, note: "test")
        store.startCallout(.greed, truth: true, receipts: false, accuser: .rival(.rival(first.id)), text: "Test callout.")
        store.banFromWhatnot(days: 5, reason: "test")
        store.data.retail.gougeDay = 4
        store.data.retail.storeHeat["Target"] = 2
        store.data.plug.name = "Test plug"
        store.data.flipperPressure = 0.6
        store.data.scalperHeat = 3
        // Dictionaries with Int keys and a nested struct must round-trip too.
        store.data.retail.pressureLog[3] = 0.4
        store.data.retail.strictness["Target"] = ChainStrictness(level: 2)
        store.data.ripShip.grossByDay[2] = 50
        // A callout from a named rival also puts one memory on that rival (phase 6).
        check(store.data.callouts.open.count == 1 && store.data.rivals.first?.memory.count == 2, "the stubs did not write")
        guard let saved = try? JSONEncoder().encode(store.data),
              let loaded = try? JSONDecoder().decode(GameData.self, from: saved) else {
            return check(false, "the sealed fields did not encode and decode")
        }
        check(loaded.rivals == store.data.rivals && loaded.retail == store.data.retail && loaded.hiddenActs == store.data.hiddenActs
              && loaded.callouts == store.data.callouts && loaded.plug == store.data.plug && loaded.ripShip == store.data.ripShip
              && loaded.flipperPressure == 0.6 && loaded.scalperHeat == 3, "a save and a load lost sealed fields")
        check(loaded.ripShip.bannedUntil == store.day + 5 && loaded.ripShip.banReason == "test", "a save and a load lost the Whatnot ban")

        // An old save has none of the new keys. It loads with the defaults.
        guard var object = (try? JSONSerialization.jsonObject(with: saved)) as? [String: Any] else {
            return check(false, "the save is not an object")
        }
        for key in ["flipperPressure", "scalperHeat", "rivals", "retail", "plug", "ripShip", "hiddenActs", "callouts"] {
            object[key] = nil
        }
        guard let old = try? JSONSerialization.data(withJSONObject: object),
              let oldLoaded = try? JSONDecoder().decode(GameData.self, from: old) else {
            return check(false, "an old save did not decode")
        }
        check(oldLoaded.rivals.isEmpty && oldLoaded.retail == RetailState() && oldLoaded.plug == PlugState()
              && oldLoaded.ripShip == RipShipState() && oldLoaded.hiddenActs.isEmpty && oldLoaded.callouts == CalloutState()
              && oldLoaded.flipperPressure == Balance.pressureStart && oldLoaded.scalperHeat == 0,
              "an old save did not load the defaults")
        // A nested struct that misses a key keeps its other fields.
        let partial = Data(#"{"gougeDay": 9}"#.utf8)
        check((try? JSONDecoder().decode(RetailState.self, from: partial))?.gougeDay == 9, "a partial RetailState did not decode")
        // An old save gets its rivals when the store loads it.
        store.data = oldLoaded
        store.seedRivals()
        check(store.data.rivals.count == 5, "a load did not seed the rivals of an old save")
    }

    /// Sealed product phase 1: real case counts, the case item and its price, opening a case, case fresh, the one hot
    /// test, and the MSRP step (docs/proposals/sealed-product, Part B sections 1 and 2, Part A 3.4).
    private func cases() {
        fresh()
        let catalog = SetLibrary.catalog

        // Case counts. The first catalog product of each rule gives the check.
        func size(_ what: String, _ want: Int?, _ find: (Product) -> Bool) {
            guard let p = catalog.first(where: find) else { return check(false, "the catalog has no \(what)") }
            check(Balance.caseSize(for: p) == want, "\(what) \(p.name) has case size \(Balance.caseSize(for: p).map(String.init) ?? "nil"), not \(want.map(String.init) ?? "nil")")
        }
        size("Elite Trainer Box", 10) { $0.kind == "Elite Trainer Box" && !$0.name.contains("Pokemon Center") && !$0.name.contains("Pokémon Center") && !$0.isClubExclusive }
        size("Pokemon Center ETB", 4) { $0.kind == "Elite Trainer Box" && ($0.name.contains("Pokemon Center") || $0.name.contains("Pokémon Center")) && !$0.isClubExclusive }
        size("6-pack bundle", 25) { $0.kind == "Booster bundle" && $0.packs == 6 && !$0.isClubExclusive }
        size("single pack", 144) { $0.kind == "Booster pack" && $0.packs == 1 && !$0.name.contains("Fun Pack") && !$0.isClubExclusive }
        size("36-pack box", 6) { $0.kind == "Booster box" && $0.packs == 36 && !$0.isClubExclusive && !$0.name.contains("Enhanced") }
        size("3-pack blister", 24) { $0.kind == "Blister" && $0.packs == 3 }
        size("Mini Tin", 10) { $0.kind == "Tin" && $0.name.contains("Mini Tin") && !$0.isClubExclusive }
        size("Ultra-Premium collection", 4) { $0.kind == "Collection" && $0.name.contains("Ultra-Premium") && !$0.isClubExclusive }
        size("art bundle", nil) { $0.kind == "Booster pack" && $0.name.contains("Art Bundle") }
        size("half box", nil) { $0.name.contains("Half Booster Box") }
        size("Fun Pack", nil) { $0.name.contains("Fun Pack") }
        size("master carton", nil) { $0.name.contains("Master Carton") }
        size("[Set of 2] product", nil) { $0.name.contains("[Set of 2]") }
        size("[Set of N] product", nil) { $0.name.contains("[Set of") }
        check(Balance.caseSizes["Booster bundle"] == 25 && Balance.caseSizes["Booster pack"] == 144, "the bundle or pack case size is old")

        // The distributor offers whole cases of the new sizes, and its units carry the case-fresh tag.
        store.addReputation(400)
        let offers = store.wholesaleOffers
        check(!offers.isEmpty && offers.allSatisfy { $0.caseSize == CaseMath.units($0.product) }, "a wholesale offer has a case size that the case rules do not give")
        check(offers.filter { $0.product.kind == "Booster bundle" }.allSatisfy { $0.caseSize == 25 }, "a wholesale bundle case is not 25")
        if let offer = offers.filter({ $0.casePrice >= Balance.wholesaleMinOrder && $0.casePrice < 15_000 }).min(by: { $0.casePrice < $1.casePrice }) {
            // A hot case fills by chance, and an order can go missing. Force both, so the order always arrives.
            GameStore.forceFill = 1
            GameStore.forceWholesaleMissing = false
            check(store.buyWholesale(offer, cases: 1) == nil, "the wholesale test order failed")
            GameStore.forceFill = nil
            GameStore.forceWholesaleMissing = nil
            let units = store.data.sealed.filter { $0.source == "Wholesale" }
            check(!units.isEmpty && units.allSatisfy { $0.isCaseFresh && $0.fake == nil }, "a distributor unit is not case fresh")
        } else {
            check(false, "the wholesale test has no cheap offer")
        }

        // A case and a unit never share a stack.
        guard let etb = catalog.first(where: { $0.kind == "Elite Trainer Box" && $0.market > 0 && !$0.isStoreExclusive }) else {
            return check(false, "no Elite Trainer Box for the case test")
        }
        store.data.sealed.removeAll()
        let caseID = store.testCase(etb, units: 10, fresh: true)
        let unit = SealedItem(setSlug: etb.homeSlug, name: etb.name, packs: etb.packs, paid: 30, acquired: .now, source: "Test", productID: etb.id)
        guard let caseItem = store.data.sealed.first(where: { $0.id == caseID }) else { return check(false, "testCase added no case") }
        check(store.stackKey(caseItem) != store.stackKey(unit), "a case and a unit of one product share a stack")
        check(caseItem.packs == etb.packs * 10 && caseItem.isCase && caseItem.name == CaseMath.name(etb, units: 10), "the case item has the wrong packs or name")

        // The case price: a real cases.json row, else the factor table. realMarket(of:) is the one choke point.
        check(!SetLibrary.caseListings.isEmpty, "cases.json did not load")
        check(abs(store.realMarket(of: caseItem) - CaseMath.market(etb, units: 10)) < 0.001, "realMarket(of:) does not use the case price")
        if let plain = catalog.first(where: { SetLibrary.caseListings[$0.id] == nil && Balance.caseSize(for: $0) != nil && $0.market > 0 }),
           let n = Balance.caseSize(for: plain) {
            check(abs(CaseMath.market(plain, units: n) - plain.market * Double(n) * CaseMath.factor(plain)) < 0.01, "a case with no real price does not use the factor")
        } else {
            check(false, "no product without a real case row")
        }
        if let real = catalog.first(where: { SetLibrary.caseListings[$0.id] != nil }), let row = SetLibrary.caseListings[real.id] {
            check(abs(CaseMath.market(real, units: row.units) - PriceCycle.price(row.market, real.marketFactor())) < 0.01, "a case with a real row does not use its price")
            check(CaseMath.units(real) == row.units, "CaseMath.units does not read the real row first")
        } else {
            check(false, "no product with a real case row")
        }

        // Opening a case: every unit, the paid amount, and the value are kept.
        let paidBefore = caseItem.paid
        let valueBefore = store.marketValue
        let premium = store.casePremium(caseItem)
        let ids = store.openCase(caseID)
        let opened = store.data.sealed.filter { $0.productID == etb.id }
        check(ids.count == 10 && opened.count == 10 && !store.data.sealed.contains { $0.id == caseID }, "opening a case gave \(ids.count) units")
        check(opened.allSatisfy { $0.caseUnits == nil && $0.isCaseFresh && $0.fake == nil }, "a unit from a case is not a plain case-fresh unit")
        check(abs(opened.reduce(0) { $0 + $1.paid } - paidBefore) < 0.005, "the units of a case do not add up to its paid amount")
        // Opening ends the case premium and nothing else: the inventory value falls by exactly that premium.
        check(abs((valueBefore - store.marketValue) - premium) < 0.01, "opening a case changed the value by \(valueBefore - store.marketValue), not its premium \(premium)")
        // A case-fresh unit and a plain unit of one product do not share a row.
        var plain = opened[0]
        plain.caseFresh = nil
        check(store.stackKey(plain) != store.stackKey(opened[0]), "a case-fresh unit shares a stack with a plain unit")

        // A resealed case gives resealed units. A case sold to a viewer opens only for its own order.
        let reseal = store.testCase(etb, units: 4, fresh: false)
        if let i = store.data.sealed.firstIndex(where: { $0.id == reseal }) { store.data.sealed[i].fake = .convincing }
        let resealed = store.openCase(reseal)
        check(resealed.count == 4 && store.data.sealed.filter { resealed.contains($0.id) }.allSatisfy { $0.fake == .convincing && !$0.isCaseFresh },
              "a resealed case did not give resealed units")
        let sold = store.testCase(etb, units: 4, fresh: true)
        if let i = store.data.sealed.firstIndex(where: { $0.id == sold }) { store.data.sealed[i].status = .soldToViewer(orderID: UUID()) }
        check(store.openCase(sold).isEmpty && store.data.sealed.contains { $0.id == sold }, "a case sold to a viewer opened for no order")

        // A product sold to a viewer keeps its loose packs and promo cards locked to the order.
        let order = UUID()
        var locked = SealedItem(setSlug: etb.homeSlug, name: etb.name, packs: etb.packs, paid: 30, acquired: .now, source: "Test", productID: etb.id)
        locked.status = .soldToViewer(orderID: order)
        store.data.sealed.append(locked)
        store.openProduct(locked.id, ripID: UUID())
        let packs = store.data.sealed.filter { $0.brokenFrom == locked.id }
        check(packs.count == etb.packs && packs.allSatisfy { $0.status == .soldToViewer(orderID: order) }, "a loose pack of a sold product lost its lock")
        check(store.data.raw.filter { $0.status != nil }.allSatisfy { $0.status == .soldToViewer(orderID: order) }, "a promo card of a sold product has the wrong status")

        // The one hot test: with no MSRP step, retailMSRP and isHot equal the old definition for every product.
        check(PriceCycle.msrpStepDay == nil, "the MSRP step is set before the test")
        var hotDiffs = 0
        for p in catalog {
            let oldHot = (p.msrp ?? 0) > 0 && p.market >= (p.msrp ?? 0) * Balance.hotProductRatio
            if p.retailMSRP() != p.msrp || p.isHot() != oldHot || store.isHot(p) != oldHot { hotDiffs += 1 }
        }
        check(hotDiffs == 0, "retailMSRP or isHot differs from the old rule for \(hotDiffs) products")

        // The MSRP step: the retail price rises 12.5% and rounds. The market share ramps in over 30 days, for in-print product only.
        guard let hot = catalog.first(where: { $0.isInPrint && ($0.msrp ?? 0) > 0 }), let out = catalog.first(where: { !$0.isInPrint && ($0.msrp ?? 0) > 0 }) else {
            return check(false, "no products for the MSRP step test")
        }
        let day = store.data.day
        store.data.retail.msrpStepDay = day
        store.syncMarket()
        check(PriceCycle.msrpFactor() == 1.125 && PriceCycle.msrpFactor(day: day - 1) == 1, "msrpFactor is not 1.125 from the step day on")
        check(hot.retailMSRP() == Market.retail((hot.msrp ?? 0) * 1.125), "retailMSRP did not step")
        let slugs = Set(hot.mix.map(\.slug))
        check(abs(PriceCycle.msrpLift(slugs: slugs, id: hot.id, slug: hot.homeSlug, day: day) - 1) < 1e-12, "the lift is not 1 on the step day")
        check(abs(PriceCycle.msrpLift(slugs: slugs, id: hot.id, slug: hot.homeSlug, day: day + 30) - (1 + 0.125 * 0.6)) < 1e-12, "the lift is not 7.5% after 30 days")
        check(abs(PriceCycle.msrpLift(slugs: slugs, id: hot.id, slug: hot.homeSlug, day: day + 60) - (1 + 0.125 * 0.6)) < 1e-12, "the lift grows after its ramp")
        check(PriceCycle.msrpLift(slugs: Set(out.mix.map(\.slug)), id: out.id, slug: out.homeSlug, day: day + 30) == 1, "an out-of-print product got the lift")
        store.data.retail.msrpStepDay = nil
        store.syncMarket()
        check(PriceCycle.msrpFactor() == 1 && hot.retailMSRP() == hot.msrp, "clearing the MSRP step did not restore the price")

        // The case-fresh bonus multiplies the reach of an online sale. A zero bonus never sells, and a huge one always does.
        let listing = Listing(channel: .tcgplayer, price: etb.market, dayListed: store.data.day, insured: false)
        var never = 0, always = 0
        for _ in 0..<50 {
            if store.rollSale(listing, market: etb.market, sealed: true, name: etb.name, bonus: 0) != nil { never += 1 }
            if store.rollSale(listing, market: etb.market, sealed: true, name: etb.name, bonus: 1e9) != nil { always += 1 }
        }
        check(never == 0 && always == 50, "the rollSale bonus did not scale the reach (\(never), \(always))")

        // The card club buys only the player's own bulk. Bulk that belongs to a Rip & Ship order stays.
        let bulkCards = Array(prismatic.prefix(5))
        var ordered = BulkGroup(ripID: UUID(), setSlug: "prismatic-evolutions", date: .now, cards: bulkCards, day: store.day)
        ordered.shipOrder = UUID()
        store.data.bulk = [BulkGroup(ripID: UUID(), setSlug: "prismatic-evolutions", date: .now, cards: bulkCards, day: store.day), ordered]
        let club = Opportunity(kind: .bulkBuyer, postedDay: store.day, day: store.day, title: "Test teacher", detail: "",
                               hours: 0, price: 10, cards: 100)
        store.data.opportunities.append(club)
        _ = store.acceptOpportunity(club.id)
        check(store.data.bulk.count == 1 && store.data.bulk[0].shipOrder != nil, "the card club took bulk that belongs to an order")
        store.data.bulk = []

        // The winter scale deepens the after-holiday dip only when a scale is set.
        let winterDay = 10
        let week = PriceCycle.weekOfYear(day: winterDay)
        let base = PriceCycle.seasonSealedPrice(day: winterDay)
        let dip = Balance.seasonWinterSealedPrice.value(week: week)
        store.data.retail.winterScales[PriceCycle.winterKey(day: winterDay, week: week)] = 1.5
        store.syncMarket()
        let scaled = PriceCycle.seasonSealedPrice(day: winterDay)
        check(dip != 0 && abs((scaled - base) - dip * 0.5) < 1e-9, "a winter scale of 1.5 did not deepen the dip by half")
        store.data.retail.winterScales = [:]
        store.syncMarket()
    }

    /// Sealed product phase 4: the distributor tiers, the fill roll, missing shipments, the back-door check, the plug,
    /// the back room, and stranger cases (docs/proposals/sealed-product, Part B 9.1, Part A T8).
    private func distro() {
        fresh()
        let catalog = SetLibrary.catalog
        guard let hot = catalog.first(where: { $0.isInPrint && $0.isHot() && Balance.wholesaleKinds.contains($0.kind) && CaseMath.units($0) != nil
                                                && !$0.isStoreExclusive && $0.msrp != nil }),
              let cold = catalog.first(where: { $0.isInPrint && !$0.isHot() && Balance.wholesaleKinds.contains($0.kind) && CaseMath.units($0) != nil
                                                && !$0.isStoreExclusive && $0.msrp != nil && $0.market < 600 }),
              let etb = catalog.first(where: { $0.kind == "Elite Trainer Box" && $0.market > 0 && !$0.isStoreExclusive }) else {
            return check(false, "the distributor test has no hot or cold product")
        }
        func offer(_ p: Product, discount: Double = Balance.storeWholesaleDiscount) -> WholesaleOffer {
            let size = CaseMath.units(p) ?? 6
            return WholesaleOffer(id: "t-\(p.id)", product: p, caseSize: size, unitPrice: Market.retail((p.retailMSRP() ?? p.market) * discount),
                                  caseMarket: CaseMath.market(p, units: size))
        }
        func chargeEntries(_ from: Int) -> [LedgerEntry] {
            store.data.ledger[from...].filter { $0.category == .wholesale && $0.amount < 0 }
        }
        func resetForces() {
            GameStore.forceFill = nil
            GameStore.forceBackDoorNotice = nil
            GameStore.forceWholesaleMissing = nil
            GameStore.forcePlugVanish = nil
            GameStore.forcePlugShort = nil
            GameStore.forcePlugSeize = nil
        }
        defer { resetForces() }

        // Old saves decode: the account keeps its spend, and the plug and the Rip & Ship state load from nothing.
        let oldAccount = try? JSONDecoder().decode(DistributorAccount.self, from: Data(#"{"spent": 9000, "week": 3, "cases": {}}"#.utf8))
        check(oldAccount?.spent == 9000 && oldAccount?.week == 3 && oldAccount?.approvedDay == nil, "an old distributor account lost its spend")
        check((try? JSONDecoder().decode(PlugState.self, from: Data("{}".utf8))) != nil
              && (try? JSONDecoder().decode(RipShipState.self, from: Data("{}".utf8))) != nil, "an empty plug or ship state did not decode")

        // A store from before the application keeps its account. A store in its build-out applies the normal way.
        var old = GameData()
        old.day = 20
        old.cardStore = CardStoreState(name: "Old", location: .stripMall, leaseDay: 0, openDay: 5, deposit: 100)
        old.distributor.migrated = false
        GameStore.grandfatherDistributor(&old)
        check(old.distributor.approvedDay == 5 && old.distributor.appliedDay == 5 && old.distributor.migrated, "a store from an old save did not keep its account")
        check(oldAccount?.migrated == false, "an old account decoded as migrated")
        var building = GameData()
        building.day = 2
        building.cardStore = CardStoreState(name: "New", location: .stripMall, leaseDay: 0, openDay: 5, deposit: 100)
        GameStore.grandfatherDistributor(&building)
        check(building.distributor.approvedDay == nil, "a store in its build-out got a free account")

        // A restart never approves a store that did not apply: a built store with no application, saved and loaded by this
        // build, stays unapproved. A lapsed application stays lapsed.
        func reload(_ d: GameData) -> GameData? {
            guard let saved = try? JSONEncoder().encode(d) else { return nil }
            return try? JSONDecoder().decode(GameData.self, from: saved)
        }
        var built = GameData()
        built.day = 20
        built.cardStore = CardStoreState(name: "Built", location: .stripMall, leaseDay: 0, openDay: 5, deposit: 100)
        if var loaded = reload(built) {
            GameStore.grandfatherDistributor(&loaded)
            check(loaded.distributor.approvedDay == nil && loaded.distributor.appliedDay == nil, "a restart approved a store that did not apply")
            if var again = reload(loaded) {
                GameStore.grandfatherDistributor(&again)
                check(again.distributor.approvedDay == nil, "a second restart approved a store that did not apply")
            }
        } else {
            check(false, "a built store did not encode and decode")
        }
        var lapsed = built
        lapsed.distributor.appliedDay = nil
        if var loaded = reload(lapsed) {
            GameStore.grandfatherDistributor(&loaded)
            check(loaded.distributor.approvedDay == nil, "a lapsed application came back after a restart")
        }

        // The application: no store, no application. A built store waits 14 days, then the distributor approves.
        store.applyToDistributor()
        check(store.data.distributor.appliedDay == nil && !store.hasStoreAccount, "an application went in with no store")
        store.testOpenCardStore(.stripMall, term: 1)
        check(store.canApplyToDistributor && store.distributorTier == .secondary, "a built store cannot apply, or has no secondary tier")
        store.applyToDistributor()
        check(store.data.distributor.appliedDay == store.day && store.distributorDecisionDay == store.day + Balance.distributorReviewDays
              && !store.hasStoreAccount, "the application did not wait")
        store.data.distributor.appliedDay = store.day - Balance.distributorReviewDays
        _ = store.distributorEndDay()
        check(store.hasStoreAccount && store.distributorTier == .hobby && store.data.distributor.repContactID != nil
              && store.contact("distro:rep")?.kind == .distributorRep, "the distributor did not approve after 14 days")
        // The rep: spend gives 3 points a week at most. A push costs 5 points and has a cooldown.
        let rep0 = store.repPoints
        store.creditRepSpend(10_000)
        check(store.repPoints == rep0 + Balance.repPointsPerWeek, "rep spend gave \(store.repPoints - rep0) points, not \(Balance.repPointsPerWeek)")
        let rep1 = store.repPoints
        check(store.pushForAllocation(hot.id) == nil && store.repPoints == rep1 - Balance.pushCost, "a push did not cost its points")
        check(store.pushForAllocation(hot.id) != nil && store.repPoints == rep1 - Balance.pushCost, "a second push worked in the cooldown")
        check(store.hotFillRate(hot) > store.hotFillRate(cold) - 1 && store.hotFillRate(hot) <= Balance.fillMax, "the fill rate left its range")
        // A store that closes loses the account. The check records stay.
        store.data.distributor.hotRecords = [HotAllocationRecord(itemID: UUID(), units: 1, deliveredDay: store.day)]
        let kept = store.data.cardStore
        store.data.cardStore = nil
        _ = store.distributorEndDay()
        check(store.data.distributor.approvedDay == nil && store.data.distributor.hotRecords.count == 1, "a closed store kept its account or lost its records")
        store.data.cardStore = kept
        store.data.distributor.hotRecords = []
        store.data.distributor.appliedDay = store.day
        store.data.distributor.approvedDay = store.day

        // Hot cap stays at 1 (D-3). Other product grows with spend.
        store.data.distributor.spent = 30_000
        check(store.wholesaleCap(hot) == 1, "the hot cap is \(store.wholesaleCap(hot)), not 1")
        check(store.wholesaleCap(cold) == 6, "the cap of other product is \(store.wholesaleCap(cold)), not 6")

        // The distributor delivers whole cases, and a short ship refunds the rest.
        store.data.sealed.removeAll()
        store.data.distributor.cases = [:]
        store.addTestCash(50_000)
        GameStore.forceWholesaleMissing = false
        let coldOffer = offer(cold)
        var cash = store.cash
        var ledgerAt = store.data.ledger.count
        check(store.buyWholesale(coldOffer, cases: 1) == nil, "the case order failed")
        let delivered = store.data.sealed.filter { $0.source == "Wholesale" }
        let units = delivered.reduce(0) { $0 + ($1.caseUnits ?? 1) }
        let refund = store.data.ledger[ledgerAt...].filter { $0.label.hasPrefix("Short shipment refund") }.reduce(0) { $0 + $1.amount }
        check(abs(Double(units) - (Double(coldOffer.caseSize) - refund / coldOffer.unitPrice)) < 0.01, "the order delivered \(units) units for a refund of \(refund)")
        check(refund > 0 || (delivered.count == 1 && delivered[0].isCase && delivered[0].isCaseFresh), "a full order did not arrive as one case-fresh case")
        check(abs((cash - store.cash) - (coldOffer.casePrice - refund)) < 0.01, "the cash change of the case order is wrong")
        check(chargeEntries(ledgerAt).count == 1 && abs(chargeEntries(ledgerAt)[0].amount + coldOffer.casePrice) < 0.001, "the order charge is not the case price")

        // A missing shipment: no items, no spend, one refund later.
        let spent = store.data.distributor.spent
        let held = store.data.sealed.count
        store.data.distributor.cases = [:]
        GameStore.forceWholesaleMissing = true
        cash = store.cash
        check(store.buyWholesale(coldOffer, cases: 1) == nil, "the missing order failed")
        check(store.data.sealed.count == held && store.data.distributor.spent == spent && abs((cash - store.cash) - coldOffer.casePrice) < 0.001,
              "a missing order made items, spend, or the wrong charge")
        check(store.data.retail.missingShipments.count == 1 && abs(store.data.retail.missingShipments[0].refund - coldOffer.casePrice) < 0.001
              && store.data.retail.missingShipments[0].noticeDay == store.day + Balance.wholesaleDeliveryDays, "the missing shipment is wrong")
        GameStore.forceWholesaleMissing = false

        // T8: a due missing shipment refunds once. A new one waits for its notice and its refund day.
        store.data.retail.missingShipments = [MissingShipment(name: "test", noticeDay: store.day, refundDay: store.day + 1, refund: 120)]
        nextDay()
        let refunds = store.data.ledger.filter { $0.label.hasPrefix("Missing shipment refund") }
        check(refunds.count == 1 && abs(refunds[0].amount - 120) < 0.001 && store.data.retail.missingShipments.isEmpty,
              "a missing shipment did not refund exactly once")
        store.registerMissingShipment(name: "t", refund: 10, learnIn: 5)
        check(store.data.retail.missingShipments.first?.noticeDay == store.day + 5
              && store.data.retail.missingShipments.first?.refundDay == store.day + 5 + Balance.missingShipmentRefundDays, "registerMissingShipment set the wrong days")
        store.data.retail.missingShipments = []

        // Fill charges only filled cases. A hot request uses the allocation even when it does not fill.
        let hotOffer = offer(hot)
        store.data.sealed.removeAll()
        store.data.distributor.cases = [:]
        store.data.distributor.hotRecords = []
        GameStore.forceFill = 0
        cash = store.cash
        ledgerAt = store.data.ledger.count
        _ = store.buyWholesale(hotOffer, cases: 1)
        check(store.cash == cash && store.data.sealed.isEmpty && store.wholesaleLeft(hotOffer) == 0 && chargeEntries(ledgerAt).isEmpty,
              "an unfilled hot request charged, delivered, or kept its allocation")
        store.data.distributor.cases = [:]
        GameStore.forceFill = 1
        ledgerAt = store.data.ledger.count
        _ = store.buyWholesale(hotOffer, cases: 1)
        check(chargeEntries(ledgerAt).count == 1 && abs(chargeEntries(ledgerAt)[0].amount + hotOffer.casePrice) < 0.001, "a filled hot case did not charge exactly its price")
        check(!store.data.sealed.isEmpty && !store.data.distributor.hotRecords.isEmpty, "a filled hot case made no item or no record")

        // Elite: one hot case a week skips the fill roll. The second one rolls.
        store.data.distributor.cases = [:]
        store.data.distributor.eliteCaseWeek = -1
        store.addReputation(700)
        GameStore.forceFill = 0
        store.data.sealed.removeAll()
        ledgerAt = store.data.ledger.count
        _ = store.buyWholesale(hotOffer, cases: 1)
        check(chargeEntries(ledgerAt).count == 1 && !store.data.sealed.isEmpty, "the Elite hot case did not skip the fill roll")
        // The Elite case is used. The normal case of the same product still rolls, so the cap stays at 2.
        check(store.wholesaleCap(hot) == 2 && store.wholesaleLeft(hotOffer) == 1, "the Elite case lost the normal case of its product")
        ledgerAt = store.data.ledger.count
        _ = store.buyWholesale(hotOffer, cases: 1)
        check(chargeEntries(ledgerAt).isEmpty, "a second Elite case skipped the fill roll")
        GameStore.forceFill = nil

        // Retail and off-shelf sales (D-3): the counter counts for the shelf, a reseller channel does not.
        let a = SealedItem(setSlug: etb.homeSlug, name: etb.name, packs: etb.packs, paid: 30, acquired: .now, source: "Test", productID: etb.id)
        let b = SealedItem(setSlug: etb.homeSlug, name: etb.name, packs: etb.packs, paid: 30, acquired: .now, source: "Test", productID: etb.id)
        store.data.distributor.hotRecords = [a, b].map { HotAllocationRecord(itemID: $0.id, units: 1, deliveredDay: store.day) }
        store.addReceipt(name: etb.name, venue: "Test counter", price: 50, net: 50, paid: 30, ids: [a.id])
        _ = store.completeSaleNow(name: etb.name, channel: .ebay, price: 50, sealed: true, insured: false, paid: 30, ids: [b.id])
        check(store.data.distributor.hotRecords[0].outcome == .retail && store.data.distributor.hotRecords[1].outcome == .offShelf,
              "the counter or eBay sale marked the wrong outcome")

        // The back-door verdict: a warning, a freeze, then a closed account. One hidden act in 28 days.
        func offShelfRecords(_ n: Int) {
            store.data.distributor.hotRecords += (0..<n).map { _ in
                var r = HotAllocationRecord(itemID: UUID(), units: 1, deliveredDay: store.day - 1)
                r.outcome = .offShelf
                r.outcomeDay = store.day
                return r
            }
        }
        store.data.distributor.hotRecords = []
        store.data.hiddenActs = []
        GameStore.forceBackDoorNotice = true
        offShelfRecords(6)
        check(store.testBackDoorCheck().count == 1 && store.data.distributor.warnings.count == 1, "6 off-shelf sales gave no warning")
        offShelfRecords(6)
        _ = store.testBackDoorCheck()
        check(store.data.distributor.hotFrozenUntil != nil && store.hotFrozen && store.wholesaleCap(hot) == 0, "a second warning did not freeze hot product")
        offShelfRecords(6)
        _ = store.testBackDoorCheck()
        check(store.data.distributor.closedUntil != nil && !store.hasStoreAccount, "a third warning did not close the account")
        check(store.data.hiddenActs.filter { $0.kind == .backDoorAllocation }.count == 1, "the back-door check recorded more than one act in 28 days")
        // Fewer than 6 units, or a good shelf share, judge nothing.
        store.data.distributor.hotRecords = []
        offShelfRecords(5)
        check(store.testBackDoorCheck().isEmpty, "5 sold units were judged")
        GameStore.forceBackDoorNotice = nil
        store.data.distributor.closedUntil = nil
        store.data.distributor.hotFrozenUntil = nil
        store.data.distributor.warnings = []
        store.data.distributor.hotRecords = []

        // The plug: a gray order is not an income tax cost.
        check(!Balance.taxableCategories.contains(.grayMarket), "the gray market is taxable")
        store.testUnlockPlug()
        GameStore.forcePlugVanish = false
        GameStore.forcePlugShort = false
        GameStore.forcePlugSeize = false
        store.addTestCash(200_000)
        guard let plugOffer = store.plugOffers.first else { return check(false, "the plug has no offer") }
        store.data.sealed.removeAll()
        ledgerAt = store.data.ledger.count
        cash = store.cash
        check(store.orderFromPlug(plugOffer, cases: 1) == nil && store.data.plug.orders.count == 1, "the plug order failed")
        guard var order = store.data.plug.orders.first else { return }
        check(abs((cash - store.cash) - plugOffer.casePrice) < 0.001 && store.data.hiddenActs.contains { $0.id == order.actID && $0.kind == .plugPurchase },
              "a plug order took the wrong cash or left no act")
        store.data.plug.orders[0].arrivesDay = store.day + 1
        nextDay()
        order = store.data.plug.orders[0]
        let gray = store.data.sealed.filter { $0.grayOrder == order.id }
        let grayEntries = store.data.ledger[ledgerAt...].filter { $0.category == .grayMarket }
        check(order.state == .delivered && gray.count == 1 && gray[0].isCase && grayEntries.count == 1 && abs(grayEntries[0].amount + plugOffer.casePrice) < 0.001,
              "a plug order did not deliver one case with one gray market entry")
        // A seizure: the items leave with no refund, one seizure act appears, and the purchase act is gone.
        store.data.plug.orders[0].seizeDay = store.day + 1
        cash = store.cash
        nextDay()
        check(!store.data.sealed.contains { $0.grayOrder == order.id } && store.data.plug.orders[0].state == .seized, "a seizure left plug stock behind")
        check(store.data.hiddenActs.filter { $0.kind == .plugSeized }.count == 1 && store.data.hiddenActs.first { $0.kind == .plugSeized }?.revealDay != nil
              && !store.data.hiddenActs.contains { $0.id == order.actID }, "a seizure did not leave one seizure act and retire the purchase act")
        check(!store.data.ledger.contains { $0.day == store.day && $0.category == .grayMarket && $0.amount > 0 }, "a seizure refunded money")
        // A vanish: the prepaid money is gone, and the plug is gone.
        check(store.plugOpen, "the plug closed before it vanished")
        guard let second = store.plugOffers.first else { return check(false, "the plug has no second offer") }
        _ = store.orderFromPlug(second, cases: 1)
        store.data.plug.orders[store.data.plug.orders.count - 1].arrivesDay = store.day + 1
        GameStore.forcePlugVanish = true
        cash = store.cash
        nextDay()
        check(!store.plugOpen && store.data.plug.orders.last?.state == .vanished && abs(store.cash - cash) < 0.001, "a vanish refunded money or kept the plug open")

        // The back room: a case never goes on the customer shelf. The store opens one case of a product a night.
        store.testOpenCardStore(.stripMall, term: 1)
        store.data.sealed.removeAll()
        let c1 = store.testCase(etb, units: 4, fresh: true)
        let c2 = store.testCase(etb, units: 4, fresh: true)
        check(store.stockStore([c1, c2]) == 0 && !store.data.sealed.contains { GameStore.isInStore($0.status) }, "a case went in the store with no back room")
        store.data.cardStore?.fixtures.append(.backRoom)
        check(store.stockStore([c1, c2]) == 2 && store.backRoomCases.count == 2 && store.storeStock.sealed.isEmpty, "the back room did not hold two cases")
        check(store.storeShelf().allSatisfy { $0.isCard } , "a case is on the customer shelf")
        let lines = store.backRoomRestock()
        let shelf = store.storeStock.sealed.filter { $0.productID == etb.id }
        check(lines.count == 1 && shelf.count == 4 && store.backRoomCases.count == 1 && shelf.allSatisfy { !$0.isCase }, "the back room restock did not open exactly one case")
        check(abs(shelf.reduce(0) { $0 + $1.paid } - store.data.sealed.filter { $0.productID == etb.id && !$0.isCase }.reduce(0) { $0 + $1.paid }) < 0.001, "the restock duplicated units")
        check(store.backRoomRestock().isEmpty, "a product with stock on the shelf restocked")

        // A pack case is bigger than the shelf: the units that fit go out, the rest wait in the back room, and the shelf
        // refills from them before another case opens. Units and cost are kept.
        store.data.sealed.removeAll()
        if let pack = catalog.first(where: { Balance.caseSize(for: $0) == 144 && $0.market > 0 && !$0.isStoreExclusive }) {
            let big1 = store.testCase(pack, units: 144, fresh: true)
            let big2 = store.testCase(pack, units: 144, fresh: true)
            let paid = store.data.sealed.reduce(0) { $0 + $1.paid }
            store.stockStore([big1, big2])
            let room = store.storeSealedSlots
            func shelfUnits() -> [SealedItem] { store.storeStock.sealed.filter { $0.productID == pack.id } }
            _ = store.backRoomRestock()
            check(shelfUnits().count == room && store.backRoomUnits.count == 144 - room && store.backRoomCases.count == 1,
                  "a 144-pack case gave \(shelfUnits().count) on the shelf and \(store.backRoomUnits.count) in the back room")
            check(store.storeShelf().filter { !$0.isCard }.count == room, "a back-room unit is on the customer shelf")
            let soldUnits = shelfUnits()
            let sold = Set(soldUnits.map(\.id))
            let soldPaid = soldUnits.reduce(0) { $0 + $1.paid }
            store.data.sealed.removeAll { sold.contains($0.id) }
            _ = store.backRoomRestock()
            check(shelfUnits().count == room && store.backRoomUnits.count == 144 - 2 * room && store.backRoomCases.count == 1,
                  "the shelf did not refill from the back room before a new case opened")
            let looseLeft = store.data.sealed.filter { !$0.isCase }.count
            let unitsLeft = looseLeft + 144 * store.backRoomCases.count
            let paidLeft = store.data.sealed.reduce(0) { $0 + $1.paid }
            check(unitsLeft == 144 * 2 - room, "units were lost in the back room split")
            check(abs(paidLeft + soldPaid - paid) < 0.01, "the cost was not kept in the back room split")
        } else {
            check(false, "no 144-pack product for the back room test")
        }

        // Stranger cases: one roll for the whole case, an odd listing day, and the tape check.
        var found: StoreOffer?
        for day in 0..<400 where found == nil { found = Market.offers(for: .ebay, day: day).first { $0.caseUnits != nil } }
        if let listing = found, let product = listing.product, let units = listing.caseUnits {
            check(abs(listing.market - CaseMath.market(product, units: units)) < 0.001 && listing.title == CaseMath.name(product, units: units),
                  "a case listing has the wrong title or price")
            var fakeListing = listing
            fakeListing.fake = .convincing
            store.data.boughtToday = []
            store.data.sealed.removeAll()
            store.addTestCash(100_000)
            check(store.buy(fakeListing), "the case listing did not sell")
            if let item = store.data.sealed.first {
                check(item.isCase && item.caseUnits == units && item.fake == .convincing && !item.isCaseFresh && abs(item.paid - (fakeListing.price + fakeListing.shipping)) < 0.001,
                      "a bought stranger case has the wrong fields")
            } else {
                check(false, "the stranger case did not arrive in the inventory")
            }
        } else {
            check(false, "no eBay case listing in 400 days")
        }
        check(!Counterfeit.caseCheckCatches(nil, key: "x"), "the tape check caught a real case")
        var tellsProfessional = 0
        for k in 0..<200 where Counterfeit.caseCheckLine(.professional, key: "pro-\(k)") != nil { tellsProfessional += 1 }
        check(tellsProfessional == 0, "the tape check shows a tell for a professional reseal")
        var caught = 0
        for k in 0..<1000 where Counterfeit.caseCheckCatches(.bootleg, key: "key-\(k)") { caught += 1 }
        check(caught > 400 && caught < 600 && Counterfeit.caseCheckCatches(.bootleg, key: "key-3") == Counterfeit.caseCheckCatches(.bootleg, key: "key-3"),
              "the tape check does not halve the risk (\(caught) of 1000)")
        let owned = store.testCase(etb, units: 4, fresh: false)
        _ = store.checkCase(owned)
        check(store.data.sealed.first { $0.id == owned }?.caseChecked == true && store.checkCase(owned) == nil, "a case was checked twice")

        // Carry space: a case packs at 1 plus 1 for each 8 packs.
        let caseItem = ShowItem(id: UUID(), kind: .sealed, name: "c", detail: "", market: 1, image: nil, condition: nil, graded: false,
                                setSlug: etb.homeSlug, packs: etb.packs * 10, isCase: true)
        check(CarryBin.space(caseItem) == 1 + Int((Double(etb.packs * 10) / 8).rounded(.up)), "a case takes the wrong carry space")
    }

    /// Sealed product phase 2: limits, the vendor batch and its drain, heat and bans, the club, the dump cap, and the
    /// save of every retail field (docs/proposals/sealed-product, Part A 7.1: T1, T2, T3, T7, T11).
    private func retail() {
        fresh()
        let pool = SetLibrary.catalog.filter { $0.isInPrint && $0.msrp != nil && !$0.isStoreExclusive && Balance.bigStoreKinds.contains($0.kind) }
        let hot = pool.filter { $0.isHot() }
        guard hot.count >= 3, let cold = pool.first(where: { !$0.isHot() }) else { return check(false, "the retail test has no hot or cold product") }

        // T1: limits. Target allows 1 of a hot item a day.
        let target = ShelfItem(id: "t1", product: hot[0], price: 1, quantity: 6, hot: true)
        check(store.buyShelf(target, at: .target, credit: false), "the first hot buy at Target failed")
        check(!store.buyShelf(target, at: .target, credit: false), "a second hot buy at Target passed the limit of 1")
        // Walmart allows 5 items a visit. A second visit adds heat for the first buy.
        store.arrive(at: .walmart, hour: 12)
        let walmart = ShelfItem(id: "t1w", product: cold, price: 1, quantity: 8)
        var passed = 0
        for _ in 0..<6 where store.buyShelf(walmart, at: .walmart, credit: false) { passed += 1 }
        check(passed == 5, "Walmart sold \(passed) items in one visit, not 5")
        let heat = store.data.scalperHeat
        store.arrive(at: .walmart, hour: 13)
        check(store.buyShelf(walmart, at: .walmart, credit: false), "a buy on a second Walmart visit failed")
        check(abs(store.data.scalperHeat - heat - Balance.heatRepeatVisit) < 0.001, "a buy on a second visit did not add exactly the repeat-visit heat")
        // The club sells to members only. One hot item a day.
        let club = ShelfItem(id: "t1c", product: hot[1], price: 1, quantity: 4, hot: true)
        let club2 = ShelfItem(id: "t1d", product: hot[2], price: 1, quantity: 4, hot: true)
        check(!store.buyShelf(club, at: .club, credit: false), "the club sold to a non-member")
        let cash = store.cash
        check(store.joinClub() && abs(cash - store.cash - Balance.clubFee) < 0.001, "joining the club did not charge exactly the fee")
        check(store.buyShelf(club, at: .club, credit: false), "a member could not buy a hot item at the club")
        check(!store.buyShelf(club2, at: .club, credit: false), "the club sold a second hot item on one day")

        // T2: a batch does not change when a set leaves print later, and a bought unit never comes back.
        fresh()
        let slot = store.vendorSlot(.walmart)
        var d = store.day
        while d % 7 != slot.weekday { d += 1 }
        let seed = store.data.marketSeed
        let first = Market.batch(.walmart, vendorDay: d, seed: seed)
        check(!first.isEmpty && first == Market.batch(.walmart, vendorDay: d, seed: seed), "one vendor day gave two different batches")
        if let lead = first.first {
            store.data.printChanges.append(PrintChange(slug: lead.product.homeSlug, day: d + 1, announcedDay: d + 1, inPrint: false, jump: 0.2))
            store.syncMarket()
            check(Market.batch(.walmart, vendorDay: d, seed: seed) == first, "a later print change changed a batch on the shelf")
        }
        store.data.day = d
        store.syncMarket()
        store.arrive(at: .walmart, hour: slot.hour)
        let atVendor = store.shelf(at: .walmart, hour: slot.hour)
        check(atVendor.allSatisfy { $0.quantity == $0.batchQuantity }, "the vendor hour showed a drained batch")
        var rising = 0
        var last = Dictionary(uniqueKeysWithValues: atVendor.map { ($0.id, $0.quantity) })
        for hour in [slot.hour + 1, 15, 18, 21] where hour > slot.hour {
            for item in store.shelf(at: .walmart, hour: hour) {
                if item.quantity > (last[item.id] ?? 0) { rising += 1 }
                last[item.id] = item.quantity
            }
        }
        check(rising == 0, "a later hour showed more units than an earlier hour")
        if let item = atVendor.first(where: { $0.quantity > 0 }), store.buyShelf(item, at: .walmart, credit: false) {
            // A real End Day: the bought unit must stay bought, and it must count once.
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: false) }
            store.endDay()
            let next = store.shelf(at: .walmart, hour: 8).first { $0.id == item.id }
            check(next != nil && store.data.retail.batchBought[item.id]?.count == 1
                  && store.shelfLeft(next!) == max(0, next!.quantity - 1), "a bought batch unit came back the next day")
        } else {
            check(false, "could not buy a batch unit at the vendor hour")
        }
        // GameStop marks up hot product, and the club sells only club product.
        var markedUp = true, clubOnly = true
        for day in 0..<14 {
            for item in Market.batch(.gamestop, vendorDay: day, seed: seed) where item.hot {
                if item.price < Market.retail((item.product.retailMSRP(day: day) ?? 0) * Balance.gameStopHotMarkup.lowerBound) - 0.01 { markedUp = false }
            }
            for item in Market.batch(.club, vendorDay: day, seed: seed) where !item.product.isClubExclusive { clubOnly = false }
        }
        check(markedUp, "a hot GameStop item was not marked up")
        check(clubOnly, "the club batch holds a product that is not for the club")
        // Strictness 3 hides hot items. Strictness 4 closes the shelf.
        store.data.retail.strictness["Walmart"] = ChainStrictness(level: 3, lastChange: store.day)
        check(!store.shelf(at: .walmart, hour: 20).contains { $0.hot }, "a strictness 3 shelf still holds hot items")
        store.data.retail.strictness["Walmart"] = ChainStrictness(level: 4, lastChange: store.day, closedUntil: store.day + 21)
        check(store.shelf(at: .walmart, hour: 20).isEmpty && store.limitRule(.walmart).closed, "a strictness 4 chain still sells cards")

        // T3: a single hot buy at the limit adds a little heat and records no act. A buyout adds heat, records the
        // act, and starts a ban at 10.
        fresh()
        store.data.retail.storeHeat["Target"] = 8
        let acts = store.data.hiddenActs.count
        check(store.buyShelf(ShelfItem(id: "t3a", product: hot[0], price: 1, quantity: 3, hot: true), at: .target, credit: false),
              "a hot buy at Target failed")
        check(abs((store.data.retail.storeHeat["Target"] ?? 0) - (8 + Balance.heatLimitHit)) < 0.001 && store.data.hiddenActs.count == acts,
              "a hot buy at the limit changed the heat by the wrong amount or recorded an act")
        // The limit heat counts once for each chain each day.
        store.addTestCash(10)
        _ = store.buyShelf(ShelfItem(id: "t3a2", product: hot[1], price: 1, quantity: 3, hot: true), at: .target, credit: false)
        check(abs((store.data.retail.storeHeat["Target"] ?? 0) - (8 + Balance.heatLimitHit)) < 0.001,
              "a second limit hit at one chain on one day added heat again")
        store.data.retail.storeHeat["Walmart"] = 9.5
        store.arrive(at: .walmart, hour: 12)
        let box = ShelfItem(id: "t3b", product: hot[1], price: 1, quantity: 2, hot: true)
        check(store.buyShelf(box, at: .walmart, credit: false), "the first Walmart buy failed")
        check(store.data.retail.bannedUntil["Walmart"] == nil, "one unit started a ban")
        check(store.buyShelf(box, at: .walmart, credit: false), "the buy that empties the item failed")
        check(store.isBanned(.walmart) && store.data.hiddenActs.contains { $0.kind == .shelfBuyout }
              && store.data.hiddenActs.contains { $0.kind == .storeBan }, "a buyout at 9.5 heat did not start a ban and record its acts")
        check(!store.buyShelf(ShelfItem(id: "t3c", product: cold, price: 1, quantity: 2), at: .walmart, credit: false), "a banned chain sold cards")
        check(store.campBlock(.walmart) != nil, "a banned chain allowed a camp")

        // T7: the reprint and the dump together never cut more than 45%, and the cap never raises a price.
        check(abs(PriceCycle.capDump(jumps: 0.65, dump: 0.8) - 0.55) < 1e-9, "capDump did not cap the cut at 45%")
        check(abs(PriceCycle.capDump(jumps: 1.2, dump: 0.9) - 1.08) < 1e-9, "capDump changed a dump over a rise")
        check(abs(PriceCycle.capDump(jumps: 0.42, dump: 0.9) - 0.42) < 1e-9, "capDump raised a price")

        // A dump lowers the price of its products by its peak at the end of the fall. A save from before the dump has none
        // of its fields.
        let before = hot[0].marketPrice(day: store.day + 14)
        store.data.marketEvents.append({
            var event = MarketEvent(kind: .flipperDump, subject: "test", title: "Test dump.", startDay: store.day, days: 134, peak: -0.15)
            event.products = [hot[0].id]
            event.fallDays = 14
            return event
        }())
        store.syncMarket()
        check(hot[0].marketPrice(day: store.day + 14) <= before * 0.9, "a flipper dump did not lower the price of its product")
        store.data.marketEvents.removeAll()
        store.syncMarket()
        let oldEvent = Data(#"{"id":"\#(UUID().uuidString)","kind":"hype","subject":"X","title":"T","startDay":1,"days":5,"peak":0.2}"#.utf8)
        check((try? JSONDecoder().decode(MarketEvent.self, from: oldEvent)) != nil, "a market event from an old save did not decode")

        // T11: a save keeps every retail field, the rivals, and the pressure.
        fresh()
        guard let rival = store.data.rivals.first, let item = SetLibrary.catalog.first else { return check(false, "no rival or product") }
        store.rememberRival(rival.id, .rivalTookShelf, note: "test", byPlayer: false, hostility: 0.1)
        var r = RetailState()
        r.pressureLog = [3: 0.4]
        r.seenEvents = [UUID()]
        r.strictness = ["Target": ChainStrictness(level: 2, lastChange: 5, closedUntil: 9, lastIncident: "A test incident.")]
        r.incidentBoost = ["Target": 0.03]
        r.storeHeat = ["Walmart": 4.5]
        r.bannedUntil = ["GameStop": 12]
        r.heatHintShown = ["Walmart": 1]
        r.visits = ["Walmart": 2]
        r.visitBought = ["Walmart": 3]
        r.visitHotBought = ["Walmart": 1]
        r.checkoutVisit = ["Walmart": 1]
        r.visitProductBought = ["Walmart|x": 2]
        r.visitLines = ["v0-Walmart-x": "Gone."]
        r.batchBought = ["v0-Walmart-x": BatchBuy(vendorDay: 0, count: 2, emptied: true)]
        r.rivalTaken = ["v0-Walmart-y": BatchBuy(vendorDay: 0, count: 1)]
        r.seenSlot = ["Walmart": 2]
        r.rivalBuys = ["item": rival.id]
        r.clubUntil = 300
        r.clubHotDay = 4
        r.drawings = [DrawingEntry(chain: .walmart, productID: item.id, drawDay: 2, price: 5)]
        r.drawingWins = [DrawingWin(chain: .walmart, productID: item.id, price: 5, claimUntil: 3)]
        r.dropOrders = [DropOrder(itemID: UUID(), source: "Target.com", name: "Test", rollDay: 2, chance: 0.1, refund: 5, bot: true)]
        r.targetAttempts = 1
        r.targetAttemptDay = 2
        r.alertTier = .oneChain
        r.alertStore = .target
        r.alertStartDay = 7
        r.msrpStepDay = 120
        r.winterScales = [2029: 1.5]
        r.missingShipments = [MissingShipment(name: "Test", noticeDay: 2, refundDay: 9, refund: 10)]
        r.followerTierMark = 2
        r.gougeDay = 6
        r.ripHereWeek = ["Cardboard Castle": 3]
        r.alertPaid = 8
        r.limitHeatDay = ["Target": 4]
        store.data.retail = r
        store.data.flipperPressure = 0.73
        guard let saved = try? JSONEncoder().encode(store.data), let loaded = try? JSONDecoder().decode(GameData.self, from: saved) else {
            return check(false, "the retail fields did not encode and decode")
        }
        check(loaded.retail == r && loaded.rivals == store.data.rivals && loaded.flipperPressure == 0.73, "a save and a load lost a retail field")

        // Callouts: a save keeps the log and the callouts, and an old save with neither key loads with both empty.
        store.recordHiddenAct(.shelfBuyout, weight: 1.2, note: "test", witnesses: 4, contactID: "shop:Cardboard Castle", revealDay: 9, refund: 7)
        store.startCallout(.fairness, truth: true, receipts: true, accuser: .rival(.shop(.castle)), text: "Test callout.")
        store.data.callouts.shopCredibility["Cardboard Castle"] = 0.6
        store.data.callouts.records = [CalloutRecord(day: 1, untilDay: 91, type: .kids, text: "Test.")]
        store.data.callouts.kidGiftDay = 3
        guard let saved2 = try? JSONEncoder().encode(store.data), let loaded2 = try? JSONDecoder().decode(GameData.self, from: saved2) else {
            return check(false, "the callout fields did not encode and decode")
        }
        check(loaded2.hiddenActs == store.data.hiddenActs && loaded2.callouts == store.data.callouts && !loaded2.hiddenActs.isEmpty,
              "a save and a load lost callouts")
        if var json = (try? JSONSerialization.jsonObject(with: saved2)) as? [String: Any] {
            json["hiddenActs"] = nil
            json["callouts"] = nil
            if let old = try? JSONSerialization.data(withJSONObject: json), let oldLoaded = try? JSONDecoder().decode(GameData.self, from: old) {
                check(oldLoaded.hiddenActs.isEmpty && oldLoaded.callouts == CalloutState(), "an old save did not load with no callouts")
            } else {
                check(false, "an old save without callouts did not decode")
            }
        } else {
            check(false, "could not read the save as JSON")
        }
    }

    /// One End Day, the way the player plays it.
    private func nextDay() {
        store.report = nil
        if store.data.lateHours > 0 { store.chooseMorning(sleepIn: false) }
        store.endDay()
    }

    /// Sealed product phase 3: cancellations, drawings and claims, the checkout bot, Target.com gating, alerts, and
    /// waiting for the vendor (docs/proposals/sealed-product, Part A 7.1: T4, T5, T12).
    private func online() {
        fresh()
        guard let product = SetLibrary.catalog.first(where: { $0.isInPrint && $0.msrp != nil && !$0.isStoreExclusive }) else {
            return check(false, "the online test has no product")
        }
        func transit(_ days: Int, paid: Double = 50) -> SealedItem {
            SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: paid, acquired: .now,
                       source: "Test order", productID: product.id, status: .arriving(daysLeft: days, from: "Target.com"),
                       acquiredDay: store.day)
        }

        // T4: a cancelled order refunds once, takes the item back, and records the bot act once.
        let order = transit(3)
        store.data.sealed.append(order)
        store.data.retail.dropOrders.append(DropOrder(itemID: order.id, source: "Target.com", name: product.name, rollDay: store.day + 2,
                                                      chance: 1, refund: 50, bot: true))
        let scratch = transit(3)
        for _ in 0..<20 { store.addDropOrder(item: scratch, source: "Test", bot: false, refund: 1, deliveryDays: 3) }
        let late = store.data.retail.dropOrders.filter { $0.itemID == scratch.id && ($0.rollDay > store.day + 2 || $0.rollDay < store.day + 1) }
        check(late.isEmpty, "an order roll day fell outside the days before the delivery")
        store.data.retail.dropOrders.removeAll { $0.itemID == scratch.id }
        check(store.dropOrder(for: order.id) != nil, "the order was not on the cancel list")

        // T5: a drawing win charges nothing until the claim. A short claim takes nothing. A claim takes the price once.
        let entry = DrawingEntry(chain: .walmart, productID: product.id, drawDay: store.day, price: 40)
        var cash = store.cash
        _ = store.resolveDrawing(entry, won: false)
        check(store.cash == cash && store.data.retail.drawingWins.isEmpty, "a lost drawing changed the cash or added a win")
        _ = store.resolveDrawing(entry, won: true)
        check(store.cash == cash && store.data.retail.drawingWins.count == 1, "a drawing win took cash or did not join the claim list")
        guard let win = store.data.retail.drawingWins.first else { return }
        store.data.cash = 5
        let held = store.data.sealed.count
        check(!store.claimDrawingWin(win.id) && store.data.sealed.count == held && store.data.retail.drawingWins.count == 1,
              "a claim with short cash took the win")
        store.data.cash = 1_000
        cash = store.cash
        check(store.claimDrawingWin(win.id) && abs(cash - store.cash - 40) < 0.001 && store.data.sealed.count == held + 1
              && store.data.retail.drawingWins.isEmpty, "a claim did not take exactly the price and add one item")
        check(store.data.sealed.last.map({ if case .arriving = $0.status { true } else { false } }) == true, "a claimed win did not arrive")
        cash = store.cash
        check(!store.claimDrawingWin(win.id) && store.cash == cash, "one win charged twice")
        let claimedLines = store.data.ledger.filter { $0.label.contains(product.name) && $0.label.contains("drawing") }.count
        // A win that nobody claims lapses at no cost.
        _ = store.resolveDrawing(entry, won: true)
        // The weekly drawing: one entry for each drawing, kept after a second tap.
        if let offer = store.walmartDrawing {
            store.enterDrawing(offer)
            store.enterDrawing(offer)
            check(store.data.retail.drawings.count == 1 && store.entry(for: offer) != nil, "a drawing took two entries")
        } else {
            check(false, "no Walmart drawing on day 0")
        }
        // Level 3 chains draw their hot items. The claim of a chain win arrives the next day.
        for s in LocalStore.allCases where !s.isGameShop { store.data.retail.strictness[s.rawValue] = ChainStrictness(level: 3, lastChange: 0) }
        let chains = store.chainDrawings
        check(!chains.isEmpty, "level 3 chains offered no drawing")
        store.data.retail.strictness = [:]
        check(store.chainDrawings.isEmpty, "a drawing stayed open at a chain with no strictness")

        // The weekly entry would draw during these days and could add a win by chance. Remove it, so the lapse check is stable.
        store.data.retail.drawings = []
        // Three End Days: the cancel rolls on day 2, and the unclaimed win lapses after the claim days.
        for _ in 0...Balance.drawingClaimDays { nextDay() }
        check(!store.data.sealed.contains { $0.id == order.id }, "a cancelled order stayed in the inventory")
        let refunds = store.data.ledger.filter { $0.label.hasPrefix("Order cancelled") }
        check(refunds.count == 1 && abs((refunds.first?.amount ?? 0) - 50) < 0.001, "the order refund was not exactly one entry of 50")
        check(store.data.hiddenActs.filter { $0.kind == .botOrderCancelled }.count == 1, "a cancelled bot order did not record one act")
        check(store.data.retail.drawingWins.isEmpty && store.data.ledger.filter { $0.label.contains(product.name) && $0.label.contains("drawing") }.count == claimedLines,
              "an unclaimed win stayed on the list or charged")
        check(store.data.retail.dropOrders.filter { $0.itemID == order.id }.isEmpty, "a rolled order stayed on the list")
        nextDay()
        check(store.data.ledger.filter { $0.label.hasPrefix("Order cancelled") }.count == 1, "a cancelled order refunded twice")

        // The checkout bot: the bot is ignored without the upgrade. With it, a use adds exactly the bot heat and one act.
        fresh()
        guard let drop = Market.offers(for: .pokemonCenter, day: store.day).first else { return check(false, "no Pokemon Center offer") }
        store.addTestCash(5_000)
        var heat = store.data.scalperHeat
        _ = store.attemptDrop(drop, bot: true)
        check(store.data.scalperHeat == heat && !store.data.hiddenActs.contains { $0.kind == .botCheckout }, "the bot worked with no upgrade")
        store.data.upgrades.append(Upgrade.checkoutBot.rawValue)
        store.data.pokemonCenterAttempted = false
        heat = store.data.scalperHeat
        let botWon = store.attemptDrop(drop, bot: true)
        check(abs(store.data.scalperHeat - heat - Balance.heatBotUse) < 0.001
              && store.data.hiddenActs.filter({ $0.kind == .botCheckout }).count == 1, "a bot use did not add exactly the bot heat and one act")
        if botWon, let item = store.data.sealed.last, let o = store.dropOrder(for: item.id) {
            check(o.bot && o.chance == Balance.dropCancelBotChance, "a bot order did not carry the bot cancel chance")
        }

        // T12: Target.com gating. One attempt without the bot. With the bot owned, a second attempt needs the bot.
        fresh()
        func target(_ n: String) -> StoreOffer {
            StoreOffer(id: "tgt-test-\(n)", store: .amazon, item: .product(product, product.homeSlug), price: 20, shipping: 0,
                       deliveryDays: Balance.targetDeliveryDays, note: "Target.com · limit 1")
        }
        _ = store.attemptTargetDrop(target("a"), bot: false)
        check(store.data.retail.targetAttempts == 1, "the first Target.com attempt did not count")
        cash = store.cash
        check(!store.attemptTargetDrop(target("b"), bot: false) && store.cash == cash && store.data.retail.targetAttempts == 1,
              "a second Target.com attempt ran with no bot")
        store.data.upgrades.append(Upgrade.checkoutBot.rawValue)
        store.data.retail.targetAttempts = 0
        store.data.retail.targetAttemptDay = store.day
        _ = store.attemptTargetDrop(target("c"), bot: false)
        cash = store.cash
        check(!store.attemptTargetDrop(target("d"), bot: false) && store.cash == cash, "a second attempt ran with the bot owned but not used")
        heat = store.data.scalperHeat
        _ = store.attemptTargetDrop(target("e"), bot: true)
        check(store.data.retail.targetAttempts == 2 && abs(store.data.scalperHeat - heat - Balance.heatBotUse) < 0.001,
              "a Target.com bot attempt did not count or add the bot heat")
        check(store.targetAttemptsLeft == 0, "the bot gave more than two Target.com attempts")

        // Alerts: the first month is charged now. A dearer tier charges the gap. A cheaper tier charges nothing.
        fresh()
        cash = store.cash
        check(store.subscribeAlerts(.oneChain, store: .walmart) && abs(cash - store.cash - Balance.alertFeeOneChain) < 0.001
              && store.alertedStores == [.walmart], "a one-chain alert did not charge the fee and cover the chain")
        cash = store.cash
        check(store.subscribeAlerts(.allChains, store: nil)
              && abs(cash - store.cash - (Balance.alertFeeAllChains - Balance.alertFeeOneChain)) < 0.001, "a dearer tier did not charge the gap")
        cash = store.cash
        check(store.subscribeAlerts(.oneChain, store: .target) && store.cash == cash && store.alertedStores == [.target],
              "a cheaper tier charged money")
        check(store.subscribeAlerts(.none, store: nil) && store.alertedStores.isEmpty, "the alerts did not stop")
        // A stop and a new start in the same month charge nothing again.
        cash = store.cash
        check(store.subscribeAlerts(.allChains, store: nil) && store.cash == cash && store.alertedStores.count > 1,
              "a new start in the same month charged again")
        check(store.subscribeAlerts(.none, store: nil), "the alerts did not stop a second time")
        // The fee on the 1st: once, even when End Day code runs twice. A late-month start waits for the 1st.
        store.data.day = 25
        cash = store.cash
        check(store.subscribeAlerts(.allChains, store: nil) && store.cash == cash && store.alertedStores.isEmpty
              && store.data.retail.alertStartDay == 31, "a late-month alert charged early or started early")
        store.data.day = 31
        cash = store.cash
        _ = store.alertsEndDay()
        check(abs(cash - store.cash - Balance.alertFeeAllChains) < 0.001, "the fee on the 1st was not the tier fee")
        cash = store.cash
        _ = store.alertsEndDay()
        check(store.cash == cash, "the fee on the 1st charged twice")
        let calendar = store.restockEntries(day: store.day).filter { $0.title.hasSuffix("vendor stock") }
        check(calendar.count == LocalStore.allCases.filter { $0.isBigStore && store.vendorSlot($0).weekday == store.day % 7 }.count,
              "the calendar did not list the alert vendor days")

        // A real online order that the store cancels: the refund comes once, and the item leaves.
        func cancelled(_ source: String, make: (Int) -> Bool) {
            fresh()
            var made = false
            for i in 0..<300 where !made {
                store.data.boughtToday = []
                store.data.pokemonCenterAttempted = false
                store.data.retail.targetAttempts = 0
                made = make(i)
            }
            guard made, let item = store.data.sealed.last, let k = store.data.retail.dropOrders.firstIndex(where: { $0.itemID == item.id }) else {
                return check(false, "no \(source) order to cancel")
            }
            let refund = store.data.retail.dropOrders[k].refund
            store.data.retail.dropOrders[k].chance = 1
            let roll = store.data.retail.dropOrders[k].rollDay
            let id = item.id
            while store.day < roll { nextDay() }
            let entries = store.data.ledger.filter { $0.label.hasPrefix("Order cancelled") && $0.label.hasSuffix(source) }
            check(!store.data.sealed.contains { $0.id == id } && entries.count == 1 && abs((entries.first?.amount ?? 0) - refund) < 0.001,
                  "a \(source) order did not cancel with one refund and no item")
        }
        cancelled("Target.com") { i in
            let o = StoreOffer(id: "tgt-real-\(i)", store: .amazon, item: .product(product, product.homeSlug), price: 20, shipping: 0,
                               deliveryDays: Balance.targetDeliveryDays, note: "Target.com · limit 1")
            return store.attemptTargetDrop(o, bot: false)
        }
        cancelled("Pokemon Center") { i in
            guard let base = Market.offers(for: .pokemonCenter, day: store.day).first else { return false }
            let o = StoreOffer(id: "pc-real-\(i)", store: .pokemonCenter, item: base.item, price: base.price, shipping: base.shipping,
                               deliveryDays: base.deliveryDays, note: base.note)
            store.addTestCash(500)
            return store.attemptDrop(o)
        }

        // Wait for the vendor: only with a known slot, on the vendor day, and within the wait limit.
        fresh()
        let slot = store.vendorSlot(.walmart)
        var d = 7
        while d % 7 != slot.weekday { d += 1 }
        store.data.day = d
        store.syncMarket()
        store.data.hour = 18
        check(store.vendorWaitGap(.walmart, arrival: slot.hour - 1) == nil, "a wait showed for a vendor day the player never saw")
        store.data.retail.seenSlot["Walmart"] = slot.weekday
        check(store.vendorWaitGap(.walmart, arrival: slot.hour - 1) == 1, "a known vendor day gave no wait")
        check(store.vendorWaitGap(.walmart, arrival: slot.hour - 3) == nil && store.vendorWaitGap(.walmart, arrival: slot.hour) == nil,
              "a wait ignored its limits")
        for i in store.data.rivals.indices { store.data.rivals[i].hostility = 1 }
        let hour = store.data.hour
        let waited = store.waitForVendor(.walmart, arrival: slot.hour - 1)
        check(waited == 1 && abs(store.data.hour - (hour + 1)) < 0.001, "waiting did not spend its hours")
        if store.rivalAt(.walmart) != nil, Market.batch(.walmart, vendorDay: d, seed: store.data.marketSeed).contains(where: \.hot) {
            check(store.data.retail.rivalTaken.values.reduce(0) { $0 + $1.count } == 1, "a hostile rival took no unit from the vendor")
        }
    }

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

        // T10 (phase 4): the distributor, the plug, the hot records, the missing shipments, and a back-room case, so every
        // new End Day step runs on a full array.
        store.testApproveDistributor()
        store.data.cardStore?.fixtures.append(.backRoom)
        let backRoomETB = SetLibrary.catalog.first { $0.kind == "Elite Trainer Box" && $0.market > 0 && !$0.isStoreExclusive }
        if let etb = backRoomETB { store.stockStore([store.testCase(etb, units: 4, fresh: true)]) }
        store.testUnlockPlug()
        GameStore.forcePlugVanish = false
        GameStore.forcePlugShort = false
        GameStore.forcePlugSeize = false
        defer {
            GameStore.forcePlugVanish = nil
            GameStore.forcePlugShort = nil
            GameStore.forcePlugSeize = nil
        }
        store.addTestCash(100_000)
        if let offer = store.plugOffers.first, store.orderFromPlug(offer, cases: 1) == nil {
            store.data.plug.orders[0].arrivesDay = 3
        }
        var oldRecord = HotAllocationRecord(itemID: UUID(), units: 1, deliveredDay: -120)
        oldRecord.outcome = .retail
        oldRecord.outcomeDay = -100
        store.data.distributor.hotRecords = [oldRecord, HotAllocationRecord(itemID: UUID(), units: 1, deliveredDay: 1)]
        store.data.retail.missingShipments.append(MissingShipment(name: "Test order", noticeDay: 4, refundDay: 5, refund: 10))
        // T10 (phase 5): Rip & Ship orders in every state, so the End Day closures run on full arrays. One order is ripped and
        // never shipped (the late act on day 3, the chargeback on day 7). One was never opened (the refund on day 1). One
        // palm was caught on camera. One old refunded order and one old gross entry wait for the prune.
        var rippedShip: UUID?
        if let blister = SetLibrary.catalog.first(where: { $0.kind == "Blister" && $0.packs == 3 && $0.market > 0 }) {
            func ship(ripped: Bool) -> UUID? {
                guard let item = store.addTestProduct(blister.id),
                      let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) else { return nil }
                if ripped {
                    _ = store.beginRipShipRip(o.id, ripID: UUID())
                    store.finishRipShip(o.id)
                }
                return o.id
            }
            rippedShip = ship(ripped: true)
            _ = ship(ripped: false)
            // The palm order ships at once, so only one order ends in a chargeback.
            if let caught = ship(ripped: true), let k = store.data.ripShip.orders.firstIndex(where: { $0.id == caught }) {
                store.data.ripShip.orders[k].palmCaught = true
                store.data.ripShip.orders[k].palmedValue = 50
                let hour = store.data.hour
                store.shipRipShipOrders([caught])
                store.data.hour = hour           // shipping uses 10 minutes, and the show on day 0 needs the whole morning
            }
            var oldOrder = RipShipOrder(buyer: "Old buyer", buyerContactID: nil, itemID: UUID(), itemName: "Old order", productID: nil, caseUnits: nil,
                                        price: 10, shipping: 4.47, fees: store.ripShipFees(price: 10, shipping: 4.47), paid: 5, soldDay: -40, auction: false)
            oldOrder.refunded = true
            store.data.ripShip.orders.append(oldOrder)
            store.data.ripShip.grossByDay[-40] = 10
        }

        // T10: retail state that is not empty, so every closure in the new End Day hooks runs on a full array.
        let dumped = SetLibrary.catalog.filter { $0.isInPrint && $0.isHot() }.prefix(3).map(\.id)
        store.data.marketEvents.append({
            var event = MarketEvent(kind: .flipperDump, subject: "test", title: "Test dump.", startDay: 0, days: 134, peak: -0.15)
            event.products = Array(dumped)
            event.fallDays = 14
            return event
        }())
        store.data.retail.batchBought["old-batch"] = BatchBuy(vendorDay: -20, count: 1)
        store.data.retail.batchBought["new-batch"] = BatchBuy(vendorDay: 12, count: 1)
        store.data.retail.rivalTaken["old-taken"] = BatchBuy(vendorDay: -20, count: 1)
        store.data.retail.pressureLog[-30] = 0.4
        store.data.retail.storeHeat["Walmart"] = 3
        store.data.retail.incidentBoost["Target"] = 0.02
        store.data.retail.bannedUntil["GameStop"] = 2
        store.data.retail.strictness["Target"] = ChainStrictness(level: 1, lastChange: -89)
        store.data.retail.seenEvents = [UUID()]
        for rival in store.data.rivals { store.rememberRival(rival.id, .other, note: "test", byPlayer: false) }
        // T10 (phase 3): online state that is not empty, so the cancel, drawing, and alert code runs on full arrays.
        let onlineProduct = SetLibrary.catalog.first { $0.isInPrint && $0.msrp != nil && !$0.isStoreExclusive }
        let onlineOrder = SealedItem(setSlug: onlineProduct?.homeSlug ?? "", name: "Test order", packs: 1, paid: 30, acquired: .now,
                                     source: "Test order", productID: onlineProduct?.id, status: .arriving(daysLeft: 6, from: "Pokemon Center"),
                                     acquiredDay: 0)
        store.data.sealed.append(onlineOrder)
        store.data.retail.dropOrders.append(DropOrder(itemID: onlineOrder.id, source: "Pokemon Center", name: "Test order", rollDay: 3,
                                                      chance: 1, refund: 30, bot: true))
        store.data.retail.drawings.append(DrawingEntry(chain: .walmart, productID: onlineProduct?.id ?? "", drawDay: 2, price: 10))
        store.data.retail.drawingWins.append(DrawingWin(chain: .walmart, productID: onlineProduct?.id ?? "", price: 10, claimUntil: 1))
        store.data.retail.alertTier = .allChains
        // T10 (phase 6): open callouts, hidden acts, receipts, and rival memories, so every callout closure runs on a full array.
        let forcedAct = store.recordHiddenAct(.shelfBuyout, weight: 1, note: "test", revealDay: store.day + 1)
        store.recordHiddenAct(.lowballKid, weight: 2, note: "test", witnesses: 50)
        store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test", refund: 20)
        var deniedFalse: UUID?
        if let id = store.testCallout(.greed, truth: false, receipts: false, heat: 40) {
            store.replyToCallout(id, .deny)
            deniedFalse = id
        }
        store.testCallout(.fairness, truth: true, receipts: true, heat: 60, accuser: .rival(.rival(store.data.rivals[0].id)))
        guard let creatorID = store.data.rivals.first(where: { $0.kind == .creator })?.id,
              let flipperID = store.data.rivals.first(where: { $0.kind == .flipper })?.id else { return check(false, "no rivals in the days test") }
        store.data.callouts.rivalReceipts = [RivalReceipt(key: .rival(flipperID), day: -100, note: "old")]
        store.data.callouts.records = [CalloutRecord(day: -80, untilDay: 5, type: .kids, text: "old record")]
        store.data.callouts.shopCredibility["Cardboard Castle"] = 0.5
        store.data.callouts.dramaBait = 0.3
        store.data.dealStories.append(DealStory(day: 1, good: true, viral: false, text: "Test good story."))
        // A sealed item from a rival's table that is now known to be fake: the End Day scan turns it into one receipt.
        if let blister = SetLibrary.catalog.first(where: { $0.kind == "Blister" && $0.market > 0 }), var fakeItem = store.addTestProduct(blister.id) {
            fakeItem.fake = .convincing
            fakeItem.fakeKnown = true
            fakeItem.status = .arriving(daysLeft: 50, from: "Test")       // in transit, so no test sale or rip can take it
            if let k = store.data.sealed.firstIndex(where: { $0.id == fakeItem.id }) { store.data.sealed[k] = fakeItem }
            store.data.retail.rivalBuys[fakeItem.id.uuidString] = creatorID
        }
        // The booked show of day 0 has a rival, so its session builds a rival table, and the camp and show rival code runs.
        if let k = store.data.shows.firstIndex(where: { $0.covers(store.day) }) { store.data.shows[k].rivalID = flipperID }
        var rivalTable = false
        var shows = 0
        for day in 0..<14 {
            if day == 1, let start = store.startStoreRun([.walmart]),
               let item = store.shelf(at: .walmart, hour: start).first(where: { store.shelfLeft($0) > 0 && store.limitLeft($0, at: .walmart) > 0 }) {
                store.buyShelf(item, at: .walmart, credit: false)
            }
            if day == 0, store.canGoToShowToday, let started = store.startShowDay() {
                let session = ShowSession(show: started, store: store)
                rivalTable = session.vendors.contains { $0.rivalID == flipperID } && session.rival?.id == flipperID
                play(session)
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
        check(rivalTable, "a rival at a booked show set up no table")
        // The callout steps settled. The forced act opened exactly one true callout. The denied false one closed at no cost.
        let everyCallout = store.data.callouts.open + store.data.callouts.closed
        check(everyCallout.filter { $0.actID == forcedAct && $0.truth }.count == 1, "the act with a fixed day did not open exactly one true callout")
        check(store.data.callouts.closed.first { $0.id == deniedFalse }.map { $0.repApplied == 0 } == true, "a denied false callout did not close at no cost")
        check(store.data.callouts.open.allSatisfy { $0.heat >= 0 && $0.heat <= 100 }, "a callout heat left 0...100")
        check(!store.data.callouts.rivalReceipts.contains { $0.day == -100 }, "an old receipt against a rival stayed")
        check(store.data.callouts.rivalReceipts.contains { $0.key == .rival(creatorID) } && store.data.retail.rivalBuys.isEmpty,
              "a known fake from a rival's table did not give its receipt in End Day")
        // The Rip & Ship steps settled: nothing is still waiting for a rip, the late order was cancelled with one strike, and the old data left.
        check(!store.data.ripShip.orders.contains { $0.state == .sold && $0.open } && !store.data.ripShip.orders.contains { $0.soldDay == -40 }
              && store.data.ripShip.grossByDay[-40] == nil, "a Rip & Ship order did not settle, or the old data stayed, in 14 days")
        check(rippedShip.flatMap { id in store.data.ripShip.orders.first { $0.id == id } }?.refunded == true && store.data.ripShip.strikes.count == 1
              && store.data.ripShip.orders.filter { $0.palmCaught }.allSatisfy(\.palmSettled), "the late Rip & Ship order did not end in a chargeback with one strike")
        // The distributor, plug, and back-room steps settled: the order arrived, the old record left, the refund came, the case opened.
        check(store.data.plug.orders.first?.state == .delivered || store.data.plug.orders.isEmpty, "the plug order did not arrive in 14 days")
        check(!store.data.distributor.hotRecords.contains { $0.deliveredDay == -120 } && store.data.retail.missingShipments.isEmpty
              && store.data.ledger.contains { $0.label.hasPrefix("Missing shipment refund") }, "a hot record or a missing shipment did not settle in 14 days")
        if let etb = backRoomETB {
            let units = store.data.sealed.filter { $0.productID == etb.id && !$0.isCase }.count
                + store.data.sealed.filter { $0.productID == etb.id }.reduce(0) { $0 + ($1.caseUnits ?? 0) }
            check(units <= 4 && !store.backRoomCases.contains { $0.productID == etb.id }, "the back room case did not open, or its units grew (\(units))")
        }
        check(!store.data.sealed.contains { $0.id == onlineOrder.id } && store.data.ledger.filter { $0.label.hasPrefix("Order cancelled") }.count == 1
              && store.data.retail.drawings.isEmpty && store.data.retail.drawingWins.isEmpty && store.data.retail.dropOrders.isEmpty,
              "the online orders, drawings, or wins did not settle in 14 days")
        // T6: the pressure stays in its range, and the old retail entries are pruned.
        check(Balance.pressureRange.contains(store.data.flipperPressure) && !store.data.retail.pressureLog.keys.contains { $0 < store.day - Balance.pressureLogDays },
              "the flipper pressure left its range or the pressure log kept an old day")
        check(store.data.retail.batchBought["old-batch"] == nil && store.data.retail.batchBought["new-batch"] != nil
              && store.data.retail.rivalTaken["old-taken"] == nil, "End Day did not prune old batch entries")
        check(!store.data.retail.winterScales.isEmpty, "the first winter did not lock its scale")
        // An incident can raise Target again later, so the check reads the day of the last change.
        check((store.data.retail.strictness["Target"]?.lastChange ?? -89) > -89 && store.data.retail.bannedUntil["GameStop"] == nil,
              "a strictness level or a ban did not end with its time")
        check(store.series(.ripUntil) == nil, "a series with no episodes did not die")
        let inStock = store.machines.reduce(0) { $0 + $1.stock.count }
        let out = store.machines.reduce(0) { $0 + $1.soldCount + $1.stolenCount + $1.returnedCount }
        check(stocked > 0 && stocked == inStock + out, "vending: \(stocked) stocked, but \(inStock) in stock and \(out) out")
        check(!store.machines.contains { $0.cashBox < 0 }, "a vending cash box is negative")
        check(!store.data.dealStories.contains { $0.day < store.day }, "a deal story stayed in the queue past its day")
    }

    /// Sealed product phase 5: Rip & Ship (docs/proposals/sealed-product, Part B 9.2).
    private func ripShip() {
        fresh()
        guard let blister = SetLibrary.catalog.first(where: { $0.kind == "Blister" && $0.packs == 3 && $0.market > 0 }),
              let bundle = SetLibrary.catalog.first(where: { $0.kind == "Booster bundle" && $0.packs == 6 && $0.market > 0 && Balance.caseSize(for: $0) == 25 }),
              let big = prismatic.max(by: { ($0.market ?? 0) < ($1.market ?? 0) }) else {
            return check(false, "no blister, bundle, or card for the Rip & Ship test")
        }
        func newOrder(_ price: Double = 20) -> RipShipOrder? {
            guard let item = store.addTestProduct(blister.id) else { return nil }
            return store.createRipShipOrder(itemID: item.id, price: price, buyer: "Jess", buyerContactID: nil, auction: false)
        }
        func live(_ id: UUID) -> RipShipOrder? { store.data.ripShip.orders.first { $0.id == id } }
        /// Removes a test order and every item that carries its ID (the product, the hit cards, the palmed cards, and bulk), so End Day cannot see them.
        func dropOrder(_ id: UUID) {
            let palmed = Set(store.data.ripShip.orders.first { $0.id == id }?.palmedCardIDs ?? [])
            store.data.ripShip.orders.removeAll { $0.id == id }
            store.data.raw.removeAll { palmed.contains($0.id) }
            store.data.sealed.removeAll { if case .soldToViewer(let o) = $0.status { return o == id }; return false }
            store.data.raw.removeAll { if case .soldToViewer(let o) = $0.status { return o == id }; return false }
            store.data.bulk.removeAll { $0.shipOrder == id }
        }
        func refunds() -> [LedgerEntry] { store.data.ledger.filter { $0.category == .refund && $0.label.hasPrefix("Whatnot refund") } }
        /// A Rip & Ship order that already ripped nothing, as if its stream rip ended at once.
        func rippedOrder(daysAgo: Int = 0) -> RipShipOrder? {
            guard let o = newOrder() else { return nil }
            _ = store.beginRipShipRip(o.id, ripID: UUID())
            store.finishRipShip(o.id)
            if let k = store.data.ripShip.orders.firstIndex(where: { $0.id == o.id }) { store.data.ripShip.orders[k].rippedDay = store.day - daysAgo }
            return live(o.id)
        }

        // The fees: 8% + 2.9% of (sale + buyer shipping) + $0.30 + $0.50 supplies. A big month lowers the commission.
        let f = store.ripShipFees(price: 100, shipping: 4.47)
        check(abs(f.total - 11.83) < 0.005, "the Rip & Ship fees on $100 are \(f.total), not 11.83")
        store.data.ripShip.grossByDay[store.day] = 20_000
        check(store.ripShipCommissionRate == 0.075, "a $20,000 month did not lower the commission to 7.5%")
        store.data.ripShip.grossByDay = [:]
        let oldSave = RipShipState()
        check((try? JSONDecoder().decode(RipShipState.self, from: Data(#"{"strikes": [3]}"#.utf8)))?.strikes == [3] && oldSave.orders.isEmpty,
              "a Rip & Ship state with a missing field did not decode")

        // One order, one buyer, one whole product. The money comes now, and the item is locked.
        let cashBefore = store.cash
        guard let order = newOrder() else { return check(false, "could not create a Rip & Ship order") }
        check(abs(store.cash - cashBefore - order.net) < 0.005, "the Rip & Ship sale did not pay exactly its net")
        check(store.data.sealed.first { $0.id == order.itemID }?.status == .soldToViewer(orderID: order.id), "the sold product has no order status")
        check(store.createRipShipOrder(itemID: order.itemID, price: 20, buyer: "Nate", buyerContactID: nil, auction: false) == nil
              && store.ripShipBlock(order.itemID) != nil && !store.streamStock.contains { $0.id == order.itemID },
              "a sold product can be sold or brought to a stream again")

        // Every content goes to the buyer: the cards, the bulk, the promos, and no other owner keeps one.
        let rid = UUID()
        let items = store.beginRipShipRip(order.id, ripID: rid)
        check(items.count == 1 && store.beginRipShipRip(order.id, ripID: UUID()).isEmpty, "a Rip & Ship rip started twice")
        _ = ripAll(items, ripID: rid) { $0.shipOrderID = order.id }
        let seen = ripSeen
        check(store.data.raw.contains { $0.ripID == rid } || store.data.bulk.contains { $0.ripID == rid }, "the rip made no cards")
        store.finishRipShip(order.id)
        let promos = blister.pickOnePromo ? min(1, blister.promos.count) : blister.promos.count
        if let done = live(order.id) {
            let bulkCards = done.bulk.reduce(0) { $0 + $1.cards.count }
            check(done.state == .ripped && done.open, "a ripped order is not open and ripped")
            check(done.cards.count + bulkCards == seen + promos, "the order holds \(done.cards.count + bulkCards) cards, but the rip showed \(seen) and \(promos) promos")
            check(!store.data.raw.contains { $0.ripID == rid } && !store.data.bulk.contains { $0.ripID == rid || $0.shipOrder == order.id },
                  "a card of the buyer's rip is still in Inventory")
            check(!store.data.raw.contains { if case .soldToViewer(let id) = $0.status { return id == order.id }; return false }
                  && !store.data.sealed.contains { if case .soldToViewer(let id) = $0.status { return id == order.id }; return false },
                  "a card or a pack of the order still carries its status")
            check(done.loose.count == 0, "a pack of a fully ripped blister ships unopened")
        } else {
            check(false, "the order is gone after its rip")
        }

        // An early stop ships the packs that stayed closed.
        if let early = newOrder() {
            let eid = UUID()
            let model = RipModel(items: store.beginRipShipRip(early.id, ripID: eid), store: store, ripID: eid)
            model.shipOrderID = early.id
            model.mode = .sift
            _ = model.sift()
            while model.phase == .open { _ = model.sift(); model.resume() }
            store.finishRipShip(early.id)
            let loose = live(early.id)?.loose.count ?? -1
            check(loose == blister.packs - 1 && !store.data.sealed.contains { $0.brokenFrom != nil && $0.status != nil },
                  "an early stop shipped \(loose) packs, not \(blister.packs - 1)")
        } else {
            check(false, "could not make the early stop order")
        }

        // A whole case for one buyer: the units open under the order, and every one ships.
        let caseID = store.testCase(bundle, units: 25, fresh: true)
        if let caseOrder = store.createRipShipOrder(itemID: caseID, price: CaseMath.market(bundle, units: 25), buyer: "Priya",
                                                    buyerContactID: nil, auction: true) {
            let units = store.beginRipShipRip(caseOrder.id, ripID: UUID())
            check(units.count == 25 && units.allSatisfy { $0.status == .soldToViewer(orderID: caseOrder.id) }, "a sold case did not open into 25 locked units")
            store.finishRipShip(caseOrder.id)
            check(live(caseOrder.id)?.loose.count == 25 && !store.data.sealed.contains { $0.productID == bundle.id }, "a whole case did not ship all 25 units")
        } else {
            check(false, "could not sell a whole case")
        }

        // Palm the hit: the card stays with the player, and the buyer gets a bulk card in its place.
        GameStore.forcePalmCaught = false
        defer { GameStore.forcePalmCaught = nil }
        func palmedOrder() -> (order: RipShipOrder, card: UUID)? {
            guard let o = newOrder() else { return nil }
            let pid = UUID()
            _ = store.beginRipShipRip(o.id, ripID: pid)
            var hit = OwnedCard(print: big, setSlug: "prismatic-evolutions", acquired: .now, paid: nil, ripID: pid, acquiredDay: store.day)
            hit.status = .soldToViewer(orderID: o.id)
            store.data.raw.append(hit)
            store.notePalm(orderID: o.id, ripID: pid, print: big, value: big.market ?? 0)
            store.finishRipShip(o.id)
            return live(o.id).map { ($0, hit.id) }
        }
        if let (p, card) = palmedOrder() {
            check(store.data.raw.first { $0.id == card }?.status == nil && p.palmedCardIDs == [card] && !p.cards.contains { $0.id == card },
                  "a palmed card did not stay with the player")
            check(p.bulk.contains { $0.cards.count == 1 }, "the buyer got no bulk card in place of the palm")
            check(store.data.hiddenActs.contains { $0.kind == .palmedHit && $0.sourceID == p.id && abs($0.refund - (p.price + (big.market ?? 0))) < 0.005 },
                  "a palm that nobody caught recorded no act with the right refund")
            store.returnPalmedCards(p.id)
            let back = live(p.id)
            check(!store.data.raw.contains { $0.id == card } && back?.cards.contains { $0.id == card } == true && back?.shipped == true && back?.refunded == true,
                  "returnPalmedCards did not send the card and close the order")
            check(!store.data.hiddenActs.contains { $0.sourceID == p.id }, "returnPalmedCards left an act in the log")
        } else {
            check(false, "could not palm")
        }
        // A palmed order that a chargeback refunded owes only the card, never the price twice.
        if let (p2, _) = palmedOrder() {
            let value = big.market ?? 0
            check(abs(store.palmRefundDue(p2.id) - (p2.price + value)) < 0.005, "the palm refund is not the price plus the card")
            store.refundRipShipOrder(p2.id, reason: .chargeback)
            check(abs(store.palmRefundDue(p2.id) - value) < 0.005, "the palm refund counts the price after a chargeback")
        } else {
            check(false, "could not make the second palm order")
        }

        // One order never has both a secret palm act and a forced callout, and two palms share one act.
        func addHit(_ o: RipShipOrder, _ pid: UUID) {
            var hit = OwnedCard(print: big, setSlug: "prismatic-evolutions", acquired: .now, paid: nil, ripID: pid, acquiredDay: store.day)
            hit.status = .soldToViewer(orderID: o.id)
            store.data.raw.append(hit)
        }
        for caughtSecond in [true, false] {
            if let o = newOrder() {
                let pid = UUID()
                _ = store.beginRipShipRip(o.id, ripID: pid)
                for (n, caught) in [!caughtSecond, caughtSecond].enumerated() {
                    addHit(o, pid)
                    GameStore.forcePalmCaught = caught
                    store.notePalm(orderID: o.id, ripID: pid, print: big, value: 10)
                    if n == 0, !caught { check(store.data.hiddenActs.filter { $0.sourceID == o.id }.count == 1, "a palm recorded no single act") }
                }
                GameStore.forcePalmCaught = false
                let acts = store.data.hiddenActs.filter { $0.sourceID == o.id }
                check(live(o.id)?.palmCaught == true && acts.isEmpty && live(o.id)?.palmActID == nil,
                      "two palms in one order left a secret act next to a caught palm")
                dropOrder(o.id)       // End Day must not settle this test order
            } else {
                check(false, "could not make the two-palm order")
            }
        }
        if let o = newOrder() {
            let pid = UUID()
            _ = store.beginRipShipRip(o.id, ripID: pid)
            for _ in 0..<2 { addHit(o, pid); store.notePalm(orderID: o.id, ripID: pid, print: big, value: 10) }
            let acts = store.data.hiddenActs.filter { $0.sourceID == o.id }
            check(acts.count == 1 && abs((acts.first?.refund ?? 0) - (o.price + 20)) < 0.005, "two palms did not share one act with the full refund")
            dropOrder(o.id)
        } else {
            check(false, "could not make the shared-act order")
        }

        // Booking: a Rip & Ship sale takes the product out of Paid and Unrealized at once, as a normal sale does. A refund puts it back.
        // A hot unit that returns by a refund records its next sale on its real channel. The P&L challenge credit goes back too.
        if let item = store.addTestProduct(blister.id) {
            let paid1 = store.paid, value1 = store.marketValue, market = store.realMarket(of: item)
            store.data.distributor.hotRecords = [HotAllocationRecord(itemID: item.id, units: 1, deliveredDay: store.day)]
            var series = ShortSeries(format: .pnl, name: "Test", startDay: store.day)
            series.items = [item.id]
            series.cash = 100
            store.data.shorts.series = [series]
            if let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) {
                check(abs((paid1 - store.paid) - item.paid) < 0.005 && abs((value1 - store.marketValue) - market) < 0.005,
                      "a Rip & Ship sale did not take the product out of Paid and the market value")
                check(store.data.distributor.hotRecords.first?.outcome == .retail, "a Rip & Ship sale of a hot unit did not count as retail")
                check(abs((store.data.shorts.series.first?.cash ?? 0) - (100 + o.net)) < 0.005 && live(o.id)?.challengeCredit != nil,
                      "a Rip & Ship sale did not credit the P&L challenge once")
                store.refundRipShipOrder(o.id, reason: .notOpened)
                check(abs(store.paid - paid1) < 0.005 && abs(store.marketValue - value1) < 0.005, "a refund did not put the product back in Paid and the market value")
                check(store.data.distributor.hotRecords.first?.outcome == nil && abs((store.data.shorts.series.first?.cash ?? 0) - 100) < 0.005,
                      "a refund kept the hot outcome or the challenge credit")
                _ = store.completeSaleNow(name: item.name, channel: .ebay, price: 50, sealed: true, insured: false, paid: item.paid, ids: [item.id])
                check(store.data.distributor.hotRecords.first?.outcome == .offShelf, "a hot unit sold on eBay after a refund did not record its real channel")
            } else {
                check(false, "could not sell the hot unit")
            }
            store.data.sealed.removeAll { $0.id == item.id }
            store.data.distributor.hotRecords = []
            store.data.shorts.series = []
        }
        // A ripped order that a chargeback refunds keeps Paid whole: the cost of the opened packs goes back to `openedPaid`.
        if let item = store.addTestProduct(blister.id) {
            let paid1 = store.paid
            if let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) {
                let rid = UUID()
                let model = RipModel(items: store.beginRipShipRip(o.id, ripID: rid), store: store, ripID: rid)
                model.shipOrderID = o.id
                model.mode = .sift
                _ = model.sift()
                while model.phase == .open { _ = model.sift(); model.resume() }
                check(abs(store.paid - (paid1 - item.paid)) < 0.01, "ripping a sold product changed Paid")
                store.finishRipShip(o.id)
                check(abs(store.paid - (paid1 - item.paid)) < 0.01, "shipping the contents changed Paid")
                store.refundRipShipOrder(o.id, reason: .chargeback)
                check(abs(store.paid - paid1) < 0.01, "a chargeback did not restore Paid (\(store.paid) against \(paid1))")
            } else {
                check(false, "could not sell the chargeback product")
            }
        }
        // Two chargebacks so far gave two strikes and a ban. Clear them, so the next orders can sell.
        store.data.ripShip.strikes = []
        store.data.ripShip.bannedUntil = nil
        // A resealed product shows on camera: the buyer is refunded, the junk stays, and Paid comes back whole.
        store.data.social.authenticity = 0.5
        if let item = store.addTestProduct(blister.id), let i = store.data.sealed.firstIndex(where: { $0.id == item.id }) {
            store.data.sealed[i].fake = .convincing
            let paid1 = store.paid, auth = store.data.social.authenticity
            if let o = store.createRipShipOrder(itemID: item.id, price: 20, buyer: "Jess", buyerContactID: nil, auction: false) {
                _ = store.beginRipShipRip(o.id, ripID: UUID())
                let line = store.finishRipShip(o.id) ?? ""
                check(live(o.id)?.refunded == true && line.contains("resealed") && store.data.social.authenticity < auth
                      && !store.data.sealed.contains { $0.status == .soldToViewer(orderID: o.id) }
                      && abs(store.paid - paid1) < 0.01, "a resealed product on camera was not refunded and unlocked")
            } else {
                check(false, "could not sell the resealed product")
            }
        }
        // A seized product refunds the buyer.
        if let o = newOrder() {
            let line = store.refundRipShipOrder(o.id, reason: .seized)
            check(live(o.id)?.refunded == true && line.contains("Police") && store.data.sealed.first { $0.id == o.itemID }?.status == nil,
                  "a seized order was not refunded and unlocked")
        } else {
            check(false, "could not make the seized order")
        }
        // An order stays while one of its acts is in the log, even when it is old and refunded.
        do {
            let act = store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test")
            var old = RipShipOrder(buyer: "Old", buyerContactID: nil, itemID: UUID(), itemName: "Old", productID: nil, caseUnits: nil, price: 10,
                                   shipping: 4.47, fees: store.ripShipFees(price: 10, shipping: 4.47), paid: 5, soldDay: -40, auction: false)
            old.refunded = true
            old.lateActID = act
            let saved = store.data.ripShip
            store.data.ripShip.orders = [old]
            _ = store.ripShipEndDay()
            check(store.data.ripShip.orders.count == 1, "the prune dropped an order whose act is still in the log")
            store.retireHiddenAct(act, force: true)
            _ = store.ripShipEndDay()
            check(store.data.ripShip.orders.isEmpty, "the prune kept an old order with no act")
            store.data.ripShip = saved
        }

        // Shipping, the late act, the day-7 chargeback, and the strike. One End Day settles three orders.
        store.data.ripShip.strikes = []
        let notOpened = newOrder()
        // An order whose rip started when the app quit: End Day finishes it and ships the contents to the buyer.
        let quit = newOrder()
        if let q = quit { _ = store.beginRipShipRip(q.id, ripID: UUID()) }
        let late = rippedOrder(daysAgo: 2)
        let cancelled = rippedOrder(daysAgo: 6)
        let gross = store.data.ripShip.grossByDay.values.reduce(0, +)
        let refundsBefore = refunds().count
        store.report = nil
        store.endDay()
        if let n = notOpened, let l = late, let c = cancelled {
            let newRefunds = refunds().dropFirst(refundsBefore).map(\.amount)
            check(newRefunds.count == 2 && newRefunds.contains { abs($0 + n.net) < 0.005 } && newRefunds.contains { abs($0 + c.price) < 0.005 },
                  "End Day did not refund the unopened order for its net and charge back the day-7 order for its price, once each")
            check(live(n.id)?.refunded == true && store.data.sealed.first { $0.id == n.itemID }?.status == nil, "an order that was never opened was not refunded")
            check(quit.flatMap { live($0.id) }.map { $0.state == .ripped && $0.open && $0.loose.count == 1 } == true,
                  "End Day did not finish a rip that the app quit in the middle of")
            check(live(c.id)?.refunded == true, "the day-7 cancel did not refund the order")
            check(store.data.ripShip.strikes.count == 1 && !store.whatnotBanned, "a first chargeback did not give exactly one strike")
            check(live(c.id)?.loose.isEmpty == true && store.data.sealed.contains { $0.productID == blister.id && $0.status == nil },
                  "the product of a chargeback did not come back to Inventory")
            check(store.data.hiddenActs.contains { $0.kind == .unshippedOrder && $0.sourceID == c.id }, "a chargeback recorded no unshipped-order act")
            check(live(l.id)?.lateActID != nil && store.data.hiddenActs.contains { $0.kind == .unshippedOrder && $0.sourceID == l.id }, "a late order recorded no act")
            // One refund only: a second call pays nothing.
            let ledger = store.data.ledger.count
            let cash = store.cash
            check(store.refundRipShipOrder(c.id).isEmpty && store.refundRipShipOrder(n.id, reason: .chargeback).isEmpty
                  && store.data.ledger.count == ledger && store.cash == cash, "a refunded order paid twice")
            // Shipping the late order costs 10 minutes and retires its act.
            let before = store.data.hour
            check(store.shipRipShipOrders([l.id]) == nil && live(l.id)?.shipped == true && abs(store.data.hour - before - 10.0 / 60) < 0.0001
                  && !store.data.hiddenActs.contains { $0.sourceID == l.id }, "shipping an order did not cost 10 minutes and retire its act")
            check(store.refundRipShipOrder(l.id, reason: .chargeback).isEmpty, "a shipped order was refunded")
        } else {
            check(false, "could not make the shipping orders")
        }
        check(store.data.ripShip.grossByDay.values.reduce(0, +) <= gross, "a refunded order still counts for the commission tier")
        // A save and a load keep every order. (A card print drops its `priceKey` cache: GameStore.init fills it again.)
        func signature(_ state: RipShipState) -> [String] {
            state.orders.map { "\($0.id) \($0.state.rawValue) \($0.refunded) \($0.shipped) \($0.cards.count) \($0.bulk.count) \($0.loose.count) \($0.price)" }
                + ["\(state.strikes)", "\(state.ripShipClosed)", "\(state.bannedUntil ?? -1)"]
        }
        if let again = try? JSONDecoder().decode(RipShipState.self, from: JSONEncoder().encode(store.data.ripShip)) {
            check(signature(again) == signature(store.data.ripShip) && again.orders.count > 3, "a save and a load changed the Rip & Ship orders")
        } else {
            check(false, "the Rip & Ship state did not save and load")
        }

        // Strikes: a second chargeback in 60 days bans Whatnot, and a third in 120 days ends Rip & Ship. An old strike drops out.
        if let second = rippedOrder() {
            store.refundRipShipOrder(second.id, reason: .chargeback)
            check(store.whatnotBanned && store.data.ripShip.strikes.count == 2 && store.ripShipBlock(UUID()) != nil, "a second strike in 60 days did not ban Whatnot")
        } else {
            check(false, "could not make the second strike order")
        }
        store.data.ripShip.bannedUntil = nil
        if let third = rippedOrder() {
            store.refundRipShipOrder(third.id, reason: .chargeback)
            check(store.data.ripShip.ripShipClosed && store.data.ripShip.strikes.count == 3, "a third strike in 120 days did not end Rip & Ship")
        } else {
            check(false, "could not make the third strike order")
        }
        store.data.ripShip = RipShipState()
        store.data.ripShip.strikes = [store.day - 200]
        if let old = rippedOrder() {
            store.refundRipShipOrder(old.id, reason: .chargeback)
            check(store.data.ripShip.strikes.count == 1 && !store.whatnotBanned, "a strike older than 120 days still counts")
        } else {
            check(false, "could not make the old strike order")
        }

        // A palm that the camera caught: the reputation, the Whatnot ban, and a forced callout.
        store.data.ripShip = RipShipState()
        store.addReputation(400)
        GameStore.forcePalmCaught = true
        let repBefore = store.data.reputation
        // End Day can also open callouts for secret acts of earlier tests. A caught palm has no act, so count only those.
        func caughtCallouts() -> Int { store.data.callouts.open.filter { $0.actKind == .palmedHit && $0.actID == nil }.count }
        let palmCalloutsBefore = caughtCallouts()
        if let (caught, _) = palmedOrder() {
            check(caught.palmCaught && !store.data.hiddenActs.contains { $0.kind == .palmedHit && $0.sourceID == caught.id },
                  "a palm on camera recorded a secret act")
            store.report = nil
            store.endDay()
            check(repBefore - store.data.reputation >= Balance.palmFoundReputation && store.whatnotBanned
                  && caughtCallouts() == palmCalloutsBefore + 1,
                  "a palm on camera did not cost reputation, ban Whatnot, and open one callout")
        } else {
            check(false, "could not make the caught palm order")
        }
        GameStore.forcePalmCaught = nil

        // A stream that ends mid-rip still sends every card to the buyer, and nobody refunds. An unripped order is refunded.
        store.data.ripShip = RipShipState()
        store.data.social.authenticity = 0.5
        for waiting in [false, true] {
            guard let item = store.addTestProduct(blister.id) else { continue }
            var streamItem = store.streamStock.first { $0.id == item.id }
            streamItem?.ripShip = true
            guard let streamItem else { continue }
            let session = StreamSession(store: store, hours: 2, items: [streamItem], scheduled: false)
            session.testRipShipSale(streamItem, price: 20)
            guard let sold = session.ripShipWaiting else { check(false, "the test stream sold nothing"); continue }
            if !waiting {
                check(session.startRipShipRip() != nil && session.ripping != nil, "the rip of a waiting order did not start")
                session.tick()
                check(session.minute == 0, "the stream clock ran during a Rip & Ship rip")
            }
            session.end()
            let o = live(sold.id)
            if waiting {
                check(o?.refunded == true && session.ripping == nil, "a stream that ended with an unripped order did not refund it")
            } else {
                check(o?.refunded == false && o?.state == .ripped && o?.loose.count == 1 && session.ripping == nil,
                      "a stream that ended mid-rip did not ship the cards to the buyer")
            }
        }
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
