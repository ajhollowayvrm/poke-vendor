"""Build the card list of each Play! Pokémon Prize Pack series from the Bulbapedia pages.

Usage:
  python3 tools/cardlist/prizepack.py            dry run: print a summary and sample rows for each series
  python3 tools/cardlist/prizepack.py --json     also write tools/cardlist/cache/prizepack.json

Source: tools/ppt/cache/bulbapedia/prize-pack/series-<One..Nine>.wiki (raw wiki text, not in git).
Each card keeps its original set and number. A card listed as both "Standard Set" and
"Standard Set Foil" becomes one row with two variants.
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
PAGES = os.path.join(ROOT, "tools", "ppt", "cache", "bulbapedia", "prize-pack")
SERIES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
TYPES = {"Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy", "Dragon", "Colorless"}
TRAINER = {"Item", "Supporter", "Stadium", "Pokémon Tool", "Tool", "Technical Machine", "Trainer"}
SUFFIX = {"TCGV": " V", "TCGVMAX": " VMAX", "TCGVSTAR": " VSTAR", "TCGVUNION": " V-UNION", "ex": " ex", "EX": "-EX",
          "GX": "-GX", "Star": " ☆", "TCGRadiant": "", "Radiant": ""}
STAMP = "Play! Pokémon stamp"


def split_top(s):
    # Split on "|" outside {{ }} and [[ ]].
    parts, depth_c, depth_s, cur, i = [], 0, 0, "", 0
    while i < len(s):
        two = s[i:i + 2]
        if two == "{{":
            depth_c += 1; cur += two; i += 2; continue
        if two == "}}":
            depth_c -= 1; cur += two; i += 2; continue
        if two == "[[":
            depth_s += 1; cur += two; i += 2; continue
        if two == "]]":
            depth_s -= 1; cur += two; i += 2; continue
        if s[i] == "|" and depth_c == 0 and depth_s == 0:
            parts.append(cur); cur = ""; i += 1; continue
        cur += s[i]; i += 1
    parts.append(cur)
    return [p.strip() for p in parts]


def clean_note(s):
    return re.sub(r"\{\{tt\|[^{}]*\}\}", "", s).strip()


def card_name(cell):
    m = re.search(r"\{\{TCG ID\|[^|}]*\|([^|}]*)(?:\|[^}]*)?\}\}", cell)
    if m:
        name = m.group(1)
    else:
        m = re.search(r"\[\[[^\]|]*\|([^\]]*)\]\]", cell) or re.search(r"\{\{TCG\|([^|}]*)(?:\|[^}]*)?\}\}", cell)
        name = m.group(1) if m else re.sub(r"\{\{.*?\}\}|\[\[|\]\]", "", cell)
    for tpl in re.findall(r"\{\{([A-Za-z]+)\}\}", cell):
        suffix = SUFFIX.get(tpl, "")
        if suffix and not name.endswith(suffix.strip()):
            name += suffix
    radiant = "Radiant " if re.search(r"\{\{TCGRadiant\}\}|\bRadiant\b", cell) and not name.startswith("Radiant") else ""
    return (radiant + re.sub(r"<[^>]+>|'''?", "", name)).strip()


def original_set_and_number(cell):
    link = re.search(r"link=([^\]|]*?) \(TCG\)", cell)
    code = re.match(r"^\[\[([A-Z]+)\]\]\s*(\S+)$", cell)
    if code:
        return {"MEE": "Mega Evolution Energy", "SVE": "Scarlet & Violet Energy"}.get(code.group(1), code.group(1)), code.group(2)
    if cell in ("—", "-", ""):
        return "Basic Energy", "—"
    number = re.sub(r"\[\[.*?\]\]", "", cell).strip()
    if link:
        return link.group(1).strip(), number
    m = re.match(r"^([A-Z]+)(\d+)$", number)
    if m:
        prefix = {"SWSH": "SWSH Black Star Promos", "SVP": "SVP Black Star Promos", "SV": "SVP Black Star Promos",
                  "MEP": "MEP Black Star Promos"}.get(m.group(1), f"{m.group(1)} Promos")
        return prefix, number
    return "Unknown set", number


def category(type_cell):
    t = re.sub(r"\{\{.*?\}\}|\[\[|\]\]", "", type_cell).strip()
    if t in TYPES:
        return f"Pokémon ({t})"
    if t in TRAINER:
        return f"Trainer ({'Tool' if t == 'Pokémon Tool' else t})"
    if "Energy" in t:
        return f"Energy ({t.replace(' Energy', '')})" if t != "Energy" else "Energy"
    return t or "—"


def parse_series(n):
    text = open(os.path.join(PAGES, f"series-{n}.wiki"), errors="ignore").read()
    info = {
        "series": n,
        "cards": (re.search(r"\|cards=([^\n|]*)", text) or [None, "?"])[1].strip(),
        "release": (re.search(r"\|period=([^\n|]*)", text) or [None, "?"])[1].strip(),
        "per_pack": (re.search(r"(?i)each (?:booster )?pack contains (\w+) cards", text) or [None, "?"])[1],
    }
    cards = collections.OrderedDict()
    for line in text.splitlines():
        if not line.lower().startswith("{{setlist/entry"):
            continue
        f = split_top(line.strip()[2:-2])
        if len(f) < 7:
            continue
        set_name, number = original_set_and_number(f[1])
        name = card_name(f[3])
        cat = category(f[4])
        rarity = clean_note(f[6]) if len(f) > 7 else clean_note(f[5])
        if rarity in ("-", "—", ""):
            rarity = "None"
        printing = clean_note(f[-1])
        variant = f"Holo ({STAMP})" if "foil" in printing.lower() else f"Normal ({STAMP})"
        key = (set_name, number, name)
        row = cards.setdefault(key, {"set": set_name, "number": number, "name": name, "category": cat,
                                     "rarity": rarity, "variants": []})
        if variant not in row["variants"]:
            row["variants"].append(variant)
    info["rows"] = list(cards.values())
    return info


if __name__ == "__main__":
    out = []
    for n in SERIES:
        info = parse_series(n)
        out.append(info)
        rar = collections.Counter(r["rarity"] for r in info["rows"])
        both = sum(1 for r in info["rows"] if len(r["variants"]) == 2)
        unknown_sets = sum(1 for r in info["rows"] if r["set"] == "Unknown set")
        print(f"Series {n}: {len(info['rows'])} cards (Bulbapedia: {info['cards']}), release {info['release']}, "
              f"{info['per_pack']} per pack, cards in both prints {both}, unknown set {unknown_sets}")
        print(f"    rarities {dict(rar.most_common())}")
        if n in ("One", "Nine"):
            for r in info["rows"][:4] + info["rows"][-3:]:
                print(f"    | {r['set']} {r['number']} | {r['name']} | {r['category']} | {r['rarity']} | {', '.join(r['variants'])} |")
    if "--json" in sys.argv:
        os.makedirs(os.path.join(HERE, "cache"), exist_ok=True)
        json.dump(out, open(os.path.join(HERE, "cache", "prizepack.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote tools/cardlist/cache/prizepack.json")
