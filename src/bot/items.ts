import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { playerInventory } from "../db/schema";

export type ItemKey =
  | "wicket_shield"
  | "dot_ball_retry"
  | "streak_freeze"
  | "power_boost"
  | "distance_boost";

export const ITEMS: Record<ItemKey, { name: string; emoji: string; description: string }> = {
  wicket_shield: { name: "Wicket Shield", emoji: "🛡", description: "Protects one wicket result." },
  dot_ball_retry: { name: "Dot Ball Retry", emoji: "🔁", description: "Rerolls one dot-ball result." },
  streak_freeze: { name: "Streak Freeze", emoji: "❄️", description: "Protects a missed daily streak." },
  power_boost: { name: "Power Boost", emoji: "⚡", description: "Small boost to multiple-six chances on your next hit." },
  distance_boost: { name: "Distance Boost", emoji: "📏", description: "Adds bonus distance to your next six." },
};

export const ITEM_ORDER: ItemKey[] = [
  "wicket_shield",
  "dot_ball_retry",
  "streak_freeze",
  "power_boost",
  "distance_boost",
];

// Maximum stored quantities to keep things fair (spec: max 3 streak freezes etc.).
const ITEM_CAPS: Record<ItemKey, number> = {
  wicket_shield: 5,
  dot_ball_retry: 5,
  streak_freeze: 3,
  power_boost: 5,
  distance_boost: 5,
};

export function isItemKey(value: string): value is ItemKey {
  return value in ITEMS;
}

export async function getInventory(userId: string): Promise<Record<ItemKey, number>> {
  const rows = await db
    .select()
    .from(playerInventory)
    .where(eq(playerInventory.telegramUserId, userId));
  const counts = Object.fromEntries(ITEM_ORDER.map((key) => [key, 0])) as Record<ItemKey, number>;
  for (const row of rows) {
    if (isItemKey(row.itemKey)) counts[row.itemKey] = row.quantity;
  }
  return counts;
}

export async function getItemCount(userId: string, item: ItemKey): Promise<number> {
  const [row] = await db
    .select()
    .from(playerInventory)
    .where(and(eq(playerInventory.telegramUserId, userId), eq(playerInventory.itemKey, item)))
    .limit(1);
  return row?.quantity ?? 0;
}

export async function grantItem(userId: string, item: ItemKey, amount = 1): Promise<void> {
  const cap = ITEM_CAPS[item];
  await db
    .insert(playerInventory)
    .values({ telegramUserId: userId, itemKey: item, quantity: Math.min(amount, cap) })
    .onConflictDoUpdate({
      target: [playerInventory.telegramUserId, playerInventory.itemKey],
      set: {
        quantity: sql`least(${cap}, ${playerInventory.quantity} + ${amount})`,
        updatedAt: new Date(),
      },
    });
}

// Atomically consume one unit if available. Returns true when an item was spent.
export async function consumeItem(userId: string, item: ItemKey): Promise<boolean> {
  const updated = await db
    .update(playerInventory)
    .set({ quantity: sql`${playerInventory.quantity} - 1`, updatedAt: new Date() })
    .where(
      and(
        eq(playerInventory.telegramUserId, userId),
        eq(playerInventory.itemKey, item),
        sql`${playerInventory.quantity} > 0`,
      ),
    )
    .returning({ quantity: playerInventory.quantity });
  return updated.length > 0;
}
