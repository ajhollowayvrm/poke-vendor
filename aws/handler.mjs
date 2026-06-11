// PokéVendor cloud-save Lambda (behind a Function URL). Every request must carry a
// Cognito ID token (Authorization: Bearer <jwt>); the save is keyed by the token's
// `sub`, so a player can only ever read/write THEIR OWN save — there is no id param.
//   GET                          -> { data, savedAt, version }   (404 if none yet)
//   PUT { data, savedAt, version } -> { ok, savedAt }            (409 if cloud is newer)
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

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || 'GET'
  try {
    // Function URL payloads lowercase the header names.
    const auth = event?.headers?.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
    let claims
    try { claims = await verifier.verify(token) } catch { return json(401, { error: 'unauthorized' }) }
    const id = `user#${claims.sub}`

    if (method === 'GET') {
      const r = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: id } } }))
      if (!r.Item) return json(404, { error: 'not found' })
      return json(200, {
        data: r.Item.data?.S ?? null,
        savedAt: r.Item.savedAt ? Number(r.Item.savedAt.N) : 0,
        version: r.Item.version ? Number(r.Item.version.N) : null,
      })
    }

    if (method === 'PUT') {
      let body
      try { body = JSON.parse(event?.body || '{}') } catch { return json(400, { error: 'bad json' }) }
      const { data, savedAt, version } = body
      if (typeof data !== 'string' || !data) return json(400, { error: 'missing data' })
      const ts = Number(savedAt) || Date.now()
      try {
        await ddb.send(new PutItemCommand({
          TableName: TABLE,
          Item: {
            id: { S: id },
            data: { S: data },
            savedAt: { N: String(ts) },
            version: { N: String(Number(version) || 0) },
            updatedAt: { N: String(Date.now()) },
          },
          // Only overwrite if our save isn't OLDER than what's already there — stops an
          // out-of-date device from clobbering a newer cloud save.
          ConditionExpression: 'attribute_not_exists(id) OR savedAt <= :ts',
          ExpressionAttributeValues: { ':ts': { N: String(ts) } },
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
