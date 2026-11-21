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

/// The top bar: the set and the pack count, the product, the money of the pack, and Skip and Done.
/// It stays short, so the card on the table gets the height.
struct TopBar: View {
    let model: RipModel
    let onSkip: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                let sets = Set(model.combinedSlugs ?? []).count
                let pack = model.shownPack.map { "Pack \($0.index + 1) of \($0.count)" } ?? "Pack \(model.packIndex + 1) of \(model.queue.count)"
                Text("\(sets > 1 ? "\(sets) sets" : model.cardSet.name) · \(pack)")
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if !model.recording.isEmpty {
                    // Record & Rip: the camera is on for the whole rip.
                    Label("REC", systemImage: "record.circle.fill")
                        .font(.caption.weight(.bold).monospaced())
                        .foregroundStyle(.red)
                }
                Spacer(minLength: 8)
                if model.phase == .sealed || model.phase == .open {
                    Button(action: onSkip) { Image(systemName: "forward.end.fill") }
                        .accessibilityLabel(model.combinedSlugs == nil ? "Skip pack" : "Skip all")
                }
                Button(action: onClose) { Image(systemName: "xmark") }
                    .accessibilityLabel("Done")
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .tint(Theme.cyan)
            Text(model.shownPack != nil ? "Hits only" : model.currentPack?.productName ?? "Booster pack")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            if let buyer = model.shipBuyer, let price = model.shipPrice { shipChips(buyer: buyer, price: price) }
            HStack(spacing: 14) {
                let net = model.shownValue - model.shownCost
                stat("VALUE", money(model.shownValue), Theme.text)
                stat("COST", money(model.shownCost), Theme.text)
                stat("NET", signedMoney(net), net >= 0 ? Theme.green : Theme.orange)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    /// The buyer meter, the unit tracker of a whole case, and the palm count. The meter is green above the price.
    private func shipChips(buyer: String, price: Double) -> some View {
        let value = model.shipValue
        return VStack(alignment: .leading, spacing: 3) {
            Text("FOR \(buyer.uppercased()) · \(money(value)) of \(money(price))")
                .font(.caption.monospaced().weight(.semibold))
                .foregroundStyle(value >= price ? Theme.green : Theme.muted)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background((value >= price ? Theme.green : Theme.muted).opacity(0.15), in: Capsule())
            if let unit = model.unitProgress {
                Text("Unit \(unit.index) of \(unit.count) · best so far: \(model.bestHit.map { "\($0.name) \(money($0.market))" } ?? "none")")
                    .font(.caption2.monospaced())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            if !model.palmedIDs.isEmpty {
                Text("\(model.palmedIDs.count) card\(model.palmedIDs.count == 1 ? "" : "s") palmed")
                    .font(.caption2.monospaced())
                    .foregroundStyle(Theme.orange)
            }
        }
    }

    private func stat(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(.system(size: 9, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            Text(value).font(.subheadline.monospaced().weight(.semibold)).foregroundStyle(color)
        }
    }
}

/// The card in hand: the name, the raw price, the condition, the cut, and the graded prices. One row shows the three
/// grade-10 prices. A tap on it opens the full grid. With no card, the same rows stay in place under a hint, so the
/// panel keeps its height and the card on the table does not move.
struct CardInfo: View {
    let card: RipCard?
    let tool: Int
    /// A Rip & Ship rip: the buyer's name. Every card ships to the buyer.
    var shipsTo: String?
    /// The card is a big hit in a Rip & Ship rip, so the player can palm it.
    var canPalm = false
    var onPalm: () -> Void = {}
    let hint: String
    @Binding var gradesOpen: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(card?.name ?? " ").font(.headline).lineLimit(1)
                if card?.isHit == true {
                    Text("HIT")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.green.opacity(0.2))
                        .foregroundStyle(Theme.green)
                }
                Spacer(minLength: 8)
                Text("RAW").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                Text(card.map { money($0.market) } ?? " ")
                    .font(.system(size: 20, weight: .semibold, design: .monospaced))
                    .foregroundStyle(card?.isHit == true ? Theme.green : Theme.text)
            }
            HStack(spacing: 8) {
                Text(card?.subtitle ?? " ")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let card, card.print != nil { WearText(wear: card.condition.wear).lineLimit(1) }
            }
            cutLine
            grades
            if let shipsTo { shipRow(shipsTo) }
        }
        .opacity(card == nil ? 0 : 1)
        .overlay {
            if card == nil {
                Text(hint)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .framed()
    }

    /// "Ships to" under the price of every card. A big hit also gets a small, muted palm option: never the main button.
    private func shipRow(_ buyer: String) -> some View {
        HStack {
            Text(card?.print == nil ? " " : "Ships to \(buyer)").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
            Spacer()
            if canPalm {
                Button("Palm it", action: onPalm)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .buttonStyle(.plain)
            }
        }
    }

    /// The front and back cut on one line: words without a tool, or left to right and top to bottom with one.
    private var cutLine: some View {
        let cut = card?.condition.cut
        let front = cut.map { CutReading.front($0, tool: tool) }
        let back = cut.map { CutReading.back($0, tool: tool) }
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            label("CUT")
            Text(front.map(Self.text) ?? " ")
            label("BACK").padding(.leading, 6)
            Text(back.map(Self.text) ?? " ")
            Spacer(minLength: 0)
        }
        .font(.caption2.monospaced())
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .opacity(card?.print == nil ? 0 : 1)
    }

    private static func text(_ r: CutReading) -> String {
        r.words ?? "LR \(r.lr) TB \(r.tb)" + (r.spread > 0 ? " ±\(r.spread)" : "")
    }

    private var grades: some View {
        let print = card?.print
        return Button {
            withAnimation(.easeInOut(duration: 0.25)) { gradesOpen.toggle() }
        } label: {
            HStack(alignment: gradesOpen ? .top : .center, spacing: 10) {
                if gradesOpen {
                    GradedPricesGrid(print: print)
                } else {
                    grade("PSA 10", print?.gradedPrice("psa10"))
                    grade("CGC 10", print?.gradedPrice("cgc10"))
                    grade("BGS 10", print?.gradedPrice("bgs10"))
                    Spacer(minLength: 0)
                }
                Image(systemName: gradesOpen ? "chevron.up" : "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.cyan)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(card == nil)
        .accessibilityLabel(gradesOpen ? "Hide the graded prices" : "Show all graded prices")
    }

    private func grade(_ label: String, _ price: Double?) -> some View {
        HStack(spacing: 4) {
            Text(label).foregroundStyle(Theme.muted)
            Text(price.map(money) ?? "—").foregroundStyle(price == nil ? Theme.muted : Theme.text)
        }
        .font(.system(size: 12, design: .monospaced))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.system(size: 9, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
    }
}

/// CGC Pristine 10, 10, and 9, PSA 10 and 9, and BGS Black Label, 10, and 9.5.
struct GradedPricesGrid: View {
    let print: CardPrint?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            GradeColumn(company: "CGC", rows: [("P10", print?.cgcPristinePrice), ("10", print?.gradedPrice("cgc10")), ("9", print?.gradedPrice("cgc9"))])
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
        let cards = model.everyCard
        let hits = cards.filter(\.isHit).sorted { $0.market > $1.market }
        let bulk = cards.filter { $0.print != nil && !$0.isHit }.count
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(model.combinedSlugs == nil ? "Pack summary" : "Rip summary").font(.title2.bold())
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
            if model.queue.count > 1, model.ripPaid != model.packCost {
                let ripNet = model.ripValue - model.ripPaid
                HStack(spacing: 0) {
                    StatCell(label: "Rip value", value: money(model.ripValue))
                    StatCell(label: "Rip paid", value: money(model.ripPaid))
                    StatCell(label: "Rip net", value: signedMoney(ripNet), color: ripNet >= 0 ? Theme.green : Theme.orange)
                }
            }
            // A long rip holds many hits. The list scrolls, and the buttons stay on the screen. A Hits only rip
            // can hold hundreds, so a long list goes straight to a lazy scroll and is not measured first.
            if hits.count > 12 {
                ScrollView { details(hits: hits, bulk: bulk) }
                    .scrollIndicators(.visible)
            } else {
                ViewThatFits(in: .vertical) {
                    details(hits: hits, bulk: bulk)
                    ScrollView { details(hits: hits, bulk: bulk) }
                        .scrollIndicators(.visible)
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
                .primaryButton()
                .tint(Theme.cyan)
            }
            .controlSize(.large)
        }
        .padding(20)
        .background(Theme.surface)
        .framed()
        .padding(16)
    }

    /// The promos, the hits, the bulk count, and the post button.
    private func details(hits: [RipCard], bulk: Int) -> some View {
        VStack(alignment: .leading, spacing: 14) {
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
            LazyVStack(spacing: 0) {
                ForEach(hits) { card in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(card.name).font(.subheadline.weight(.medium))
                                WearText(wear: card.condition.wear)
                                if model.palmedIDs.contains(card.id) { Tag(text: "PALMED", color: Theme.orange) }
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
            Text(model.shipBuyer.map { "Every card ships to \($0). Bulk · \(bulk) cards." } ?? "Hits go to Raw. Bulk · \(bulk) cards go to the rip's bulk group.")
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
            if model.canPost, model.shipOrderID == nil { RipEpisodeButtons(model: model) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
