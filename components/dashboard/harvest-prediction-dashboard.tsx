// components/dashboard/harvest-prediction-dashboard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, Fish, Calendar, Target, AlertCircle, AlertTriangle, Lightbulb } from "lucide-react"
import type { UnifiedPond } from "@/lib/pond-context"
import { GrowthService, type GrowthHistory } from "@/lib/growth-service"
import { subscribeMortalityLogs, computeSurvivalRateFromLogs, type MortalityLog } from "@/lib/mortality-service"
import { useAuth } from "@/lib/auth-context"

/* >>>  AI insights renderer + sensor hook + dash-only detector <<< */
import { AIInsightsCard } from "@/components/dashboard/ai-insights"
import { useAquaSensors } from "@/hooks/useAquaSensors"
import { detectRealtimeFindingsDash, type LiveReading } from "@/lib/dash-insights-service"

/* ============================
   Stage-based Tilapia Model (same rates you use in charts)
   ============================ */

type GrowthStage = { from: number; to: number | null; rate: number } // rate in g/week

const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 15,   rate: 4.0 },   // big jump early to remove delay
  { from: 16,  to: 30,   rate: 13.0 },
  { from: 31,  to: 45,   rate: 16.5 },
  { from: 46,  to: 60,   rate: 20.5 },
  { from: 61,  to: 75,   rate: 21.5 },
  { from: 76,  to: 90,   rate: 22.0 },  // peak mid-phase
  { from: 91,  to: 105,  rate: 18.0 },
  { from: 106, to: null, rate: 12.0 },
]

const CADENCE_DAYS = 15

const stageWeeklyRate = (w: number) => {
  for (const s of TILAPIA_STAGES) {
    if (s.to == null) { if (w >= s.from) return s.rate }
    else if (w >= s.from && w < s.to) return s.rate
  }
  return TILAPIA_STAGES[TILAPIA_STAGES.length - 1].rate
}

const stageRatePerFortnight = (w: number) => stageWeeklyRate(w) * (CADENCE_DAYS / 7)

// JS Timestamp/Date -> Date helper
const tsToDate = (v: any): Date | null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v?.toDate === "function") {
    try { return v.toDate() as Date } catch { return null }
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000)
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

const addDays = (base: Date, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Core change:
 * Count days from the *last ABW log* to the moment target weight is reached,
 * using the same 15-day step model as the chart. Inside the crossing
 * fortnight we assume linear gain to compute exact day.
 */
function daysFromLastABWToTarget15d(currentABW: number, target: number): number {
  if (!Number.isFinite(currentABW) || !Number.isFinite(target)) return 0
  if (target <= currentABW) return 0

  let cur = Math.max(currentABW, 1)
  let days = 0
  // safety cap
  for (let i = 0; i < 200; i++) {
    const gain15 = stageRatePerFortnight(cur)
    if (gain15 <= 0) return days // avoid infinite loop

    const next = cur + gain15
    if (next >= target) {
      const dailyGain = gain15 / CADENCE_DAYS
      const remaining = target - cur
      const insideDays = Math.ceil(remaining / dailyGain)
      return days + insideDays
    }

    cur = next
    days += CADENCE_DAYS
  }
  return days
}

/* ============================
   Component
   ============================ */

interface HarvestPredictionProps {
  pond: UnifiedPond
  aliveFish?: number | null
  initialStocked?: number | null
  survivalRate?: number | null
  refreshTrigger?: number
}

export function HarvestPredictionDashboard({
  pond,
  aliveFish,
  initialStocked,
  survivalRate,
  refreshTrigger = 0,
}: HarvestPredictionProps) {
  const { user } = useAuth()

  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [lastABWAt, setLastABWAt] = useState<Date | null>(null)

  // ABW cadence helpers
  const [daysUntilUpdate, setDaysUntilUpdate] = useState<number>(0)
  const [abwDue, setAbwDue] = useState<boolean>(false)

  // history / display growth
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [fortnightGrowthText, setFortnightGrowthText] = useState<string>("0 g/15d")

  // mortality / survival
  const [survival, setSurvival] = useState<number | null>(null)

  const sharedPondId = (pond as any).adminPondId || pond.id

  /* stream live sensor readings into dashboard insights (no UI impact) */
  const { setOnReading } = useAquaSensors()
  useEffect(() => {
    if (!sharedPondId) return
  setOnReading((r) => {
  const reading: LiveReading = {
    ts: r.ts,
    temp: r.temp ?? 0,
    ph: r.ph ?? 0,
    do: r.do ?? 0,
  };
  void detectRealtimeFindingsDash({ id: sharedPondId, name: pond.name }, reading);
});

    return () => setOnReading(undefined)
  }, [setOnReading, sharedPondId, pond.name])
 

  useEffect(() => {
    if (!user || !sharedPondId) return

    // Live growth setup (current ABW, target, last update)
    const unsubSetup = GrowthService.subscribeGrowthSetup(sharedPondId, (setup) => {
      if (setup) {
        setCurrentABW(setup.currentABW)
        setTargetWeight(typeof setup.targetWeight === "number" ? setup.targetWeight : null)
        setDaysUntilUpdate(GrowthService.getDaysUntilNextUpdate(setup.lastABWUpdate))
        setAbwDue(GrowthService.canUpdateABW(setup.lastABWUpdate))
        setLastABWAt(tsToDate(setup.lastABWUpdate))
      } else {
        setCurrentABW(null)
        setTargetWeight(null)
        setDaysUntilUpdate(0)
        setAbwDue(false)
        setLastABWAt(null)
      }
    })

    // Live history (newest first) → raw 15d delta for display (matches modal)
    const unsubHistory = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
      setHistory(items)
      if (items.length >= 2) {
        const latest = items[0]
        const prev = items[1]
        const growthRaw = (latest.abw ?? 0) - (prev.abw ?? 0)
        setFortnightGrowthText(`${growthRaw >= 0 ? "+" : ""}${growthRaw.toFixed(1)} g/15d`)
      } else {
        setFortnightGrowthText("0 g/15d")
      }
    })

    // mortality → survival
    const unsubMortality = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) => {
      setSurvival(computeSurvivalRateFromLogs(logs))
    })

    return () => {
      unsubSetup()
      unsubHistory()
      unsubMortality()
    }
  }, [sharedPondId, user, refreshTrigger])

  // ===== Derived metrics =====
  const initial: number = (initialStocked ?? pond.fishCount ?? 0) || 0
  const alive: number = (aliveFish ?? pond.fishCount ?? 0) || 0

  const computedSurvivalRate: number = (() => {
    if (typeof survival === "number") return survival
    if (typeof survivalRate === "number") return survivalRate
    return initial > 0 ? (alive / initial) * 100 : 100
  })()

  const estimatedSurvivorsAtHarvest = Math.max(0, Math.round(initial * (computedSurvivalRate / 100)))

  // Biomass now
  const biomassEstimate = ((currentABW || 0) * alive) / 1000 // kg

  // Expected Yield at target
  const expectedYield: number | null =
    typeof targetWeight === "number" ? (targetWeight * estimatedSurvivorsAtHarvest) / 1000 : null

  // === NEW: Predicted Harvest based on the same 15-day model as the chart ===
  const { harvestDate, daysLeft, harvestNote } = useMemo(() => {
    if (targetWeight == null || targetWeight <= 0) {
      return { harvestDate: null as Date | null, daysLeft: null as number | null, harvestNote: "Set a target weight." }
    }
    if (currentABW == null) {
      return { harvestDate: null, daysLeft: null, harvestNote: "Current ABW not set." }
    }

    // Count days from the last ABW log to target crossing
    const startDate = lastABWAt ?? new Date()
    const totalFromLastLog = daysFromLastABWToTarget15d(currentABW, targetWeight)

    // Convert to "days left" from NOW (subtract time already elapsed since last ABW)
    const elapsed = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000))
    const left = Math.max(0, totalFromLastLog - elapsed)

    const date = addDays(new Date(), left)
    return { harvestDate: date, daysLeft: left, harvestNote: null }
  }, [currentABW, targetWeight, lastABWAt])

  const readinessRaw = currentABW && targetWeight ? (currentABW / targetWeight) * 100 : 0
  const readinessPercentage = Math.max(0, Math.min(100, Math.round(readinessRaw)))
  const fcr = 1.4

  const status =
    readinessPercentage >= 90
      ? { text: "Ready for Harvest", color: "bg-green-100 text-green-800" }
      : readinessPercentage >= 75
      ? { text: "Nearly Ready", color: "bg-yellow-100 text-yellow-800" }
      : readinessPercentage >= 60
      ? { text: "On Track for Target Weight", color: "bg-blue-100 text-blue-800" }
      : { text: "Early Growth Phase", color: "bg-gray-100 text-gray-800" }

  return (
    <div id="export-harvest" className="w-full">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <Target className="h-5 w-5 mr-2 text-cyan-600" />
            {pond.name} – Harvest Prediction
          </h2>
          <p className="text-gray-600 text-sm mt-1">Stage-based growth forecast for Tilapia (15-day cadence)</p>
        </div>
        <Badge className={status.color}>{status.text}</Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Current ABW */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Current ABW</p>
                <p className="text-xl font-bold">{currentABW !== null ? `${currentABW}g` : "Not set"}</p>
                <p className="text-xs mt-0.5">
                  {currentABW === null ? (
                    <span className="text-gray-500">Set up growth tracking</span>
                  ) : abwDue ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      ABW update due
                    </span>
                  ) : (
                    <span className="text-gray-500">Next update in {daysUntilUpdate}d</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Biomass */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Fish className="h-5 w-5 text-blue-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Biomass Estimate</p>
                <p className="text-xl font-bold">{biomassEstimate.toFixed(0)} kg</p>
                <p className="text-xs text-gray-500">Estimated fish alive: {(aliveFish ?? alive).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Predicted Harvest (now aligned with chart’s 15-day model) */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Calendar className="h-5 w-5 text-purple-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Predicted Harvest</p>
                {harvestDate ? (
                  <>
                    <p className="text-lg font-bold">
                      {harvestDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {typeof daysLeft === "number" ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">
                    {harvestNote ?? "Not enough data yet. Set current ABW and a target weight."}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expected Yield */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Target className="h-5 w-5 text-orange-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Expected Yield</p>
                <p className="text-xl font-bold">{expectedYield !== null ? `${expectedYield.toFixed(0)} kg` : "—"}</p>
                <p className="text-xs text-gray-500">
                  {currentABW && targetWeight ? `At target ${targetWeight}g` : "Set up growth tracking first"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Readiness Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Harvest Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Progress to Target Weight ({targetWeight ?? "—"}g)</span>
              <span className="text-sm text-gray-600">{readinessPercentage}%</span>
            </div>
            <Progress value={readinessPercentage} className="h-3" />
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Growth (15-day)</p>
                <p className="font-semibold">{fortnightGrowthText}</p>
              </div>
              <div>
                <p className="text-gray-600">Survival Rate</p>
                <p className="font-semibold">{computedSurvivalRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/*live AI insights card */}
      <AIInsightsCard pondId={sharedPondId} />
      {/* end */}
    </div>
</div>
  )
}
