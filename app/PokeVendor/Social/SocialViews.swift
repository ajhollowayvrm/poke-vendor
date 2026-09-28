import SwiftUI

/// The social media hub (docs/08-ui-direction.md, Social media hub).
struct SocialHubView: View {
    @Environment(GameStore.self) private var store
    @State private var handle = ""
    @State private var newPost: NewPostRequest?
    @State private var goLive = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if store.hasAccount {
                    header
                    Button {
                        newPost = NewPostRequest(type: nil, subject: nil)
                    } label: {
                        Label("New post", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
                    .controlSize(.large)
                    Button { goLive = true } label: {
                        Label(store.streamToday == nil ? "Go live" : "Your scheduled stream", systemImage: "dot.radiowaves.left.and.right").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .controlSize(.large)
                    inbox
                    if !store.saleTips.isEmpty { tips }
                    if !store.social.analytics { analyticsOffer }
                    recentPosts
                } else {
                    createAccount
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(store.social.handle ?? "Social media")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $newPost) { NewPostSheet(request: $0) }
        .sheet(isPresented: $goLive) { StreamSetupView(plan: store.streamToday) }
    }

    private var createAccount: some View {
        DetailBox(title: "Start an account") {
            Text("Social media is optional. Posting is free, and a stream costs time. Followers bring sponsors, tips, and buyers.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
            TextField("Handle", text: $handle)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(10)
                .background(Theme.background)
                .overlay(Rectangle().stroke(Theme.line))
            Button("Create account") { store.createAccount(handle) }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .disabled(handle.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private var header: some View {
        let s = store.social
        let tier = store.followerTier
        return DetailBox(title: "Followers") {
            HStack(alignment: .firstTextBaseline) {
                Text(s.followers.formatted()).font(.system(size: 30, weight: .semibold, design: .monospaced))
                Spacer()
                Text("Tier \(tier)").font(.headline).foregroundStyle(Theme.cyan)
            }
            if tier + 1 < FollowerTier.thresholds.count {
                let next = FollowerTier.thresholds[tier + 1]
                ProgressView(value: Double(s.followers - FollowerTier.thresholds[tier]),
                             total: Double(next - FollowerTier.thresholds[tier]))
                    .tint(Theme.cyan)
                Text("Next at \(next.formatted()): \(FollowerTier.unlocks[tier + 1])").font(.caption).foregroundStyle(Theme.muted)
            }
            if s.analytics {
                meter("Burnout", s.burnout, bad: true)
                meter("Authenticity", s.authenticity, bad: false)
            }
        }
    }

    private func meter(_ label: String, _ value: Double, bad: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.caption)
                Spacer()
                Text("\(Int(value * 100))%").font(.caption.monospaced())
            }
            ProgressView(value: value).tint(bad ? Theme.orange : Theme.green)
        }
    }

    @ViewBuilder private var inbox: some View {
        let offers = store.social.offers
        DetailBox(title: "Inbox") {
            if offers.isEmpty {
                Text(store.followerTier >= 1 ? "No offers right now." : "Sponsor offers start at 1,000 followers.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            ForEach(offers) { offer in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(offer.brand).font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(money(offer.pay)).font(.subheadline.monospaced()).foregroundStyle(Theme.green)
                    }
                    if offer.accepted, let end = offer.deadlineDay {
                        Text("\(offer.postsDone) of \(offer.posts) paid posts · due day \(end + 1)").font(.caption.monospaced())
                        Button("Make a paid post") { newPost = NewPostRequest(type: .sponsored, subject: nil) }
                            .buttonStyle(.bordered)
                    } else {
                        Text("\(offer.posts) paid post\(offer.posts == 1 ? "" : "s") in \(offer.days) days · a missed deadline costs authenticity")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                        HStack {
                            Button("Accept") { store.acceptOffer(offer.id) }
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
                                .disabled(store.activeDeal != nil)
                            Button("Decline") { store.declineOffer(offer.id) }.buttonStyle(.bordered)
                        }
                        .controlSize(.small)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    /// Hidden garage sales that followers tipped (docs/17-calendar-and-events.md, Hidden garage sales).
    private var tips: some View {
        DetailBox(title: "Follower tips") {
            ForEach(store.saleTips) { sale in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Garage sale · \(sale.address)").font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(sale.startDay == store.day ? "Today" : sale.startDay == store.day + 1 ? "Tomorrow" : GameStore.weekdays[sale.startDay % 7])
                            .font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                    }
                    Text("“\(sale.hint).” \(sale.hoursText)\(sale.far ? " · far" : "")").font(.caption).foregroundStyle(Theme.muted)
                    HStack {
                        Button("Add to calendar") { store.answerTip(sale.id, add: true) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                        Button("Ignore") { store.answerTip(sale.id, add: false) }.buttonStyle(.bordered)
                    }
                    .controlSize(.small)
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var analyticsOffer: some View {
        DetailBox(title: "Analytics upgrade") {
            Text("See the likes and the reach factors of each post, plus burnout and authenticity meters. Without it, you only see falling reach.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            Button("Buy · \(money(Balance.analyticsUpgradeCost))") { store.buyAnalytics() }
                .buttonStyle(.bordered)
                .disabled(!store.canAfford(Balance.analyticsUpgradeCost))
        }
    }

    private var recentPosts: some View {
        DetailBox(title: "Recent posts") {
            if store.social.posts.isEmpty {
                Text("No posts yet.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(store.social.posts.reversed()) { post in
                PostRow(post: post, analytics: store.social.analytics)
            }
        }
    }
}

struct PostRow: View {
    let post: SocialPost
    let analytics: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(post.type.rawValue).font(.subheadline.weight(.medium))
                if let subject = post.subject { Text(subject).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1) }
                Spacer()
                Text("day \(post.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            HStack(spacing: 12) {
                Text("\(post.views.formatted()) views").font(.caption.monospaced())
                Text("\(post.followerChange >= 0 ? "+" : "")\(post.followerChange) followers")
                    .font(.caption.monospaced())
                    .foregroundStyle(post.followerChange >= 0 ? Theme.green : Theme.orange)
                if analytics { Text("\(post.likes.formatted()) likes").font(.caption.monospaced()) }
                switch post.sale {
                case .sold(let price): Tag(text: "SOLD \(money(price))", color: Theme.green)
                case .noSale: Tag(text: "NO SALE", color: Theme.muted)
                case .open(_, let price): Tag(text: "FOR SALE \(money(price))", color: Theme.orange)
                case nil: EmptyView()
                }
            }
            if analytics {
                Text(String(format: "Quality %.1f · timing %.1f · luck %.1f", post.quality, post.timing, post.luck))
                    .font(.caption2.monospaced())
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewPostRequest: Identifiable {
    let id = UUID()
    let type: PostType?
    let subject: PostSubject?
}

struct PostSubject: Identifiable, Hashable {
    let id: UUID
    let name: String
    let value: Double
    let isCard: Bool
    let pulled: Bool
    let free: Bool
    let image: String?
}

/// New post: pick a type, then an item, then confirm (docs/08-ui-direction.md, Social media hub).
struct NewPostSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let request: NewPostRequest
    @State private var type: PostType?
    @State private var subject: PostSubject?
    @State private var percent: Double = 100
    @State private var result: SocialPost?

    init(request: NewPostRequest) {
        self.request = request
        _type = State(initialValue: request.type)
        _subject = State(initialValue: request.subject)
    }

    /// Shows the player can promote: coming up, and not over (docs/20-card-shows.md, the show promo).
    private var shows: [CardShow] { store.upcomingShows.filter { $0.promoted != true } }
    @State private var show: CardShow?

    private var subjects: [PostSubject] {
        let cards = (store.data.raw + store.data.slabs).map { c in
            PostSubject(id: c.id, name: c.grade.map { "\(c.print.name) \($0.label)" } ?? c.print.name, value: c.market, isCard: true,
                        pulled: c.paid == nil, free: c.status == nil && !c.keep, image: c.print.image)
        }
        let sealed = store.data.sealed.filter { $0.status == nil }.map { s in
            PostSubject(id: s.id, name: s.name, value: store.market(of: s), isCard: false, pulled: false, free: false,
                        image: SetLibrary.product(s.productID, in: s.setSlug)?.image)
        }
        switch type {
        case .pullReveal: return cards.filter(\.pulled).sorted { $0.value > $1.value }
        case .collectionFlex: return (cards + sealed).sorted { $0.value > $1.value }
        case .forSale: return cards.filter(\.free).sorted { $0.value > $1.value }
        default: return []
        }
    }

    private var salePrice: Double { ((subject?.value ?? 0) * percent / 100 * 100).rounded() / 100 }

    var body: some View {
        NavigationStack {
            Form {
                if let result {
                    Section("Posted") {
                        Text("\(result.views.formatted()) views").font(.title2.monospaced())
                        Text("\(result.followerChange >= 0 ? "+" : "")\(result.followerChange) followers")
                            .foregroundStyle(result.followerChange >= 0 ? Theme.green : Theme.orange)
                        if result.luck > 5 { Text("It went viral!").foregroundStyle(Theme.cyan) }
                        Button("Done") { dismiss() }
                    }
                } else if type == nil {
                    Section("Type") {
                        ForEach([PostType.pullReveal, .collectionFlex, .hotTake, .forSale], id: \.self) { t in
                            Button(t.rawValue) { type = t }
                        }
                        if !shows.isEmpty {
                            Button(PostType.showPromo.rawValue) { type = .showPromo }
                        }
                        if store.activeDeal != nil {
                            Button(PostType.sponsored.rawValue) { type = .sponsored }
                        }
                    }
                } else if let t = type, t.needsShow, show == nil {
                    Section("Pick a show") {
                        ForEach(shows) { s in
                            Button { show = s } label: {
                                HStack {
                                    Text(s.name).foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(s.startDay == store.day ? "today" : "in \(s.startDay - store.day) day\(s.startDay - store.day == 1 ? "" : "s")")
                                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                } else if let t = type, t.needsItem, subject == nil {
                    Section("Pick an item") {
                        if subjects.isEmpty { Text("You have nothing that fits this post.").foregroundStyle(Theme.muted) }
                        ForEach(subjects) { s in
                            Button { subject = s } label: {
                                HStack {
                                    Text(s.name).foregroundStyle(Theme.text)
                                    Spacer()
                                    Text(money(s.value)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                } else if let t = type {
                    Section("Confirm") {
                        Text(t.rawValue).font(.headline)
                        if let subject { Text(subject.name) }
                        if let show {
                            Text(show.name)
                            Text("More people come to your table at that show. Book a table there to make it count.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        if t == .forSale {
                            HStack {
                                Slider(value: $percent, in: 70...140, step: 1)
                                Text(money(salePrice)).font(.body.monospaced()).frame(width: 90, alignment: .trailing)
                            }
                            Text("No fees, but you pay shipping. With a small audience, nothing sells. The post stays up \(Balance.listingDays) days.")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                        Button("Post") {
                            result = store.post(t, subject: subject?.name ?? show?.name, value: subject?.value ?? 0,
                                                saleCardID: t == .forSale ? subject?.id : nil,
                                                salePrice: t == .forSale ? salePrice : nil, showID: show?.id)
                        }
                    }
                }
            }
            .navigationTitle("New post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(result == nil ? "Cancel" : "Close") { dismiss() } }
            }
        }
    }
}
