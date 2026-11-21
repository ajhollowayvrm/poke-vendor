"""Export the real case prices for the iOS app.

Usage: python3 -I tools/export/cases.py

Run it after tools/export/catalog.py, in the price refresh.

Writes app/PokeVendor/Resources/cases.json: one row for each unit product that has a case SKU on TCGplayer.
A row is {"product": <unit id in catalog.json>, "case": <TCGplayer id of the case SKU>, "units": N, "market": <case price>}.
The case SKUs come from the TCGCSV cache (tools/cardlist/cache/tcgcsv/). The catalog does not list them.
A product with no row gets its case price from the factor table (Balance.caseFactors in Model/Cases.swift).

Rules (docs/proposals/sealed-product/part-b-cases-distro-ripship.md, section 2.2):
- The price is marketPrice, or midPrice when marketPrice is null. Each midPrice row is printed.
- A case name maps to unit names by the table PATTERNS. A unit must be in the same TCGCSV group. A sleeved booster
  case SKU gives a row to the sleeved pack and to the plain pack.
- A row stays only when its units equal the game's case size for that unit (case_size, a copy of
  Balance.caseSize(for:) in Model/Cases.swift: change both together). The enhanced booster box is the one exception.
- A row stays only when case price / (units * unit market) is from 0.4 to 2.5. Other ratios are a wrong match.
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
CATALOG = os.path.join(ROOT, "app", "PokeVendor", "Resources", "catalog.json")
OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "cases.json")
CONTENTS = os.path.join(ROOT, "tools", "ppt", "cache", "sealed_contents.json")
TCGCSV = os.path.join(ROOT, "tools", "cardlist", "cache", "tcgcsv")
RATIO = (0.4, 2.5)

CASE_SIZE_BY_NAME = [("Ultra-Premium", 4), ("Ultra Premium", 4), ("Tech Sticker", 12), ("Knock Out", 24)]
CASE_SIZES = {"Booster box": 6, "Elite Trainer Box": 10, "Booster bundle": 25, "Booster pack": 144,
              "Blister": 24, "Build & Battle": 10, "Collection": 6, "Tin": 6}


def case_size(p):
    """Units in one case of a catalog product. None: no case. Keep equal to Balance.caseSize(for:)."""
    name, kind, packs = p["name"], p["kind"], p["packs"]
    if "Costco" in name or "Sam's Club" in name or "Master Carton" in name or "[Set of" in name:
        return None
    if kind == "Booster pack":
        return 144 if packs == 1 and "Fun Pack" not in name else None
    if kind == "Booster box":
        if "Half Booster Box" in name or "Enhanced Booster Box" in name:
            return None
        return 6 if packs == 36 else None
    if kind == "Booster bundle":
        return 25 if packs == 6 else None
    if kind == "Elite Trainer Box":
        return 4 if "Pokemon Center" in name or "Pokémon Center" in name else 10
    if kind == "Blister":
        return 16 if packs <= 1 else 24
    if kind == "Tin":
        return 10 if "Mini Tin" in name else 6
    if kind == "Collection":
        return next((n for key, n in CASE_SIZE_BY_NAME if key in name), 6)
    return CASE_SIZES.get(kind)


def norm(name):
    """Lower case, one spelling. Brackets stay, because they name an art variant."""
    n = name.lower().replace("é", "e").replace("&", "and").replace("-", " ")
    n = n.replace("(international version)", "").replace("(exclusive)", "")
    return re.sub(r"\s+", " ", n).strip()


# (case name pattern, unit names to look for in order, units). The first pattern that matches wins.
PATTERNS = [
    (r"^(.*) pokemon center elite trainer box case$", ["{b} pokemon center elite trainer box"], 4),
    (r"^(.*) elite trainer box case$", ["{b} elite trainer box"], 10),
    (r"^(.*) enhanced booster (?:box )?case$", ["{b} enhanced booster box"], 6),
    (r"^(.*) booster box case$", ["{b} booster box"], 6),
    (r"^(.*) booster bundle (?:display )?case$", ["{b} booster bundle"], 25),
    (r"^(.*) sleeved booster (?:pack )?case$", ["{b} sleeved booster pack", "{b} booster pack"], 144),
    (r"^(.*) 3 pack blisters? case$", ["{b} 3 pack blister"], 24),
    (r"^(.*) build and battle (?:box )?(?:display|case)$", ["{b} build and battle box"], 10),
    (r"^(.*) mini tin display$", ["{b} mini tin"], 10),
    (r"^(.*) ultra premium collection case$", ["{b} ultra premium collection"], 4),
    (r"^(.*) tin case$", ["{b} tin"], 6),
    (r"^(.*) collection (?:box )?case$", ["{b} collection"], 6),
]


def rows_of(path):
    data = json.load(open(path))
    return data.get("results", data) if isinstance(data, dict) else data


def main():
    catalog = json.load(open(CATALOG))
    units_by_id = {p["id"]: p for p in catalog}
    group_of = {str(it["id"]): it["group"] for it in json.load(open(CONTENTS))}
    by_group = {}
    for p in catalog:
        g = group_of.get(p["id"])
        if g is not None:
            by_group.setdefault(g, []).append(p)

    rows, mid_used, drops, collisions = {}, [], [], []
    stats = {"cases": 0, "no_match": 0, "no_price": 0, "size": 0, "ratio": 0}
    for group, units in sorted(by_group.items()):
        pp, rp = (os.path.join(TCGCSV, f"{group}-{k}.json") for k in ("products", "prices"))
        if not (os.path.exists(pp) and os.path.exists(rp)):
            continue
        price = {}
        for r in rows_of(rp):
            if r.get("marketPrice"):
                price.setdefault(r["productId"], (r["marketPrice"], False))
        for r in rows_of(rp):
            if r["productId"] not in price and r.get("midPrice"):
                price[r["productId"]] = (r["midPrice"], True)
        # An international unit is a different product from the US case SKU.
        unit_names = [(norm(re.sub(r"\s*\(Retail\)$", "", u["name"])), u) for u in units if "International" not in u["name"]]
        for prod in rows_of(pp):
            raw = prod["name"]
            if not re.search(r"\bCase\b|Display", raw) or "Code Card" in raw or "International" in raw:
                continue
            stats["cases"] += 1
            n, variant, lgs = norm(raw), None, False
            # Trailing "(LGS)" and "[Variant]" in any order.
            while True:
                m = re.search(r"\s*(\(lgs\)|\[[^\]]*\])$", n)
                if not m:
                    break
                if m.group(1) == "(lgs)":
                    lgs = True
                else:
                    variant = m.group(1)
                n = n[:m.start()]
            hit = None
            for k, (pat, wanted, units_in_case) in enumerate(PATTERNS):
                m = re.match(pat, n)
                if m:
                    hit = (k, [w.format(b=m.group(1)) for w in wanted], units_in_case)
                    break
            if not hit:
                stats["no_match"] += 1
                continue
            order, wanted, count = hit
            if prod["productId"] not in price:
                stats["no_price"] += 1
                continue
            market, is_mid = price[prod["productId"]]
            matched = []
            # Every name in the list gets a row: one sleeved case SKU prices both the sleeved pack and the plain pack.
            for w in wanted:
                found = len(matched)
                for tag in ([" (lgs)", ""] if lgs else [""]):
                    for nu, u in unit_names:
                        if nu == w + tag:
                            rest = ""
                        elif nu.startswith(w + tag + " "):
                            rest = nu[len(w + tag) + 1:]
                            if not re.fullmatch(r"\[[^\]]*\]", rest):
                                continue
                        else:
                            continue
                        if variant is not None and rest != variant:
                            continue
                        matched.append(u)
                    if len(matched) > found:
                        break
            for u in matched:
                # An enhanced box has no count rule, so only a real case SKU gives it a case (CaseMath.units).
                if case_size(u) != count and not ("Enhanced Booster Box" in u["name"] and count == 6):
                    stats["size"] += 1
                    continue
                ratio = market / (count * u["market"])
                if not RATIO[0] <= ratio <= RATIO[1]:
                    stats["ratio"] += 1
                    drops.append(f"drop {raw}: {u['name']} ratio {ratio:.2f}")
                    continue
                row = {"product": u["id"], "case": str(prod["productId"]), "units": count, "market": round(market, 2)}
                if u["id"] in rows:
                    collisions.append(f"{u['name']}: case {rows[u['id']][1]['case']} kept, case {row['case']} ignored")
                    continue
                if is_mid:
                    mid_used.append(f"midPrice used: {raw} ({market})")
                rows[u["id"]] = (order, row)
    out = sorted((r for _, r in rows.values()), key=lambda r: int(r["product"]))
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")

    for line in mid_used + drops + collisions:
        print(line)
    print(f"case SKUs read: {stats['cases']}, no pattern: {stats['no_match']}, no price: {stats['no_price']}, "
          f"wrong size: {stats['size']}, ratio drops: {stats['ratio']}")
    print(f"rows written: {len(out)} to {os.path.relpath(OUT, ROOT)}")
    have = {r["product"] for r in out}

    def line(label, pool):
        n = sum(1 for p in pool if p["id"] in have)
        print(f"{label}: {n} of {len(pool)} ({round(100 * n / max(len(pool), 1))}%)")

    inprint = [p for p in catalog if p.get("inPrint")]
    line("in-print booster boxes", [p for p in inprint if p["kind"] == "Booster box" and (case_size(p) or "Enhanced" in p["name"])])
    line("in-print ETBs (not Pokemon Center)", [p for p in inprint if p["kind"] == "Elite Trainer Box" and case_size(p) == 10])
    line("in-print booster packs", [p for p in inprint if p["kind"] == "Booster pack" and case_size(p)])
    line("in-print booster bundles", [p for p in inprint if p["kind"] == "Booster bundle" and case_size(p)])
    wholesale = [p for p in inprint if p["kind"] in ("Booster box", "Elite Trainer Box", "Booster bundle", "Booster pack")
                 and case_size(p) and p.get("msrp") is not None and "Pokemon Center" not in p["name"]]
    line("in-print, four wholesale kinds", wholesale)
    line("every in-print product with a case size", [p for p in inprint if case_size(p)])
    line("every catalog product with a case size", [p for p in catalog if case_size(p)])


if __name__ == "__main__":
    sys.exit(main())
