"""Build the card list and set file of each Play! Pokémon Prize Pack series from the Bulbapedia pages.

Usage:
  python3 tools/cardlist/prizepack.py            dry run: print a summary and sample rows for each series
  python3 tools/cardlist/prizepack.py --json     also write tools/cardlist/cache/prizepack.json
  python3 tools/cardlist/prizepack.py --write    write docs/sets/prize-pack-series-<one..nine>.md

Source: tools/ppt/cache/bulbapedia/prize-pack/series-<One..Nine>.wiki (raw wiki text, not in git).
Each card keeps its original set and number. A card listed as both "Standard Set" and
"Standard Set Foil" becomes one row with two variants.
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
PAGES = os.path.join(ROOT, "tools", "ppt", "cache", "bulbapedia", "prize-pack")
DOCS = os.path.join(ROOT, "docs", "sets")
SERIES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
TYPES = {"Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy", "Dragon", "Colorless"}
TRAINER = {"Item", "Supporter", "Stadium", "Pokémon Tool", "Tool", "Technical Machine", "Trainer"}
SUFFIX = {"TCGV": " V", "TCGVMAX": " VMAX", "TCGVSTAR": " VSTAR", "VMAX": " VMAX", "VSTAR": " VSTAR", "V": " V", "TCGVUNION": " V-UNION", "ex": " ex", "EX": "-EX",
          "GX": "-GX", "Star": " ☆", "TCGRadiant": "", "Radiant": ""}
STAMP = "Play! Pokémon stamp"
FETCHED = "2026-09-12"
PACK_SIZE = 6
NO_RARITY = "No rarity (promo or Basic Energy)"


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
    return (radiant + re.sub(r"<[^>]+>|'{2,3}", "", name)).strip()


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
        if rarity in ("-", "—", "", "None"):
            rarity = NO_RARITY
        printing = clean_note(f[-1])
        variant = f"Holo ({STAMP})" if "foil" in printing.lower() else f"Normal ({STAMP})"
        key = (set_name, number, name)
        row = cards.setdefault(key, {"set": set_name, "number": number, "name": name, "category": cat,
                                     "rarity": rarity, "variants": []})
        if variant not in row["variants"]:
            row["variants"].append(variant)
    for row in cards.values():
        row["variants"].sort(key=lambda v: 0 if v.startswith("Normal") else 1)
    info["rows"] = list(cards.values())
    return info


def cell(s):
    return str(s).replace("|", "\\|")


def pct(x):
    return f"{x:.2f}%"


def write_doc(info):
    n = info["series"]
    slug = f"prize-pack-series-{n.lower()}"
    rows = info["rows"]
    year = re.search(r"(\d{4})", info["release"])
    year = year.group(1) if year else "?"
    title = f"Play! Pokémon Prize Pack Series {n}"
    page = f"https://bulbapedia.bulbagarden.net/wiki/Play!_Pok%C3%A9mon_Prize_Pack_Series_{n}_(TCG)"

    # Card count share for each (rarity, print) and for each rarity. No source gives the odds.
    total_variants = sum(len(r["variants"]) for r in rows)
    by_pair = collections.Counter((r["rarity"], v) for r in rows for v in r["variants"])
    by_rarity = collections.Counter()
    for (rar, v), k in by_pair.items():
        by_rarity[rar] += k
    foil_variants = sum(k for (rar, v), k in by_pair.items() if v.startswith("Holo"))

    def per_pack(k):
        share = k / total_variants
        return 100 * (1 - (1 - share) ** PACK_SIZE)

    lines = [f"# {title} ({year})", "",
             f"Set data for {title}. A Prize Pack is a {PACK_SIZE}-card pack of reprints with a Play! Pokémon stamp. "
             f"This file follows the set file format in [../13-sets.md](../13-sets.md). "
             f"Generated by `python3 tools/cardlist/prizepack.py --write`. Do not edit the generated sections by hand.", "",
             "## Release", "",
             "| Field | Value | Source |", "|---|---|---|",
             f"| Release | {info['release']} | Bulbapedia |",
             f"| Cards | {info['cards']} | Bulbapedia |",
             f"| Cards in the card list below | {len(rows)} ({total_variants} prints) | Bulbapedia set list |",
             f"| Cards per pack | {info['per_pack']} | Bulbapedia |", "",
             "## How the product is sold", "",
             "- Stores give Prize Packs as prizes at Play! Pokémon league events. The official Prize Pack FAQ says "
             "\"Prize Packs should never be sold.\" Stores get an allocation each quarter, by attendance. Confidence: Official.",
             "- On the secondary market, resellers sell sealed cases of 700 packs. Confidence: Community (seller listing).",
             "- The TCGplayer catalog lists each series as one product. See "
             "[sealed-multi-set.md](sealed-multi-set.md) (TCGplayer group `22880`).", "",
             "## Pack structure", "",
             f"- A pack holds {PACK_SIZE} cards from this series. Confidence: Official (Bulbapedia, from the product text).",
             "- No source gives fixed slots, the number of foil cards in a pack, or pull rates. "
             "Searched 2026-09-12: no source found.",
             f"- The card list has {foil_variants} foil prints and {total_variants - foil_variants} non-foil prints.",
             "- A foil print (\"Standard Set Foil\") is Cosmos Holofoil. Pokémon V, VMAX, VSTAR, ex, and ACE SPEC cards keep "
             "their original foil. Confidence: Community estimate.", "",
             "## Pack order", "",
             "Unknown. Searched 2026-09-12: no source found.", "",
             "## Card list", "",
             f"Every card in the series, with its prints. Source: the Bulbapedia set list for {title}, fetched {FETCHED}. "
             f"The list has {len(rows)} cards.", "",
             "- **No.** is the original set and number. Every card keeps its original number.",
             "- **Rarity** is the Bulbapedia rarity of the original card.",
             f"- **Variants:** \"Holo ({STAMP})\" is the \"Standard Set Foil\" print. \"Normal ({STAMP})\" is the \"Standard Set\" print.", "",
             "| No. | Card | Category | Rarity | Variants |", "|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {cell(r['set'] + ' ' + r['number'])} | {cell(r['name'])} | {cell(r['category'])} | {cell(r['rarity'])} | {cell(', '.join(r['variants']))} |")

    # Slot map: one slot of 6 cards, one row per (rarity, print). No odds, so the missing-odds rule uses card counts.
    lines += ["", "## Slot map", "",
              "How the game builds one pack from the card list. Each row is one", "outcome of one slot. The game picks one outcome for each card in the",
              "slot, then picks one card at random from the cards that match the row.", "",
              "- **Slot** and **Count** come from the pack structure above.",
              "- **Rarity list entry** links the outcome to the stop rule.",
              "- **TCGdex rarity** and **Variant** match the card list exactly.",
              "- **Cards** limits the matching cards: `All`, `Nos. a–b`, `Not nos. a–b`,",
              "  `Part: <card list table>`, or `Category: <category>`.",
              "- **Odds in slot** is the chance of the outcome for one card in the",
              "  slot. `Rest` is the remainder. `—` means no source gives the odds.",
              "- A variant that no row uses does not come from booster packs.", "",
              "Confidence: no source gives slots or odds for a Prize Pack. The map uses one slot of "
              f"{PACK_SIZE} cards, and every outcome has `—` odds. The missing-odds rule then shares the slot by card count "
              "(see [../18-ripping.md](../18-ripping.md#missing-odds)). The TCGdex rarity column holds the Bulbapedia rarity.", "",
              "| Slot | Count | Outcome | Rarity list entry | TCGdex rarity | Variant | Cards | Odds in slot |",
              "|---|---|---|---|---|---|---|---|"]
    for (rar, v), k in sorted(by_pair.items(), key=lambda kv: (-kv[1], kv[0])):
        label = f"{rar} ({'foil' if v.startswith('Holo') else 'non-foil'})"
        lines.append(f"| Card | {PACK_SIZE} | {cell(label)} | {cell(rar)} | {cell(rar)} | {cell(v)} | All | — |")

    # Rarity list: most common first, by card count share. The odds are estimates.
    lines += ["", "## Rarity list", "",
              "The stop rule menu on the rip screen shows this list (see",
              "[../18-ripping.md](../18-ripping.md#the-stop-rule)). The list goes from",
              "the most common entry to the rarest entry. No source gives Prize Pack odds, so the order and the odds come",
              f"from the card count share: the chance that a pack of {PACK_SIZE} cards holds at least one card of the entry.", "",
              "| # | Entry | Type | Odds per pack | Default stop |", "|---|---|---|---|---|"]
    entries = [(rar, "Rarity", k) for rar, k in by_rarity.items()] + [("Foil print", "Variant", foil_variants)]
    stop_no = {"Common", "Uncommon", NO_RARITY}
    for i, (entry, typ, k) in enumerate(sorted(entries, key=lambda e: -e[2]), 1):
        stop = "No" if entry in stop_no or typ == "Variant" else "Yes"
        lines.append(f"| {i} | {cell(entry)} | {typ} | {pct(per_pack(k))} (estimate) | {stop} |")

    lines += ["", "## Sources", "",
              f"- [Bulbapedia — {title} (TCG)]({page})",
              "- [Play! Pokémon Support — Prize Pack FAQ](https://support.play.pokemon.com/hc/en-us/articles/45957097715220-Prize-Pack-FAQ)",
              "- [I'm A Poke Trader — sealed case of Prize Pack Series 1, 700 packs](https://imapoketrader.com/products/sealed-case-of-play-pokemon-prize-pack-series-1-booster-packs-x-700-packs) (seller listing)",
              "", "## Open topics", "",
              "- **Pack structure:** the number of foil cards in a pack, and any fixed slot (for example an Energy slot). "
              "Searched 2026-09-12: no source found.",
              "- **Slot map odds:** every outcome has `—` odds. The game uses the card count share, which is an estimate.",
              "- **Rarity list odds:** no source gives the odds per pack. The odds come from the card count share.",
              "- **Foil print:** the Cosmos Holofoil rule is a community estimate. Searched 2026-09-12: no official source found."]
    if info["cards"].split(" ")[0].isdigit() and int(info["cards"].split(" ")[0]) != len(rows):
        lines.append(f"- **Card count:** Bulbapedia gives {info['cards']}, but its set list gives {len(rows)} cards. "
                     "Check the official card list PDF.")
    path = os.path.join(DOCS, f"{slug}.md")
    open(path, "w").write("\n".join(lines) + "\n")
    return slug


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
        if "--write" in sys.argv:
            print("    wrote", write_doc(info))
    if "--json" in sys.argv:
        os.makedirs(os.path.join(HERE, "cache"), exist_ok=True)
        json.dump(out, open(os.path.join(HERE, "cache", "prizepack.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote tools/cardlist/cache/prizepack.json")
