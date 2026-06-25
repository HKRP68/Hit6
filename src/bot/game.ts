import { randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { User, Chat } from "grammy/types";
import { db } from "../db/client";
import { achievements, chats, dailyHits, groupMembers, players, playerStats } from "../db/schema";

export type GameResult = { text: string };

type Outcome = { code: string; label: string; runs: number; sixes: number; fours: number; balls: number; sixPowerDelta: number };

const OUTCOMES = [
  { code: "WICKET", max: 800, label: "💥 BOWLED!", runs: 0, sixes: 0, fours: 0, balls: 1, sixPowerDelta: -randomInt(1, 4) },
  { code: "DOT", max: 2000, label: "🛡 DOT BALL!", runs: 0, sixes: 0, fours: 0, balls: 1, sixPowerDelta: 0 },
  { code: "SIX_1", max: 5800, label: "🔥 SIX!", runs: 6, sixes: 1, fours: 0, balls: 1, sixPowerDelta: 1 },
  { code: "SIX_2", max: 7800, label: "💥 BACK-TO-BACK SIXES!", runs: 12, sixes: 2, fours: 0, balls: 2, sixPowerDelta: 2 },
  { code: "SIX_3", max: 8900, label: "🎯 HAT-TRICK OF SIXES!", runs: 18, sixes: 3, fours: 0, balls: 3, sixPowerDelta: 3 },
  { code: "SIX_4", max: 9500, label: "🚀 FOUR HUGE SIXES!", runs: 24, sixes: 4, fours: 0, balls: 4, sixPowerDelta: 4 },
  { code: "SIX_5", max: 9850, label: "🌪 FIVE-SIX OVER!", runs: 30, sixes: 5, fours: 0, balls: 5, sixPowerDelta: 5 },
  { code: "SIX_6", max: 10000, label: "🤯 SIX SIXES IN THE OVER!", runs: 36, sixes: 6, fours: 0, balls: 6, sixPowerDelta: 6 },
] as const;

const SHOTS = ["Pull shot", "Hook shot", "Slog sweep", "Straight drive", "Lofted cover drive", "Helicopter shot", "Pick-up shot", "Inside-out shot", "Upper cut", "Long-on slog", "Long-off launch", "Reverse sweep", "Switch hit"];

export function pickOutcome(): Outcome {
  const roll = randomInt(1, 10001);
  const outcome = OUTCOMES.find((entry) => roll <= entry.max) ?? OUTCOMES[OUTCOMES.length - 1];
  return { ...outcome, sixPowerDelta: outcome.code === "WICKET" ? -randomInt(1, 4) : outcome.sixPowerDelta };
}

export function generateDistance(): number {
  const roll = randomInt(1, 101);
  if (roll <= 25) return randomInt(62, 76);
  if (roll <= 65) return randomInt(76, 91);
  if (roll <= 90) return randomInt(91, 106);
  if (roll <= 98) return randomInt(106, 116);
  return randomInt(116, 131);
}

export function titleForCareerSixes(sixes: number): string {
  if (sixes >= 10000) return "Immortal Batter";
  if (sixes >= 5000) return "King of Sixes";
  if (sixes >= 2500) return "Bowling Nightmare";
  if (sixes >= 1000) return "Six Legend";
  if (sixes >= 500) return "Elite Finisher";
  if (sixes >= 250) return "Stadium Destroyer";
  if (sixes >= 100) return "Six Machine";
  if (sixes >= 50) return "Power Hitter";
  if (sixes >= 25) return "Boundary Hunter";
  if (sixes >= 10) return "Rookie Hitter";
  return "Net Batter";
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}

function displayName(user: User): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `Player ${user.id}`;
}

export async function ensurePlayer(user: User) {
  const id = String(user.id);
  await db.insert(players).values({ telegramUserId: id, username: user.username, firstName: user.first_name, lastName: user.last_name, languageCode: user.language_code, isBot: user.is_bot ?? false }).onConflictDoUpdate({ target: players.telegramUserId, set: { username: user.username, firstName: user.first_name, lastName: user.last_name, languageCode: user.language_code, updatedAt: new Date() } });
  await db.insert(playerStats).values({ telegramUserId: id }).onConflictDoNothing();
}

export async function ensureChat(chat: Chat) {
  await db.insert(chats).values({ telegramChatId: String(chat.id), title: "title" in chat ? chat.title : undefined, type: chat.type }).onConflictDoUpdate({ target: chats.telegramChatId, set: { title: "title" in chat ? chat.title : undefined, type: chat.type, updatedAt: new Date() } });
}

export async function ensureMembership(user: User, chat: Chat) {
  if (chat.type === "private") return;
  await db.insert(groupMembers).values({ telegramChatId: String(chat.id), telegramUserId: String(user.id) }).onConflictDoUpdate({ target: [groupMembers.telegramChatId, groupMembers.telegramUserId], set: { lastActiveAt: new Date() } });
}

export async function playHit6(user: User, chat: Chat, updateId: number): Promise<GameResult> {
  await ensurePlayer(user); await ensureChat(chat); await ensureMembership(user, chat);
  const [chatSettings] = await db.select().from(chats).where(eq(chats.telegramChatId, String(chat.id))).limit(1);
  if (!chatSettings?.gameEnabled) return { text: "🚫 Hit6 is disabled in this chat." };
  const [player] = await db.select().from(players).where(eq(players.telegramUserId, String(user.id))).limit(1);
  if (player?.isBanned) return { text: "🚫 You are banned from Hit6." };
  const [existingHit] = await db.select().from(dailyHits).where(eq(dailyHits.telegramUpdateId, String(updateId))).limit(1);
  if (existingHit) return { text: "✅ This batting attempt was already processed. Use /history to view recent results." };
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, String(user.id))).limit(1);
  const now = new Date();
  if (stats?.nextHitAt && stats.nextHitAt > now) {
    return { text: `⏳ You have already played your shot.\n\nNext hit available in: ${formatDuration(stats.nextHitAt.getTime() - now.getTime())}\n\n⚡ Six Power: ${stats.sixPower}\n🔥 Current Streak: ${stats.currentStreak} days` };
  }
  const outcome = pickOutcome();
  const distance = outcome.sixes > 0 ? generateDistance() : null;
  const nextHitAt = new Date(now.getTime() + (chatSettings.cooldownHours ?? 20) * 60 * 60 * 1000);
  const previousLongest = stats?.longestSix ?? 0;
  const currentStreak = stats?.lastHitAt && now.getTime() - stats.lastHitAt.getTime() <= 48 * 60 * 60 * 1000 ? (stats.currentStreak ?? 0) + 1 : 1;
  const careerSixes = (stats?.careerSixes ?? 0) + outcome.sixes;
  const longestSix = Math.max(previousLongest, distance ?? 0);
  const newTitle = titleForCareerSixes(careerSixes);
  const sixPower = Math.max(0, (stats?.sixPower ?? 0) + outcome.sixPowerDelta);
  const unlocked = achievementCodes({ careerSixes, currentStreak, distance: distance ?? 0, outcomeCode: outcome.code });
  await db.insert(dailyHits).values({ telegramUpdateId: String(updateId), telegramChatId: String(chat.id), telegramUserId: String(user.id), outcome: outcome.code, runs: outcome.runs, sixes: outcome.sixes, fours: outcome.fours, balls: outcome.balls, distance, sixPowerDelta: outcome.sixPowerDelta, newAchievements: unlocked }).onConflictDoNothing();
  await db.update(playerStats).set({ sixPower, careerSixes, careerFours: (stats?.careerFours ?? 0) + outcome.fours, totalRuns: (stats?.totalRuns ?? 0) + outcome.runs, ballsFaced: (stats?.ballsFaced ?? 0) + outcome.balls, dotBalls: (stats?.dotBalls ?? 0) + (outcome.code === "DOT" ? 1 : 0), dismissals: (stats?.dismissals ?? 0) + (outcome.code === "WICKET" ? 1 : 0), longestSix, currentStreak, bestStreak: Math.max(stats?.bestStreak ?? 0, currentStreak), xp: (stats?.xp ?? 0) + 5 + outcome.sixes * 10 + (distance && distance > previousLongest ? 25 : 0), title: newTitle, dailyAttempts: (stats?.dailyAttempts ?? 0) + 1, successfulHitDays: (stats?.successfulHitDays ?? 0) + (outcome.sixes > 0 ? 1 : 0), lastHitAt: now, nextHitAt, updatedAt: now }).where(eq(playerStats.telegramUserId, String(user.id)));
  if (chat.type !== "private") await db.update(groupMembers).set({ groupSixes: sql`${groupMembers.groupSixes} + ${outcome.sixes}`, groupRuns: sql`${groupMembers.groupRuns} + ${outcome.runs}`, groupAttempts: sql`${groupMembers.groupAttempts} + 1`, groupLongestSix: sql`greatest(${groupMembers.groupLongestSix}, ${distance ?? 0})`, lastActiveAt: now }).where(and(eq(groupMembers.telegramChatId, String(chat.id)), eq(groupMembers.telegramUserId, String(user.id))));
  for (const code of unlocked) await db.insert(achievements).values({ telegramUserId: String(user.id), code }).onConflictDoNothing();
  return { text: buildResultMessage({ name: displayName(user), outcome, distance, shot: SHOTS[randomInt(SHOTS.length)], careerSixes, totalRuns: (stats?.totalRuns ?? 0) + outcome.runs, currentStreak, nextHitAt, sixPower, previousLongest, unlocked, titleChanged: newTitle !== (stats?.title ?? "Net Batter"), newTitle }) };
}

function achievementCodes(input: { careerSixes: number; currentStreak: number; distance: number; outcomeCode: string }): string[] {
  const codes: string[] = [];
  if (input.careerSixes >= 1) codes.push("First Six");
  if (input.careerSixes >= 10) codes.push("10 Career Sixes");
  if (input.careerSixes >= 50) codes.push("50 Career Sixes");
  if (input.distance >= 100) codes.push("Century Six");
  if (input.distance >= 115) codes.push("Monster Hit");
  if (input.currentStreak >= 7) codes.push("Weekly Warrior");
  if (input.outcomeCode === "SIX_6") codes.push("Six Sixes in an Over");
  return codes;
}

function buildResultMessage(args: { name: string; outcome: Outcome; distance: number | null; shot: string; careerSixes: number; totalRuns: number; currentStreak: number; nextHitAt: Date; sixPower: number; previousLongest: number; unlocked: string[]; titleChanged: boolean; newTitle: string }) {
  const lines = [`🏏 ${args.name.toUpperCase()}'S DAILY HIT`, "", args.outcome.label];
  if (args.outcome.sixes > 1) lines.push("", Array.from({ length: args.outcome.sixes }, () => "6️⃣").join(" "));
  if (args.distance) lines.push("", `Shot: ${args.shot}`, `Longest Six: ${args.distance}m`);
  lines.push("", `⚡ Six Power: ${args.sixPower} (${args.outcome.sixPowerDelta >= 0 ? "+" : ""}${args.outcome.sixPowerDelta})`, `📈 Sixes Added: +${args.outcome.sixes}`, `6️⃣ Career Sixes: ${args.careerSixes}`, `🏃 Total Runs: ${args.totalRuns}`, `🔥 Current Streak: ${args.currentStreak} days`);
  if (args.distance && args.distance > args.previousLongest) lines.push("", `🚀 NEW PERSONAL RECORD: ${args.distance}m!`);
  if (args.titleChanged) lines.push(`🎖 Title Unlocked: ${args.newTitle}`);
  if (args.unlocked.length) lines.push(`🏆 Achievement Unlocked: ${args.unlocked[0]}`);
  lines.push("", `Next hit: ${args.nextHitAt.toUTCString()}`);
  return lines.join("\n");
}

export async function profile(user: User): Promise<string> {
  await ensurePlayer(user);
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, String(user.id))).limit(1);
  const strikeRate = stats?.ballsFaced ? (((stats.totalRuns ?? 0) / stats.ballsFaced) * 100).toFixed(2) : "0.00";
  return `🏏 ${displayName(user).toUpperCase()}'S HIT6 PROFILE\n\nTitle: ${stats?.title ?? "Net Batter"}\nBat Power: Level ${stats?.batPowerLevel ?? 1}\n\n⚡ Six Power: ${stats?.sixPower ?? 0}\n6️⃣ Career Sixes: ${stats?.careerSixes ?? 0}\n🏃 Total Runs: ${stats?.totalRuns ?? 0}\nBalls Faced: ${stats?.ballsFaced ?? 0}\nStrike Rate: ${strikeRate}\n\n📏 Longest Six: ${stats?.longestSix ?? 0}m\n🔥 Current Streak: ${stats?.currentStreak ?? 0} days\nBest Streak: ${stats?.bestStreak ?? 0} days\n\nDaily Attempts: ${stats?.dailyAttempts ?? 0}\nDismissals: ${stats?.dismissals ?? 0}`;
}

export async function leaderboard(chat: Chat): Promise<string> {
  if (chat.type === "private") return globalLeaderboard();
  const rows = await db.select({ name: players.firstName, username: players.username, sixes: groupMembers.groupSixes }).from(groupMembers).innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId)).where(eq(groupMembers.telegramChatId, String(chat.id))).orderBy(desc(groupMembers.groupSixes)).limit(10);
  return [`🏆 HIT6 GROUP LEADERBOARD`, "", ...rows.map((row, i) => `${i + 1}. ${row.name || row.username || "Player"} — ${row.sixes} Sixes`), "", `Players Ranked: ${rows.length}`].join("\n");
}

export async function globalLeaderboard(): Promise<string> {
  const rows = await db.select({ name: players.firstName, username: players.username, sixes: playerStats.careerSixes }).from(playerStats).innerJoin(players, eq(players.telegramUserId, playerStats.telegramUserId)).where(eq(players.publicRanking, true)).orderBy(desc(playerStats.careerSixes)).limit(10);
  return [`🌍 HIT6 GLOBAL LEADERBOARD`, "", ...rows.map((row, i) => `${i + 1}. ${row.name || row.username || "Player"} — ${row.sixes} Sixes`)].join("\n");
}

export async function history(user: User, chat: Chat): Promise<string> {
  const rows = await db.select().from(dailyHits).where(and(eq(dailyHits.telegramUserId, String(user.id)), eq(dailyHits.telegramChatId, String(chat.id)))).orderBy(desc(dailyHits.createdAt)).limit(10);
  return [`📜 RECENT HIT6 RESULTS`, "", ...rows.map((row) => `${row.createdAt.toISOString().slice(0, 10)} — ${row.sixes ? `+${row.sixes} Sixes — ${row.distance ?? 0}m` : row.outcome === "WICKET" ? "Wicket" : "Dot Ball"}`)].join("\n");
}

export async function achievementsText(user: User): Promise<string> {
  const rows = await db.select().from(achievements).where(eq(achievements.telegramUserId, String(user.id)));
  const unlocked = new Set(rows.map((row) => row.code));
  const all = ["First Six", "10 Career Sixes", "50 Career Sixes", "Century Six", "Monster Hit", "Weekly Warrior", "Six Sixes in an Over"];
  return [`🏆 ${displayName(user).toUpperCase()}'S ACHIEVEMENTS`, "", ...all.map((code) => `${unlocked.has(code) ? "✅" : "🔒"} ${code}`), "", `Unlocked: ${unlocked.size}/${all.length}`].join("\n");
}
