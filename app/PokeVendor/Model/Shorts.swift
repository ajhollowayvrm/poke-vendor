import Foundation

// Short-form video (docs/32-short-form-video.md). A short is a post made from something that happened: a rip, a day
// of a P&L challenge, a show visit, or a grading return. Most shorts are episodes of a series. A series builds
// momentum, and it ends with a finale. Views pay a little. Followers bring the real money: sponsors and viewers.

extension Balance {
    /// Editing time, in hours: a normal episode, and a long video (a finale or a vlog). No short after 11 PM.
    static let shortEditHours = 20.0 / 60.0
    static let longEditHours = 45.0 / 60.0
    static let maxSeries = 2
    static let momentumStep = 0.1
    static let momentumMax = 2.0
    static let momentumMissed = 0.15
    static let momentumWeekly = 0.1
    static let seriesDeadAfter = 3
    static let seriesDeadFollowers = 0.01
    static let seriesDeadAuthenticity = 0.05
    static let seriesQuitAuthenticity = 0.05
    static let ripTargets: [Double] = [100, 250, 500, 1_000, 5_000]
    static let nearMissShare = 0.7
    static let nearMissBonus = 0.3
    static let packsBonusStep = 25
    static let packsBonusMax = 0.5
    static let ripFinaleBonus = 0.5
    static let shortGiveawayGainFactor = 3.0
    static let shortGiveawayAuthenticity = 0.10
    static let shortGiveawayReputation = 2
    static let gamblingSpend = 1_000.0
    static let gamblingChance = 0.2
    static let gamblingAuthenticity = 0.03
    static let pnlStarts: [Double] = [50, 100, 500, 1_000]
    static let pnlGoals: [Double] = [2, 5, 10]
    static let pnlDayLimits = [14, 30, 60]
    static let pnlWinBonus = 1.0
    static let revealDays = 7
    static let revealBigBatch = 10
    static let shortBurnout = 0.05
    static let shortBaseReach = 200.0
    static let shortReachPerFollower = 0.25
    static let shortViralChance = 0.04
    static let shortViralRange = 8.0...30.0
    static let finaleReach = 2.0
    static let finaleGain = 2.0
    /// View pay: from 10,000 followers, per 1,000 views, paid every 7 days.
    static let viewPayFollowers = 10_000
    static let viewPayShort = 0.06
    static let viewPayLong = 0.60
    static let viewPayDays = 7
    static let seriesSponsorFactor = 1.5
    static let sponsoredEpisodeAuthenticity = 0.02
    static let streamBoostViews = 5_000
    static let streamBoostDays = 3
    static let streamBoost = 1.10
}

enum SeriesFormat: String, Codable, CaseIterable, Hashable {
    case ripUntil, pnl, vlog, reveal

    var label: String {
        switch self {
        case .ripUntil: "Rip until I hit"
        case .pnl: "P&L challenge"
        case .vlog: "Card show vlogs"
        case .reveal: "Grading reveals"
        }
    }

    /// A daily format expects an episode each day. An event format posts when something happens.
    var daily: Bool { self == .ripUntil || self == .pnl }
}

struct ShortSeries: Codable, Identifiable, Hashable {
    var id = UUID()
    let format: SeriesFormat
    let name: String
    let startDay: Int
    var momentum = 1.0
    var episodes = 0
    var lastEpisodeDay: Int?
    /// Days in a row with no episode, for a daily format.
    var missed = 0
    var views = 0
    var followers = 0
    // Rip until I hit.
    var target = 0.0
    var packs = 0
    var spent = 0.0
    var bestValue = 0.0
    var bestName: String?
    // P&L challenge.
    var start = 0.0
    var goal = 0.0
    var dayLimit = 0
    /// The challenge cash: a book number. The cash stays in the one wallet.
    var cash = 0.0
    var lastValue: Double?
    /// The challenge items: cards, sealed products, and bulk groups, by ID.
    var items: [UUID] = []

    /// The last day of a P&L challenge.
    var lastDay: Int { startDay + dayLimit - 1 }
}

/// A grading submission that came back, for a reveal short.
struct GradingReveal: Codable, Identifiable, Hashable {
    let id: UUID
    let day: Int
    let company: String
    var cards = 0
    var tens = 0
    /// Black Labels and Pristine 10s.
    var special = 0
    /// The market of the cards raw, and as slabs.
    var before = 0.0
    var after = 0.0
    var best: String?
    var bestValue = 0.0
    var posted = false
}

/// A show or meet visit, for a vlog short.
struct ShowVlog: Codable, Hashable {
    let day: Int
    let venue: String
    let deals: Int
    let volume: Double
    let showcase: Bool
    let showcaseSales: Int
    let stashBuys: Int
    var posted = false
}

struct ShortsState: Codable, Hashable {
    var series: [ShortSeries] = []
    /// View pay that waits for the next payout.
    var pendingPay = 0.0
    var lastPayDay = 0
    var reveals: [GradingReveal] = []
    var vlog: ShowVlog?
    /// The next stream before this day gets more viewers.
    var streamBoostUntil: Int?
}

/// What a filmed rip gives a Rip until I hit episode.
struct RipEpisode {
    let packs: Int
    let spent: Double
    let bestValue: Double
    let bestName: String
    /// The card that hit the target: the one a giveaway gives away.
    let hitCardID: UUID?
}

@MainActor
extension GameStore {
    var shorts: ShortsState { data.shorts }

    func series(_ format: SeriesFormat) -> ShortSeries? { data.shorts.series.first { $0.format == format } }

    var dailySeriesCount: Int { data.shorts.series.filter(\.format.daily).count }

    // MARK: Series

    /// Why a new daily series cannot start, or nil when it can.
    func seriesBlock(_ format: SeriesFormat) -> String? {
        if !hasAccount { return "Start a social account first." }
        if series(format) != nil { return "A \(format.label) series is running." }
        if dailySeriesCount >= Balance.maxSeries { return "You run \(Balance.maxSeries) daily series already." }
        return nil
    }

    func startRipSeries(target: Double) {
        guard seriesBlock(.ripUntil) == nil else { return }
        var s = ShortSeries(format: .ripUntil, name: "Rip until I hit \(money(target))", startDay: data.day)
        s.target = target
        data.shorts.series.append(s)
        log("Started a series: \(s.name).")
        save()
    }

    func startPnL(start: Double, goal: Double, days: Int) {
        guard seriesBlock(.pnl) == nil else { return }
        var s = ShortSeries(format: .pnl, name: "\(money(start)) to \(money(start * goal)) in \(days) days", startDay: data.day)
        s.start = start
        s.goal = start * goal
        s.dayLimit = days
        s.cash = start
        data.shorts.series.append(s)
        log("Started a P&L challenge: \(s.name).")
        save()
    }

    /// Ends a series. A daily series that ends before its finale costs authenticity.
    func endSeries(_ id: UUID, quit: Bool = true) {
        guard let s = data.shorts.series.first(where: { $0.id == id }) else { return }
        data.shorts.series.removeAll { $0.id == id }
        if quit, s.format.daily, hasAccount {
            data.social.authenticity = max(0, data.social.authenticity - Balance.seriesQuitAuthenticity)
            log("You ended \(s.name) before the finale. Your followers noticed.")
        }
        save()
    }

    /// The event series for vlogs and reveals start the first time the player posts one.
    private func eventSeries(_ format: SeriesFormat) -> ShortSeries {
        if let s = series(format) { return s }
        let s = ShortSeries(format: format, name: format.label, startDay: data.day)
        data.shorts.series.append(s)
        return s
    }

    // MARK: Posting

    /// Why a short cannot go up now, or nil when it can: an account, an episode a day, and time to edit.
    func shortBlock(_ series: ShortSeries?, long: Bool) -> String? {
        if !hasAccount { return "Start a social account first." }
        if let series, series.lastEpisodeDay == data.day { return "This series has an episode today." }
        let hours = long ? Balance.longEditHours : Balance.shortEditHours
        guard let start = slot(for: hours), start + hours <= Balance.dayEnd else { return "It is too late to edit a video today." }
        return nil
    }

    /// Posts a short. `quality` is the content quality. A long video pays more for each view. A finale reaches 2 times
    /// as far. `gainFactor` raises the follower limit (a giveaway). Returns the post.
    @discardableResult
    private func postShort(seriesID: UUID, subject: String, quality: Double, long: Bool, finale: Bool,
                           gainFactor: Double = 1, sponsored: Bool = false) -> SocialPost? {
        guard let si = data.shorts.series.firstIndex(where: { $0.id == seriesID }),
              shortBlock(data.shorts.series[si], long: long) == nil else { return nil }
        let hours = long ? Balance.longEditHours : Balance.shortEditHours
        guard spendHours(hours) else { return nil }
        var s = data.social
        let today = data.day
        let series = data.shorts.series[si]
        let timing = postTiming
        var luck = exp((Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.5)
        let viral = Double.random(in: 0..<1) < Balance.shortViralChance
        if viral { luck *= Double.random(in: Balance.shortViralRange) }
        let base = Balance.shortBaseReach + Double(s.followers) * Balance.shortReachPerFollower
        let reach = base * quality * series.momentum * timing * luck * (finale ? Balance.finaleReach : 1)
            * (1 - s.burnout * 0.7) * (0.4 + s.authenticity) * productionQuality
        let views = max(1, Int(reach))
        let gainRate = 0.02 * (quality - 0.7) * (0.5 + s.authenticity)
        let postsToday = s.posts.filter { $0.day == today }.count
        let gainLimit = max(Balance.postGainFloor, Double(s.followers) * Balance.postGainShare) * (viral ? Balance.postViralGain : 1)
            * (finale ? Balance.finaleGain : 1) * gainFactor
        let gain = postsToday >= Balance.postsWithGain ? 0 : min(gainLimit, Double(views) * max(0, gainRate))
        let change = Int(gain.rounded()) - (s.burnout > 0.8 ? Int(Double(s.followers) * 0.01) : 0)
        let likes = Int(Double(views) * Double.random(in: 0.04...0.12) * min(2, quality))
        s.followers = max(0, s.followers + change)
        // A series is planned content, not spam: a short adds less burnout than a post. Two daily series add 0.1 a day,
        // the same as the daily recovery.
        s.burnout = min(1, s.burnout + Balance.shortBurnout)
        s.lastPostDay = today
        let post = SocialPost(day: today, type: .short, subject: subject, views: views, followerChange: change,
                              likes: likes, quality: quality * series.momentum, timing: timing, luck: luck)
        s.posts.append(post)
        data.social = s
        // View pay from 10,000 followers. A long video qualifies for the better rate.
        if data.social.followers >= Balance.viewPayFollowers {
            data.shorts.pendingPay += Double(views) / 1_000 * (long ? Balance.viewPayLong : Balance.viewPayShort)
        }
        if views >= Balance.streamBoostViews { data.shorts.streamBoostUntil = today + Balance.streamBoostDays }
        if sponsored, let i = data.social.offers.firstIndex(where: { $0.accepted }) {
            let offer = data.social.offers[i]
            let perPost = (offer.pay / Double(offer.posts) * 100).rounded() / 100
            addLedger(perPost, .sponsorship, "\(offer.brand) · sponsored episode")
            data.social.offers[i].postsDone += 1
            if data.social.offers[i].postsDone >= offer.posts { data.social.offers.remove(at: i) }
            data.social.authenticity = max(0, data.social.authenticity - Balance.sponsoredEpisodeAuthenticity)
        }
        var updated = data.shorts.series[si]
        updated.episodes += 1
        updated.momentum = min(Balance.momentumMax, updated.momentum + Balance.momentumStep)
        updated.lastEpisodeDay = today
        updated.missed = 0
        updated.views += views
        updated.followers += change
        data.shorts.series[si] = updated
        log("Posted a short: \(subject). \(views.formatted()) views, \(change >= 0 ? "+" : "")\(change) followers.\(viral ? " It went viral." : "")")
        save()
        return post
    }

    /// The sponsor deal can pay for an episode.
    var canSponsorEpisode: Bool { activeDeal != nil }

    // MARK: Rip until I hit

    /// A filmed rip: Normal or Fast mode, not Hits only, while the series runs.
    func canFilmRip(mode: RipMode, hitsOnly: Bool) -> Bool {
        guard let s = series(.ripUntil) else { return false }
        return !hitsOnly && mode != .sift && s.lastEpisodeDay != data.day
    }

    /// Posts a rip as an episode. A card at or above the target makes it the finale. `giveAway` gives the hit away.
    @discardableResult
    func postRipEpisode(_ rip: RipEpisode, giveAway: Bool = false, sponsored: Bool = false) -> SocialPost? {
        guard var s = series(.ripUntil), let si = data.shorts.series.firstIndex(where: { $0.id == s.id }) else { return nil }
        let finale = rip.bestValue >= s.target
        guard shortBlock(s, long: finale) == nil else { return nil }
        s.packs += rip.packs
        s.spent += rip.spent
        if rip.bestValue > s.bestValue {
            s.bestValue = rip.bestValue
            s.bestName = rip.bestName
        }
        data.shorts.series[si] = s
        var quality = Self.contentQuality(type: .pullReveal, value: rip.bestValue)
        if !finale, rip.bestValue >= s.target * Balance.nearMissShare { quality += Balance.nearMissBonus }
        quality += min(Balance.packsBonusMax, Double(s.packs / Balance.packsBonusStep) * 0.1)
        if finale { quality += Balance.ripFinaleBonus + min(0.5, Double(s.packs) / 100) }
        let subject = finale ? "\(s.name): the finale, \(rip.bestName)" : "\(s.name), episode \(s.episodes + 1)"
        let post = postShort(seriesID: s.id, subject: subject, quality: quality, long: finale, finale: finale,
                             gainFactor: giveAway && finale ? Balance.shortGiveawayGainFactor : 1, sponsored: sponsored)
        guard post != nil else { return nil }
        // The gambling backlash: a long series with no hit (docs/32-short-form-video.md).
        if !finale, s.spent >= Balance.gamblingSpend, Double.random(in: 0..<1) < Balance.gamblingChance {
            data.social.authenticity = max(0, data.social.authenticity - Balance.gamblingAuthenticity)
            log("Comments on your rip short say \"this is just gambling\". It cost you authenticity.")
        }
        if finale {
            if giveAway, let id = rip.hitCardID, let card = card(id) {
                data.raw.removeAll { $0.id == id }
                data.slabs.removeAll { $0.id == id }
                data.social.authenticity = min(1, data.social.authenticity + Balance.shortGiveawayAuthenticity)
                addReputation(Balance.shortGiveawayReputation)
                log("You gave the \(card.print.name) (\(money(card.market))) to a viewer. The comments loved it.")
            }
            data.shorts.series.removeAll { $0.id == s.id }
            log("\(s.name) is done: \(s.packs) packs, \(money(s.spent)) spent.")
        }
        save()
        return post
    }

    // MARK: P&L challenge

    /// The value of the challenge: the challenge cash, plus the market of the challenge items in hand.
    func challengeValue(_ s: ShortSeries) -> Double {
        let ids = Set(s.items)
        return s.cash
            + (data.raw + data.slabs).filter { ids.contains($0.id) }.reduce(0) { $0 + $1.market }
            + data.sealed.filter { ids.contains($0.id) }.reduce(0) { $0 + market(of: $1) }
            + data.bulk.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.value }
    }

    func isChallengeItem(_ id: UUID) -> Bool { series(.pnl)?.items.contains(id) == true }

    /// Why an item cannot join the challenge, or nil when it can.
    func challengeBlock(_ id: UUID) -> String? {
        guard let s = series(.pnl) else { return "No P&L challenge runs." }
        if s.items.contains(id) { return "The item is in the challenge." }
        let found: (paid: Double?, day: Int, status: ItemStatus?, aside: Bool)?
        if let c = card(id) { found = (c.paid, c.acquiredDay, c.status, c.setAside) }
        else if let item = data.sealed.first(where: { $0.id == id }) { found = (item.paid, item.acquiredDay, item.status, item.pc) }
        else { found = nil }
        guard let found else { return "The item is not in Inventory." }
        guard let paid = found.paid else { return "A pulled card joins only with its rip." }
        if found.day < s.startDay { return "Only items bought on or after day \(s.startDay + 1) can join." }
        if found.status != nil { return "The item has a status." }
        if found.aside { return "The item is in the PC, a master set, or the showcase." }
        if paid > s.cash + 0.001 { return "The challenge cash is \(money(s.cash))." }
        return nil
    }

    /// Adds items to the challenge. Each one takes its amount paid out of the challenge cash. Returns the count.
    @discardableResult
    func addToChallenge(_ ids: Set<UUID>) -> Int {
        var added = 0
        for id in ids.sorted(by: { $0.uuidString < $1.uuidString }) {
            guard challengeBlock(id) == nil, let i = data.shorts.series.firstIndex(where: { $0.format == .pnl }) else { continue }
            let paid = card(id)?.paid ?? data.sealed.first { $0.id == id }?.paid ?? 0
            data.shorts.series[i].cash -= paid
            data.shorts.series[i].items.append(id)
            added += 1
        }
        if added > 0 { save() }
        return added
    }

    /// New items that come out of a challenge item join the challenge: the cards and the bulk of its rip, and the
    /// loose packs of a broken product.
    func inheritChallenge(from sourceID: UUID, _ newIDs: [UUID]) {
        guard !newIDs.isEmpty, let i = data.shorts.series.firstIndex(where: { $0.format == .pnl && $0.items.contains(sourceID) })
        else { return }
        let have = Set(data.shorts.series[i].items)
        data.shorts.series[i].items += newIDs.filter { !have.contains($0) }
    }

    /// A sale puts its money after fees into the challenge cash, for the share of challenge items. `markets` splits a
    /// lot by the market of each item. Without it, every item counts the same.
    func creditChallenge(_ ids: [UUID], net: Double, markets: [UUID: Double]? = nil) {
        guard !ids.isEmpty, let i = data.shorts.series.firstIndex(where: { $0.format == .pnl }) else { return }
        let inChallenge = Set(data.shorts.series[i].items)
        let mine = ids.filter { inChallenge.contains($0) }
        guard !mine.isEmpty else { return }
        let share: Double
        if let markets {
            let total = ids.reduce(0) { $0 + (markets[$1] ?? 0) }
            share = total > 0 ? mine.reduce(0) { $0 + (markets[$1] ?? 0) } / total : Double(mine.count) / Double(ids.count)
        } else {
            share = Double(mine.count) / Double(ids.count)
        }
        data.shorts.series[i].cash += net * share
        data.shorts.series[i].items.removeAll { mine.contains($0) }
    }

    /// The P&L finale is ready: the goal reached, or the last day.
    func pnlFinaleReady(_ s: ShortSeries) -> Bool { challengeValue(s) >= s.goal - 0.001 || data.day >= s.lastDay }

    @discardableResult
    func postPnLEpisode(sponsored: Bool = false) -> SocialPost? {
        guard let s = series(.pnl), let si = data.shorts.series.firstIndex(where: { $0.id == s.id }) else { return nil }
        let finale = pnlFinaleReady(s)
        guard shortBlock(s, long: finale) == nil else { return nil }
        let value = challengeValue(s)
        let change = abs(value - (s.lastValue ?? s.start)) / max(s.start, 1)
        let pnl = value - s.start
        var quality = 0.6 + min(1.6, change * 3) + (pnl > 0 ? 0.2 : 0)
        let won = value >= s.goal - 0.001
        if finale, won { quality += Balance.pnlWinBonus }
        let day = data.day - s.startDay + 1
        let subject = "\(s.name), day \(day): \(money(value)) (\(signedMoney(pnl)))\(finale ? won ? ", goal reached" : ", the result" : "")"
        data.shorts.series[si].lastValue = value
        let post = postShort(seriesID: s.id, subject: subject, quality: quality, long: finale, finale: finale, sponsored: sponsored)
        if post != nil, finale {
            data.shorts.series.removeAll { $0.id == s.id }
            log("The P&L challenge is over: \(money(s.start)) became \(money(value)).")
            save()
        }
        return post
    }

    // MARK: Show vlogs and grading reveals

    /// Records a visit for a vlog. The player can post it until the end of the day.
    func recordVlog(_ vlog: ShowVlog) {
        guard hasAccount else { return }
        data.shorts.vlog = vlog
    }

    static func vlogQuality(_ v: ShowVlog) -> Double {
        0.5 + min(1.0, Double(v.deals) * 0.08) + min(0.6, log10(v.volume + 1) * 0.2) + (v.showcase ? 0.3 : 0)
            + Double(v.showcaseSales) * 0.3 + min(0.3, Double(v.stashBuys) * 0.1)
    }

    @discardableResult
    func postVlog(sponsored: Bool = false) -> SocialPost? {
        guard let v = data.shorts.vlog, !v.posted, v.day == data.day else { return nil }
        let s = eventSeries(.vlog)
        guard shortBlock(s, long: true) == nil else { return nil }
        let post = postShort(seriesID: s.id, subject: "Card show vlog: \(v.venue)", quality: Self.vlogQuality(v), long: true,
                             finale: false, sponsored: sponsored)
        if post != nil { data.shorts.vlog?.posted = true; save() }
        return post
    }

    /// Adds a returned slab to its submission's reveal.
    func noteGradeReturn(ledgerID: UUID, company: String, card: OwnedCard, before: Double) {
        guard hasAccount else { return }
        var r = data.shorts.reveals.first { $0.id == ledgerID } ?? GradingReveal(id: ledgerID, day: data.day, company: company)
        r.cards += 1
        if card.grade?.grade == 10 { r.tens += 1 }
        if card.grade?.blackLabel == true || card.grade?.pristine == true { r.special += 1 }
        r.before += before
        r.after += card.market
        if card.market > r.bestValue {
            r.bestValue = card.market
            r.best = "\(card.print.name) \(card.grade?.label ?? "")"
        }
        data.shorts.reveals.removeAll { $0.id == ledgerID }
        data.shorts.reveals.append(r)
    }

    var openReveals: [GradingReveal] { data.shorts.reveals.filter { !$0.posted && data.day - $0.day < Balance.revealDays } }

    static func revealQuality(_ r: GradingReveal) -> Double {
        0.5 + min(0.8, Double(r.tens) * 0.2) + Double(r.special) * 0.5 + min(0.6, log10(max(0, r.after - r.before) + 1) * 0.2)
            + (r.cards >= Balance.revealBigBatch ? 0.2 : 0)
    }

    @discardableResult
    func postReveal(_ id: UUID, sponsored: Bool = false) -> SocialPost? {
        guard let r = openReveals.first(where: { $0.id == id }) else { return nil }
        let s = eventSeries(.reveal)
        guard shortBlock(s, long: false) == nil else { return nil }
        let post = postShort(seriesID: s.id, subject: "Grading reveal: \(r.cards) \(r.company) slab\(r.cards == 1 ? "" : "s"), \(r.tens) ten\(r.tens == 1 ? "" : "s")",
                             quality: Self.revealQuality(r), long: false, finale: false, sponsored: sponsored)
        if post != nil, let i = data.shorts.reveals.firstIndex(where: { $0.id == id }) {
            data.shorts.reveals[i].posted = true
            save()
        }
        return post
    }

    // MARK: End Day

    /// Momentum, dead series, and the view payout. Runs at End Day, before the day changes.
    func shortsEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        var kept: [ShortSeries] = []
        for var s in data.shorts.series {
            if s.format.daily {
                // The start day with no episode yet is not a missed day.
                if s.lastEpisodeDay != today && s.startDay != today {
                    s.missed += 1
                    s.momentum = max(1, s.momentum - Balance.momentumMissed)
                }
                if s.missed >= Balance.seriesDeadAfter {
                    if hasAccount {
                        let lost = Int(Double(data.social.followers) * Balance.seriesDeadFollowers)
                        data.social.followers = max(0, data.social.followers - lost)
                        data.social.authenticity = max(0, data.social.authenticity - Balance.seriesDeadAuthenticity)
                    }
                    lines.append("\(s.name) died after \(Balance.seriesDeadAfter) days with no episode. Followers and authenticity dropped.")
                    continue
                }
            } else if let last = s.lastEpisodeDay, today > last, (today - last) % 7 == 0 {
                s.momentum = max(1, s.momentum - Balance.momentumWeekly)
            }
            kept.append(s)
        }
        data.shorts.series = kept
        data.shorts.reveals.removeAll { today - $0.day >= Balance.revealDays }
        if let v = data.shorts.vlog, v.day <= today { data.shorts.vlog = nil }
        if today - data.shorts.lastPayDay >= Balance.viewPayDays {
            data.shorts.lastPayDay = today
            let pay = (data.shorts.pendingPay * 100).rounded() / 100
            if pay >= 0.01 {
                data.shorts.pendingPay = 0
                addLedger(pay, .creatorPayouts, "Creator payouts · short-form views")
                lines.append("Creator payouts: \(money(pay)) for your short-form views.")
            }
        }
        return lines
    }
}

@MainActor
extension ShowSession {
    /// A show or a meet can be a vlog.
    var canVlog: Bool { venue.kind == .show || venue.kind == .meet }

    var vlogInfo: ShowVlog {
        ShowVlog(day: store.day, venue: venue.name, deals: sold.count + bought.count + trades.count, volume: soldTotal + boughtTotal,
                 showcase: showcasePaid, showcaseSales: showcaseSales, stashBuys: stashBuys)
    }

    /// Posts the vlog of this visit from the summary.
    @discardableResult
    func postVlog(sponsored: Bool = false) -> SocialPost? {
        store.recordVlog(vlogInfo)
        let post = store.postVlog(sponsored: sponsored)
        if post != nil { vlogPosted = true }
        return post
    }
}
