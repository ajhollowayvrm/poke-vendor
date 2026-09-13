"""Extract what each sealed product holds: packs by set, and promo cards.

Usage:
  python3 tools/ppt/sealed_contents.py              dry run: coverage report and sample products
  python3 tools/ppt/sealed_contents.py --json       also write tools/ppt/cache/sealed_contents.json

Sources, in order:
1. tools/ppt/sealed_overrides.json: researched contents, with a source URL for each product (in git).
2. The Bulbapedia TCG merchandise section that matches the product (cached raw wiki text).
3. The TCGplayer description (TCGCSV CardText).

Confidence for the pack mix:
- Exact: the counts by set add up to the pack total.
- Partial: some packs have no named set. The mix counts them under "<series> Series" when the text names the
  series ("four XY Series booster packs"), else under "unknown".
- Conflict: the mix holds more packs than the pack total. Often the Bulbapedia section describes two products.
- Product set: a single-set product (booster box, ETB, booster bundle, Build & Battle, a set blister)
  with no mix stated. All packs are from the product's own set.
- Unknown: no pack mix.
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, HERE)
import sealed_catalog as C  # noqa: E402

OVERRIDES = os.path.join(HERE, "sealed_overrides.json")
COUNT = r"(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)"
COUNT_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
               "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}
SINGLE_SET_KINDS = {"Booster box", "Elite Trainer Box", "Booster bundle", "Build & Battle", "Booster pack", "Prize pack"}


def count(s):
    return int(s) if s.isdigit() else COUNT_WORDS.get(s.lower())


def set_names():
    # {alias (lower case): slug}, from the link texts in docs/13-sets.md, plus common short forms.
    idx = open(os.path.join(ROOT, "docs", "13-sets.md")).read()
    out = {}
    for text, slug in re.findall(r"\[([^\]]+)\]\(sets/([a-z0-9-]+)\.md\)", idx):
        if slug.startswith("prize-pack") or slug == "pop-series":
            continue
        names = {text}
        if text.startswith("EX "):
            names.add(text[3:])
        names.add(text.replace("&", "and"))
        for n in names:
            out[n.lower()] = slug
    out.update({"sword & shield base set": "sword-shield", "sun & moon base set": "sun-moon", "xy base set": "xy",
                "scarlet & violet base set": "scarlet-violet", "base set": "base-set", "pokémon go": "pokemon-go",
                "pokemon go": "pokemon-go", "scarlet & violet—151": "151", "151": "151"})
    return out


SETS = set_names()
SET_RE = "|".join(sorted((re.escape(n) for n in SETS), key=len, reverse=True))
# A series name before the set, such as "Sun & Moon — " in "Sun & Moon — Unbroken Bonds".
# Also a short series name with no dash, such as "XY " in "2 XY Evolutions booster packs".
PREFIX = r"(?:pokémon\s+tcg:?\s+)?(?:[\w&]+(?:\s+[\w&]+){0,3}\s*[—–-]\s*|(?:xy|sm|swsh|sv|me)\s+)?"
DASH_PREFIX = r"(?:[\w&]+(?:\s+[\w&]+){0,3}\s*[—–]\s*|(?:xy|sm|swsh|sv|me)\s+)?"
PACK_WORDS = r"(?:\s+\w+-card)?(?:\s+mini)?(?:\s+booster)?\s+packs?"
# A count and a set, with the word "pack", so "an XY Promo" is not a pack.
MIX_RE = re.compile(
    COUNT + r"\s+(?:(?:booster\s+)?packs?\s+(?:from|of)\s+(?:the\s+)?" + PREFIX + r"(" + SET_RE + r")"
    r"|" + PREFIX + r"(" + SET_RE + r")(?:\s+(?:expansion|set))?" + PACK_WORDS + r")\b", re.I)
SET_ONLY_RE = re.compile(DASH_PREFIX + r"(" + SET_RE + r")\b", re.I)
SEP = r"(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)"
# "one Journey Together, one Mega Evolution and two Phantasmal Flames", "2 Flashfire & 1 XY", "two from the Call of
# Legends expansion and 1 from the Undaunted expansion": two or more counts, each with a set. A list needs no word "pack".
ITEM = (COUNT + r"\s+(?:(?:booster\s+packs?\s+)?from\s+(?:the\s+)?)?" + DASH_PREFIX + r"(" + SET_RE + r")\b(?:\s+expansion\b)?"
        r"(?:" + PACK_WORDS + r"\b)?")
ITEM_RE = re.compile(ITEM, re.I)
LIST_RE = re.compile(ITEM + r"(?:" + SEP + ITEM + r")+", re.I)
# "one booster pack from each of: A, B, and C", "four each from Sword & Shield, Rebel Clash, and Darkness Ablaze".
SET_LIST = DASH_PREFIX + r"(?:" + SET_RE + r")\b(?:" + SEP + DASH_PREFIX + r"(?:" + SET_RE + r")\b)*"
EACH_RE = re.compile(COUNT + r"\s+(?:booster\s+packs?\s+)?(?:(?:from|of)\s+)?each\s+(?:(?:from|of)\s+)?(?:the\s+)?"
                     r"(?:[\w&'’ —–-]{0,60}?)(?::\s*)?(" + SET_LIST + r")", re.I)
# "two Scarlet & Violet Series booster packs (one Scarlet & Violet and one Paldea Evolved)", "four booster packs—typically
# two Temporal Forces and ...": the breakdown names the sets, so drop the outer count.
BREAKDOWN_RE = re.compile(COUNT + r"\s+(?:[\w&'’—–-]+\s+){0,6}?(?:booster\s+)?packs?\s*(?:\(\s*|[—–:]\s*|,\s*(?=typically|usually|generally))"
                          r"(?:typically\s+|usually\s+|generally\s+)?"
                          r"(?=" + COUNT + r"\s+(?:each\b|(?:from\s+(?:the\s+)?)?" + DASH_PREFIX + r"(?:" + SET_RE + r")\b))", re.I)
# "two other Sword & Shield Series booster packs": packs from an unnamed set in a named series.
SERIES = {p.lower(): p for v in C.BP_PAGES.values() for p in v}
SERIES_RE = re.compile(COUNT + r"\s+(?:other\s+|additional\s+|more\s+)?(?:pokémon\s+tcg:?\s+)?((?:[\w&]+\s+){0,2}?[\w&]+)\s+series\s+(?:booster\s+)?packs?\b", re.I)
# "Two Additional Pokemon TCG Booster Packs": packs from an unnamed set.
OTHER_RE = re.compile(COUNT + r"\s+(?:additional|other|more|random|extra|bonus)\s+(?:pok[ée]mon\s+tcg\s+)?(?:booster\s+)?packs?\b", re.I)
# "three booster packs of the expansion": packs from the product's own set.
SELF_RE = re.compile(COUNT + r"\s+(?:booster\s+)?packs?\s+(?:of|from)\s+the\s+(?:same\s+)?expansion\b", re.I)


def unnamed(key):
    return key == "unknown" or key.endswith(" Series")


def pack_mix(text, slug=None):
    # {slug: count} from phrases such as "two Platinum booster packs" or "one booster pack from each of: A, B, and C".
    # Packs from an unnamed set count under "<series> Series" when the text names the series, else under "unknown".
    mix = collections.Counter()
    text = BREAKDOWN_RE.sub(" ", text)
    for m in EACH_RE.finditer(text):
        for s in SET_ONLY_RE.finditer(m.group(2)):
            mix[SETS[s.group(1).lower()]] += count(m.group(1)) or 0
    text = EACH_RE.sub(" ", text)
    for m in LIST_RE.finditer(text):
        for i in ITEM_RE.finditer(m.group(0)):
            mix[SETS[i.group(2).lower()]] += count(i.group(1)) or 0
    text = LIST_RE.sub(" ", text)
    for m in SERIES_RE.finditer(text):
        series = SERIES.get(m.group(2).replace(" and ", " & ").lower())
        mix[f"{series} Series" if series else "unknown"] += count(m.group(1)) or 0
    text = SERIES_RE.sub(" ", text)
    for regex, key in ((OTHER_RE, "unknown"), (SELF_RE, slug)):
        for m in regex.finditer(text):
            if key and count(m.group(1)):
                mix[key] += count(m.group(1))
        text = regex.sub(" ", text)
    for m in MIX_RE.finditer(text):
        n = count(m.group(1))
        set_slug = SETS.get((m.group(2) or m.group(3)).lower())
        if n and set_slug and n <= 36:
            mix[set_slug] += n
    return +mix


def promo_cards(raw_section):
    body = raw_section.split("Product images")[0]
    if "romotional card" not in body:
        return []
    out = []
    for set_name, name, number in re.findall(r"\{\{TCG ID\|([^|}]*)\|([^|}]*)\|([^|}]*)", body.split("romotional card", 1)[1]):
        item = f"{name.strip()} ({set_name.strip()} {number.strip()})"
        if item not in out:
            out.append(item)
    return out


def bp_index():
    # {page: [(title, tokens, raw section text)]}
    out = {}
    for page in sorted({p for v in C.BP_PAGES.values() for p in v}):
        path = os.path.join(C.BULBAPEDIA, f"{page} TCG Series merchandise".replace(" ", "_").replace("&", "_") + ".wiki")
        if not os.path.exists(path):
            continue
        parts = re.split(r"^==([^=].*?)==\s*$", open(path, errors="ignore").read(), flags=re.M)
        out[page] = [(parts[i].strip(), C.bp_tokens(parts[i]), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    return out


def contents_for(row, slug, era, text, index, overrides, own_set=frozenset()):
    pid = str(row["id"])
    if pid in overrides:
        o = overrides[pid]
        return {"packs": o.get("packs"), "mix": o.get("mix", {}), "promos": o.get("promos", []),
                "other": o.get("other", ""), "source": o.get("source", "Research"), "confidence": o.get("confidence", "Exact")}
    packs = int(row["packs"]) if str(row["packs"]).isdigit() else None
    section = C.bp_best(row["name"], era, index, own_set)
    mix, promos, source = collections.Counter(), [], ""
    if section:
        title, _, raw = section
        clean = C.bp_clean(raw).split("Product images:")[0]
        mix = pack_mix(clean, slug)
        promos = promo_cards(raw)
        source = f"Bulbapedia: {title}"
    if not mix and text:
        mix = pack_mix(text, slug)
        if mix:
            source = "TCGplayer description"
    total_mix = sum(mix.values())
    mult = re.search(r"\[(?:bundle|set) of (\d+)\]", row["name"], re.I)
    if mult and total_mix and packs and total_mix * int(mult.group(1)) == packs:
        mix = collections.Counter({k: v * int(mult.group(1)) for k, v in mix.items()})
        total_mix = sum(mix.values())
    known = total_mix - sum(v for k, v in mix.items() if unnamed(k))
    # A blister with its own set in the name, such as "Perfect Order Premium Checklane Blister", holds that set's packs.
    single_set = row["kind"] in SINGLE_SET_KINDS or (row["kind"] == "Blister" and own_set and own_set <= C.bp_tokens(row["name"]))
    if packs and total_mix > packs:
        confidence = "Conflict"
    elif packs and known == packs:
        confidence = "Exact"
    elif packs and total_mix:
        confidence = "Partial"
    elif total_mix and not packs:
        packs, confidence = total_mix, "Exact" if known == total_mix else "Partial"
    elif packs and slug and single_set:
        mix, confidence, source = collections.Counter({slug: packs}), "Product set", source or "Product kind"
    elif packs == 0:
        confidence = "Exact"
    else:
        confidence = "Unknown"
    return {"packs": packs, "mix": dict(mix), "promos": promos, "other": "", "source": source or "—", "confidence": confidence}


def all_contents():
    overrides = json.load(open(OVERRIDES)) if os.path.exists(OVERRIDES) else {}
    release_by_slug, priced = C.set_release_dates(), C.ppt_ids()
    idx = open(os.path.join(ROOT, "docs", "13-sets.md")).read()
    eras = {}
    for mm in re.finditer(r"^- \*\*(.+?)\*\* —\s*\n?\s*\[eras/([^\]]+)\.md\].*?(?=^- \*\*|\Z)", idx, re.S | re.M):
        for s in re.findall(r"\(sets/([a-z0-9-]+)\.md\)", mm.group(0)):
            eras.setdefault(s, mm.group(2))
    sections, index = C.bp_sections(), bp_index()
    out = []
    for gid, (g, prods) in C.products_by_group().items():
        texts = {x["productId"]: t for x, t in prods}
        slug, own_set = C.SLUG_OF.get(gid), C.own_set_tokens(gid)
        for row in C.build_rows(gid, prods, release_by_slug, priced, eras, sections):
            if row["kind"] == "Case or display":
                continue
            c = contents_for(row, slug, eras.get(slug), texts.get(row["id"], ""), index, overrides, own_set)
            out.append({"group": gid, "group_name": g["name"], "slug": slug, **row, **c})
    return out


if __name__ == "__main__":
    rows = all_contents()
    conf = collections.defaultdict(collections.Counter)
    for r in rows:
        conf[r["kind"]][r["confidence"]] += 1
        conf["_all"][r["confidence"]] += 1
    for k, c in sorted(conf.items()):
        print(f"{k}: {dict(c)}")
    print("products with promo cards:", sum(1 for r in rows if r["promos"]))
    import random
    random.seed(5)
    for label in ("Exact", "Partial", "Unknown"):
        pick = [r for r in rows if r["confidence"] == label and r["kind"] not in ("Booster box", "Booster pack")]
        print(f"--- {label} samples")
        for r in random.sample(pick, min(6, len(pick))):
            print(f"   {r['name']} | packs {r['packs']} | mix {r['mix']} | promos {r['promos'][:2]} | {r['source']}")
    if "--json" in sys.argv:
        json.dump(rows, open(os.path.join(HERE, "cache", "sealed_contents.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote tools/ppt/cache/sealed_contents.json")
