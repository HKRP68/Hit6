import { randomInt } from "node:crypto";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import type { Chat, User } from "grammy/types";
import { db } from "../db/client";
import { battleDeliveries, battles, chats, groupMembers, players, playerStats } from "../db/schema";
import { ensureChat, ensureMembership, ensurePlayer } from "./game";
import { displayName } from "./util";

const CHALLENGE_TTL_MS = 60_000;
const BALLS_PER_INNINGS = 3;
const MAX_INITIATED_PER_DAY = 3;
const MAX_ACCEPTED_PER_DAY = 5;
const MAX_REWARDED_H2H_PER_DAY = 3;

type Ball = { outcome: string; runs: number };

// Per-ball outcome table for battles (spec 15.5: W, 0, 1, 2, 4, 6).
const BATTLE_BALLS: { outcome: string; runs: number; weight: number }[] = [
  { outcome: "W", runs: 0, weight: 12 },
  { outcome: "0", runs: 0, weight: 18 },
  { outcome: "1", runs: 1, weight: 20 },
  { outcome: "2", runs: 2, weight: 15 },
  { outcome: "4", runs: 4, weight: 20 },
  { outcome: "6", runs: 6, weight: 15 },
];

function rollBall(): Ball {
  const total = BATTLE_BALLS.reduce((s, b) => s + b.weight, 0);
  let roll = randomInt(1, total + 1);
  for (const b of BATTLE_BALLS) {
    if (roll <= b.weight) return { outcome: b.outcome, runs: b.runs };
    roll -= b.weight;
  }
  return BATTLE_BALLS[0];
}

function startOfUtcDay(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function emojiFor(outcome: string): string {
  switch (outcome) {
    case "W":
      return "🅆";
    case "0":
      return "⚪";
    case "1":
      return "1️⃣";
    case "2":
      return "2️⃣";
    case "4":
      return "4️⃣";
    case "6":
      return "6️⃣";
    default:
      return outcome;
  }
}

async function nameFor(userId: string): Promise<string> {
  const [p] = await db.select().from(players).where(eq(players.telegramUserId, userId)).limit(1);
  return p?.firstName || p?.username || `Player ${userId}`;
}

export type ChallengeResult = { text: string; battleId?: number };

export async function createChallenge(challenger: User, chat: Chat, opponent: User | null): Promise<ChallengeResult> {
  if (chat.type === "private") return { text: "⚔️ Battles can only be started in a group chat." };
  if (!opponent) return { text: "⚔️ Reply to a player's message with /challenge, or use /challenge @username." };
  if (opponent.is_bot) return { text: "🤖 You can't challenge a bot." };
  if (String(opponent.id) === String(challenger.id)) return { text: "😅 You can't challenge yourself." };

  await ensurePlayer(challenger);
  await ensureChat(chat);
  await ensureMembership(challenger, chat);
  await ensurePlayer(opponent);
  await ensureMembership(opponent, chat);

  const chatId = String(chat.id);
  const [settings] = await db.select().from(chats).where(eq(chats.telegramChatId, chatId)).limit(1);
  if (!settings?.battlesEnabled) return { text: "⚔️ Battles are disabled in this group." };

  const [opp] = await db.select().from(players).where(eq(players.telegramUserId, String(opponent.id))).limit(1);
  if (opp?.battleRequestsEnabled === false) return { text: `🔕 ${displayName(opponent)} has battle requests turned off.` };

  // Daily initiated limit (spec 15.7).
  const [initiated] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(battles)
    .where(and(eq(battles.challengerId, String(challenger.id)), gte(battles.createdAt, startOfUtcDay())))
    .limit(1);
  if ((initiated?.count ?? 0) >= MAX_INITIATED_PER_DAY) {
    return { text: `⚔️ You have reached your ${MAX_INITIATED_PER_DAY} battle challenges for today.` };
  }

  // No duplicate active battle between these two.
  const [active] = await db
    .select()
    .from(battles)
    .where(
      and(
        eq(battles.telegramChatId, chatId),
        eq(battles.status, "pending"),
        or(
          and(eq(battles.challengerId, String(challenger.id)), eq(battles.opponentId, String(opponent.id))),
          and(eq(battles.challengerId, String(opponent.id)), eq(battles.opponentId, String(challenger.id))),
        ),
      ),
    )
    .limit(1);
  if (active && active.expiresAt && active.expiresAt > new Date()) {
    return { text: "⚔️ There is already a pending challenge between you two." };
  }

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const [created] = await db
    .insert(battles)
    .values({ telegramChatId: chatId, challengerId: String(challenger.id), opponentId: String(opponent.id), status: "pending", expiresAt })
    .returning({ id: battles.id });

  return {
    text:
      `⚔️ HIT6 CHALLENGE\n\n` +
      `${displayName(challenger)} has challenged ${displayName(opponent)} to a ${BALLS_PER_INNINGS}-ball battle!\n\n` +
      `${displayName(opponent)}, do you accept?\n\n` +
      `Challenge expires in 60 seconds.`,
    battleId: created.id,
  };
}

export async function declineChallenge(battleId: number, byUserId: string): Promise<string | null> {
  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId)).limit(1);
  if (!battle || battle.status !== "pending") return null;
  if (battle.opponentId !== byUserId && battle.challengerId !== byUserId) return null;
  await db.update(battles).set({ status: "declined", completedAt: new Date() }).where(eq(battles.id, battleId));
  return "❌ Challenge declined.";
}

export async function expireChallenge(battleId: number): Promise<void> {
  await db.update(battles).set({ status: "expired", completedAt: new Date() }).where(and(eq(battles.id, battleId), eq(battles.status, "pending")));
}

export async function acceptChallenge(battleId: number, byUserId: string): Promise<string | null> {
  const [battle] = await db.select().from(battles).where(eq(battles.id, battleId)).limit(1);
  if (!battle) return null;
  if (battle.status !== "pending") return "⚔️ This challenge is no longer open.";
  if (battle.opponentId !== byUserId) return "⚔️ Only the challenged player can accept.";
  if (battle.expiresAt && battle.expiresAt < new Date()) {
    await expireChallenge(battleId);
    return "⌛ Challenge expired.";
  }

  // Daily accepted limit (spec 15.7).
  const [accepted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(battles)
    .where(and(eq(battles.opponentId, byUserId), eq(battles.status, "completed"), gte(battles.acceptedAt, startOfUtcDay())))
    .limit(1);
  if ((accepted?.count ?? 0) >= MAX_ACCEPTED_PER_DAY) {
    return `⚔️ You have already accepted your ${MAX_ACCEPTED_PER_DAY} battles for today.`;
  }

  // Lock: mark in_progress only if still pending (guards double-accept).
  const locked = await db
    .update(battles)
    .set({ status: "in_progress", acceptedAt: new Date() })
    .where(and(eq(battles.id, battleId), eq(battles.status, "pending")))
    .returning({ id: battles.id });
  if (!locked.length) return "⚔️ This challenge is no longer open.";

  return resolveBattle(battle.id, battle.challengerId, battle.opponentId, battle.telegramChatId);
}

async function resolveBattle(battleId: number, challengerId: string, opponentId: string, chatId: string): Promise<string> {
  const challengerBalls: Ball[] = [];
  const opponentBalls: Ball[] = [];
  let challengerScore = 0;
  let opponentScore = 0;
  let challengerWickets = 0;
  let opponentWickets = 0;

  for (let i = 0; i < BALLS_PER_INNINGS; i++) {
    const cb = rollBall();
    challengerBalls.push(cb);
    challengerScore += cb.runs;
    if (cb.outcome === "W") challengerWickets++;
    const ob = rollBall();
    opponentBalls.push(ob);
    opponentScore += ob.runs;
    if (ob.outcome === "W") opponentWickets++;
  }

  // Super-over tie-break (spec 15.6).
  const superLines: string[] = [];
  let superRound = 0;
  while (challengerScore === opponentScore && superRound < 10) {
    superRound++;
    const cb = rollBall();
    const ob = rollBall();
    challengerScore += cb.runs;
    opponentScore += ob.runs;
    superLines.push(`Super Hit ${superRound}: ${emojiFor(cb.outcome)} vs ${emojiFor(ob.outcome)}`);
  }

  const winnerId = challengerScore > opponentScore ? challengerId : opponentScore > challengerScore ? opponentId : null;

  // Persist deliveries.
  let ballNo = 0;
  for (const b of challengerBalls) {
    await db.insert(battleDeliveries).values({ battleId, telegramUserId: challengerId, ballNumber: ++ballNo, outcome: b.outcome, runs: b.runs });
  }
  ballNo = 0;
  for (const b of opponentBalls) {
    await db.insert(battleDeliveries).values({ battleId, telegramUserId: opponentId, ballNumber: ++ballNo, outcome: b.outcome, runs: b.runs });
  }

  await db
    .update(battles)
    .set({ status: "completed", challengerScore, opponentScore, winnerId, completedAt: new Date() })
    .where(eq(battles.id, battleId));

  // Battle-farming protection: cap rewarded head-to-head battles per day (spec 15.8/28.4).
  const [h2h] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(battles)
    .where(
      and(
        eq(battles.status, "completed"),
        gte(battles.completedAt, startOfUtcDay()),
        or(
          and(eq(battles.challengerId, challengerId), eq(battles.opponentId, opponentId)),
          and(eq(battles.challengerId, opponentId), eq(battles.opponentId, challengerId)),
        ),
      ),
    )
    .limit(1);
  const rewardXp = (h2h?.count ?? 0) <= MAX_REWARDED_H2H_PER_DAY ? 20 : 0;

  await applyBattleStats(challengerId, challengerScore, winnerId, rewardXp);
  await applyBattleStats(opponentId, opponentScore, winnerId, rewardXp);

  const cName = await nameFor(challengerId);
  const oName = await nameFor(opponentId);
  const renderInnings = (balls: Ball[], score: number, wickets: number) => `${balls.map((b) => emojiFor(b.outcome)).join(" ")}\nScore: ${score}/${wickets}`;

  const lines = [
    `⚔️ HIT6 BATTLE`,
    "",
    `${cName}:`,
    renderInnings(challengerBalls, challengerScore, challengerWickets),
    "",
    `${oName}:`,
    renderInnings(opponentBalls, opponentScore, opponentWickets),
  ];
  if (superLines.length) lines.push("", "🟰 Scores were level — Super Hit!", ...superLines, "", `Final: ${challengerScore} — ${opponentScore}`);
  lines.push("");
  if (winnerId) {
    lines.push(`🏆 ${winnerId === challengerId ? cName : oName} wins!`);
    if (rewardXp) lines.push("", `Reward:\n+${rewardXp} XP\n+1 Battle Win`);
    else lines.push("", `(Reward reduced — repeated opponent today)`);
  } else {
    lines.push(`🤝 It's a draw!`);
  }
  return lines.join("\n");
}

async function applyBattleStats(userId: string, score: number, winnerId: string | null, rewardXp: number): Promise<void> {
  const won = winnerId === userId;
  const drawn = winnerId === null;
  const lost = winnerId !== null && winnerId !== userId;
  await db
    .update(playerStats)
    .set({
      battlesPlayed: sql`${playerStats.battlesPlayed} + 1`,
      battlesWon: sql`${playerStats.battlesWon} + ${won ? 1 : 0}`,
      battlesLost: sql`${playerStats.battlesLost} + ${lost ? 1 : 0}`,
      battlesDrawn: sql`${playerStats.battlesDrawn} + ${drawn ? 1 : 0}`,
      highestBattleScore: sql`greatest(${playerStats.highestBattleScore}, ${score})`,
      battleWinStreak: won ? sql`${playerStats.battleWinStreak} + 1` : sql`0`,
      bestBattleWinStreak: won ? sql`greatest(${playerStats.bestBattleWinStreak}, ${playerStats.battleWinStreak} + 1)` : sql`${playerStats.bestBattleWinStreak}`,
      xp: sql`${playerStats.xp} + ${won ? rewardXp : 0}`,
      updatedAt: new Date(),
    })
    .where(eq(playerStats.telegramUserId, userId));
  if (won) {
    await db
      .update(groupMembers)
      .set({ groupBattleWins: sql`${groupMembers.groupBattleWins} + 1` })
      .where(eq(groupMembers.telegramUserId, userId));
  }
}

export async function battleHistory(user: User, chat: Chat): Promise<string> {
  const uid = String(user.id);
  const rows = await db
    .select()
    .from(battles)
    .where(and(eq(battles.status, "completed"), or(eq(battles.challengerId, uid), eq(battles.opponentId, uid))))
    .orderBy(desc(battles.completedAt))
    .limit(10);
  if (!rows.length) return "⚔️ No completed battles yet. Use /challenge to start one!";
  const lines = [`⚔️ RECENT BATTLES`, ""];
  for (const b of rows) {
    const isChallenger = b.challengerId === uid;
    const oppId = isChallenger ? b.opponentId : b.challengerId;
    const myScore = isChallenger ? b.challengerScore : b.opponentScore;
    const oppScore = isChallenger ? b.opponentScore : b.challengerScore;
    const result = b.winnerId === uid ? "🏆 Win" : b.winnerId === null ? "🤝 Draw" : "❌ Loss";
    lines.push(`${result} vs ${await nameFor(oppId)} — ${myScore}:${oppScore}`);
  }
  return lines.join("\n");
}

export async function rivalry(user: User, opponent: User): Promise<string> {
  const a = String(user.id);
  const b = String(opponent.id);
  const rows = await db
    .select()
    .from(battles)
    .where(
      and(
        eq(battles.status, "completed"),
        or(
          and(eq(battles.challengerId, a), eq(battles.opponentId, b)),
          and(eq(battles.challengerId, b), eq(battles.opponentId, a)),
        ),
      ),
    );
  if (!rows.length) return `⚔️ ${displayName(user)} and ${displayName(opponent)} have never battled. Use /challenge!`;
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let aBest = 0;
  let bBest = 0;
  for (const r of rows) {
    const aScore = r.challengerId === a ? r.challengerScore : r.opponentScore;
    const bScore = r.challengerId === b ? r.challengerScore : r.opponentScore;
    aBest = Math.max(aBest, aScore);
    bBest = Math.max(bBest, bScore);
    if (r.winnerId === a) aWins++;
    else if (r.winnerId === b) bWins++;
    else draws++;
  }
  return [
    `⚔️ HEAD-TO-HEAD`,
    "",
    `${displayName(user)} vs ${displayName(opponent)}`,
    "",
    `Matches: ${rows.length}`,
    `${displayName(user)} Wins: ${aWins}`,
    `${displayName(opponent)} Wins: ${bWins}`,
    `Draws: ${draws}`,
    "",
    `Highest Score:`,
    `${displayName(user)} — ${aBest}`,
    `${displayName(opponent)} — ${bBest}`,
  ].join("\n");
}
