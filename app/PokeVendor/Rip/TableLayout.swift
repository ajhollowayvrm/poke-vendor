import SwiftUI

/// Where things sit on the screen: the pile on top, the stack under it, the condition on the left of the stack,
/// and the cut on the right. The spare height is shared evenly, so no gap opens under the stack.
struct TableLayout {
    static let ratio: CGFloat = 88.0 / 63.0
    let size: CGSize
    let topInset: CGFloat = 104
    /// The price panel and the buttons under the stack.
    let bottomInset: CGFloat = 236
    let side: CGFloat = 12
    let gap: CGFloat = 8
    /// The width of each column at the sides of the stack.
    let infoW: CGFloat = 66
    let pileScale: CGFloat = 0.36
    /// The cards under the top card step up a little (placement), so the stack needs this much room above it.
    let depth: CGFloat = 14

    private var room: CGFloat { size.height - topInset - bottomInset - depth }
    var cardW: CGFloat {
        min(size.width - side * 2 - infoW * 2 - gap * 2, (room - gap * 3) / (Self.ratio * (1 + pileScale)))
    }
    var cardH: CGFloat { cardW * Self.ratio }
    var pileSize: CGSize { CGSize(width: cardW * pileScale, height: cardH * pileScale) }
    private var spare: CGFloat { max(0, room - pileSize.height - cardH) / 3 }
    var pileCenter: CGPoint { CGPoint(x: size.width / 2, y: topInset + spare + pileSize.height / 2) }
    var stackCenter: CGPoint {
        CGPoint(x: size.width / 2, y: topInset + spare * 2 + pileSize.height + depth + cardH / 2)
    }
    /// The condition column on the left of the stack, and the cut column on the right.
    var leftInfo: CGPoint { CGPoint(x: (side + size.width / 2 - cardW / 2 - gap) / 2, y: stackCenter.y) }
    var rightInfo: CGPoint { CGPoint(x: size.width - leftInfo.x, y: stackCenter.y) }
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
