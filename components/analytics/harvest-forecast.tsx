// components/analytics/harvest-forecast.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Fish } from "lucide-react"
import type { PondData } from "@/lib/pond-service"

import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"
import { GrowthService, type GrowthHistory, type GrowthSetup } from "@/lib/growth-service"

/* -------------------------
   Tilapia growth (weekly)
   ------------------------- */
type GrowthStage = { from: number; to: number | null; rate: number } // g/week
const STAGES: GrowthStage[] = [
  { from: 1,   to: 20,   rate: 4.5 },
  { from: 20,  to: 100,  rate: 14 },
  { from: 100, to: 300,  rate: 25 },
  { from: 300, to: 600,  rate: 37.5 },
  { from: 600, to: null, rate: 37.5 },
]

// We forecast in fortnights (15 days), to match your chart
const CADENCE_DAYS = 15

const weeklyRateFor = (w: number, stages = STAGES) => {
  for (const s of stages) {
    if (s.to === null ? w >= s.from : w >= s.from && w < s.to) return s.rate
  }
  return stages[stages.length - 1].rate
}
const fortnightGainFor = (w: number) => weeklyRateFor(w) * (CADENCE_DAYS / 7)

/** Build a 15-day predicted series. We:
 *  1) create a baseline forecast ignoring actuals;
 *  2) find the latest actual in `actual`, then re-forecast only from the next slot onward,
 *     keeping earlier predicted points intact (so differences vs. actual are visible).
 */
function buildPredictedSeries(
  actual: Array<number | null>,
  seedForP1: number,
  targetWeight: number | null,
  extraPeriods = 8
) {
  const periods = Math.max(1, actual.length) + extraPeriods
  const clamp = (v: number) => (targetWeight ? Math.min(targetWeight, v) : v)
  const pred = new Array<number>(periods)

  pred[0] = clamp(Math.max(1, seedForP1))
  for (let i = 1; i < periods; i++) {
    const prev = pred[i - 1]
    pred[i] = clamp(prev + fortnightGainFor(prev))
  }

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
      w = clamp(w + fortnightGainFor(w))
      pred[i] = w
    }
  }

  return pred
}

/* -------------------------
   UI helpers (same API you had)
   ------------------------- */
const getStatusColor = (status: string) => {
  switch (status) {
    case "ready-soon": return "bg-green-100 text-green-800"
    case "on-track":   return "bg-blue-100 text-blue-800"
    case "delayed":    return "bg-yellow-100 text-yellow-800"
    default:           return "bg-gray-100 text-gray-800"
  }
}
const getStatusText = (status: string) => {
  switch (status) {
    case "ready-soon": return "Ready Soon"
    case "on-track":   return "On Track"
    case "delayed":    return "Delayed"
    default:           return "Unknown"
  }
}

/* -------------------------
   Component
   ------------------------- */
interface HarvestForecastProps {
  pond: PondData
}

export function HarvestForecast({ pond }: HarvestForecastProps) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id

  const [setup, setSetup] = useState<GrowthSetup | null>(null)
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [survivalPct, setSurvivalPct] = useState<number | null>(null)

  // Live growth setup + history + survival
  useEffect(() => {
    if (!sharedPondId) return
    const unsubSetup = GrowthService.subscribeGrowthSetup(sharedPondId, (s) => setSetup(s))
    const unsubHist  = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
      // service returns newest-first; flip to chronological
      setHistory([...items].reverse())
    })
    const unsubMort  = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) =>
      setSurvivalPct(computeSurvivalRateFromLogs(logs))
    )
    return () => { unsubSetup(); unsubHist(); unsubMort() }
  }, [sharedPondId])

  const currentABW   = setup?.currentABW ?? null
  const targetWeight = typeof setup?.targetWeight === "number" ? setup!.targetWeight : null
  const lastABWDate: Date | null = (() => {
    const v = setup?.lastABWUpdate as any
    if (!v) return null
    if (v instanceof Date) return v
    if (typeof v?.toDate === "function") try { return v.toDate() } catch { return null }
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000)
    const d = new Date(v); return isNaN(d.getTime()) ? null : d
  })()

  // readiness
  const readiness = useMemo(() => {
    if (!currentABW || !targetWeight || targetWeight <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((currentABW / targetWeight) * 100)))
  }, [currentABW, targetWeight])

  // survivors & expected yield (kg) at target
  const initialStocked = pond.fishCount || 0
  const computedSurvival = survivalPct ?? 100
  const survivorsAtHarvest = Math.max(0, Math.round(initialStocked * (computedSurvival / 100)))
  const expectedYieldKg = useMemo(() => {
    if (!targetWeight) return null
    return (targetWeight * survivorsAtHarvest) / 1000
  }, [survivorsAtHarvest, targetWeight])

  // Build fortnight forecast like the chart, then convert the index where target is met to days.
  const harvestInfo = useMemo(() => {
    if (!targetWeight || targetWeight <= 0) return { date: null as Date | null, daysLeft: null as number | null }
    const actuals = history.map((h) => (typeof h.abw === "number" ? h.abw : null))
    const seed =
      (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ??
      currentABW ?? 5

    const pred = buildPredictedSeries(actuals, seed, targetWeight, 10)

    // current position = latest recorded period (if any), otherwise start at 0
    const nowIdx = Math.max(0, actuals.length - 1)
    let hitIdx = nowIdx
    while (hitIdx < pred.length && pred[hitIdx] < targetWeight) hitIdx++

    const days = Math.max(0, (hitIdx - nowIdx) * CADENCE_DAYS)
    const date = new Date()
    date.setDate(date.getDate() + days)
    return { date, daysLeft: days }
  }, [history, currentABW, targetWeight])

  // status pill: delayed if ABW update is older than cadence
  const daysSince = (d?: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : Infinity)
  const lateABW = daysSince(lastABWDate) > CADENCE_DAYS + 1
  const status = (() => {
    if (!currentABW || !targetWeight) return "delayed"
    if (lateABW) return "delayed"
    if (readiness >= 90) return "ready-soon"
    return "on-track"
  })()

  // formatted
  const estimatedDateStr =
    harvestInfo.date ? harvestInfo.date.toISOString().split("T")[0] : "—"

  const readinessPct = readiness
  const yieldText = expectedYieldKg != null ? `${expectedYieldKg.toFixed(0)} kg` : "—"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-cyan-600" />
          Harvest Forecast - {pond.name}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="max-w-md">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{pond.name}</h3>
              <Badge className={getStatusColor(status)}>
                {getStatusText(status)}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Readiness</span>
                <span className="font-medium">{readinessPct}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-cyan-600 h-2 rounded-full"
                  style={{ width: `${readinessPct}%` }}
                />
              </div>

              <div className="flex items-center text-sm text-gray-600 mt-3">
                <Calendar className="h-4 w-4 mr-1" />
                {estimatedDateStr}
                {typeof harvestInfo.daysLeft === "number" ? (
                  <span className="ml-2 text-gray-500">• {harvestInfo.daysLeft}d left</span>
                ) : null}
              </div>

              <div className="flex items-center text-sm text-gray-600">
                <Fish className="h-4 w-4 mr-1" />
                {yieldText}
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Based on {pond.fishSpecies} growth (15-day cadence), feeding {pond.feedingFrequency}× daily
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
