import { randomInt } from "node:crypto";

export type Outcome = {
  code: string;
  label: string;
  weight: number;
  runs: number;
  sixes: number;
  fours: number;
  balls: number;
};

// Base outcome table from spec section 5.1 (probabilities total 100%).
export const BASE_OUTCOMES: Outcome[] = [
  { code: "WICKET", label: "💥 BOWLED!", weight: 2, runs: 0, sixes: 0, fours: 0, balls: 1 },
  { code: "DOT", label: "🛡 DOT BALL!", weight: 10, runs: 0, sixes: 0, fours: 0, balls: 1 },
  { code: "SINGLE", label: "🏃 QUICK SINGLE!", weight: 5, runs: 1, sixes: 0, fours: 0, balls: 1 },
  { code: "DOUBLE", label: "🏃‍♂️ RUNNING TWO!", weight: 5, runs: 2, sixes: 0, fours: 0, balls: 1 },
  { code: "FOUR", label: "4️⃣ FOUR!", weight: 10, runs: 4, sixes: 0, fours: 1, balls: 1 },
  { code: "SIX_1", label: "🔥 SIX!", weight: 35, runs: 6, sixes: 1, fours: 0, balls: 1 },
  { code: "SIX_2", label: "💥 BACK-TO-BACK SIXES!", weight: 18, runs: 12, sixes: 2, fours: 0, balls: 2 },
  { code: "SIX_3", label: "🎯 HAT-TRICK OF SIXES!", weight: 8, runs: 18, sixes: 3, fours: 0, balls: 3 },
  { code: "SIX_4", label: "🚀 FOUR HUGE SIXES!", weight: 4, runs: 24, sixes: 4, fours: 0, balls: 4 },
  { code: "SIX_5", label: "🌪 FIVE-SIX OVER!", weight: 2, runs: 30, sixes: 5, fours: 0, balls: 5 },
  { code: "SIX_6", label: "🤯 SIX SIXES IN THE OVER!", weight: 1, runs: 36, sixes: 6, fours: 0, balls: 6 },
];

export type Modifiers = { powerBoost?: boolean; weekendPowerplay?: boolean };

// Build adjusted weights, redistributing a clamped bonus from dot balls toward
// multiple-six outcomes (spec 31.2: max total bonus 5%, six-sixes cap 1.5%).
export function buildWeights(mod: Modifiers): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const o of BASE_OUTCOMES) weights[o.code] = o.weight;

  let bonus = 0;
  if (mod.powerBoost) bonus += 2.5;
  if (mod.weekendPowerplay) bonus += 2;
  bonus = Math.min(bonus, 5);

  if (bonus > 0) {
    const take = Math.min(bonus, weights.DOT);
    weights.DOT -= take;
    weights.SIX_2 += take * 0.5;
    weights.SIX_3 += take * 0.25;
    weights.SIX_4 += take * 0.15;
    weights.SIX_5 += take * 0.07;
    weights.SIX_6 += take * 0.03;
  }
  // Clamp six-sixes chance to a maximum of 1.5%.
  weights.SIX_6 = Math.min(weights.SIX_6, 1.5);
  return weights;
}

export function pickOutcome(mod: Modifiers = {}): Outcome {
  const weights = buildWeights(mod);
  const total = BASE_OUTCOMES.reduce((sum, o) => sum + weights[o.code], 0);
  const scaledTotal = Math.round(total * 1000);
  let roll = randomInt(1, scaledTotal + 1) / 1000;
  for (const o of BASE_OUTCOMES) {
    const w = weights[o.code];
    if (roll <= w) return { ...o, weight: w };
    roll -= w;
  }
  return { ...BASE_OUTCOMES[BASE_OUTCOMES.length - 1] };
}

// Display odds (percentages) for the /odds command.
export function oddsTable(mod: Modifiers = {}): { label: string; pct: string }[] {
  const weights = buildWeights(mod);
  const total = BASE_OUTCOMES.reduce((sum, o) => sum + weights[o.code], 0);
  return BASE_OUTCOMES.map((o) => ({
    label: o.label.replace(/^[^A-Za-z]+/, "").replace(/!$/, ""),
    pct: ((weights[o.code] / total) * 100).toFixed(1),
  }));
}

export function generateDistance(bonus = 0): number {
  const roll = randomInt(1, 101);
  let base: number;
  if (roll <= 25) base = randomInt(65, 91); // Standard six 65–90m
  else if (roll <= 65) base = randomInt(85, 106); // Powerful six 85–105m
  else if (roll <= 90) base = randomInt(100, 121); // Massive six 100–120m
  else base = randomInt(115, 136); // Record six 115–135m
  return Math.min(135, base + bonus);
}

export const SHOTS = [
  "Pull shot",
  "Hook shot",
  "Slog sweep",
  "Straight drive",
  "Lofted cover drive",
  "Helicopter shot",
  "Pick-up shot",
  "Inside-out shot",
  "Upper cut",
  "Long-on slog",
  "Long-off launch",
  "Reverse sweep",
  "Switch hit",
];

export function randomShot(): string {
  return SHOTS[randomInt(SHOTS.length)];
}
