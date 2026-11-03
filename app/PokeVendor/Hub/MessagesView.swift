import SwiftUI

/// Direct messages about cards (docs/28-messages-and-encounters.md).
struct MessagesView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let open = store.openMessages
        let earlier = store.data.messages.filter { $0.answered && $0.expiresDay >= store.day - 7 }.sorted { $0.day > $1.day }.prefix(8)
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "Notoriety") {
                    HStack {
                        Text("Reputation \(store.reputationName)\(store.hasAccount ? " · follower tier \(store.followerTier)" : "")")
                            .font(.subheadline)
                        Spacer()
                        Text("\(store.notoriety) / 8").font(.subheadline.monospaced()).foregroundStyle(Theme.cyan)
                    }
                    Text("More people message you as your reputation and your followers grow. They ask about bigger cards and pay more.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                if open.isEmpty {
                    Text("No open messages.").font(.subheadline).foregroundStyle(Theme.muted).padding(.top, 20)
                }
                ForEach(open) { m in
                    MessageCard(message: m)
                }
                if !earlier.isEmpty {
                    DetailBox(title: "Earlier") {
                        ForEach(Array(earlier)) { m in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.sender).font(.subheadline.weight(.medium))
                                Text(m.text).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                                if let reply = m.reply { Text("“\(reply)”").font(.caption.italic()) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Messages")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            for m in open { store.markRead(m.id) }
        }
    }
}

private struct MessageCard: View {
    @Environment(GameStore.self) private var store
    let message: DirectMessage
    @State private var result: String?

    var body: some View {
        let m = message
        let card = store.cardForMessage(m)
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon).foregroundStyle(accent)
                Text(m.sender).font(.subheadline.weight(.semibold))
                Spacer()
                Text(m.expiresDay == store.day ? "Ends today" : "Ends in \(m.expiresDay - store.day) days")
                    .font(.caption.monospaced())
                    .foregroundStyle(m.expiresDay == store.day ? Theme.orange : Theme.muted)
            }
            HStack(alignment: .top, spacing: 12) {
                if let url = (m.product?.image ?? (card?.print ?? m.print)?.image).flatMap(URL.init(string:)) {
                    RemoteCardImage(url: url, name: "", upright: m.product == nil)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 50, height: 70)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("“\(m.text)”").font(.subheadline)
                    if let reply = m.reply { Text("“\(reply)”").font(.subheadline.italic()).foregroundStyle(Theme.cyan) }
                }
            }
            switch m.kind {
            case .wantsYourCard, .lookingFor:
                if let card {
                    Text("Your card: market \(money(card.market))\(card.grade == nil ? " · \(card.condition.wear.rawValue)" : "")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                } else if m.kind == .lookingFor {
                    Text("You do not have one yet. Find it before the message ends.").font(.caption).foregroundStyle(Theme.muted)
                } else {
                    Text("You no longer have the card.").font(.caption).foregroundStyle(Theme.orange)
                }
                HStack(spacing: 8) {
                    Button("Sell · \(money(m.price))") { result = store.acceptMessage(m.id) }
                        .primaryButton()
                        .tint(Theme.green)
                        .disabled(card == nil)
                    let ask = ShowSession.round(m.price * 1.15)
                    Button("Ask \(money(ask))") { result = store.counterMessage(m.id, price: ask) }
                        .buttonStyle(.bordered)
                        .disabled(m.countered || card == nil)
                    Button("No") { store.declineMessage(m.id) }
                        .buttonStyle(.bordered)
                }
                .controlSize(.small)
            case .offersCard:
                let market = m.product?.market ?? m.print.map { p in
                    OwnedCard(print: p, setSlug: m.slug ?? "", acquired: .now, paid: nil, ripID: nil, grade: m.grade).market
                } ?? 0
                Text("Market \(money(market)) · it arrives in \(Balance.messageShipDays) days · no way to check it first")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    Button("Buy · \(money(m.price))") { result = store.acceptMessage(m.id) }
                        .primaryButton()
                        .tint(Theme.cyan)
                        .disabled(!store.canAfford(m.price))
                    Button("No") { store.declineMessage(m.id) }
                        .buttonStyle(.bordered)
                }
                .controlSize(.small)
            }
            if let result, !result.isEmpty { Text(result).font(.caption).foregroundStyle(Theme.cyan) }
        }
        .padding(14)
        .background(Theme.surface)
        .framed()
    }

    private var icon: String {
        switch message.kind {
        case .wantsYourCard: "bubble.left.and.text.bubble.right"
        case .lookingFor: "magnifyingglass"
        case .offersCard: "tag"
        }
    }

    private var accent: Color {
        switch message.kind {
        case .wantsYourCard, .lookingFor: Theme.green
        case .offersCard: Theme.cyan
        }
    }
}
