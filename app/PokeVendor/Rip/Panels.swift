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
    let onSkip: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.cardSet.name).font(.headline)
                    Text("Pack \(model.packIndex + 1) of \(model.queue.count) · \(model.currentPack?.productName ?? "Booster pack")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                if model.phase == .sealed || model.phase == .open {
                    Button("Skip pack", action: onSkip)
                        .font(.subheadline.weight(.semibold))
                        .buttonStyle(.bordered)
                        .tint(Theme.cyan)
                }
                Button(action: onClose) {
                    Label("Done", systemImage: "xmark")
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
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("RAW")
                            .font(.system(size: 10, weight: .semibold))
                            .kerning(0.8)
                            .foregroundStyle(Theme.muted)
                        Text(money(card.market))
                            .font(.system(size: 20, weight: .semibold, design: .monospaced))
                            .foregroundStyle(card.isHit ? Theme.green : Theme.text)
                    }
                }
                if let print = card.print {
                    GradedPricesGrid(print: print)
                } else {
                    GradedPricesGrid(print: nil)
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

}

/// CGC 10 and 9, PSA 10 and 9, and BGS Black Label, 10, and 9.5.
struct GradedPricesGrid: View {
    let print: CardPrint?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            GradeColumn(company: "CGC", rows: [("10", print?.gradedPrice("cgc10")), ("9", print?.gradedPrice("cgc9"))])
            GradeColumn(company: "PSA", rows: [("10", print?.gradedPrice("psa10")), ("9", print?.gradedPrice("psa9"))])
            GradeColumn(company: "BGS", rows: [("BL", print?.blackLabelPrice), ("10", print?.gradedPrice("bgs10")), ("9.5", print?.gradedPrice("bgs9_5"))])
        }
    }
}

/// The graded prices of one grading company.
struct GradeColumn: View {
    let company: String
    let rows: [(String, Double?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(company)
                .font(.system(size: 10, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            ForEach(rows, id: \.0) { grade, price in
                HStack(spacing: 4) {
                    Text(grade)
                        .foregroundStyle(Theme.muted)
                        .frame(width: 30, alignment: .leading)
                    Text(price.map(money) ?? "—")
                        .foregroundStyle(price == nil ? Theme.muted : Theme.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .font(.system(size: 13, design: .monospaced))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The long-press peek: only the very top border of every card left in the stack.
/// The border color and shine tell the player a hit is coming, but not which card.
struct PeekView: View {
    let cards: [RipCard]
    let size: CGSize

    var body: some View {
        let width = min(size.width * 0.86, 340)
        let fullHeight = width * TableLayout.ratio
        let strip = fullHeight * 0.03
        ZStack {
            Color.black.opacity(0.8).ignoresSafeArea()
            VStack(spacing: 10) {
                Text("PEEK · \(cards.count) CARDS")
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .padding(.bottom, 6)
                ForEach(cards) { card in
                    CardFace(card: card)
                        .frame(width: width, height: fullHeight)
                        .frame(width: width, height: strip, alignment: .top)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: width * 0.05, topTrailingRadius: width * 0.05))
                        .shadow(color: .black.opacity(0.5), radius: 2, y: 2)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

struct SummaryView: View {
    let model: RipModel
    let onNext: () -> Void
    let onDone: () -> Void
    let onClose: () -> Void
    @State private var posted: SocialPost?

    var body: some View {
        let cards = model.allCards
        let hits = cards.filter(\.isHit).sorted { $0.market > $1.market }
        let bulk = cards.filter { $0.print != nil && !$0.isHit }.count
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Pack summary").font(.title2.bold())
                Spacer()
                if let special = model.special {
                    Text(special.title)
                        .font(.caption.weight(.black))
                        .kerning(1)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(LinearGradient(colors: special.isGod ? [.pink, .yellow, .cyan, .purple]
                                                   : [Color(red: 1.0, green: 0.84, blue: 0.3), Color(red: 1.0, green: 0.62, blue: 0.2)],
                                                   startPoint: .leading, endPoint: .trailing), in: Capsule())
                }
            }
            HStack(spacing: 0) {
                StatCell(label: "Value", value: money(model.valueSoFar))
                StatCell(label: "Paid", value: money(model.packCost))
                StatCell(label: "Net", value: signedMoney(model.net), color: model.net >= 0 ? Theme.green : Theme.orange)
            }
            if model.queue.count > 1 {
                let ripNet = model.ripValue - model.ripPaid
                HStack(spacing: 0) {
                    StatCell(label: "Rip value", value: money(model.ripValue))
                    StatCell(label: "Rip paid", value: money(model.ripPaid))
                    StatCell(label: "Rip net", value: signedMoney(ripNet), color: ripNet >= 0 ? Theme.green : Theme.orange)
                }
            }
            if !model.packExtras.isEmpty {
                Text("ALSO IN THE BOX · \(model.packExtras.count)")
                    .font(.system(size: 11, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                ForEach(model.packExtras, id: \.self) { promo in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(promo.name).font(.subheadline.weight(.medium))
                            Text("\(promo.rarity) · \(promo.num)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(promo.market ?? 0)).font(.subheadline.monospaced())
                    }
                }
            }
            Text("HITS · \(hits.count)")
                .font(.system(size: 11, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                ForEach(hits) { card in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(card.name).font(.subheadline.weight(.medium))
                                WearText(wear: card.condition.wear)
                            }
                            Text(card.print?.variant ?? "").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            CutLine(reading: .front(card.condition.cut, tool: model.centeringTool))
                        }
                        Spacer()
                        Text(money(card.market)).font(.subheadline.monospaced())
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                }
            }
            Text("Hits go to Raw. Bulk · \(bulk) cards go to the rip's bulk group.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            if model.canPost, let best = hits.first {
                if let posted {
                    Text("Posted: \(posted.views.formatted()) views, \(posted.followerChange >= 0 ? "+" : "")\(posted.followerChange) followers")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.cyan)
                } else {
                    Button("Post this pull: \(best.name)") { posted = model.postPull(best) }
                        .buttonStyle(.bordered)
                }
            }
            HStack(spacing: 10) {
                Button(action: onClose) {
                    Text("See the cards").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button(action: model.hasNextPack ? onNext : onDone) {
                    Text(model.hasNextPack ? "Next pack" : "Done").frame(maxWidth: .infinity)
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

/// The condition of the card in hand, in the column on the left of the stack.
struct ConditionColumn: View {
    let card: RipCard

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            SideHeader(text: "CONDITION")
            WearText(wear: card.condition.wear)
                .multilineTextAlignment(.trailing)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// The cut of the card in hand, front and back, in the column on the right of the stack.
struct CutColumn: View {
    let card: RipCard
    let tool: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            SideHeader(text: "CUT")
            reading(.front(card.condition.cut, tool: tool))
            SideHeader(text: "BACK").padding(.top, 4)
            reading(.back(card.condition.cut, tool: tool))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func reading(_ r: CutReading) -> some View {
        if let words = r.words {
            Text(words).font(.caption)
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text("LR \(r.lr)")
                Text("TB \(r.tb)")
                if r.spread > 0 {
                    Text("±\(r.spread)").foregroundStyle(Theme.muted)
                }
            }
            .font(.caption2.monospaced())
        }
    }
}

private struct SideHeader: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .kerning(0.8)
            .foregroundStyle(Theme.muted)
    }
}
