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
   Stage-based Nile Tilapia weekly growth model
   -------------------------------------------- */
type GrowthStage = { from: number; to: number | null; rate: number }

// Typical weekly gains by stage (g/week)
const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 20,   rate: 4.5 },
  { from: 20,  to: 100,  rate: 14 },
  { from: 100, to: 300,  rate: 25 },
  { from: 300, to: 600,  rate: 37.5 },
  { from: 600, to: null, rate: 37.5 },
]

function stageRateFor(weightG: number, stages = TILAPIA_STAGES): number {
  for (const s of stages) {
    if (s.to === null) {
      if (weightG >= s.from) return s.rate
    } else if (weightG >= s.from && weightG < s.to) {
      return s.rate
    }
  }
  return stages[stages.length - 1].rate
}

/** Build predicted series that:
 *  1) Creates a baseline forecast ignoring actuals;
 *  2) If there is a latest actual at week k, re-forecasts ONLY from week k+1 onward
 *     starting from that actual value; earlier predicted points remain as originally forecast.
 */
function buildPredictedSeries(
  actual: Array<number | null>,
  seed: number,                 // starting ABW for Week 1 if no actual[0]
  target: number | null,
  extraWeeksAhead = 12
) {
  const baseWeeks = Math.max(1, actual.length)
  const weeks = baseWeeks + extraWeeksAhead
  const pred: number[] = new Array(weeks)
  const clamp = (v: number) => (target ? Math.min(target, v) : v)

  // 1) Baseline forecast that ignores all actuals
  pred[0] = clamp(Math.max(1, seed))
  for (let i = 1; i < weeks; i++) {
    const prev = pred[i - 1]
    pred[i] = clamp(prev + stageRateFor(prev))
  }

  // 2) Find latest actual and re-forecast ONLY from the next week onward
  let latestIdx = -1
  for (let i = actual.length - 1; i >= 0; i--) {
    if (typeof actual[i] === "number") {
      latestIdx = i
      break
    }
  }
  if (latestIdx >= 0) {
    let w = actual[latestIdx] as number
    for (let i = latestIdx + 1; i < weeks; i++) {
      w = clamp(w + stageRateFor(w))
      pred[i] = w
    }
    // NOTE: we intentionally do NOT overwrite pred[latestIdx],
    // so earlier predicted points stay as originally forecast.
  }

  return pred
}

/** Synthetic efficiency data (unchanged) */
const generateFeedEfficiencyData = (pond: PondData) => {
  const base = pond.feedingFrequency >= 3 ? 1.3 : pond.feedingFrequency >= 2 ? 1.2 : 1.0
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
    day,
    efficiency: base + (Math.random() - 0.5) * 0.2,
  }))
}

interface GrowthChartsProps {
  pond: PondData
}

export function GrowthCharts({ pond }: GrowthChartsProps) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id

  // survival
  const [survivalPct, setSurvivalPct] = useState<number | null>(null)
  const initialStocked = pond.fishCount || 0

  // growth setup
  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)

  // history (actual) — chronological: Week 1 … Week N
  const [history, setHistory] = useState<GrowthHistory[]>([])

  useEffect(() => {
    if (!sharedPondId) return

    const unsubMort = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) => {
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

  // Actual series for chart
  const actualSeries = useMemo(
    () =>
      history.map((h, idx) => ({
        label: `Week ${idx + 1}`,
        actual: typeof h.abw === "number" ? h.abw : null,
      })),
    [history]
  )

  // Seed for Week 1 if no actual[0] exists
  const seedForWeek1 =
    (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ??
    currentABW ??
    5

  // Predicted series: baseline + rebase after latest actual
  const predictedSeries = useMemo(() => {
    const actualOnly = actualSeries.map((a) => a.actual)
    return buildPredictedSeries(actualOnly, seedForWeek1, targetWeight ?? null, 12)
  }, [actualSeries, seedForWeek1, targetWeight])

  // Merge for Recharts
  const chartData = useMemo(() => {
    const maxWeeks = Math.max(actualSeries.length, predictedSeries.length)
    const rows: { label: string; actual: number | null; predicted: number | null }[] = []
    for (let i = 0; i < maxWeeks; i++) {
      rows.push({
        label: `Week ${i + 1}`,
        actual: i < actualSeries.length ? actualSeries[i].actual : null,
        predicted: i < predictedSeries.length ? predictedSeries[i] : null,
      })
    }
    return rows
  }, [actualSeries, predictedSeries])

  const feedEfficiencyData = generateFeedEfficiencyData(pond)

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
          {seedForWeek1 == null ? (
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
                {/* Predicted dotted line — stays independent before the latest actual,
                    and only re-bases from the week AFTER the latest actual. */}
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

      {/* Feed Conversion Efficiency (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Feed Conversion Efficiency - {pond.name}</CardTitle>
          <p className="text-sm text-gray-600">Current feeding: {pond.feedingFrequency ?? 0}x daily</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={generateFeedEfficiencyData(pond)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="efficiency" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
