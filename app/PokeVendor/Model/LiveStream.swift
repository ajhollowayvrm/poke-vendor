import Foundation

// Live streams and Whatnot (docs/06-social-media.md, Live streams; docs/15-selling.md, Whatnot).
// The stream session comes in Phase 3. The constants live here so that the sale paths can use them.

extension Balance {
    static let whatnotFeeRate = 0.109
    static let whatnotFeeFlat = 0.30
    /// Follower tier 3: every listing sells this much faster (docs/04).
    static let reachSaleBonus = 1.3
}
