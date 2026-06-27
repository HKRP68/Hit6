# Hit6 Telegram Bot

A Next.js + TypeScript + grammY Telegram bot implementing the core Hit6 daily cricket progression flow from `Hit6_Bot_Complete_Specification.md`.

## Features

### Daily game
- `/start` welcome menu with inline buttons and "Add to a group" link.
- `/hit6` daily batting attempt with weighted server-side randomness that matches the
  spec outcome table exactly (10% dot · 35% one six … 1% six-sixes · 2% wicket).
- 20-hour rolling cooldown stored in PostgreSQL; spec-accurate cooldown message.
- Six distance, shot type, and per-result commentary generation.
- Persistent player profiles, global stats, group membership stats, and daily hit history.

### Progression
- Career titles (Net Batter → Immortal Batter) with automatic unlocks and `/titles` selection.
- XP / level system (`100 × level` curve) shown on the profile.
- Achievements across career, distance, streak and rare-result categories (`/achievements`).
- Streak tracking with a 48-hour grace window and milestone rewards.

### Items & inventory
- Consumable items: Wicket Shield, Dot Ball Retry, Streak Freeze, Power Boost, Distance Boost.
- Auto-consumption of shields/retries/freezes during `/hit6`; `/use` to arm boosts; `/inventory` to view.
- Items are earned through streak milestones; probability bonuses are clamped to +5% (spec 31.2).

### Competition
- `/top` group and `/globaltop` global leaderboards (with your rank), `/today` daily rankings,
  `/records` group records, `/rank` quick lookup, `/odds` transparent base odds.

### Battles (PvP)
- `/challenge` (reply or `@username`) → Accept / Decline inline buttons → 3-ball battle with
  super-over tie-break. Daily challenge/accept limits and head-to-head reward throttling.
- `/battlehistory` recent battles and `/rivalry` head-to-head record.

### Settings & admin
- `/settings` personal toggles (public ranking, reminders, battle requests) and `/reminder on|off`.
- Admin-gated group controls: `/hit6settings`, `/enablehit6`, `/disablehit6`, `/setmode`,
  `/battles on|off`, `/setcooldown`.

### Platform
- Telegram webhook route for Vercel at `/api/telegram/webhook`, secured by `TELEGRAM_WEBHOOK_SECRET`.
- Idempotent `/hit6` via a unique index on the Telegram update id (no duplicate rewards).

## Environment

```bash
BOT_TOKEN=123456:telegram-token
DATABASE_URL=postgres://...
TELEGRAM_WEBHOOK_SECRET=your-secret
OWNER_ID=          # optional: bot-owner Telegram id, bypasses group-admin checks
```

## Development

```bash
npm install
npm run typecheck
npm run build
```

## Database

The Drizzle schema lives in `src/db/schema.ts`. SQL migrations are in `drizzle/` and are
applied in order:

```bash
psql "$DATABASE_URL" -f drizzle/0000_initial.sql
psql "$DATABASE_URL" -f drizzle/0001_battles_inventory.sql
```

`0001_battles_inventory.sql` adds the battles, battle_deliveries and player_inventory
tables plus the new player/stat/group columns, and is safe to run on an existing
`0000` database (all statements use `IF NOT EXISTS`).

## Telegram webhook setup

```bash
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://your-domain.example/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```
