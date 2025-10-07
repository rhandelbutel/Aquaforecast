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

/* ============================
   Stage-based Tilapia Model
   ============================ */

type GrowthStage = {
  /** inclusive lower bound (g) */
  from: number
  /** exclusive upper bound (g). null => no upper bound */
  to: number | null
  /** expected weekly gain in this stage (g/week) */
  rate: number
}

/**
 * Nile Tilapia typical growth (good conditions)
 * - 1→20g:      ~4–5 g/w  => 4.5
 * - 20→100g:    ~13–15 g/w => 14
 * - 100→300g:   ~25 g/w
 * - 300→600g:   ~35–40 g/w => 37.5
 * - >600g:      continue at 37.5 unless you want a different tail rule
 */
const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 20,   rate: 4.5 },
  { from: 20,  to: 100,  rate: 14 },
  { from: 100, to: 300,  rate: 25 },
  { from: 300, to: 600,  rate: 37.5 },
  { from: 600, to: null, rate: 37.5 },
]

/** Integrate piecewise weekly rates to reach target from current. Returns whole days. */
function predictDaysToTargetByStages(currentABW: number, targetWeight: number, stages: GrowthStage[] = TILAPIA_STAGES) {
  if (!Number.isFinite(currentABW) || !Number.isFinite(targetWeight)) return 0
  if (targetWeight <= currentABW) return 0

  // Start at least at the first stage lower bound (e.g., 1g).
  let cursor = Math.max(currentABW, stages[0]?.from ?? currentABW)
  let totalWeeks = 0

  for (const s of stages) {
    if (cursor >= targetWeight) break

    // If we're already above this stage, skip
    if (s.to !== null && cursor >= s.to) continue

    const stageStart = Math.max(cursor, s.from)
    const stageEnd = s.to === null ? targetWeight : Math.min(s.to, targetWeight)
    if (stageEnd <= stageStart) continue

    const deltaG = stageEnd - stageStart
    const weeks = deltaG / s.rate
    totalWeeks += weeks
    cursor = stageEnd
  }

  return Math.max(0, Math.ceil(totalWeeks * 7))
}

function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
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

  // ABW cadence helpers
  const [daysUntilUpdate, setDaysUntilUpdate] = useState<number>(0)
  const [abwDue, setAbwDue] = useState<boolean>(false)

  // history / weekly growth (kept for display only)
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [weeklyGrowthText, setWeeklyGrowthText] = useState<string>("0 g/week")

  // mortality / survival
  const [survival, setSurvival] = useState<number | null>(null)

  const sharedPondId = (pond as any).adminPondId || pond.id

  // Safe Timestamp/Date → JS Date
  const tsToDate = (v: any): Date | null => {
    if (!v) return null
    if (v instanceof Date) return v
    if (typeof v?.toDate === "function") {
      try {
        return v.toDate() as Date
      } catch {
        return null
      }
    }
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000)
    const asDate = new Date(v)
    return isNaN(asDate.getTime()) ? null : asDate
  }

  useEffect(() => {
    if (!user || !sharedPondId) return

    // Live growth setup (current ABW, target)
    const unsubSetup = GrowthService.subscribeGrowthSetup(sharedPondId, (setup) => {
      if (setup) {
        setCurrentABW(setup.currentABW)
        setTargetWeight(typeof setup.targetWeight === "number" ? setup.targetWeight : null)
        setDaysUntilUpdate(GrowthService.getDaysUntilNextUpdate(setup.lastABWUpdate))
        setAbwDue(GrowthService.canUpdateABW(setup.lastABWUpdate))
      } else {
        setCurrentABW(null)
        setTargetWeight(null)
        setDaysUntilUpdate(0)
        setAbwDue(false)
      }
    })

    // Live growth history (latest first) → compute readable weekly growth label
    const unsubHistory = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
      setHistory(items)
      if (items.length >= 2) {
        const latest = items[0]
        const prev = items[1]

        const d1 = tsToDate(latest.recordedAt)
        const d0 = tsToDate(prev.recordedAt)
        const deltaG = (latest.abw ?? 0) - (prev.abw ?? 0)

        const days =
          d1 && d0
            ? Math.max(1, Math.round((d1.getTime() - d0.getTime()) / 86_400_000))
            : 7 // fallback if dates missing

        const perWeek = (deltaG / days) * 7
        setWeeklyGrowthText(`${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(1)} g/week`)
      } else {
        setWeeklyGrowthText("0 g/week")
      }
    })

    // Live mortality → survival %
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

  // Forecast survivors at harvest (assume rate persists)
  const estimatedSurvivorsAtHarvest: number = Math.max(0, Math.round(initial * (computedSurvivalRate / 100)))

  // “Now” biomass
  const estimatedAlive: number = alive
  const biomassEstimate: number = ((currentABW || 0) * estimatedAlive) / 1000 // kg

  // Expected Yield = targetWeight (g) × forecast survivors ÷ 1000
  const expectedYield: number | null =
    typeof targetWeight === "number" ? (targetWeight * estimatedSurvivorsAtHarvest) / 1000 : null

  // === Dynamic Predicted Harvest via Stage-Based Model ===
  const { harvestDate, daysLeft, harvestNote } = useMemo(() => {
    if (targetWeight == null || targetWeight <= 0) {
      return { harvestDate: null as Date | null, daysLeft: null as number | null, harvestNote: "Set a target weight." }
    }
    if (currentABW == null) {
      return { harvestDate: null, daysLeft: null, harvestNote: "Current ABW not set." }
    }
    if (currentABW >= targetWeight) {
      return { harvestDate: new Date(), daysLeft: 0, harvestNote: null }
    }

    // If pond species !== tilapia, you can switch table here later.
    const days = predictDaysToTargetByStages(currentABW, targetWeight, TILAPIA_STAGES)
    const date = addDays(new Date(), days)
    return { harvestDate: date, daysLeft: days, harvestNote: null }
  }, [currentABW, targetWeight])

  const readinessRaw = currentABW && targetWeight ? (currentABW / targetWeight) * 100 : 0
  const readinessPercentage = Math.max(0, Math.min(100, Math.round(readinessRaw)))
  const fcr = 1.4

  const getReadinessStatus = () => {
    if (readinessPercentage >= 90) return { text: "Ready for Harvest", color: "bg-green-100 text-green-800" }
    if (readinessPercentage >= 75) return { text: "Nearly Ready", color: "bg-yellow-100 text-yellow-800" }
    if (readinessPercentage >= 60) return { text: "On Track for Target Weight", color: "bg-blue-100 text-blue-800" }
    return { text: "Early Growth Phase", color: "bg-gray-100 text-gray-800" }
  }

  const status = getReadinessStatus()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <Target className="h-5 w-5 mr-2 text-cyan-600" />
            {pond.name} – Harvest Prediction
          </h2>
          <p className="text-gray-600 text-sm mt-1">Stage-based growth forecast for Nile Tilapia</p>
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
                      Weekly ABW due
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
                <p className="text-xs text-gray-500">
                  Estimated fish alive: {(aliveFish ?? estimatedAlive).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Predicted Harvest (dynamic, stage-based) */}
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
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-gray-500">
                    {currentABW && targetWeight ? `At target ${targetWeight}g` : "Set up growth tracking first"}
                  </p>
                </div>
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
                <p className="text-gray-600">Weekly Growth</p>
                <p className="font-semibold">{weeklyGrowthText}</p>
              </div>
              <div>
                <p className="text-gray-600">Survival Rate</p>
                <p className="font-semibold">{computedSurvivalRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-gray-600">FCR</p>
                <p className="font-semibold">{fcr}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights (placeholder content kept) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Lightbulb className="h-5 w-5 mr-2 text-yellow-600" />
            AI Insights & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Growth Model</p>
                <p className="text-sm text-gray-600">
                  Predicted harvest is now computed with a stage-based tilapia model. Keep weekly ABW updates for better
                  accuracy.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
