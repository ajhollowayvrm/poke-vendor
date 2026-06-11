// Cloud backend wiring — the values printed by `sam deploy` (see aws/README.md).
// All three are PUBLIC identifiers (the Lambda URL, the Cognito region and the SPA
// client id): safe to commit, useless without a player's password. Leave SYNC_URL
// blank to disable accounts/cloud sync — the game still saves locally as always.
// Each can be overridden at build time via the matching VITE_* env var.
export const SYNC_URL = import.meta.env?.VITE_SYNC_URL || 'https://rhp7fgupjully7x2vi54xt3bzu0cqxnl.lambda-url.us-west-2.on.aws/'
export const AUTH_REGION = import.meta.env?.VITE_AUTH_REGION || 'us-west-2'
export const AUTH_CLIENT_ID = import.meta.env?.VITE_AUTH_CLIENT_ID || '4n9gc751vt7s8jfqncph6noo73'
