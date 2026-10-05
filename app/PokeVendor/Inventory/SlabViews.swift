import SwiftUI

/// A graded card in its slab: a clear case with the label of the grading company on top.
/// Each company has its own label. BGS prints the four subgrades. The view keeps the slab shape and fits its frame.
struct SlabView: View {
    let image: String?
    let name: String
    let grade: SlabGrade
    /// The BGS subgrades: centering, corners, edges, surface. Nil gives subgrades that match the grade.
    var subgrades: [Double]? = nil
    /// The cert number comes from the item ID, so the same slab always shows the same number.
    var certID: UUID? = nil

    /// The width over the height of a real slab.
    static let ratio: CGFloat = 0.62

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let inset = w * 0.06
            VStack(spacing: w * 0.035) {
                SlabLabel(name: name, grade: grade, subgrades: shownSubgrades, cert: cert, width: w - inset * 2)
                    .frame(height: w * (grade.company == .bgs ? 0.36 : 0.27))
                // The clear frame holds the card shape. The image fills it and the clip cuts the rest.
                Color.clear
                    .aspectRatio(63.0 / 88.0, contentMode: .fit)
                    .overlay(RemoteCardImage(url: image.flatMap(URL.init(string:)), name: ""))
                    .clipShape(RoundedRectangle(cornerRadius: w * 0.03))
                    .padding(w * 0.03)
                    .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: w * 0.04))
                Spacer(minLength: 0)
            }
            .padding(inset)
            .frame(width: w, height: geo.size.height)
            .background(caseBody(w))
            .clipShape(RoundedRectangle(cornerRadius: w * 0.06))
        }
        .aspectRatio(Self.ratio, contentMode: .fit)
    }

    /// The clear plastic case, with a soft shine.
    private func caseBody(_ w: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: w * 0.06)
            .fill(LinearGradient(colors: [Color(white: 0.85, opacity: 0.32), Color(white: 0.55, opacity: 0.18), Color(white: 0.9, opacity: 0.28)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: w * 0.06).stroke(Color.white.opacity(0.55), lineWidth: max(0.5, w * 0.012)))
            .overlay(RoundedRectangle(cornerRadius: w * 0.045).stroke(Color.white.opacity(0.18), lineWidth: max(0.5, w * 0.006)).padding(w * 0.025))
    }

    private var shownSubgrades: [Double] {
        if let subgrades { return subgrades.map { ($0 * 2).rounded() / 2 } }
        if grade.blackLabel { return [10, 10, 10, 10] }
        // A slab with no known condition: three subgrades at the grade and one a half step above.
        let g = grade.grade
        return [min(10, g + 0.5), g, g, g]
    }

    private var cert: String {
        guard let certID else { return "" }
        let digits = certID.uuidString.unicodeScalars.reduce(UInt64(7)) { ($0 &* 31 &+ UInt64($1.value)) % 1_000_000_000 }
        return String(format: "%09llu", digits)
    }
}

/// The label strip at the top of a slab.
private struct SlabLabel: View {
    let name: String
    let grade: SlabGrade
    let subgrades: [Double]
    let cert: String
    let width: CGFloat

    private var number: String {
        grade.grade == grade.grade.rounded() ? String(Int(grade.grade)) : String(grade.grade)
    }

    private func font(_ share: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: max(1, width * share), weight: weight)
    }

    var body: some View {
        switch grade.company {
        case .psa: psa
        case .cgc: cgc
        case .bgs: bgs
        }
    }

    // MARK: PSA: a white label with a red frame. The name is on the left, the grade on the right.

    private static let psaRed = Color(red: 0.78, green: 0.06, blue: 0.16)

    private var psa: some View {
        HStack(alignment: .center, spacing: width * 0.03) {
            VStack(alignment: .leading, spacing: width * 0.01) {
                Text("POKEMON").font(font(0.055, .semibold))
                Text(name.uppercased()).font(font(0.065, .bold)).lineLimit(2)
                Spacer(minLength: 0)
                HStack(spacing: width * 0.02) {
                    Text("PSA").font(font(0.085, .heavy).italic()).foregroundStyle(Self.psaRed)
                    Text(cert).font(font(0.045).monospaced())
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text(Self.psaWords(grade.grade)).font(font(0.06, .bold))
                Text(number).font(font(0.16, .heavy))
            }
        }
        .foregroundStyle(.black)
        .minimumScaleFactor(0.5)
        .padding(width * 0.035)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(Rectangle().stroke(Self.psaRed, lineWidth: max(0.5, width * 0.02)).padding(width * 0.012))
        .clipShape(RoundedRectangle(cornerRadius: width * 0.02))
    }

    static func psaWords(_ g: Double) -> String {
        switch g {
        case 10: "GEM MT"
        case 9: "MINT"
        case 8: "NM-MT"
        case 7: "NM"
        case 6: "EX-MT"
        case 5: "EX"
        case 4: "VG-EX"
        case 3: "VG"
        case 2: "GOOD"
        default: "PR"
        }
    }

    // MARK: CGC: a blue label with a white grade box.

    private static let cgcBlue = Color(red: 0.05, green: 0.27, blue: 0.55)

    private var cgc: some View {
        HStack(alignment: .center, spacing: width * 0.03) {
            VStack(alignment: .leading, spacing: width * 0.01) {
                Text("CGC").font(font(0.1, .black)).foregroundStyle(Color(red: 0.55, green: 0.85, blue: 1))
                Text(name).font(font(0.06, .semibold)).lineLimit(2)
                Spacer(minLength: 0)
                Text(cert).font(font(0.045).monospaced()).opacity(0.8)
            }
            .foregroundStyle(.white)
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                Text(number).font(font(0.15, .heavy))
                Text(grade.pristine ? "PRISTINE" : Self.cgcWords(grade.grade)).font(font(0.042, .bold)).lineLimit(1)
            }
            .foregroundStyle(Self.cgcBlue)
            .padding(.horizontal, width * 0.03)
            .padding(.vertical, width * 0.015)
            .background(grade.pristine ? Color(red: 0.98, green: 0.88, blue: 0.55) : Color.white, in: RoundedRectangle(cornerRadius: width * 0.02))
        }
        .minimumScaleFactor(0.5)
        .padding(width * 0.035)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Self.cgcBlue, Color(red: 0.02, green: 0.15, blue: 0.35)], startPoint: .top, endPoint: .bottom))
        .clipShape(RoundedRectangle(cornerRadius: width * 0.02))
    }

    static func cgcWords(_ g: Double) -> String {
        switch g {
        case 10: "GEM MINT"
        case 9.5: "MINT+"
        case 9: "MINT"
        case 8.5: "NM/MINT+"
        case 8: "NM/MINT"
        case 7.5: "NM+"
        case 7: "NM"
        case 6.5: "EX/NM+"
        case 6: "EX/NM"
        case 5.5: "EX+"
        case 5: "EX"
        case 4.5: "VG/EX+"
        case 4: "VG/EX"
        case 3.5: "VG+"
        case 3: "VG"
        case 2.5: "G+"
        case 2: "GOOD"
        case 1.5: "FR/G"
        default: "POOR"
        }
    }

    // MARK: BGS: a silver label with the four subgrades. A 10 is gold. A Black Label is black with gold text.

    private static let gold = Color(red: 0.86, green: 0.70, blue: 0.32)

    private var bgsBackground: LinearGradient {
        if grade.blackLabel {
            return LinearGradient(colors: [Color(white: 0.14), Color(white: 0.02)], startPoint: .top, endPoint: .bottom)
        }
        if grade.grade == 10 {
            return LinearGradient(colors: [Color(red: 0.98, green: 0.88, blue: 0.55), Color(red: 0.80, green: 0.63, blue: 0.28)], startPoint: .top, endPoint: .bottom)
        }
        return LinearGradient(colors: [Color(white: 0.92), Color(white: 0.68)], startPoint: .top, endPoint: .bottom)
    }

    private var bgsInk: Color { grade.blackLabel ? Self.gold : .black }

    private var bgs: some View {
        VStack(alignment: .leading, spacing: width * 0.015) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("BECKETT").font(font(0.07, .black))
                    Text(name).font(font(0.055, .semibold)).lineLimit(1)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(number).font(font(0.15, .heavy))
                    Text(grade.blackLabel ? "BLACK LABEL" : Self.bgsWords(grade.grade)).font(font(0.042, .bold)).lineLimit(1)
                }
            }
            HStack(spacing: width * 0.02) {
                ForEach(Array(zip(["CENTERING", "CORNERS", "EDGES", "SURFACE"], subgrades)), id: \.0) { title, value in
                    VStack(spacing: 0) {
                        Text(value == value.rounded() ? String(Int(value)) : String(value)).font(font(0.065, .bold).monospacedDigit())
                        Text(title).font(font(0.03, .semibold)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            if !cert.isEmpty {
                Text(cert).font(font(0.04).monospaced()).opacity(0.7)
            }
        }
        .foregroundStyle(bgsInk)
        .minimumScaleFactor(0.5)
        .padding(width * 0.035)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(bgsBackground)
        .overlay(RoundedRectangle(cornerRadius: width * 0.02).stroke(grade.blackLabel ? Self.gold : Color.black.opacity(0.25), lineWidth: max(0.5, width * 0.01)))
        .clipShape(RoundedRectangle(cornerRadius: width * 0.02))
    }

    static func bgsWords(_ g: Double) -> String {
        switch g {
        case 10: "PRISTINE"
        case 9.5: "GEM MINT"
        case 9: "MINT"
        case 8.5: "NM-MT+"
        case 8: "NM-MT"
        case 7.5: "NEAR MINT+"
        case 7: "NEAR MINT"
        case 6.5: "EX-MT+"
        case 6: "EX-MT"
        case 5.5: "EXCELLENT+"
        case 5: "EXCELLENT"
        case 4.5: "VG-EX+"
        case 4: "VG-EX"
        case 3.5: "VG+"
        case 3: "VG"
        case 2.5: "GOOD+"
        case 2: "GOOD"
        case 1.5: "FAIR"
        default: "POOR"
        }
    }
}

/// A card image, or its slab when it has a grade. Use it wherever a card that can be graded shows.
struct CardOrSlab: View {
    let image: String?
    let name: String
    let grade: SlabGrade?
    var subgrades: [Double]? = nil
    var certID: UUID? = nil
    var cornerRadius: CGFloat = 3

    var body: some View {
        if let grade {
            SlabView(image: image, name: name, grade: grade, subgrades: subgrades, certID: certID)
        } else {
            RemoteCardImage(url: image.flatMap(URL.init(string:)), name: "")
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        }
    }
}

extension CardPrint {
    /// The Black Label price. The price data has no Black Label sales, so it comes from the BGS 10 and PSA 10 prices.
    var blackLabelPrice: Double? { gradedPrice("bgs10").map { OwnedCard.blackLabelPrice(bgs10: $0, psa10: gradedPrice("psa10")) } }
    /// The CGC Pristine 10 price. The price data has no Pristine sales, so it comes from the CGC 10 price.
    var cgcPristinePrice: Double? { gradedPrice("cgc10").map { OwnedCard.cgcPristinePrice(cgc10: $0, psa10: gradedPrice("psa10")) } }
}
