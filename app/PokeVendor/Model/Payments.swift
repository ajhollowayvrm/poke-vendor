import Foundation

// Payment methods and their fees (docs/23-payment-methods.md).

/// How a buyer pays in person.
enum PaymentMethod: String, Codable, CaseIterable, Hashable {
    case cash
    /// Needs the card reader.
    case card
    /// Venmo or PayPal, Goods and Services: a fee, and the app protects the seller.
    case appGoods
    /// Venmo or PayPal, Friends and Family: no fee, and no protection.
    case appFriends

    var label: String {
        switch self {
        case .cash: "Cash"
        case .card: "Card"
        case .appGoods: "Venmo or PayPal, Goods and Services"
        case .appFriends: "Venmo or PayPal, Friends and Family"
        }
    }

    /// The part of the label that fits in a sentence.
    var phrase: String {
        switch self {
        case .cash: "in cash"
        case .card: "by card"
        case .appGoods: "by app (Goods and Services)"
        case .appFriends: "by app (Friends and Family)"
        }
    }
}

/// The methods that the player accepts. The player sets it before a table, a counter shift, or a meetup.
enum PaymentPolicy: String, Codable, CaseIterable, Hashable {
    case cashOnly, cashAndCard, noFriendsFamily, acceptAll

    var label: String {
        switch self {
        case .cashOnly: "Cash only"
        case .cashAndCard: "Cash and card"
        case .noFriendsFamily: "No Friends and Family"
        case .acceptAll: "Accept everything"
        }
    }

    var detail: String {
        switch self {
        case .cashOnly: "No fees and no scams. Buyers without cash may walk."
        case .cashAndCard: "Cash and card. Card needs the card reader."
        case .noFriendsFamily: "Cash, card, and app payments with Goods and Services. A Friends and Family buyer pays that way or pays cash."
        case .acceptAll: "Every method. Friends and Family has no fee, and it has the most scam risk."
        }
    }

    func accepts(_ method: PaymentMethod) -> Bool {
        switch self {
        case .cashOnly: method == .cash
        case .cashAndCard: method == .cash || method == .card
        case .noFriendsFamily: method != .appFriends
        case .acceptAll: true
        }
    }
}

/// A payment that the sender takes back some days after the sale.
struct PaymentReversal: Codable, Identifiable, Hashable {
    var id = UUID()
    let item: String
    let method: PaymentMethod
    let price: Double
    let dayDue: Int
}

struct PaymentState: Codable, Hashable {
    var policy = PaymentPolicy.noFriendsFamily
    var reversals: [PaymentReversal] = []
}

/// What happened when a buyer tried to pay.
struct PaymentResult {
    var method = PaymentMethod.cash
    var fee = 0.0
    /// The buyer has no way to pay that the player accepts, so the buyer leaves.
    var walked = false
    /// The money never arrives, and the buyer leaves with the item.
    var scam = false
    /// The day when the sender takes the money back.
    var reversalDay: Int?
    /// True when the platform refunds a buyer who finds out the item is fake.
    var refundsFakes = false
    /// What to tell the player.
    var line = ""
}

extension Balance {
    /// The share of buyers who prefer cash, card, and an app.
    static let payMix = [0.55, 0.30, 0.15]
    /// The share of app buyers who ask to pay with Friends and Family.
    static let friendsFamilyAsk = 0.45
    /// The chance that a refused Friends and Family buyer pays with Goods and Services.
    static let friendsFamilyToGoods = 0.70
    /// The chance that a buyer with no accepted method pays cash anyway: a stranger, and a known contact.
    static let cashFallbackStranger = 0.50
    static let cashFallbackContact = 0.80
    /// A card reader takes this share plus a fixed fee. At the player's own store, the store overhead covers it.
    static let readerFeeRate = 0.026
    static let readerFeeFixed = 0.15
    /// Goods and Services takes this share plus a fixed fee.
    static let goodsFeeRate = 0.029
    static let goodsFeeFixed = 0.30
    /// The chance that an app payment is a fake screenshot: the money never arrives.
    static let screenshotScamGoods = 0.02
    static let screenshotScamFriends = 0.08
    /// The chance that an app payment is taken back later.
    static let reversalGoods = 0.03
    static let reversalFriends = 0.05
    /// A known contact has this share of the risk of a stranger.
    static let payContactRiskFactor = 0.25
    /// A reversal comes this many days after the sale.
    static let reversalDays = 3...12
    /// The card reader brings this factor on the clerk's sales at the player's store.
    static let readerClerkSalesBonus = 1.12
    static let cardReaderCost = 80.0
}

@MainActor
extension GameStore {
    var hasCardReader: Bool { hasUpgrade(.cardReader) }

    var paymentPolicy: PaymentPolicy { data.payments.policy }

    func setPaymentPolicy(_ policy: PaymentPolicy) {
        data.payments.policy = policy
        save()
    }

    /// The factor on the clerk's sales: a card reader brings the buyers who have no cash.
    var clerkPaymentFactor: Double { hasCardReader ? Balance.readerClerkSalesBonus : 1 }

    func paymentFee(_ method: PaymentMethod, price: Double, atStore: Bool) -> Double {
        let raw: Double = switch method {
        case .cash, .appFriends: 0
        case .card: atStore ? 0 : price * Balance.readerFeeRate + Balance.readerFeeFixed
        case .appGoods: price * Balance.goodsFeeRate + Balance.goodsFeeFixed
        }
        return (raw * 100).rounded() / 100
    }

    /// Rolls how a buyer pays for a sale at a face-to-face spot: a table, the counter, or a meetup.
    func rollPayment(price: Double, contactID: String?, atStore: Bool, buyer: String) -> PaymentResult {
        let policy = paymentPolicy
        let roll = Double.random(in: 0..<1)
        var preferred = PaymentMethod.cash
        if roll >= Balance.payMix[0] {
            if roll < Balance.payMix[0] + Balance.payMix[1] {
                preferred = .card
            } else {
                preferred = Double.random(in: 0..<1) < Balance.friendsFamilyAsk ? .appFriends : .appGoods
            }
        }
        var method = preferred
        let usable = policy.accepts(preferred) && (preferred != .card || hasCardReader)
        if !usable {
            let cashChance = contactID == nil ? Balance.cashFallbackStranger : Balance.cashFallbackContact
            if preferred == .appFriends, policy.accepts(.appGoods), Double.random(in: 0..<1) < Balance.friendsFamilyToGoods {
                method = .appGoods
            } else if Double.random(in: 0..<1) < cashChance {
                method = .cash
            } else {
                var result = PaymentResult(method: preferred, walked: true)
                result.line = preferred == .card && policy.accepts(.card)
                    ? "\(buyer) wanted to pay by card. You have no card reader, so \(buyer) walked."
                    : "\(buyer) wanted to pay \(preferred.phrase). You do not take that, so \(buyer) walked."
                return result
            }
        }
        var result = PaymentResult(method: method)
        result.fee = paymentFee(method, price: price, atStore: atStore)
        result.refundsFakes = method == .card || method == .appGoods
        let risk = contactID == nil ? 1.0 : Balance.payContactRiskFactor
        let scam: Double = method == .appGoods ? Balance.screenshotScamGoods : method == .appFriends ? Balance.screenshotScamFriends : 0
        if Double.random(in: 0..<1) < scam * risk {
            result.scam = true
            result.line = "\(buyer) showed a payment screen and left with the item. The money never came."
            return result
        }
        let reversal: Double = method == .appGoods ? Balance.reversalGoods : method == .appFriends ? Balance.reversalFriends : 0
        if Double.random(in: 0..<1) < reversal * risk {
            result.reversalDay = data.day + Int.random(in: Balance.reversalDays)
            result.refundsFakes = false
        }
        if method != .cash {
            result.line = "\(buyer) paid \(method.phrase)." + (result.fee > 0 ? " Fee: \(money(result.fee))." : "")
        }
        return result
    }

    /// Takes the fee of a paid sale from the cash, and books a reversal if one is coming. Call it after the sale.
    func settlePayment(_ pay: PaymentResult, item: String, venue: String, price: Double) {
        if pay.fee > 0 {
            addLedger(-pay.fee, .paymentFees, "\(pay.method == .card ? "Card" : "App") fee · \(item) · \(venue)")
            if let last = receipts.popLast() {
                addReceipt(name: last.name, venue: last.venue, price: last.price, net: last.net - pay.fee, paid: last.paid)
            }
        }
        if let day = pay.reversalDay {
            data.payments.reversals.append(PaymentReversal(item: item, method: pay.method, price: price, dayDue: day))
        }
        save()
    }

    /// A fake payment: the buyer keeps the item and the player gets nothing. The cost of the item is a loss.
    func loseToScam(_ id: UUID, name: String, venue: String) {
        let paid = paidFor(id) ?? 0
        settleOnlineListing(id, name: name)
        data.raw.removeAll { $0.id == id }
        data.slabs.removeAll { $0.id == id }
        data.sealed.removeAll { $0.id == id }
        data.openedPaid += paid
        log("Scammed at \(venue): a buyer left with \(name) and paid nothing.")
        save()
    }

    /// End Day: payments that the sender takes back today (docs/23-payment-methods.md, Reversals).
    func paymentsEndDay() -> [String] {
        let today = data.day
        let due = data.payments.reversals.filter { $0.dayDue <= today }
        guard !due.isEmpty else { return [] }
        var lines: [String] = []
        for reversal in due {
            addLedger(-reversal.price, .refund, "Chargeback · \(reversal.item)")
            let kind = reversal.method == .appGoods ? "Goods and Services" : "Friends and Family"
            lines.append("The \(kind) payment for your \(reversal.item) was reversed. The app took back \(money(reversal.price)).")
        }
        data.payments.reversals.removeAll { $0.dayDue <= today }
        return lines
    }
}
