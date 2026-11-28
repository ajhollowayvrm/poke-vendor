import SwiftUI

/// The Shorts box of the social hub: the running series, the shorts ready to post, and "Start a series"
/// (docs/32-short-form-video.md, Screens).
struct ShortsSection: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var starting = false
    /// The series that "Record today's episode" picks items for.
    @State private var recordFor: SeriesFormat?
    /// The items to rip, held until the picker sheet is gone, so the rip can open.
    @State private var toRip: (items: [SealedItem], format: SeriesFormat)?
    @State private var sponsored = false
    @State private var note: String?
    @State private var ending: ShortSeries?

    var body: some View {
        DetailBox(title: "Shorts") {
            let series = store.shorts.series
            if series.isEmpty {
                Text("Short-form video reaches people through the algorithm. Start a series: each daily episode builds momentum, and the finale can go viral.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            ForEach(series) { s in seriesCard(s) }
            ready
            if store.canSponsorEpisode {
                Toggle("Sponsored episode (\(store.activeDeal?.brand ?? ""))", isOn: $sponsored)
                    .font(.caption)
                    .tint(Theme.cyan)
            }
            if let note { Text(note).font(.caption.monospaced()).foregroundStyle(Theme.cyan) }
            Button { starting = true } label: {
                Label("Start a series", systemImage: "film.stack").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(store.dailySeriesCount >= Balance.maxSeries)
            if store.followerTier < 2 {
                Text("View pay starts at \(Balance.viewPayFollowers.formatted()) followers.").font(.caption2).foregroundStyle(Theme.muted)
            } else if store.shorts.pendingPay >= 0.01 {
                Text("View pay waiting: \(money(store.shorts.pendingPay)). It arrives every \(Balance.viewPayDays) days.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        #if DEBUG
        .onAppear { if ProcessInfo.processInfo.arguments.contains("-recordsheet"), store.series(.pnl) != nil { recordFor = .pnl } }
        #endif
        .sheet(isPresented: $starting) { StartSeriesSheet() }
        .sheet(isPresented: Binding(get: { recordFor != nil }, set: { if !$0 { recordFor = nil } }), onDismiss: startRecordedRip) {
            if let recordFor {
                RecordEpisodeSheet(format: recordFor) { toRip = ($0, recordFor) }
            }
        }
        .confirmationDialog("End \(ending?.name ?? "the series")?", isPresented: Binding(get: { ending != nil }, set: { if !$0 { ending = nil } }),
                            titleVisibility: .visible) {
            Button("End the series", role: .destructive) {
                if let ending { store.endSeries(ending.id) }
                ending = nil
            }
        } message: {
            Text(ending?.format.daily == true ? "A daily series that ends before its finale costs authenticity." : "You can start it again with your next post.")
        }
    }

    private func seriesCard(_ s: ShortSeries) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(s.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer()
                Text("\(s.episodes) ep").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            HStack(spacing: 6) {
                Text("Momentum").font(.caption2).foregroundStyle(Theme.muted)
                ProgressView(value: s.momentum - 1, total: Balance.momentumMax - 1).tint(Theme.cyan)
                Text("×\(String(format: "%.1f", s.momentum))").font(.caption2.monospaced())
            }
            switch s.format {
            case .ripUntil:
                // The target: one card in a filmed rip worth this much at raw market (Model/Shorts.swift, postRipEpisode).
                HStack(spacing: 6) {
                    Text("Best \(money(s.bestValue)) of \(money(s.target))").font(.caption.monospaced())
                        .foregroundStyle(s.bestValue >= s.target * Balance.nearMissShare ? Theme.green : Theme.text)
                    ProgressView(value: min(s.bestValue, s.target), total: max(s.target, 1)).tint(Theme.green)
                }
                Text("\(s.packs) packs · \(money(s.spent)) spent · best \(s.bestName.map { "\($0) \(money(s.bestValue))" } ?? "none yet")")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                Text("The finale is a filmed rip with one card worth \(money(s.target)) or more at its raw market price. A card at \(Int(Balance.nearMissShare * 100))% is a near miss.")
                    .font(.caption2).foregroundStyle(Theme.muted)
                if s.lastEpisodeDay == store.day {
                    Text("Today's episode is up.").font(.caption).foregroundStyle(Theme.green)
                } else {
                    recordButton(.ripUntil)
                }
            case .pnl:
                let value = store.challengeValue(s)
                Text("Day \(store.day - s.startDay + 1) of \(s.dayLimit) · \(money(value)) (\(signedMoney(value - s.start))) · goal \(money(s.goal))")
                    .font(.caption.monospaced())
                    .foregroundStyle(value >= s.start ? Theme.green : Theme.orange)
                Text("Cash \(money(s.cash)) · \(s.items.count) item\(s.items.count == 1 ? "" : "s") in the challenge")
                    .font(.caption2).foregroundStyle(Theme.muted)
                if s.lastEpisodeDay != store.day { recordButton(.pnl) }
                let finale = store.pnlFinaleReady(s)
                let block = store.shortBlock(s, long: finale)
                Button(finale ? "Post the finale" : "Post today's episode without a rip") {
                    report(store.postPnLEpisode(sponsored: sponsored))
                }
                .buttonStyle(.bordered)
                .tint(finale ? Theme.green : Theme.cyan)
                .disabled(block != nil)
                if let block, s.lastEpisodeDay != store.day { Text(block).font(.caption2).foregroundStyle(Theme.muted) }
            case .masterSet:
                if let slug = s.setSlug {
                    let p = store.masterSetProgress(slug)
                    let added = max(0, p.have - (s.lastHave ?? p.have))
                    ProgressView(value: Double(p.have), total: Double(max(1, p.total))).tint(Theme.green)
                    Text("\(p.have) of \(p.total) · binder \(money(p.value))\(added > 0 ? " · +\(added) since the last episode" : "")")
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                let finale = store.masterSetFinaleReady(s)
                let block = store.shortBlock(s, long: finale)
                Button(finale ? "Post the finale" : "Post today's episode") {
                    report(store.postMasterSetEpisode(sponsored: sponsored))
                }
                .buttonStyle(.borderedProminent)
                .tint(finale ? Theme.green : .red)
                .disabled(block != nil)
                if let block, s.lastEpisodeDay != store.day { Text(block).font(.caption2).foregroundStyle(Theme.muted) }
                if s.lastEpisodeDay == store.day { Text("Today's episode is up.").font(.caption).foregroundStyle(Theme.green) }
            case .vlog, .reveal:
                Text("\(s.views.formatted()) views · \(s.followers >= 0 ? "+" : "")\(s.followers) followers")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Button("End series") { ending = s }
                .font(.caption)
                .foregroundStyle(Theme.orange)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    /// Opens the picker: the player chooses sealed product, then the rip records for this series.
    private func recordButton(_ format: SeriesFormat) -> some View {
        Button { recordFor = format } label: {
            Label("Record today's episode", systemImage: "record.circle").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
    }

    /// The picker sheet is gone, so the rip can open. Items join the P&L challenge first.
    private func startRecordedRip() {
        guard let pending = toRip else { return }
        toRip = nil
        store.prepareRecording(pending.items, for: [pending.format])
        nav.startRip(pending.items, recording: [pending.format])
    }

    /// The shorts that the player can post now: today's vlog and the grading reveals.
    @ViewBuilder private var ready: some View {
        if let v = store.shorts.vlog, !v.posted, v.day == store.day {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Vlog: \(v.venue)").font(.subheadline)
                    Text("\(v.deals) deals · \(money(v.volume))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Button("Post") { report(store.postVlog(sponsored: sponsored)) }
                    .buttonStyle(.bordered)
                    .disabled(store.shortBlock(store.series(.vlog), long: true) != nil)
            }
        }
        ForEach(store.openReveals) { r in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Reveal: \(r.cards) \(r.company) slab\(r.cards == 1 ? "" : "s")").font(.subheadline)
                    Text("\(r.tens) ten\(r.tens == 1 ? "" : "s") · best \(r.best ?? "—")").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Button("Post") { report(store.postReveal(r.id, sponsored: sponsored)) }
                    .buttonStyle(.bordered)
                    .disabled(store.shortBlock(store.series(.reveal), long: false) != nil)
            }
        }
    }

    private func report(_ post: SocialPost?) {
        guard let post else {
            note = "The short did not go up."
            return
        }
        sponsored = false
        note = "\(post.views.formatted()) views, \(post.followerChange >= 0 ? "+" : "")\(post.followerChange) followers"
        Haptics.hit()
    }
}

/// Starts a daily series: Rip until I hit, a P&L challenge, or a master set chase.
struct StartSeriesSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var format: SeriesFormat = .ripUntil
    @State private var target = 500.0
    @State private var start = 100.0
    @State private var goal = 5.0
    @State private var days = 30
    @State private var chaseSlug: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Format", selection: $format) {
                    Text(SeriesFormat.ripUntil.label).tag(SeriesFormat.ripUntil)
                    Text(SeriesFormat.pnl.label).tag(SeriesFormat.pnl)
                    Text("Master set").tag(SeriesFormat.masterSet)
                }
                .pickerStyle(.segmented)
                switch format {
                case .ripUntil:
                    Section {
                        Picker("Target", selection: $target) {
                            ForEach(Balance.ripTargets, id: \.self) { Text(money($0)).tag($0) }
                        }
                    } footer: {
                        Text("Each day, film a rip in Normal or Fast mode. The finale is the rip that pulls a card of the target value or more. You can give that card away for big follower and authenticity gains. After \(money(Balance.gamblingSpend)) spent with no hit, some viewers call it gambling.")
                    }
                case .masterSet:
                    Section {
                        let sets = store.chaseableMasterSets
                        if sets.isEmpty {
                            Text("Start a master set first: Inventory, Master sets.").foregroundStyle(Theme.orange)
                        } else {
                            Picker("Set", selection: Binding(get: { chaseSlug ?? sets.first?.slug }, set: { chaseSlug = $0 })) {
                                ForEach(sets) { p in
                                    Text("\(SetLibrary.set(p.slug).name) · \(p.have) of \(p.total)").tag(Optional(p.slug))
                                }
                            }
                        }
                    } footer: {
                        Text("Post one episode a day on the binder. New cards since the last episode make a better episode, and so does a set close to done. The finale is the day the set is complete: a long video that reaches twice as far.")
                    }
                default:
                    Section {
                        Picker("Start", selection: $start) {
                            ForEach(Balance.pnlStarts, id: \.self) { Text(money($0)).tag($0) }
                        }
                        Picker("Goal", selection: $goal) {
                            ForEach(Balance.pnlGoals, id: \.self) { Text("\(Int($0))× · \(money(start * $0))").tag($0) }
                        }
                        Picker("Days", selection: $days) {
                            ForEach(Balance.pnlDayLimits, id: \.self) { Text("\($0) days").tag($0) }
                        }
                    } footer: {
                        Text("The start is a book number. Add items that you buy from today on: Inventory, Select, Challenge. Each one takes its price out of the challenge cash. Sales put the money back. Post one episode a day. Challenge items do not trade.")
                    }
                }
                if let block = store.seriesBlock(format) {
                    Text(block).foregroundStyle(Theme.orange)
                }
                Text("Miss \(Balance.seriesDeadAfter) days in a row and the series dies. Ending it early costs authenticity.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .navigationTitle("Start a series")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        switch format {
                        case .ripUntil: store.startRipSeries(target: target)
                        case .masterSet: if let slug = chaseSlug ?? store.chaseableMasterSets.first?.slug { store.startMasterSetSeries(slug) }
                        default: store.startPnL(start: start, goal: goal, days: days)
                        }
                        dismiss()
                    }
                    .disabled(store.seriesBlock(format) != nil || (format == .masterSet && store.chaseableMasterSets.isEmpty))
                }
            }
        }
    }
}

/// The episode buttons on the last pack's summary of a filmed rip. A Record & Rip rip lists the series it was filmed
/// for, and has a button for each one (docs/32-short-form-video.md, Record & Rip).
struct RipEpisodeButtons: View {
    @Environment(GameStore.self) private var store
    let model: RipModel
    @State private var posted: SocialPost?
    @State private var pnlPosted: SocialPost?

    var body: some View {
        if let rip = model.episode {
            VStack(alignment: .leading, spacing: 6) {
                if !model.recording.isEmpty {
                    Label("Recorded for \(model.recording.map(\.label).joined(separator: " and "))", systemImage: "record.circle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                }
                ripUntil(rip)
                pnl(rip)
            }
        }
    }

    @ViewBuilder private func ripUntil(_ rip: RipEpisode) -> some View {
        if let posted {
            result("Episode up", posted)
        } else if let s = store.series(.ripUntil), store.canFilmRip(mode: model.mode, hitsOnly: model.hitsOnly) {
            let finale = rip.bestValue >= s.target
            let block = store.shortBlock(s, long: finale)
            Button(finale ? "Post the finale: \(rip.bestName) \(money(rip.bestValue))" : "Post episode: \(s.name)") {
                posted = store.postRipEpisode(rip)
            }
            .buttonStyle(.borderedProminent)
            .tint(finale ? Theme.green : Theme.cyan)
            .disabled(block != nil)
            if finale {
                Button("Post the finale and give the card away") { posted = store.postRipEpisode(rip, giveAway: true) }
                    .buttonStyle(.bordered)
                    .disabled(block != nil || rip.hitCardID == nil)
            }
            if let block { Text(block).font(.caption2).foregroundStyle(Theme.muted) }
        }
    }

    /// A rip filmed for the P&L challenge posts today's P&L episode, with the rip in it.
    @ViewBuilder private func pnl(_ rip: RipEpisode) -> some View {
        if let pnlPosted {
            result("P&L episode up", pnlPosted)
        } else if model.recording.contains(.pnl), let s = store.series(.pnl) {
            let finale = store.pnlFinaleReady(s)
            let block = store.shortBlock(s, long: finale)
            Button(finale ? "Post the P&L finale: \(money(store.challengeValue(s)))" : "Post to the challenge: \(s.name)") {
                pnlPosted = store.postPnLEpisode(rip: rip)
            }
            .buttonStyle(.borderedProminent)
            .tint(finale ? Theme.green : Theme.cyan)
            .disabled(block != nil)
            if let block { Text(block).font(.caption2).foregroundStyle(Theme.muted) }
        }
    }

    private func result(_ title: String, _ post: SocialPost) -> some View {
        Text("\(title): \(post.views.formatted()) views, \(post.followerChange >= 0 ? "+" : "")\(post.followerChange) followers")
            .font(.caption.monospaced())
            .foregroundStyle(Theme.cyan)
    }
}
