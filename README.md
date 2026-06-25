# Hit6 Telegram Bot

A Next.js + TypeScript + grammY Telegram bot implementing the core Hit6 daily cricket progression flow from `Hit6_Bot_Complete_Specification.md`.

## Features

- `/start` welcome menu with inline buttons.
- `/hit6` daily batting attempt with weighted server-side randomness.
- 20-hour rolling cooldown stored in PostgreSQL.
- Persistent player profiles, global stats, group membership stats, daily hit history, and achievements.
- `/mystats`, `/top`, `/globaltop`, `/history`, `/achievements`, `/help`, and placeholder responses for future systems.
- Telegram webhook route designed for Vercel at `/api/telegram/webhook`.
- Webhook secret validation via `TELEGRAM_WEBHOOK_SECRET`.

## Environment

```bash
BOT_TOKEN=123456:telegram-token
DATABASE_URL=postgres://...
TELEGRAM_WEBHOOK_SECRET=your-secret
```

## Development

```bash
npm install
npm run typecheck
npm run build
```

## Database

The Drizzle schema lives in `src/db/schema.ts`.

```bash
npm run db:generate
npm run db:migrate
```

## Telegram webhook setup

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://your-domain.example/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```
