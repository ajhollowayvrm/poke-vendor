import Foundation

// What is inside a box (docs/12-acquiring-product.md, Look inside a box).

/// The packs inside one copy of a product. A box that lists its packs always holds them. A box that says only
/// "assorted packs" holds the packs that it names, plus one pack from its pool for each other pack. The pools come
/// from tools/export/catalog.py and hold one era only. The key names one copy: the item's ID, or the listing that
/// the player looked at before the purchase. The same key always gives the same packs.
enum BoxContents {
    /// The packs that the player can see without opening the box. A blister shows all of its packs.
    static let visiblePacks = 2

    /// The packs, front first.
    static func draw(_ product: Product, key: String) -> [String] {
        var rng = SeededRandom(seed: stableHash(key))
        var packs: [String]
        if let pools = product.pools, !pools.isEmpty {
            packs = (product.known ?? []).flatMap { Array(repeating: $0.slug, count: $0.packs) }
            for pool in pools where !pool.slugs.isEmpty {
                for _ in 0..<pool.packs { packs.append(pool.slugs[Int(rng.next() * CGFloat(pool.slugs.count)) % pool.slugs.count]) }
            }
            // A bad pool gives the expected mix.
            if packs.count != product.packs { packs = product.packSlugs }
        } else {
            packs = product.packSlugs
        }
        // The packs sit in a random order, so the front packs change from copy to copy.
        for i in stride(from: packs.count - 1, to: 0, by: -1) {
            packs.swapAt(i, Int(rng.next() * CGFloat(i + 1)) % (i + 1))
        }
        return packs
    }

    /// True when the box has a look-inside view: 2 packs or more, and not a single loose pack.
    static func canLookInside(_ product: Product?) -> Bool {
        guard let product else { return false }
        return product.packs >= 2 && product.kind != "Booster pack"
    }

    /// How many packs the player can see: all of a blister, else the front 2.
    static func visible(_ product: Product) -> Int {
        product.kind == "Blister" ? product.packs : min(visiblePacks, product.packs)
    }

    /// The key for the copy of a shelf item that the player buys next: the front box on the shelf.
    static func shelfKey(_ id: String, copy: Int) -> String { "\(id)#\(copy)" }

    /// FNV-1a. `hashValue` changes from launch to launch, so it cannot seed packs that must stay the same.
    static func stableHash(_ key: String) -> UInt64 {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in key.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return hash
    }
}
