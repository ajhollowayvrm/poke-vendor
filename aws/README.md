# PokéVendor accounts & cloud save (AWS)

Players sign in with an **email + password** (Amazon Cognito) and the game follows the
account: a DynamoDB table holds **one save per player**, and a tiny Lambda (behind a
**Function URL**) verifies the Cognito token and reads/writes the caller's own save.

```
GitHub Pages PWA ──HTTPS──> Cognito user pool          (sign up / sign in / refresh)
                 ──HTTPS──> Lambda Function URL        (Authorization: Bearer <id token>)
                                ├── GET/PUT /          DynamoDB poke-vendor-saves(id = user#<sub>, …)
                                └── GET /prices        shared card-price cache (id = prices#v1)
                                       └─(stale/missing sets)──> api.pokemontcg.io
```

The same Lambda also serves a **shared card-price cache**: `GET /prices?sets=…` returns
every requested set's TCGplayer prices from one DynamoDB row instead of ~21 slow
pokemontcg.io calls. Sets staler than 24h refresh through to the upstream API, and a
free daily EventBridge schedule re-warms the whole cache so players essentially never
wait. Optionally pass `--parameter-overrides PokemonTcgIoKey=<key>` at deploy time
(free signup at pokemontcg.io) to lift upstream rate limits.

Everything is sized to stay inside the **always-free** AWS tier:

- **Cognito Lite** — free to 50,000 monthly active users; sign-up codes use Cognito's
  default email sender (free, ~50 emails/day cap).
- **Lambda + Function URL** — 1M requests/month always free; no API Gateway (its free
  tier expires after 12 months).
- **DynamoDB provisioned 5 RCU / 5 WCU** — within the always-free 25/25; on-demand
  billing would charge per request from the first one.

## Deploy (one time)

Prereqs: AWS CLI configured (`aws configure`) + the AWS SAM CLI.

```bash
cd aws
sam build
sam deploy --stack-name poke-vendor-save --resolve-s3 --capabilities CAPABILITY_IAM \
  --region us-west-2 --no-confirm-changeset
```

The **Outputs** section prints everything the app needs.

## Wire it to the app

Put the outputs in **`src/game/syncConfig.js`** (they're public identifiers — safe to
commit; useless without a player's password):

```js
export const SYNC_URL = '...'        // FunctionUrl output
export const AUTH_REGION = '...'     // Region output
export const AUTH_CLIENT_ID = '...'  // UserPoolClientId output
```

Commit + push — GitHub Pages rebuilds and **Settings → Account & cloud save** goes live.

## Using it

- **Settings → Account & cloud save** → create an account (email + password, 6-digit
  email code) or sign in. Auto-sync then pushes the save as you play.
- Sign in on any other device and the same game loads. Newest save wins; if a device
  has its own unsynced game, the app asks which one to keep before touching anything.
- Not signed in? The game still saves to the browser, exactly as before.

## Testing without a real inbox

```bash
aws cognito-idp admin-create-user --user-pool-id <pool> --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id <pool> --username you@example.com \
  --password <password> --permanent
```

## Caveats / upgrade paths

- **Password sign-in (USER_PASSWORD_AUTH).** The password travels to Cognito over TLS
  instead of SRP — standard for SPAs that skip the Amplify SDK. Swap in SRP later
  without touching the backend if you ever care.
- **400 KB item limit.** DynamoDB caps an item at 400 KB. A very large collection could
  approach that as raw JSON. If you ever hit it, gzip the blob client-side before
  upload, or store the blob in S3 and keep only a pointer in DynamoDB.
- **Two devices at once.** Newest-`savedAt` wins; the Lambda refuses a push that's older
  than the cloud copy (409) so a stale device can't clobber a newer save. Editing the
  same game on two devices simultaneously can still lose the older device's unsynced
  changes — the boot reconcile pulls the newer save before you play.
- **Sign-up email volume.** Cognito's default sender caps at ~50 emails/day. If the game
  ever gets popular, wire Cognito to SES.

## Tear down

```bash
sam delete --stack-name poke-vendor-save
```
