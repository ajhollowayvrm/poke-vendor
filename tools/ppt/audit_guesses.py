"""List the sealed products whose pack mix needs a check. Read only: it writes no file.

Usage:
  python3 tools/ppt/audit_guesses.py          print both lists, each with a count
  python3 tools/ppt/audit_guesses.py --json   print both lists as JSON to stdout, nothing else

List 1 (guessed): each catalog product with "mixGuess": true and no entry in tools/ppt/sealed_overrides.json.
Fields: ID, name, kind, packs, guessed mix, release, and the TCGplayer image URL.

List 2 (dates): each catalog product, guessed or not, with a mix set that released after the product, or more than
3 years before it. This finds a wrong "Exact" mix. The release date of a set comes from catalog.set_releases().
A product with no release date is not in list 2.

Reads app/PokeVendor/Resources/catalog.json and tools/ppt/cache/sealed_contents.json (for the product release).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "export"))
import catalog

IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{}_in_1000x1000.jpg"
MAX_AGE_MONTHS = 36


def row(x, release):
    return {"id": x["id"], "name": x["name"], "kind": x["kind"], "packs": x["packs"],
            "mix": {m["slug"]: m["packs"] for m in x["mix"]}, "guess": x["mixGuess"], "release": release,
            "image": IMAGE.format(x["id"])}


def lists():
    products = json.load(open(catalog.OUT))
    overrides = json.load(open(catalog.OVERRIDES))
    releases = {str(it["id"]): it.get("release") for it in json.load(open(catalog.CONTENTS))}
    set_dates = catalog.set_releases(catalog.load_sets())
    guessed, dates = [], []
    for x in products:
        release = releases.get(x["id"])
        if x["mixGuess"] and x["id"] not in overrides:
            guessed.append(row(x, release))
        date = catalog.product_date(release)
        if not date:
            continue
        bad = {}
        for m in x["mix"]:
            when = set_dates.get(m["slug"])
            if when and (when > date or when < catalog.months_before(date, MAX_AGE_MONTHS)):
                bad[m["slug"]] = when
        if bad:
            entry = row(x, release)
            entry["badSets"] = bad
            dates.append(entry)
    return guessed, dates


def mix_text(mix):
    return ", ".join(f"{n} {s}" for s, n in mix.items())


def main():
    guessed, dates = lists()
    if "--json" in sys.argv:
        print(json.dumps({"guessed": guessed, "dates": dates}, ensure_ascii=False, indent=1))
        return
    print("List 1: guessed mix, no override")
    for r in guessed:
        print(f"  {r['id']} | {r['name']} | {r['kind']} | {r['packs']} packs | {mix_text(r['mix'])} | {r['release']} | {r['image']}")
    print(f"{len(guessed)} guessed products without an override\n")
    print("List 2: mix set released after the product, or more than 3 years before it")
    for r in dates:
        bad = ", ".join(f"{s} ({d})" for s, d in r["badSets"].items())
        flag = "guess" if r["guess"] else "exact"
        print(f"  {r['id']} | {r['name']} | {r['kind']} | {r['packs']} packs | {mix_text(r['mix'])} | {r['release']} | {flag} | {bad} | {r['image']}")
    print(f"{len(dates)} products with a date problem")


if __name__ == "__main__":
    main()
