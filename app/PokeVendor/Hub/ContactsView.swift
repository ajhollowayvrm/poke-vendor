import SwiftUI

/// Reputation, the contact book, offers, the people the player knows, and the want list
/// (docs/21-relationships-and-reputation.md).
struct ContactsView: View {
    @Environment(GameStore.self) private var store
    @State private var adding = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                reputationBox
                bookBox
                offersBox
                knownBox
                wantBox
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Contacts")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $adding) { AddWantSheet() }
        .onAppear { store.seedContacts() }
    }

    private var reputationBox: some View {
        let tier = store.reputationTier
        let points = store.data.reputation
        let next = tier + 1 < ReputationTier.thresholds.count ? ReputationTier.thresholds[tier + 1] : nil
        let floor = ReputationTier.thresholds[tier]
        return DetailBox(title: "Reputation") {
            HStack(alignment: .firstTextBaseline) {
                Text(store.reputationName).font(.title2.bold())
                Spacer()
                Text("\(points) pts").font(.subheadline.monospaced())
            }
            if let next {
                ProgressView(value: Double(points - floor), total: Double(next - floor)).tint(Theme.cyan)
                Text("\(next - points) to \(ReputationTier.names[tier + 1])").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Text("Fair deals raise it, and paying fair to a seller who does not know what they have raises it most. Scams that come out, fakes, and missed show days lower it. Strangers read it: they pay a little more, ask a little less, and more sellers come to your table.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder
    private var offersBox: some View {
        let offers = store.pendingOffers
        let held = store.data.saved.filter { $0.accepted }
        if !offers.isEmpty || !held.isEmpty {
            DetailBox(title: "Offers and holds") {
                ForEach(offers) { item in
                    let c = store.contact(item.contactID)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(c?.name ?? "A vendor") can bring a \(item.name) to \(showName(item)) for \(money(item.price)).")
                            .font(.subheadline)
                        Text("mkt \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        HStack(spacing: 8) {
                            Button("Hold it for me") { store.answerOffer(item.id, hold: true) }
                                .buttonStyle(.borderedProminent)
                                .tint(Theme.green)
                                .foregroundStyle(.black)
                            Button("No thanks") { store.answerOffer(item.id, hold: false) }
                                .buttonStyle(.bordered)
                        }
                        .controlSize(.small)
                    }
                    .padding(.vertical, 4)
                }
                ForEach(held) { item in
                    let c = store.contact(item.contactID)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.subheadline)
                            Text(item.showID != nil ? "\(c?.name ?? "A vendor") holds it at \(showName(item))"
                                                    : "\(c?.name ?? "The shop") holds it until day \(item.untilDay + 1)")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(item.price)).font(.subheadline.monospaced())
                    }
                }
                Text("A hold you do not pick up costs the relationship.").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }

    /// The contact book. The player starts with it empty.
    private var bookBox: some View {
        let book = store.bookContacts.sorted { store.points(of: $0) > store.points(of: $1) }
        return VStack(spacing: 0) {
            TitledGroup(title: "Contact book", count: book.count, list: "contacts") {
                if book.isEmpty {
                    Text("Your contact book is empty. Deal fairly with a shop, a vendor, or a regular until they are \(Balance.registerLevel.rawValue), then add them here.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(book) { c in ContactRow(contact: c) }
                Text("\(book.count) of \(store.contactBookSize) spaces used. Only contacts in the book save things for you, hold things, and bring things to shows.\(store.contactBookSize < Balance.contactBookSizes.last ?? 0 ? " An upgrade gives more room." : "")")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    /// People the player dealt with who are not in the book.
    @ViewBuilder
    private var knownBox: some View {
        let known = store.knownContacts.sorted { store.points(of: $0) > store.points(of: $1) }
        if !known.isEmpty {
            VStack(spacing: 0) {
                TitledGroup(title: "People you know", count: known.count, list: "known") {
                    ForEach(known) { c in ContactRow(contact: c) }
                }
            }
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
    }

    private func showName(_ item: SavedItem) -> String {
        item.showID.flatMap { store.show($0)?.name } ?? "the show"
    }

    private var wantBox: some View {
        DetailBox(title: "Want list · \(store.data.wantList.count) of \(Balance.wantListSize)") {
            Text("Contacts in your book at Regular and up look for these and save them for you. They also save things like what you bought from them.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            ForEach(store.data.wantList) { want in
                HStack {
                    Image(systemName: want.sealed ? "shippingbox" : "rectangle.portrait").foregroundStyle(Theme.cyan)
                    Text(want.label).font(.subheadline)
                    Spacer()
                    Button { store.removeWant(want.id) } label: { Image(systemName: "xmark.circle.fill") }
                        .foregroundStyle(Theme.muted)
                }
            }
            Button { adding = true } label: { Label("Add to the want list", systemImage: "plus").frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
                .disabled(store.data.wantList.count >= Balance.wantListSize)
        }
    }
}

private struct ContactRow: View {
    @Environment(GameStore.self) private var store
    let contact: Contact

    var body: some View {
        let points = store.points(of: contact)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: contact.kind.icon).foregroundStyle(Theme.cyan).frame(width: 18)
                Text(contact.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                LevelBadge(level: StandingLevel(points: points))
                Spacer()
                Text("\(points)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            ProgressView(value: Double(points), total: 100).tint(Theme.cyan)
            Text(details).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
            if let memory = contact.memory.first {
                Text("Last: \(memory)").font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
            }
            bookAction
        }
        .padding(12)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    @ViewBuilder
    private var bookAction: some View {
        if contact.inBook {
            Button("Remove from the book", role: .destructive) { store.unregister(contact.id) }
                .buttonStyle(.borderless)
                .font(.caption)
        } else if store.canRegister(contact) {
            Button { store.register(contact.id) } label: { Label("Add to the contact book", systemImage: "plus") }
                .buttonStyle(.borderedProminent)
                .tint(Theme.green)
                .foregroundStyle(.black)
                .controlSize(.small)
        } else {
            let familiar = StandingLevel(points: store.points(of: contact)).rank >= Balance.registerLevel.rank
            Text(familiar ? "Your contact book is full." : "Reach \(Balance.registerLevel.rawValue) to ask for their number.")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
    }

    private var details: String {
        var parts: [String] = []
        if !contact.interests.isEmpty { parts.append("Into " + contact.interests.map(\.label).joined(separator: ", ")) }
        if contact.shop == nil {
            let at = [contact.atLocalShows ? "local" : nil, contact.atRegionalShows ? "regional" : nil].compactMap { $0 }
            if !at.isEmpty { parts.append("At \(at.joined(separator: " and ")) shows") }
        }
        if contact.deals > 0 { parts.append("\(contact.deals) deal\(contact.deals == 1 ? "" : "s")") }
        return parts.joined(separator: " · ")
    }
}

/// Adds a card, cards from a set, or sealed product of a set to the want list.
private struct AddWantSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var cardName = ""
    @State private var setSlug = ""
    @State private var sealed = false

    var body: some View {
        NavigationStack {
            Form {
                Picker("What", selection: $sealed) {
                    Text("Cards").tag(false)
                    Text("Sealed").tag(true)
                }
                .pickerStyle(.segmented)
                if !sealed {
                    TextField("Card name, for example Umbreon", text: $cardName)
                        .textInputAutocapitalization(.words)
                }
                Picker("Set", selection: $setSlug) {
                    Text("Any set").tag("")
                    ForEach(SetLibrary.index.reversed(), id: \.slug) { info in
                        Text("\(info.name) (\(info.year))").tag(info.slug)
                    }
                }
            }
            .navigationTitle("Want list")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.addWant(WantItem(cardName: sealed ? "" : cardName.trimmingCharacters(in: .whitespaces),
                                               setSlug: setSlug.isEmpty ? nil : setSlug, sealed: sealed))
                        dismiss()
                    }
                    .disabled(!sealed && cardName.trimmingCharacters(in: .whitespaces).isEmpty && setSlug.isEmpty)
                }
            }
        }
    }
}
