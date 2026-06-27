import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Chat, User } from "grammy/types";
import { InlineKeyboard } from "grammy";
import { db } from "../db/client";
import { chats, dailyHits, groupMembers, players, playerStats } from "../db/schema";
import { getInventory, isItemKey, ITEM_ORDER, ITEMS, type ItemKey } from "./items";
import { oddsTable } from "./outcomes";
import { CAREER_TITLES, displayName, titleForCareerSixes } from "./util";
import { ensurePlayer } from "./game";

function startOfUtcDay(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// /today — daily six rankings for the current group (spec 14.1).
export async function todayLeaderboard(chat: Chat): Promise<string> {
  if (chat.type === "private") return "🌞 Daily rankings are available inside groups.";
  const since = startOfUtcDay();
  const rows = await db
    .select({
      userId: dailyHits.telegramUserId,
      name: players.firstName,
      username: players.username,
      sixes: sql<number>`sum(${dailyHits.sixes})::int`,
      longest: sql<number>`max(coalesce(${dailyHits.distance}, 0))::int`,
    })
    .from(dailyHits)
    .innerJoin(players, eq(players.telegramUserId, dailyHits.telegramUserId))
    .where(and(eq(dailyHits.telegramChatId, String(chat.id)), gte(dailyHits.createdAt, since)))
    .groupBy(dailyHits.telegramUserId, players.firstName, players.username)
    .orderBy(desc(sql`sum(${dailyHits.sixes})`))
    .limit(10);

  if (!rows.length) return "🌞 No sixes hit in this group yet today. Use /hit6!";
  const lines = [`🌞 TODAY'S TOP HITTERS`, "", ...rows.map((r, i) => `${i + 1}. ${r.name || r.username || "Player"} — ${r.sixes} Sixes`)];
  const top = rows.reduce((a, b) => (b.longest > a.longest ? b : a), rows[0]);
  if (top.longest > 0) lines.push("", `Longest Six Today:`, `${top.name || top.username || "Player"} — ${top.longest}m`);
  return lines.join("\n");
}

// /records — group all-time records (spec 19).
export async function groupRecords(chat: Chat): Promise<string> {
  if (chat.type === "private") return "🏟 Group records are available inside groups.";
  const chatId = String(chat.id);

  const [mostSixes] = await db
    .select({ name: players.firstName, username: players.username, val: groupMembers.groupSixes })
    .from(groupMembers)
    .innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId))
    .where(eq(groupMembers.telegramChatId, chatId))
    .orderBy(desc(groupMembers.groupSixes))
    .limit(1);

  const [longestSix] = await db
    .select({ name: players.firstName, username: players.username, val: groupMembers.groupLongestSix })
    .from(groupMembers)
    .innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId))
    .where(eq(groupMembers.telegramChatId, chatId))
    .orderBy(desc(groupMembers.groupLongestSix))
    .limit(1);

  const [mostWins] = await db
    .select({ name: players.firstName, username: players.username, val: groupMembers.groupBattleWins })
    .from(groupMembers)
    .innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId))
    .where(eq(groupMembers.telegramChatId, chatId))
    .orderBy(desc(groupMembers.groupBattleWins))
    .limit(1);

  // Best current streak among members (uses global streak).
  const [bestStreak] = await db
    .select({ name: players.firstName, username: players.username, val: playerStats.currentStreak })
    .from(groupMembers)
    .innerJoin(playerStats, eq(playerStats.telegramUserId, groupMembers.telegramUserId))
    .innerJoin(players, eq(players.telegramUserId, groupMembers.telegramUserId))
    .where(eq(groupMembers.telegramChatId, chatId))
    .orderBy(desc(playerStats.currentStreak))
    .limit(1);

  const fmt = (r: { name: string | null; username: string | null; val: number } | undefined, unit: string) =>
    r && r.val > 0 ? `${r.name || r.username || "Player"} — ${r.val}${unit}` : "—";

  return [
    `🏟 HIT6 GROUP RECORDS`,
    "",
    `Most Career Sixes:`,
    fmt(mostSixes, ""),
    "",
    `Longest Six:`,
    fmt(longestSix, "m"),
    "",
    `Best Current Streak:`,
    fmt(bestStreak, " days"),
    "",
    `Most Battle Wins:`,
    fmt(mostWins, ""),
  ].join("\n");
}

// /odds — transparent base odds (spec 31.3).
export function oddsText(): string {
  const rows = oddsTable();
  return [`🎲 HIT6 BASE ODDS`, "", ...rows.map((r) => `${r.label.trim()} — ${r.pct}%`), "", `Weekend Powerplay adds up to +2% to multiple-six results.`].join("\n");
}

// /rank — quick rank lookup (spec 17.2).
export async function rankText(user: User, chat: Chat): Promise<string> {
  await ensurePlayer(user);
  const userId = String(user.id);
  const lines = [`📊 ${displayName(user).toUpperCase()}'S RANK`, ""];

  if (chat.type !== "private") {
    const [me] = await db
      .select({ sixes: groupMembers.groupSixes })
      .from(groupMembers)
      .where(and(eq(groupMembers.telegramChatId, String(chat.id)), eq(groupMembers.telegramUserId, userId)))
      .limit(1);
    if (me) {
      const [ahead] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMembers)
        .where(and(eq(groupMembers.telegramChatId, String(chat.id)), sql`${groupMembers.groupSixes} > ${me.sixes}`))
        .limit(1);
      lines.push(`🏆 Group Rank: #${(ahead?.count ?? 0) + 1}  (${me.sixes} group sixes)`);
    }
  }

  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, userId)).limit(1);
  const [ahead] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playerStats)
    .innerJoin(players, eq(players.telegramUserId, playerStats.telegramUserId))
    .where(and(eq(players.publicRanking, true), sql`${playerStats.careerSixes} > ${stats?.careerSixes ?? 0}`))
    .limit(1);
  lines.push(`🌍 Global Rank: #${((ahead?.count ?? 0) + 1).toLocaleString("en-US")}  (${stats?.careerSixes ?? 0} career sixes)`);
  return lines.join("\n");
}

// /inventory — list consumable items (spec 20.3).
export async function inventoryText(user: User): Promise<string> {
  await ensurePlayer(user);
  const counts = await getInventory(String(user.id));
  const lines = [`🎒 YOUR INVENTORY`, ""];
  for (const key of ITEM_ORDER) lines.push(`${ITEMS[key].emoji} ${ITEMS[key].name}: ${counts[key]}`);
  lines.push("", `Use /use <item> to activate a Power Boost or Distance Boost before your next /hit6.`);
  return lines.join("\n");
}

// /use — activate a boost item for the next hit.
export async function useItem(user: User, arg: string): Promise<string> {
  await ensurePlayer(user);
  const userId = String(user.id);
  const normalized = arg.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, ItemKey> = {
    power: "power_boost",
    power_boost: "power_boost",
    distance: "distance_boost",
    distance_boost: "distance_boost",
  };
  const key = aliases[normalized] ?? (isItemKey(normalized) ? (normalized as ItemKey) : undefined);
  if (!key) return "🎒 Usage: /use power  or  /use distance\n\nWicket Shields, Dot Ball Retries and Streak Freezes are used automatically.";
  if (key !== "power_boost" && key !== "distance_boost") {
    return `${ITEMS[key].emoji} ${ITEMS[key].name} is consumed automatically when needed.`;
  }
  const counts = await getInventory(userId);
  if (counts[key] <= 0) return `🎒 You don't have any ${ITEMS[key].name}.`;
  await db.update(playerStats).set({ activeItem: key, updatedAt: new Date() }).where(eq(playerStats.telegramUserId, userId));
  return `${ITEMS[key].emoji} ${ITEMS[key].name} armed! It will apply to your next /hit6.`;
}

// /titles — list and select unlocked career titles (spec 10.3).
export async function titlesView(user: User): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await ensurePlayer(user);
  const userId = String(user.id);
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, userId)).limit(1);
  const [pl] = await db.select().from(players).where(eq(players.telegramUserId, userId)).limit(1);
  const career = stats?.careerSixes ?? 0;
  const selected = pl?.selectedTitle ?? titleForCareerSixes(career);
  const unlocked = CAREER_TITLES.filter((t) => career >= t.threshold);

  const lines = [`🎖 YOUR TITLES`, "", `Selected: ${selected}`, "", `Unlocked:`];
  for (const t of unlocked) lines.push(`${t.title === selected ? "✅" : "•"} ${t.title}`);
  const next = CAREER_TITLES.find((t) => career < t.threshold);
  if (next) lines.push("", `Next: ${next.title} at ${next.threshold} career sixes`);

  const keyboard = new InlineKeyboard();
  unlocked.forEach((t, i) => {
    keyboard.text(`${t.title === selected ? "✅ " : ""}${t.title}`, `title:${t.threshold}`);
    if (i % 2 === 1) keyboard.row();
  });
  return { text: lines.join("\n"), keyboard };
}

export async function selectTitle(user: User, threshold: number): Promise<string> {
  const userId = String(user.id);
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.telegramUserId, userId)).limit(1);
  const career = stats?.careerSixes ?? 0;
  const target = CAREER_TITLES.find((t) => t.threshold === threshold);
  if (!target || career < target.threshold) return "🔒 That title is not unlocked yet.";
  await db.update(players).set({ selectedTitle: target.title, updatedAt: new Date() }).where(eq(players.telegramUserId, userId));
  return `🎖 Title set to: ${target.title}`;
}

// /settings — personal toggles (spec 24).
export async function settingsView(user: User): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await ensurePlayer(user);
  const [pl] = await db.select().from(players).where(eq(players.telegramUserId, String(user.id))).limit(1);
  const onOff = (v: boolean | undefined | null) => (v ? "✅ On" : "❌ Off");
  const text = [
    `⚙️ PERSONAL SETTINGS`,
    "",
    `Public Global Ranking: ${onOff(pl?.publicRanking)}`,
    `Daily Reminder: ${onOff(pl?.reminderEnabled)}`,
    `Battle Requests: ${onOff(pl?.battleRequestsEnabled)}`,
  ].join("\n");
  const keyboard = new InlineKeyboard()
    .text(`Public Ranking: ${pl?.publicRanking ? "On" : "Off"}`, "set:public")
    .row()
    .text(`Reminder: ${pl?.reminderEnabled ? "On" : "Off"}`, "set:reminder")
    .row()
    .text(`Battle Requests: ${pl?.battleRequestsEnabled ? "On" : "Off"}`, "set:battles");
  return { text, keyboard };
}

export async function toggleSetting(user: User, key: "public" | "reminder" | "battles"): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await ensurePlayer(user);
  const userId = String(user.id);
  const [pl] = await db.select().from(players).where(eq(players.telegramUserId, userId)).limit(1);
  if (key === "public") await db.update(players).set({ publicRanking: !(pl?.publicRanking ?? true), updatedAt: new Date() }).where(eq(players.telegramUserId, userId));
  if (key === "reminder") await db.update(players).set({ reminderEnabled: !(pl?.reminderEnabled ?? false), updatedAt: new Date() }).where(eq(players.telegramUserId, userId));
  if (key === "battles") await db.update(players).set({ battleRequestsEnabled: !(pl?.battleRequestsEnabled ?? true), updatedAt: new Date() }).where(eq(players.telegramUserId, userId));
  return settingsView(user);
}

export { chats };
