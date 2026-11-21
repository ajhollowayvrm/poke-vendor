import SwiftUI

// Callouts (docs/35-callouts.md). The views never show the hidden truth of a callout. They write no state while they draw.

/// The sheet needs an identity for the callout that it answers.
struct CalloutReplyTarget: Identifiable {
    let id: UUID
}

/// One open callout: the type, the accuser, the post, the heat, and a Reply button.
struct CalloutCard: View {
    @Environment(GameStore.self) private var store
    let callout: Callout
    var onReply: ((UUID) -> Void)? = nil

    private var heatColor: Color { callout.heat >= 70 ? .red : callout.heat >= 30 ? Theme.orange : Theme.green }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: callout.type.icon).foregroundStyle(Theme.orange)
                Text(callout.type.label).font(.subheadline.weight(.semibold))
                Spacer()
                if callout.receipts { Tag(text: "RECEIPTS", color: Theme.orange) } else { Tag(text: "NO PROOF YET", color: Theme.muted) }
            }
            Text(store.name(of: callout.accuser)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
            Text(callout.text).font(.subheadline)
            ProgressView(value: min(100, max(0, callout.heat)), total: 100)
                .tint(heatColor)
                .animation(.easeOut(duration: 0.4), value: callout.heat)
            Text("Heat \(Int(callout.heat)) · \(callout.reason)").font(.caption).foregroundStyle(Theme.muted)
            if let reply = callout.reply, let day = callout.replyDay {
                Text("\(reply.label) · day \(day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
            }
            if callout.fallFrom == nil, let onReply {
                Button { onReply(callout.id) } label: { Text("Reply").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
            }
        }
        .padding(10)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }
}

/// A record shows while a serious true callout still counts against new contacts.
struct RecordBadge: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let records = store.activeRecords
        if let last = records.max(by: { $0.untilDay < $1.untilDay }) {
            VStack(alignment: .leading, spacing: 4) {
                Tag(text: "BUSTED THREAD · \(max(0, last.untilDay - store.day + 1)) DAYS", color: Theme.orange)
                Text("New contacts start \(Balance.calloutRecordContactCost) points lower for each record.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The open callouts about the player, the player's own callouts, and the last three that ended.
struct CalloutsSection: View {
    @Environment(GameStore.self) private var store
    @State private var reply: CalloutReplyTarget?

    var body: some View {
        let mine = store.openCallouts
        let others = store.data.callouts.open.filter { $0.target != .player }
        let closed = Array(store.data.callouts.closed.suffix(3).reversed())
        DetailBox(title: "Callouts") {
            RecordBadge()
            if mine.isEmpty && others.isEmpty && closed.isEmpty {
                Text("Nobody is talking about you.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(mine) { c in CalloutCard(callout: c) { reply = CalloutReplyTarget(id: $0) } }
            ForEach(others) { c in CalloutCard(callout: c) }
            ForEach(closed) { c in
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.text).font(.caption)
                    if let outcome = c.outcome { Text(outcome).font(.caption).foregroundStyle(Theme.muted) }
                }
            }
        }
        .sheet(item: $reply) { CalloutReplySheet(calloutID: $0.id) }
    }
}

/// The page for callouts. It works with no social account.
struct CalloutsView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                CalloutsSection()
                if store.hasAccount { RivalCalloutBox() }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Callouts")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Four replies. A blocked reply shows why. The text never says whether the claim is true.
struct CalloutReplySheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let calloutID: UUID
    @State private var result: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let c = store.callout(calloutID) {
                        Text(c.text).font(.subheadline)
                        ForEach(CalloutReply.allCases, id: \.self) { reply in
                            row(c, reply)
                        }
                    } else {
                        Text("This callout is over.").foregroundStyle(Theme.muted)
                    }
                    if let result {
                        Text(result).font(.subheadline).foregroundStyle(Theme.cyan)
                            .transition(.opacity)
                    }
                    Button("Done") { dismiss() }.buttonStyle(.bordered)
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Reply")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private func effect(_ c: Callout, _ reply: CalloutReply) -> String {
        switch reply {
        case .silent: "Let it fade. It loses \(Int(Balance.calloutDecay * 100))% of its heat each night."
        case .deny: "Works if the claim is false. If it is true and people find proof, it gets worse."
        case .makeRight:
            c.actKind == .unshippedOrder && !c.sourceSettled && c.sourceID.map(store.ripShipOrderOpen) == true
                ? "Ship it now and pay \(money(store.makeRightCost(c))) for the wait."
                : "Pay \(money(store.makeRightCost(c))). It ends tomorrow, and the damage is smaller."
        case .counter: "Hit back. You gain a few followers, but the heat goes up on both sides."
        }
    }

    private func row(_ c: Callout, _ reply: CalloutReply) -> some View {
        let block = store.replyBlock(c, reply)
        return Button {
            let line = store.replyToCallout(c.id, reply)
            Haptics.tick()
            withAnimation { result = line }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(reply.label).font(.subheadline.weight(.semibold))
                Text(block ?? effect(c, reply)).font(.caption).foregroundStyle(block == nil ? Theme.muted : Theme.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .disabled(block != nil)
    }
}

/// The named rivals, and a button to call each one out. A game shop never shows here.
struct RivalCalloutBox: View {
    @Environment(GameStore.self) private var store
    @State private var target: UUID?
    @State private var message: String?

    var body: some View {
        DetailBox(title: "Call out a rival") {
            ForEach(store.data.rivals.filter { $0.lastSeenDay >= 0 }) { r in
                let block = store.playerCalloutBlock(r.id)
                let proof = store.receipts(against: r.id).count
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(r.name).font(.subheadline.weight(.medium))
                        Text(r.kind == .creator ? "Creator" : "Flipper").font(.caption).foregroundStyle(Theme.muted)
                        Spacer()
                        Text("Proof: \(proof)").font(.caption.monospaced()).foregroundStyle(proof > 0 ? Theme.green : Theme.muted)
                    }
                    Button("Call out") { target = r.id }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(block != nil)
                    if let block { Text(block).font(.caption).foregroundStyle(Theme.muted) }
                }
            }
            if let message { Text(message).font(.caption).foregroundStyle(Theme.cyan) }
        }
        .confirmationDialog("Call out \(target.flatMap { store.rival($0)?.name } ?? "this rival")?",
                            isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
                            titleVisibility: .visible) {
            if let id = target {
                Button("Call out") { message = store.calloutRival(id); target = nil }
            }
            Button("Cancel", role: .cancel) { target = nil }
        } message: {
            if let id = target, store.receipts(against: id).isEmpty {
                Text("You have no proof. The heat lands on you.")
            } else {
                Text("You have proof. You cannot call this rival out again for \(Balance.playerCalloutCooldown) days.")
            }
        }
    }
}
