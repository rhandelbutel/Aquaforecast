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
 * Build predicted series in 15-day steps that:
 *  1) creates a baseline forecast ignoring actuals;
 *  2) if there is a latest actual at period k, re-forecasts ONLY from k+1 onward
 *     starting from that actual value; earlier predicted points remain as originally forecast.
 */
function buildPredictedSeries(
  actual: Array<number | null>,
  seed: number,                 // starting ABW for Period 1 if no actual[0]
  target: number | null,
  extraPeriodsAhead = 8
) {
  const basePeriods = Math.max(1, actual.length)
  const periods = basePeriods + extraPeriodsAhead
  const pred: number[] = new Array(periods)
  const clamp = (v: number) => (target ? Math.min(target, v) : v)

  // 1) Baseline forecast (15d increments) that ignores all actuals
  pred[0] = clamp(Math.max(1, seed))
  for (let i = 1; i < periods; i++) {
    const prev = pred[i - 1]
    pred[i] = clamp(prev + stageRatePerCadence(prev))
  }

  // 2) Find latest actual and re-forecast ONLY from the next 15-day period onward
  let latestIdx = -1
  for (let i = actual.length - 1; i >= 0; i--) {
    if (typeof actual[i] === "number") {
      latestIdx = i
      break
    }
  }
  if (latestIdx >= 0) {
    let w = actual[latestIdx] as number
    for (let i = latestIdx + 1; i < periods; i++) {
      w = clamp(w + stageRatePerCadence(w))
      pred[i] = w
    }
    // NOTE: we intentionally do NOT overwrite pred[latestIdx]
  }

  return pred
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

  // growth setup
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

  // Predicted ABW series
  const predictedSeries = useMemo(() => {
    const actualOnly = actualSeries.map((a) => a.actual)
    return buildPredictedSeries(actualOnly, seedForP1, targetWeight ?? null, 8)
  }, [actualSeries, seedForP1, targetWeight])

  // Merge for ABW chart
  const chartData = useMemo(() => {
    const maxPts = Math.max(actualSeries.length, predictedSeries.length)
    const rows: { label: string; actual: number | null; predicted: number | null }[] = []
    for (let i = 0; i < maxPts; i++) {
      rows.push({
        label: `Fortnight ${i + 1}`,
        actual: i < actualSeries.length ? actualSeries[i].actual : null,
        predicted: i < predictedSeries.length ? predictedSeries[i] : null,
      })
    }
    return rows
  }, [actualSeries, predictedSeries])

  // ---- Survival Rate Curve data (replaces FCE chart) ----
  const survivalCurveData = useMemo(() => {
    // logs from subscribeMortalityLogs are sorted desc; make chronological
    const chrono = [...mortLogs].sort((a, b) => {
      const ta = a.date instanceof Date ? a.date.getTime() : new Date(a.date as any).getTime()
      const tb = b.date instanceof Date ? b.date.getTime() : new Date(b.date as any).getTime()
      return ta - tb
    })

    const rows: { label: string; survival: number }[] = []
    let cumulativeMortality = 0

    // optional starting point at 100%
    if (chrono.length === 0) {
      rows.push({ label: "Start", survival: 100 })
      return rows
    }

    rows.push({
      label: "Start",
      survival: 100,
    })

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
      {/* Fish Growth Prediction (actual + predicted overlay) */}
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
          {seedForP1 == null ? (
            <div className="text-sm text-gray-500">Add an ABW to see predictions.</div>
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

      {/* Survival Rate Curve (replaces FCE chart, keeps design) */}
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
              <Tooltip
                formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "Survival"]}
              />
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
