// PokéVendor cloud-save Lambda (behind a Function URL).
//   GET  ?id=<uuid>            -> { id, data, savedAt, version }   (404 if none)
//   PUT  { id, data, savedAt, version } -> { ok, savedAt }         (409 if cloud is newer)
//
// Uses ONLY @aws-sdk/client-dynamodb, which ships with the Node 20 Lambda runtime, so
// there are no dependencies to install — `sam deploy` just zips this file.
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})
const TABLE = process.env.TABLE_NAME

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || 'GET'
  try {
    if (method === 'GET') {
      const id = event?.queryStringParameters?.id
      if (!id) return json(400, { error: 'missing id' })
      const r = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: String(id) } } }))
      if (!r.Item) return json(404, { error: 'not found' })
      return json(200, {
        id: String(id),
        data: r.Item.data?.S ?? null,
        savedAt: r.Item.savedAt ? Number(r.Item.savedAt.N) : 0,
        version: r.Item.version ? Number(r.Item.version.N) : null,
      })
    }

    if (method === 'PUT') {
      let body
      try { body = JSON.parse(event?.body || '{}') } catch { return json(400, { error: 'bad json' }) }
      const { id, data, savedAt, version } = body
      if (!id || typeof data !== 'string') return json(400, { error: 'missing id or data' })
      const ts = Number(savedAt) || Date.now()
      try {
        await ddb.send(new PutItemCommand({
          TableName: TABLE,
          Item: {
            id: { S: String(id) },
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
          const cur = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: { id: { S: String(id) } } }))
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
