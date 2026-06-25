import { boolean, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  languageCode: text("language_code"),
  isBot: boolean("is_bot").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  publicRanking: boolean("public_ranking").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerStats = pgTable("player_stats", {
  telegramUserId: text("telegram_user_id").primaryKey().references(() => players.telegramUserId),
  sixPower: integer("six_power").notNull().default(0),
  careerSixes: integer("career_sixes").notNull().default(0),
  careerFours: integer("career_fours").notNull().default(0),
  totalRuns: integer("total_runs").notNull().default(0),
  ballsFaced: integer("balls_faced").notNull().default(0),
  dotBalls: integer("dot_balls").notNull().default(0),
  dismissals: integer("dismissals").notNull().default(0),
  longestSix: integer("longest_six").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  batPowerLevel: integer("bat_power_level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  title: varchar("title", { length: 64 }).notNull().default("Net Batter"),
  dailyAttempts: integer("daily_attempts").notNull().default(0),
  successfulHitDays: integer("successful_hit_days").notNull().default(0),
  battlesPlayed: integer("battles_played").notNull().default(0),
  battlesWon: integer("battles_won").notNull().default(0),
  battlesLost: integer("battles_lost").notNull().default(0),
  battlesDrawn: integer("battles_drawn").notNull().default(0),
  highestBattleScore: integer("highest_battle_score").notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  nextHitAt: timestamp("next_hit_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  telegramChatId: text("telegram_chat_id").primaryKey(),
  title: text("title"),
  type: text("type").notNull(),
  gameEnabled: boolean("game_enabled").notNull().default(true),
  battlesEnabled: boolean("battles_enabled").notNull().default(true),
  hardcoreMode: boolean("hardcore_mode").notNull().default(false),
  dailyAnnouncement: boolean("daily_announcement").notNull().default(true),
  cooldownHours: integer("cooldown_hours").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  telegramChatId: text("telegram_chat_id").notNull().references(() => chats.telegramChatId),
  telegramUserId: text("telegram_user_id").notNull().references(() => players.telegramUserId),
  groupSixes: integer("group_sixes").notNull().default(0),
  groupRuns: integer("group_runs").notNull().default(0),
  groupAttempts: integer("group_attempts").notNull().default(0),
  groupLongestSix: integer("group_longest_six").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.telegramChatId, table.telegramUserId] }) }));

export const dailyHits = pgTable("daily_hits", {
  id: serial("id").primaryKey(),
  telegramUpdateId: text("telegram_update_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  outcome: text("outcome").notNull(),
  runs: integer("runs").notNull().default(0),
  sixes: integer("sixes").notNull().default(0),
  fours: integer("fours").notNull().default(0),
  balls: integer("balls").notNull().default(1),
  distance: integer("distance"),
  sixPowerDelta: integer("six_power_delta").notNull().default(0),
  newAchievements: jsonb("new_achievements").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ updateIdx: uniqueIndex("daily_hits_update_id_idx").on(table.telegramUpdateId) }));

export const achievements = pgTable("achievements", {
  telegramUserId: text("telegram_user_id").notNull().references(() => players.telegramUserId),
  code: text("code").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.telegramUserId, table.code] }) }));
