import Foundation

// The PC: the player's personal collection (docs/08-ui-direction.md, The PC). A PC item is out of the regular
// Inventory. It can go to a show or a meet. Every deal on a PC item, the player's or another person's, carries the
// PC premium (docs/20-card-shows.md, PC items).

extension Balance {
    /// A PC item changes hands at 130% of market or more.
    static let pcPremium = 1.30
    /// A collector who wants a PC item pays up to this much over the premium. Most collectors stop short of it.
    static let pcBuyerStretch = 0.15
}
