# Browser push setup

Browser push uses the Web Push protocol and VAPID. It stays disabled until the server has all three settings:

- `VAPID_PUBLIC_KEY` — the public application-server key returned to browsers.
- `VAPID_PRIVATE_KEY` — the private key; keep it in the deployment secret store only.
- `VAPID_SUBJECT` — a real `mailto:` contact or HTTPS URL maintained by the service operator.

Generate a key pair once with the installed `web-push` CLI (`npx web-push generate-vapid-keys`), then save the output directly into the deployment’s secret settings. Do not place the private key in source control, browser code, or a checked-in `.env` file. The app does not generate keys or prompt for browser permission automatically.

Subscription records are stored outside the Chama database. With `REDIS_URL`, the app uses the Redis hash `jirani:push:subscriptions:v1`; without Redis it uses a private atomic JSON sidecar at `CHAMA_PUSH_SUBSCRIPTIONS_FILE` (default `chamafork/storage/push-subscriptions.json`). Keep that file on a private persistent volume and include it in backups if it is the active store. Do not serve it as a static asset.

The PWA must be served over HTTPS in deployment; `localhost` is accepted for local testing. Push sends are addressed only to active users in the same Chama as the notification. A browser user must click **Enable browser notifications**, grant the browser prompt, and subscribe. In-app pop-ups remain available independently of browser permission.

New meeting dates are recorded with their Chama ID in the existing JSON-backed settings payload. A single-Chama store can still use its legacy meeting-date setting; in a multi-Chama store, an old unscoped date is not pushed to members until the meeting is scheduled again for its Chama. This is an additive JSON setting, not a database migration.
