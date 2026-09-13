"""Build a '## Card list' section for each set file from the TCGdex cache.

Usage: python3 tools/cardlist/cardlist.py [--write] [slug ...]
First run tools/cardlist/download.py to fill tools/cardlist/cache/ (not in git).
Without --write, prints a report and a sample. With --write, edits docs/sets/<slug>.md.
"""
import collections, json, os, re, sys

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
HERE = os.path.dirname(os.path.abspath(__file__))
MAP = json.load(open(os.path.join(HERE, "tcgdex-map.json")))
FETCHED = "2026-09-12"
PREFER_TCGCSV = "--keep-tcgdex-plain" not in sys.argv

TYPE = {"normal": "Normal", "reverse": "Reverse holo", "holo": "Holo"}
FOIL = {"pokeball": "Poké Ball pattern", "masterball": "Master Ball pattern"}
STAMP = {"1st-edition": "1st Edition", "1999-2000-copyright": "1999–2000 copyright", "1999-copyright": "1999 copyright",
         "pre-release": "Prerelease", "prerelease": "Prerelease", "wotc": "WotC", "d-edition-error": "D Edition error",
         "1st-edition-scratch-error": "1st Edition scratch error", "poketour-99": "PokéTour 99"}
CATEGORY = {"Pokemon": "Pokémon", "Trainer": "Trainer", "Energy": "Energy"}


def words(s):
    return STAMP.get(s) or FOIL.get(s) or s.replace("-", " ").replace("_", " ").capitalize()


def variant_text(v):
    base = TYPE.get(v.get("type"), words(v.get("type") or "Unknown"))
    extra = []
    if v.get("subtype"):
        extra.append(words(v["subtype"]))
    if v.get("foil"):
        extra.append(words(v["foil"]))
    for s in v.get("stamp") or []:
        extra.append(words(s))
    if v.get("size") and v["size"] != "standard":
        extra.append(words(v["size"]))
    return base + (f" ({', '.join(extra)})" if extra else "")


def variants_cell(c):
    detailed = c.get("variants_detailed") or []
    if detailed:
        seen, out = set(), []
        for v in detailed:
            t = variant_text(v)
            if t not in seen:
                seen.add(t)
                out.append(t)
        return ", ".join(out)
    flags = c.get("variants") or {}
    names = {"normal": "Normal", "reverse": "Reverse holo", "holo": "Holo", "firstEdition": "1st Edition", "wPromo": "W Promo"}
    out = [names[k] for k in ("normal", "reverse", "holo", "firstEdition", "wPromo") if flags.get(k)]
    return ", ".join(out) if out else "—"


def category_cell(c):
    cat = CATEGORY.get(c.get("category"), c.get("category") or "—")
    if c.get("category") == "Pokemon" and c.get("types"):
        return f"{cat} ({', '.join(c['types'])})"
    if c.get("category") == "Trainer" and c.get("trainerType"):
        return f"{cat} ({c['trainerType']})"
    if c.get("category") == "Energy" and c.get("energyType"):
        return f"{cat} ({c['energyType']})"
    return cat


def cell(s):
    return str(s).replace("|", "\\|")


def number_cell(local_id, official):
    if official and re.fullmatch(r"\d+", str(local_id)):
        width = len(str(official)) if len(str(local_id)) < len(str(official)) and str(local_id).startswith("0") else len(str(local_id))
        return f"{local_id}/{str(official).zfill(width) if width > len(str(official)) else official}"
    return str(local_id)


def sort_key(c):
    lid = str(c["localId"])
    m = re.match(r"^([A-Za-z]*)(\d+)(.*)$", lid)
    return (m.group(1), int(m.group(2)), m.group(3)) if m else (lid, 0, "")


CACHE = os.path.join(HERE, "cache")
TCGCSV_DIR = os.path.join(CACHE, "tcgcsv")
TCGCSV_MAP = json.load(open(os.path.join(HERE, "tcgcsv-map.json")))
PRINT_QUALIFIER = re.compile(r"(?i)pattern|\bball\b|pre-?release|staff|jumbo|oversize|cosmos|stamp|promo|league|championship|winner|peelable|holo common|non-holo|\bholo\b|texture|error|misprint|sealed|code card|build|deck")
SKIPPED = {}
SUBTYPE = {"Normal": "Normal", "Holofoil": "Holo", "Reverse Holofoil": "Reverse holo",
           "1st Edition Holofoil": "Holo (1st Edition)", "1st Edition Normal": "Normal (1st Edition)",
           "Unlimited Holofoil": "Holo (Unlimited)", "Unlimited Normal": "Normal (Unlimited)"}


def key_of(number):
    m = re.match(r"^([A-Za-z]*)0*(\d+)", str(number).strip())
    return (m.group(1).upper(), int(m.group(2))) if m else (str(number), -1)


def base_kind(variant):
    return next((k for k in ("Reverse holo", "Normal", "Holo") if variant == k or variant.startswith(k + " (")), variant)


def tcgcsv_types(slug, part_index, part_count):
    groups = TCGCSV_MAP.get(slug, [])
    if len(groups) == part_count:
        groups = [groups[part_index]]
    elif part_index > 0:
        return {}
    out = {}
    for gid in groups:
        try:
            products = {x["productId"]: x for x in json.load(open(os.path.join(TCGCSV_DIR, f"{gid}-products.json")))["results"]}
            prices = json.load(open(os.path.join(TCGCSV_DIR, f"{gid}-prices.json")))["results"]
        except (OSError, KeyError, ValueError):
            continue
        for r in prices:
            prod = products.get(r["productId"])
            if not prod:
                continue
            if PRINT_QUALIFIER.search(" ".join(re.findall(r"\(([^()]*)\)", prod.get("name", "")))):
                ext_q = {e["name"]: e["value"] for e in prod.get("extendedData", [])}
                if "Number" in ext_q:
                    SKIPPED.setdefault((slug, part_index), set()).add(key_of(ext_q["Number"].split("/")[0]))
                continue
            ext = {e["name"]: e["value"] for e in prod.get("extendedData", [])}
            if "Number" not in ext:
                continue
            v = SUBTYPE.get(r.get("subTypeName"))
            if v:
                lst = out.setdefault(key_of(ext["Number"].split("/")[0]), [])
                if v not in lst:
                    lst.append(v)
    return out


def build(slug):
    parts, report = [], []
    ids = MAP[slug]
    total_cards = 0
    added = [0]
    removed = collections.Counter()
    for sid in ids:
        s = json.load(open(os.path.join(CACHE, "tcgdex", "sets", f"{sid}.json")))
        official = (s.get("cardCount") or {}).get("official")
        cards = []
        for brief in s["cards"]:
            path = os.path.join(CACHE, "tcgdex", "cards", f"{brief['id']}.json")
            if not os.path.exists(path):
                report.append(f"missing card {brief['id']}")
                continue
            cards.append(json.load(open(path)))
        cards.sort(key=sort_key)
        total_cards += len(cards)
        extra = tcgcsv_types(slug, ids.index(sid), len(ids))
        def cell_for(c):
            text = variants_cell(c)
            tcg = extra.get(key_of(c["localId"]), [])
            items = [v.strip() for v in re.split(r",\s*(?![^()]*\))", text) if v.strip() and v.strip() != "—"]
            k = key_of(c["localId"])
            if tcg and PREFER_TCGCSV and k not in SKIPPED.get((slug, ids.index(sid)), set()):
                tcg_kinds = {base_kind(v) for v in tcg}
                if "Holo" in tcg_kinds and "Normal" not in tcg_kinds and "Normal" in items:
                    items = [v for v in items if v != "Normal"]
                    removed["Normal"] += 1
            have = {base_kind(v) for v in items}
            add = [v for v in tcg if base_kind(v) not in have]
            if add:
                added[0] += len(add)
                items += add
            return ", ".join(items) if items else "—"
        rows = [f"| {cell(number_cell(c['localId'], official))} | {cell(c['name'])} | {cell(category_cell(c))} | {cell(c.get('rarity') or '—')} | {cell(cell_for(c))} |" for c in cards]
        table = ["| No. | Card | Category | Rarity | Variants |", "|---|---|---|---|---|"] + rows
        if len(ids) > 1:
            parts.append(f"### {s['name']}\n\nTCGdex set `{sid}`: {len(cards)} cards.\n\n" + "\n".join(table))
        else:
            parts.append("\n".join(table))
        report.append(f"{sid}: {len(cards)} cards (TCGdex total {(s.get('cardCount') or {}).get('total')}), TCGCSV added so far {added[0]}, removed so far {dict(removed)}")
    ids_text = ", ".join(f"`{i}`" for i in ids)
    intro = (
        "## Card list\n\n"
        f"Every card in the set, with its variants. Source: the TCGdex API (set {ids_text}), fetched {FETCHED}. "
        f"The list has {total_cards} cards.\n\n"
        "- **Rarity** is the TCGdex rarity name. It can differ from the name in the rarity list below.\n"
        "- **Variants** are the print versions that TCGdex records for the card. A pattern in parentheses is the foil "
        "pattern, for example \"Reverse holo (Poké Ball pattern)\". \"1st Edition\" is a stamp.\n"
        "- A variant in this list can come from a product other than a booster pack.\n"
        + (f"- Where TCGdex records no Normal, Holo, or Reverse holo version of a card, the list adds that print type from the TCGplayer catalog (TCGCSV group {', '.join(f'`{g}`' for g in TCGCSV_MAP.get(slug, []))}, fetched {FETCHED}). This added {added[0]} variants.\n" if added[0] else "")
        + (f"- Where the TCGplayer catalog lists a card only as holo, the list removes the plain Normal print that TCGdex gives it. This removed {removed['Normal']} prints.\n" if removed.get("Normal") else "")
        + "\n"
    )
    return intro + "\n\n".join(parts) + "\n", report, total_cards


def insert(slug, section):
    path = os.path.join(REPO, "docs", "sets", f"{slug}.md")
    t = open(path).read()
    if "\n## Card list\n" in t:
        start = t.index("\n## Card list\n") + 1
        end = t.find("\n## ", start + 5)
        t = t[:start] + section + "\n" + t[end + 1:] if end != -1 else t[:start] + section
    else:
        anchor = "\n## Rarity list\n" if "\n## Rarity list\n" in t else "\n## Sources\n"
        i = t.index(anchor) + 1
        t = t[:i] + section + "\n" + t[i:]
    open(path, "w").write(t)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--write"]
    write = "--write" in sys.argv
    slugs = args or list(MAP.keys())
    grand = 0
    for slug in slugs:
        section, report, n = build(slug)
        grand += n
        bad = [r for r in report if r.startswith("missing")]
        print(f"{slug}: {n} cards; " + "; ".join(r for r in report if not r.startswith("missing")) + (f"; MISSING {len(bad)}" if bad else ""))
        if write:
            insert(slug, section)
        elif len(slugs) <= 2:
            print(section[:2500])
    print("TOTAL", grand)
