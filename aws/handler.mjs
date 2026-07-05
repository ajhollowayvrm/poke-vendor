// PokéVendor cloud Lambda (behind a Function URL). Every HTTP request must carry a
// Cognito ID token (Authorization: Bearer <jwt>).
//
//   GET  /                            -> the caller's save { data, savedAt, version }   (404 if none)
//   GET  /?prev=1                     -> the caller's one-deep backup save              (404 if none)
//   PUT  / { data, savedAt, version,  -> { ok, savedAt }
//            baseSavedAt?, force?,       409 if baseSavedAt no longer matches the cloud (CAS),
//            backup?, enc? }             413 if data > 350KB; force skips CAS but snapshots
//                                        the old save to #prev first; backup also rotates #prev
//   GET  /prices?sets=a,b,c           -> { prices: {cardId: usd}, fetchedAt, missing }
//
// Saves are keyed by the token's `sub`, so a player can only ever touch THEIR OWN save.
// /prices serves a SHARED cache item (one per game, not per user): card prices from
// pokemontcg.io, refreshed through on miss/staleness and re-warmed by a daily
// EventBridge job ({"job":"refresh-prices"}), so players get one fast read instead of
// ~21 slow upstream calls.
//
// @aws-sdk/client-dynamodb ships with the Node 20 runtime; aws-jwt-verify (AWS's own
// dependency-free verifier, installed by `sam build`) checks the JWT signature against
// the user pool's JWKS, which it caches across warm invocations.
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

const ddb = new DynamoDBClient({})
const TABLE = process.env.TABLE_NAME
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  clientId: process.env.CLIENT_ID,
  tokenUse: 'id',
})

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// --- price cache --------------------------------------------------------------
const PRICES_ID = 'prices#v1'          // shared cache row: { [setId]: { fetchedAt, prices } }
const PRICES_TTL_MS = 24 * 3600 * 1000 // serve cached set prices for a day
const TCG_API = 'https://api.pokemontcg.io/v2'
const TCG_KEY = process.env.POKEMONTCG_IO_KEY || ''

// Best market price across finishes, matching the game's build-time fetcher.
function bestPrice(tp) {
  if (!tp) return null
  const finishes = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil']
  for (const f of finishes) {
    const m = tp[f]?.market ?? tp[f]?.mid
    if (m) return Math.round(m * 100) / 100
  }
  for (const k of Object.keys(tp)) {
    const m = tp[k]?.market ?? tp[k]?.mid
    if (m) return Math.round(m * 100) / 100
  }
  return null
}

async function fetchSetPrices(setId) {
  const prices = {}
  let page = 1
  while (true) {
    const res = await fetch(
      `${TCG_API}/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&select=id,tcgplayer,cardmarket`,
      { headers: TCG_KEY ? { 'x-api-key': TCG_KEY } : {} },
    )
    if (!res.ok) throw new Error(`upstream ${res.status} for ${setId}`)
    const j = await res.json()
    for (const c of j.data || []) {
      const p = bestPrice(c.tcgplayer?.prices) ??
        (c.cardmarket?.prices?.averageSellPrice ? Math.round(c.cardmarket.prices.averageSellPrice * 100) / 100 : null)
      if (p != null) prices[c.id] = p
    }
    if ((j.data || []).length < 250) break
    page++
  }
  return prices
}

async function readPriceCache() {
  const r = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: PRICES_ID } } }))
  try { return r.Item?.data?.S ? JSON.parse(r.Item.data.S) : {} } catch { return {} }
}

async function writePriceCache(cache) {
  await ddb.send(new PutItemCommand({
    TableName: TABLE,
    Item: { id: { S: PRICES_ID }, data: { S: JSON.stringify(cache) }, updatedAt: { N: String(Date.now()) } },
  }))
}

// Re-fetch the given sets into `cache` (mutating) and persist as we go. pokemontcg.io
// often takes ~10s per request, so sets are fetched in parallel chunks (sequentially it
// blows the Lambda timeout), and the cache row is written after every chunk so a
// timeout mid-fill still keeps the progress — the next request finishes the rest.
// A set that fails upstream keeps its stale copy: better day-old prices than none.
const FETCH_CHUNK = 5
async function refreshSets(cache, setIds) {
  for (let i = 0; i < setIds.length; i += FETCH_CHUNK) {
    const chunk = setIds.slice(i, i + FETCH_CHUNK)
    const results = await Promise.allSettled(chunk.map(sid => fetchSetPrices(sid)))
    let changed = false
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        // Cache EMPTY results too ("checked today — upstream has no prices for this
        // set yet", true for brand-new sets) or every request re-walks them upstream.
        cache[chunk[j]] = { fetchedAt: Date.now(), prices: r.value }
        changed = true
      } else {
        console.log(`price refresh failed for ${chunk[j]}: ${r.reason?.message || r.reason}`)
      }
    })
    if (changed) await writePriceCache(cache)
  }
}

// --- handler --------------------------------------------------------------------
export const handler = async (event) => {
  // Daily EventBridge job: re-warm every set already in the cache, so player requests
  // are served from DynamoDB and (almost) never wait on pokemontcg.io.
  if (event?.job === 'refresh-prices') {
    const cache = await readPriceCache()
    const ids = Object.keys(cache)
    if (ids.length) await refreshSets(cache, ids)
    return { ok: true, refreshed: ids.length }
  }

  const method = event?.requestContext?.http?.method || 'GET'
  const path = event?.rawPath || event?.requestContext?.http?.path || '/'
  try {
    // Function URL payloads lowercase the header names.
    const auth = event?.headers?.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
    let claims
    try { claims = await verifier.verify(token) } catch { return json(401, { error: 'unauthorized' }) }

    if (path === '/prices') {
      if (method !== 'GET') return json(405, { error: 'method not allowed' })
      const want = String(event?.queryStringParameters?.sets || '')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
      if (!want.length) return json(400, { error: 'missing sets' })
      const cache = await readPriceCache()
      const stale = want.filter(sid => Date.now() - (cache[sid]?.fetchedAt || 0) >= PRICES_TTL_MS)
      if (stale.length) await refreshSets(cache, stale)
      const prices = {}
      const missing = []
      let oldest = Date.now()
      for (const sid of want) {
        const entry = cache[sid]
        if (!entry) { missing.push(sid); continue }
        Object.assign(prices, entry.prices)
        oldest = Math.min(oldest, entry.fetchedAt)
      }
      return json(200, { prices, fetchedAt: oldest, missing })
    }

    if (path !== '/') return json(404, { error: 'not found' })
    const id = `user#${claims.sub}`

    if (method === 'GET') {
      // ?prev=1: the one-deep backup slot (rotated before forced overwrites + daily).
      const key = event?.queryStringParameters?.prev ? `${id}#prev` : id
      const r = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: key } } }))
      if (!r.Item) return json(404, { error: 'not found' })
      // ?peek=1: metadata only — the client checks "is the cloud ahead?" on every boot
      // and sign-in, so don't make it download the whole save just to read a timestamp.
      const meta = {
        savedAt: r.Item.savedAt ? Number(r.Item.savedAt.N) : 0,
        version: r.Item.version ? Number(r.Item.version.N) : null,
      }
      if (event?.queryStringParameters?.peek) return json(200, meta)
      return json(200, { ...meta, data: r.Item.data?.S ?? null, enc: r.Item.enc?.S })
    }

    if (method === 'PUT') {
      let body
      try { body = JSON.parse(event?.body || '{}') } catch { return json(400, { error: 'bad json' }) }
      const { data, savedAt, version } = body
      if (typeof data !== 'string' || !data) return json(400, { error: 'missing data' })
      // A DynamoDB item caps at 400KB. Reject early with a status the client can name
      // ("save too large to sync") instead of a ValidationException 500 forever.
      if (data.length > 350_000) return json(413, { error: 'too large' })
      const enc = body.enc === 'gz' ? 'gz' : null // client gzips saves; stored opaquely
      const ts = Number(savedAt) || Date.now()
      const base = Number(body.baseSavedAt) > 0 ? Number(body.baseSavedAt) : null
      const force = body.force === true
      // Rotate the one-deep backup slot BEFORE any overwrite that could destroy history:
      // every forced push (conflict "keep this device", reset-everywhere, prev-restore)
      // and any push the client marks `backup` (it does so once a day). One extra item,
      // far inside the free tier — and it makes every catastrophic overwrite undoable.
      if (force || body.backup === true) {
        const cur = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: id } } }))
        if (cur.Item) {
          await ddb.send(new PutItemCommand({
            TableName: TABLE,
            Item: { ...cur.Item, id: { S: `${id}#prev` }, backedUpAt: { N: String(Date.now()) } },
          }))
        }
      }
      try {
        await ddb.send(new PutItemCommand({
          TableName: TABLE,
          Item: {
            id: { S: id },
            data: { S: data },
            ...(enc ? { enc: { S: enc } } : {}),
            savedAt: { N: String(ts) },
            version: { N: String(Number(version) || 0) },
            updatedAt: { N: String(Date.now()) },
          },
          // force: deliberate overwrite (the #prev snapshot above already ran).
          // baseSavedAt: compare-and-swap — only overwrite the exact revision the client
          //   last synced against, so ANY fork (second device, clock skew) is an honest
          //   409 instead of newest-wins silently discarding a session.
          // neither (legacy clients): the old "not older than the cloud" guard.
          ...(force ? {} : base !== null ? {
            ConditionExpression: 'attribute_not_exists(id) OR savedAt = :base',
            ExpressionAttributeValues: { ':base': { N: String(base) } },
          } : {
            ConditionExpression: 'attribute_not_exists(id) OR savedAt <= :ts',
            ExpressionAttributeValues: { ':ts': { N: String(ts) } },
          }),
        }))
      } catch (e) {
        if (e?.name === 'ConditionalCheckFailedException') {
          const cur = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: id } } }))
          return json(409, { error: 'stale', savedAt: cur.Item?.savedAt ? Number(cur.Item.savedAt.N) : 0 })
        }
        throw e
      }
      return json(200, { ok: true, savedAt: ts })
    }

    return json(405, { error: 'method not allowed' })
  } catch (e) {
    return json(500, { error: String(e?.message || e) })
  }
}
