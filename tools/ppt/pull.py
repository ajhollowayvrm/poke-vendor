"""Pull card prices, graded eBay prices, and images from the PokemonPriceTracker (PPT) API.

Usage: python3 tools/ppt/pull.py [--no-ebay] [--min-credits N]

- Reads PPT_API_KEY from the repo's .env file.
- Pulls each set in tools/cardlist/tcgcsv-map.json (the PPT setId is the TCGCSV group ID),
  newest set first, with fetchAllInSet=true and includeEbay=true.
- Saves each response to tools/ppt/cache/<setId>.json (not in git). A set already in the cache is skipped,
  so the pull can stop and start again.
- Stays under 60 calls per minute, and stops when the daily credits left fall below --min-credits
  (default: the estimated cost of the next set).

Join to the card lists: externalCatalogId is the TCGdex card ID (for example sv10.5b-001).
A pattern print is a separate PPT card with the same externalCatalogId and a name suffix,
for example "Snivy (Poke Ball Pattern)".
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
CACHE = os.path.join(HERE, "cache")
BASE = "https://www.pokemonpricetracker.com/api/v2/cards"


def api_key():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("PPT_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("PPT_API_KEY is not in .env")


def call(url, key):
    """Return (http_code, headers, body). Headers and body go to separate temp files, so they never mix."""
    hpath, bpath = os.path.join(CACHE, ".headers.tmp"), os.path.join(CACHE, ".body.tmp")
    for p in (hpath, bpath):
        if os.path.exists(p):
            os.remove(p)
    r = subprocess.run(["curl", "-s", "-m", "300", "-D", hpath, "-o", bpath, "-w", "%{http_code}",
                        "-H", f"Authorization: Bearer {key}", url], capture_output=True, text=True)
    code = r.stdout.strip() or "000"
    headers = {}
    if os.path.exists(hpath):
        for line in open(hpath, errors="ignore"):
            k, sep, v = line.partition(":")
            if sep:
                headers[k.strip().lower()] = v.strip()
    body = open(bpath, errors="ignore").read() if os.path.exists(bpath) else ""
    return code, headers, body


def wait_for_minute_window(headers, need=30):
    rem, reset = headers.get("x-ratelimit-minute-remaining"), headers.get("x-ratelimit-minute-reset")
    if rem and rem.isdigit() and int(rem) < need and reset and reset.isdigit():
        pause = max(1, int(reset) - int(time.time()) + 2)
        print(f"  waiting {pause}s for the minute window ({rem} left)", flush=True)
        time.sleep(min(pause, 90))


def main():
    ebay = "--no-ebay" not in sys.argv
    min_credits = None
    if "--min-credits" in sys.argv:
        min_credits = int(sys.argv[sys.argv.index("--min-credits") + 1])
    os.makedirs(CACHE, exist_ok=True)
    key = api_key()
    groups = json.load(open(os.path.join(ROOT, "tools", "cardlist", "tcgcsv-map.json")))
    set_ids = sorted({g for v in groups.values() for g in v}, reverse=True)
    sizes = {}
    for gid in set_ids:
        p = os.path.join(ROOT, "tools", "cardlist", "cache", "tcgcsv", f"{gid}-products.json")
        try:
            sizes[gid] = sum(1 for x in json.load(open(p))["results"] if any(e["name"] == "Number" for e in x.get("extendedData", [])))
        except (OSError, ValueError, KeyError):
            sizes[gid] = 300
    remaining = None
    done = skipped = 0
    for gid in set_ids:
        path = os.path.join(CACHE, f"{gid}.json")
        if os.path.exists(path) and os.path.getsize(path) > 100:
            skipped += 1
            continue
        cost = sizes[gid] * (2 if ebay else 1)
        if remaining is not None and remaining < max(cost, min_credits or 0):
            print(f"STOP: {remaining} credits left, next set {gid} needs about {cost}. Run again tomorrow.", flush=True)
            break
        url = f"{BASE}?setId={gid}&fetchAllInSet=true" + ("&includeEbay=true" if ebay else "")
        data = None
        for attempt in range(1, 6):
            code, headers, body = call(url, key)
            rem = headers.get("x-ratelimit-total-remaining") or headers.get("x-ratelimit-daily-remaining")
            remaining = int(rem) if rem and rem.isdigit() else remaining
            if code == "429":
                try:
                    info = json.loads(body)
                except ValueError:
                    info = {}
                if "daily" in str(info.get("error", "")).lower():
                    print(f"STOP: daily limit reached at set {gid}. Run again tomorrow.", flush=True)
                    print(f"DONE this run: {done} sets pulled, {skipped} already cached", flush=True)
                    return
                pause = int(info.get("retryAfter") or headers.get("retry-after") or 60) + 2
                print(f"  set {gid}: 429, needs {info.get('required')} minute credits, has {info.get('available')}; waiting {pause}s (attempt {attempt})", flush=True)
                time.sleep(pause)
                continue
            if code != "200":
                print(f"  set {gid}: HTTP {code}: {body[:160]!r} (attempt {attempt})", flush=True)
                if code in ("401", "403"):
                    print("STOP: the key is not accepted.", flush=True)
                    return
                time.sleep(10)
                continue
            try:
                parsed = json.loads(body)
            except ValueError:
                print(f"  set {gid}: HTTP 200 but the body is not JSON ({len(body)} bytes, starts {body[:80]!r}) (attempt {attempt})", flush=True)
                time.sleep(10)
                continue
            if not isinstance(parsed.get("data"), list):
                print(f"  set {gid}: HTTP 200 but no data list: {str(parsed)[:160]} (attempt {attempt})", flush=True)
                time.sleep(10)
                continue
            data = parsed
            break
        if data is None:
            print(f"set {gid}: FAILED after 5 attempts", flush=True)
            continue
        with open(path + ".part", "w") as f:
            json.dump(data, f)
        os.replace(path + ".part", path)
        cards = data["data"]
        used = data.get("metadata", {}).get("apiCallsConsumed", {}).get("total")
        done += 1
        print(f"set {gid}: {len(cards)} cards, {used} credits, daily credits left {remaining}", flush=True)
        wait_for_minute_window(headers)
        time.sleep(1.5)
    print(f"DONE this run: {done} sets pulled, {skipped} already cached, {len(set_ids)} sets in total", flush=True)


if __name__ == "__main__":
    main()
