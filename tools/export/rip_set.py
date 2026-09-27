"""Export one set for the rip screen of the iOS app.

Usage: python3 tools/export/rip_set.py <set> [<set> ...]

Writes app/PokeVendor/Resources/Sets/<set>.json with:
- the slots of one pack, in pack order (front card first), each with its outcomes and final odds
  (tools/slotmap/odds.py, with the era fallback);
- every print that an outcome can produce, with its market price, its graded prices
  (CGC 10, CGC 9, PSA 10, PSA 9, BGS 10, BGS 9.5), and its TCGplayer image URL (tools/ppt/cache/);
- the cost of one pack: the market price of the loose booster pack (tools/ppt/cache/sealed/).

tools/export/catalog.py writes the sealed products.

The rows with no card (Basic Energy, code card) are not exported. The app adds the Basic Energy.
"""
import collections, glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "slotmap"))
sys.path.insert(0, os.path.join(ROOT, "tools", "ppt"))
import validate as V  # noqa: E402
import odds as O  # noqa: E402
import join as J  # noqa: E402

OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "Sets")

# The physical card order of a pack, front card first, and the pack trick: how many cards the player moves
# from the back to the front so the hits come last. "ENERGY" is the extra Basic Energy card.
# Sources: docs/sets/eras/scarlet-violet.md (Conflicts in the template), docs/sets/eras/sun-moon.md (Pack order,
# which also covers Sword & Shield), and docs/sets/eras/wizards-of-the-coast.md (Pack order, low confidence).
SM_SWSH = (["Common"] * 5 + ["Reverse holo", "Rare slot", "ENERGY"] + ["Uncommon"] * 3, 4)
ERA_PACKS = {
    "scarlet-violet": (["Common"] * 4 + ["Uncommon"] * 3 + ["Reverse holo slot 1", "Reverse holo slot 2", "Rare slot", "ENERGY"], 1,
                       "Scarlet & Violet"),
    "sword-shield": SM_SWSH + ("Sword & Shield",),
    "sun-moon": SM_SWSH + ("Sun & Moon",),
    "wizards-of-the-coast": (["Common"] * 5 + ["Energy"] * 2 + ["Rare slot"] + ["Uncommon"] * 3, 3, "Wizards of the Coast"),
}


def pack_order(era, slots, has_energy_row):
    """Return (order, trick, series). The order must use each slot exactly as often as the slot map says."""
    order, trick, series = ERA_PACKS.get(era, (None, 1, era.replace("-", " ").title() if era else ""))
    want = {}
    for s in slots:
        want[s["name"]] = s["count"]
    if order:
        got = {}
        for name in order:
            if name != "ENERGY":
                got[name] = got.get(name, 0) + 1
        if got == want and (("ENERGY" in order) == has_energy_row):
            return order, trick, series
        print(f"  pack order of era {era} does not fit the slot map {want}; using the slot map order")
    order = [s["name"] for s in slots for _ in range(s["count"])] + (["ENERGY"] if has_energy_row else [])
    return order, 1, series
SEALED = os.path.join(ROOT, "tools", "ppt", "cache", "sealed")
GRADES = ("cgc10", "cgc9_5", "cgc9", "cgc8_5", "cgc8", "psa10", "psa9", "psa8", "psa7", "psa6",
          "bgs10", "bgs9_5", "bgs9", "bgs8_5", "bgs8")


def ppt_matches(slug, cards):
    """Return {card number: [PPT cards]} with the match order of tools/ppt/join.py."""
    groups = J.ppt_groups(slug)
    ids = J.TCGDEX_MAP.get(slug, [])
    by_ext, by_num, by_name = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for gid, data in groups:
        for pc in data:
            pc["_group"] = gid
            if pc.get("externalCatalogId"):
                by_ext[pc["externalCatalogId"]].append(pc)
            by_num[J.num_key(pc.get("cardNumber"))].append(pc)
            by_name[J.norm_name(pc.get("name"))].append(pc)
    out = {}
    for c in cards:
        local = c["num"].split("/")[0].split(" ")[-1]
        m = list(by_ext.get(f"{ids[0]}-{local}", [])) if ids else []
        if not m:
            m = list(by_num.get(J.num_key(local), []))
        if not m:
            cand = by_name.get(J.norm_name(c["name"]), [])
            base = [x for x in cand if "(" not in (x.get("name") or "")]
            m = cand if len(base) == 1 else []
        out[c["num"]] = m
    return out


def graded(pc):
    res = {}
    for g in GRADES:
        s = ((pc.get("ebay") or {}).get("salesByGrade") or {}).get(g) or {}
        p = (s.get("smartMarketPrice") or {}).get("price") or s.get("medianPrice")
        res[g] = round(p, 2) if p else None
    return res


def price_print(matches, variant):
    """Return (market price, graded prices, image URL) for one print of a card."""
    kind, first, _, _ = J.list_print(variant)
    pat = J.pattern_of(variant)
    for pc in matches:
        if (J.pattern_of(pc.get("name")) or None) != pat:
            continue
        for printing, v in (pc.get("variants") or {}).items():
            pk, pfirst = J.ppt_print(printing)
            if pat and pk == "Holo" and kind == "Reverse holo":
                pk = "Reverse holo"
            if pk == kind and pfirst == first:
                return v.get("marketPrice"), graded(pc), pc.get("imageCdnUrl800") or pc.get("imageUrl")
    return None, {g: None for g in GRADES}, None


def pack_cost(slug):
    """The market price of a plain loose booster pack: the cheapest one that is not sleeved, 1st Edition, or a bundle."""
    groups = {str(g) for g in J.TCGCSV_MAP.get(slug, [])}
    skip = re.compile(r"Sleeved|Art Bundle|Blister|1st Edition|Bundle|Box|Case|Set of|Display", re.I)
    best = None
    for f in glob.glob(os.path.join(SEALED, "*.json")):
        if os.path.basename(f)[:-5] not in groups:
            continue
        data = json.load(open(f))
        for p in (data.get("data", []) if isinstance(data, dict) else data):
            name = p.get("name", "")
            if "Booster Pack" in name and not skip.search(name) and p.get("unopenedPrice"):
                if best is None or p["unopenedPrice"] < best[0]:
                    best = (p["unopenedPrice"], p.get("imageCdnUrl800") or p.get("imageUrl"))
    return best or (None, None)


def export(slug):
    sets, eras = O.load(), O.era_map()
    s = sets[slug]
    t = open(os.path.join(ROOT, "docs", "sets", f"{slug}.md")).read()
    name = re.match(r"^# (.+?)(?: \(\d{4}\))?$", t.splitlines()[0]).group(1)
    matches = ppt_matches(slug, s["cards"])
    # A pack holds one print run. The app rips the first run that the set file lists (for Base Set, Unlimited).
    runs = s["runs"][:1]
    prints, index, slots = [], {}, []
    has_energy_row = False
    for slot, res in O.final_odds(slug, s, O.era_pool(sets, eras), eras).items():
        rows = [(r, p) for r, p, _ in res if r[4] != "—"]
        if not rows:
            has_energy_row = has_energy_row or slot == "Basic Energy"
            continue
        outcomes = []
        for r, p in rows:
            names = [x.strip() for x in r[4].split(",")]
            options = [o.strip() for o in r[5].split(" or ")]
            ids = []
            for c in s["cards"]:
                if c["rarity"] not in names or not V.in_filter(c, r[6]):
                    continue
                for option in options:
                    hits = [v for v in c["variants"] if V.variant_matches(v, option, runs)]
                    if not hits:
                        continue
                    for v in hits:
                        key = (c["num"], v)
                        if key not in index:
                            market, grades, image = price_print(matches[c["num"]], v)
                            index[key] = len(prints)
                            prints.append({"num": c["num"], "name": c["name"], "rarity": c["rarity"],
                                           "variant": v, "market": market, "graded": grades, "image": image})
                        ids.append(index[key])
                    break
            outcomes.append({"name": r[2], "entry": r[3], "odds": round(p / 100, 6), "prints": ids})
        slots.append({"name": slot, "count": int(rows[0][0][1]), "outcomes": outcomes})
    cost, pack_image = pack_cost(slug)
    os.makedirs(OUT, exist_ok=True)
    order, trick, series = pack_order(eras.get(slug), slots, has_energy_row)
    out = {"slug": slug, "name": name, "era": eras.get(slug), "series": series, "packCost": cost, "packImage": pack_image,
           "slots": slots, "order": order, "trick": trick, "prints": prints}
    path = os.path.join(OUT, f"{slug}.json")
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)
    unpriced = sum(1 for p in prints if p["market"] is None)
    print(f"{slug}: {len(slots)} slots, {len(prints)} prints ({unpriced} with no price), pack cost {cost}, "
          f"trick {trick}, order {order} -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for a in sys.argv[1:]:
        export(a)
