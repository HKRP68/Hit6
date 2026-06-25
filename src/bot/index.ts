import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { achievementsText, globalLeaderboard, history, leaderboard, playHit6, profile } from "./game";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.warn("BOT_TOKEN is not configured. Telegram webhook will not be able to process updates.");
}

export const bot = new Bot(token ?? "000000:missing-token");

const mainMenu = new InlineKeyboard()
  .text("🏏 Hit a Six", "hit6")
  .row()
  .text("👤 My Profile", "profile")
  .text("🏆 Leaderboard", "leaderboard")
  .row()
  .text("📖 How to Play", "help");

bot.command("start", async (ctx) => {
  await ctx.reply(
    `🏏 Welcome to Hit6, ${ctx.from?.first_name ?? "batter"}!\n\nBuild your batter, hit sixes every day, unlock achievements, and compete with players in your groups and around the world.\n\nPress “Hit a Six” or use /hit6 to play.`,
    { reply_markup: mainMenu },
  );
});

bot.command("help", async (ctx) => ctx.reply(helpText()));
bot.command("about", async (ctx) => ctx.reply("🏏 Hit6 is a daily cricket progression game for Telegram. Use /hit6 once per cooldown to grow your career."));
bot.command("hit6", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const result = await playHit6(ctx.from, ctx.chat, ctx.update.update_id);
  await ctx.reply(result.text);
});
bot.command(["mystats", "profile", "stats"], async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(await profile(ctx.from));
});
bot.command(["top", "leaderboard", "grouptop"], async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(await leaderboard(ctx.chat));
});
bot.command("globaltop", async (ctx) => ctx.reply(await globalLeaderboard()));
bot.command("history", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.reply(await history(ctx.from, ctx.chat));
});
bot.command("achievements", async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(await achievementsText(ctx.from));
});
bot.command("today", async (ctx) => ctx.reply("🌞 Today's leaderboard is coming soon. Daily hit records are already stored for this feature."));
bot.command("weekly", async (ctx) => ctx.reply("📅 Weekly rankings are coming soon."));
bot.command("season", async (ctx) => ctx.reply("🏆 Seasonal rankings are coming soon."));
bot.command("challenge", async (ctx) => ctx.reply("⚔️ Battles are planned for the next milestone. Daily /hit6 progression is live."));
bot.command("inventory", async (ctx) => ctx.reply("🎒 Inventory is ready for future consumables. No items yet."));
bot.command("settings", async (ctx) => ctx.reply("⚙️ Personal settings are coming soon."));
bot.command("records", async (ctx) => ctx.reply("🏟 Group records are coming soon."));
bot.command("titles", async (ctx) => ctx.reply("🎖 Title selection is coming soon. Career titles unlock automatically."));

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
  await ctx.reply(await leaderboard(ctx.chat));
});
bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(helpText());
});

bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  if (["member", "administrator"].includes(status) && ctx.chat.type !== "private") {
    await ctx.reply("🏏 Hit6 is ready!\n\nUse /hit6 once per day to grow your cricket career, hit massive sixes and compete with your group.\n\nMain commands:\n/hit6 — Play\n/top — Leaderboard\n/mystats — Profile\n/help — Help");
  }
});

bot.catch((error) => {
  console.error("Telegram bot error", error);
});

export const handleWebhook = webhookCallback(bot, "std/http");

function helpText() {
  return `📖 HIT6 COMMANDS\n\n/hit6 — Play your daily batting attempt\n/mystats — View your profile\n/top — Group leaderboard\n/globaltop — Global leaderboard\n/history — Recent results\n/achievements — Achievement list\n/records — Group records\n/inventory — Items\n/settings — Personal settings\n/about — Bot information`;
}
