// lib/dash-insights-service.ts
"use client";

import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

/** --- Types (scoped to dashboard only) --- */
export type DashSeverity = "info" | "warning" | "danger" | "error";
export type DashCategory = "water" | "feeding" | "growth" | "device";

export type DashInsight = {
  id?: string;
  pondId: string;
  key: string;                // e.g., "dash_temp_low", "dash_feeding_over"
  title: string;
  message: string;
  severity: DashSeverity;
  category: DashCategory;
  evidence?: Record<string, any>;
  suggestedAction?: string;
  createdAt: number;          // ms
  status: "active" | "snoozed" | "resolved";
  autoResolveAt?: number;     // ms (ephemeral)
};

export type LiveReading = {
  ts: number;
  temp: number;  // °C
  ph: number;
  tds: number;   // ppm
  do: number;    // mg/L
};

export type PondLite = { id: string; name?: string; fishSpecies?: string };

/** Dashboard-only collection so analytics isn’t affected */
const itemsCol = (pondId: string) =>
  collection(db, "dash_insights", pondId, "items");
const itemRef = (pondId: string, id: string) =>
  doc(db, "dash_insights", pondId, "items", id);

/** Upsert by stable key so each “state” is one document */
async function upsertDash(
  pondId: string,
  id: string,
  draft: Omit<DashInsight, "id" | "createdAt" | "status" | "pondId">
) {
  const ref = itemRef(pondId, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const cur = snap.data() as DashInsight;
    if (cur.status === "active") return; // already active → no spam writes
  }
  await setDoc(
    ref,
    {
      ...draft,
      pondId,
      createdAt: Date.now(),
      status: "active",
    },
    { merge: true }
  );
}

export function subscribeDashInsights(
  pondId: string,
  cb: (items: DashInsight[]) => void
): Unsubscribe {
  const qy = query(itemsCol(pondId), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (qs) => {
    const arr: DashInsight[] = [];
    qs.forEach((d) => arr.push({ id: d.id, ...(d.data() as DashInsight) }));
    cb(arr);
  });
}

/** Lightweight React hook wrapper */
export function useDashboardInsights(pondId?: string | null) {
  const [list, setList] = useState<DashInsight[]>([]);
  useEffect(() => {
    if (!pondId) { setList([]); return; }
    const unsub = subscribeDashInsights(pondId, (items) => {
      const now = Date.now();
      const active = items.filter((i) => (i.autoResolveAt ?? Infinity) > now && i.status === "active");
      const expired = items.filter((i) => (i.autoResolveAt ?? Infinity) <= now && i.status === "active");
      setList(active);
      expired.forEach((i) => i.id && resolveDashInsight(pondId, i.id).catch(() => {}));
    });
    return () => unsub();
  }, [pondId]);
  return list;
}

export async function resolveDashInsight(pondId: string, id: string) {
  await updateDoc(itemRef(pondId, id), { status: "resolved" });
}

/** Auto-expire helper (kept for API parity) */
export async function resolveExpiredEphemerals(_pondId: string) {
  return Date.now();
}

/* -----------------------------
   Sensor rule set (dashboard)
   Ranges:
   DO:    3–5 mg/L
   pH:    6.5–9.5
   Temp:  29–31 °C
   TDS:   100–400 ppm
   - Auto-resolve when back to optimal
   - Show "recovered" info when transitioning to normal
------------------------------ */

const OPT = {
  DO_MIN: 3,
  DO_MAX: 5,
  PH_MIN: 6.5,
  PH_MAX: 9.5,
  TEMP_MIN: 29,
  TEMP_MAX: 31,
  TDS_MIN: 100,
  TDS_MAX: 400,
};

// keep last state per pond+metric to emit a one-time "recovered" note
const lastState: Record<string, "low" | "high" | "ok" | undefined> = {};
const K = (pondId: string, m: string) => `${pondId}:${m}`;

function within(x: number, min: number, max: number) {
  return x >= min && x <= max;
}

function eff_temp_low() {
  return "Tilapia are tropical; in cooler water their metabolism slows, reducing appetite and growth.";
}
function eff_temp_high() {
  return "Warmer water holds less oxygen; fish stress rises and feed conversion worsens.";
}
function eff_do_low() {
  return "Low DO causes stress and can lead to mortalities; fish feed poorly and may surface-gasp.";
}
function eff_do_high() {
  return "Very high DO usually indicates heavy aeration or algae peak; watch pH swings and nighttime drops.";
}
function eff_ph_low() {
  return "Low pH irritates gills and reduces feed intake; prolonged exposure weakens immunity.";
}
function eff_ph_high() {
  return "High pH increases ammonia toxicity risk; fish become stressed and growth slows.";
}
function eff_tds_low() {
  return "Very low TDS can make water unstable (pH swings); beneficial minerals may be lacking.";
}
function eff_tds_high() {
  return "High TDS often tracks waste buildup; can stress fish and depress DO during decomposition.";
}

/** Resolve an array of insight IDs (ignore errors) */
async function resolveIds(pondId: string, ids: string[]) {
  await Promise.all(
    ids.map((id) => updateDoc(itemRef(pondId, id), { status: "resolved" }).catch(() => {}))
  );
}

/** Resolve both low & high for a metric */
async function resolveMetric(pondId: string, metric: "temp" | "ph" | "do" | "tds") {
  const ids = {
    temp: ["dash_temp_low", "dash_temp_high"],
    ph:   ["dash_ph_low",   "dash_ph_high"],
    do:   ["dash_do_low",   "dash_do_high"],
    tds:  ["dash_tds_low",  "dash_tds_high"],
  }[metric];
  await resolveIds(pondId, ids);
}

/** Resolve ALL water insights (used when device/sensor goes OFFLINE) */
export async function resolveAllWaterInsightsForOffline(pondId: string) {
  const ids = [
    // Temperature
    "dash_temp_low", "dash_temp_high", "dash_temp_ok",
    // pH
    "dash_ph_low", "dash_ph_high", "dash_ph_ok",
    // DO
    "dash_do_low", "dash_do_high", "dash_do_ok",
    // TDS
    "dash_tds_low", "dash_tds_high", "dash_tds_ok",
  ];
  await resolveIds(pondId, ids);
}

export async function detectRealtimeFindingsDash(pond: PondLite, r: LiveReading) {
  const pid = pond.id;

  // === TEMP ===
  const tempState = within(r.temp, OPT.TEMP_MIN, OPT.TEMP_MAX) ? "ok" : r.temp < OPT.TEMP_MIN ? "low" : "high";
  if (tempState === "low") {
    await upsertDash(pid, "dash_temp_low", {
      key: "dash_temp_low",
      title: "Temperature below optimal (29–31 °C)",
      message: `Water is ${r.temp.toFixed(1)} °C. ${eff_temp_low()}`,
      severity: "warning",
      category: "water",
      suggestedAction: "Feed during warmest hours; consider partial water exchange or shading to stabilize.",
      evidence: { temp: r.temp },
    });
    await resolveIds(pid, ["dash_temp_high"]); // clear opposite
  } else if (tempState === "high") {
    await upsertDash(pid, "dash_temp_high", {
      key: "dash_temp_high",
      title: "Temperature above optimal (29–31 °C)",
      message: `Water is ${r.temp.toFixed(1)} °C. ${eff_temp_high()}`,
      severity: "warning",
      category: "water",
      suggestedAction: "Shift feed to cooler hours; add shade/aeration; small cool water top-ups if available.",
      evidence: { temp: r.temp },
    });
    await resolveIds(pid, ["dash_temp_low"]); // clear opposite
  } else {
    if (lastState[K(pid, "temp")] && lastState[K(pid, "temp")] !== "ok") {
      await upsertDash(pid, "dash_temp_ok", {
        key: "dash_temp_ok",
        title: "Temperature back to optimal",
        message: "Water temperature returned to the 29–31 °C band.",
        severity: "info",
        category: "water",
        suggestedAction: "Keep feeding in cooler windows to maintain stability.",
        autoResolveAt: Date.now() + 5 * 60_000,
      });
    }
    await resolveMetric(pid, "temp"); // clears low & high
  }
  lastState[K(pid, "temp")] = tempState;

  // === DO ===
  const doState = within(r.do, OPT.DO_MIN, OPT.DO_MAX) ? "ok" : r.do < OPT.DO_MIN ? "low" : "high";
  if (doState === "low") {
    await upsertDash(pid, "dash_do_low", {
      key: "dash_do_low",
      title: "DO below optimal (3–5 mg/L)",
      message: `Dissolved Oxygen is ${r.do.toFixed(1)} mg/L. ${eff_do_low()}`,
      severity: "danger",
      category: "water",
      suggestedAction: "Run aeration; avoid heavy feeding; recheck near dawn.",
      evidence: { do: r.do },
    });
    await resolveIds(pid, ["dash_do_high"]);
  } else if (doState === "high") {
    await upsertDash(pid, "dash_do_high", {
      key: "dash_do_high",
      title: "DO above optimal (3–5 mg/L)",
      message: `Dissolved Oxygen is ${r.do.toFixed(1)} mg/L. ${eff_do_high()}`,
      severity: "info",
      category: "water",
      suggestedAction: "No action needed; monitor for nighttime DO drops.",
      evidence: { do: r.do },
    });
    await resolveIds(pid, ["dash_do_low"]);
  } else {
    if (lastState[K(pid, "do")] && lastState[K(pid, "do")] !== "ok") {
      await upsertDash(pid, "dash_do_ok", {
        key: "dash_do_ok",
        title: "DO back to optimal",
        message: "Dissolved Oxygen returned to the 3–5 mg/L band.",
        severity: "info",
        category: "water",
        autoResolveAt: Date.now() + 5 * 60_000,
      });
    }
    await resolveMetric(pid, "do");
  }
  lastState[K(pid, "do")] = doState;

  // === pH ===
  const phState = within(r.ph, OPT.PH_MIN, OPT.PH_MAX) ? "ok" : r.ph < OPT.PH_MIN ? "low" : "high";
  if (phState === "low") {
    await upsertDash(pid, "dash_ph_low", {
      key: "dash_ph_low",
      title: "pH below optimal (6.5–9.5)",
      message: `pH is ${r.ph.toFixed(2)}. ${eff_ph_low()}`,
      severity: "warning",
      category: "water",
      suggestedAction: "Small water exchange; avoid harsh chemicals; verify meter calibration.",
      evidence: { ph: r.ph },
    });
    await resolveIds(pid, ["dash_ph_high"]);
  } else if (phState === "high") {
    await upsertDash(pid, "dash_ph_high", {
      key: "dash_ph_high",
      title: "pH above optimal (6.5–9.5)",
      message: `pH is ${r.ph.toFixed(2)}. ${eff_ph_high()}`,
      severity: "warning",
      category: "water",
      suggestedAction: "Partial water exchange; reduce algae drivers; recheck midday.",
      evidence: { ph: r.ph },
    });
    await resolveIds(pid, ["dash_ph_low"]);
  } else {
    if (lastState[K(pid, "ph")] && lastState[K(pid, "ph")] !== "ok") {
      await upsertDash(pid, "dash_ph_ok", {
        key: "dash_ph_ok",
        title: "pH back to optimal",
        message: "pH returned to the 6.5–9.5 band.",
        severity: "info",
        category: "water",
        autoResolveAt: Date.now() + 5 * 60_000,
      });
    }
    await resolveMetric(pid, "ph");
  }
  lastState[K(pid, "ph")] = phState;

  // === TDS ===
  const tdsState = within(r.tds, OPT.TDS_MIN, OPT.TDS_MAX) ? "ok" : r.tds < OPT.TDS_MIN ? "low" : "high";
  if (tdsState === "low") {
    await upsertDash(pid, "dash_tds_low", {
      key: "dash_tds_low",
      title: "TDS below optimal (100–400 ppm)",
      message: `TDS is ${r.tds.toFixed(0)} ppm. ${eff_tds_low()}`,
      severity: "info",
      category: "water",
      suggestedAction: "Check alkalinity/mineral levels; small water exchange if unstable pH observed.",
      evidence: { tds: r.tds },
    });
    await resolveIds(pid, ["dash_tds_high"]);
  } else if (tdsState === "high") {
    await upsertDash(pid, "dash_tds_high", {
      key: "dash_tds_high",
      title: "TDS above optimal (100–400 ppm)",
      message: `TDS is ${r.tds.toFixed(0)} ppm. ${eff_tds_high()}`,
      severity: "warning",
      category: "water",
      suggestedAction: "Siphon waste, partial water exchange; avoid overfeeding.",
      evidence: { tds: r.tds },
    });
    await resolveIds(pid, ["dash_tds_low"]);
  } else {
    if (lastState[K(pid, "tds")] && lastState[K(pid, "tds")] !== "ok") {
      await upsertDash(pid, "dash_tds_ok", {
        key: "dash_tds_ok",
        title: "TDS back to optimal",
        message: "TDS returned to the 100–400 ppm band.",
        severity: "info",
        category: "water",
        autoResolveAt: Date.now() + 5 * 60_000,
      });
    }
    await resolveMetric(pid, "tds");
  }
  lastState[K(pid, "tds")] = tdsState;
}

/* --------- Feeding deviation (5-minute ephemeral) ---------- */
export async function notifyFeedingDeviationDash(
  pondId: string,
  _pondName: string,
  givenG: number,
  suggestedG: number | null
) {
  if (suggestedG == null || suggestedG <= 0) return;
  const ratio = givenG / suggestedG;
  const id =
    ratio < 0.9 ? "dash_feeding_under" : ratio > 1.1 ? "dash_feeding_over" : "dash_feeding_ok";
  if (id === "dash_feeding_ok") return;

  const under = ratio < 0.9;
  await upsertDash(pondId, id, {
    key: id,
    title: under ? "Feeding below suggestion" : "Feeding above suggestion",
    message: under
      ? `You logged ${givenG} g vs suggested ${suggestedG} g. Persistent underfeeding may slow growth and increase aggression.`
      : `You logged ${givenG} g vs suggested ${suggestedG} g. Overfeeding can degrade water quality and worsen FCR.`,
    severity: under ? "warning" : "warning",
    category: "feeding",
    suggestedAction: under
      ? "Consider increasing ration toward suggestion if water quality is stable."
      : "Reduce uneaten feed; monitor ammonia/DO and adjust ration.",
    evidence: { givenG, suggestedG, ratio },
    autoResolveAt: Date.now() + 5 * 60_000,
  });
}

/* --------- ABW logged tip (5-minute ephemeral) ---------- */
const CADENCE_DAYS = 15;
const STAGES = [
  { from: 1, to: 15, rate: 4.0 },
  { from: 16, to: 30, rate: 13.0 },
  { from: 31, to: 45, rate: 16.5 },
  { from: 46, to: 60, rate: 20.5 },
  { from: 61, to: 75, rate: 21.5 },
  { from: 76, to: 90, rate: 22.0 },
  { from: 91, to: 105, rate: 18.0 },
  { from: 106, to: null as number | null, rate: 12.0 },
];
function stageWeeklyRate(w: number) {
  for (const s of STAGES) {
    if (s.to == null) { if (w >= s.from) return s.rate; }
    else if (w >= s.from && w < s.to) return s.rate;
  }
  return STAGES[STAGES.length - 1].rate;
}
function stageRatePer15d(w: number) { return stageWeeklyRate(w) * (CADENCE_DAYS / 7); }

export async function notifyABWLoggedDash(
  pondId: string,
  currentABW: number,
  targetWeight?: number | null
) {
  let daysLeft: number | null = null;
  if (typeof targetWeight === "number" && targetWeight > currentABW) {
    // simulate forward to crossing day
    let cur = Math.max(currentABW, 1);
    let days = 0;
    for (let i = 0; i < 200; i++) {
      const gain15 = stageRatePer15d(cur);
      const next = cur + gain15;
      if (next >= targetWeight) {
        const daily = gain15 / CADENCE_DAYS;
        const inside = Math.ceil((targetWeight - cur) / daily);
        daysLeft = days + inside;
        break;
      }
      cur = next;
      days += CADENCE_DAYS;
    }
  }

  const title = "ABW recorded";
  const msg =
    daysLeft == null
      ? `Current ABW set to ${currentABW} g. Set a target to see days remaining.`
      : `Current ABW ${currentABW} g. About ${daysLeft} day${daysLeft === 1 ? "" : "s"} to reach target.`;

  await upsertDash(pondId, "dash_abw_logged", {
    key: "dash_abw_logged",
    title,
    message: msg,
    severity: "info",
    category: "growth",
    suggestedAction: "Keep consistent feeding and monitor morning DO to maintain growth.",
    evidence: { currentABW, targetWeight, daysLeft },
    autoResolveAt: Date.now() + 5 * 60_000,
  });
}

/* --------- Aliases for back-compat --------- */
export const pushFeedingVarianceInsight = notifyFeedingDeviationDash;
export const pushABWLoggedInsight = notifyABWLoggedDash;
