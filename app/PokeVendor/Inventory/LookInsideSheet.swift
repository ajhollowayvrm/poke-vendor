import SwiftUI

/// Picks up a box and tilts it (docs/12-acquiring-product.md, Look inside a box). The front packs show through the
/// window. The rest are a guess: the box lists them, or it says only "assorted packs" and gives the odds.
struct LookInsideSheet: View {
    let product: Product
    /// The packs of the copy that the player holds, front first (`BoxContents.draw`, `GameStore.packSlugs(of:)`).
    /// Nil when the player cannot hold it, for example online.
    let packs: [String]?
    @Environment(\.dismiss) private var dismiss
    @State private var tilt = CGSize.zero

    private var seen: Int { packs == nil ? 0 : BoxContents.visible(product) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(packs == nil ? "You cannot hold this box from here, so you see only what the listing says."
                         : seen == product.packs ? "Drag to tilt it. You can see every pack."
                         : "Drag to tilt the box. You can see the front \(seen) packs. \(product.isAssorted ? "The rest are a guess." : "The box lists the rest.")")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    boxImage
                    packRow
                    contentsText
                }
                .padding(16)
            }
            .background(Theme.background)
            .navigationTitle(product.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    /// The product photo. A drag tilts it, and it springs back.
    private var boxImage: some View {
        ProductImage(url: product.image, setName: product.name)
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 260)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .rotation3DEffect(.degrees(Double(tilt.width) / 6), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            .rotation3DEffect(.degrees(Double(-tilt.height) / 8), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
            .shadow(color: .black.opacity(0.5), radius: 10, x: -tilt.width / 20, y: 8)
            .frame(maxWidth: .infinity)
            .gesture(
                DragGesture()
                    .onChanged { tilt = CGSize(width: max(-150, min(150, $0.translation.width)),
                                               height: max(-120, min(120, $0.translation.height))) }
                    .onEnded { _ in withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { tilt = .zero } }
            )
    }

    /// One slot for each pack, front first. A pack the player can see shows its art. The rest show a question mark.
    private var packRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PACKS · \(product.packs)").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<product.packs, id: \.self) { i in
                        if i < seen, let packs, packs.indices.contains(i) {
                            PackTile(slug: packs[i]).frame(width: 64)
                        } else {
                            hiddenPack.frame(width: 64)
                        }
                    }
                }
            }
        }
    }

    private var hiddenPack: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.muted.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                .overlay(Text("?").font(.title2.weight(.bold)).foregroundStyle(Theme.muted))
                .aspectRatio(0.6, contentMode: .fit)
            Text("Hidden").font(.system(size: 9)).foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder private var contentsText: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let packs, seen == product.packs {
                // A blister: every pack shows, so there is nothing to guess.
                Text("YOU CAN SEE EVERY PACK").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                let counts = Dictionary(grouping: packs, by: { $0 }).map { ($0.key, $0.value.count) }.sorted { $0.1 > $1.1 }
                ForEach(counts, id: \.0) { slug, n in
                    Text("\(n) \(SetLibrary.set(slug).name) booster pack\(n == 1 ? "" : "s")").font(.subheadline)
                }
            } else if product.isAssorted {
                Text("THE BOX SAYS ASSORTED PACKS").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                if let known = product.known, !known.isEmpty {
                    Text("It names " + known.map { "\($0.packs) \(SetLibrary.set($0.slug).name)" }.joined(separator: " and ") + ".")
                        .font(.subheadline)
                }
                ForEach(Array((product.pools ?? []).enumerated()), id: \.offset) { _, pool in
                    let share = Int((100 / Double(max(1, pool.slugs.count))).rounded())
                    let who = pool.packs == product.packs ? "Each pack is"
                        : pool.packs == 1 ? "The assorted pack is" : "Each of the \(pool.packs) assorted packs is"
                    Text("\(who) one of these, about \(share)% each:")
                        .font(.subheadline)
                    ForEach(pool.slugs, id: \.self) { slug in
                        Text("· \(SetLibrary.set(slug).name)").font(.subheadline.monospaced()).foregroundStyle(Theme.cyan)
                    }
                }
                Text("You find out which packs it holds when you open it.").font(.caption).foregroundStyle(Theme.muted)
            } else {
                Text("THE BOX LISTS ITS PACKS").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                ForEach(product.mix, id: \.self) { mix in
                    Text("\(mix.packs) \(SetLibrary.set(mix.slug).name) booster pack\(mix.packs == 1 ? "" : "s")").font(.subheadline)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A sheet request: the product, and the packs of the copy that the player holds.
struct LookInside: Identifiable {
    let id = UUID()
    let product: Product
    let packs: [String]?
}

extension View {
    /// Opens the look-inside sheet for a box when the player taps this view. Nothing happens for a loose pack.
    /// `packs` runs at the tap, so it reads the copy as it is then.
    func looksInside(_ product: Product?, packs: @escaping () -> [String]?) -> some View {
        modifier(LookInsideTap(product: product, packs: packs))
    }
}

private struct LookInsideTap: ViewModifier {
    let product: Product?
    let packs: () -> [String]?
    @State private var open: LookInside?
    #if DEBUG
    @MainActor static var debugOpened = false
    #endif

    func body(content: Content) -> some View {
        if let product, BoxContents.canLookInside(product) {
            content
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "eye")
                        .font(.system(size: 10, weight: .bold))
                        .padding(3)
                        .background(.black.opacity(0.6), in: Circle())
                        .foregroundStyle(.white)
                        .padding(2)
                        .allowsHitTesting(false)
                }
                .contentShape(Rectangle())
                .onTapGesture { open = LookInside(product: product, packs: packs()) }
                .sheet(item: $open) { LookInsideSheet(product: $0.product, packs: $0.packs) }
                #if DEBUG
                // Screenshot aid: `-lookopen` opens the first sheet without a tap.
                .onAppear {
                    if ProcessInfo.processInfo.arguments.contains("-lookopen"), !LookInsideTap.debugOpened {
                        LookInsideTap.debugOpened = true
                        open = LookInside(product: product, packs: packs())
                    }
                }
                #endif
        } else {
            content
        }
    }
}
