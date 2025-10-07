// lib/growth-forecast.ts

export interface GrowthStage {
  /** inclusive lower bound in grams */
  from: number;
  /** exclusive upper bound in grams; null = no upper bound */
  to: number | null;
  /** expected weekly gain (g/week) within this stage */
  rate: number;
}

/**
 * Tilapia (Nile) stage table — midpoints of the ranges you provided.
 * - 1→20g:      ~4–5 g/w  => 4.5
 * - 20→100g:    ~13–15 g/w => 14
 * - 100→300g:   ~25 g/w
 * - 300→600g:   ~35–40 g/w => 37.5
 * - >600g:      keep last stage rate unless you’d like a different tail rule
 */
export const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 20,   rate: 4.5 },
  { from: 20,  to: 100,  rate: 14 },
  { from: 100, to: 300,  rate: 25 },
  { from: 300, to: 600,  rate: 37.5 },
  { from: 600, to: null, rate: 37.5 }, // extend beyond 600g at same pace
];

/**
 * Compute days needed to reach `targetWeight` (g) from `currentABW` (g)
 * by integrating through piecewise weekly rates.
 * Returns an integer day count (ceil to whole days).
 */
export function predictDaysToTargetByStages(
  currentABW: number,
  targetWeight: number,
  stages: GrowthStage[] = TILAPIA_STAGES
): number {
  if (!Number.isFinite(currentABW) || !Number.isFinite(targetWeight)) return 0;
  if (targetWeight <= currentABW) return 0;

  // If the fish is lighter than the first stage lower bound, start at that bound
  let cursor = Math.max(currentABW, stages[0]?.from ?? currentABW);
  let remainingTarget = targetWeight;
  let totalWeeks = 0;

  for (const s of stages) {
    if (cursor >= remainingTarget) break;

    // Skip stages entirely below current cursor
    if (s.to !== null && cursor >= s.to) continue;

    const stageStart = Math.max(cursor, s.from);
    const stageEnd = s.to === null ? remainingTarget : Math.min(s.to, remainingTarget);

    if (stageEnd <= stageStart) continue;

    const deltaG = stageEnd - stageStart;       // grams to gain inside this stage
    const weeks = deltaG / s.rate;              // weeks at stage rate
    totalWeeks += weeks;

    cursor = stageEnd; // advance
  }

  const days = Math.ceil(totalWeeks * 7);
  return Math.max(0, days);
}

/** Tiny helper: from a number-of-days, give a JS Date shifted from "now". */
export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
