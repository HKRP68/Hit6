# Deploying Hit6

The bot runs as a **Telegram webhook**: Telegram POSTs updates to
`/api/telegram/webhook`, the handler processes them and replies. There is no
long-running poller, so it deploys cleanly to both Vercel (serverless) and
Render (web service).

The database driver is auto-detected from `DATABASE_URL` (see
`src/db/client.ts`):

| Database              | Driver used        | Notes |
|-----------------------|--------------------|-------|
| Neon (`*.neon.tech`)  | `@neondatabase/serverless` (HTTP) | Best for Vercel functions |
| Supabase / Render PG  | `postgres-js` (TCP) | Use the **pooled** connection string |

You can override detection with `DB_DRIVER=neon` or `DB_DRIVER=postgres`.

---

## 1. Create the Telegram bot

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **token**.
2. Recommended BotFather settings:
   - `/setprivacy` → **Disable** (so the bot can read `/hit6` in groups).
   - `/setjoingroups` → **Enable**.
3. Pick a webhook secret (any random string), e.g.:
   ```bash
   openssl rand -hex 16
   ```

Keep three values handy: `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and (optional)
your own numeric Telegram id as `OWNER_ID` (get it from [@userinfobot](https://t.me/userinfobot)).

---

## 2. Provision the database

### Option A — Neon
1. Create a project at <https://neon.tech>.
2. Copy the **pooled** connection string (host contains `-pooler`), append
   `?sslmode=require`.

### Option B — Supabase
1. Create a project at <https://supabase.com>.
2. Project → **Connect** → **Connection pooling** → **Transaction** mode.
3. Copy that URI (host `...pooler.supabase.com`, port **6543**). The app sets
   `prepare:false`, which this mode requires.

### Run the migrations (either DB)
From your machine, with `DATABASE_URL` set to the connection string:
```bash
psql "$DATABASE_URL" -f drizzle/0000_initial.sql
psql "$DATABASE_URL" -f drizzle/0001_battles_inventory.sql
```
Both files are idempotent (`IF NOT EXISTS`), so re-running is safe.

---

## 3a. Deploy on Vercel

1. Push this repo to GitHub (already done on your branch) and **Import** it at
   <https://vercel.com/new>. Framework preset: **Next.js** (auto-detected).
2. **Settings → Environment Variables** (Production):
   | Name | Value |
   |------|-------|
   | `BOT_TOKEN` | from BotFather |
   | `DATABASE_URL` | pooled Neon/Supabase URL |
   | `TELEGRAM_WEBHOOK_SECRET` | your secret |
   | `OWNER_ID` | your Telegram id (optional) |
3. **Deploy**. Your URL will be `https://<project>.vercel.app`.
4. Register the webhook (see step 4).

> Vercel runs the webhook as a serverless function — no `start` command needed.

## 3b. Deploy on Render

1. <https://dashboard.render.com> → **New → Web Service** → connect this repo.
2. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`  (runs `next start`, which respects Render's `$PORT`)
3. **Environment** → add the same four variables as above.
4. Create the service. Your URL will be `https://<service>.onrender.com`.
5. Register the webhook (see step 4).

> On Render's free tier the service sleeps when idle; the first `/hit6` after a
> sleep is slow while it wakes. A paid instance or a cron ping avoids this.

---

## 4. Register the Telegram webhook

Point Telegram at your deployment (run once, and again if the URL changes):
```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_DOMAIN/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```
Verify:
```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```
`url` should match and `pending_update_count` should drain to 0 as you use it.

---

## 5. Smoke test

- Visit `https://YOUR_DOMAIN/api/health` → `{"ok":true,"service":"hit6-bot"}`.
- DM the bot `/start`, then `/hit6`.
- Add it to a group, then `/hit6`, `/top`, `/challenge` (as a reply).

---

## Troubleshooting

- **No reply at all** → `getWebhookInfo` shows `last_error_message`. A 401 means
  `TELEGRAM_WEBHOOK_SECRET` doesn't match; re-run `setWebhook`.
- **Bot ignores `/hit6` in groups** → privacy mode is on; disable it in BotFather,
  then remove and re-add the bot to the group.
- **DB errors / `prepared statement` errors on Supabase** → make sure you used the
  **Transaction pooler** URL (port 6543), not the direct 5432 string.
- **Wrong driver picked** → set `DB_DRIVER=neon` or `DB_DRIVER=postgres` explicitly.
- **Health route works but commands fail** → `DATABASE_URL` missing/incorrect, or
  migrations not applied.
