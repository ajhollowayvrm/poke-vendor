"""Pull sealed product prices and images from the PokemonPriceTracker (PPT) API, for every English group.

Usage: python3 tools/ppt/pull_sealed.py

- Gets the list of Pokémon groups from TCGCSV (free). The PPT setId is the TCGCSV group ID.
- For each group, pages through /api/v2/sealed-products?setId=<group> with limit and offset.
- Saves each group to tools/ppt/cache/sealed/<group>.json (not in git). A saved group is skipped.
- Uses call() from pull.py: headers and body stay apart, and a 429 waits for retryAfter.
- A sealed product costs 1 credit.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pull import CACHE, api_key, call  # noqa: E402

SEALED = os.path.join(CACHE, "sealed")
BASE = "https://www.pokemonpricetracker.com/api/v2/sealed-products"
PAGE = 100


def tcgcsv_groups():
    r = subprocess.run(["curl", "-s", "-m", "60", "https://tcgcsv.com/tcgplayer/3/groups"], capture_output=True, text=True)
    return json.loads(r.stdout)["results"]


def fetch(url, key):
    """Return (parsed JSON or None, remaining credits or None). Retries a 429 up to 5 times."""
    for attempt in range(1, 6):
        code, headers, body = call(url, key)
        rem = headers.get("x-ratelimit-total-remaining") or headers.get("x-ratelimit-daily-remaining")
        remaining = int(rem) if rem and rem.isdigit() else None
        if code == "429":
            try:
                info = json.loads(body)
            except ValueError:
                info = {}
            if "daily" in str(info.get("error", "")).lower() and not remaining:
                return "STOP", remaining
            pause = int(info.get("retryAfter") or headers.get("retry-after") or 60) + 2
            print(f"  429, waiting {pause}s (attempt {attempt})", flush=True)
            time.sleep(pause)
            continue
        if code in ("401", "403"):
            return "STOP", remaining
        if code != "200":
            print(f"  HTTP {code}: {body[:160]!r} (attempt {attempt})", flush=True)
            time.sleep(10)
            continue
        try:
            parsed = json.loads(body)
        except ValueError:
            print(f"  HTTP 200 but the body is not JSON (attempt {attempt})", flush=True)
            time.sleep(10)
            continue
        return parsed, remaining
    return None, None


def main():
    os.makedirs(SEALED, exist_ok=True)
    key = api_key()
    groups = sorted(tcgcsv_groups(), key=lambda g: g.get("publishedOn") or "", reverse=True)
    json.dump(groups, open(os.path.join(SEALED, "_groups.json"), "w"))
    done = skipped = failed = products = 0
    remaining = None
    for g in groups:
        gid = g["groupId"]
        path = os.path.join(SEALED, f"{gid}.json")
        if os.path.exists(path):
            skipped += 1
            continue
        items, offset = [], 0
        while True:
            data, rem = fetch(f"{BASE}?setId={gid}&limit={PAGE}&offset={offset}", key)
            remaining = rem if rem is not None else remaining
            if data == "STOP":
                print(f"STOP: the key is not accepted or no credits are left, at group {gid}.", flush=True)
                print(f"DONE this run: {done} groups pulled, {skipped} already cached, {failed} failed, {products} products", flush=True)
                return
            if data is None or not isinstance(data.get("data"), list):
                items = None
                break
            items += data["data"]
            meta = data.get("metadata") or {}
            if not meta.get("hasMore") or not data["data"]:
                break
            offset += PAGE
            time.sleep(0.5)
        if items is None:
            failed += 1
            print(f"group {gid} ({g['name']}): FAILED", flush=True)
            continue
        with open(path + ".part", "w") as f:
            json.dump({"group": g, "data": items}, f)
        os.replace(path + ".part", path)
        done += 1
        products += len(items)
        print(f"group {gid} ({g['name']}): {len(items)} sealed products, credits left {remaining}", flush=True)
        time.sleep(0.5)
    print(f"DONE this run: {done} groups pulled, {skipped} already cached, {failed} failed, {products} products", flush=True)


if __name__ == "__main__":
    main()
