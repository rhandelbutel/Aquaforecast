// components/analytics/growth-charts.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import type { PondData } from "@/lib/pond-service"
import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"
import { GrowthService, type GrowthHistory } from "@/lib/growth-service"

/* --------------------------------------------
   Stage-based Nile Tilapia growth model
   -------------------------------------------- */
type GrowthStage = { from: number; to: number | null; rate: number } // rate = g/week

// Typical weekly gains by stage (g/week)
const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 20,   rate: 4.5 },
  { from: 20,  to: 100,  rate: 14 },
  { from: 100, to: 300,  rate: 25 },
  { from: 300, to: 600,  rate: 37.5 },
  { from: 600, to: null, rate: 37.5 },
]

// ---- Cadence: every 15 days ----
const CADENCE_DAYS = 15

function stageWeeklyRate(weightG: number, stages = TILAPIA_STAGES): number {
  for (const s of stages) {
    if (s.to === null) {
      if (weightG >= s.from) return s.rate
    } else if (weightG >= s.from && weightG < s.to) {
      return s.rate
    }
  }
  return stages[stages.length - 1].rate
}

function stageRatePerCadence(weightG: number): number {
  // convert weekly rate to per-15-days
  return stageWeeklyRate(weightG) * (CADENCE_DAYS / 7)
}

/**
 * Build a predicted series that dynamically runs forward in 15-day steps
 * UNTIL the target is reached, so the last point on the chart is the
 * first fortnight where target is achieved.
 *
 * Rules:
 * - If target is undefined/null -> return a fixed horizon (base + extraAhead).
 * - If any ACTUAL already >= target -> cut at that actual index (no future forecast).
 * - Otherwise simulate forward from latest actual (or seed) until >= target.
 */
function buildPredictedSeriesDynamic(
  actual: Array<number | null>,
  seedForP1: number,
  target: number | null | undefined,
  extraAheadIfNoTarget = 8,
  safetyCap = 200 // just in case target is very large
): number[] {
  const baseLen = Math.max(1, actual.length)

  // Helper to forecast next value
  const nextVal = (prev: number) => prev + stageRatePerCadence(prev)

  // If target is not provided: produce baseline forecast with a fixed horizon
  if (target == null || !Number.isFinite(target)) {
    const len = baseLen + Math.max(0, extraAheadIfNoTarget)
    const out = new Array<number>(len)

    // seed for period 1
    out[0] = Math.max(1, seedForP1)

    // fill baseline
    for (let i = 1; i < len; i++) {
      const prev = out[i - 1]
      out[i] = nextVal(prev)
    }

    // re-forecast forward from latest actual if any, without shortening
    let latestIdx = -1
    for (let i = actual.length - 1; i >= 0; i--) if (typeof actual[i] === "number") { latestIdx = i; break }
    if (latestIdx >= 0) {
      let w = actual[latestIdx] as number
      for (let i = latestIdx + 1; i < len; i++) {
        w = nextVal(w)
        out[i] = w
      }
      // keep out[latestIdx] as baseline so the visual line starts AFTER the actual dot
    }

    return out
  }

  // If an ACTUAL already hit/exceeded the target, stop the chart there
  const firstActualHit = actual.findIndex((v) => typeof v === "number" && (v as number) >= target)
  if (firstActualHit >= 0) {
    // chart length is just up to that period (inclusive)
    // For visual clarity, we still return a predicted array up to that length,
    // but we won’t plot beyond that period.
    const len = firstActualHit + 1
    const out = new Array<number>(len)
    // baseline seed
    out[0] = Math.max(1, seedForP1)
    for (let i = 1; i < len; i++) out[i] = nextVal(out[i - 1])
    // we do not overwrite with actual values here; actuals are plotted separately
    // The x-axis count will be trimmed by the caller.
    return out
  }

  // Otherwise: simulate until the predicted reaches target.
  // Start from latest actual (if exists) or the seed.
  let latestIdx = -1
  for (let i = actual.length - 1; i >= 0; i--) if (typeof actual[i] === "number") { latestIdx = i; break }

  const out: number[] = []
  // Ensure array covers at least existing actual periods
  const startLen = Math.max(1, baseLen)
  out.length = startLen
  // seed baseline up to current length
  out[0] = Math.max(1, seedForP1)
  for (let i = 1; i < startLen; i++) out[i] = nextVal(out[i - 1])

  // If there is a latest actual, re-forecast forward from there
  let w = latestIdx >= 0 ? (actual[latestIdx] as number) : out[startLen - 1]
  let i = Math.max(latestIdx + 1, startLen)

  // Grow forward until hitting the target (or safety cap)
  let steps = 0
  while (steps < safetyCap && w < target) {
    w = nextVal(w)
    out.push(w)
    steps++
  }

  // Cap the final value EXACTLY at target for the last point
  if (out.length > 0) {
    if (out[out.length - 1] >= target) out[out.length - 1] = target
  } else {
    // edge: no out? (shouldn’t happen) fall back to one point at target
    out.push(target)
  }

  return out
}

interface GrowthChartsProps {
  pond: PondData
}

export function GrowthCharts({ pond }: GrowthChartsProps) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id

  // survival (current & series)
  const [survivalPct, setSurvivalPct] = useState<number | null>(null)
  const [mortLogs, setMortLogs] = useState<MortalityLog[]>([])
  const initialStocked = pond.fishCount || 0

  // growth setup (kept; doesn’t affect empty-state rule)
  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)

  // history (actual) — chronological 15-day periods: P1 … PN
  const [history, setHistory] = useState<GrowthHistory[]>([])

  useEffect(() => {
    if (!sharedPondId) return

    const unsubMort = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) => {
      setMortLogs(logs)
      setSurvivalPct(computeSurvivalRateFromLogs(logs))
    })

    const unsubSetup = GrowthService.subscribeGrowthSetup(sharedPondId, (setup) => {
      if (setup) {
        setCurrentABW(setup.currentABW)
        setTargetWeight(typeof setup.targetWeight === "number" ? setup.targetWeight : null)
      } else {
        setCurrentABW(null)
        setTargetWeight(null)
      }
    })

    const unsubHist = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
      // service returns newest-first; reverse to chronological
      setHistory([...items].reverse())
    })

    return () => {
      unsubMort()
      unsubSetup()
      unsubHist()
    }
  }, [sharedPondId])

  const hasHistory = history.length > 0

  // Estimated alive = survival% * initial
  const estimatedAlive = useMemo(() => {
    if (typeof survivalPct === "number") {
      return Math.max(0, Math.round((survivalPct / 100) * initialStocked))
    }
    return initialStocked
  }, [survivalPct, initialStocked])

  // Actual series for ABW chart
  const actualSeries = useMemo(
    () =>
      history.map((h, idx) => ({
        label: `Fortnight ${idx + 1}`,
        actual: typeof h.abw === "number" ? h.abw : null,
      })),
    [history]
  )

  // Seed for P1 if no actual[0] exists
  const seedForP1 =
    (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ??
    currentABW ??
    5

  // Predicted ABW series (dynamic horizon)
  const predictedSeries = useMemo(() => {
    if (!hasHistory) return []
    const actualOnly = actualSeries.map((a) => a.actual)
    return buildPredictedSeriesDynamic(actualOnly, seedForP1, targetWeight, 8)
  }, [hasHistory, actualSeries, seedForP1, targetWeight])

  // Decide the final number of fortnights to render:
  // - If target exists & was reached by prediction, cut at that last predicted point.
  // - If an actual already >= target, cut at that actual period.
  // - Else, render max of actual vs predicted arrays (fallback).
  const chartData = useMemo(() => {
    if (!hasHistory) return []

    // If target provided, find first period where either:
    //  A) actual >= target (stop there), or
    //  B) predicted (dynamic) last index — already capped to target.
    let endLen: number | null = null

    if (targetWeight != null && Number.isFinite(targetWeight)) {
      const firstActualHit = actualSeries.findIndex((p) => (p.actual ?? -Infinity) >= (targetWeight as number))
      if (firstActualHit >= 0) {
        endLen = firstActualHit + 1
      } else {
        // predictedSeriesDynamic already ended at target — so render its full length
        endLen = Math.max(actualSeries.length, predictedSeries.length)
      }
    }

    const finalLen = endLen ?? Math.max(actualSeries.length, predictedSeries.length)
    const rows: { label: string; actual: number | null; predicted: number | null }[] = []

    for (let i = 0; i < finalLen; i++) {
      rows.push({
        label: `Fortnight ${i + 1}`,
        actual: i < actualSeries.length ? actualSeries[i].actual : null,
        predicted: i < predictedSeries.length ? predictedSeries[i] : null,
      })
    }
    return rows
  }, [hasHistory, actualSeries, predictedSeries, targetWeight])

  // ---- Survival Rate Curve data (unchanged) ----
  const survivalCurveData = useMemo(() => {
    const chrono = [...mortLogs].sort((a, b) => {
      const ta = a.date instanceof Date ? a.date.getTime() : new Date(a.date as any).getTime()
      const tb = b.date instanceof Date ? b.date.getTime() : new Date(b.date as any).getTime()
      return ta - tb
    })

    const rows: { label: string; survival: number }[] = []
    let cumulativeMortality = 0

    if (chrono.length === 0) {
      rows.push({ label: "Start", survival: 100 })
      return rows
    }

    rows.push({ label: "Start", survival: 100 })

    for (const log of chrono) {
      const add = typeof log.mortalityRate === "number" ? Math.max(0, Math.min(100, log.mortalityRate)) : 0
      cumulativeMortality = Math.min(100, cumulativeMortality + add)
      const survival = Math.max(0, 100 - cumulativeMortality)
      const d = log.date instanceof Date ? log.date : new Date(log.date as any)
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      rows.push({ label, survival })
    }

    return rows
  }, [mortLogs])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Fish Growth Prediction (blank if no history) */}
      <Card>
        <CardHeader>
          <CardTitle>Fish Growth Prediction - {pond.name}</CardTitle>
          <p className="text-sm text-gray-600">
            {pond.fishSpecies ?? "Tilapia"} •{" "}
            <span className="font-semibold">
              {estimatedAlive.toLocaleString()} fish alive
              {typeof survivalPct === "number" ? ` (${survivalPct.toFixed(1)}%)` : ""}
            </span>{" "}
            • Fed {pond.feedingFrequency ?? 0}x daily
          </p>
        </CardHeader>
        <CardContent>
          {!hasHistory ? (
            <div className="text-sm text-gray-500">
              No growth measurements recorded yet. Add your first ABW in <b>Growth Setup</b> to see predictions.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip
                  formatter={(value: any, name) => [
                    typeof value === "number" ? `${value.toFixed(1)} g` : value,
                    name === "actual" ? "Actual ABW" : "Predicted ABW",
                  ]}
                />
                {/* Actual line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#0891b2"
                  strokeWidth={2}
                  name="Actual ABW"
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                {/* Predicted dotted line */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#059669"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Predicted ABW"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Survival Rate Curve */}
      <Card>
        <CardHeader>
          <CardTitle>Survival Rate Curve - {pond.name}</CardTitle>
          <p className="text-sm text-gray-600">
            Cumulative survival over time (based on recorded mortality %)
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={survivalCurveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "Survival"]} />
              <Area
                type="monotone"
                dataKey="survival"
                stroke="#2563eb"
                fill="#2563eb"
                fillOpacity={0.3}
                name="Survival %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
