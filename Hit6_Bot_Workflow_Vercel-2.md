# Hit6 Telegram Bot

## Complete Product Workflow, Game Design, Database Plan, and Vercel Deployment Specification

**Bot concept:** A lightweight daily cricket progression game for Telegram groups and private chats.

**Primary command:** `/hit6`

**Recommended deployment:** Vercel Functions using Telegram webhooks

**Recommended language:** TypeScript

**Recommended framework:** Next.js App Router

**Recommended Telegram library:** grammY

**Recommended primary database:** PostgreSQL through Neon or Supabase

**Optional cache and rate limiter:** Upstash Redis

---

# 1. Product Overview

Hit6 is a social cricket game inspired by simple daily progression bots.

Each Telegram user owns a permanent batter profile. Once every configured cooldown period, the user can use `/hit6` and receive a randomly generated batting result.

The result may:

- Increase the player's Six Power.
- Add sixes to lifetime career statistics.
- Produce a dot ball.
- Cause a wicket and reduce Six Power.
- Set a new longest-six record.
- Continue or reset the player's streak.
- Unlock an achievement.
- Change group and global leaderboard positions.
- Trigger a rare cricket event such as six sixes in an over.

The core game must remain:

- Fast.
- Easy to understand.
- Usable directly inside Telegram.
- Competitive without requiring constant activity.
- Safe from repeated requests and duplicate rewards.
- Suitable for Vercel's serverless execution model.

---

# 2. Core Game Identity

## 2.1 Name

```text
Hit6
```

## 2.2 Primary progression values

Hit6 should separate the mutable leaderboard score from permanent career statistics.

### Six Power

Six Power is the player's main progression score.

- It increases after successful hits.
- It can decrease after wickets or negative events.
- It determines the main group and global leaderboard.
- It can never fall below `0`.

### Career Sixes

Career Sixes represent the player's permanent lifetime total.

- They increase whenever the user hits one or more sixes.
- They never decrease.
- A wicket does not erase previously hit career sixes.
- They are used for milestones and achievements.

### Why use both values?

Using only Career Sixes creates a logical problem because a career statistic should not decrease after a wicket.

Using Six Power for progression preserves the Grow-style rise-and-fall mechanic, while Career Sixes remains a realistic permanent cricket statistic.

---

# 3. Recommended Technology Stack

```text
Frontend/Admin Panel:
- Next.js App Router
- TypeScript
- Tailwind CSS
- Optional shadcn/ui

Telegram Bot:
- grammY
- Telegram Bot API
- Webhook delivery

Backend:
- Next.js Route Handlers
- Vercel Functions

Database:
- PostgreSQL
- Neon or Supabase

ORM:
- Drizzle ORM
or
- Prisma

Optional:
- Upstash Redis for rate limiting, locks, and cached leaderboards
- Sentry for error monitoring
- Vercel Analytics for admin website traffic
```

## 3.1 Recommended default stack

For a new implementation:

```text
Next.js + TypeScript + grammY + Drizzle ORM + Neon PostgreSQL
```

This combination is suitable for short webhook requests and serverless database access.

---

# 4. High-Level Architecture

```text
Telegram User
     |
     | Sends /hit6 or presses an inline button
     v
Telegram Bot API
     |
     | HTTPS POST update
     v
Vercel Webhook Route
/api/telegram/webhook
     |
     | 1. Verify webhook secret
     | 2. Deduplicate Telegram update
     | 3. Parse command/callback
     | 4. Run game service
     v
PostgreSQL Transaction
     |
     | Read/update profile, cooldown, result, achievements
     v
Telegram Bot API
     |
     | sendMessage / editMessageText / answerCallbackQuery
     v
Telegram Chat
```

---

# 5. Important Vercel Design Rules

Hit6 should be designed as an event-driven bot.

## 5.1 Use webhooks, not long polling

Vercel Functions are request-based. The bot must not run an infinite process waiting for Telegram updates.

Correct flow:

```text
Telegram sends an HTTPS POST request to Vercel.
Vercel processes the update.
The function returns a response.
```

Do not use:

```ts
bot.start();
```

in the production Vercel webhook route.

## 5.2 Do not store state in function memory

Never depend on global variables for permanent gameplay data.

Incorrect:

```ts
const users = new Map();
```

Vercel may create, reuse, or remove function instances at any time.

Store permanent state in PostgreSQL.

## 5.3 Avoid mandatory background jobs

The daily `/hit6` cooldown should be calculated from database timestamps.

Example:

```text
next_hit_at = last_hit_at + cooldown_duration
```

This means the bot does not require a cron job to reset every user.

## 5.4 Keep webhook processing short

A normal update should:

1. Validate the request.
2. perform one short database transaction.
3. send or edit the Telegram message.
4. return HTTP `200`.

Long simulations, image rendering, or large batch jobs should not block the webhook.

---

# 6. Complete User Journey

## 6.1 First interaction

The user sends:

```text
/start
```

The bot checks whether the Telegram user already exists.

### New user flow

```text
1. Read Telegram user ID, name, username, and language.
2. Create a user record.
3. Create a default stats record.
4. Show the welcome screen.
5. Display the main action buttons.
```

### Welcome message

```text
🏏 Welcome to Hit6, {first_name}!

Build your batter, hit sixes every day, unlock achievements,
and compete with players in your groups and around the world.

Your starting profile:

⚡ Six Power: 0
6️⃣ Career Sixes: 0
📏 Longest Six: 0m
🔥 Current Streak: 0 days

Press “Hit a Six” or use /hit6 to play.
```

### Welcome buttons

```text
[🏏 Hit a Six]
[👤 My Profile] [🏆 Leaderboard]
[📖 How to Play]
```

---

## 6.2 Existing user flow

If the user already exists:

```text
1. Update display name and username if Telegram data changed.
2. Do not recreate statistics.
3. Show the main menu or process the requested command.
```

Telegram usernames and names are not permanent, so the bot should refresh them during interactions.

---

# 7. `/hit6` Main Workflow

## 7.1 Input methods

A user may play by:

```text
/hit6
```

or by pressing:

```text
🏏 Hit a Six
```

Both methods must call the same game service.

## 7.2 Validation order

The server should validate in this order:

```text
1. Is the update authentic?
2. Has this Telegram update already been processed?
3. Is the user banned?
4. Is the bot allowed in this chat?
5. Does the user profile exist?
6. Is the user currently allowed to hit?
7. Is another hit request already being processed?
8. Generate the result.
9. Save all changes atomically.
10. Send the result.
```

## 7.3 Cooldown check

Recommended default:

```text
Cooldown: 24 hours
```

Store:

```text
last_hit_at
next_hit_at
```

If the user is still on cooldown:

```text
⏳ You have already played your shot.

Next hit available in:
18h 24m

⚡ Six Power: 47
🔥 Current Streak: 6 days
```

The cooldown response must not generate or save a new result.

## 7.4 Atomic hit transaction

The game result must be processed inside a database transaction.

Conceptual workflow:

```text
BEGIN;

Lock the user's stats row.

Recheck next_hit_at.

If still on cooldown:
    ROLLBACK;
    return cooldown response.

Generate the result.

Insert daily_hits record.

Update user_stats.

Unlock achievements.

Set last_hit_at and next_hit_at.

COMMIT;
```

This prevents users from receiving multiple rewards by rapidly pressing the button or sending duplicate commands.

---

# 8. Random Result System

## 8.1 Recommended outcome table

Probabilities should be stored in the database or configuration rather than hard-coded across many files.

| Result | Weight | Six Power Change | Career Sixes | Streak |
|---|---:|---:|---:|---|
| Wicket | 8% | `-1` to `-3` | `0` | Reset |
| Dot Ball | 12% | `0` | `0` | Continue |
| One Six | 38% | `+1` | `+1` | Continue |
| Two Sixes | 20% | `+2` | `+2` | Continue |
| Three Sixes | 11% | `+3` | `+3` | Continue |
| Four Sixes | 6% | `+4` | `+4` | Continue |
| Five Sixes | 3.5% | `+5` | `+5` | Continue |
| Six Sixes | 1.5% | `+6` | `+6` | Continue |

Total:

```text
100%
```

These values are starting defaults and should be editable by the bot owner.

## 8.2 Secure server-side random selection

Use Node.js cryptographic randomness.

Example concept:

```ts
import { randomInt } from "node:crypto";

const roll = randomInt(1, 10_001);
```

Never generate the final result in:

- Telegram callback data.
- Browser JavaScript.
- The admin frontend.
- User-controlled request fields.

## 8.3 Weighted selection example

```ts
type Outcome =
  | "WICKET"
  | "DOT"
  | "SIX_1"
  | "SIX_2"
  | "SIX_3"
  | "SIX_4"
  | "SIX_5"
  | "SIX_6";

const outcomes = [
  { type: "WICKET", max: 800 },
  { type: "DOT", max: 2000 },
  { type: "SIX_1", max: 5800 },
  { type: "SIX_2", max: 7800 },
  { type: "SIX_3", max: 8900 },
  { type: "SIX_4", max: 9500 },
  { type: "SIX_5", max: 9850 },
  { type: "SIX_6", max: 10000 },
] as const;
```

## 8.4 Six distance calculation

A six distance should only be generated when one or more sixes are hit.

Recommended range:

```text
Minimum: 62 metres
Normal maximum: 115 metres
Rare maximum: 130 metres
```

Example weighted model:

| Distance | Chance |
|---|---:|
| 62–75m | 25% |
| 76–90m | 40% |
| 91–105m | 25% |
| 106–115m | 8% |
| 116–130m | 2% |

The player's longest six is updated only when:

```text
generated_distance > current_longest_six
```

## 8.5 New record message

```text
🚀 NEW PERSONAL RECORD!

Your 121m strike is now your longest career six.
Previous record: 114m
```

---

# 9. Result Message Templates

## 9.1 One-six result

```text
🏏 {name} charges down the pitch...

6️⃣ SIX! Smashed over long-on!

⚡ Six Power: +1
6️⃣ Career Sixes: {career_sixes}
📏 Distance: {distance}m
🔥 Streak: {streak} days

🏆 Group Rank: #{group_rank}
🌍 Global Rank: #{global_rank}

Next hit: {next_hit_time}
```

## 9.2 Multiple-six result

```text
🔥 ABSOLUTE DESTRUCTION!

{name} has launched {six_count} sixes into the crowd!

{ball_sequence}

⚡ Six Power: +{power_gain}
6️⃣ Career Sixes: {career_sixes}
📏 Longest Hit Today: {distance}m
🔥 Streak: {streak} days

{achievement_line}
```

Example ball sequence:

```text
6️⃣ 6️⃣ 6️⃣
```

## 9.3 Dot-ball result

```text
🏏 {name} swings hard...

⚪ DOT BALL!

The bowler wins this delivery.

⚡ Six Power: No change
6️⃣ Career Sixes: {career_sixes}
🔥 Streak: {streak} days

Come back for your next shot in {remaining_time}.
```

## 9.4 Wicket result

```text
🏏 {name} attempts a massive slog...

💥 BOWLED!
The middle stump goes flying.

⚡ Six Power: -{power_loss}
⚡ Current Power: {six_power}
6️⃣ Career Sixes: {career_sixes}
🔥 Streak: Reset

Your career sixes are safe.
Return stronger for the next innings.
```

## 9.5 Six-sixes result

```text
🤯 SIX SIXES IN THE OVER!

{name} has completely destroyed the bowling attack!

6️⃣ 6️⃣ 6️⃣ 6️⃣ 6️⃣ 6️⃣

⚡ Six Power: +6
6️⃣ Career Sixes: {career_sixes}
📏 Longest Six: {distance}m
🔥 Streak: {streak} days

🏆 Achievement Unlocked:
YUVRAJ MODE
```

---

# 10. Streak System

## 10.1 Recommended behavior

A streak represents consecutive successful daily participation.

Recommended rules:

```text
Successful hit or dot ball:
- Continue the streak.

Wicket:
- Reset the active streak to 0.

Playing after the cooldown:
- Increment the streak.

Missing multiple cooldown periods:
- Optionally reset the streak.
```

## 10.2 Simpler recommended rule

For the initial release:

```text
Every valid /hit6 increments the streak.
A wicket resets it.
Missing a day does not reset it automatically.
```

This avoids timezone and scheduled-reset complexity.

## 10.3 Optional strict daily streak

For a stricter future version:

```text
If the user does not play within a grace period after next_hit_at,
reset the streak on the user's next interaction.
```

Example grace period:

```text
24 hours after the next hit becomes available
```

## 10.4 Streak rewards

| Streak | Reward |
|---:|---|
| 3 days | Achievement |
| 7 days | One dot-ball retry token |
| 15 days | One wicket shield |
| 30 days | Exclusive title |
| 50 days | Profile badge |
| 100 days | Legendary achievement |

Streak rewards must not make the game permanently pay-to-win.

---

# 11. Protection Items

Protection items are optional and can be added after the first release.

## 11.1 Wicket Shield

Effect:

```text
The next wicket does not reduce Six Power.
The shield is consumed.
The streak may still reset, depending on configuration.
```

## 11.2 Dot Retry

Effect:

```text
The user may reroll one dot-ball result.
```

Recommended security rule:

The original hit and reroll must be connected using a unique database record. A user must not be able to reuse callback data.

## 11.3 Lucky Bat

Effect:

```text
Temporarily improves the chance of hitting two or more sixes.
```

Avoid allowing unlimited stacking of boosts.

---

# 12. Player Profile

## 12.1 `/profile` or `/mystats`

```text
🏏 {name}'S HIT6 PROFILE

⚡ Six Power: 147
6️⃣ Career Sixes: 196
📏 Longest Six: 121m

🎮 Shots Played: 83
💥 Successful Days: 69
⚪ Dot Balls: 8
💀 Times Out: 6
🤯 Six-Sixes Overs: 2

🔥 Current Streak: 12 days
⭐ Best Streak: 29 days

🏆 Group Rank: #2
🌍 Global Rank: #847

Title: 💥 Power Hitter
Created: 14 June 2026
```

## 12.2 Profile buttons

```text
[🏏 Hit a Six]
[🏆 Achievements] [📜 History]
[👥 Group Rank] [🌍 Global Rank]
```

## 12.3 Public profile

Users can inspect another player's profile by:

```text
/profile
```

while replying to that user.

Or:

```text
/profile @username
```

Telegram user ID should remain the real database identifier. Usernames are only display/search values.

---

# 13. Titles

Recommended title progression:

| Six Power | Title |
|---:|---|
| 0–9 | Net Batter |
| 10–24 | Rookie Hitter |
| 25–49 | Boundary Hunter |
| 50–99 | Power Hitter |
| 100–249 | Six Machine |
| 250–499 | Stadium Destroyer |
| 500–999 | Elite Finisher |
| 1,000–2,499 | World-Class Hitter |
| 2,500–4,999 | Six Legend |
| 5,000+ | Immortal Batter |

Special titles can be unlocked independently:

```text
Yuvraj Mode
Universe Boss
Hitman
Mr. 360
Last-Over Finisher
Streak Master
Group Champion
```

Use fictional or generic titles if licensing or branding concerns arise.

---

# 14. Achievement System

## 14.1 Achievement categories

### Career achievements

```text
FIRST_SIX
CAREER_10_SIXES
CAREER_50_SIXES
CAREER_100_SIXES
CAREER_500_SIXES
CAREER_1000_SIXES
```

### Distance achievements

```text
SIX_90M
SIX_100M
SIX_110M
SIX_120M
SIX_130M
```

### Streak achievements

```text
STREAK_3
STREAK_7
STREAK_15
STREAK_30
STREAK_100
```

### Rare achievements

```text
SIX_SIXES_IN_OVER
THREE_SIX_SIX_OVERS
COMEBACK_AFTER_WICKET
NUMBER_ONE_IN_GROUP
NUMBER_ONE_GLOBAL
```

## 14.2 Unlock workflow

After saving a valid result:

```text
1. Read the updated stats.
2. Find matching achievement conditions.
3. Ignore achievements already unlocked.
4. Insert newly unlocked achievements.
5. Add them to the result response.
```

The achievement operation must be idempotent.

Use a unique database constraint:

```text
UNIQUE(user_id, achievement_code)
```

---

# 15. Leaderboards

## 15.1 Group leaderboard

Command:

```text
/top
```

or:

```text
/grouptop
```

Example:

```text
🏆 HIT6 GROUP LEADERBOARD

1. Ninja — 347 Power
2. Servesh — 294 Power
3. Dhruva — 261 Power
4. Shadow — 205 Power
5. Steven — 181 Power

Your Position: #2
Your Six Power: 294
```

## 15.2 Global leaderboard

Command:

```text
/globaltop
```

Global rankings should use:

```text
six_power DESC
career_sixes DESC
longest_six_m DESC
created_at ASC
```

This creates deterministic tie-breaking.

## 15.3 Daily leaderboard

Command:

```text
/today
```

Recommended categories:

```text
Most Sixes Today
Longest Six Today
Biggest Six Power Gain
Rare Result of the Day
```

## 15.4 Weekly and monthly leaderboard

These can be calculated from `daily_hits`.

```text
/weekly
/monthly
```

Do not overwrite permanent statistics when a weekly season ends.

## 15.5 Pagination

For large leaderboards:

```text
[⬅️ Previous] [1/10] [Next ➡️]
```

Callback data should contain a short page identifier, not trusted score values.

---

# 16. Group Membership Workflow

## 16.1 When a user plays in a group

The bot should create or update a `group_members` row.

Store:

```text
group_id
user_id
first_seen_at
last_active_at
is_active
```

## 16.2 Group leaderboard eligibility

A user should appear in a group's leaderboard after:

```text
- Using /hit6 in that group.
or
- Using another configured game command in that group.
```

Do not add every Telegram group member automatically because Telegram may not provide a complete member list.

## 16.3 Leaving a group

If the bot receives a membership update showing that a user left:

```text
is_active = false
```

The user's global profile remains intact.

The group owner may choose whether inactive players stay visible in historical leaderboards.

---

# 17. Batter of the Day

## 17.1 Selection

The bot can determine a daily winner from `daily_hits`.

Recommended priority:

```text
1. Most career sixes gained that day.
2. Highest six distance.
3. Earliest achievement time.
```

## 17.2 Announcement

```text
👑 BATTER OF THE DAY

{name} produced the best performance today!

6️⃣ Sixes Today: 6
📏 Longest Six: 112m
⚡ Power Gained: +6

Congratulations, champion!
```

## 17.3 No mandatory cron design

The winner can be shown when a user runs:

```text
/today
```

A scheduled automatic announcement is optional.

If automatic announcements are enabled, use one daily Vercel Cron request or an external scheduler. Do not require hourly cron jobs for the basic game.

---

# 18. Challenge System

## 18.1 Starting a challenge

A user replies to another user with:

```text
/challenge
```

Validation:

```text
- Challenger cannot challenge themselves.
- Both users must not be banned.
- The target cannot be a bot.
- Both users must have profiles.
- Challenger must have remaining daily challenge attempts.
- No active duplicate challenge may exist.
```

## 18.2 Challenge invitation

```text
⚔️ HIT6 CHALLENGE

{challenger} has challenged {opponent}
to a three-ball batting battle!

Entry: Free
Reward: +3 Battle Points
Expires in: 5 minutes

[✅ Accept] [❌ Decline]
```

## 18.3 Callback security

Only the challenged Telegram user may press Accept or Decline.

Validation:

```text
callback.from.id === challenge.opponent_user_id
```

Do not trust usernames.

## 18.4 Challenge battle

Each player receives three generated deliveries.

Possible delivery values:

```text
W = 0
• = 0
1 = 1
2 = 2
4 = 4
6 = 6
```

Example:

```text
⚔️ HIT6 BATTLE

Servesh:
6️⃣ • 6️⃣
Total: 12

Ninja:
4️⃣ 6️⃣ W
Total: 10

🏆 Servesh wins!

Battle Points:
Servesh +3
Ninja +1
```

## 18.5 Draw

```text
🤝 The battle is tied!

Both players receive one Super Ball.

Servesh: 6️⃣
Ninja: 4️⃣

🏆 Servesh wins the Super Ball!
```

## 18.6 Challenge limits

Recommended:

```text
Challenges started per day: 3
Challenges accepted per day: 5
```

Challenge limits should be separate from `/hit6`.

## 18.7 Challenge database states

```text
PENDING
ACCEPTED
DECLINED
EXPIRED
COMPLETED
CANCELLED
```

A challenge may only move through valid state transitions.

---

# 19. Command List

## 19.1 Player commands

```text
/start
Open the bot and create a profile.

/hit6
Play the daily shot.

/profile
View your profile.

/mystats
Alias of /profile.

/top
View the current group's leaderboard.

/globaltop
View the global leaderboard.

/today
View today's best performances.

/weekly
View weekly rankings.

/monthly
View monthly rankings.

/history
View recent hit results.

/achievements
View unlocked achievements.

/challenge
Challenge the user you replied to.

/battlestats
View challenge statistics.

/settings
Change personal preferences.

/help
View rules and commands.

/support
Open support information.

/privacy
View privacy information.
```

## 19.2 Group-admin commands

```text
/hit6settings
Open group settings.

/enablehit6
Enable gameplay in the group.

/disablehit6
Disable gameplay in the group.

/setlanguage
Set the group's bot language.

/setcooldown
Set the group cooldown if custom cooldowns are supported.

/setannouncement
Enable or disable daily winner announcements.

/resetgrouprank
Start a new group leaderboard season.
```

Only Telegram group administrators should be permitted to use group-admin commands.

## 19.3 Owner commands

```text
/admin
Open the owner panel.

/banuser
Ban a user from gameplay.

/unbanuser
Remove a gameplay ban.

/banchat
Disable the bot in a chat.

/broadcast
Send a controlled announcement.

/setweights
Change outcome probabilities.

/maintenance
Enable maintenance mode.

/stats
View bot-wide usage statistics.

/reprocess
Safely inspect or reprocess a failed update.

/grantachievement
Manually grant an achievement.

/revokachievement
Remove a manually granted achievement.
```

Sensitive owner actions should preferably be performed through a protected web admin panel.

---

# 20. Inline Keyboard Navigation

## 20.1 Main menu

```text
[🏏 Hit a Six]
[👤 Profile] [🏆 Leaderboard]
[⚔️ Challenge] [🏅 Achievements]
[⚙️ Settings] [❓ Help]
```

## 20.2 Result buttons

```text
[👤 View Profile] [🏆 View Rank]
[📜 Recent History]
[🔄 Share Result]
```

## 20.3 Callback format

Keep callback data short.

Example:

```text
h6:hit
h6:profile
h6:top:g:1
h6:top:global:1
h6:challenge:accept:abc123
```

Never place secrets, scores, or permission decisions inside callback data.

---

# 21. Database Design

## 21.1 `users`

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT,
    language_code TEXT,
    is_bot BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 21.2 `user_stats`

```sql
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    six_power INTEGER NOT NULL DEFAULT 0 CHECK (six_power >= 0),
    career_sixes INTEGER NOT NULL DEFAULT 0 CHECK (career_sixes >= 0),
    longest_six_m INTEGER NOT NULL DEFAULT 0 CHECK (longest_six_m >= 0),
    shots_played INTEGER NOT NULL DEFAULT 0,
    successful_hits INTEGER NOT NULL DEFAULT 0,
    dot_balls INTEGER NOT NULL DEFAULT 0,
    wickets INTEGER NOT NULL DEFAULT 0,
    six_sixes_overs INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    battle_points INTEGER NOT NULL DEFAULT 0,
    battles_played INTEGER NOT NULL DEFAULT 0,
    battles_won INTEGER NOT NULL DEFAULT 0,
    battles_lost INTEGER NOT NULL DEFAULT 0,
    battles_drawn INTEGER NOT NULL DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    next_hit_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 21.3 `chats`

```sql
CREATE TABLE chats (
    id UUID PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL UNIQUE,
    chat_type TEXT NOT NULL,
    title TEXT,
    username TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    language_code TEXT NOT NULL DEFAULT 'en',
    daily_announcement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 21.4 `group_members`

```sql
CREATE TABLE group_members (
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (chat_id, user_id)
);
```

## 21.5 `daily_hits`

```sql
CREATE TABLE daily_hits (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    telegram_update_id BIGINT NOT NULL,
    outcome_code TEXT NOT NULL,
    sixes_hit INTEGER NOT NULL DEFAULT 0,
    six_power_change INTEGER NOT NULL DEFAULT 0,
    six_distance_m INTEGER,
    streak_before INTEGER NOT NULL,
    streak_after INTEGER NOT NULL,
    six_power_before INTEGER NOT NULL,
    six_power_after INTEGER NOT NULL,
    career_sixes_before INTEGER NOT NULL,
    career_sixes_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_update_id)
);
```

## 21.6 `achievements`

```sql
CREATE TABLE achievements (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT,
    category TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 21.7 `user_achievements`

```sql
CREATE TABLE user_achievements (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_code TEXT NOT NULL REFERENCES achievements(code),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    PRIMARY KEY (user_id, achievement_code)
);
```

## 21.8 `challenges`

```sql
CREATE TABLE challenges (
    id UUID PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    challenger_user_id UUID NOT NULL REFERENCES users(id),
    opponent_user_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    challenger_deliveries JSONB,
    opponent_deliveries JSONB,
    challenger_score INTEGER,
    opponent_score INTEGER,
    winner_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CHECK (challenger_user_id <> opponent_user_id)
);
```

## 21.9 `processed_updates`

```sql
CREATE TABLE processed_updates (
    telegram_update_id BIGINT PRIMARY KEY,
    update_type TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This table provides general Telegram update idempotency.

## 21.10 `game_config`

```sql
CREATE TABLE game_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);
```

Example keys:

```text
hit_cooldown_seconds
outcome_weights
distance_weights
challenge_daily_limit
maintenance_mode
minimum_supported_version
```

## 21.11 `admin_audit_logs`

```sql
CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY,
    admin_telegram_user_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 22. Recommended Indexes

```sql
CREATE INDEX idx_users_username
ON users (LOWER(username));

CREATE INDEX idx_user_stats_power
ON user_stats (six_power DESC, career_sixes DESC);

CREATE INDEX idx_daily_hits_user_created
ON daily_hits (user_id, created_at DESC);

CREATE INDEX idx_daily_hits_chat_created
ON daily_hits (chat_id, created_at DESC);

CREATE INDEX idx_group_members_chat_active
ON group_members (chat_id, is_active);

CREATE INDEX idx_challenges_opponent_status
ON challenges (opponent_user_id, status);

CREATE INDEX idx_challenges_expires
ON challenges (expires_at)
WHERE status = 'PENDING';
```

---

# 23. Folder Structure

```text
hit6-bot/
├── app/
│   ├── api/
│   │   ├── telegram/
│   │   │   ├── webhook/
│   │   │   │   └── route.ts
│   │   │   ├── set-webhook/
│   │   │   │   └── route.ts
│   │   │   └── webhook-info/
│   │   │       └── route.ts
│   │   ├── cron/
│   │   │   └── daily-awards/
│   │   │       └── route.ts
│   │   └── health/
│   │       └── route.ts
│   ├── admin/
│   │   ├── page.tsx
│   │   ├── users/
│   │   ├── chats/
│   │   ├── config/
│   │   └── analytics/
│   ├── privacy/
│   │   └── page.tsx
│   └── page.tsx
├── src/
│   ├── bot/
│   │   ├── create-bot.ts
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── hit6.ts
│   │   │   ├── profile.ts
│   │   │   ├── leaderboard.ts
│   │   │   ├── history.ts
│   │   │   ├── achievements.ts
│   │   │   └── challenge.ts
│   │   ├── callbacks/
│   │   │   ├── hit.ts
│   │   │   ├── navigation.ts
│   │   │   └── challenge.ts
│   │   ├── middleware/
│   │   │   ├── identify-user.ts
│   │   │   ├── identify-chat.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── maintenance.ts
│   │   │   └── error-handler.ts
│   │   └── keyboards/
│   │       ├── main-menu.ts
│   │       └── result-menu.ts
│   ├── game/
│   │   ├── hit-service.ts
│   │   ├── outcome-engine.ts
│   │   ├── distance-engine.ts
│   │   ├── streak-service.ts
│   │   ├── achievement-service.ts
│   │   ├── title-service.ts
│   │   └── challenge-service.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── repositories/
│   ├── telegram/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   └── formatting.ts
│   ├── security/
│   │   ├── admin-auth.ts
│   │   ├── webhook-secret.ts
│   │   └── validation.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── game-defaults.ts
│   └── utils/
│       ├── dates.ts
│       ├── random.ts
│       └── logger.ts
├── drizzle/
├── public/
├── scripts/
│   ├── set-webhook.ts
│   ├── seed-achievements.ts
│   └── migrate.ts
├── tests/
│   ├── outcome-engine.test.ts
│   ├── cooldown.test.ts
│   ├── idempotency.test.ts
│   └── challenge.test.ts
├── .env.example
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

# 24. Webhook Route Workflow

## 24.1 Endpoint

```text
POST /api/telegram/webhook
```

## 24.2 Request validation

When setting the Telegram webhook, provide a secret token.

Telegram will include:

```text
X-Telegram-Bot-Api-Secret-Token
```

The route must compare that value with:

```text
TELEGRAM_WEBHOOK_SECRET
```

Reject invalid requests:

```text
HTTP 401
```

## 24.3 Conceptual route

```ts
export async function POST(request: Request) {
  const secret = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );

  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json();

  await processTelegramUpdate(update);

  return new Response("OK", { status: 200 });
}
```

## 24.4 Idempotency

Before executing a reward-producing command:

```text
INSERT telegram_update_id into processed_updates.
```

If the ID already exists:

```text
Return HTTP 200 without generating another result.
```

Telegram may retry webhook requests when it does not receive a successful response.

---

# 25. Bot Initialization

Create one reusable bot factory.

Concept:

```ts
import { Bot } from "grammy";

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const bot = new Bot(token);

  registerMiddleware(bot);
  registerCommands(bot);
  registerCallbacks(bot);
  registerErrorHandling(bot);

  return bot;
}
```

The production webhook route should pass the incoming update into the bot webhook handler.

Do not call long polling from a Vercel production function.

---

# 26. Environment Variables

Create `.env.example`:

```env
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=

# Application
APP_URL=https://your-project.vercel.app
NODE_ENV=production
DEFAULT_LANGUAGE=en
BOT_OWNER_IDS=123456789
MAINTENANCE_MODE=false

# Database
DATABASE_URL=

# Optional Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Admin authentication
AUTH_SECRET=
ADMIN_EMAILS=

# Optional monitoring
SENTRY_DSN=

# Optional cron protection
CRON_SECRET=
```

Rules:

- Never commit `.env` or `.env.local`.
- Never expose the bot token through `NEXT_PUBLIC_*`.
- Production, Preview, and Development should use separate credentials where possible.
- Redeploy after changing Vercel environment variables.

---

# 27. Registering the Telegram Webhook

After deploying to Vercel, register:

```text
https://your-project.vercel.app/api/telegram/webhook
```

Recommended `setWebhook` values:

```json
{
  "url": "https://your-project.vercel.app/api/telegram/webhook",
  "secret_token": "YOUR_RANDOM_WEBHOOK_SECRET",
  "allowed_updates": [
    "message",
    "callback_query",
    "my_chat_member",
    "chat_member"
  ],
  "drop_pending_updates": true
}
```

Use `drop_pending_updates` carefully. It removes queued updates that arrived before the new webhook configuration.

## 27.1 Webhook setup script

The setup script should:

```text
1. Read the bot token.
2. Read APP_URL.
3. Read TELEGRAM_WEBHOOK_SECRET.
4. Call Telegram setWebhook.
5. Print the returned status.
6. Call getWebhookInfo for verification.
```

Do not expose this operation as an unprotected public endpoint.

---

# 28. Rate Limiting

Rate limiting protects the webhook from spam and accidental repeated button presses.

## 28.1 Suggested limits

```text
/hit6:
- Game cooldown enforced in PostgreSQL.
- Additional burst limit: 5 requests per 10 seconds.

/profile:
- 10 requests per minute.

/top:
- 10 requests per minute.

/challenge:
- 5 creation requests per minute.

All commands:
- 30 requests per minute per Telegram user.
```

## 28.2 Storage

Options:

```text
Recommended at scale: Upstash Redis
Simple initial release: PostgreSQL counters or in-memory best effort
```

In-memory limiting alone is not reliable across Vercel function instances.

---

# 29. Security Requirements

## 29.1 Telegram webhook secret

Always validate the webhook secret header.

## 29.2 Admin identity

Use numeric Telegram user IDs:

```text
BOT_OWNER_IDS=123456789,987654321
```

Do not grant owner permissions by username.

## 29.3 SQL safety

Use parameterized queries through the ORM.

Never concatenate user messages into SQL.

## 29.4 Callback authorization

Every callback must verify:

```text
- The referenced record exists.
- It is not expired.
- The actor is permitted.
- The state transition is valid.
- It has not already been processed.
```

## 29.5 HTML/Markdown escaping

Telegram names may contain formatting characters.

Escape dynamic user data before using Telegram HTML or MarkdownV2 parse mode.

## 29.6 Secrets

Keep these server-side only:

```text
TELEGRAM_BOT_TOKEN
DATABASE_URL
TELEGRAM_WEBHOOK_SECRET
AUTH_SECRET
UPSTASH_REDIS_REST_TOKEN
CRON_SECRET
```

## 29.7 Privacy

Store only data required for gameplay:

```text
Telegram user ID
Display name
Username
Language
Gameplay stats
Chat membership activity
```

Provide a privacy command and deletion request process.

---

# 30. Error Handling

## 30.1 User-safe errors

Example:

```text
⚠️ The shot could not be completed.

Your cooldown and statistics were not changed.
Please try again.
```

Never claim the shot failed after the transaction was committed unless the bot can recover and show the saved result.

## 30.2 Result recovery

If the database transaction succeeds but Telegram message delivery fails:

```text
- Keep the saved hit.
- Log the delivery failure.
- Allow /history to show the result.
- Do not generate a replacement result.
```

## 30.3 Structured logging

Log:

```text
request_id
telegram_update_id
telegram_user_id
telegram_chat_id
command
result_code
duration_ms
error_name
```

Do not log the bot token, database password, or webhook secret.

---

# 31. Health Check

Endpoint:

```text
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "service": "hit6-bot",
  "timestamp": "2026-06-24T12:00:00.000Z"
}
```

Optional database health:

```text
SELECT 1
```

Do not expose sensitive system details.

---

# 32. Admin Web Panel

## 32.1 Dashboard

Display:

```text
Total Users
Active Users Today
Total Groups
Hits Today
Sixes Today
Wickets Today
Challenges Today
Webhook Errors
Database Errors
```

## 32.2 User management

Admin actions:

```text
Search by Telegram ID, username, or name.
View profile and recent hits.
Ban or unban.
Adjust Six Power with a reason.
Grant or revoke achievement.
Reset cooldown.
View audit history.
```

## 32.3 Game configuration

Editable settings:

```text
Cooldown duration
Outcome weights
Distance ranges
Streak rules
Challenge limits
Leaderboard page size
Maintenance mode
Disabled commands
```

Probability validation:

```text
All enabled outcome weights must total 100%.
```

## 32.4 Chat management

```text
View active groups.
Disable bot in a group.
Set language.
Enable announcements.
View group activity.
Reset group season.
```

## 32.5 Audit log

Every sensitive action must record:

```text
admin
action
target
previous value
new value
timestamp
reason
```

---

# 33. Group Seasons

Group seasons are optional.

## 33.1 Purpose

A permanent global profile remains active, while each group can start a fresh local competition.

## 33.2 Season data

Add:

```text
group_seasons
group_season_scores
```

A group season reset must not change:

```text
Global Six Power
Career Sixes
Achievements
Personal longest six
```

## 33.3 Season winner message

```text
🏆 HIT6 SEASON COMPLETE

Champion: {name}
Final Season Power: {score}
Longest Six: {distance}m
Total Hits: {hits}

A new group season has started!
```

---

# 34. Localization

Start with:

```text
English
Hindi
```

Recommended translation structure:

```text
src/locales/en.ts
src/locales/hi.ts
```

Use keys:

```text
welcome.title
hit.six.single
hit.six.multiple
hit.dot
hit.wicket
cooldown.active
profile.title
leaderboard.group
challenge.invite
error.generic
```

Do not build messages by translating fragmented sentence pieces. Store complete message templates.

---

# 35. Time and Cooldown Formatting

Store timestamps in UTC.

Display them based on:

```text
User-selected timezone
or
Default timezone
```

Recommended default:

```text
Asia/Kolkata
```

Example formatter:

```text
23h 12m
4h 08m
17m 42s
```

The database remains UTC even when the display uses a local timezone.

---

# 36. Testing Plan

## 36.1 Unit tests

Test:

```text
Outcome weights cover the complete random range.
Six Power never becomes negative.
Career Sixes never decrease.
Longest six only updates for a larger value.
Wicket resets streak correctly.
Cooldown time is calculated correctly.
Titles match boundary values.
Achievements unlock only once.
```

## 36.2 Concurrency tests

Simulate:

```text
Two /hit6 requests for the same user at the same time.
Repeated Telegram update ID.
Repeated callback press.
Two accepts on the same challenge.
```

Expected:

```text
Only one reward is committed.
```

## 36.3 Integration tests

Test:

```text
Telegram update -> webhook -> database -> response
New user creation
Group membership insertion
Leaderboard query
Challenge acceptance
Admin ban
Maintenance mode
```

## 36.4 Probability simulation

Run at least:

```text
1,000,000 generated outcomes
```

Compare observed frequencies with configured weights.

This simulation must be a test or development script, not part of each production hit.

---

# 37. Performance Plan

## 37.1 Keep command queries narrow

Do not load the user's entire history for `/hit6`.

Load only:

```text
user identity
current stats
active protection items
relevant game configuration
```

## 37.2 Cache suitable data

Optional cache targets:

```text
Game configuration
Global top 20
Group top 20
Achievement definitions
```

Do not cache cooldown truth as the only source. PostgreSQL remains authoritative.

## 37.3 Leaderboard refresh

Possible cache duration:

```text
15–60 seconds
```

A user can still receive an exact personal position from the database when needed.

---

# 38. Vercel Deployment Workflow

## 38.1 Local project creation

```bash
npx create-next-app@latest hit6-bot --typescript
cd hit6-bot
```

Install dependencies:

```bash
npm install grammy drizzle-orm @neondatabase/serverless zod
npm install -D drizzle-kit
```

Optional:

```bash
npm install @upstash/redis @upstash/ratelimit
npm install @sentry/nextjs
```

## 38.2 Create Telegram bot

Using BotFather:

```text
/newbot
```

Save:

```text
Bot token
Bot username
```

Configure commands through BotFather or the Bot API.

## 38.3 Create database

Recommended choices:

```text
Neon PostgreSQL
or
Supabase PostgreSQL
```

Choose a region close to the Vercel function region when possible.

## 38.4 Run migrations

```bash
npm run db:generate
npm run db:migrate
```

Seed achievements:

```bash
npm run db:seed
```

## 38.5 Push to GitHub

```bash
git init
git add .
git commit -m "Initial Hit6 bot"
git branch -M main
git remote add origin <repository>
git push -u origin main
```

## 38.6 Import into Vercel

```text
1. Open Vercel.
2. Add New Project.
3. Import the GitHub repository.
4. Select Next.js framework settings.
5. Add environment variables.
6. Deploy.
```

## 38.7 Set production environment variables

Required:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
APP_URL
DATABASE_URL
BOT_OWNER_IDS
AUTH_SECRET
```

## 38.8 Register webhook

After the production URL is active:

```bash
npm run telegram:set-webhook
```

## 38.9 Verify

Check:

```text
Telegram getWebhookInfo
/api/health
/start
/hit6
/profile
/top
```

## 38.10 Production smoke test

Use a test account and group.

Confirm:

```text
Only one hit is accepted.
Cooldown is shown on repeat.
Group membership is saved.
Leaderboard updates.
Buttons answer without loading forever.
Webhook returns HTTP 200.
No secrets appear in logs.
```

---

# 39. `vercel.json`

A minimal configuration may include a daily optional cron:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-awards",
      "schedule": "0 18 * * *"
    }
  ]
}
```

Important:

- Vercel cron schedules use UTC.
- The core game should work without this cron.
- Protect the endpoint using `CRON_SECRET`.
- Hobby-plan cron frequency restrictions may apply.

If automatic daily awards are not needed, omit the cron configuration.

---

# 40. Cron Endpoint Security

Concept:

```ts
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await calculateAndAnnounceDailyWinners();

  return Response.json({ ok: true });
}
```

The job must be idempotent.

Create a daily job record:

```text
job_name + execution_date = unique
```

This prevents duplicate announcements.

---

# 41. Bot Command Registration

Recommended BotFather command list:

```text
start - Start Hit6
hit6 - Play your daily shot
profile - View your batting profile
top - View group leaderboard
globaltop - View global leaderboard
today - View today's best performers
history - View recent results
achievements - View achievements
challenge - Challenge another player
battlestats - View battle statistics
settings - Change preferences
help - View game rules
privacy - View privacy information
support - Contact support
```

---

# 42. Anti-Cheat and Abuse Prevention

## 42.1 Duplicate Telegram accounts

It is not possible to reliably prove that multiple Telegram accounts belong to one person.

Possible controls:

```text
Minimum account activity requirements for tournaments.
Group-specific moderation.
Suspicious activity flags.
No transferable Six Power.
No rewards with real-money value.
```

## 42.2 Rapid request spam

Use:

```text
Webhook idempotency
Database row lock
Rate limiting
Cooldown transaction
Callback state validation
```

## 42.3 Admin abuse

Use:

```text
Audit logs
Reason required for manual stat changes
Separate owner and moderator permissions
No direct database editing from public pages
```

## 42.4 Replay attacks

A challenge callback should stop working after:

```text
accepted
declined
expired
completed
```

---

# 43. Data Retention and Deletion

## 43.1 `/deletedata`

Optional command:

```text
/deletedata
```

Workflow:

```text
1. Explain the effect.
2. Require confirmation.
3. Delete or anonymize the user's profile.
4. Preserve only legally necessary operational records.
5. Confirm completion.
```

Confirmation buttons:

```text
[⚠️ Permanently Delete] [Cancel]
```

The callback must expire.

## 43.2 Group deletion

If the bot is removed from a group:

```text
Mark the chat inactive.
Retain historical game data for a configurable period.
Allow owner cleanup through admin tools.
```

---

# 44. Analytics

Track aggregated metrics:

```text
Daily active users
Weekly active users
New users
New groups
Hits per day
Successful hit rate
Wicket rate
Average Six Power gain
Challenge acceptance rate
Retention after 1, 7, and 30 days
Webhook failure rate
Database latency
Telegram API latency
```

Do not expose private user information in public analytics.

---

# 45. Maintenance Mode

When enabled:

```text
🚧 Hit6 is temporarily under maintenance.

Your profile and cooldown are safe.
Please try again later.
```

Maintenance mode should block reward-changing commands but may allow:

```text
/help
/privacy
/support
```

Do not consume the user's cooldown during maintenance.

---

# 46. Recommended Release Plan

## Phase 1 — Minimum Viable Bot

```text
/start
/hit6
/profile
/top
/globaltop
/history
Basic achievements
PostgreSQL
Webhook deployment
Cooldown protection
Idempotency
```

## Phase 2 — Social Features

```text
Challenges
Daily leaderboard
Weekly leaderboard
Group settings
Multiple languages
Share result button
```

## Phase 3 — Progression Expansion

```text
Streak rewards
Protection items
Special titles
Group seasons
Season champion badges
Admin web dashboard
```

## Phase 4 — Scale and Reliability

```text
Redis rate limiting
Cached leaderboards
Advanced monitoring
Queue for broadcasts
Automated backups
Performance alerts
```

---

# 47. Acceptance Criteria

The first production release is ready when all conditions below pass.

## Gameplay

- `/hit6` creates exactly one result per cooldown.
- Career Sixes never decrease.
- Six Power never goes below zero.
- Wicket, dot, and multi-six results work.
- Longest six updates correctly.
- Streak updates correctly.
- Achievements are not duplicated.

## Telegram

- Commands work in private and group chats.
- Inline buttons answer quickly.
- Unauthorized users cannot accept another person's challenge.
- User names are safely escaped.
- Group admins alone can change group settings.

## Database

- Duplicate update IDs do not create duplicate rewards.
- Simultaneous requests do not create multiple hits.
- All important writes use transactions.
- Required indexes exist.
- Migrations can run on a clean database.

## Vercel

- Webhook route works in production.
- No long-polling process is required.
- Environment variables are configured.
- Health route responds successfully.
- Webhook secret is validated.
- Function logs contain no secrets.

## Administration

- Owner can ban and unban users.
- Manual stat changes create audit logs.
- Maintenance mode does not consume cooldowns.
- Game weights cannot be saved unless valid.

---

# 48. Final Recommended Product Rules

```text
Bot Name:
Hit6

Main Action:
Use /hit6 once every 24 hours.

Main Mutable Score:
Six Power

Permanent Career Score:
Career Sixes

Negative Outcome:
Wicket reduces Six Power but not Career Sixes.

Main Rankings:
Group and Global

Rare Outcome:
Six Sixes in an Over

Social Feature:
Three-ball player challenges

Retention Features:
Cooldown, streaks, titles, achievements, daily rankings

Deployment:
Vercel webhook-based functions

Permanent Storage:
PostgreSQL

Optional Fast Storage:
Redis

Cron Dependency:
Not required for core gameplay
```

---

# 49. Official Technical References

- Telegram Bot API: https://core.telegram.org/bots/api
- grammY Vercel hosting guide: https://grammy.dev/hosting/vercel
- grammY webhook deployment guide: https://grammy.dev/guide/deployment-types
- Vercel Functions: https://vercel.com/docs/functions
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Vercel Environment Variables: https://vercel.com/docs/environment-variables
- Vercel Postgres integrations: https://vercel.com/docs/postgres
- Vercel Storage Marketplace: https://vercel.com/docs/storage

---

# 50. Implementation Note

For Vercel, the most important technical decision is:

```text
Use a Telegram webhook and complete each update as a short,
idempotent database-backed request.
```

Do not run the bot as an always-active polling process.

The database, not the Vercel function's memory, must be the source of truth for:

```text
Cooldowns
Six Power
Career Sixes
Streaks
Achievements
Challenges
Leaderboards
Processed Telegram updates
```
