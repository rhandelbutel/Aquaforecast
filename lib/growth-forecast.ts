// lib/growth-forecast.ts

export interface GrowthStage {
  /** inclusive lower bound in grams */
  from: number;
  /** exclusive upper bound in grams; null = no upper bound */
  to: number | null;
  /** expected weekly gain (g/week) within this stage */
  rate: number;
}


export const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 15,   rate: 5.0 },   
  { from: 16,  to: 30,   rate: 13.0 },
  { from: 31,  to: 45,   rate: 16.5 },
  { from: 46,  to: 60,   rate: 20.5 },
  { from: 61,  to: 75,   rate: 21.5 },
  { from: 76,  to: 90,   rate: 22.0 },  
  { from: 91,  to: 105,  rate: 18.0 },
  { from: 106, to: null, rate: 12.0 },
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
