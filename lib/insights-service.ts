// lib/insights-service.ts
"use client";

import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

// ----------------------------- Types -----------------------------
export type Severity = "info" | "warning" | "danger" | "error"; // "danger" = pond risk, "error" = system issue
export type Category = "water" | "mortality" | "growth" | "device";

export type Insight = {
  id?: string;
  pondId: string;
  key: string;
  title: string;
  message: string;
  severity: Severity;
  category: Category;
  evidence?: Record<string, any>;
  suggestedAction?: string;
  actionLink?: { label: string; href: string };
  createdAt: number; // ms
  status: "active" | "snoozed" | "resolved";
  snoozedUntil?: number; // ms
  cooldownKey?: string; // avoid duplicates in a day
};

export type LiveReading = {
  ts: number;
  temp: number;
  ph: number;
  tds: number;
  do: number;
};

export type PondLite = {
  id: string;
  name?: string;
  fishSpecies?: string;
  area?: number;
  fishCount?: number;
};

// ----------------------------- Config (Ranges) -----------------------------
// Your requested optimal ranges + simple alert rules
export const thresholds = {
  DO: {
    optimalMin: 3.0,
    optimalMax: 5.0,
  },
  pH: {
    optimalMin: 6.5,
    optimalMax: 9.5,
  },
  tempC: {
    optimalMin: 29, // °C
    optimalMax: 31,
  },
  tds: {
    optimalMin: 100, // ppm
    optimalMax: 400,
  },
  device: { offlineMin: 20, gapMin: 90, recoverMin: 10 },
  mortality: { warnPctDay: 2, errorPctDay: 5, baselineDays: 15, streakDays: 3 },
  growth: { dailyGainG: 1.8 }, // kept for other views if needed
};

// ----------------------------- Paths & helpers -----------------------------
const itemsCol = (pondId: string) => collection(db, "insights", pondId, "items");
const itemRef = (pondId: string, id: string) => doc(db, "insights", pondId, "items", id);
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

async function upsertInsight(
  pondId: string,
  draft: Omit<Insight, "id" | "createdAt" | "status" | "pondId">
) {
  const id = `${draft.key}:${dayKey(Date.now())}`;
  const ref = itemRef(pondId, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cur = snap.data() as Insight;
    if (cur.status === "active") return; // cooldown by day
  }
  await setDoc(
    ref,
    { ...draft, pondId, createdAt: Date.now(), status: "active" },
    { merge: true }
  );
}

export function subscribeInsights(pondId: string, cb: (items: Insight[]) => void) {
  const qy = query(itemsCol(pondId), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (qs) => {
    const arr: Insight[] = [];
    qs.forEach((d) => arr.push({ id: d.id, ...(d.data() as Insight) }));
    cb(arr);
  });
}

export async function resolveInsight(pondId: string, id: string) {
  await updateDoc(itemRef(pondId, id), { status: "resolved" });
}

export async function snoozeInsight(pondId: string, id: string, hours = 6) {
  const until = Date.now() + hours * 3600_000;
  await updateDoc(itemRef(pondId, id), { status: "snoozed", snoozedUntil: until });
}

// ----------------------------- Util -----------------------------
function toDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  if ((x as any)?.toDate) { try { return (x as any).toDate() as Date; } catch {} }
  if (typeof x?.seconds === "number") return new Date(x.seconds * 1000);
  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
}

// ----------------------------- Auto-resolve helpers -----------------------------
const lastNormalSince: Record<string, number> = {}; // key = `${pondId}:${metric}`

function markNormal(pondId: string, metric: string, isNormal: boolean) {
  const k = `${pondId}:${metric}`;
  if (isNormal) { if (!lastNormalSince[k]) lastNormalSince[k] = Date.now(); }
  else { delete lastNormalSince[k]; }
}

async function resolveTodayByKey(pondId: string, key: string) {
  try {
    const id = `${key}:${dayKey(Date.now())}`;
    await updateDoc(itemRef(pondId, id), { status: "resolved" });
  } catch {}
}

// 0ms = resolve immediately once optimal
const NORMAL_WINDOWS = { do: 0, ph: 0, temp: 0, tds: 0 };

async function maybeResolveWater(pondId: string, r: LiveReading) {
  const doOk   = r.do  >= thresholds.DO.optimalMin   && r.do  <= thresholds.DO.optimalMax;
  const phOk   = r.ph  >= thresholds.pH.optimalMin   && r.ph  <= thresholds.pH.optimalMax;
  const tempOk = r.temp>= thresholds.tempC.optimalMin&& r.temp<= thresholds.tempC.optimalMax;
  const tdsOk  = r.tds >= thresholds.tds.optimalMin  && r.tds <= thresholds.tds.optimalMax;

  markNormal(pondId, "do", doOk);
  markNormal(pondId, "ph", phOk);
  markNormal(pondId, "temp", tempOk);
  markNormal(pondId, "tds", tdsOk);

  const now = Date.now();
  if (doOk   && lastNormalSince[`${pondId}:do`]   !== undefined && now - lastNormalSince[`${pondId}:do`]   >= NORMAL_WINDOWS.do)   { await resolveTodayByKey(pondId, "do_low");   await resolveTodayByKey(pondId, "do_high"); await resolveTodayByKey(pondId, "do_warning"); }
  if (phOk   && lastNormalSince[`${pondId}:ph`]   !== undefined && now - lastNormalSince[`${pondId}:ph`]   >= NORMAL_WINDOWS.ph)   { await resolveTodayByKey(pondId, "ph_danger"); await resolveTodayByKey(pondId, "ph_warning"); }
  if (tempOk && lastNormalSince[`${pondId}:temp`] !== undefined && now - lastNormalSince[`${pondId}:temp`] >= NORMAL_WINDOWS.temp) { await resolveTodayByKey(pondId, "temp_warning"); await resolveTodayByKey(pondId, "temp_heat"); }
  if (tdsOk  && lastNormalSince[`${pondId}:tds`]  !== undefined && now - lastNormalSince[`${pondId}:tds`]  >= NORMAL_WINDOWS.tds)  { await resolveTodayByKey(pondId, "tds_warning"); }
}

// ----------------------------- Detectors (4 lanes) -----------------------------

// 1) Realtime sensor findings (based on your ranges)
export async function detectRealtimeFindings(pond: PondLite, r: LiveReading) {
  const pId = pond.id;

  // ---- DO: optimal 3–5 mg/L
  if (r.do < thresholds.DO.optimalMin) {
    await upsertInsight(pId, {
      key: "do_low",
      title: "Low Dissolved Oxygen",
      message: `DO is ${r.do.toFixed(1)} mg/L (< ${thresholds.DO.optimalMin}).`,
      severity: "danger",
      category: "water",
      suggestedAction:
        "Run aerator at full power immediately. Stop feeding. Recheck DO every 15 min until it returns to 3–5 mg/L.",
      evidence: { value: r.do },
    });
  } else if (r.do > thresholds.DO.optimalMax) {
    await upsertInsight(pId, {
      key: "do_high",
      title: "High DO (above optimal)",
      message: `DO is ${r.do.toFixed(1)} mg/L (> ${thresholds.DO.optimalMax}).`,
      severity: "warning",
      category: "water",
      suggestedAction:
        "Reduce unnecessary aeration if foaming occurs; check diffuser placement. Keep monitoring.",
      evidence: { value: r.do },
    });
  }

  // ---- pH: optimal 6.5–9.5
  if (r.ph < thresholds.pH.optimalMin || r.ph > thresholds.pH.optimalMax) {
    await upsertInsight(pId, {
      key: "ph_danger",
      title: "pH out of optimal range",
      message: `pH is ${r.ph.toFixed(2)} (optimal 6.5–9.5).`,
      severity: "danger",
      category: "water",
      suggestedAction:
        "Do a gradual 10% water exchange. Avoid strong chemicals. Recheck pH after 30–60 min.",
      evidence: { value: r.ph },
    });
  }

  // ---- Temperature: optimal 29–31 °C
  if (r.temp < thresholds.tempC.optimalMin || r.temp > thresholds.tempC.optimalMax) {
    await upsertInsight(pId, {
      key: "temp_warning",
      title: "Temperature outside optimal",
      message: `Water is ${r.temp.toFixed(1)} °C (optimal 29–31 °C).`,
      severity: "warning",
      category: "water",
      suggestedAction:
        "Feed during cooler hours (6–8 AM, 5–6 PM). Add shade/splash; consider a small cool water exchange.",
      evidence: { value: r.temp },
    });
  }

  // ---- TDS: optimal 100–400 ppm
  if (r.tds < thresholds.tds.optimalMin || r.tds > thresholds.tds.optimalMax) {
    await upsertInsight(pId, {
      key: "tds_warning",
      title: "TDS outside optimal",
      message: `TDS is ${r.tds.toFixed(0)} ppm (optimal 100–400 ppm).`,
      severity: "warning",
      category: "water",
      suggestedAction:
        "Do a 10–20% water exchange and check source water quality. Avoid overfeeding/overfertilizing.",
      evidence: { value: r.tds },
    });
  }

  // Try to auto-resolve immediately if values have returned to optimal bands
  await maybeResolveWater(pId, r);
}

// 2) Mortality (rolling 15-day avg)
import { getMortalityLogs } from "./mortality-service";
export async function detectMortality(pond: PondLite) {
  const logs = await getMortalityLogs(pond.id);
  if (!logs.length) return;

  const today = logs.find((l: any) => {
    const d = new Date(l.date as any);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  if (!today || typeof today.mortalityRate !== "number") return;

  const rate = today.mortalityRate;

  const nowMs = Date.now();
  const windowMs = thresholds.mortality.baselineDays * 24 * 60 * 60 * 1000;
  const cutoff = nowMs - windowMs;

  const windowRates: number[] = logs
    .filter((l: any) => {
      const d = new Date(l.date as any);
      const t = d.getTime();
      return t >= cutoff && t <= nowMs;
    })
    .map((l: any) => (typeof l.mortalityRate === "number" ? Math.max(0, Math.min(100, l.mortalityRate)) : 0));

  const avg15 =
    windowRates.length > 0 ? windowRates.reduce((a: number, b: number) => a + b, 0) / windowRates.length : 0;

  let sev: Severity = "info";
  let suggested = "";
  if (rate >= thresholds.mortality.errorPctDay) {
    sev = "danger";
    suggested =
      "Reduce feed by ~10% today. Check DO at dawn, inspect gills/skin, and do a 10% water exchange. Record findings.";
  } else if (rate >= thresholds.mortality.warnPctDay) {
    sev = "warning";
    suggested =
      "Check dawn DO, observe fish for stress/disease, and note probable cause in the log. Keep feeding normal but watch leftovers.";
  }
  if (sev === "info") return;

  await upsertInsight(pond.id, {
    key: "mortality_today",
    title: sev === "danger" ? "High mortality today" : "Elevated mortality today",
    message: `Today's mortality is ${rate}% (15-day avg ${avg15.toFixed(2)}% from ${windowRates.length} log${
      windowRates.length === 1 ? "" : "s"
    }).`,
    severity: sev,
    category: "mortality",
    suggestedAction: suggested,
    evidence: { today: rate, avg15: Number(avg15.toFixed(2)), samples: windowRates.length },
  });
}

// 3) Predicted vs latest actual ABW — EXACTLY match chart’s stage-based 15-day step model
import { GrowthService, type GrowthHistory } from "./growth-service";

type GrowthStage = { from: number; to: number | null; rate: number }; // g/week
const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1, to: 15, rate: 4.0 },
  { from: 16, to: 30, rate: 13.0 },
  { from: 31, to: 45, rate: 16.5 },
  { from: 46, to: 60, rate: 20.5 },
  { from: 61, to: 75, rate: 21.5 },
  { from: 76, to: 90, rate: 22.0 },
  { from: 91, to: 105, rate: 18.0 },
  { from: 106, to: null, rate: 12.0 },
];
const CADENCE_DAYS = 15;

function stageWeeklyRate(weightG: number): number {
  for (const s of TILAPIA_STAGES) {
    if (s.to === null) {
      if (weightG >= s.from) return s.rate;
    } else if (weightG >= s.from && weightG < s.to) {
      return s.rate;
    }
  }
  return TILAPIA_STAGES[TILAPIA_STAGES.length - 1].rate;
}
function stageRatePerCadence(weightG: number): number {
  return stageWeeklyRate(weightG) * (CADENCE_DAYS / 7);
}

function predictedAtLatestIndexUsingChartModel(
  actualChrono: number[], // P1..PN
  seedForP1: number
): number {
  const n = Math.max(1, actualChrono.length);
  let p = Math.max(1, seedForP1);
  for (let i = 1; i < n; i++) p = p + stageRatePerCadence(p);
  return p;
}

export async function detectGrowthDelta(pond: PondLite) {
  const history: GrowthHistory[] = await GrowthService.getGrowthHistory(pond.id);
  if (history.length < 1) return;

  const chrono = [...history].reverse();
  const latest = chrono[chrono.length - 1];

  let seedForP1 = typeof chrono[0]?.abw === "number" ? chrono[0].abw : 5;
  try {
    const setup = await GrowthService.getGrowthSetup(pond.id, "shared");
    if (seedForP1 == null && setup && typeof setup.currentABW === "number") seedForP1 = setup.currentABW;
  } catch {}
  if (seedForP1 == null) seedForP1 = 5;

  const predicted = predictedAtLatestIndexUsingChartModel(
    chrono.map((h) => (typeof h.abw === "number" ? h.abw : NaN)),
    seedForP1
  );

  const actual = latest.abw;
  if (typeof actual !== "number" || !Number.isFinite(actual)) return;

  const gap = predicted - actual;

  let sev: Severity = "info";
  let title = "Growth on track";
  let suggested = "";

  if (gap > 5) {
    sev = "danger";
    title = "Growth at risk (below model)";
    suggested =
      "Hold feed at current level (don’t add more). Fix water first (DO/Temp/pH), check for disease. Recheck ABW in 7–15 days.";
  } else if (gap > 3) {
    sev = "warning";
    title = "Growth lagging vs model";
    suggested =
      "Increase daily feed by 5–10%, move more feed to cooler hours. Recheck ABW after 15 days.";
  }
  if (sev === "info") return;

  await upsertInsight(pond.id, {
    key: "growth_delta",
    title,
    message: `Actual ABW ${actual.toFixed(2)} g vs predicted ${predicted.toFixed(2)} g (${gap.toFixed(2)} g below).`,
    severity: sev,
    category: "growth",
    suggestedAction: suggested,
    evidence: {
      latest: Number(actual.toFixed(2)),
      predicted: Number(predicted.toFixed(2)),
      gap,
      model: "stage-step-15d",
      seedForP1,
    },
  });
}

// 4) Offline sensors
export async function recordHeartbeat(pondId: string) {
  const ref = doc(db, "devices", pondId);
  await setDoc(ref, { lastSeen: serverTimestamp() }, { merge: true });
  await resolveTodayByKey(pondId, "device_offline");
}

export async function detectOffline(pond: PondLite) {
  const ref = doc(db, "devices", pond.id);
  const snap = await getDoc(ref);
  const last = toDate((snap.data() as any)?.lastSeen);
  if (!last) { await recordHeartbeat(pond.id); return; }
  const minSince = (Date.now() - last.getTime()) / 60000;
  if (minSince > thresholds.device.offlineMin) {
    await upsertInsight(pond.id, {
      key: "device_offline",
      title: "Sensor offline",
      message: `No data for ${minSince.toFixed(0)} min.`,
      severity: "error",
      category: "device",
      suggestedAction:
        "Check power (battery/adapter), antenna & network, and cables. Move device closer to router. Clears when data resumes.",
      evidence: { lastSeenMin: Math.round(minSince) },
    });
  }
}
