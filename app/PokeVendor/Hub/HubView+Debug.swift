import SwiftUI

#if DEBUG
extension HubView {
    /// Test aid: `-soak <days>` plays that many days by itself and prints what happened. It touches every system,
    /// so a crash shows up in the console.
    private func soak(days: Int) {
        store.startRun()
        store.addTestCash(6000)
        store.testFollowers(1_200)
        store.data.vendorKit = true
        store.addReputation(400)
        store.testMakeRegular()
        for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 10 }).prefix(6) { store.addTestCard(print) }
        for _ in 0..<4 { store.addTestPack() }
        store.addTestFake(.bootleg)
        store.addTestResealed()
        var log: [String] = []
        // Packing checks (docs/29-packing-and-crowds.md): each one that breaks prints a SOAK PACK FAIL line.
        var dealSeen = 0, dealBundles = 0, dealFinals = 0, dealBinder = 0, dealInstead = 0, dealFairMoves = 0, dealPolite = 0, dealRepTotal = 0,
            dealStoriesOut = 0, dealTheftAfter = 0, dealRepSeen = 0, dealFails: [String] = []
        var packTables = 0, packBags = 0, packGraded = 0, packRepack = 0, packBoothNo = 0, packVendorNo = 0, packGone = 0, packFound = 0, packStale = 0, packFails: [String] = []
        func checkLoad(_ session: ShowSession, _ step: String) {
            let used = session.usage(session.loadItems)
            for bin in CarryBin.allCases where used[bin, default: 0] > store.capacity(bin) {
                packFails.append("\(step) at \(session.venue.name): \(bin.name) \(used[bin, default: 0])/\(store.capacity(bin))")
            }
        }
        func pack(_ session: ShowSession) {
            guard session.venue.limitsLoad else { return }
            checkLoad(session, "default load")
            // Every other table: clear, pick a few by hand, then fill.
            if (packTables + packBags) % 2 == 1 {
                session.clearBring()
                if !session.bring.isEmpty { packFails.append("clear left \(session.bring.count) items") }
                for item in session.loadItems.reversed().prefix(5) { session.toggleBring(item) }
                checkLoad(session, "hand pick")
                session.fillBring()
            }
            checkLoad(session, "fill")
            // An item bigger than its bin must not go in.
            for item in session.loadItems where CarryBin.space(item) > store.capacity(CarryBin.of(item)) {
                session.toggleBring(item)
                if session.bring.contains(item.id) { packFails.append("\(item.name) went in, and it is too big") }
            }
            if session.loadItems.contains(where: { $0.market < 0.5 }) { packFails.append("an item under 50 cents is in the list") }
        }
        func stockIDs() -> Set<UUID> { let s = store.showStock; return Set(s.cards.map(\.id) + s.sealed.map(\.id)) }
        /// Every item the player owns, the store shelves included.
        func ownedIDs() -> Set<UUID> { Set(store.data.raw.map(\.id) + store.data.slabs.map(\.id) + store.data.sealed.map(\.id)) }
        /// A raw card in hand that is not in the load: the booth and the vendors must turn it down.
        func outsideCard(_ session: ShowSession) -> OwnedCard? {
            store.data.raw.first { $0.status == nil && !$0.keep && !$0.isKnownFake && $0.market >= Balance.tradeMinItem && !session.bring.contains($0.id) }
        }
        func play(_ session: ShowSession) {
            // Every item that leaves the stock in this visit must come from the load that left the car.
            let before = stockIDs()
            var load: Set<UUID> = []
            if session.phase == .setup {
                pack(session)
                if !session.hasTable {
                    packBags += 1
                    session.walkFloor()
                    if store.data.lastBag.count != session.bring.count { packFails.append("the game did not keep the bag") }
                } else {
                    // At a booked show: go to the floor, come back, and try to add an item. The load must not grow.
                    if session.venue.hasFloor {
                        let packedLoad = session.bring
                        session.walkFloor()
                        session.backToTable()
                        if session.phase != .setup { packFails.append("back from the floor did not return to the setup") }
                        if let extra = session.loadItems.first(where: { !packedLoad.contains($0.id) }) { session.toggleBring(extra); packRepack += 1 }
                        session.fillBring()
                        if !session.bring.isSubset(of: packedLoad) { packFails.append("the load grew after the trip to the floor") }
                    }
                    let opening = session.bring
                    session.openTable()
                    if session.table.contains(where: { !opening.contains($0.id) }) { packFails.append("the table holds an item that was not in the load") }
                }
                if session.venue.tableRules {
                    packTables += 1
                    checkLoad(session, "open")
                }
                load = session.bring
            }
            var boothTested = false
            var steps = 0
            // A player with a table walks the floor once, past a few vendors, and comes back.
            var floorVisits = 0
            while session.phase != .summary, steps < 80 {
                steps += 1
                if let v = session.current {
                    // Deal checks (docs/30-haggling-and-deal-reputation.md): each one that breaks prints SOAK DEALS FAIL.
                    dealSeen += 1
                    let angry = session.angryWalks
                    var fairMove = false
                    // Reputation before the move. A level-up with a contact also gives reputation, so note the level.
                    let repBefore = store.data.reputation
                    let levelBefore = v.contactID.map { store.level($0).rank }
                    let capLeft = Balance.dealRepDailyCap - (store.data.dealRep.day == store.day ? store.data.dealRep.points : 0)
                    let naive = v.naive
                    switch v.intent {
                    case .buy:
                        let market = session.marketTotal(v)
                        if let item = v.item, let extra = v.extra {
                            dealBundles += 1
                            switch dealBundles % 3 {
                            case 0: session.accept()
                            case 1: session.counter(market * 1.0); fairMove = true
                            default: session.finalOffer(market * 0.95); dealFinals += 1
                            }
                            // A theft at the end of the day can take one unsold bundle item, so skip the check then.
                            let ids = ownedIDs()
                            if session.theftLine == nil, ids.contains(item.id) != ids.contains(extra.id) {
                                dealFails.append("a bundle sold one item and not the other")
                            }
                        } else {
                            switch dealSeen % 4 {
                            case 0: session.accept()
                            case 1: session.counter(market * 1.0); fairMove = true
                            case 2: session.finalOffer(market * 0.95); dealFinals += 1
                            default: session.counter(market * 1.4)
                            }
                        }
                    case .trade:
                        if let more = v.binder.first(where: { card in !v.tradeCards.contains { $0.id == card.id } }) {
                            session.toggleTradeCard(more.id)
                            dealBinder += 1
                            if let now = session.current, now.id == v.id, !now.tradeCards.contains(where: { $0.id == more.id }) {
                                dealFails.append("a binder card did not go into the trade")
                            }
                        }
                        let valuation = [60.0, 80, 90, 100][dealSeen % 4]
                        session.proposeTrade(valuing: valuation)
                        fairMove = valuation >= Balance.fairTradeMin
                    case .sell:
                        // Offer the table item whose 110% value fits the seller best, so some offers succeed.
                        if dealSeen % 2 == 0, session.hasTable,
                           let item = session.table.min(by: { abs($0.market * Balance.tradeInstead - v.goodsMarket) < abs($1.market * Balance.tradeInstead - v.goodsMarket) }) {
                            let tradesBefore = session.trades.count
                            let before = ownedIDs()
                            session.offerTradeForGoods(item.id)
                            if session.trades.count > tradesBefore {
                                dealInstead += 1
                                // The trade can end the day, and the theft roll at the end can take one more table item.
                                let gone = before.subtracting(ownedIDs())
                                let theft = session.theftLine != nil ? 1 : 0
                                if !gone.contains(item.id) || gone.count > 1 + theft {
                                    dealFails.append("a trade instead of cash moved \(gone.count) items (theft \(theft)), and the table item \(gone.contains(item.id) ? "left" : "stayed")")
                                } else if gone.count > 1 { dealTheftAfter += 1 }
                            }
                        } else if session.canPayCredit, Bool.random() { session.acceptWithCredit() }
                        else if v.naive { session.payFair() }
                        else if dealSeen % 3 == 0 { session.counter(v.goodsMarket * 0.75); fairMove = true }
                        else { session.counter(v.goodsMarket * 0.6) }
                    }
                    if fairMove {
                        dealFairMoves += 1
                        if session.angryWalks > angry { dealFails.append("someone walked away after a fair \(v.intent == .trade ? "trade" : "counter")") }
                        if let now = session.current, now.id == v.id, now.patience != v.patience { dealFails.append("a fair counter used patience") }
                    }
                    // One move can give at most what is left under the cap. Paying a naive seller fair (+5) and a contact
                    // level-up are their own rules, so the soak skips those moves.
                    let gained = store.data.reputation - repBefore
                    let levelAfter = v.contactID.map { store.level($0).rank }
                    if !naive, levelAfter == levelBefore, gained > max(0, capLeft) {
                        dealFails.append("a deal gave \(gained) reputation with \(capLeft) left under the cap")
                    }
                    if gained > 0 { dealRepSeen += 1 }
                    // 9b: each story in the queue comes out 1 to 10 days from now.
                    if store.data.dealStories.contains(where: { $0.day <= store.day || $0.day > store.day + Balance.storyDelay.upperBound }) {
                        dealFails.append("a story is due outside 1 to 10 days")
                    }
                } else if session.phase == .table {
                    if session.hasTable, floorVisits == 0, steps > 3 { session.walkFloor() } else { session.nextVisitor() }
                } else if session.phase == .floor {
                    if session.hasTable, floorVisits >= 4 {
                        session.backToTable()
                    } else if let vendor = session.vendors.first(where: { !$0.visited }) {
                        floorVisits += 1
                        // The grading booth: a card outside the load must stay raw. Grade one card from the load.
                        if session.venue.limitsLoad, session.hasGradingBooth, !boothTested {
                            boothTested = true
                            if let card = outsideCard(session) {
                                session.gradeOnSite(card.id)
                                packBoothNo += 1
                                if !store.data.raw.contains(where: { $0.id == card.id }) { packFails.append("the booth graded a card that was not in the load") }
                            }
                            if let card = session.gradableCards.first, store.canAfford(Balance.onSiteGradingFee) {
                                session.gradeOnSite(card.id)
                                packGraded += 1
                            }
                        }
                        session.visit(vendor)
                        if let item = vendor.items.first(where: { $0.price < 60 }) { session.buy(item, from: vendor) }
                        // A trade: the two best brought items for the dearest items that they pay for.
                        if vendor.kind.trades, let now = session.vendors.first(where: { $0.id == vendor.id }) {
                            // A vendor must turn down an item that is not in the load.
                            if session.venue.limitsLoad, let card = outsideCard(session), let theirs = now.items.first {
                                packVendorNo += 1
                                if session.tradeQuote(give: [card.id], get: [theirs.id], at: now).problem == nil {
                                    packFails.append("a vendor took a trade item that was not in the load")
                                }
                            }
                            let give = session.tradeStock.filter { $0.market >= Balance.tradeMinItem }.prefix(2)
                            let worth = give.reduce(0) { $0 + session.tradeValue($1, at: now) }
                            let goods = now.items.filter { if case .mystery = $0.goods { return false }; return true }.sorted { $0.price > $1.price }
                            var want: [VendorItem] = []
                            for item in goods where want.reduce(0, { $0 + $1.price }) + item.price <= worth { want.append(item) }
                            if want.isEmpty, let cheapest = goods.last { want = [cheapest] }
                            session.proposeVendorTrade(give: Set(give.map(\.id)), get: Set(want.map(\.id)), at: now)
                        }
                        session.closeVendor()
                    } else {
                        session.packUp()
                    }
                } else {
                    break
                }
            }
            dealPolite += session.politePasses
            dealRepTotal += session.dealRep
            packFound += session.foundNothing
            packStale += session.stalePassed
            if session.venue.limitsLoad {
                checkLoad(session, "end")
                let gone = before.subtracting(stockIDs())
                packGone += gone.count
                if !gone.isSubset(of: load) { packFails.append("\(gone.subtracting(load).count) items left the stock at \(session.venue.name) from outside the load") }
            }
            if session.passedBy.count != session.foundNothing + session.stalePassed { packFails.append("the passed list does not match the counts") }
            store.finishEncounter(session)
            log.append("Encounter \(session.venue.name): \(session.sold.count) sold, \(session.bought.count) bought, \(session.trades.count) traded, \(session.foundNothing) found nothing, \(session.stalePassed) stale")
        }
        for _ in 0..<days {
            // The store: open on day 3, stock it every few days, work the counter, buy fixtures, and close near the end.
            // A one-period lease: an early close with a buyout, a second lease, and a renewal.
            if store.day == 3 { store.testOpenCardStore(.stripMall, term: 1); store.setClerk(true) }
            if store.day == 15 { store.closeStore() }
            if store.day == 18, store.cardStore == nil { store.testOpenCardStore(.stripMall, term: 1); store.setClerk(true) }
            if store.cardStore != nil {
                if store.day % 3 == 0 {
                    let pick = store.stockable
                    store.stockStore(Set(pick.cards.prefix(6).map(\.id) + pick.sealed.prefix(4).map(\.id)))
                }
                if store.day % 4 == 2, let s = store.startCounter() { play(s) }
                if store.day == 4 { store.setBuylist(rate: 0.5, budget: 250, offerCredit: true) }
                if store.day == 14 { store.setBuylist(rate: 0.6, budget: 100, offerCredit: false) }
                if store.day == 18 { store.setBuylist(rate: 0, budget: 250, offerCredit: false) }
                if store.day % 4 == 1 { store.moveBulkToBox(Set(store.movableBulk.prefix(3).map(\.id))) }
                if store.day == 16 { store.takeBulkBack() }
                // Prices and online listings: set each price, price a slab, list stock online, and remove a listing.
                if store.day % 5 == 1 {
                    store.setSinglesPrice(Balance.storePrices.randomElement() ?? 1)
                    store.setSealedPrice(Balance.storeSealedPrices.randomElement() ?? 1)
                    if let slab = store.storeStock.cards.first(where: { $0.grade != nil }) {
                        store.setSlabPrice(slab.id, Bool.random() ? Balance.storeSlabPrices.randomElement() : nil)
                    }
                }
                if store.day % 2 == 0 {
                    let stock = store.storeStock
                    let free = (stock.cards.filter { $0.onlineListing == nil }.prefix(3).map(\.id)
                        + stock.sealed.filter { $0.onlineListing == nil }.prefix(2).map(\.id))
                    let ids = Set(free)
                    let auction = Bool.random()
                    store.listOnline(ids, channel: auction ? .ebayAuction : .ebay, price: { _ in 5 },
                                     auctionDays: auction ? 3 : nil, insured: false)
                }
                if store.day % 7 == 0, let id = store.storeStock.sealed.first(where: { $0.onlineListing != nil })?.id {
                    store.removeOnlineListing(id)
                }
                if store.day == 10 { store.buyFixture(.playTables) }
                // The events: the tournament is on by default. Turn the league on, then change the fees and the league day.
                if store.day == 11 { store.setEvent(.league, on: true) }
                if store.day == 14 { store.setEventFee(.tournament, 15); store.setEventFee(.league, 2) }
                if store.day == 17 { store.setLeagueDay(6) }
                if store.day == 20 { store.setEvent(.tournament, on: false) }
                if store.day == 22 { store.setEvent(.tournament, on: true) }
                if store.day % 7 == 3, let id = store.storeStock.sealed.first(where: { $0.packs == 1 })?.id { store.takeBackFromStore([id]) }
                if store.day == 12 { store.toggleOpenDay(1) }
                if store.day % 9 == 0, let id = store.storeStock.cards.first?.id { store.takeBackFromStore([id]) }
                if store.day == days - 4 { store.closeStore() }
            }
            // Debt: a line with overdraft, both loans, a payday loan, and the pawn shop. A low score on day 40 tests the
            // misses, and a cash drain on day 44 sends a debt to collections.
            if store.day == 1 { store.openLine(); store.drawLine(300) }
            if store.day == 2, let offer = store.personalLoanOffer { store.takeLoan(offer, amount: 1_000, periods: 6) }
            if store.day == 5 { store.takePayday(200) }
            if store.day % 10 == 6, let item = store.pawnable.first { _ = store.pawn(item.id) }
            if store.day % 10 == 9, let ticket = store.data.debt.pawns.first { Bool.random() ? store.redeemPawn(ticket.id) : store.extendPawn(ticket.id) }
            if store.day == 20, let loan = store.data.debt.loans.first { store.payLoan(loan.id, amount: 50) }
            if store.day == 25, let line = store.data.debt.line { store.payLine(line.payoff / 2) }
            if store.day == 91 { store.testSetCreditScore(720); store.getSellerPermit() }
            if store.day == 92, let offer = store.businessLoanOffer { store.takeLoan(offer, amount: offer.maxAmount, periods: 12) }
            if store.day == 40 { store.testSetCreditScore(560) }
            if store.day == 44 {
                for i in store.data.debt.loans.indices { store.data.debt.loans[i].missed = Balance.missesToCollections - 1 }
                store.addTestCash(-store.cash + 5)
            }
            if store.day == 26 || store.day == 50 || store.day == 80 { store.addTestCash(9000) }
            // The bigger bins arrive halfway, so the soak plays both sizes.
            if store.day == 30 { for u in [Upgrade.vendorBinder, .slabCase, .foldingCart] { store.buyUpgrade(u) } }
            if store.day == 52, let debt = store.data.debt.collections.first { store.payCollection(debt.id, amount: debt.owed / 2) }
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: Bool.random()) }
            for o in store.activeOpportunities where o.day == store.day {
                if case .encounter(let s) = store.acceptOpportunity(o.id) { play(s) }
            }
            // Book a table for every fourth week's show, so the soak plays tables and bags at shows.
            for show in store.upcomingShows where (show.startDay / 7) % 4 == 0 && store.canBook(show) { store.bookTable(show.id) }
            // On even weeks, the show comes before the park swap. A show takes the rest of the day.
            if (store.day / 7) % 2 == 0, store.canGoToShowToday, let started = store.startShowDay() {
                play(ShowSession(show: started, store: store))
            }
            for kind in store.meetsToday { if let s = store.startMeet(kind) { play(s) } }
            for sale in store.salesToday { if let s = store.startSale(sale) { play(s) } }
            for r in store.restocksNow {
                if store.worksToday { store.callInSick() }
                if let haul = store.camp(r.store) {
                    for item in haul.items { store.buyShelf(item, at: r.store, credit: false) }
                    log.append("Camp \(r.store.rawValue): \(haul.success ? "got in" : "sold out")")
                }
            }
            if let show = store.showToday, store.canGoToShowToday, let started = store.startShowDay() {
                play(ShowSession(show: started, store: store))
                _ = show
            } else if store.day % 5 == 0, let s = store.startStream(hours: 2, itemIDs: store.streamStock.prefix(3).map(\.id), scheduled: false) {
                for _ in 0..<130 { s.tick() }
                if let item = s.items.first { s.startAuction(item, startShare: 0.5) }
                for _ in 0..<20 { s.tick() }
                s.end()
                log.append("Stream: \(s.peakViewers) peak, \(money(s.tips)) tips")
            }
            for m in store.meetupsToday { _ = store.doMeetup(m.id) }
            for o in store.pendingFBOffers { store.acceptFBOffer(o.id) }
            if store.day % 3 == 0, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) {
                store.list([card.id], channel: [.tcgplayer, .ebay, .facebook].randomElement() ?? .ebay, price: { _ in card.realMarket }, auctionDays: nil, insured: false)
            }
            if store.day % 4 == 0, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) { store.authenticate([card.id]) }
            if store.day % 7 == 1, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) { store.consign([card.id], at: .castle, percent: 110) }
            for split in store.openSplits where split.mine == 0 { _ = store.joinSplit(split.id, boxes: 1) }
            if let offer = store.wholesaleOffers.first, store.canAfford(offer.casePrice) { _ = store.buyWholesale(offer, cases: 1) }
            // A store account cannot go over its allocation.
            if store.hasStoreAccount, let offer = store.wholesaleOffers.first {
                if let msg = store.buyWholesale(offer, cases: 99) { log.append("Wholesale 99 cases: \(msg)") }
            }
            if store.data.sealed.contains(where: { $0.status == nil && !$0.keep }) {
                let items = Array(store.data.sealed.filter { $0.status == nil && !$0.keep }.prefix(2))
                let model = RipModel(items: items, store: store)
                model.mode = .sift
                var guardCount = 0
                while model.phase != .done || model.hasNextPack, guardCount < 40 {
                    guardCount += 1
                    if model.phase == .done { model.nextPack() } else { _ = model.sift(); model.resume() }
                }
            }
            if store.data.day % 6 == 0 { store.post(.hotTake, subject: nil, value: 0) }
            if store.day % 9 == 0 { _ = store.apply(min(Job.ladder.count - 1, (store.data.jobIndex ?? 0) + 1)) }
            if store.day % 11 == 0 { store.bookTimeOff(store.day + 2) }
            if store.day % 13 == 5 { _ = store.skipWork() }
            // A late night every 8 days: the hours past 11 PM come out of sleep.
            if store.day % 8 == 3 { store.data.hour = max(store.data.hour, Balance.dayEnd + 2) }
            let due = store.data.dealStories.filter { $0.day <= store.day + 1 }.count
            store.endDay()
            dealStoriesOut += due
            if store.data.dealStories.contains(where: { $0.day < store.day }) { dealFails.append("a story stayed in the queue past its day") }
        }
        print("SOAK STORE: \(store.cardStore?.name ?? "closed"), \(store.lifetimeSales.rounded()) lifetime sales, credit owed \(money(store.storeCreditOwed)), bulk box \(store.cardStore?.source.bulkCards ?? 0)")
        if let plan = store.cardStore?.eventPlan { print("SOAK EVENTS: standing \(plan.standing), afterglow \(plan.afterglowPlayers) on day \(plan.afterglowDay + 1)") }
        let overheadPaid = store.data.ledger.filter { $0.category == .storeOverhead }.reduce(0) { $0 - $1.amount }
        print("SOAK LEASE: end day \(store.cardStore?.lease.map { $0.endDay + 1 } ?? 0), overhead paid \(money(overheadPaid)), castle \(store.shop(.castle).points), top deck \(store.shop(.topDeck).points), distributor \(money(store.distributorSpent))")
        let debt = store.data.debt
        print("SOAK DEBT: score \(store.creditScore), owed \(money(store.totalDebt)), loans \(debt.loans.count), line \(money(debt.line?.payoff ?? 0)), pawns \(debt.pawns.count), collections \(debt.collections.count), interest paid \(money(debt.interestPaid))")
        print("SOAK MARKET: index \(PriceCycle.index()), events \(store.data.marketEvents.count), goals \(store.data.goalsReached.count), storage \(money(store.storageCost))")
        // The records prune when a table opens. Right after a table, none may be older than 21 days.
        if let last = store.data.tableDays.values.flatMap({ $0 }).max(),
           store.data.tableDays.values.contains(where: { $0.contains { $0 < last - Balance.staleDays } }) {
            packFails.append("a stale record is older than 21 days")
        }
        print("SOAK PACK: \(packTables) tables, \(packBags) bags, \(packGraded) graded, checks: \(packRepack) repack, \(packBoothNo) booth, \(packVendorNo) vendor, \(packGone) gone items, \(store.data.shows.filter { !$0.attended.isEmpty }.count) shows, \(packFound) found nothing, \(packStale) stale passes, \(store.data.tableDays.count) records, \(packFails.count) fails")
        for line in packFails.prefix(10) { print("SOAK PACK FAIL:", line) }
        print("SOAK DEALS: \(dealSeen) visitors, \(dealFairMoves) fair moves, \(dealPolite) polite, \(dealFinals) finals, \(dealBundles) bundles, \(dealBinder) binder picks, \(dealInstead) trades instead (\(dealTheftAfter) then a theft), rep +\(dealRepTotal) (\(dealRepSeen) moves checked), \(dealStoriesOut) stories, \(store.data.dealStories.count) queued, \(dealFails.count) fails")
        for line in dealFails.prefix(10) { print("SOAK DEALS FAIL:", line) }
        if let over = store.data.gameOver { print("SOAK GAME OVER:", over) }
        store.saveNow()
        print("SOAK OK: day \(store.day + 1), cash \(money(store.cash)), rep \(store.data.reputation), followers \(store.social.followers), items \(store.data.raw.count + store.data.slabs.count + store.data.sealed.count)")
        for line in log.suffix(12) { print("SOAK", line) }
        for line in store.data.activity.suffix(30) { print("SOAK D\(line.day + 1)", line.text) }
        // The console is a pipe, so stdout is buffered. Push the report out now.
        fflush(stdout)
    }

    /// Screenshot aid: `-demo` rips a pack at launch.
    func runDemo() {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-soak"), i + 1 < args.count, let days = Int(args[i + 1]) {
            soak(days: days)
            return
        }
        // Screenshot aid: `-regular` makes every contact Regular first.
        if args.contains("-regular") { store.testMakeRegular() }
        if let i = args.firstIndex(of: "-route"), i + 1 < args.count {
            switch args[i + 1] {
            case "wallet": nav.path = [.wallet]
            case "loans": nav.path = [.wallet, .loans]
            case "buy": nav.path = [.buy]
            case "amazon": nav.path = [.buy, .store(.amazon)]
            case "ebay": nav.path = [.buy, .store(.ebay)]
            case "shop": nav.path = [.shop(.castle)]
            case "local": nav.path = [.buyLocal]
            case "raw": nav.path = [.inventory(.raw)]
            case "card": nav.path = [.inventory(.raw)] + (store.data.raw.first.map { [.card($0.id)] } ?? [])
            case "slabs": nav.path = [.inventory(.slabs)]
            case "activity": nav.path = [.activity]
            case "calendar": nav.path = [.calendar]
            case "contacts": nav.path = [.contacts]
            case "nextshow": nav.path = [.calendar] + (store.upcomingShows.first(where: { $0.startDay > store.day }).map { [.show($0.id)] } ?? [])
            case "sealed": nav.path = [.inventory(.sealed)]
            case "settings": nav.path = [.settings]
            case "job": nav.path = [.job]
            case "upgrades": nav.path = [.upgrades]
            case "cardstore": nav.path = [.cardStore]
            case "wholesale": store.addReputation(400); nav.path = [.buy, .wholesale]
            case "splits": store.addReputation(400); store.testSplitInvite(); nav.path = [.buy, .caseSplits]
            case "printnews":
                _ = store.announcePrintChange(reprint: false)
                _ = store.announcePrintChange(reprint: true)
                nav.path = [.market]
            case "messages":
                for kind in [MessageKind.wantsYourCard, .lookingFor, .offersCard] {
                    if let m = store.makeMessage(kind: kind) { store.data.messages.append(m) }
                }
                nav.path = [.messages]
            default: break
            }
        }
        // Screenshot aid: `-cardstore` opens a stocked store with a clerk. `-route cardstore` opens its screen.
        if args.contains("-cardstore") {
            store.startRun()
            store.addTestCash(3000)
            store.testOpenCardStore()
            store.setClerk(true)
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 5 }).prefix(8) { store.addTestCard(print) }
            for _ in 0..<6 { store.addTestPack() }
            store.addTestProduct("576482")
            let pick = store.stockable
            store.stockStore(Set(pick.cards.map(\.id) + pick.sealed.map(\.id)))
            if args.contains("-week") {
                for _ in 0..<7 { store.endDay() }
                store.report = nil
            }
        }
        if args.contains("-sim") {
            store.startRun()
            store.addTestCash(2000)
            for offer in Market.offers(for: .reseller, day: 0).prefix(2) { _ = store.buy(offer) }
            let hits = SetLibrary.set("prismatic-evolutions").prints.filter { ($0.market ?? 0) > 20 }.shuffled().prefix(5)
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
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 10 }).prefix(2) { store.addTestCard(print) }
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
            let prints = SetLibrary.set("prismatic-evolutions").prints.filter { ($0.market ?? 0) > 15 }.shuffled()
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
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 1 }).prefix(3) { store.addTestCard(print) }
            store.moveToBulk(Set(store.data.raw.prefix(2).map(\.id)))
            nav.path = [.inventory(.bulk)]
        }
        if args.contains("-stack") {
            store.startRun()
            for _ in 0..<3 { store.addTestPack() }
            store.addTestProduct("576482")
            if let print = SetLibrary.set("prismatic-evolutions").prints.first(where: { ($0.market ?? 0) > 5 }) {
                store.addTestCard(print)
                store.addTestCard(print)
            }
            nav.path = [.inventory(args.contains("raw") ? .raw : .sealed)]
            if args.contains("-autosell"), let pack = store.data.sealed.first(where: { $0.packs == 1 }) {
                nav.path.append(.sealed(pack.id))
            }
        }
        // Screenshot aid: `-show local` or `-show regional` opens a booked show today. `open` opens the table.
        if let i = args.firstIndex(of: "-show"), i + 1 < args.count {
            store.addTestShow(args[i + 1] == "regional" ? .regional : .local)
            if store.showStock.sealed.count < 3 {
                for id in ["593294", "593294", "593355", "593466", "565638"] { store.addTestProduct(id) }
            }
            if let show = store.startShowDay() { nav.showDay = ShowDaySession(show: show) }
        }
        if let i = args.firstIndex(of: "-rip"), i + 1 < args.count {
            store.startRun()
            // `-rip a,b,c` rips several products. `-hitsonly` starts the rip in Hits only.
            let items = args[i + 1].split(separator: ",").compactMap { store.addTestProduct(String($0)) }
            nav.startRip(items, hitsOnly: args.contains("-hitsonly"))
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
        if args.contains("-demo") && !args.contains("-collrip") && !args.contains("-rip") {
            if let i = args.firstIndex(of: "-set"), i + 1 < args.count {
                store.startRun()
                store.addTestPack(slug: args[i + 1])
            }
            if store.data.sealed.filter({ $0.status == nil }).isEmpty { store.addTestPack() }
            nav.startRip(Array(store.data.sealed.filter { $0.status == nil }.prefix(1)))
        }
    }
}
#endif
