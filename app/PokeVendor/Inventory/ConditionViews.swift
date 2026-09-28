import SwiftUI

/// The wear of a raw card, as a small tag: NM, LP, or MP.
struct WearPill: View {
    let wear: Wear

    var body: some View {
        let color = wear == .nearMint ? Theme.green : wear == .lightlyPlayed ? Theme.orange : .red
        Text(wear.short)
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
    }
}

/// One value of a cut reading. A rough reading is cloudy: the less exact it is, the more it blurs and the more
/// fog drifts over it.
struct CutValue: View {
    let label: String
    let text: String
    let spread: Int?

    private var fog: CGFloat {
        guard let spread else { return 1 }
        return spread == 0 ? 0 : spread >= 6 ? 0.7 : 0.35
    }

    var body: some View {
        HStack(spacing: 3) {
            Text(label).foregroundStyle(Theme.muted)
            Text(text)
                .blur(radius: fog * 1.3)
                .overlay {
                    if fog > 0 { Fog(amount: fog) }
                }
        }
        .font(.caption.monospaced())
    }
}

/// Soft light that drifts across a cloudy value.
private struct Fog: View {
    let amount: CGFloat

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let x = (t * 0.35).truncatingRemainder(dividingBy: 2.4) - 1.2
            LinearGradient(stops: [.init(color: .clear, location: 0),
                                   .init(color: Theme.muted.opacity(0.55 * amount), location: 0.5),
                                   .init(color: .clear, location: 1)],
                           startPoint: UnitPoint(x: x, y: 0.5), endPoint: UnitPoint(x: x + 1.2, y: 0.5))
                .blur(radius: 3)
        }
        .allowsHitTesting(false)
    }
}

/// One face of the cut: left to right, top to bottom, and how far off the reading can be.
struct CutLine: View {
    let reading: CutReading

    var body: some View {
        HStack(spacing: 8) {
            CutValue(label: "LR", text: reading.lr, spread: reading.spread)
            CutValue(label: "TB", text: reading.tb, spread: reading.spread)
            if let spread = reading.spread, spread > 0 {
                Text("±\(spread)").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The name of the tool that reads the cut.
func centeringToolName(_ level: Int) -> String {
    level == 0 ? "Eyeball" : Balance.centeringTools[min(level, Balance.centeringTools.count) - 1].name
}
