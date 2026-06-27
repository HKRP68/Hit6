import type { User } from "grammy/types";

export function displayName(user: { first_name?: string; last_name?: string; username?: string; id: number | string }): string {
  const u = user as User;
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || `Player ${user.id}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
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

// Ordered list of every career title and the career-sixes threshold that unlocks it.
export const CAREER_TITLES: { threshold: number; title: string }[] = [
  { threshold: 0, title: "Net Batter" },
  { threshold: 10, title: "Rookie Hitter" },
  { threshold: 25, title: "Boundary Hunter" },
  { threshold: 50, title: "Power Hitter" },
  { threshold: 100, title: "Six Machine" },
  { threshold: 250, title: "Stadium Destroyer" },
  { threshold: 500, title: "Elite Finisher" },
  { threshold: 1000, title: "Six Legend" },
  { threshold: 2500, title: "Bowling Nightmare" },
  { threshold: 5000, title: "King of Sixes" },
  { threshold: 10000, title: "Immortal Batter" },
];

// XP required to reach the next level (spec 11.3: 100 × current level).
export function xpForNextLevel(level: number): number {
  return 100 * level;
}

export function levelForXp(xp: number): { level: number; intoLevel: number; needed: number } {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level += 1;
  }
  return { level, intoLevel: remaining, needed: xpForNextLevel(level) };
}
