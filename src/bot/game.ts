import { randomInt } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { User, Chat } from "grammy/types";
import { db } from "../db/client";
import { achievements, chats, dailyHits, groupMembers, players, playerStats } from "../db/schema";
import { consumeItem, grantItem, type ItemKey } from "./items";
import { generateDistance, pickOutcome, randomShot, type Outcome } from "./outcomes";
import { CAREER_TITLES, displayName, formatDuration, levelForXp, titleForCareerSixes } from "./util";

export type GameResult = { text: string };

export async function ensurePlayer(user: User) {
  const id = String(user.id);
  await db
    .insert(players)
    .values({
      telegramUserId: id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      languageCode: user.language_code,
      isBot: user.is_bot ?? false,
    })
    .onConflictDoUpdate({
      target: players.telegramUserId,
      set: {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        updatedAt: new Date(),
      },
    });
  await db.insert(playerStats).values({ telegramUserId: id }).onConflictDoNothing();
}

export async function ensureChat(chat: Chat) {
  await db
    .insert(chats)
    .values({ telegramChatId: String(chat.id), title: "title" in chat ? chat.title : undefined, type: chat.type })
    .onConflictDoUpdate({
      target: chats.telegramChatId,
      set: { title: "title" in chat ? chat.title : undefined, type: chat.type, updatedAt: new Date() },
    });
}

export async function ensureMembership(user: User, chat: Chat) {
  if (chat.type === "private") return;
  await db
    .insert(groupMembers)
    .values({ telegramChatId: String(chat.id), telegramUserId: String(user.id) })
    .onConflictDoUpdate({
      target: [groupMembers.telegramChatId, groupMembers.telegramUserId],
      set: { lastActiveAt: new Date() },
    });
}

// Streak milestone rewards (spec 7.3). Items are granted automatically.
function streakReward(streak: number): { item?: ItemKey; xp: number; note: string } | null {
  switch (streak) {
    case 3:
      return { xp: 25, note: "Three-Day Form — +25 XP" };
    case 7:
      return { item: "dot_ball_retry", xp: 50, note: "Weekly Warrior — Dot Ball Retry +1, +50 XP" };
    case 15:
      return { item: "wicket_shield", xp: 75, note: "15-Day Streak — Wicket Shield +1" };
    case 30:
      return { item: "streak_freeze", xp: 150, note: "30-Day Streak — Streak Freeze +1" };
    case 50:
      return { item: "power_boost", xp: 250, note: "50-Day Streak — Power Boost +1" };
    case 100:
      return { item: "streak_freeze", xp: 500, note: "Century Streak — Centurion badge + Streak Freeze" };
    default:
      return null;
  }
}

export async function playHit6(user: User, chat: Chat, updateId: number): Promise<GameResult> {
  await ensurePlayer(user);
  await ensureChat(chat);
  await ensureMembership(user, chat);

  const userId = String(user.id);
  const chatId = String(chat.id);

  const [chatSettings] = await db.select().from(chats).where(eq(chats.telegramChatId, chatId)).limit(1);
  if (!chatSettings?.gameEnabled) return { text: "🚫 Hit6 is disabled in this chat. An admin can enable it with /enablehit6." };

  const [player] = await db.select().from(players).where(eq(players.telegramUserId, userId)).limit(1);
  if (player?.isBanned) return { text: "🚫 You are banned from Hit6." };

  // Idempotency: a repeated Telegram update must not produce a second result.
  const [existingHit] = await db.select().from(dailyHits).where(eq(dailyHits.telegramUpdateId, String(updateId))).limit(1);
  if (existingHit) return { text: "✅ This batting attempt was already processed. Use /history to view recent results." };

  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, userId)).limit(1);
  const now = new Date();

  if (stats?.nextHitAt && stats.nextHitAt > now) {
    return {
      text:
        `⏳ You have already played today!\n\n` +
        `Next batting attempt available in:\n${formatDuration(stats.nextHitAt.getTime() - now.getTime())}\n\n` +
        `🏏 Career Sixes: ${stats.careerSixes ?? 0}\n🔥 Current Streak: ${stats.currentStreak ?? 0} days`,
    };
  }

  // Active boost item from /use, plus weekend powerplay event (spec 22.1).
  const activeItem = stats?.activeItem as ItemKey | null | undefined;
  const day = now.getUTCDay();
  const weekendPowerplay = day === 0 || day === 6;
  const outcomeMod = { powerBoost: activeItem === "power_boost", weekendPowerplay };
  const distanceBonus = activeItem === "distance_boost" ? 10 : 0;

  let outcome: Outcome = pickOutcome(outcomeMod);
  const itemsUsed: string[] = [];

  // Wicket Shield converts a wicket into a safe dot ball.
  if (outcome.code === "WICKET" && (await consumeItem(userId, "wicket_shield"))) {
    outcome = { ...outcome, code: "DOT", label: "🛡 WICKET SHIELDED!" };
    itemsUsed.push("Wicket Shield");
  } else if (outcome.code === "DOT" && (await consumeItem(userId, "dot_ball_retry"))) {
    // Dot Ball Retry rerolls a single dot ball once.
    outcome = pickOutcome(outcomeMod);
    itemsUsed.push("Dot Ball Retry");
  }
  if (activeItem === "power_boost" || activeItem === "distance_boost") {
    itemsUsed.push(activeItem === "power_boost" ? "Power Boost" : "Distance Boost");
  }

  const sixPowerDelta = outcome.code === "WICKET" ? -randomInt(1, 4) : outcome.sixes;
  const distance = outcome.sixes > 0 ? generateDistance(distanceBonus) : null;
  const nextHitAt = new Date(now.getTime() + (chatSettings.cooldownHours ?? 20) * 60 * 60 * 1000);
  const previousLongest = stats?.longestSix ?? 0;

  // Streak handling with Streak Freeze protection (spec 7.4).
  const lastHit = stats?.lastHitAt;
  let currentStreak: number;
  let streakFreezeUsed = false;
  if (!lastHit) {
    currentStreak = 1;
  } else if (now.getTime() - lastHit.getTime() <= 48 * 60 * 60 * 1000) {
    currentStreak = (stats?.currentStreak ?? 0) + 1;
  } else if (await consumeItem(userId, "streak_freeze")) {
    currentStreak = (stats?.currentStreak ?? 0) + 1;
    streakFreezeUsed = true;
    itemsUsed.push("Streak Freeze");
  } else {
    currentStreak = 1;
  }

  const careerSixes = (stats?.careerSixes ?? 0) + outcome.sixes;
  const longestSix = Math.max(previousLongest, distance ?? 0);
  const newTitle = titleForCareerSixes(careerSixes);
  const sixPower = Math.max(0, (stats?.sixPower ?? 0) + sixPowerDelta);
  const isRecord = distance != null && distance > previousLongest && previousLongest > 0;
  const xpEarned = 5 + outcome.sixes * 10 + (isRecord ? 25 : 0);

  const unlocked = achievementCodes({ careerSixes, currentStreak, distance: distance ?? 0, outcomeCode: outcome.code });

  await db
    .insert(dailyHits)
    .values({
      telegramUpdateId: String(updateId),
      telegramChatId: chatId,
      telegramUserId: userId,
      outcome: outcome.code,
      runs: outcome.runs,
      sixes: outcome.sixes,
      fours: outcome.fours,
      balls: outcome.balls,
      distance,
      sixPowerDelta,
      newAchievements: unlocked,
    })
    .onConflictDoNothing();

  // Streak milestone rewards.
  const reward = streakReward(currentStreak);
  let rewardXp = 0;
  if (reward) {
    rewardXp = reward.xp;
    if (reward.item) await grantItem(userId, reward.item, 1);
  }

  await db
    .update(playerStats)
    .set({
      sixPower,
      careerSixes,
      careerFours: (stats?.careerFours ?? 0) + outcome.fours,
      totalRuns: (stats?.totalRuns ?? 0) + outcome.runs,
      ballsFaced: (stats?.ballsFaced ?? 0) + outcome.balls,
      dotBalls: (stats?.dotBalls ?? 0) + (outcome.code === "DOT" ? 1 : 0),
      dismissals: (stats?.dismissals ?? 0) + (outcome.code === "WICKET" ? 1 : 0),
      longestSix,
      currentStreak,
      bestStreak: Math.max(stats?.bestStreak ?? 0, currentStreak),
      xp: (stats?.xp ?? 0) + xpEarned + rewardXp,
      title: newTitle,
      dailyAttempts: (stats?.dailyAttempts ?? 0) + 1,
      successfulHitDays: (stats?.successfulHitDays ?? 0) + (outcome.sixes > 0 ? 1 : 0),
      activeItem: null,
      lastHitAt: now,
      nextHitAt,
      updatedAt: now,
    })
    .where(eq(playerStats.telegramUserId, userId));

  if (chat.type !== "private") {
    await db
      .update(groupMembers)
      .set({
        groupSixes: sql`${groupMembers.groupSixes} + ${outcome.sixes}`,
        groupRuns: sql`${groupMembers.groupRuns} + ${outcome.runs}`,
        groupAttempts: sql`${groupMembers.groupAttempts} + 1`,
        groupLongestSix: sql`greatest(${groupMembers.groupLongestSix}, ${distance ?? 0})`,
        lastActiveAt: now,
      })
      .where(and(eq(groupMembers.telegramChatId, chatId), eq(groupMembers.telegramUserId, userId)));
  }

  for (const code of unlocked) {
    await db.insert(achievements).values({ telegramUserId: userId, code }).onConflictDoNothing();
  }

  // Optional ranks.
  let groupRank: number | null = null;
  let globalRank: number | null = null;
  if (chat.type !== "private") {
    // Rank = players with strictly more group sixes than this player + 1.
    const [rank] = await db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(groupMembers)
      .where(and(eq(groupMembers.telegramChatId, chatId), gt(groupMembers.groupSixes, sql`(select group_sixes from group_members where telegram_chat_id = ${chatId} and telegram_user_id = ${userId})`)))
      .limit(1);
    groupRank = (rank?.ahead ?? 0) + 1;
  }
  if (player?.publicRanking !== false) {
    const [rank] = await db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(playerStats)
      .innerJoin(players, eq(players.telegramUserId, playerStats.telegramUserId))
      .where(and(eq(players.publicRanking, true), gt(playerStats.careerSixes, careerSixes)))
      .limit(1);
    globalRank = (rank?.ahead ?? 0) + 1;
  }

  return {
    text: buildResultMessage({
      name: displayName(user),
      outcome,
      distance,
      shot: distance ? randomShot() : "",
      careerSixes,
      totalRuns: (stats?.totalRuns ?? 0) + outcome.runs,
      currentStreak,
      nextHitAt,
      sixPower,
      sixPowerDelta,
      isRecord,
      unlocked,
      titleChanged: newTitle !== (stats?.title ?? "Net Batter"),
      newTitle,
      rewardNote: reward?.note ?? null,
      streakFreezeUsed,
      itemsUsed,
      groupRank,
      globalRank,
    }),
  };
}

function achievementCodes(input: { careerSixes: number; currentStreak: number; distance: number; outcomeCode: string }): string[] {
  const codes: string[] = [];
  if (input.careerSixes >= 1) codes.push("First Six");
  if (input.careerSixes >= 10) codes.push("10 Career Sixes");
  if (input.careerSixes >= 50) codes.push("50 Career Sixes");
  if (input.careerSixes >= 100) codes.push("100 Career Sixes");
  if (input.careerSixes >= 500) codes.push("500 Career Sixes");
  if (input.distance >= 90) codes.push("90m Club");
  if (input.distance >= 100) codes.push("Century Six");
  if (input.distance >= 115) codes.push("Monster Hit");
  if (input.distance >= 125) codes.push("Stadium Exit");
  if (input.currentStreak >= 3) codes.push("Three-Day Form");
  if (input.currentStreak >= 7) codes.push("Weekly Warrior");
  if (input.currentStreak >= 30) codes.push("Monthly Machine");
  if (input.currentStreak >= 100) codes.push("Century Streak");
  if (input.outcomeCode === "SIX_2") codes.push("Back-to-Back Sixes");
  if (input.outcomeCode === "SIX_3") codes.push("Hat-trick of Sixes");
  if (input.outcomeCode === "SIX_5") codes.push("Five-Six Over");
  if (input.outcomeCode === "SIX_6") codes.push("Six Sixes in an Over");
  return codes;
}

function buildResultMessage(args: {
  name: string;
  outcome: Outcome;
  distance: number | null;
  shot: string;
  careerSixes: number;
  totalRuns: number;
  currentStreak: number;
  nextHitAt: Date;
  sixPower: number;
  sixPowerDelta: number;
  isRecord: boolean;
  unlocked: string[];
  titleChanged: boolean;
  newTitle: string;
  rewardNote: string | null;
  streakFreezeUsed: boolean;
  itemsUsed: string[];
  groupRank: number | null;
  globalRank: number | null;
}): string {
  const lines = [`🏏 ${args.name.toUpperCase()}'S DAILY HIT`, "", args.outcome.label];

  if (args.outcome.sixes > 1) lines.push("", Array.from({ length: args.outcome.sixes }, () => "6️⃣").join(" "));
  if (args.distance) lines.push("", `Shot: ${args.shot}`, `Longest Six: ${args.distance}m`);

  lines.push("");
  if (args.outcome.sixes > 0) lines.push(`📈 Sixes Added: +${args.outcome.sixes}`);
  lines.push(`⚡ Six Power: ${args.sixPower} (${args.sixPowerDelta >= 0 ? "+" : ""}${args.sixPowerDelta})`);
  lines.push(`🏏 Career Sixes: ${args.careerSixes}`);
  lines.push(`🏃 Total Runs: ${args.totalRuns}`);
  lines.push(`🔥 Current Streak: ${args.currentStreak} days`);

  const rankLines: string[] = [];
  if (args.groupRank) rankLines.push(`🏆 Group Rank: #${args.groupRank}`);
  if (args.globalRank) rankLines.push(`🌍 Global Rank: #${args.globalRank.toLocaleString("en-US")}`);
  if (rankLines.length) lines.push("", ...rankLines);

  if (args.isRecord) lines.push("", `🚀 NEW PERSONAL RECORD: ${args.distance}m!`);
  if (args.titleChanged) lines.push("", `🎖 Title Unlocked: ${args.newTitle}`);
  if (args.unlocked.length) lines.push(`🏆 Achievement Unlocked: ${args.unlocked[args.unlocked.length - 1]}`);
  if (args.streakFreezeUsed) lines.push(`❄️ Streak Freeze protected your streak!`);
  const otherItems = args.itemsUsed.filter((i) => i !== "Streak Freeze");
  if (otherItems.length) lines.push(`🎒 Used: ${otherItems.join(", ")}`);
  if (args.rewardNote) lines.push("", `🎁 ${args.rewardNote}`);

  lines.push("", `Next attempt available in ${formatDuration(args.nextHitAt.getTime() - Date.now())}.`);
  return lines.join("\n");
}

export async function profile(user: User): Promise<string> {
  await ensurePlayer(user);
  const userId = String(user.id);
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, userId)).limit(1);
  const [pl] = await db.select().from(players).where(eq(players.telegramUserId, userId)).limit(1);
  const strikeRate = stats?.ballsFaced ? (((stats.totalRuns ?? 0) / stats.ballsFaced) * 100).toFixed(2) : "0.00";
  const levelInfo = levelForXp(stats?.xp ?? 0);
  const winPct = stats?.battlesPlayed ? Math.round(((stats.battlesWon ?? 0) / stats.battlesPlayed) * 100) : 0;
  const title = pl?.selectedTitle ?? stats?.title ?? "Net Batter";

  return [
    `🏏 ${displayName(user).toUpperCase()}'S HIT6 PROFILE`,
    "",
    `Title: ${title}`,
    `Level: ${levelInfo.level}  (${levelInfo.intoLevel}/${levelInfo.needed} XP)`,
    "",
    `🏏 Career Sixes: ${stats?.careerSixes ?? 0}`,
    `4️⃣ Career Fours: ${stats?.careerFours ?? 0}`,
    `🏃 Total Runs: ${stats?.totalRuns ?? 0}`,
    `Balls Faced: ${stats?.ballsFaced ?? 0}`,
    `Strike Rate: ${strikeRate}`,
    "",
    `📏 Longest Six: ${stats?.longestSix ?? 0}m`,
    `🔥 Current Streak: ${stats?.currentStreak ?? 0} days`,
    `Best Streak: ${stats?.bestStreak ?? 0} days`,
    "",
    `Daily Attempts: ${stats?.dailyAttempts ?? 0}`,
    `Dismissals: ${stats?.dismissals ?? 0}`,
    "",
    `⚔️ Battles: ${stats?.battlesPlayed ?? 0}`,
    `🏆 Wins: ${stats?.battlesWon ?? 0}   ❌ Losses: ${stats?.battlesLost ?? 0}   🤝 Draws: ${stats?.battlesDrawn ?? 0}`,
    `Win Rate: ${winPct}%`,
  ].join("\n");
}

export async function leaderboard(chat: Chat, viewerId?: string): Promise<string> {
  if (chat.type === "private") return globalLeaderboard(viewerId);
  const rows = await db
    .select({ id: groupMembers.telegramUserId, name: players.firstName, username: players.username, sixes: groupMembers.groupSixes })
    .from(groupMembers)
    .innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId))
    .where(eq(groupMembers.telegramChatId, String(chat.id)))
    .orderBy(desc(groupMembers.groupSixes))
    .limit(10);
  const lines = [`🏆 HIT6 GROUP LEADERBOARD`, "", ...rows.map((row, i) => `${i + 1}. ${row.name || row.username || "Player"} — ${row.sixes} Sixes`)];
  if (viewerId) {
    const idx = rows.findIndex((r) => r.id === viewerId);
    if (idx >= 0) lines.push("", `Your Rank: #${idx + 1}`);
  }
  lines.push(`Players Ranked: ${rows.length}`);
  return lines.join("\n");
}

export async function globalLeaderboard(viewerId?: string): Promise<string> {
  const rows = await db
    .select({ id: playerStats.telegramUserId, name: players.firstName, username: players.username, sixes: playerStats.careerSixes })
    .from(playerStats)
    .innerJoin(players, eq(players.telegramUserId, playerStats.telegramUserId))
    .where(eq(players.publicRanking, true))
    .orderBy(desc(playerStats.careerSixes))
    .limit(10);
  const lines = [`🌍 HIT6 GLOBAL LEADERBOARD`, "", ...rows.map((row, i) => `${i + 1}. ${row.name || row.username || "Player"} — ${row.sixes} Sixes`)];
  if (viewerId) {
    const idx = rows.findIndex((r) => r.id === viewerId);
    if (idx >= 0) lines.push("", `Your Rank: #${idx + 1}`);
  }
  return lines.join("\n");
}

export async function history(user: User, chat: Chat): Promise<string> {
  const rows = await db
    .select()
    .from(dailyHits)
    .where(and(eq(dailyHits.telegramUserId, String(user.id)), eq(dailyHits.telegramChatId, String(chat.id))))
    .orderBy(desc(dailyHits.createdAt))
    .limit(10);
  if (!rows.length) return "📜 No Hit6 results yet in this chat. Use /hit6 to play!";
  const describe = (row: (typeof rows)[number]) =>
    row.sixes ? `+${row.sixes} Six${row.sixes > 1 ? "es" : ""} — ${row.distance ?? 0}m` : row.outcome === "WICKET" ? "Wicket" : row.outcome === "FOUR" ? "Four" : "Dot Ball";
  return [`📜 RECENT HIT6 RESULTS`, "", ...rows.map((row) => `${row.createdAt.toISOString().slice(0, 10)} — ${describe(row)}`)].join("\n");
}

const ALL_ACHIEVEMENTS = [
  "First Six",
  "10 Career Sixes",
  "50 Career Sixes",
  "100 Career Sixes",
  "500 Career Sixes",
  "90m Club",
  "Century Six",
  "Monster Hit",
  "Stadium Exit",
  "Three-Day Form",
  "Weekly Warrior",
  "Monthly Machine",
  "Century Streak",
  "Back-to-Back Sixes",
  "Hat-trick of Sixes",
  "Five-Six Over",
  "Six Sixes in an Over",
];

export async function achievementsText(user: User): Promise<string> {
  const rows = await db.select().from(achievements).where(eq(achievements.telegramUserId, String(user.id)));
  const unlocked = new Set(rows.map((row) => row.code));
  return [
    `🏆 ${displayName(user).toUpperCase()}'S ACHIEVEMENTS`,
    "",
    ...ALL_ACHIEVEMENTS.map((code) => `${unlocked.has(code) ? "✅" : "🔒"} ${code}`),
    "",
    `Unlocked: ${[...unlocked].filter((c) => ALL_ACHIEVEMENTS.includes(c)).length}/${ALL_ACHIEVEMENTS.length}`,
  ].join("\n");
}

export { CAREER_TITLES };
