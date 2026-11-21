import SwiftUI

#if DEBUG
extension HubView {
    /// Screenshot aid: `-demo` rips a pack at launch.
    func runDemo() {
        let args = ProcessInfo.processInfo.arguments
        // Test aid: `-test` runs the game tests (Hub/GameTests.swift).
        if args.contains("-test") {
            GameTests(store: store).run()
            return
        }
        // Balance aid: `-retailsim <days> [honest|flipper]` plays End Day with every hook and prints the retail state
        // each week (Hub/RetailSim.swift). It replaces the save.
        if let i = args.firstIndex(of: "-retailsim") {
            let days = i + 1 < args.count ? Int(args[i + 1]) ?? 365 : 365
            RetailSim(store: store, flipper: args.contains("flipper")).run(days: days)
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
            case "ebay":
                // `-lotupgrades` gives the three eBay lot upgrades (docs/33-collections.md).
                if args.contains("-lotupgrades") {
                    for u in [Upgrade.savedSearch, .sellerResearch, .lotAppraisal] where !store.hasUpgrade(u) { store.data.upgrades.append(u.rawValue) }
                    store.data.ebayLotsDay = -99
                }
                nav.path = [.buy, .store(.ebay)]
            case "shop": nav.path = [.shop(.castle)]
            case "local": nav.path = [.buyLocal]
            case "raw": nav.path = [.inventory(.raw)]
            case "card": nav.path = [.inventory(.raw)] + (store.data.raw.first.map { [.card($0.id)] } ?? [])
            case "slab": nav.path = [.inventory(.slabs)] + (store.data.slabs.first { $0.status == nil }.map { [.card($0.id)] } ?? [])
            case "psabill":
                // A held PSA order, and one still at PSA, in the Grading tab.
                store.startRun()
                for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 5 }).prefix(3) { store.addTestCard(print) }
                let ids = store.data.raw.suffix(3).map(\.id)
                let tiers = Balance.gradingTiers[.psa] ?? []
                if let express = tiers.first(where: { $0.name == "Express" }), let value = tiers.first(where: { $0.name == "Regular" }) {
                    store.submit(Set(ids.prefix(2)), to: .psa, tier: express)
                    for i in store.data.raw.indices {
                        if case .atGrader(let c, let t, _, let id) = store.data.raw[i].status {
                            store.data.raw[i].status = .atGrader(company: c, tier: t, daysLeft: 1, ledgerID: id)
                        }
                    }
                    store.addTestCash(40 - store.cash)
                    store.endDay()
                    store.report = nil
                    store.submit([ids[2]], to: .psa, tier: value)
                }
                nav.path = [.inventory(.grading)]
            case "masterset":
                let slug = store.startedMasterSets.first { !$0.complete }?.slug ?? store.startedMasterSets.first?.slug
                nav.path = [.inventory(.sealed)] + (slug.map { [.masterSet($0)] } ?? [])
            case "sealeditem":
                let item = store.data.sealed.first { $0.status == nil && store.mates(of: $0).count > 1 } ?? store.data.sealed.first
                nav.path = [.inventory(.sealed)] + (item.map { [.sealed($0.id)] } ?? [])
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
            if let start = store.startStoreRun([.castle, .target]) {
                nav.storeRun = StoreRunSession(stops: [.castle, .target], startHour: start)
            }
        }
        // Screenshot aid: `-series` runs both daily series, so a sealed item shows Record & Rip.
        if args.contains("-series") {
            if !store.hasAccount { store.createAccount("ajrips") }
            if store.series(.ripUntil) == nil { store.startRipSeries(target: 500) }
            if store.series(.pnl) == nil { store.startPnL(start: 1_000, goal: 2, days: 30) }
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
        // Screenshot aid: `-browse` opens trade night as a player who only browses. `-browsefloor` opens the binders.
        if args.contains("-browse") || args.contains("-browsefloor") {
            store.startRun()
            while store.weekday != MeetKind.tradeNight.weekday { store.data.day += 1 }
            if let session = store.startMeet(.tradeNight, browse: true) {
                if args.contains("-browsefloor") { session.walkFloor() }
                nav.encounter = EncounterSession(session: session)
            } else {
                print("-browse: trade night is blocked: \(store.meetBlock(.tradeNight) ?? "unknown")")
            }
        }
        // Screenshot aid: `-lookinside <productID>` adds the product and opens its Inventory screen. Tap the box.
        // Balance aid: `-marketsim` prints the market and 5 sample prices every 30 days for 3 years, then quits the check.
        if args.contains("-marketsim") {
            store.startRun()
            let samples: [(String, () -> Double)] = [
                ("Base Charizard", { SetLibrary.set("base-set").prints.first { $0.name == "Charizard" }?.market ?? 0 }),
                ("ES Umbreon VMAX", { SetLibrary.set("evolving-skies").prints.max { ($0.baseMarket ?? 0) < ($1.baseMarket ?? 0) }?.market ?? 0 }),
                ("PRE $3 card", { SetLibrary.set("prismatic-evolutions").prints.first { ($0.baseMarket ?? 0) > 2.5 && ($0.baseMarket ?? 0) < 4 }?.market ?? 0 }),
                ("PRE ETB", { SetLibrary.catalog.first { $0.homeSlug == "prismatic-evolutions" && $0.kind == "Elite Trainer Box" }?.market ?? 0 }),
                ("ES box", { SetLibrary.catalog.first { $0.homeSlug == "evolving-skies" && $0.kind == "Booster box" }?.market ?? 0 }),
            ]
            print("MARKETSIM day regime index " + samples.map(\.0).joined(separator: " | "))
            for day in stride(from: 0, through: 1_095, by: 30) {
                store.data.day = day
                store.syncMarket()
                let r = PriceCycle.regime()?.kind.label ?? "-"
                print("MARKETSIM \(day) \(r) \(String(format: "%.2f", PriceCycle.index())) " + samples.map { String(format: "%.2f", $0.1()) }.joined(separator: " | "))
            }
            fflush(stdout)
        }
        // Screenshot aid: `-recordsheet` opens the social hub with a P&L challenge and the picker for today's episode.
        if args.contains("-recordsheet") {
            store.startRun()
            store.createAccount("ajrips")
            store.startPnL(start: 1_000, goal: 2, days: 30)
            store.startRipSeries(target: 500)
            for _ in 0..<3 { store.addTestPack() }
            store.addTestProduct("565630")
            nav.path = [.social]
        }
        if let i = args.firstIndex(of: "-lookinside"), i + 1 < args.count {
            store.startRun()
            if let item = store.addTestProduct(args[i + 1]) { nav.path = [.sealed(item.id)] }
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
