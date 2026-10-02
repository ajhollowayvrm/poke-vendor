"""Export the sealed product catalog for the iOS app.

Usage: python3 tools/export/catalog.py

Run tools/export/rip_set.py for each set first, and tools/ppt/sealed_contents.py --json.

Writes app/PokeVendor/Resources/catalog.json: every sealed product that the game sells, with
- the pack mix by set (only sets that the app has, see SETS);
- the promo cards, with the market price, the graded prices, and the image. An SVP promo gets its price from
  its promo set's TCGCSV group (PROMO_GROUPS, tools/cardlist/cache/tcgcsv/). A set card gets the price of its print in that set. A
  Surprise Box promo has a Prismatic Evolutions stamp, so it gets the stamped print from TCGCSV group 2374
  (Miscellaneous Cards & Products), with its own price and image, and no graded prices;
- the market price (tools/ppt/cache/sealed/, or TCGCSV when PPT has none), an estimated MSRP, and the image;
- "mixGuess": true when the contents name no set, or only a series. Then the packs come from the newest sets of that
  series (or of any series) that were out at the product's release (guess_mix).
  When the name holds a set name, a set that released 0 to 2 years before the product wins (newest first). A series base
  set, for example Scarlet & Violet, counts only when it released 0 to 6 months before. A product with no date borrows
  the date of a product with the same base name. With no date at all, the name match is not used.

A product is in the catalog when its pack mix is exact, every pack comes from a set the app has, and it has a
price. "inPrint" is true when every pack is from a Scarlet & Violet set. Only in-print product sells at retail.
"""
import glob, json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
APP_SETS = os.path.join(ROOT, "app", "PokeVendor", "Resources", "Sets")
OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "catalog.json")
CONTENTS = os.path.join(ROOT, "tools", "ppt", "cache", "sealed_contents.json")
OVERRIDES = os.path.join(ROOT, "tools", "ppt", "sealed_overrides.json")
SEALED = os.path.join(ROOT, "tools", "ppt", "cache", "sealed")
TCGCSV = os.path.join(ROOT, "tools", "cardlist", "cache", "tcgcsv")
TCGDEX_MAP = os.path.join(ROOT, "tools", "cardlist", "tcgdex-map.json")
TCGDEX_SETS = os.path.join(ROOT, "tools", "cardlist", "cache", "tcgdex", "sets")
SVP_GROUP = "22872"
SWSH_GROUP = "2545"
# The promo sets that the promo text names, for example "Rowlet (SM Promo 1)": (TCGCSV group, set name, number format).
PROMO_GROUPS = {
    "SVP Promo": (SVP_GROUP, "SVP Black Star Promos", "SVP {:03d}"),
    "SWSH Promo": (SWSH_GROUP, "SWSH Black Star Promos", "SWSH{:03d}"),
    "SM Promo": ("1861", "SM Black Star Promos", "SM{:02d}"),
    "XY Promo": ("1451", "XY Black Star Promos", "XY{:02d}"),
    "BW Promo": ("1407", "BW Black Star Promos", "BW{:02d}"),
    "DP Promo": ("1421", "DP Black Star Promos", "DP{:02d}"),
    "MEP Promo": ("24451", "Mega Evolution Black Star Promos", "MEP {:03d}"),
    "SVE Energy": ("24382", "Scarlet & Violet Energies", "SVE {:03d}"),
    "Nintendo Promo": ("1423", "Nintendo Black Star Promos", "{:03d}"),
}
MISC_GROUP = "2374"
STAMP = "Prismatic Evolutions Stamp"
HOME = "prismatic-evolutions"
# Only product from these eras is still in print, so only it sells at retail.
IN_PRINT_ERAS = {"scarlet-violet", "mega-evolution"}

# Estimated MSRP. The first name match wins, so the longer names come first. Starting values for balancing.
MSRP_BY_NAME = [("Super-Premium Collection", 119.99), ("Premium Figure Collection", 59.99), ("Premium Collection", 39.99),
                ("Binder Collection", 29.99), ("[Set of 3]", 44.97), ("[Set of 4]", 17.96), ("Surprise Box", 24.99)]
MSRP_BY_KIND = {"Booster pack": 4.49, "Blister": 9.99, "Tin": 9.99, "Booster bundle": 26.94, "Elite Trainer Box": 54.99,
                "Collection": 24.99, "Booster box": 161.64}


def load_sets():
    sets = {}
    for f in glob.glob(os.path.join(APP_SETS, "*.json")):
        d = json.load(open(f))
        sets[d["slug"]] = d
    return sets


def sealed_prices():
    out = {}
    for f in glob.glob(os.path.join(SEALED, "*.json")):
        data = json.load(open(f))
        for p in (data.get("data", []) if isinstance(data, dict) else data):
            out[str(p.get("tcgPlayerId") or p.get("id"))] = p
    return out


def svp_promos(group=SVP_GROUP):
    """The Black Star promos of one TCGCSV group, by number: SVP (22872) or SWSH (2545)."""
    products = json.load(open(os.path.join(TCGCSV, f"{group}-products.json")))
    prices = json.load(open(os.path.join(TCGCSV, f"{group}-prices.json")))
    products = products.get("results", products) if isinstance(products, dict) else products
    prices = prices.get("results", prices) if isinstance(prices, dict) else prices
    price = {p["productId"]: p.get("marketPrice") for p in prices}
    out = {}
    for p in products:
        num = next((e["value"] for e in p.get("extendedData", []) if e.get("name") == "Number"), None)
        if not num:
            continue
        # The plain print wins over a stamped or exclusive print with the same number.
        plain = "(" not in p["name"]
        key = int(re.sub(r"\D", "", num) or 0)
        if key in out and not plain:
            continue
        out[key] = {"name": p["name"].split(" - ")[0], "market": price.get(p["productId"]),
                    "image": f"https://tcgplayer-cdn.tcgplayer.com/product/{p['productId']}_in_800x800.jpg"}
    return out


def stamped_promos():
    """The prints with a Prismatic Evolutions stamp, by name and number, for example ("Umbreon ex", 60)."""
    products = json.load(open(os.path.join(TCGCSV, f"{MISC_GROUP}-products.json")))
    prices = json.load(open(os.path.join(TCGCSV, f"{MISC_GROUP}-prices.json")))
    products = products.get("results", products) if isinstance(products, dict) else products
    prices = prices.get("results", prices) if isinstance(prices, dict) else prices
    price = {p["productId"]: p.get("marketPrice") for p in prices}
    out = {}
    for p in products:
        m = re.match(r"^(.*) - (\d+)/\d+ \(" + STAMP + r"\)$", p["name"])
        if m:
            out[(m.group(1), int(m.group(2)))] = {
                "market": price.get(p["productId"]),
                "image": f"https://tcgplayer-cdn.tcgplayer.com/product/{p['productId']}_in_800x800.jpg"}
    return out


_tcgcsv_prices = {}


def tcgcsv_price(group, product_id):
    """The TCGCSV market price of a product, when PPT has no sealed price. TCGCSV is free and covers most sealed."""
    if group not in _tcgcsv_prices:
        path = os.path.join(TCGCSV, f"{group}-prices.json")
        table = {}
        if os.path.exists(path):
            rows = json.load(open(path))
            for r in rows.get("results", rows) if isinstance(rows, dict) else rows:
                price = r.get("marketPrice") or r.get("midPrice")
                if price:
                    table[r["productId"]] = price
        _tcgcsv_prices[group] = table
    return _tcgcsv_prices[group].get(int(product_id))


def set_releases(sets):
    """The release date of each set, from its TCGdex set (tools/cardlist/tcgdex-map.json)."""
    tcgdex = json.load(open(TCGDEX_MAP))
    out = {}
    for slug in sets:
        for tid in tcgdex.get(slug, []):
            path = os.path.join(TCGDEX_SETS, f"{tid}.json")
            if os.path.exists(path):
                date = json.load(open(path)).get("releaseDate")
                if date:
                    out[slug] = date
                    break
    return out


def product_date(release):
    """The latest date a product can be from, for example "2021 Q4" gives the end of 2021 Q4."""
    m = re.search(r"(\d{4})\s*Q([1-4])", release or "")
    if m:
        return f"{m.group(1)}-{int(m.group(2)) * 3:02d}-28"
    m = re.search(r"\b(\d{4})\b", release or "")
    return f"{m.group(1)}-12-31" if m else None


# A "<series> Series" pack in the contents, for example "four XY Series booster packs".
SERIES_ERAS = [("scarlet", "scarlet-violet"), ("mega", "mega-evolution"), ("sword", "sword-shield"), ("sun & moon", "sun-moon"),
               ("sun and moon", "sun-moon"), ("xy", "xy"), ("black", "black-white"), ("heartgold", "heartgold-soulsilver"),
               ("diamond", "diamond-pearl-platinum"), ("platinum", "diamond-pearl-platinum"), ("ex ", "ex")]


def series_era(label):
    low = label.lower() + " "
    return next((era for key, era in SERIES_ERAS if key in low), None)


# A series base set has the name of its series, so a product name often holds it only as the series name.
SERIES_BASE_SETS = {"scarlet-violet", "sword-shield", "sun-moon", "xy", "black-white", "diamond-and-pearl",
                    "heartgold-soulsilver", "mega-evolution"}


def months_before(date, months):
    """The date a number of months before an ISO date, for example 2025-12-31 minus 24 months gives 2023-12-31."""
    y, m = divmod(int(date[:4]) * 12 + int(date[5:7]) - 1 - months, 12)
    return f"{y:04d}-{m + 1:02d}-{date[8:10]}"


def named_set(name, sets, releases, date):
    """The set that a product's name holds, or None. A set matches only when it released 0 to 2 years before the
    product date. A series base set matches only when it released 0 to 6 months before. The newest match wins, and
    the longest name breaks a tie, so "Base Set 2" wins over "Base Set". The check uses whole months, because a
    quarter date is only the end of the quarter. Without a date, no set matches."""
    if date is None:
        return None
    low = name.lower()
    hits = []
    for slug, d in sets.items():
        release = releases.get(slug)
        if not release or slug.startswith("mcdonalds"):
            continue
        window = 6 if slug in SERIES_BASE_SETS else 24
        if not months_before(date, window)[:7] <= release[:7] <= date[:7]:
            continue
        set_name = d["name"].lower()
        if re.search(r"(?<![\w])" + re.escape(set_name) + r"(?![\w])", low):
            hits.append((release, len(set_name), slug))
    return max(hits)[2] if hits else None


def base_dates(contents):
    """{base_name: latest product date} for every product with a release, so a product with no date can borrow one."""
    out = {}
    for it in contents:
        date = product_date(it.get("release"))
        if date:
            key = base_name(it["name"])
            out[key] = max(out.get(key, date), date)
    return out


def guess_mix(it, sets, releases, dates=None):
    """A pack mix for a product whose contents name no set, or only a series. Real products like these hold
    assorted packs. The guess takes the packs from the newest sets of the named series (or of any series) that were
    out when the product came out. The same product always gives the same guess. Returns None when no guess fit.
    "dates" is base_dates(): a product with no release borrows the date of a product with the same base name."""
    packs = it["packs"]
    mix = dict(it.get("mix") or {})
    known = {k: n for k, n in mix.items() if k in sets}
    buckets = {k: n for k, n in mix.items() if k not in sets}
    left = packs - sum(mix.values())
    if left < 0:
        return None
    if not mix and it.get("slug") in sets:
        return {it["slug"]: packs}
    if left:
        buckets["unknown"] = buckets.get("unknown", 0) + left
    # A product named for a set, for example "Darkness Ablaze 3 Pack Blister", holds packs of that set.
    date = product_date(it.get("release"))
    named = named_set(it["name"], sets, releases, date or (dates or {}).get(base_name(it["name"])))
    if named and "unknown" in buckets:
        known[named] = known.get(named, 0) + buckets.pop("unknown")
    rng = random.Random(int(it["id"]))
    out = dict(known)
    for key, n in buckets.items():
        era = series_era(key) if key != "unknown" else None
        if era is None and date is None:
            return None
        pool = [s for s in sets if releases.get(s) and (era is None or sets[s].get("era") == era)
                and (date is None or releases[s] <= date) and not s.startswith("mcdonalds")]
        if not pool:
            return None
        pool = sorted(pool, key=lambda s: releases[s], reverse=True)[:4]
        for _ in range(n):
            s = rng.choice(pool)
            out[s] = out.get(s, 0) + 1
    return out


ALT_GROUP = "1938"


def alternate_prints():
    """The alternate prints with a letter after the number, for example "Aegislash EX - 65a/119", from the TCGCSV
    Alternate Art Promos group: {(number, letter): [products]}."""
    products = json.load(open(os.path.join(TCGCSV, f"{ALT_GROUP}-products.json")))
    prices = json.load(open(os.path.join(TCGCSV, f"{ALT_GROUP}-prices.json")))
    products = products.get("results", products) if isinstance(products, dict) else products
    prices = prices.get("results", prices) if isinstance(prices, dict) else prices
    price = {}
    for r in prices:
        price[r["productId"]] = price.get(r["productId"]) or r.get("marketPrice")
    out = {}
    for p in products:
        m = re.search(r"(\d+)([a-z])(?:/|$)", p["name"].split(" - ")[-1])
        if m:
            out.setdefault((int(m.group(1)), m.group(2)), []).append(
                {"name": p["name"].split(" - ")[0], "market": price.get(p["productId"]),
                 "image": f"https://tcgplayer-cdn.tcgplayer.com/product/{p['productId']}_in_800x800.jpg"})
    return out


def norm(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def resolve_alternate(text, sets, alternates):
    """A promo text with a letter number, for example "Aegislash-EX (Phantom Forces 65a)"."""
    m = re.match(r"^(.*) \((.+) (\d+)([a-z])\)$", text)
    if not m:
        return None
    name, source, num, letter = m.group(1), m.group(2), int(m.group(3)), m.group(4)
    hits = [p for p in alternates.get((num, letter), []) if norm(p["name"]).startswith(norm(name)[:6])]
    priced = [p for p in hits if p["market"] is not None]
    if not priced:
        return None
    p = priced[0]
    total = next((pr["num"].split("/")[1] for s in sets.values() if s["name"] == source for pr in s["prints"] if "/" in pr["num"]), None)
    return {"name": name, "num": f"{num}{letter}" + (f"/{total}" if total else ""), "setName": source, "rarity": "Promo",
            "variant": "Holo", "market": p["market"], "graded": {}, "image": p["image"]}


def promo_groups():
    """{promo set name in the promo text: {number: product}} for every set in PROMO_GROUPS."""
    out = {source: svp_promos(group) for source, (group, _, _) in PROMO_GROUPS.items()}
    out["alternates"] = alternate_prints()
    return out


def resolve_promo(text, sets, promos, stamped=None):
    m = re.match(r"^(.*) \((.+) (\d+)\)$", text)
    if not m:
        return resolve_alternate(text, sets, promos["alternates"])
    name, source, num = m.group(1), m.group(2), int(m.group(3))
    if source in PROMO_GROUPS:
        _, set_name, fmt = PROMO_GROUPS[source]
        p = promos[source].get(num)
        if not p or p["market"] is None:
            return None
        return {"name": name, "num": fmt.format(num), "setName": set_name, "rarity": "Promo",
                "variant": "Holo", "market": p["market"], "graded": {}, "image": p["image"]}
    for s in sets.values():
        if s["name"] != source:
            continue
        # Subset numbers such as "TG01" or "SV001" are not the plain number that the promo text gives.
        prints = [p for p in s["prints"] if p["num"].split("/")[0].isdigit() and int(p["num"].split("/")[0]) == num]
        prints.sort(key=lambda p: (p["variant"] not in ("Holo", "Normal"), p["variant"]))
        if prints:
            p = prints[0]
            if stamped is not None:
                s = stamped.get((name, num))
                if not s or s["market"] is None:
                    return None
                return {"name": name, "num": p["num"], "setName": source, "rarity": p["rarity"],
                        "variant": f"{p['variant']} · {STAMP}", "market": s["market"], "graded": {}, "image": s["image"]}
            return {"name": name, "num": p["num"], "setName": source, "rarity": p["rarity"], "variant": p["variant"],
                    "market": p["market"], "graded": p["graded"], "image": p["image"]}
    return None


def named_promos(name, raw_promos):
    """The promos that match a variant name, for example "[Basculin]" matches "Hisuian Basculin". Nil when the name
    has no variant in brackets or nothing matches."""
    bracket = re.search(r"\[([^\]]+)\]", name)
    if not bracket:
        return None
    # "[Reshiram/Moltres]" and "[Cufant & Copperajah]" name two promos.
    wants = [w for w in re.split(r"\s*(?:/|&|,)\s*", bracket.group(1)) if w]
    # "Xerneas EX" matches "Xerneas-EX", and "Basculin" matches "Hisuian Basculin".
    named = [t for t in raw_promos if any(norm(t.split(" (")[0]).endswith(norm(w)) for w in wants)]
    return named or None


def base_name(name):
    """The product name without its variant: "Silver Tempest Single Pack Blister [Basculin]" gives
    "Silver Tempest Single Pack Blister"."""
    return re.sub(r"\s*\(International Version\)|\s*\[[^\]]*\]", "", name).strip()


def main():
    sets = load_sets()
    prices = sealed_prices()
    promos_by_set = promo_groups()
    stamped = stamped_promos()
    releases = set_releases(sets)
    out, skipped = [], []
    guessed = 0
    contents = json.load(open(CONTENTS))
    dates = base_dates(contents)
    # A researched promo list (tools/ppt/sealed_overrides.json) is exact, so the name filter below does not touch it.
    overrides = {k: v for k, v in json.load(open(OVERRIDES)).items() if not k.startswith("_")}
    researched = {k for k, v in overrides.items() if "promos" in v}
    # An override with "exclude" names a product that the game cannot model, for example 3-card mini packs.
    excluded = {k for k, v in overrides.items() if v.get("exclude")}
    # A "[Set of N]" product holds one of each variant, so it gets the promos that its variants match.
    variant_promos = {}
    for it in contents:
        if re.search(r"\[Set of \d+\]", it["name"]):
            continue
        named = named_promos(it["name"], it.get("promos", []))
        if named:
            key = base_name(it["name"])
            variant_promos[key] = variant_promos.get(key, []) + [t for t in named if t not in variant_promos.get(key, [])]
    for it in contents:
        mix = it.get("mix") or {}
        packs = it.get("packs")
        if not packs or it.get("kind") in ("Case or display", "Prize pack", "Deck") or "Dollar General" in it["name"] \
                or str(it["id"]) in excluded:
            continue
        # A product with no stated mix, or with only a series named, gets a guessed mix (guess_mix).
        guess = False
        if it.get("confidence") not in ("Exact", "Product set") or not mix or sum(mix.values()) != packs \
                or any(slug not in sets for slug in mix):
            mix = guess_mix(it, sets, releases, dates)
            if not mix or any(slug not in sets for slug in mix) or sum(mix.values()) != packs:
                continue
            guess = True
        # PPT gives the sealed price and image. TCGCSV fills in when PPT has no price.
        p = prices.get(str(it["id"])) or {}
        market = p.get("unopenedPrice") or tcgcsv_price(it["group"], it["id"])
        if not market:
            continue
        image = p.get("imageCdnUrl800") or p.get("imageUrl") or f"https://tcgplayer-cdn.tcgplayer.com/product/{it['id']}_in_800x800.jpg"
        guessed += guess
        # The set files rip Unlimited prints only, so 1st Edition and Shadowless product stays out.
        if re.search(r"1st Edition|Shadowless", it["name"]):
            continue
        raw_promos = it.get("promos", [])
        # A single variant, for example "[Glaceon]", holds only the promo that matches its name. The source often
        # lists every promo of the product wave. A "[Set of N]" holds the promos of its variants.
        if str(it["id"]) in researched:
            pass
        elif re.search(r"\[Set of \d+\]", it["name"]):
            raw_promos = variant_promos.get(base_name(it["name"])) or raw_promos
        else:
            raw_promos = named_promos(it["name"], raw_promos) or raw_promos
        # A Surprise Box promo has a Prismatic Evolutions stamp.
        stamp = stamped if "Surprise Box" in it["name"] else None
        promos = [resolve_promo(t, sets, promos_by_set, stamp) for t in raw_promos]
        if any(x is None for x in promos):
            skipped.append(f"{it['name']}: promo not found in {raw_promos}")
            promos = [x for x in promos if x]
        name = re.sub(r"\s+", " ", it["name"])
        msrp = next((v for k, v in MSRP_BY_NAME if k in name), MSRP_BY_KIND.get(it["kind"]))
        # The mix lists the home set first, then the rest by count.
        order = sorted(mix.items(), key=lambda kv: (kv[0] != HOME, -kv[1], kv[0]))
        in_print = all(sets[s].get("era") in IN_PRINT_ERAS for s in mix)
        out.append({"id": str(it["id"]), "name": name, "kind": it["kind"], "packs": packs, "inPrint": in_print,
                    "mix": [{"slug": s, "packs": n} for s, n in order],
                    "promos": promos, "pickOnePromo": "Surprise Box" in name,
                    "market": market, "msrp": msrp, "image": image, "mixGuess": guess})
    # A "[Set of N]" holds one box of each variant, so it gets the promos of its variants in the catalog, each print once.
    for x in out:
        if x["id"] in researched or not re.search(r"\[Set of \d+\]", x["name"]):
            continue
        variants = [v for v in out if v is not x and not re.search(r"\[Set of \d+\]", v["name"])
                    and base_name(v["name"]) == base_name(x["name"]) and v["name"].endswith("(International Version)") == x["name"].endswith("(International Version)")]
        if variants:
            union = []
            for p in (p for v in variants for p in v["promos"]):
                if all((p["name"], p["num"]) != (q["name"], q["num"]) for q in union):
                    union.append(p)
            x["promos"] = union
    out.sort(key=lambda x: (x["mix"][0]["slug"] != HOME, x["kind"], x["name"]))
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} products ({guessed} with a guessed pack mix) -> {os.path.relpath(OUT, ROOT)}")
    for x in out:
        mix = ", ".join(f"{m['packs']} {m['slug']}" for m in x["mix"])
        promos = "; ".join(f"{p['name']} {p['num']} ${p['market']}" for p in x["promos"])
        print(f"  {x['id']} {x['name']} | {mix} | ${x['market']} | {promos}")
    for s in skipped:
        print("  SKIPPED PROMO:", s)


if __name__ == "__main__":
    main()
