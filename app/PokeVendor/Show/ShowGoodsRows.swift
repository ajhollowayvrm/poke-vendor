import SwiftUI

struct GoodsRow: View {
    let item: VendorItem
    let tool: Int
    let canAfford: Bool
    let buy: () -> Void
    let ask: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            GoodsImage(item: item).frame(width: 56, height: 78)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                switch item.goods {
                case .single(let print, let slug, let condition):
                    Text("\(SetLibrary.set(slug).name) · \(print.rarity)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    HStack(spacing: 6) {
                        WearText(wear: condition.wear)
                        Text("·").font(.caption).foregroundStyle(Theme.muted)
                        CutLine(reading: .front(condition.cut, tool: tool))
                    }
                case .slab(_, let slug, let grade):
                    Text("\(SetLibrary.set(slug).name) · \(grade.label)").font(.caption.weight(.semibold)).foregroundStyle(Theme.cyan)
                case .sealed(let product):
                    Text("Sealed · \(product.kind)").font(.caption).foregroundStyle(Theme.muted)
                case .mystery(let pack):
                    Text(pack.detail).font(.caption).foregroundStyle(Theme.muted)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(money(item.price)).font(.subheadline.monospaced().weight(.semibold))
                        .foregroundStyle((item.market ?? .infinity) > item.price ? Theme.green : Theme.text)
                    if let market = item.market {
                        Text("mkt \(money(market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                }
                if item.looksOff { LooksOffLine(sealed: item.isSealed) }
                HStack(spacing: 8) {
                    Button(isMystery ? "Buy and open" : "Buy", action: buy)
                        .primaryButton().tint(Theme.cyan)
                        .disabled(!canAfford)
                    if !isMystery {
                        Button(item.askedForDeal ? "Asked" : "Ask for a deal", action: ask).buttonStyle(.bordered)
                            .disabled(item.askedForDeal)
                    }
                }
                .controlSize(.small)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Theme.surface)
        .framed()
    }

    private var isMystery: Bool {
        if case .mystery = item.goods { return true }
        return false
    }
}

struct GoodsImage: View {
    let item: VendorItem

    var body: some View {
        switch item.goods {
        case .sealed:
            ProductImage(url: item.image, setName: item.name).clipShape(RoundedRectangle(cornerRadius: 3))
        case .mystery(let pack):
            MysteryPackArt(pack: pack)
        case .slab(let print, _, let grade):
            SlabView(image: item.image, name: print.name, grade: grade)
        case .single:
            RemoteCardImage(url: item.image.flatMap(URL.init(string:)), name: "").clipShape(RoundedRectangle(cornerRadius: 3))
        }
    }
}

/// A plain repack: a sealed foil bag with a question mark.
struct MysteryPackArt: View {
    let pack: MysteryPack

    var body: some View {
        let colors: [Color] = switch pack.tier {
        case .modern: [.purple, .blue]
        case .vintage: [Color(red: 0.9, green: 0.6, blue: 0.1), Color(red: 0.6, green: 0.2, blue: 0.1)]
        case .slab: [Color(white: 0.6), Color(white: 0.3)]
        }
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
            Image(systemName: "questionmark").font(.system(size: 26, weight: .black)).foregroundStyle(.white.opacity(0.9))
        }
    }
}

/// Opening a mystery pack: the filler cards turn over one by one, then the hit.
struct MysteryRevealView: View {
    @Environment(\.dismiss) private var dismiss
    let reveal: MysteryReveal
    @State private var shown = 0
    @State private var burst = false

    private var total: Int { reveal.filler.count + 1 }

    var body: some View {
        VStack(spacing: 16) {
            Text(reveal.pack.name).font(.title3.bold()).padding(.top, 36)
            Text("You paid \(money(reveal.price)).").font(.subheadline).foregroundStyle(Theme.muted)
            if !reveal.filler.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(reveal.filler.enumerated()), id: \.offset) { i, print in
                        FlipCard(angle: i < shown ? 0 : 180, front: CardFace(card: RipCard(print: print, energy: nil)), back: CardBack())
                            .aspectRatio(63.0 / 88.0, contentMode: .fit)
                            .frame(width: 64, height: 89)
                    }
                }
                .frame(height: 89)
                .padding(.horizontal, 16)
            }
            FlipCard(angle: shown >= total ? 0 : 180, front: CardFace(card: RipCard(print: reveal.hit.print, energy: nil)), back: CardBack())
                .frame(width: 180, height: 251)
                .shadow(color: .black.opacity(0.5), radius: 12, y: 8)
                // An overlay, so the burst does not take up room in the layout.
                .overlay {
                    if burst {
                        SparkleBurst(tier: reveal.hit.market >= reveal.price ? .big : .small).frame(width: 500, height: 500)
                    }
                }
            if shown >= total {
                VStack(spacing: 4) {
                    Text(reveal.hit.print.name).font(.headline)
                    if let grade = reveal.hit.grade {
                        Text(grade.label).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.cyan)
                    } else {
                        RawLooks(condition: reveal.hit.condition)
                    }
                    Text("Worth \(money(reveal.hit.market))").font(.title3.monospaced().weight(.semibold))
                        .foregroundStyle(reveal.hit.market >= reveal.price ? Theme.green : Theme.orange)
                    Text(reveal.hit.market >= reveal.price ? "A win." : "Most mystery packs lose money.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                .transition(.opacity)
            }
            Spacer()
            Button { dismiss() } label: { Text(shown >= total ? "Done" : "Skip").frame(maxWidth: .infinity) }
                .primaryButton()
                .tint(Theme.cyan)
                .controlSize(.large)
                .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .interactiveDismissDisabled(shown < total)
        .task {
            for i in 0..<total {
                try? await Task.sleep(for: .milliseconds(i == total - 1 ? 900 : 380))
                withAnimation(.easeInOut(duration: 0.45)) { shown = i + 1 }
                Haptics.tap(i == total - 1 ? .heavy : .light)
            }
            try? await Task.sleep(for: .milliseconds(250))
            burst = true
            if reveal.hit.market >= reveal.price { Haptics.hit() }
        }
    }
}
