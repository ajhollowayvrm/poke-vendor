"""Find real sold prices on PriceCharting for loose packs and booster boxes that have no fresh TCGplayer price.

Usage: python3 tools/ppt/pricecharting_sales.py [--refetch]

AJ approved these rules on 2026-11-26 (tools/export/catalog.py applies them):
- A loose pack with no TCGplayer market price, or with a PPT price more than 30 days older than the pull, gets the
  median sold price of the last 6 months. A TCGplayer midPrice is an ask, not a sale.
- A booster box with no fresh price gets the larger of the median sold price of the last 12 months and its packs at
  the loose-pack price.

What it does:
- Reads tools/ppt/cache/sealed_contents.json, the PPT sealed cache, and the TCGCSV cache, and finds each booster box and
  each single loose pack with no fresh price (catalog.fresh_price).
- Finds the product row on its PriceCharting set page (tools/ppt/pricecharting_sealed.py), then fetches the product
  page with curl. Saves it to tools/ppt/cache/pricecharting/products/. A saved page is not fetched again, except
  with --refetch.
- Reads the sold listings on the page. It drops a listing whose title names an empty box, a foreign language, a lot,
  or another set of the same series, because PriceCharting matches those to the wrong product.
- Writes tools/ppt/sealed_sales.json: {product ID: {name, pcName, url, kind, months, median, sales, asOf}}.
"""
import datetime, html, json, os, re, statistics, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "export"))
sys.path.insert(0, HERE)
import catalog as C  # noqa: E402
import pricecharting_sealed as P  # noqa: E402

PAGES = os.path.join(HERE, "cache", "pricecharting", "products")
OUT = os.path.join(HERE, "sealed_sales.json")
SET_INDEX = os.path.join(ROOT, "app", "PokeVendor", "Resources", "set-index.json")
# The window of sales for each kind, in months.
MONTHS = {"pack": 6, "box": 12}
# Titles that are not one sealed English unit of the product.
BAD_TITLE = re.compile(r"\b(empty|no packs|no cards|display only|german|deutsch|french|fran[cç]ais|italian|spanish|"
                       r"espa[nñ]ol|japanese|japan|jap|jpn|korean|chinese|portuguese|dutch|lot|bundle|case|art set|half|"
                       r"opened|weighed|\d+\s*x\s|x\s*\d+\b|\d+\s+packs?\b(?!.*box))", re.I)
# Sets whose names also name a series, for example "Platinum Arceus Booster Box". A title of a set in the same era can
# hold one of these names.
SERIES_SETS = {"base-set", "diamond-and-pearl", "platinum", "heartgold-soulsilver", "black-white", "xy", "sun-moon",
               "sword-shield", "scarlet-violet", "mega-evolution"}
FIRST = re.compile(r"\b(1st|first|ist)\s*ed", re.I)


def norm(text):
    return re.sub(r"[^a-z0-9]+", "", html.unescape(text).lower().replace("&", "and"))


def fetch(url, refetch=False):
    path = os.path.join(PAGES, re.sub(r"[^a-z0-9]+", "_", url.split("/game/")[1]) + ".html")
    if os.path.exists(path) and not refetch:
        return open(path).read()
    r = subprocess.run(["curl", "-sL", "-m", "60", "-A", P.AGENT, "-w", "\n%{http_code}", url], capture_output=True, text=True)
    body, _, code = r.stdout.rpartition("\n")
    time.sleep(1.5)
    if code != "200" or "chart_data" not in body:
        return None
    os.makedirs(PAGES, exist_ok=True)
    open(path, "w").write(body)
    return body


def sold(page):
    """The sold listings on a product page: [(date, title, price)]."""
    out = []
    for row in re.findall(r'<tr[^>]*id="ebay-\d+"[\s\S]*?</tr>', page):
        date = re.search(r'<td class="date">([^<]+)', row)
        title = re.search(r'<td class="title"[^>]*>([\s\S]*?)</td>', row)
        price = re.search(r'js-price[^>]*>\s*\$([\d,\.]+)', row)
        if date and price:
            text = html.unescape(re.sub(r"<[^>]+>|\s+", " ", title.group(1) if title else "")).replace("[eBay]", "").strip()
            out.append((date.group(1).strip(), text, float(price.group(1).replace(",", ""))))
    return out


def good(title, kind, first, others):
    """True when a sold title is one sealed English unit of the product: the right kind, the right run (1st Edition
    or not), and no name of another set."""
    if BAD_TITLE.search(title):
        return False
    if kind == "box" and (not re.search(r"\bbox\b|display", title, re.I) or re.search(r"\btin\b|collection|figure", title, re.I)):
        return False
    if kind == "pack" and re.search(r"\bbox\b|blister|tin\b|collection", title, re.I):
        return False
    if bool(FIRST.search(title)) != first:
        return False
    flat = norm(title)
    return not any(o in flat for o in others)


def main():
    refetch = "--refetch" in sys.argv
    today = datetime.date.today()
    prices = C.sealed_prices()
    newest = C.newest_scrape(prices)
    sets = {s["slug"]: s for s in json.load(open(SET_INDEX))}
    contents = json.load(open(C.CONTENTS))
    out, missed = {}, []
    pages = {}
    for it in contents:
        kind = "box" if it.get("kind") == "Booster box" else "pack" if it.get("kind") == "Booster pack" and it.get("packs") == 1 else None
        slug = it.get("slug")
        if not kind or slug not in sets or len(it.get("mix") or {}) > 1:
            continue
        if C.fresh_price(prices.get(str(it["id"])) or {}, it["group"], it["id"], newest) is not None:
            continue
        s = sets[slug]
        console = P.console_slug(slug, s["name"])
        if console not in pages:
            page = P.fetch(console)
            pages[console] = P.rows(page) if page else []
        # A 1st Edition product matches only a 1st Edition row (pricecharting_sealed.best).
        hit = P.best(it["name"], s["name"], pages[console])
        if not hit:
            missed.append(f"{it['name']} (no row on {console})")
            continue
        _, pc_name, _, url = hit
        page = fetch(url, refetch)
        if page is None:
            missed.append(f"{it['name']} (no page: {url})")
            continue
        # The names of the other sets, also without a final "s". A name in a title means PriceCharting matched another
        # set's product. The 1st Edition file of this set is the same set.
        own = norm(s["name"])
        others = {n for o in sets.values() if o["slug"] not in (slug, slug + "-1st-edition")
                  and not (o["slug"] in SERIES_SETS and o.get("era") == s.get("era"))
                  for n in {norm(o["name"]), norm(o["name"]).removesuffix("s")} if len(n) > 3 and n not in own}
        first = "1st Edition" in it["name"]
        since = (today - datetime.timedelta(days=round(MONTHS[kind] * 30.44))).isoformat()
        rows = [(d, t, p) for d, t, p in sold(page) if d >= since and good(t, kind, first, others)]
        if not rows:
            missed.append(f"{it['name']} (no good sale in {MONTHS[kind]} months: {url})")
            continue
        out[str(it["id"])] = {"name": it["name"], "pcName": pc_name, "url": url, "kind": kind, "months": MONTHS[kind],
                              "median": round(statistics.median(p for _, _, p in rows), 2),
                              "sales": [[d, p] for d, _, p in rows], "asOf": today.isoformat()}
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"{len(out)} products got a median sold price -> {os.path.relpath(OUT, ROOT)}")
    for k, v in sorted(out.items(), key=lambda kv: kv[1]["name"]):
        print(f"  {v['kind']:4} {v['name']}  =  ${v['median']} from {len(v['sales'])} sales in {v['months']} months")
    for m in missed:
        print("  NO PRICE:", m)


if __name__ == "__main__":
    main()
