import { eq } from "drizzle-orm";
import type { Chat } from "grammy/types";
import { db } from "../db/client";
import { chats } from "../db/schema";
import { ensureChat } from "./game";

// Group settings overview (spec 25).
export async function groupSettingsView(chat: Chat): Promise<string> {
  if (chat.type === "private") return "⚙️ Group settings are only available in groups.";
  await ensureChat(chat);
  const [s] = await db.select().from(chats).where(eq(chats.telegramChatId, String(chat.id))).limit(1);
  const onOff = (v: boolean | undefined) => (v ? "Enabled" : "Disabled");
  return [
    `⚙️ HIT6 GROUP SETTINGS`,
    "",
    `Game: ${onOff(s?.gameEnabled)}`,
    `Mode: ${s?.hardcoreMode ? "Hardcore" : "Safe"}`,
    `Battles: ${onOff(s?.battlesEnabled)}`,
    `Daily Announcement: ${onOff(s?.dailyAnnouncement)}`,
    `Cooldown: ${s?.cooldownHours ?? 20} hours`,
    "",
    `Admin commands:`,
    `/enablehit6  /disablehit6`,
    `/setmode safe|hardcore`,
    `/battles on|off`,
    `/setcooldown <hours>`,
  ].join("\n");
}

export async function setGameEnabled(chat: Chat, enabled: boolean): Promise<string> {
  await ensureChat(chat);
  await db.update(chats).set({ gameEnabled: enabled, updatedAt: new Date() }).where(eq(chats.telegramChatId, String(chat.id)));
  return enabled ? "✅ Hit6 is now enabled in this group." : "🚫 Hit6 is now disabled in this group.";
}

export async function setBattles(chat: Chat, enabled: boolean): Promise<string> {
  await ensureChat(chat);
  await db.update(chats).set({ battlesEnabled: enabled, updatedAt: new Date() }).where(eq(chats.telegramChatId, String(chat.id)));
  return enabled ? "⚔️ Battles enabled." : "⚔️ Battles disabled.";
}

export async function setMode(chat: Chat, mode: string): Promise<string> {
  const m = mode.trim().toLowerCase();
  if (m !== "safe" && m !== "hardcore") return "Usage: /setmode safe  or  /setmode hardcore";
  await ensureChat(chat);
  await db.update(chats).set({ hardcoreMode: m === "hardcore", updatedAt: new Date() }).where(eq(chats.telegramChatId, String(chat.id)));
  return `🏏 Mode set to ${m === "hardcore" ? "Hardcore" : "Safe"}.`;
}

export async function setCooldown(chat: Chat, hoursArg: string): Promise<string> {
  const hours = Number.parseInt(hoursArg.trim(), 10);
  if (!Number.isFinite(hours) || hours < 1 || hours > 48) return "Usage: /setcooldown <1-48>";
  await ensureChat(chat);
  await db.update(chats).set({ cooldownHours: hours, updatedAt: new Date() }).where(eq(chats.telegramChatId, String(chat.id)));
  return `⏱ Cooldown set to ${hours} hours.`;
}
