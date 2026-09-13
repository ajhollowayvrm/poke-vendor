"""Join the PPT price cache to the set file card lists, and report the coverage.

Usage: python3 tools/ppt/join.py [<set> ...]   (no sets: every set with PPT data in tools/ppt/cache/)

For each card list variant, the join looks for a PPT price:
- the PPT card: externalCatalogId equals the TCGdex card ID (<TCGdex set id>-<card number>);
- a pattern variant, for example "Reverse holo (Poké Ball pattern)": the PPT card with the same
  externalCatalogId and a name suffix, for example "(Poke Ball Pattern)";
- the print: PPT printing names map to the card list names (Holofoil -> Holo, and so on).
It also counts graded eBay prices for PSA 10, PSA 9, CGC 10, and CGC 9.
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "slotmap"))
import validate as V  # noqa: E402

CACHE = os.path.join(HERE, "cache")
TCGDEX_MAP = json.load(open(os.path.join(ROOT, "tools", "cardlist", "tcgdex-map.json")))
TCGCSV_MAP = json.load(open(os.path.join(ROOT, "tools", "cardlist", "tcgcsv-map.json")))
PRINTING = {"Normal": "Normal", "Holofoil": "Holo", "Reverse Holofoil": "Reverse holo",
            "1st Edition": "Normal (1st Edition)", "1st Edition Normal": "Normal (1st Edition)",
            "1st Edition Holofoil": "Holo (1st Edition)", "Unlimited": "Normal (Unlimited)",
            "Unlimited Normal": "Normal (Unlimited)", "Unlimited Holofoil": "Holo (Unlimited)"}
GRADES = ("psa10", "psa9", "cgc10", "cgc9")


def pattern_of(variant):
    m = re.search(r"\(([^()]*pattern[^()]*)\)", variant, re.I)
    return re.sub(r"[^a-z]", "", m.group(1).lower().replace("poké", "poke")) if m else None


def ppt_cards(slug):
    out = []
    for gid in TCGCSV_MAP.get(slug, []):
        p = os.path.join(CACHE, f"{gid}.json")
        if os.path.exists(p):
            out += json.load(open(p)).get("data", [])
    return out


def join(slug):
    t = open(os.path.join(ROOT, "docs", "sets", f"{slug}.md")).read()
    cards = V.parse_cards_list(t)
    ids = TCGDEX_MAP.get(slug, [])
    parts = []
    for line in (V.section(t, "Card list") or "").splitlines():
        if line.startswith("### "):
            parts.append(line[4:].strip())
    part_to_id = dict(zip(parts, ids)) if len(parts) == len(ids) and len(ids) > 1 else {}
    by_ext = collections.defaultdict(list)
    for pc in ppt_cards(slug):
        if pc.get("externalCatalogId"):
            by_ext[pc["externalCatalogId"]].append(pc)
    stats = collections.Counter()
    missing = []
    for c in cards:
        sid = part_to_id.get(c["part"], ids[0] if ids else "")
        local = c["num"].split("/")[0].split(" ")[-1]
        ext = f"{sid}-{local}"
        matches = by_ext.get(ext, [])
        stats["cards"] += 1
        if matches:
            stats["cards with a PPT card"] += 1
        graded = False
        for g in GRADES:
            if any((pc.get("ebay") or {}).get("salesByGrade", {}).get(g) for pc in matches):
                stats[f"cards with {g}"] += 1
                graded = True
        stats["cards with any of PSA 10, PSA 9, CGC 10, CGC 9"] += graded
        for v in c["variants"]:
            stats["variants"] += 1
            pat = pattern_of(v)
            priced = False
            for pc in matches:
                name_pat = pattern_of(pc.get("name", "")) if "pattern" in pc.get("name", "").lower() else None
                if pat != name_pat:
                    continue
                for printing in (pc.get("variants") or {}):
                    mapped = PRINTING.get(printing, printing)
                    base = v if pat is None else ("Reverse holo" if v.startswith("Reverse holo") else v.split(" (")[0])
                    if mapped == base or (pat and mapped in ("Holo", "Reverse holo", "Normal")) or v.startswith(mapped + " ("):
                        priced = True
            if priced:
                stats["variants with a PPT price"] += 1
            elif len(missing) < 5 and matches:
                missing.append(f"{c['num']} {c['name']} / {v} (PPT prints: {sorted({p for pc in matches for p in (pc.get('variants') or {})})})")
    return stats, missing


if __name__ == "__main__":
    slugs = sys.argv[1:] or [s for s, groups in TCGCSV_MAP.items() if any(os.path.exists(os.path.join(CACHE, f"{g}.json")) for g in groups)]
    total = collections.Counter()
    for slug in slugs:
        stats, missing = join(slug)
        total.update(stats)
        n = stats["cards"] or 1
        print(f"== {slug}: {stats['cards with a PPT card']}/{stats['cards']} cards matched, "
              f"{stats['variants with a PPT price']}/{stats['variants']} variants priced, "
              + ", ".join(f"{g} {stats['cards with ' + g]}" for g in GRADES))
        for m in missing:
            print(f"   no price: {m}")
    if len(slugs) > 1:
        print(f"TOTAL: {total['cards with a PPT card']}/{total['cards']} cards, {total['variants with a PPT price']}/{total['variants']} variants, "
              f"graded (any of 4) {total['cards with any of PSA 10, PSA 9, CGC 10, CGC 9']}")
