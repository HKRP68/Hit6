import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Context } from "grammy";
import type { User } from "grammy/types";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { players } from "../db/schema";
import { achievementsText, globalLeaderboard, history, leaderboard, playHit6, profile } from "./game";
import { acceptChallenge, battleHistory, createChallenge, declineChallenge, rivalry } from "./battle";
import {
  groupRecords,
  inventoryText,
  oddsText,
  rankText,
  selectTitle,
  settingsView,
  titlesView,
  todayLeaderboard,
  toggleSetting,
  useItem,
} from "./extras";
import { groupSettingsView, setBattles, setCooldown, setGameEnabled, setMode } from "./admin";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.warn("BOT_TOKEN is not configured. Telegram webhook will not be able to process updates.");
}

const OWNER_ID = process.env.OWNER_ID;

export const bot = new Bot(token ?? "000000:missing-token");

const mainMenu = new InlineKeyboard()
  .text("🏏 Hit a Six", "hit6")
  .row()
  .text("👤 My Profile", "profile")
  .text("🏆 Leaderboard", "leaderboard")
  .row()
  .text("📖 How to Play", "help");

async function isGroupAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  if (OWNER_ID && String(ctx.from.id) === OWNER_ID) return true;
  if (!ctx.chat || ctx.chat.type === "private") return false;
  try {
    const member = await ctx.getChatMember(ctx.from.id);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

// Resolve the target of a reply/@username command.
async function resolveTarget(ctx: Context): Promise<User | null> {
  const replied = ctx.message?.reply_to_message?.from;
  if (replied) return replied;
  const text = ctx.message?.text ?? "";
  const match = text.match(/@([A-Za-z0-9_]{4,})/);
  if (match) {
    const [row] = await db.select().from(players).where(eq(players.username, match[1])).limit(1);
    if (row) {
      return {
        id: Number(row.telegramUserId),
        is_bot: false,
        first_name: row.firstName ?? row.username ?? "Player",
        username: row.username ?? undefined,
      };
    }
  }
  return null;
}

bot.command("start", async (ctx) => {
  const addToGroup = new InlineKeyboard().url("➕ Add Hit6 to a Group", `https://t.me/${ctx.me.username}?startgroup=true`);
  const keyboard = ctx.chat?.type === "private" ? mainMenu.clone().row().url("➕ Add to a Group", `https://t.me/${ctx.me.username}?startgroup=true`) : mainMenu;
  void addToGroup;
  await ctx.reply(
    `🏏 Welcome to Hit6, ${ctx.from?.first_name ?? "batter"}!\n\nBuild your batter, hit sixes every day, unlock achievements, and compete with players in your groups and around the world.\n\nPress "Hit a Six" or use /hit6 to play.`,
    { reply_markup: keyboard },
  );
});

bot.command("help", async (ctx) => ctx.reply(helpText()));
bot.command("about", async (ctx) => ctx.reply("🏏 Hit6 is a daily cricket progression game for Telegram.\n\nUse /hit6 once per cooldown to grow your career, smash sixes, challenge friends and climb the leaderboards."));

bot.command("hit6", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const result = await playHit6(ctx.from, ctx.chat, ctx.update.update_id);
  await ctx.reply(result.text);
});

bot.command(["mystats", "profile", "stats"], async (ctx) => {
  if (!ctx.from) return;
  const target = ctx.message?.reply_to_message?.from ?? ctx.from;
  await ctx.reply(await profile(target));
});

bot.command(["top", "leaderboard", "grouptop"], async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(await leaderboard(ctx.chat, ctx.from ? String(ctx.from.id) : undefined));
});

bot.command("globaltop", async (ctx) => ctx.reply(await globalLeaderboard(ctx.from ? String(ctx.from.id) : undefined)));

bot.command("history", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.reply(await history(ctx.from, ctx.chat));
});

bot.command("achievements", async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(await achievementsText(ctx.from));
});

bot.command("today", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(await todayLeaderboard(ctx.chat));
});

bot.command("records", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(await groupRecords(ctx.chat));
});

bot.command("odds", async (ctx) => ctx.reply(oddsText()));

bot.command("rank", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.reply(await rankText(ctx.from, ctx.chat));
});

bot.command("inventory", async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(await inventoryText(ctx.from));
});

bot.command("use", async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(await useItem(ctx.from, ctx.match ?? ""));
});

bot.command("titles", async (ctx) => {
  if (!ctx.from) return;
  const { text, keyboard } = await titlesView(ctx.from);
  await ctx.reply(text, { reply_markup: keyboard });
});

bot.command("settings", async (ctx) => {
  if (!ctx.from) return;
  const { text, keyboard } = await settingsView(ctx.from);
  await ctx.reply(text, { reply_markup: keyboard });
});

bot.command("reminder", async (ctx) => {
  if (!ctx.from) return;
  const arg = (ctx.match ?? "").trim().toLowerCase();
  if (arg !== "on" && arg !== "off") return ctx.reply("Usage: /reminder on  or  /reminder off");
  await db.update(players).set({ reminderEnabled: arg === "on", updatedAt: new Date() }).where(eq(players.telegramUserId, String(ctx.from.id)));
  await ctx.reply(arg === "on" ? "🔔 Reminders enabled." : "🔕 Reminders disabled.");
});

// --- Battles ---
bot.command(["challenge", "battle"], async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const opponent = await resolveTarget(ctx);
  const result = await createChallenge(ctx.from, ctx.chat, opponent);
  if (result.battleId != null) {
    const keyboard = new InlineKeyboard().text("✅ Accept", `battle:accept:${result.battleId}`).text("❌ Decline", `battle:decline:${result.battleId}`);
    await ctx.reply(result.text, { reply_markup: keyboard });
  } else {
    await ctx.reply(result.text);
  }
});

bot.command("battlehistory", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.reply(await battleHistory(ctx.from, ctx.chat));
});

bot.command("rivalry", async (ctx) => {
  if (!ctx.from) return;
  const opponent = ctx.message?.reply_to_message?.from ?? (await resolveTarget(ctx));
  if (!opponent) return ctx.reply("⚔️ Reply to a player with /rivalry to see your head-to-head record.");
  await ctx.reply(await rivalry(ctx.from, opponent));
});

// --- Admin commands ---
bot.command("hit6settings", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(await groupSettingsView(ctx.chat));
});

bot.command("enablehit6", async (ctx) => {
  if (!ctx.chat) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply("🔒 Only group admins can change Hit6 settings.");
  await ctx.reply(await setGameEnabled(ctx.chat, true));
});

bot.command("disablehit6", async (ctx) => {
  if (!ctx.chat) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply("🔒 Only group admins can change Hit6 settings.");
  await ctx.reply(await setGameEnabled(ctx.chat, false));
});

bot.command("setmode", async (ctx) => {
  if (!ctx.chat) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply("🔒 Only group admins can change Hit6 settings.");
  await ctx.reply(await setMode(ctx.chat, ctx.match ?? ""));
});

bot.command("battles", async (ctx) => {
  if (!ctx.chat) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply("🔒 Only group admins can change Hit6 settings.");
  const arg = (ctx.match ?? "").trim().toLowerCase();
  if (arg !== "on" && arg !== "off") return ctx.reply("Usage: /battles on  or  /battles off");
  await ctx.reply(await setBattles(ctx.chat, arg === "on"));
});

bot.command("setcooldown", async (ctx) => {
  if (!ctx.chat) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply("🔒 Only group admins can change Hit6 settings.");
  await ctx.reply(await setCooldown(ctx.chat, ctx.match ?? ""));
});

// --- Callback queries ---
bot.callbackQuery("hit6", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const result = await playHit6(ctx.from, ctx.chat, ctx.update.update_id);
  await ctx.reply(result.text);
});

bot.callbackQuery("profile", async (ctx) => {
  if (!ctx.from) return;
  await ctx.answerCallbackQuery();
  await ctx.reply(await profile(ctx.from));
});

bot.callbackQuery("leaderboard", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ctx.reply(await leaderboard(ctx.chat, ctx.from ? String(ctx.from.id) : undefined));
});

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(helpText());
});

bot.callbackQuery(/^battle:(accept|decline):(\d+)$/, async (ctx) => {
  if (!ctx.from) return;
  const action = ctx.match[1];
  const battleId = Number(ctx.match[2]);
  if (action === "decline") {
    const res = await declineChallenge(battleId, String(ctx.from.id));
    await ctx.answerCallbackQuery();
    if (res) await ctx.editMessageText(res).catch(() => {});
    return;
  }
  const res = await acceptChallenge(battleId, String(ctx.from.id));
  if (!res) {
    await ctx.answerCallbackQuery({ text: "This challenge is no longer available." });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(res).catch(async () => {
    await ctx.reply(res);
  });
});

bot.callbackQuery(/^title:(\d+)$/, async (ctx) => {
  if (!ctx.from) return;
  const res = await selectTitle(ctx.from, Number(ctx.match[1]));
  await ctx.answerCallbackQuery({ text: res });
  const { text, keyboard } = await titlesView(ctx.from);
  await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
});

bot.callbackQuery(/^set:(public|reminder|battles)$/, async (ctx) => {
  if (!ctx.from) return;
  await ctx.answerCallbackQuery();
  const { text, keyboard } = await toggleSetting(ctx.from, ctx.match[1] as "public" | "reminder" | "battles");
  await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
});

bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  if (["member", "administrator"].includes(status) && ctx.chat.type !== "private") {
    await ctx.reply(
      "🏏 Hit6 is ready!\n\nUse /hit6 once per day to grow your cricket career, hit massive sixes and compete with your group.\n\nMain commands:\n/hit6 — Play\n/top — Leaderboard\n/mystats — Profile\n/challenge — Battle\n\nAdmins can use /hit6settings.",
    );
  }
});

bot.catch((error) => {
  console.error("Telegram bot error", error);
});

export const handleWebhook = webhookCallback(bot, "std/http");

function helpText() {
  return [
    "🏏 HIT6 HELP",
    "",
    "Daily Game",
    "/hit6 — Play your daily shot",
    "/mystats — View your profile",
    "/history — Recent results",
    "",
    "Competition",
    "/top — Group leaderboard",
    "/globaltop — Global leaderboard",
    "/today — Today's rankings",
    "/records — Group records",
    "/rank — Your current rank",
    "",
    "Battles",
    "/challenge — Challenge a player (reply)",
    "/battlehistory — Recent battles",
    "/rivalry — Head-to-head record (reply)",
    "",
    "Progress",
    "/achievements — Achievements",
    "/titles — Select a title",
    "/inventory — View items",
    "/use — Use a boost item",
    "/odds — Result odds",
    "",
    "Other",
    "/settings — Personal settings",
    "/reminder on|off — Daily reminder",
    "/about — About Hit6",
  ].join("\n");
}
