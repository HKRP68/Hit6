# HIT6 Telegram Bot
## Complete Workflow, Commands, Game Systems and Development Specification

**Bot concept:** A cricket-themed daily progression and social competition bot for Telegram groups.

**Primary command:** `/hit6`

**Core progression value:** Career Sixes

**Main gameplay loop:**  
A user plays one daily batting attempt, receives a randomized cricket outcome, grows their career statistics, competes in group and global rankings, unlocks titles and achievements, and returns the next day.

---

# 1. Product Overview

Hit6 is a lightweight Telegram cricket game inspired by daily-progression group bots.

Each player has a persistent cricket profile. Once per cooldown period, the player uses `/hit6` to face a short batting event. The event can produce a dot ball, boundary, wicket, multiple sixes, a record-breaking six, or a rare special result.

The bot should be simple enough to use with one command but deep enough to support:

- Daily progression
- Group competition
- Global competition
- Player profiles
- Streaks
- Titles
- Achievements
- Player-versus-player battles
- Daily and weekly awards
- Seasonal leaderboards
- Group statistics
- Anti-spam and anti-abuse systems
- Admin controls
- Optional economy and cosmetic systems

The game should work in:

- Telegram groups
- Supergroups
- Private chat
- Inline mode, if implemented later

---

# 2. Main Design Principles

## 2.1 Easy to Start

A new player should be able to begin by sending:

```text
/hit6
```

The bot automatically creates the player profile if one does not already exist.

No registration form should be required.

## 2.2 One Main Daily Action

The main game must remain simple:

```text
Use /hit6 → Receive result → Stats update → Return after cooldown
```

Secondary systems should enhance the game without making the main action confusing.

## 2.3 Group-Based Competition

Every Telegram group should have its own rankings, records and daily winners.

A player can participate in multiple groups, but the player’s global career statistics remain connected to one Telegram account.

## 2.4 Fair Randomness

Results should be generated using server-side weighted randomness.

The bot must never decide results based on:

- User identity
- Telegram Premium status
- Group ownership
- Admin status
- Personal relationship with the bot owner

Streak bonuses, upgrades and temporary effects may influence probabilities only when clearly described.

## 2.5 Fast Responses

Normal command responses should ideally be sent within one second.

The bot should avoid unnecessary animations or long processing messages.

---

# 3. Player Registration Workflow

## 3.1 First-Time `/hit6`

When a user sends `/hit6` for the first time:

1. Read the Telegram user ID.
2. Check whether the user exists in the database.
3. If not, create a player profile.
4. Add the player to the current group’s membership table.
5. Generate the daily batting result.
6. Save the result and updated statistics.
7. Send the result message.
8. Start the cooldown.

## 3.2 Initial Player Data

```text
Career Sixes: 0
Career Fours: 0
Total Runs: 0
Balls Faced: 0
Wickets: 0
Longest Six: 0m
Current Streak: 0
Best Streak: 0
Bat Power: Level 1
Matches Played: 0
Battles Played: 0
Achievements: None
Title: Net Batter
```

## 3.3 Returning Player in a New Group

When an existing player uses the bot in a new group:

1. Keep the same global profile.
2. Create a group membership record.
3. Start recording group-specific contributions.
4. Add the player to the group leaderboard.
5. Do not reset global statistics.

---

# 4. Core `/hit6` Workflow

## 4.1 Command Execution

```text
/hit6
```

The bot should perform the following validation:

1. Check whether the command is available in the current chat.
2. Check whether the user is banned from the bot.
3. Check whether the group has disabled the game.
4. Check whether the player is currently on cooldown.
5. Check for active protection, bonus or event modifiers.
6. Generate the result.
7. Update all relevant statistics.
8. Evaluate streaks, records, achievements and titles.
9. Update group, global, daily and seasonal leaderboards.
10. Send one final response.

## 4.2 Cooldown Rule

Recommended default:

```text
One /hit6 attempt every 24 hours
```

Two cooldown systems are possible.

### Fixed Daily Reset

All users can play again after a fixed reset time.

Example:

```text
Daily reset: 00:00 UTC
```

### Rolling Cooldown

Every user receives a personal cooldown.

Example:

```text
Played at 4:35 PM
Next attempt available at 4:35 PM the next day
```

### Recommended Option

Use a rolling 20-hour or 24-hour cooldown.

A 20-hour cooldown is more forgiving and prevents the play time from moving later every day.

Recommended configuration:

```text
Default cooldown: 20 hours
Maximum daily attempts: 1
```

## 4.3 Cooldown Response

```text
⏳ You have already played today!

Next batting attempt available in:
6 hours 24 minutes

🏏 Career Sixes: 147
🔥 Current Streak: 8 days
```

The cooldown message must not create another match record.

---

# 5. Daily Batting Outcomes

## 5.1 Base Outcome Table

| Outcome | Base Chance | Runs | Sixes | Other Effect |
|---|---:|---:|---:|---|
| Dot Ball | 10% | 0 | 0 | No progression |
| Single | 5% | 1 | 0 | Small run gain |
| Double | 5% | 2 | 0 | Small run gain |
| Four | 10% | 4 | 0 | Adds one career four |
| One Six | 35% | 6 | 1 | Standard successful result |
| Two Sixes | 18% | 12 | 2 | Strong result |
| Three Sixes | 8% | 18 | 3 | Rare result |
| Four Sixes | 4% | 24 | 4 | Very rare result |
| Five Sixes | 2% | 30 | 5 | Extremely rare result |
| Six Sixes | 1% | 36 | 6 | Jackpot result |
| Wicket | 2% | 0 | 0 | Optional penalty |

Total probability must equal 100%.

## 5.2 Recommended Wicket Penalty

A wicket should not make the game frustrating.

Recommended options:

### Safe Mode

```text
Wicket adds one dismissal but removes no career sixes.
```

### Competitive Mode

```text
Wicket removes 1–3 career sixes.
Career Sixes can never fall below 0.
```

### Recommended Default

Use Safe Mode for public release.

The wicket should affect:

- Dismissals
- Streak protection
- Daily score
- Battle performance

It should not permanently remove progress unless the group explicitly enables Hardcore Mode.

## 5.3 Six Distance Generation

A six can receive a distance between:

```text
Minimum: 65m
Maximum normal distance: 120m
Rare maximum: 135m
```

Suggested generation:

| Six Type | Distance Range |
|---|---|
| Standard Six | 65–90m |
| Powerful Six | 85–105m |
| Massive Six | 100–120m |
| Record Six | 115–135m |

Only six outcomes generate a distance.

For multiple sixes:

- Generate a distance for each six, or
- Generate only the longest distance of the event

Recommended: generate only the longest six to keep the message simple.

## 5.4 Shot Type Generation

Possible shot descriptions:

- Pull shot
- Hook shot
- Slog sweep
- Straight drive
- Lofted cover drive
- Helicopter shot
- Pick-up shot
- Inside-out shot
- Upper cut
- Long-on slog
- Long-off launch
- Reverse sweep
- Switch hit

Shot type is cosmetic and should not alter progression unless a future skill system is added.

## 5.5 Commentary Generation

The bot should select commentary based on the result.

### Standard Six

```text
🔥 SIX!

Servesh launches the ball over long-on with a powerful swing.

📏 Distance: 94m
📈 Career Sixes: +1
```

### Multiple Sixes

```text
💥 BACK-TO-BACK SIXES!

Servesh takes complete control of the over.

6️⃣ 6️⃣

📈 Sixes Added: +2
📏 Longest Six: 101m
```

### Dot Ball

```text
🛡 DOT BALL!

Servesh swings hard, but the bowler beats the bat.

No sixes added today.
```

### Wicket

```text
💥 BOWLED!

Servesh attempts a massive slog, but the middle stump goes flying.

No sixes added today.
```

### Six Sixes

```text
🤯 SIX SIXES IN THE OVER!

Servesh has completely destroyed the bowling attack!

6️⃣ 6️⃣ 6️⃣ 6️⃣ 6️⃣ 6️⃣

📈 Career Sixes: +6
📏 Longest Six: 123m
🏆 Achievement Unlocked: Six Storm
```

---

# 6. Final `/hit6` Response Structure

Recommended final message:

```text
🏏 SERVESH'S DAILY HIT

🔥 BACK-TO-BACK SIXES!

6️⃣ 6️⃣

Shot: Slog Sweep
Longest Six: 97m

📈 Sixes Added: +2
🏏 Career Sixes: 149
🏃 Total Runs: 894
🔥 Current Streak: 9 days

🏆 Group Rank: #3
🌍 Global Rank: #1,284

Next attempt available in 20 hours.
```

The response should include only relevant values.

Do not show:

- Six distance after a dot ball
- Runs added after a wicket unless applicable
- Achievement line when no achievement is unlocked
- Rank if the leaderboard has not yet been calculated

---

# 7. Streak System

## 7.1 Streak Definition

A streak increases when the player completes one valid daily `/hit6` attempt before the allowed streak expiration period.

Recommended streak grace period:

```text
Cooldown: 20 hours
Streak expiration: 48 hours after the previous play
```

This gives players enough time to maintain a streak without strict timing.

## 7.2 Streak Reset

The streak resets when:

- The player does not play before the expiration time.
- An admin manually resets the player.
- The account is deleted.

A wicket should not reset the attendance streak.

## 7.3 Streak Rewards

| Streak | Reward |
|---:|---|
| 3 days | Small XP bonus |
| 7 days | One Dot Ball Retry token |
| 15 days | One Wicket Shield |
| 30 days | Guaranteed minimum one six |
| 50 days | Exclusive title |
| 100 days | Permanent Centurion badge |
| 365 days | Legendary Year badge |

Streak rewards should be claimable automatically.

## 7.4 Streak Protection

A Streak Freeze can protect a missed day.

Rules:

- Maximum stored freezes: 3
- Automatically consumed when a streak would break
- Cannot be used for bot bans
- Cannot be transferred

---

# 8. Player Statistics

## 8.1 Global Statistics

Each player should have:

```text
Career Sixes
Career Fours
Total Runs
Balls Faced
Strike Rate
Daily Attempts
Successful Hit Days
Dot Balls
Dismissals
Longest Six
Current Streak
Best Streak
Bat Power Level
Total XP
Current Title
Achievements Unlocked
Battles Played
Battles Won
Battles Lost
Battles Drawn
Highest Battle Score
Daily Awards
Weekly Awards
Seasonal Rank
Global Rank
```

## 8.2 Group Statistics

Group-specific stats:

```text
Sixes hit in this group
Runs scored in this group
Attempts made in this group
Longest six in this group
Battles played in this group
Battles won in this group
Current group rank
Best group rank
Date joined
Last active date
```

## 8.3 Strike Rate Formula

```text
Strike Rate = (Total Runs / Balls Faced) × 100
```

Each normal daily event may count as one ball, or multiple balls for multi-six results.

Recommended:

- Dot, single, double, four, one six and wicket: 1 ball
- Two sixes: 2 balls
- Three sixes: 3 balls
- Four sixes: 4 balls
- Five sixes: 5 balls
- Six sixes: 6 balls

---

# 9. `/mystats` Command

## 9.1 Command

```text
/mystats
```

Aliases:

```text
/profile
/stats
```

## 9.2 Example Response

```text
🏏 SERVESH'S HIT6 PROFILE

Title: 💥 Power Hitter
Bat Power: Level 8

Career Sixes: 149
Career Fours: 42
Total Runs: 1,062
Balls Faced: 126
Strike Rate: 842.86

Longest Six: 121m
Current Streak: 9 days
Best Streak: 34 days

Daily Attempts: 126
Dismissals: 8
Six-Sixes Overs: 2

⚔️ Battles: 27
🏆 Wins: 18
❌ Losses: 7
🤝 Draws: 2

Group Rank: #3
Global Rank: #1,284
```

## 9.3 Reply Profile

When `/mystats` is used as a reply to another user:

```text
/mystats
```

The bot should show the replied user’s public profile.

Private values, admin notes and moderation records must never be displayed.

---

# 10. Titles and Progression

## 10.1 Career Titles

| Career Sixes | Title |
|---:|---|
| 0–9 | Net Batter |
| 10–24 | Rookie Hitter |
| 25–49 | Boundary Hunter |
| 50–99 | Power Hitter |
| 100–249 | Six Machine |
| 250–499 | Stadium Destroyer |
| 500–999 | Elite Finisher |
| 1,000–2,499 | Six Legend |
| 2,500–4,999 | Bowling Nightmare |
| 5,000–9,999 | King of Sixes |
| 10,000+ | Immortal Batter |

## 10.2 Title Update Workflow

After every statistic-changing event:

1. Calculate the eligible title.
2. Compare it with the player’s current title.
3. Update the title if the new title is higher.
4. Send a title-unlocked message.
5. Do not repeatedly announce an already unlocked title.

## 10.3 Selectable Titles

Players may unlock multiple cosmetic titles.

Command:

```text
/titles
```

The player can select an unlocked title using inline buttons.

Example:

```text
Selected Title: Six Machine
```

---

# 11. Bat Power and XP System

## 11.1 XP Sources

| Action | XP |
|---|---:|
| Daily attempt | +5 |
| One six | +10 |
| Multiple-six event | +10 per six |
| New personal record | +25 |
| Battle win | +20 |
| Achievement | Depends on achievement |
| Seven-day streak | +50 |
| Daily winner | +100 |

## 11.2 Bat Power Levels

Bat Power is a progression level and should not make the game unfair.

Recommended effects:

- Cosmetic profile level
- Unlockable commentary
- Small maximum 5% positive result bonus
- Access to new bat skins or badges

Bat Power should not create an unbeatable advantage.

## 11.3 Level Formula

Example:

```text
XP Required for Next Level = 100 × Current Level
```

Alternative scaling:

```text
XP Required = 50 × Level²
```

---

# 12. Achievement System

## 12.1 Achievement Categories

### Career Achievements

- First Six
- 10 Career Sixes
- 50 Career Sixes
- 100 Career Sixes
- 500 Career Sixes
- 1,000 Career Sixes

### Distance Achievements

- 90m Club
- Century Six: 100m+
- Monster Hit: 115m+
- Stadium Exit: 125m+

### Streak Achievements

- Three-Day Form
- Weekly Warrior
- Monthly Machine
- Century Streak

### Rare Result Achievements

- Back-to-Back Sixes
- Hat-trick of Sixes
- Five-Six Over
- Six Sixes in an Over

### Battle Achievements

- First Battle Win
- Five-Win Streak
- Undefeated Champion
- 100 Battle Wins

## 12.2 `/achievements`

```text
/achievements
```

Example:

```text
🏆 SERVESH'S ACHIEVEMENTS

✅ First Six
✅ Century Six
✅ Hat-trick of Sixes
✅ Weekly Warrior
🔒 Six Sixes in an Over
🔒 100 Battle Wins

Unlocked: 4/18
```

## 12.3 Achievement Rewards

Achievements may reward:

- XP
- Titles
- Profile badges
- Bat skins
- Retry tokens
- Wicket shields
- Streak freezes

---

# 13. Leaderboard System

## 13.1 Group Leaderboard

Command:

```text
/top
```

Aliases:

```text
/leaderboard
/grouptop
```

Example:

```text
🏆 HIT6 GROUP LEADERBOARD

1. Ninja — 347 Sixes
2. Servesh — 294 Sixes
3. Dhruva — 261 Sixes
4. Shadow — 205 Sixes
5. Steven — 181 Sixes

Your Rank: #2
Players Ranked: 37
```

## 13.2 Global Leaderboard

```text
/globaltop
```

The global leaderboard should include only players who have not disabled public rankings.

## 13.3 Ranking Categories

Inline buttons can switch between:

- Career Sixes
- Total Runs
- Longest Six
- Current Streak
- Battle Wins
- Daily Score
- Weekly Score
- Seasonal Score

## 13.4 Tie-Breaking Rules

When two players have equal career sixes:

1. Higher total runs
2. Longer six
3. Higher current streak
4. Earlier achievement time

## 13.5 Leaderboard Caching

Rankings should be cached for performance.

Suggested cache durations:

```text
Group leaderboard: 30–60 seconds
Global leaderboard: 2–5 minutes
Daily leaderboard: 30 seconds
```

---

# 14. Daily, Weekly and Seasonal Rankings

## 14.1 Daily Leaderboard

```text
/today
```

Ranks players by sixes hit during the current daily period.

Example:

```text
🌞 TODAY'S TOP HITTERS

1. Servesh — 6 Sixes
2. Ninja — 4 Sixes
3. Dhruva — 3 Sixes

Longest Six Today:
Servesh — 123m
```

## 14.2 Batter of the Day

At the daily reset:

1. Find the player with the highest daily six count in each group.
2. Apply tie-breakers.
3. Save the award.
4. Send an announcement if daily announcements are enabled.
5. Reset daily counters.

Example:

```text
👑 BATTER OF THE DAY

Servesh dominated today!

Sixes Hit: 6
Runs Scored: 36
Longest Six: 123m

Reward: +100 XP
```

## 14.3 Weekly Leaderboard

```text
/weekly
```

Reset every seven days.

Weekly rewards may include:

- XP
- Temporary badge
- Streak Freeze
- Cosmetic bat
- Group champion title

## 14.4 Seasons

Recommended season duration:

```text
30 days
```

Seasonal progress should be separate from lifetime career stats.

At season end:

- Career stats remain unchanged.
- Seasonal rankings are archived.
- Seasonal awards are granted.
- New seasonal score starts at zero.
- Previous season history remains viewable.

Commands:

```text
/season
/seasonrank
/seasonhistory
```

---

# 15. Battle System

## 15.1 Starting a Battle

Method 1: Reply to another user.

```text
/challenge
```

Method 2:

```text
/challenge @username
```

Recommended: reply method should be primary because usernames are optional on Telegram.

## 15.2 Battle Validation

The bot must confirm:

- Challenger is not challenging themselves.
- Opponent is not a bot.
- Both players are registered.
- Both players are members of the group.
- Neither player is already in an active battle.
- Challenger has battle attempts remaining.
- Opponent is not battle-blocked.
- Group battles are enabled.

## 15.3 Challenge Message

```text
⚔️ HIT6 CHALLENGE

Servesh has challenged Ninja to a 3-ball battle!

Ninja, do you accept?

[✅ Accept] [❌ Decline]

Challenge expires in 60 seconds.
```

## 15.4 Battle Timeout

Recommended timeout:

```text
60 seconds
```

If no response:

```text
⌛ Challenge expired.
```

No battle attempt should be consumed before acceptance.

## 15.5 Battle Format

Recommended default:

```text
3 balls per player
```

Possible outcomes per ball:

```text
W, 0, 1, 2, 4, 6
```

Example:

```text
⚔️ HIT6 BATTLE

Servesh:
6️⃣ 4️⃣ 6️⃣
Score: 16/0

Ninja:
4️⃣ 6️⃣ W
Score: 10/1

🏆 Servesh wins!

Reward:
+20 XP
+1 Battle Win
```

## 15.6 Battle Tie

Recommended tie-breaker:

```text
One-ball Super Hit
```

Continue sudden-death balls until one player outscores the other.

## 15.7 Battle Limits

Recommended:

```text
3 initiated battles per day
5 accepted battles per day
```

Daily `/hit6` and battle limits should be separate.

## 15.8 Battle Statistics

Track:

- Battles played
- Wins
- Losses
- Draws
- Win percentage
- Current win streak
- Best win streak
- Highest battle score
- Rival player
- Head-to-head record

## 15.9 `/battlehistory`

```text
/battlehistory
```

Shows recent battles.

---

# 16. Rivalry and Head-to-Head

When `/rivalry` is used as a reply:

```text
/rivalry
```

Example:

```text
⚔️ HEAD-TO-HEAD

Servesh vs Ninja

Matches: 12
Servesh Wins: 7
Ninja Wins: 5
Draws: 0

Highest Score:
Servesh — 18
Ninja — 16

Current Streak:
Servesh — 2 wins
```

---

# 17. Command Reference

## 17.1 Main Player Commands

| Command | Description |
|---|---|
| `/hit6` | Play the daily batting attempt |
| `/mystats` | View player profile |
| `/top` | View group leaderboard |
| `/globaltop` | View global leaderboard |
| `/today` | View daily rankings |
| `/weekly` | View weekly rankings |
| `/season` | View current season |
| `/challenge` | Challenge another player |
| `/battlehistory` | View recent battles |
| `/rivalry` | View head-to-head stats |
| `/achievements` | View achievements |
| `/titles` | View and select titles |
| `/history` | View recent daily results |
| `/records` | View group records |
| `/inventory` | View consumable items |
| `/use` | Use an item manually |
| `/settings` | Change personal settings |
| `/help` | View command help |
| `/about` | View bot information |

## 17.2 Optional Social Commands

| Command | Description |
|---|---|
| `/compare` | Compare two player profiles |
| `/gift` | Gift an allowed cosmetic or item |
| `/club` | View group club profile |
| `/shareprofile` | Generate a shareable profile card |
| `/rank` | View only the player’s current rank |

## 17.3 Group Admin Commands

| Command | Description |
|---|---|
| `/hit6settings` | Open group settings |
| `/enablehit6` | Enable the game |
| `/disablehit6` | Disable the game |
| `/setcooldown` | Change group cooldown if custom cooldowns are allowed |
| `/setmode` | Select Safe or Hardcore mode |
| `/battles on/off` | Enable or disable battles |
| `/dailyannouncement on/off` | Toggle daily winner announcement |
| `/seasonannouncement on/off` | Toggle season announcements |
| `/setlanguage` | Change group language |
| `/resetgroupseason` | Reset current group seasonal stats |
| `/removeplayer` | Remove a player from group rankings |
| `/groupstats` | View group analytics |

## 17.4 Bot Owner Commands

| Command | Description |
|---|---|
| `/adminstats` | View total bot statistics |
| `/broadcast` | Send a controlled announcement |
| `/banuser` | Ban a user from using the bot |
| `/unbanuser` | Remove a bot ban |
| `/banchat` | Disable bot usage in a chat |
| `/unbanchat` | Restore a chat |
| `/grantitem` | Grant an item |
| `/grantxp` | Grant XP |
| `/resetuser` | Reset a user profile |
| `/forcecooldownreset` | Clear a user cooldown |
| `/maintenance` | Toggle maintenance mode |
| `/eventcreate` | Create a temporary event |
| `/eventstop` | Stop an event |
| `/economystats` | View item and reward statistics |
| `/auditlog` | View admin action logs |

Dangerous owner commands must require:

- Owner authorization
- Confirmation button
- Audit log
- Reason entry where applicable

---

# 18. `/history` Command

Recommended display:

```text
📜 RECENT HIT6 RESULTS

Today — +2 Sixes — 97m
Yesterday — +1 Six — 86m
2 days ago — Dot Ball
3 days ago — +3 Sixes — 109m
4 days ago — Wicket

Current Streak: 9 days
```

Default history size:

```text
Last 10 attempts
```

Inline buttons:

```text
[Previous] [Next]
```

---

# 19. Group Records

Command:

```text
/records
```

Example:

```text
🏟 HIT6 GROUP RECORDS

Most Career Sixes:
Ninja — 347

Longest Six:
Servesh — 128m

Best Current Streak:
Dhruva — 41 days

Most Battle Wins:
Shadow — 58

Most Sixes in One Day:
Servesh — 6

Current Season Leader:
Ninja — 72 Sixes
```

Records should be recalculated when:

- A player leaves the group only if the group chooses active-members-only records
- A player is removed from rankings
- A result is corrected by an admin
- A season resets

---

# 20. Inventory and Consumable Items

## 20.1 Recommended Items

### Wicket Shield

Protects one wicket result.

### Dot Ball Retry

Automatically rerolls one dot-ball result.

### Streak Freeze

Protects a missed daily streak.

### Power Boost

Adds a small temporary increase to multiple-six chances.

### Distance Boost

Adds a small bonus to the next six distance.

## 20.2 Fairness Rules

Items must not guarantee leaderboard domination.

Recommended limits:

- Maximum one gameplay item active per daily attempt
- Maximum probability improvement: 5%
- Six-Sixes result cannot be directly purchased
- Items should be earnable through gameplay
- Paid cosmetics should not alter results

## 20.3 `/inventory`

```text
🎒 YOUR INVENTORY

Wicket Shield: 2
Dot Ball Retry: 1
Streak Freeze: 3
Power Boost: 0
Distance Boost: 1
```

---

# 21. Optional Coin Economy

An economy system is optional.

Possible currency:

```text
HitCoins
```

Earned through:

- Daily play
- Achievements
- Battle wins
- Weekly rewards
- Group events

Used for:

- Cosmetic bats
- Profile frames
- Celebration effects
- Commentary packs
- Non-pay-to-win consumables with strict limits

Avoid:

- Real-money gambling
- Cash prizes based on random outcomes
- Paid six guarantees
- Loot boxes with unclear odds

---

# 22. Special Events

## 22.1 Weekend Powerplay

```text
Saturday and Sunday:
+2% chance of multiple-six results
```

## 22.2 Festival Event

Temporary:

- Special commentary
- Event badge
- Event leaderboard
- Cosmetic reward

## 22.3 Group Event

Example:

```text
Group Target: Hit 500 sixes this month
```

All members contribute.

Rewards unlock at milestones.

## 22.4 Event Rules

Events must define:

- Start time
- End time
- Eligible chats
- Eligible players
- Probability modifiers
- Rewards
- Maximum reward claims

---

# 23. Notifications

## 23.1 Private Reminders

Optional reminder:

```text
🏏 Your next Hit6 attempt is ready!
```

Players must opt in.

Command:

```text
/reminder on
/reminder off
```

## 23.2 Group Notifications

Avoid excessive messages.

Recommended automatic announcements:

- Batter of the Day
- Weekly champion
- Season winner
- Major group record
- Rare Six-Sixes event

Do not announce every ordinary result separately beyond the command response.

---

# 24. Personal Settings

Command:

```text
/settings
```

Possible options:

- Private reminder on/off
- Public global ranking on/off
- Battle requests on/off
- Mention notifications on/off
- Compact result mode on/off
- Language
- Selected title
- Selected bat skin
- Animation/GIF mode on/off

---

# 25. Group Settings

Recommended settings panel:

```text
⚙️ HIT6 GROUP SETTINGS

Game: Enabled
Mode: Safe
Battles: Enabled
Daily Announcement: Enabled
Weekly Announcement: Enabled
Season: 30 days
Language: English
Ranking: All Members
```

Only the following may edit group settings:

- Group creator
- Group administrators with appropriate rights
- Bot owner

---

# 26. New Group Setup Workflow

When the bot is added to a new group:

1. Confirm the bot can send messages.
2. Save the group in the database.
3. Create default group settings.
4. Send a short welcome message.
5. Explain `/hit6` and `/help`.
6. Avoid sending multiple setup messages.

Example:

```text
🏏 Hit6 is ready!

Use /hit6 once per day to grow your cricket career, hit massive sixes and compete with your group.

Main commands:
/hit6 — Play
/top — Leaderboard
/mystats — Profile
/challenge — Battle

Admins can use /hit6settings.
```

---

# 27. Private Chat Workflow

In private chat, users can:

- Play `/hit6`
- View global profile
- View global rankings
- Manage settings
- View achievements
- View inventory
- Enable reminders

Group-only features:

- Group leaderboard
- Group records
- Group battles
- Group awards
- Group settings

The private chat should show a button:

```text
➕ Add Hit6 to a Group
```

---

# 28. Anti-Spam and Abuse Protection

## 28.1 Command Rate Limits

Suggested:

```text
Normal commands: 5 per 10 seconds
Leaderboard commands: 2 per 10 seconds
Challenge creation: 3 per minute
```

## 28.2 Duplicate Request Protection

Every `/hit6` transaction should use an idempotency lock.

If the same update is processed twice:

- Only one result is generated.
- Only one database record is created.
- Only one cooldown begins.

## 28.3 Multi-Account Abuse

The bot cannot completely prevent alternate accounts, but it can detect suspicious behavior:

- Large numbers of new accounts in one group
- Repeated battles between the same accounts
- Identical activity timing
- Accounts created very recently, if Telegram exposes enough data
- Reward farming loops

Do not automatically ban without strong evidence.

## 28.4 Battle Farming Protection

Recommended:

- Reduced rewards after repeated battles against the same opponent
- Maximum rewarded head-to-head battles per day
- No rewards for self-controlled bot accounts if detected
- No reward when the opponent immediately forfeits repeatedly

---

# 29. Error Handling

## 29.1 Database Failure

```text
⚠️ The stadium is temporarily unavailable.

Your attempt was not consumed. Please try again.
```

Only start the cooldown after the transaction is successfully committed.

## 29.2 Telegram API Failure

If the database update succeeded but sending the message failed:

- Save the result.
- Do not allow another attempt.
- Retry sending safely.
- Provide `/history` access to the result.

## 29.3 Partial Transaction Protection

The following updates must occur in one transaction:

- Daily result creation
- Player stat update
- Cooldown update
- Streak update
- Group stats update
- Inventory item consumption

## 29.4 Invalid Command Context

Example:

```text
This command can only be used in a group.
```

## 29.5 Deleted User or Anonymous Admin

Anonymous group admins may not provide a stable user identity.

The bot should explain that gameplay requires a normal Telegram user identity.

---

# 30. Data Model

## 30.1 Players Table

```text
players
- id
- telegram_user_id
- display_name
- username
- language
- created_at
- last_active_at
- is_banned
- public_global_rank
- reminder_enabled
- selected_title_id
- selected_cosmetic_id
```

## 30.2 Player Statistics Table

```text
player_stats
- player_id
- career_sixes
- career_fours
- total_runs
- balls_faced
- dot_balls
- dismissals
- longest_six
- daily_attempts
- successful_days
- current_streak
- best_streak
- last_played_at
- next_play_at
- streak_expires_at
- xp
- level
- battle_wins
- battle_losses
- battle_draws
- current_battle_streak
- best_battle_streak
```

## 30.3 Groups Table

```text
groups
- id
- telegram_chat_id
- title
- username
- created_at
- last_active_at
- game_enabled
- battle_enabled
- mode
- language
- daily_announcement_enabled
- weekly_announcement_enabled
- season_announcement_enabled
- current_season_id
```

## 30.4 Group Members Table

```text
group_members
- group_id
- player_id
- joined_at
- last_active_at
- is_ranked
- group_sixes
- group_runs
- group_attempts
- group_longest_six
- group_battle_wins
```

## 30.5 Daily Results Table

```text
daily_results
- id
- player_id
- group_id
- telegram_update_id
- outcome_type
- runs
- sixes
- fours
- balls
- dismissal
- six_distance
- shot_type
- commentary_key
- xp_earned
- item_used
- created_at
```

## 30.6 Battles Table

```text
battles
- id
- group_id
- challenger_id
- opponent_id
- status
- challenger_score
- opponent_score
- winner_id
- challenge_message_id
- created_at
- accepted_at
- completed_at
- expires_at
```

## 30.7 Battle Deliveries Table

```text
battle_deliveries
- id
- battle_id
- player_id
- ball_number
- outcome
- runs
- created_at
```

## 30.8 Achievements Table

```text
achievements
- id
- key
- name
- description
- reward_type
- reward_value
- is_active
```

## 30.9 Player Achievements Table

```text
player_achievements
- player_id
- achievement_id
- unlocked_at
```

## 30.10 Seasons Table

```text
seasons
- id
- group_id
- name
- starts_at
- ends_at
- status
```

## 30.11 Seasonal Statistics Table

```text
season_stats
- season_id
- player_id
- sixes
- runs
- longest_six
- attempts
- battle_wins
- rank
```

## 30.12 Inventory Table

```text
player_inventory
- player_id
- item_key
- quantity
- updated_at
```

## 30.13 Admin Audit Log

```text
admin_audit_logs
- id
- admin_user_id
- action
- target_type
- target_id
- reason
- old_value
- new_value
- created_at
```

---

# 31. Random Result Engine

## 31.1 Weighted Selection

Use a secure server-side random generator.

Pseudo workflow:

```text
1. Load base probabilities.
2. Apply active event modifier.
3. Apply allowed streak bonus.
4. Apply one active inventory item.
5. Clamp all modifiers.
6. Normalize probabilities to 100%.
7. Generate one random number.
8. Select the matching result range.
9. Save the exact probability configuration with the result for auditing.
```

## 31.2 Probability Clamping

Recommended limits:

```text
Minimum wicket chance: 1%
Maximum wicket chance: 5%
Maximum Six-Sixes chance: 1.5%
Maximum total bonus from all effects: 5%
```

## 31.3 Transparent Odds

Command:

```text
/odds
```

The bot may show base odds without exposing internal random seeds.

---

# 32. Transaction Workflow for `/hit6`

Recommended server sequence:

```text
BEGIN TRANSACTION

1. Lock player stats row.
2. Check cooldown again inside transaction.
3. Check duplicate Telegram update ID.
4. Load modifiers and inventory.
5. Generate outcome.
6. Insert daily result.
7. Update global player stats.
8. Update group member stats.
9. Update streak.
10. Consume item if used.
11. Check achievements.
12. Check title and level.
13. Set next cooldown.
14. Commit transaction.

AFTER COMMIT

15. Invalidate leaderboard cache.
16. Build response message.
17. Send response to Telegram.
18. Queue non-critical analytics.
```

---

# 33. Scheduled Jobs

Required background jobs:

## Daily Reset Job

- Finalize Batter of the Day
- Reset daily counters
- Send enabled announcements
- Clean expired challenges

## Weekly Job

- Finalize weekly rankings
- Grant weekly rewards
- Send weekly champion announcement

## Season Job

- Close ended seasons
- Calculate final ranks
- Grant season rewards
- Create the next season
- Archive season statistics

## Reminder Job

- Find players whose attempt is available
- Send reminders only to opted-in users
- Avoid duplicate reminders

## Cleanup Job

- Remove expired locks
- Archive old event logs
- Clear stale caches
- Mark inactive groups

---

# 34. Admin Dashboard Suggestions

A web admin dashboard may include:

## Overview

- Total users
- Active users today
- Active groups
- Daily `/hit6` attempts
- Battles today
- Retention rate
- Most active groups
- Error rate

## User Management

- Search by Telegram ID, username or name
- View profile and history
- Reset cooldown
- Grant item
- Correct statistics
- Ban or unban
- View suspicious activity

## Group Management

- Search groups
- Enable or disable game
- View activity
- View group rankings
- Change settings
- Remove group season

## Game Configuration

- Edit outcome probabilities
- Edit XP values
- Edit titles
- Edit achievements
- Edit reward values
- Create events
- Enable maintenance mode

## Logs

- Command logs
- Error logs
- Admin audit logs
- Random outcome audits
- Battle dispute logs

---

# 35. Analytics

Recommended events:

```text
player_registered
group_registered
hit6_attempted
hit6_blocked_by_cooldown
result_generated
achievement_unlocked
title_unlocked
battle_created
battle_accepted
battle_completed
battle_expired
streak_broken
streak_freeze_used
daily_award_won
season_completed
reminder_sent
```

Important metrics:

- Daily active users
- Weekly active users
- Day-1 retention
- Day-7 retention
- Average streak
- Average attempts per group
- Battle acceptance rate
- Most common outcome
- Rare outcome frequency
- Reminder conversion rate

---

# 36. Privacy and Safety

The bot should store only information needed for operation.

Recommended stored Telegram data:

- User ID
- Display name
- Username, if available
- Group ID
- Group title
- Game statistics
- Settings

Commands:

```text
/mydata
/deletemydata
```

`/deletemydata` should:

1. Ask for confirmation.
2. Delete or anonymize player data.
3. Remove the player from public rankings.
4. Preserve only legally or operationally required audit records.

---

# 37. Localization

Initial languages:

- English
- Hindi

Possible later languages:

- Bengali
- Urdu
- Spanish
- Russian

All user-facing text should use translation keys.

Example:

```text
hit6.result.single_six
hit6.result.wicket
hit6.cooldown.active
battle.challenge.created
leaderboard.group.title
```

Do not hardcode large numbers of messages directly in command handlers.

---

# 38. Message Formatting Guidelines

Use:

- Short headings
- Clear statistics
- Limited emoji
- Consistent terminology
- Telegram-safe Markdown or HTML

Avoid:

- Excessively long result messages
- More than one major animation per command
- Huge blocks of hashtags
- Too many buttons
- Confusing technical error messages

Recommended maximum buttons per message:

```text
4–6
```

---

# 39. Performance Requirements

Recommended targets:

```text
Normal command response: under 1 second
Leaderboard response: under 2 seconds
Battle action response: under 1 second
Database transaction: under 300ms
```

Use:

- Database indexes
- Redis or similar caching
- Idempotency keys
- Background queues for non-critical tasks
- Connection pooling
- Pagination for histories and rankings

Important indexes:

```text
players.telegram_user_id
groups.telegram_chat_id
group_members(group_id, player_id)
daily_results(player_id, created_at)
daily_results(group_id, created_at)
battles(group_id, created_at)
season_stats(season_id, sixes)
```

---

# 40. Command Help Structure

## `/help`

```text
🏏 HIT6 HELP

Daily Game
/hit6 — Play your daily shot
/mystats — View your profile
/history — Recent results

Competition
/top — Group leaderboard
/globaltop — Global leaderboard
/today — Today’s rankings
/weekly — Weekly rankings

Battles
/challenge — Challenge a player
/battlehistory — Recent battles
/rivalry — Head-to-head record

Progress
/achievements — Achievements
/titles — Select a title
/inventory — View items

Other
/settings — Personal settings
/about — About Hit6
```

Admin commands should appear only to group administrators.

---

# 41. Recommended MVP

The first release should include only:

```text
/hit6
/mystats
/top
/globaltop
/today
/history
/achievements
/help
```

MVP systems:

- Player registration
- Daily cooldown
- Weighted outcomes
- Career sixes
- Total runs
- Longest six
- Streak
- Group leaderboard
- Global leaderboard
- Basic achievements
- Basic admin enable/disable
- Duplicate request protection

Do not launch all advanced systems at once.

---

# 42. Recommended Development Phases

## Phase 1 — Core Game

- User registration
- `/hit6`
- Cooldown
- Statistics
- Group and global leaderboards
- Result history
- Basic achievements

## Phase 2 — Social Competition

- Challenges
- Rivalries
- Daily awards
- Weekly rankings
- Group records

## Phase 3 — Progression

- XP
- Bat Power
- Titles
- Inventory
- Cosmetics
- Streak rewards

## Phase 4 — Seasons and Events

- Seasonal rankings
- Group goals
- Temporary events
- Seasonal rewards

## Phase 5 — Admin and Scale

- Web dashboard
- Analytics
- Moderation tools
- Localization
- Redis cache
- Queue workers
- Anti-abuse detection

---

# 43. Example Complete User Journey

## Day 1

The user sends:

```text
/hit6
```

The bot creates a profile and generates one six.

```text
🔥 SIX!

Your Hit6 career has started.

Career Sixes: 1
Longest Six: 82m
Title: Net Batter
```

## Day 2

The user hits two sixes.

```text
💥 BACK-TO-BACK SIXES!

Career Sixes: 3
Current Streak: 2 days
```

## Day 3

The user gets a dot ball but reaches a three-day attendance streak.

```text
🛡 DOT BALL!

No sixes added.

🔥 Three-Day Streak reached!
Reward: +25 XP
```

## Day 7

The user unlocks Weekly Warrior and receives a retry token.

## Day 12

The user challenges another group member and wins.

## Day 20

The user reaches 25 career sixes and unlocks Boundary Hunter.

## Day 30

The user finishes third in the group season and receives a bronze seasonal badge.

This creates a repeatable loop of:

```text
Play → Progress → Compete → Unlock → Return
```

---

# 44. Recommended Final Rules

```text
1. Every Telegram account has one global Hit6 profile.
2. A player may appear in multiple group leaderboards.
3. /hit6 can be used once per configured cooldown.
4. A valid attempt always counts toward the attendance streak.
5. Career progress cannot fall below zero.
6. Daily and seasonal statistics reset independently from career statistics.
7. Battle limits are separate from the daily /hit6 attempt.
8. All random results are generated server-side.
9. Admin corrections must be recorded in an audit log.
10. Duplicate Telegram updates must never generate duplicate rewards.
11. Paid features, if added, should remain cosmetic or strictly limited.
12. The game must remain understandable through the /hit6 command alone.
```

---

# 45. Final Bot Identity

```text
Bot Name: Hit6
Main Command: /hit6
Theme: Cricket power-hitting
Primary Progress: Career Sixes
Secondary Progress: Runs, XP, Level and Streak
Core Competition: Group and Global Rankings
Social Feature: Player Battles
Rare Event: Six Sixes in an Over
Daily Award: Batter of the Day
Seasonal Award: Hit6 Champion
```

---

# 46. Short Bot Description

```text
🏏 Hit6 is a daily cricket progression game for Telegram.

Use /hit6, smash sixes, build your batting career, challenge friends and climb your group and global leaderboards.
```

# 47. Telegram About Text

```text
Hit sixes. Build your career. Rule the leaderboard. 🏏
```

# 48. Suggested Bot Username Ideas

```text
@Hit6Bot
@HitSixBot
@DailyHit6Bot
@SixHitterBot
@Hit6GameBot
@CricketGrowBot
```

Availability must be checked directly on Telegram before final selection.
