# PokéVendor cloud save (AWS)

A DynamoDB table keyed by a per-game **UUID** that stores the whole game state, plus a
tiny Lambda (behind a **Function URL**) the static site calls to read/write it. No login —
each game is identified by an unguessable UUID you carry to your other device.

```
GitHub Pages PWA ──HTTPS──> Lambda Function URL ──> DynamoDB
                                                    poke-vendor-saves(id, data, savedAt, version)
```

## Deploy (one time)

Prereqs: an AWS account + the **AWS SAM CLI** and **AWS CLI** configured with your creds
(`aws configure`).

```bash
cd aws
sam build
sam deploy --guided
```

Answer the prompts (stack name e.g. `poke-vendor-save`, pick a region, accept the rest).
When it finishes it prints an **Outputs** section — copy the **`FunctionUrl`** value, e.g.
`https://abc123.lambda-url.us-east-1.on.aws/`.

## Wire it to the app

Put the URL in **`src/game/syncConfig.js`**:

```js
export const SYNC_URL = import.meta.env?.VITE_SYNC_URL || 'https://abc123.lambda-url.us-east-1.on.aws/'
```

(or set `VITE_SYNC_URL` as a build env var). Commit + push — GitHub Pages rebuilds, and the
**Settings → Save & sync** panel goes live.

## Using it

- On your main device: open **Settings → Save & sync**. A **game ID** (UUID) is generated.
  Auto-sync pushes your save to the cloud as you play. Hit **Copy**.
- On your other device: paste that ID and hit **Load from cloud**. From then on both devices
  share the save (newest wins).

## Cost

On-demand DynamoDB + Lambda free tier — effectively free for personal use.

## Caveats / upgrade paths

- **Public endpoint.** Anyone with the URL can write random ids (table spam) or read a save
  *if they know its UUID* (v4 UUIDs are unguessable, so reads are safe). For a personal game
  this is fine; to harden, add a shared-secret header check in `handler.mjs` or restrict CORS
  `AllowOrigins` to your Pages origin.
- **400 KB item limit.** DynamoDB caps an item at 400 KB. A very large collection could
  approach that as raw JSON. If you ever hit it, gzip the blob client-side before upload, or
  store the blob in S3 and keep only a pointer in DynamoDB.
- **Two devices at once.** Newest-`savedAt` wins; the Lambda refuses a push that's older than
  the cloud copy (409) so a stale device can't clobber a newer save. Editing the same game on
  two devices simultaneously can still lose the older device's unsynced changes — load before
  you play.

## Tear down

```bash
sam delete --stack-name poke-vendor-save
```
