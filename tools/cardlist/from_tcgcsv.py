"""Build TCGdex-shaped cache files for a set that TCGdex does not have yet, from the TCGplayer catalog (TCGCSV).

Usage: python3 tools/cardlist/from_tcgcsv.py <TCGdex set id> <TCGCSV group> <set name> <set code> <release date>
Example: python3 tools/cardlist/from_tcgcsv.py me06 24831 "Delta Reign" DLR 2026-11-06

- Writes tools/cardlist/cache/tcgdex/sets/<id>.json and tools/cardlist/cache/tcgdex/cards/<id>-<number>.json.
  cardlist.py, join.py, and the export read these files as if TCGdex wrote them.
- Run tools/cardlist/download.py first, so that the TCGCSV group is in the cache.
- A file that TCGdex wrote is never replaced. Delete the set's cache files and run download.py when TCGdex
  adds the set, so the real TCGdex data replaces this copy.
- The variants come from the TCGCSV price rows (Normal, Reverse Holofoil, Holofoil). A card with no price row gets
  Normal and Reverse holo when it is a Common, Uncommon, or Rare, else Holo only.
- The rarity names use the TCGdex spelling, for example "Double rare" and "Illustration rare".
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
RARITY = {"Double Rare": "Double rare", "Illustration Rare": "Illustration rare",
          "Special Illustration Rare": "Special illustration rare"}
VARIANT = {"Normal": "normal", "Reverse Holofoil": "reverse", "Holofoil": "holo"}
LOW = ("Common", "Uncommon", "Rare")


def ext(product, key):
    return next((e["value"] for e in product.get("extendedData", []) if e["name"] == key), None)


def main():
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    sid, gid, name, code, released = sys.argv[1:]
    products = json.load(open(os.path.join(CACHE, "tcgcsv", f"{gid}-products.json")))["results"]
    prices = json.load(open(os.path.join(CACHE, "tcgcsv", f"{gid}-prices.json")))["results"]
    kinds = {}
    for p in prices:
        kinds.setdefault(p["productId"], set()).add(p["subTypeName"])
    cards, official = [], None
    for p in products:
        number = ext(p, "Number")
        if not number:
            continue
        local, _, total = number.partition("/")
        official = official or int(total)
        ctype, rarity = ext(p, "Card Type") or "", ext(p, "Rarity") or ""
        card_name = re.sub(r"\s*-\s*\d+/\d+", "", p["name"])
        types, trainer, energy = None, None, None
        if ctype.startswith("Trainer"):
            category, trainer = "Trainer", ctype.split(" - ", 1)[-1].replace("Pokemon Tool", "Tool")
        elif "Energy" in ctype:
            category, energy = "Energy", "Special" if ctype.startswith("Special") else "Normal"
        else:
            category, types = "Pokemon", [ctype]
        found = sorted({VARIANT[k] for k in kinds.get(p["productId"], ()) if k in VARIANT})
        if not found:
            found = ["normal", "reverse"] if rarity in LOW else ["holo"]
        cid = f"{sid}-{local}"
        cards.append({"id": cid, "localId": local, "name": card_name})
        path = os.path.join(CACHE, "tcgdex", "cards", f"{cid}.json")
        if os.path.exists(path) and "tcgcsvGroup" not in json.load(open(path)):
            continue
        json.dump({"id": cid, "localId": local, "name": card_name, "category": category, "types": types,
                   "stage": ext(p, "Stage"), "suffix": "EX" if re.search(r"\bex\b", card_name) else None,
                   "trainerType": trainer, "energyType": energy, "rarity": RARITY.get(rarity, rarity),
                   "variants": {"firstEdition": False, "holo": "holo" in found, "normal": "normal" in found,
                                "reverse": "reverse" in found, "wPromo": False},
                   "variants_detailed": [{"type": v, "size": "standard"} for v in ("normal", "reverse", "holo") if v in found],
                   "tcgcsvGroup": int(gid)}, open(path, "w"))
    cards.sort(key=lambda c: int(re.sub(r"\D", "", c["localId"]) or 0))
    spath = os.path.join(CACHE, "tcgdex", "sets", f"{sid}.json")
    if os.path.exists(spath) and "tcgcsvGroup" not in json.load(open(spath)):
        sys.exit(f"{spath} came from TCGdex. Nothing to do.")
    json.dump({"cardCount": {"official": official, "total": len(cards)}, "id": sid, "name": name,
               "releaseDate": released, "serie": {"id": re.match(r"[a-z]+", sid).group(0), "name": "Mega Evolution"},
               "abbreviation": {"official": code}, "cards": cards, "tcgcsvGroup": int(gid)}, open(spath, "w"))
    print(f"{sid}: {len(cards)} cards ({official} main) from TCGCSV group {gid}")


if __name__ == "__main__":
    main()
