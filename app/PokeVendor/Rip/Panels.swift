import SwiftUI

struct StatCell: View {
    let label: String
    let value: String
    var color: Color = Theme.text

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            Text(value)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TopBar: View {
    let model: RipModel
    let onNewPack: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.cardSet.name).font(.headline)
                    Text("Pack \(model.packNumber) · Booster pack")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Button(action: onNewPack) {
                    Label("New pack", systemImage: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
            }
            HStack(spacing: 0) {
                StatCell(label: "Pack value", value: money(model.valueSoFar))
                StatCell(label: "Cost", value: money(model.packCost))
                StatCell(label: "Net", value: signedMoney(model.net), color: model.net >= 0 ? Theme.green : Theme.orange)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }
}

struct CardInfo: View {
    let card: RipCard?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let card {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(card.name).font(.headline).lineLimit(1)
                            if card.isHit {
                                Text("HIT")
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(Theme.green.opacity(0.2))
                                    .foregroundStyle(Theme.green)
                            }
                        }
                        Text(card.subtitle)
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(money(card.market))
                        .font(.system(size: 20, weight: .semibold, design: .monospaced))
                        .foregroundStyle(card.isHit ? Theme.green : Theme.text)
                }
                HStack(spacing: 0) {
                    grade("PSA 10", card.print?.graded.psa10)
                    grade("PSA 9", card.print?.graded.psa9)
                    grade("CGC 10", card.print?.graded.cgc10)
                    grade("CGC 9", card.print?.graded.cgc9)
                }
            } else {
                Text("Tap the card to reveal it.\nHold the stack to peek at the cards.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    private func grade(_ label: String, _ value: Double?) -> some View {
        StatCell(label: label, value: value.map(money) ?? "—", color: value == nil ? Theme.muted : Theme.text)
    }
}

/// The long-press peek: the top strip of every card left in the stack.
struct PeekView: View {
    let cards: [RipCard]
    let size: CGSize

    var body: some View {
        let width = min(size.width * 0.78, 300)
        let fullHeight = width * TableLayout.ratio
        let spacing: CGFloat = 5
        let strip = min(fullHeight * 0.2, size.height * 0.8 / CGFloat(max(cards.count, 1)) - spacing)
        ZStack {
            Color.black.opacity(0.8).ignoresSafeArea()
            VStack(spacing: spacing) {
                Text("PEEK · \(cards.count) CARDS")
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .padding(.bottom, 4)
                ForEach(cards) { card in
                    CardFace(card: card)
                        .frame(width: width, height: fullHeight)
                        .frame(width: width, height: strip, alignment: .top)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 8, topTrailingRadius: 8))
                        .shadow(color: .black.opacity(0.5), radius: 3, y: 2)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

struct SummaryView: View {
    let model: RipModel
    let onAgain: () -> Void
    let onClose: () -> Void

    var body: some View {
        let cards = model.allCards
        let hits = cards.filter(\.isHit).sorted { $0.market > $1.market }
        let bulk = cards.count - hits.count
        VStack(alignment: .leading, spacing: 14) {
            Text("Pack summary").font(.title2.bold())
            HStack(spacing: 0) {
                StatCell(label: "Value", value: money(model.valueSoFar))
                StatCell(label: "Paid", value: money(model.packCost))
                StatCell(label: "Net", value: signedMoney(model.net), color: model.net >= 0 ? Theme.green : Theme.orange)
            }
            Text("HITS · \(hits.count)")
                .font(.system(size: 11, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                ForEach(hits) { card in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(card.name).font(.subheadline.weight(.medium))
                            Text(card.print?.variant ?? "").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(card.market)).font(.subheadline.monospaced())
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                }
            }
            Text("Bulk · \(bulk) cards go to Inventory as one bulk group.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                Button(action: onClose) {
                    Text("See the cards").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button(action: onAgain) {
                    Text("Rip another").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
            }
            .controlSize(.large)
        }
        .padding(20)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
        .padding(16)
    }
}
