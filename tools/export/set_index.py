"""Write the list of sets that the app has, for the iOS app.

Usage: python3 tools/export/set_index.py

Run tools/export/rip_set.py for each set first. Writes app/PokeVendor/Resources/set-index.json: one entry for each set
file, with its slug, name, era, series, the number of prints, and the release date (TCGdex). The app uses it to group the sets by era (vintage,
older, and modern) without loading every set file.
"""
import glob, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog as C  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SETS = os.path.join(ROOT, "app", "PokeVendor", "Resources", "Sets")
OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "set-index.json")

# Oldest first.
ERA_ORDER = ["wizards-of-the-coast", "e-card", "ex", "diamond-pearl-platinum", "heartgold-soulsilver", "black-white", "xy",
             "sun-moon", "sword-shield", "scarlet-violet", "mega-evolution"]


def main():
    releases = C.set_releases(C.load_sets())
    out = []
    for f in glob.glob(os.path.join(SETS, "*.json")):
        d = json.load(open(f))
        out.append({"slug": d["slug"], "name": d["name"], "era": d.get("era") or "", "series": d.get("series") or "",
                    "prints": len(d["prints"]), "release": releases.get(d["slug"])})
    out.sort(key=lambda x: (ERA_ORDER.index(x["era"]) if x["era"] in ERA_ORDER else 99, x["name"]))
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} sets -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
