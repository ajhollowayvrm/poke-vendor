import SwiftUI

/// The wear of a raw card, in words: "Looks clean", "Light wear", or "Heavy wear".
struct WearText: View {
    let wear: Wear

    var body: some View {
        Text(wear.looks)
            .font(.caption.weight(.semibold))
            .foregroundStyle(wear == .nearMint ? Theme.green : wear == .lightlyPlayed ? Theme.orange : .red)
    }
}

/// One face of the cut: words without a tool, or left to right and top to bottom with one.
struct CutLine: View {
    let reading: CutReading

    var body: some View {
        if let words = reading.words {
            Text(words).font(.caption)
        } else {
            HStack(spacing: 8) {
                value("LR", reading.lr)
                value("TB", reading.tb)
                if reading.spread > 0 {
                    Text("±\(reading.spread)").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func value(_ label: String, _ text: String) -> some View {
        HStack(spacing: 3) {
            Text(label).foregroundStyle(Theme.muted)
            Text(text)
        }
        .font(.caption.monospaced())
    }
}

/// The name of the tool that reads the cut.
func centeringToolName(_ level: Int) -> String {
    level == 0 ? "Eyeball" : Balance.centeringTools[min(level, Balance.centeringTools.count) - 1].name
}
