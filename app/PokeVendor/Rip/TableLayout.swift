import SwiftUI

/// Where things sit on the screen: the pile on top, and the stack under it. The card panel under the stack holds the
/// condition and the cut. The top bar and the bottom panel are measured, so the stack always fits between them and
/// nothing covers it. The spare height is shared evenly, so no gap opens under the stack.
struct TableLayout {
    static let ratio: CGFloat = 88.0 / 63.0
    let size: CGSize
    /// The measured top bar and bottom panel, each with a gap.
    let topInset: CGFloat
    let bottomInset: CGFloat
    let side: CGFloat = 16
    let gap: CGFloat = 8
    let pileScale: CGFloat = 0.3
    /// The cards under the top card step up a little (placement), so the stack needs this much room above it.
    let depth: CGFloat = 14

    /// `top` and `bottom` are the measured heights of the top bar and the bottom panel.
    init(size: CGSize, top: CGFloat, bottom: CGFloat) {
        self.size = size
        topInset = top + gap
        bottomInset = bottom + gap
    }

    private var room: CGFloat { max(0, size.height - topInset - bottomInset - depth) }
    var cardW: CGFloat {
        max(40, min(size.width - side * 2, (room - gap * 3) / (Self.ratio * (1 + pileScale))))
    }
    var cardH: CGFloat { cardW * Self.ratio }
    var pileSize: CGSize { CGSize(width: cardW * pileScale, height: cardH * pileScale) }
    private var spare: CGFloat { max(0, room - pileSize.height - cardH) / 3 }
    var pileCenter: CGPoint { CGPoint(x: size.width / 2, y: topInset + spare + pileSize.height / 2) }
    var stackCenter: CGPoint {
        CGPoint(x: size.width / 2, y: topInset + spare * 2 + pileSize.height + depth + cardH / 2)
    }
    /// The sealed pack sits in the middle of the free space. Its cards move to the stack when they come out.
    var packCenter: CGPoint { CGPoint(x: size.width / 2, y: topInset + room / 2) }
    /// The pack fits between the top bar and the panel, and keeps its shape.
    var packH: CGFloat { min(cardH * 1.28, room - 8, (size.width - side * 2) / Self.packAspect) }
    var packW: CGFloat { packH * Self.packAspect }
    static let packAspect: CGFloat = 1.12 / (1.28 * ratio)
}

struct Placement {
    var point: CGPoint
    var scale: CGFloat
    var rotation: Double
    var z: Double
    var faceUp: Bool
}
