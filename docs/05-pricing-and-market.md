# Pricing and Market Model

Goal: as close to real life as possible. Real card names, real sets, real
starting prices — not an invented in-game economy.

## The snapshot approach

Pick a moment in time and pull real prices at that moment — not hand-entered,
but a real bulk data pull (see "Data source" below). That snapshot becomes
day-zero truth. Real prices drift out of date; that's expected and fine —
the plan is to re-pull current data when it matters, not to freeze a set of
numbers into these docs and treat them as permanent.

## Data source

**PokemonPriceTracker (PPT)** is the primary source: a bulk API covering
50,000+ English and Japanese cards, with raw prices, PSA/CGC/BGS/SGC graded
prices, and grading population data, all in one place. This project has PPT
Pro access (20,000 calls/day) — enough to pull the full ~18,000–20,000
unique English-card catalog (per set/variant counting, see
[11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)) in a
single day, not a multi-week scrape.

This changes the scaling story from earlier drafts of this doc: getting real
per-card data for "as many sets as possible" is a data-pull task, not an
ongoing manual-research burden. The archetype-tag formula in
[11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md) still
matters, but only as a fallback for whatever PPT doesn't cover (a brand-new
set before PPT has data on it, an obscure promo, etc.) — not as the primary
mechanism.

## Scope

- **Prototype phase**: any convenient small pull works — the point is to
  prove the mechanics, not the data breadth. A natural candidate is a full
  vintage set (e.g., Base Set) plus a handful of standout chase cards from
  elsewhere, to test how the model handles very different card types side by
  side.
- **Long-term goal**: pull as much of the PPT catalog as makes sense for the
  game's scope. The remaining open question is refresh cadence (a one-time
  pull vs. periodic re-pulls to keep prices current), not data acquisition —
  that part is solved.

## What drives real card prices (to mirror in simulation)

- **Scarcity**: print run size and pull rate per set. A 1st edition holo
  behaves nothing like a modern rare.
- **Condition and grade**: raw vs. graded, and grade tier — a PSA 10 can be
  many multiples of a PSA 8. See [10-grading.md](10-grading.md) for the full
  grading mechanic (subgrades, companies, variance, economics).
- **Nostalgia and set popularity**: vintage sets (Base Set, Jungle, Fossil)
  command a premium mostly from nostalgia, not gameplay.
- **Competitive relevance**: for cards actually played in the TCG, tournament
  results and format shifts move prices (bans, rotations, new archetypes).
- **Hype events**: reprints, anniversary sets, a streamer pulling or
  promoting a card, a new set's chase card driving speculation.
- **Macro cycles**: real card markets have slow boom/bust waves (e.g.,
  2020–2021). The simulation should have its own slow cycles, not just daily
  noise.

## Modeling shape

Each card gets a baseline price (from the snapshot) plus its own volatility
profile driven by the factors above — not one global random walk applied
equally to everything. A common bulk rare and a chase vintage holo should
not jitter the same way.

## Sealed product — separate pricing logic

Sealed product is not just "cards you have not opened yet." It has its own
dynamics. See [12-acquiring-product.md](12-acquiring-product.md) for how the
player actually gets sealed product in the first place.

- **Sealed premium**: a factory-sealed box or pack often sells for more than
  the expected value of its contents, because collectors pay to preserve the
  seal itself.
- **Age-driven appreciation**: sealed product tends to appreciate as a set
  ages out of print, independent of any single card inside it.
- **Print run and legitimacy risk**: older sealed product carries
  resealing/counterfeit risk in real life — see
  [14-counterfeit-risk.md](14-counterfeit-risk.md) for the full
  mechanic.
- **EV tension**: a player who understands pull rates can calculate whether
  it is better to open a box or sell it sealed. That tension is a deliberate
  in-game decision point.

## The moving market

**Status: built** (`Model/PriceCycle.swift`, `Hub/GoalsMarketViews.swift`).

The set files and the catalog keep the real prices. The game does not change
them. A factor for each day moves a price when the game reads it. All grades of
a card use the same factor, so a ladder keeps its order and a 10 stays above
its 9.

Each run has its own market. The run's seed makes it, so a save keeps only the
day and the news.

### Booms and corrections

The whole market goes through periods:

| Period | Length | Total move |
| --- | --- | --- |
| Steady | 120 to 360 days | −3% to +3% a year |
| Boom | 120 to 300 days | +30% to +80% |
| Correction | 180 to 360 days | −15% to −35% |

- A run starts steady.
- What comes next:
  - After a steady period: a boom 50%, a correction 30%, steady 20%.
  - After a boom: a correction 60%, steady 40%.
  - After a correction: steady 70%, a boom 30%.
- Inside a period, the move is slow at the start and the end.
- A short wave of 97 days (±7%) rides on top.
- The End Day report gives a line when a period starts. With the price
  tracker, the line comes 2 days early.
- **Cards** follow the market more as they get dearer: 30% of the move
  for a $1 card, up to 120% for a $1,000 card.
- **Sealed product** follows 60% of a boom and 20% of a correction. From
  2021 to 2023, out-of-print sealed held its price while singles fell.

### Daily steps

A card of $1 or more, and every sealed product, can move a little each day.
Most days nothing changes. A move lasts: it acts as a random walk, with a
weak pull back to the real price (half-life 120 days).

| Price | Chance of a step each day | Median step | 90th percentile |
| --- | --- | --- | --- |
| Under $1 | none | — | — |
| $1 to $5 | 30% | 3% | 8% |
| $5 to $50 | 25% | 1% | 4% |
| $50 to $500 | 15% | 1% | 6% |
| Over $500 | 10% | 1.5% | 6% |
| Sealed | 20% | 0.6% | 3% |

- The chances come from 64 days of TCGplayer prices (2025 and 2026). In that
  data, 67% to 92% of days had no change, and a one-day spike of more than 20%
  was almost never reversed within a week.
- The step sizes are tamed, so a month moves a price about 7% (sealed) to
  16% (cheap cards).
- Each card also keeps a slow wave of its own (60 to 240 days, up to ±12%).

### Older sets gain value

While its set is out of print, a card of $25 or more gains value each year:

| Era | Card growth a year |
| --- | --- |
| WOTC and e-Card | +8% to +15% |
| EX to XY | +4% to +12% |
| Sun & Moon and later | +2% to +10% |

Sealed product gains value by era while out of print. In print, it stays
about flat (0% to +2% a year).

| Era | Sealed growth a year |
| --- | --- |
| WOTC and e-Card | +10% to +15% |
| EX and later | +15% to +25% |

- Real out-of-print sealed gained +18% to +90% a year from 2016 to 2026, but
  most of that came in two booms. The rates here are tamed, and the booms add
  the big jumps on top.
- A Scarlet & Violet or Mega Evolution card starts to grow when its set
  leaves print.

### Market news

- **Hype**: a streamer pull lifts a card name. Collectors can chase the sealed
  product of a set. The End Day report gives the news. The Market screen shows
  the news, the current period, and the player's biggest movers.
- A reprint is never news about a card name. It is about a set or its
  products (see [Print runs](#print-runs)).
- **Character news**: a new product for a character lifts that character's
  cards for 3 to 6 weeks (+10% to +30%). When stores sell out of a
  character's products, sealed product with that character in its name rises
  for 4 to 8 weeks (+20% to +50%).
- **Follower tier 4**: a post about a card lifts that card name for a week.

### Print runs

**Status: built** (`Model/PrintRuns.swift`).

At the start of a run, the Scarlet & Violet and Mega Evolution sets are in
print, and every other set is out of print. The print status then changes
during the run.

- **A set goes out of print.** About once in 25 days, the game announces a
  print change. 60% of them take a set out of print. The set is one of the 3
  oldest sets in print. The game announces it 14 to 28 days ahead, so the
  player can stock up. After that day, stores, camping, wholesale, and the
  sponsor offers stop carrying the set. Its sealed product rises 10% to 30% over
  a month, and then it gains value at the out-of-print rate. At least 8 sets
  stay in print.
- **A reprint wave.** 40% of the changes bring back an out-of-print set from
  Sun & Moon or later. The products reach store shelves 7 to 21 days after
  the news.
  - **What comes back:** 70% of waves reprint 1 to 3 kinds of the set's
    products, for example its Elite Trainer Boxes and tins. The rest of the
    set stays out of print. 30% of waves reprint the whole set.
  - **How long:** a product wave lasts 7 to 120 days. A whole-set wave lasts
    60 to 180 days.
  - **Prices:**
    - A reprinted product falls 15% to 35%. Half of the fall comes on the day
      of the news, and the rest over 3 weeks.
    - The set's other products fall 30% to 50% as much.
    - The set's singles fall 0% to 10%.
    - When the wave ends, the full fall comes back over 60 to 180 days.
  - **Research:** real reprints were often one product type, for example
    Hidden Fates tins (2020) or the 151 Blooming Waters collection (2025).
    A reprinted product fell 13% to 35%, at the news. Japanese 151 fell 22% on
    the day of the news. Other products of the set fell less: the 151 ETB fell
    27% and its bundle 13%. Chase singles did not fall more than the market,
    and prices came back in 2 to 7 months.
- **A product with packs from more than one set** is in print only while every
  one of its sets is in print.
- **Where the player sees it**: the End Day report, the Print news box on the
  Market screen (what comes next and the changes of the last 4 weeks), and the
  "In print" or "Out of print" line on a sealed item's detail screen.
- At most 2 announced changes wait at a time. A reprint wave plans its own end,
  and that end does not count.

### Seasons

**Status: built** (`Model/Seasons.swift`).

A new run starts on January 1 (see
[16-time-and-day.md](16-time-and-day.md#the-calendar)). The calendar date
gives the week of the year. A save from before the calendar keeps its old
random start week. The week of the year moves demand and the price of
sealed product.

- **Holiday season** (mid October to the end of December): holiday buyers want
  sealed product. Sealed product sells up to 15% more often, and its price rises
  up to 5%. Singles sell up to 5% less often, because buyers spend on sealed
  gifts.
- **After the holidays** (January to mid March): sealed prices fall up to 10%.
  This is the best time to buy sealed product.
- **Summer slump** (mid June to early September): everything sells up to 5%
  less often.
- **Singles keep their price.** A season changes only how often a single sells.
- **Where the demand factor applies**: online listings, eBay auctions (the
  no-sale chance never falls below 5%), lots (a lot with sealed product uses
  the sealed factor), Facebook Marketplace offers, game shop consignment, and
  stream auctions and buy-now offers.
- **Sealed value moves with the season.** The sealed price factor is part of
  the market price, so a collection of sealed product is worth about 15% less
  in February than at the holiday peak. This is the buying window, not market
  news.
- **The player's store** gets the mean of the sealed and the singles demand as
  more or fewer customers.
- Card shows keep their own crowds. A season does not change them.
- Each season is a smooth bump over its weeks, so no factor jumps from one day
  to the next.
- **Where the player sees it**: the Season box on the Market screen (the
  month, the season name over the whole time that the season moves the market,
  and the four factors), the month on each week of the
  Calendar, and a line in the End Day report when a season starts or ends.

Confidence: the research found only vendor guides for the holiday rush and
the January to March buying window, and no price series. The sizes are design
values, not measured data.

With moving prices, the player can hold stock and choose when to sell.
