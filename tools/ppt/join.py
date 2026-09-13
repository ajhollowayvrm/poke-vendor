"""Join the PPT price cache to the set file card lists, and report the coverage.

Usage: python3 tools/ppt/join.py [<set> ...]   (no sets: every set with PPT data in tools/ppt/cache/)

Card match, in this order:
1. externalCatalogId equals the TCGdex card ID (<TCGdex set id>-<card number>), or the main
   TCGdex set ID with the same card number (PPT files subset cards such as TG01 under the main set).
2. The same normalized card number inside the same TCGCSV group (card list table).
3. The same card name, when only one PPT card in that group has it.

Print match, by meaning:
- kind (Normal, Holo, Reverse holo), 1st Edition or not, and the foil pattern must agree;
- a Shadowless print matches only a PPT card from a Shadowless group;
- the "1999–2000 copyright" print uses the Unlimited price as a proxy, and is counted apart.
Stamp and promo prints (prerelease, jumbo, league, and so on) usually have no PPT price.

The report counts pack prints (the prints that a slot map uses) and all prints.
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "slotmap"))
import validate as V  # noqa: E402

CACHE = os.path.join(HERE, "cache")
TCGDEX_MAP = json.load(open(os.path.join(ROOT, "tools", "cardlist", "tcgdex-map.json")))
TCGCSV_MAP = json.load(open(os.path.join(ROOT, "tools", "cardlist", "tcgcsv-map.json")))
SHADOWLESS_GROUPS = {"1663"}
GRADES = ("psa10", "psa9", "cgc10", "cgc9")
PROXY = "1999–2000 copyright"


def num_key(number):
    s = str(number or "").split("/")[0].strip()
    m = re.match(r"^([A-Za-z]*)0*(\d+)([a-z]?)$", s)
    return (m.group(1).upper(), int(m.group(2)), m.group(3)) if m else (s.upper(), -1, "")


def norm_name(name):
    name = re.sub(r"\s*-\s*[A-Z]*\d+/[A-Z]*\d+\s*$", "", name or "")
    name = re.sub(r"\((?:Secret|Full Art|\d+)\)", "", name)
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("é", "e"))


def pattern_of(text):
    m = re.search(r"\(([^()]*(?:pattern|ball)[^()]*)\)", text or "", re.I)
    if not m:
        return None
    p = re.sub(r"[^a-z]", "", m.group(1).lower().replace("poké", "poke"))
    return p.replace("pattern", "")


def ppt_print(printing):
    p = printing.lower()
    kind = "Reverse holo" if "reverse" in p else "Holo" if "holo" in p else "Normal"
    return kind, "1st edition" in p


def list_print(variant):
    kind = next((k for k in ("Reverse holo", "Holo", "Normal") if variant == k or variant.startswith(k + " (")), None)
    quals = re.findall(r"\(([^()]*)\)", variant)
    q = " ".join(quals).lower()
    return kind, "1st edition" in q, "shadowless" in q, PROXY.lower() in q


STAMP = re.compile(r"(?i)prerelease|jumbo|league|staff|stamp|promo|player rewards|set logo|winner|championship|cosmos|"
                   r"cracked ice|tinsel|error|professor program|gym challenge|metal|build|deck|\bball league\b")


def ppt_groups(slug):
    out = []
    for gid in TCGCSV_MAP.get(slug, []):
        p = os.path.join(CACHE, f"{gid}.json")
        if os.path.exists(p):
            out.append((str(gid), json.load(open(p)).get("data", [])))
    return out


def pack_prints(t, cards):
    """The (card number, table, variant) keys that some slot map row can produce."""
    sm = V.section(t, "Slot map")
    used = set()
    if sm is None:
        return used
    runs_par = re.search(r"^\*\*Print runs:\*\*(.*?)(?:\n\s*\n|\Z)", sm, re.S | re.M)
    runs = [q.strip() for q in re.findall(r"\(([^()]*)\)", re.sub(r"\s+", " ", runs_par.group(1)))] if runs_par else [""]
    for r in V.rows(sm, 8):
        if r[4] == "—":
            continue
        names = [x.strip() for x in r[4].split(",")]
        for c in cards:
            if c["rarity"] not in names or not V.in_filter(c, r[6]):
                continue
            for option in [o.strip() for o in r[5].split(" or ")]:
                hits = [v for v in c["variants"] if V.variant_matches(v, option, runs)]
                if hits:
                    used.update((c["num"], c["part"], v) for v in hits)
                    break
    return used


def join(slug):
    t = open(os.path.join(ROOT, "docs", "sets", f"{slug}.md")).read()
    cards = V.parse_cards_list(t)
    ids = TCGDEX_MAP.get(slug, [])
    parts = [l[4:].strip() for l in (V.section(t, "Card list") or "").splitlines() if l.startswith("### ")] or ["main"]
    groups = ppt_groups(slug)
    same_shape = len(groups) == len(parts) and len(parts) > 1
    # Indexes over all PPT cards of the set.
    by_ext, by_num, by_name = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for gi, (gid, data) in enumerate(groups):
        scope = gi if same_shape else 0
        for pc in data:
            pc["_group"] = gid
            if pc.get("externalCatalogId"):
                by_ext[pc["externalCatalogId"]].append(pc)
            by_num[(scope, num_key(pc.get("cardNumber")))].append(pc)
            by_name[(scope, norm_name(pc.get("name")))].append(pc)
    used = pack_prints(t, cards)
    stats = collections.Counter()
    missing = []
    for c in cards:
        pi = parts.index(c["part"]) if c["part"] in parts else 0
        sid = ids[pi] if pi < len(ids) else (ids[0] if ids else "")
        local = c["num"].split("/")[0].split(" ")[-1]
        scope = pi if same_shape else 0
        matches = list(by_ext.get(f"{sid}-{local}", [])) + (list(by_ext.get(f"{ids[0]}-{local}", [])) if ids and sid != ids[0] else [])
        if not matches:
            matches = list(by_num.get((scope, num_key(local)), []))
        if not matches:
            cand = by_name.get((scope, norm_name(c["name"])), [])
            base = {id(x) for x in cand if "(" not in (x.get("name") or "")}
            if len(base) == 1:
                matches = [x for x in cand if id(x) in base]
        stats["cards"] += 1
        stats["cards with a PPT card"] += bool(matches)
        graded = False
        for g in GRADES:
            if any(((pc.get("ebay") or {}).get("salesByGrade") or {}).get(g) for pc in matches):
                stats[f"cards with {g}"] += 1
                graded = True
        stats["cards with a graded price"] += graded
        for v in c["variants"]:
            kind, first, shadowless, proxy = list_print(v)
            pat = pattern_of(v)
            priced = False
            for pc in matches:
                if (pattern_of(pc.get("name")) or None) != pat:
                    continue
                if shadowless != (pc["_group"] in SHADOWLESS_GROUPS):
                    continue
                for printing in (pc.get("variants") or {}):
                    pk, pfirst = ppt_print(printing)
                    # PPT files a pattern print as a separate card with the printing "Holofoil".
                    # In the card lists, the same print is a "Reverse holo (... pattern)".
                    if pat and pk == "Holo" and kind == "Reverse holo":
                        pk = "Reverse holo"
                    if kind and pk == kind and pfirst == first:
                        priced = True
            is_pack = (c["num"], c["part"], v) in used
            stats["prints"] += 1
            stats["pack prints"] += is_pack
            if priced:
                stats["prints priced"] += 1
                stats["pack prints priced"] += is_pack
                if proxy:
                    stats["prints priced by the Unlimited proxy"] += 1
            elif is_pack and len(missing) < 6:
                missing.append(f"{c['num']} {c['name']} / {v}" + (f" (PPT prints: {sorted({p for pc in matches for p in (pc.get('variants') or {})})})" if matches else " (no PPT card)"))
            elif not is_pack and not STAMP.search(v):
                stats["non-pack plain prints unpriced"] += not priced
    return stats, missing


if __name__ == "__main__":
    slugs = sys.argv[1:] or [s for s, groups in TCGCSV_MAP.items() if s in TCGDEX_MAP and any(os.path.exists(os.path.join(CACHE, f"{g}.json")) for g in groups)]
    total = collections.Counter()
    for slug in slugs:
        stats, missing = join(slug)
        total.update(stats)
        print(f"== {slug}: cards {stats['cards with a PPT card']}/{stats['cards']}, "
              f"pack prints priced {stats['pack prints priced']}/{stats['pack prints']}, "
              f"all prints priced {stats['prints priced']}/{stats['prints']}, "
              + ", ".join(f"{g} {stats['cards with ' + g]}" for g in GRADES))
        for m in missing:
            print(f"   pack print with no price: {m}")
    if len(slugs) > 1:
        print(f"TOTAL: cards {total['cards with a PPT card']}/{total['cards']}, "
              f"pack prints priced {total['pack prints priced']}/{total['pack prints']}, "
              f"all prints priced {total['prints priced']}/{total['prints']} "
              f"(Unlimited proxy {total['prints priced by the Unlimited proxy']}), "
              f"cards with a graded price {total['cards with a graded price']}, "
              + ", ".join(f"{g} {total['cards with ' + g]}" for g in GRADES))
