"""Extract what each sealed product holds: packs by set, and promo cards.

Usage:
  python3 tools/ppt/sealed_contents.py              dry run: coverage report and sample products
  python3 tools/ppt/sealed_contents.py --json       also write tools/ppt/cache/sealed_contents.json
  python3 tools/ppt/sealed_contents.py --conflicts  also list each product with the confidence Conflict

Sources, in order:
1. tools/ppt/sealed_overrides.json: researched contents, with a source URL for each product (in git).
2. The Bulbapedia TCG merchandise section that matches the product (cached raw wiki text).
3. The TCGplayer description (TCGCSV CardText).

Confidence for the pack mix:
- Exact: the counts by set add up to the pack total.
- Partial: some packs have no named set. The mix counts them under "<series> Series" when the text names the
  series ("four XY Series booster packs"), else under "unknown".
- Conflict: the mix holds more packs than the pack total, and no rule picks the part that describes the product.
  When a Bulbapedia section describes more than one product, the parser first uses the one clause whose pack total
  is the product's pack total. When the section and the TCGplayer description agree on a higher total, the parser
  raises the pack total and records it in packs_note.
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
# A count. "101" in "14/101" and the "a" at the end of a word are not counts.
COUNT_ALTS = r"\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
COUNT = r"(?<![/\w])(" + COUNT_ALTS + r")"
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
# Also "two booster packs from the Mega Evolution Series (typically ...)" and "for a total of six (typically ...)".
BREAKDOWN_RE = re.compile(r"(?:" + COUNT + r"\s+(?:[\w&'’—–-]+\s+){0,6}?(?:booster\s+)?packs?(?:\s+from\s+the\s+(?:[\w&]+\s+){1,3}?series)?"
                          r"|(?:" + COUNT + r"\s+(?:additional|other|more|extra)\s+(?:booster\s+)?packs?\s+)?for\s+a\s+total\s+of\s+" + COUNT
                          + r")\s*(?:\(\s*|[—–:]\s*|,\s*(?=typically|usually|generally))"
                          r"(?:typically\s+|usually\s+|generally\s+)?"
                          r"(?=" + COUNT + r"\s+(?:each\b|(?:from\s+(?:the\s+)?)?" + DASH_PREFIX + r"(?:" + SET_RE + r")\b))", re.I)
# "two other Sword & Shield Series booster packs": packs from an unnamed set in a named series.
SERIES = {p.lower(): p for v in C.BP_PAGES.values() for p in v}
SERIES_RE = re.compile(COUNT + r"\s+(?:other\s+|additional\s+|more\s+)?(?:pokémon\s+tcg:?\s+)?((?:[\w&]+\s+){0,2}?[\w&]+)\s+series\s+(?:booster\s+)?packs?\b", re.I)
# "Two Additional Pokemon TCG Booster Packs": packs from an unnamed set.
OTHER_RE = re.compile(COUNT + r"\s+(?:additional|other|more|random|extra|bonus)\s+(?:pok[ée]mon\s+tcg\s+)?(?:booster\s+)?packs?\b", re.I)
# "two booster packs from a selection of older Platinum Series and Diamond & Pearl Series expansions": unnamed sets.
SELECTION_RE = re.compile(COUNT + r"\s+(?:booster\s+)?packs?\s+from\s+(?:a\s+selection|an\s+assortment|a\s+variety|a\s+range)\s+of\s+"
                          r"(?:[\w&]+\s+){0,10}?expansions?\b", re.I)
# "three booster packs of the expansion": packs from the product's own set.
SELF_RE = re.compile(COUNT + r"\s+(?:booster\s+)?packs?\s+(?:of|from)\s+the\s+(?:same\s+)?expansion\b", re.I)
# Alternatives: "one from either Crimson Invasion or Rebel Clash", "either an Evolutions pack and a Guardians Rising
# pack or an Evolutions pack and a Crimson Invasion pack", "possible selections including three A and one B, or ...".
OPTION = r"(?:" + COUNT + r"\s+)?" + DASH_PREFIX + r"(?:" + SET_RE + r")\b(?:" + PACK_WORDS + r"\b)?"
OPTIONS = OPTION + r"(?:" + SEP + OPTION + r")*"
OPTION_RE = re.compile(r"(?:" + COUNT + r"\s+)?" + DASH_PREFIX + r"(" + SET_RE + r")\b", re.I)
ALT_RE = re.compile(r"(?:(?<![/\w])(?P<n>" + COUNT_ALTS + r")\s+(?:(?:free|other|additional)\s+)?(?:(?:booster\s+)?packs?\s*[—–:,]?\s*)?"
                    r"(?:(?:of|from)\s+)?)?\b(?:either|possible\s+selections\s+including)\s+"
                    r"(?P<opts>" + OPTIONS + r"(?:\s*,?\s*or\s+" + OPTIONS + r")+)", re.I)
# "one EX Deoxys or EX Legend Maker booster pack": one pack from either set.
PAIR_RE = re.compile(COUNT + r"\s+(?:" + SET_RE + r")\b\s+or\s+(?:" + SET_RE + r")\b" + PACK_WORDS + r"\b", re.I)


def unnamed(key):
    return key == "unknown" or key.endswith(" Series")


def alt_mix(m):
    # The sets in every option count as named packs. The rest of the pack count counts under "unknown".
    opts = m.group("opts")
    if not any(o.group(1) for o in OPTION_RE.finditer(opts)):
        # "Vivid Voltage, Cosmic Eclipse, Celestial Storm, or Guardians Rising": each set is one option.
        parts = [o.group(0) for o in OPTION_RE.finditer(opts)]
    else:
        parts = re.split(r"\s*,?\s*\bor\s+", opts)
    options = []
    for part in parts:
        c = collections.Counter()
        for o in OPTION_RE.finditer(part):
            c[SETS[o.group(2).lower()]] += count(o.group(1)) if o.group(1) else 1
        if c:
            options.append(c)
    if not options:
        return collections.Counter()
    common = collections.Counter({k: min(o[k] for o in options) for k in set.intersection(*(set(o) for o in options))})
    total = count(m.group("n")) if m.group("n") else max(sum(o.values()) for o in options)
    if total > sum(common.values()):
        common["unknown"] += total - sum(common.values())
    return common


def pack_mix(text, slug=None):
    # {slug: count} from phrases such as "two Platinum booster packs" or "one booster pack from each of: A, B, and C".
    # Packs from an unnamed set count under "<series> Series" when the text names the series, else under "unknown".
    mix = collections.Counter()
    text = BREAKDOWN_RE.sub(" ", text)
    # "two A and one each of B and C" becomes "two A and one B booster packs, one C booster packs", so the list keeps A.
    text = EACH_RE.sub(lambda m: ", ".join(f"{m.group(1)} {s.group(0).strip()} booster packs" for s in SET_ONLY_RE.finditer(m.group(2))), text)
    def alternatives(m):
        # Only alternatives about packs count. "print of either Phantom Forces or Primal Clash" names a card, and the
        # word "pack" in "Single Pack Blisters" is not a pack.
        before = text[max(0, m.start() - 80):m.start()]
        if re.search(r"\b(?:prints?|variants?|versions?|cards?|promos?)\s+of\s*$", before, re.I) or \
                not re.search(r"\bpacks?\b(?!\s+blisters?)", before + m.group(0), re.I):
            return m.group(0)
        mix.update(alt_mix(m))
        return " "
    text = ALT_RE.sub(alternatives, text)
    for m in PAIR_RE.finditer(text):
        mix["unknown"] += count(m.group(1)) or 0
    text = PAIR_RE.sub(" ", text)
    for m in LIST_RE.finditer(text):
        for i in ITEM_RE.finditer(m.group(0)):
            # "three Pokémon GO booster packs, a Pokémon GO rewards sheet": "a" is a count only with the word "pack".
            if i.group(1).lower() in ("a", "an") and not re.search(r"\bpacks?\b", i.group(0), re.I):
                continue
            mix[SETS[i.group(2).lower()]] += count(i.group(1)) or 0
    text = LIST_RE.sub(" ", text)
    for m in SERIES_RE.finditer(text):
        series = SERIES.get(m.group(2).replace(" and ", " & ").lower())
        mix[f"{series} Series" if series else "unknown"] += count(m.group(1)) or 0
    text = SERIES_RE.sub(" ", text)
    for regex, key in ((SELECTION_RE, "unknown"), (OTHER_RE, "unknown"), (SELF_RE, slug)):
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


CLAUSE_RE = re.compile(r"(?<=[.;])\s+(?=[A-Z0-9\"'])|;\s*|,?\s+(?=(?:while|whereas)\b)")
# A retailer, region, or version in a clause must also be in the product name, or the clause describes another product.
QUALIFIER_RE = re.compile(r"\b(walmart|target|costco|sam['’]s club|gamestop|best buy|walgreens|meijer|pok[ée]mon center|amazon|"
                          r"international|european|europe|uk|australia|australian|\d{4} version|reissue|re-release)\b", re.I)


def fold(s):
    return s.lower().replace("é", "e").replace("’", "'")


def clause_mixes(name, clean, slug):
    # [(mix, clause)] for each clause of a section that holds packs and names no qualifier absent from the product name.
    out = []
    for clause in CLAUSE_RE.split(clean):
        if any(fold(q).replace(" version", "") not in fold(name) for q in QUALIFIER_RE.findall(clause)):
            continue
        mix = pack_mix(clause, slug)
        if mix:
            out.append((mix, clause))
    return out


LATER_RE = re.compile(r"\b(later|updated|reissues?|re-releases?|subsequent|another)\b", re.I)


def best_clause(name, packs, clauses):
    # The one clause mix whose total is the pack count, or None. Named sets beat unnamed packs. Then the clause with
    # the most words from the product name (brackets included) wins.
    fits = {}
    for mix, clause in clauses:
        if sum(mix.values()) == packs:
            fits.setdefault(tuple(sorted(mix.items())), clause)
    if len(fits) > 1:
        fits = {k: c for k, c in fits.items() if any(not unnamed(s) for s, _ in k)} or fits
    if len(fits) > 1:
        words = C.bp_tokens(name) | set().union(*(C.bp_tokens(b) for b in re.findall(r"\[(.*?)\]", name)))
        score = {k: len(words & C.bp_tokens(c)) for k, c in fits.items()}
        fits = {k: c for k, c in fits.items() if score[k] == max(score.values())}
    if len(fits) > 1:
        # A first print run beats a later or updated one ("Later shipments ...", "pack selections were updated").
        fits = {k: c for k, c in fits.items() if not LATER_RE.search(c)} or fits
    return collections.Counter(dict(next(iter(fits)))) if len(fits) == 1 else None


YEAR_RE = re.compile(r"\b(199\d|20[0-3]\d)\b")


def year_ok(release, raw):
    # False for a section with no year near the product's release year: it describes another product line, such as
    # "Kyurem Box" (2011) for "Kyurem V Box" (2022). A release marked "(set)" is the set's date, so it gets one more year.
    m = re.match(r"(\d{4})", release or "")
    years = [int(y) for y in YEAR_RE.findall(C.bp_clean(raw).split("Product images:")[0])]
    if not m or not years:
        return True
    return min(abs(y - int(m.group(1))) for y in years) < (3 if "(set)" in release else 2)


MECHANIC_RE = re.compile(r"(?<![A-Za-z])(ex|EX|GX|V|VMAX|VSTAR|BREAK)(?![A-Za-z])")
GENERIC_WORDS = {"set", "of", "bundle", "international", "version", "edition", "exclusive", "tab", "pack", "and", "the",
                 "blue", "green", "red", "yellow", "gold", "silver", "black", "white"}


def section_ok(row, slug, entry):
    # False for a section from another product line. A series name, such as "Sword & Shield", is not a set name here.
    # - No year in the section near the product's release.
    # - Set names in the title, and none of them in the product: "Pokémon GO Poké Ball Tins" for "Poke Ball Tin - Level
    #   Ball". A set name counts as held when it is anywhere in the product name ("Dragon" in "Dragonite Dragons Tin").
    # - A set name in the product name, outside the brackets, that the section text does not hold. For example,
    #   "Tyranitar ex Premium Collection" for a
    #   "Prismatic Evolutions Lucario ex & Tyranitar ex Premium Collection".
    # - A card mechanic outside the brackets that the title holds in another form ("Melmetal-GX Box" for "Melmetal ex
    #   Box"), or that the title leaves out after the same Pokémon ("Black Kyurem Box" for "Black Kyurem ex Box"). A title
    #   for a product line, such as "Deck Crafter's Collection 2026" for "... - Meowth ex", stays allowed.
    # - A title for one variant ("Enhanced 2-Pack Blister: Pawmot") that shares no variant word with the product, when
    #   the raw section text (promo card templates and captions included) also names no bracket word: "2-Pack Blister
    #   [Raikou]". A section for several variants names the bracket word, so "Crown Zenith Collection—Regieleki V" stays
    #   allowed for "Crown Zenith Collection [Regidrago V]".
    if not year_ok(row["release"], entry[2]):
        return False
    name, text, title = fold(row["name"]), fold(C.bp_clean(entry[2])), fold(entry[0])
    hits = [s.group(1) for s in SET_ONLY_RE.finditer(entry[0]) if s.group(1).lower() not in SERIES]
    if hits and not any(fold(h) in name or SETS.get(h.lower()) == slug for h in hits):
        return False
    bare, title_mechanics = re.sub(r"\[.*?\]|\(.*?\)", " ", row["name"]), set(MECHANIC_RE.findall(entry[0]))
    if any(fold(s.group(1)) not in text for s in SET_ONLY_RE.finditer(bare) if s.group(1).lower() not in SERIES):
        return False
    for m in MECHANIC_RE.finditer(bare):
        before = re.findall(r"[A-Za-z']+", bare[:m.start()])
        if title_mechanics and m.group(1) not in title_mechanics:
            return False
        if not title_mechanics and before and re.search(r"\b" + re.escape(fold(before[-1])) + r"\b", title):
            return False
    variant = re.split(r"[:—]", entry[0], maxsplit=1)
    variant_words = C.bp_tokens(variant[1]) if len(variant) == 2 else set()
    # Brackets with only generic words, such as "[Set of 3]", name no variant: the product holds every variant.
    words = {w for b in re.findall(r"\[(.*?)\]", row["name"]) for w in re.findall(r"[a-z0-9']+", fold(b))
             if not w.isdigit() and w not in GENERIC_WORDS}
    if words and variant_words and not variant_words & C.bp_tokens(re.sub(r"[\[\]()]", " ", row["name"])):
        raw = fold(entry[2])
        if not any(re.search(r"\b" + re.escape(w) + r"\b", raw) for w in words):
            return False
    return True


def resolve_conflict(name, packs, units, mix, source, clauses, desc, single_set, count_src=""):
    # (mix, source, packs, note) for a mix with more packs than the product. The mix stays, a Conflict, when no rule
    # picks the part of the sources that describes this product.
    def pick(n):
        for u in sorted({1, units}):
            found = best_clause(name, n // u, clauses) if n % u == 0 else None
            if found:
                return collections.Counter({k: v * u for k, v in found.items()})
        return None
    if source.startswith("Bulbapedia"):
        found = pick(packs)
        if found:
            return found, f"{source} (one sentence)", packs, ""
        desc_total = sum(desc.values())
        if desc_total == packs:
            return desc, "TCGplayer description", packs, ""
        if desc_total > packs and any(sum(m.values()) == desc_total for m, _ in clauses):
            found = pick(desc_total)
            note = f"raised from {packs}: Bulbapedia and the TCGplayer description agree"
            return (found, f"{source} (one sentence)", desc_total, note) if found else (desc, "TCGplayer description", desc_total, note)
        # The catalog count came from this section but read only part of a sentence, such as "one booster pack each from
        # A, B, and C". When the section has only one clause mix and it holds more packs, use it. A later or updated
        # print run does not count as a second mix.
        distinct = ({tuple(sorted(m.items())) for m, c in clauses if not LATER_RE.search(c)}
                    or {tuple(sorted(m.items())) for m, _ in clauses})
        if count_src == "Bulbapedia" and len(distinct) == 1 and sum(v for _, v in next(iter(distinct))) > packs:
            found = collections.Counter(dict(next(iter(distinct))))
            return (found, f"{source} (one sentence)", sum(found.values()),
                    f"raised from {packs}: the catalog count read only part of the Bulbapedia sentence")
    if source == "TCGplayer description" and count_src == "Description" and not any(unnamed(k) for k in mix):
        # The catalog count read only the first pack phrase: "two Black Bolt booster packs; two White Flare booster packs".
        return mix, source, sum(mix.values()), f"raised from {packs}: the catalog count read only part of the TCGplayer description"
    if single_set:
        return collections.Counter(), "Product kind", packs, ""
    return mix, source, packs, ""


def contents_for(row, slug, era, text, index, overrides, own_set=frozenset()):
    pid = str(row["id"])
    if pid in overrides:
        o = overrides[pid]
        return {"packs": o.get("packs"), "mix": o.get("mix", {}), "promos": o.get("promos", []),
                "other": o.get("other", ""), "source": o.get("source", "Research"), "confidence": o.get("confidence", "Exact")}
    packs = int(row["packs"]) if str(row["packs"]).isdigit() else None
    section = C.bp_best(row["name"], era, index, own_set, lambda e: section_ok(row, slug, e))
    mix, promos, source, clauses = collections.Counter(), [], "", []
    if section:
        title, _, raw = section
        clean = C.bp_clean(raw).split("Product images:")[0]
        mix = pack_mix(clean, slug)
        clauses = clause_mixes(row["name"], clean, slug)
        promos = promo_cards(raw)
        source = f"Bulbapedia: {title}"
    # A description often repeats its pack count before the bullets. When a bullet names packs, read only the distinct
    # bullets, the same rule as the catalog pack count.
    bullets = list(dict.fromkeys(b.strip() for b in (text or "").split("•")[1:]))
    desc_text = " • ".join(bullets) if any(re.search(r"\bpacks?\b", b, re.I) for b in bullets) else (text or "")
    desc = pack_mix(desc_text, slug) if desc_text else collections.Counter()
    if not mix and desc:
        mix, source = desc, "TCGplayer description"
    total_mix = sum(mix.values())
    mult = re.search(r"\[(?:bundle|set) of (\d+)\]", row["name"], re.I)
    units = int(mult.group(1)) if mult else 1
    if units > 1 and total_mix and packs and total_mix * units == packs:
        mix = collections.Counter({k: v * units for k, v in mix.items()})
        total_mix = sum(mix.values())
    # A blister with its own set in the name, such as "Perfect Order Premium Checklane Blister", holds that set's packs.
    single_set = row["kind"] in SINGLE_SET_KINDS or (row["kind"] == "Blister" and own_set and own_set <= C.bp_tokens(row["name"]))
    note = ""
    if packs and total_mix > packs:
        mix, source, packs, note = resolve_conflict(row["name"], packs, units, mix, source, clauses, desc, single_set, row["src"])
        total_mix = sum(mix.values())
    known = total_mix - sum(v for k, v in mix.items() if unnamed(k))
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
    return {"packs": packs, "mix": dict(mix), "promos": promos, "other": "", "source": source or "—", "confidence": confidence,
            "packs_note": note}


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
    if "--conflicts" in sys.argv:
        pick = [r for r in rows if r["confidence"] == "Conflict"]
        print(f"--- {len(pick)} conflicts")
        for r in pick:
            print(f"   {r['id']} | {r['name']} | packs {r['packs']} ({r['src']}) | mix {r['mix']} | {r['source']}")
    if "--json" in sys.argv:
        json.dump(rows, open(os.path.join(HERE, "cache", "sealed_contents.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote tools/ppt/cache/sealed_contents.json")
