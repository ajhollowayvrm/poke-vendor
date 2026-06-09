// Cloud-save endpoint: the AWS Lambda Function URL printed by the SAM deploy
// (see aws/README.md). Paste it below, or set VITE_SYNC_URL at build time.
// Leave blank to disable cloud sync — the game still saves locally as always.
export const SYNC_URL = import.meta.env?.VITE_SYNC_URL || ''
