import SwiftUI

/// Big-store sites: the weekly Walmart drawing, the drawings of chains at strictness level 3, and the Target.com drop
/// (docs/proposals/sealed-product, Part A 1.4 and 2.6). Every state change comes from a button.
struct ChainSitesView: View {
    @Environment(GameStore.self) private var store
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack {
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if let message { Banner(text: message, color: Theme.cyan) }

                DetailBox(title: "Walmart Collectibles Draw · weekly") {
                    if let offer = store.walmartDrawing {
                        drawingRow(offer, closes: "Entries close Wednesday · results Thursday morning · 1 entry")
                    } else if store.data.day / 7 * 7 + Balance.drawingWeekday < store.day {
                        Text("The next drawing opens Monday.").font(.subheadline).foregroundStyle(Theme.muted)
                    } else {
                        Text("No drawing this week.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }

                let offers = store.chainDrawings
                if !offers.isEmpty {
                    DetailBox(title: "Store drawings") {
                        ForEach(offers) { offer in
                            drawingRow(offer, closes: "\(offer.chain.rawValue) draws on \(GameStore.weekdays[offer.drawDay % 7]) · results the next morning · 1 entry")
                        }
                    }
                }

                DetailBox(title: "Target.com · most drops on Friday") {
                    if let offer = store.targetDrop(day: store.day) {
                        let left = store.targetAttemptsLeft
                        OfferRow(offer: offer, bought: store.data.boughtToday.contains(offer.id), locked: left <= (store.hasUpgrade(.checkoutBot) ? 1 : 0)) {
                            attempt(offer, bot: false)
                        }
                        Text("\(max(0, left)) attempt\(left == 1 ? "" : "s") left today · success \(Int(Balance.targetDropSuccess * 100))%")
                            .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        if store.hasUpgrade(.checkoutBot) {
                            Button("Try with the bot") { attempt(offer, bot: true) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .disabled(left <= 0 || store.data.boughtToday.contains(offer.id))
                            Text("Stores cancel 35% of bot orders, and each use leaves a trace.")
                                .font(.caption2).foregroundStyle(Theme.muted)
                        }
                    } else {
                        Text("No Target.com drop today.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }

                Text("A win waits 2 days for you to pay and claim it. If you do not claim it, it lapses at no cost.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Big-store sites")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func drawingRow(_ offer: DrawingOffer, closes: String) -> some View {
        // An entered drawing shows the product that the player entered, not a fresh read.
        let entered = store.entry(for: offer)
        let product = entered.flatMap { SetLibrary.product($0.productID) } ?? offer.product
        let price = entered?.price ?? offer.price
        return HStack(spacing: 12) {
            ProductImage(url: product.image, setName: product.name)
                .frame(width: 48, height: 66)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 3) {
                Text(product.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                Text("MSRP \(money(price)) · mkt \(money(product.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                Text(closes).font(.caption2).foregroundStyle(Theme.cyan)
            }
            Spacer()
            Button(entered == nil ? "Enter free" : "Entered") { store.enterDrawing(offer) }
                .primaryButton()
                .controlSize(.small)
                .disabled(entered != nil)
        }
    }

    private func attempt(_ offer: StoreOffer, bot: Bool) {
        guard store.canAfford(offer.price) else {
            message = "You need \(money(offer.price)). You have \(money(store.cash))."
            return
        }
        let used = { store.data.retail.targetAttemptDay == store.day ? store.data.retail.targetAttempts : 0 }
        let before = used()
        if store.attemptTargetDrop(offer, bot: bot) {
            message = "You got it! It arrives in \(offer.deliveryDays) days."
        } else if used() > before {
            message = "Missed. The drop sold out before your checkout went through."
        } else {
            message = "You cannot try again now."
        }
    }
}
