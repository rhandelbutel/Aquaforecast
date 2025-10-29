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
import { useAquaSensors } from "@/hooks/useAquaSensors"

/* --------------------------------------------
   Stage-based Tilapia growth model
   -------------------------------------------- */
type GrowthStage = { from: number; to: number | null; rate: number }

const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1, to: 15, rate: 4.0 },
  { from: 16, to: 30, rate: 13.0 },
  { from: 31, to: 45, rate: 16.5 },
  { from: 46, to: 60, rate: 20.5 },
  { from: 61, to: 75, rate: 21.5 },
  { from: 76, to: 90, rate: 22.0 },
  { from: 91, to: 105, rate: 18.0 },
  { from: 106, to: null, rate: 12.0 },
]

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
  return stageWeeklyRate(weightG) * (CADENCE_DAYS / 7)
}

/* ---------------------------------------------------
   Sensor-based growth multiplier (Rule-based)
   --------------------------------------------------- */
function computeGrowthMultiplier(
  ph: number | null,
  do_: number | null,
  temp: number | null
): number {
  if (ph == null || do_ == null || temp == null) return 1.0

  let phFactor = 1.0
  if (ph < 6.5 || ph > 9) phFactor = 0.7
  else if (ph < 7 || ph > 8.5) phFactor = 0.9

  let doFactor = 1.0
  if (do_ < 3 || do_ > 5) doFactor = 0.7

  let tempFactor = 1.0
  if (temp < 28 || temp > 31) tempFactor = 0.8

  return phFactor * doFactor * tempFactor
}

/* ---------------------------------------------------
   Rule-based survival forecast multiplier
   --------------------------------------------------- */
function computeSurvivalRiskMultiplier(
  ph: number | null,
  do_: number | null,
  temp: number | null
): number {
  if (ph == null || do_ == null || temp == null) return 1.0
  let risk = 1.0
  if (ph < 6.5 || ph > 9) risk *= 0.9
  if (do_ < 3) risk *= 0.8
  if (temp < 28 || temp > 31) risk *= 0.9
  return risk
}

/* ---------------------------------------------------
   Core dynamic forecast generator
   --------------------------------------------------- */
function buildPredictedSeriesDynamic(
  actual: Array<number | null>,
  seedForP1: number,
  target: number | null | undefined,
  extraAheadIfNoTarget = 8,
  safetyCap = 200
): number[] {
  const baseLen = Math.max(1, actual.length)
  const nextVal = (prev: number) => prev + stageRatePerCadence(prev)

  if (target == null || !Number.isFinite(target)) {
    const len = baseLen + Math.max(0, extraAheadIfNoTarget)
    const out = new Array<number>(len)
    out[0] = Math.max(1, seedForP1)
    for (let i = 1; i < len; i++) out[i] = nextVal(out[i - 1])

    let latestIdx = -1
    for (let i = actual.length - 1; i >= 0; i--)
      if (typeof actual[i] === "number") {
        latestIdx = i
        break
      }

    if (latestIdx >= 0) {
      let w = actual[latestIdx] as number
      for (let i = latestIdx + 1; i < len; i++) {
        w = nextVal(w)
        out[i] = w
      }
    }
    return out
  }

  const firstActualHit = actual.findIndex(
    (v) => typeof v === "number" && (v as number) >= target
  )
  if (firstActualHit >= 0) {
    const len = firstActualHit + 1
    const out = new Array<number>(len)
    out[0] = Math.max(1, seedForP1)
    for (let i = 1; i < len; i++) out[i] = nextVal(out[i - 1])
    return out
  }

  let latestIdx = -1
  for (let i = actual.length - 1; i >= 0; i--)
    if (typeof actual[i] === "number") {
      latestIdx = i
      break
    }

  const out: number[] = []
  const startLen = Math.max(1, baseLen)
  out.length = startLen
  out[0] = Math.max(1, seedForP1)
  for (let i = 1; i < startLen; i++) out[i] = nextVal(out[i - 1])

  let w = latestIdx >= 0 ? (actual[latestIdx] as number) : out[startLen - 1]
  let steps = 0
  while (steps < safetyCap && w < target) {
    w = nextVal(w)
    out.push(w)
    steps++
  }

  if (out.length > 0 && out[out.length - 1] >= target)
    out[out.length - 1] = target
  return out
}

/* ---------------------------------------------------
   Main Component
   --------------------------------------------------- */
interface GrowthChartsProps {
  pond: PondData
}

export function GrowthCharts({ pond }: GrowthChartsProps) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id
  const [survivalPct, setSurvivalPct] = useState<number | null>(null)
  const [mortLogs, setMortLogs] = useState<MortalityLog[]>([])
  const initialStocked = pond.fishCount || 0
  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const { data: sensorData, isOnline } = useAquaSensors({ intervalMs: 2000 })

  useEffect(() => {
    if (!sharedPondId) return

    const unsubMort = subscribeMortalityLogs(sharedPondId, (logs) => {
      setMortLogs(logs)
      setSurvivalPct(computeSurvivalRateFromLogs(logs)) // latest computed survival
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
      setHistory([...items].reverse())
    })

    return () => {
      unsubMort()
      unsubSetup()
      unsubHist()
    }
  }, [sharedPondId])

  const hasHistory = history.length > 0

  const estimatedAlive = useMemo(() => {
    if (typeof survivalPct === "number") {
      return Math.max(0, Math.round((survivalPct / 100) * initialStocked))
    }
    return initialStocked
  }, [survivalPct, initialStocked])

  /* --------------------------------------------
     GROWTH chart data (unchanged)
     -------------------------------------------- */
  const actualSeries = useMemo(
    () =>
      history.map((h, idx) => ({
        label: `Fortnight ${idx + 1}`,
        actual: typeof h.abw === "number" ? h.abw : null,
      })),
    [history]
  )

  const seedForP1 =
    (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ??
    currentABW ??
    5

  const predictedSeries = useMemo(() => {
    if (!hasHistory) return []
    const actualOnly = actualSeries.map((a) => a.actual)
    return buildPredictedSeriesDynamic(actualOnly, seedForP1, targetWeight, 8)
  }, [hasHistory, actualSeries, seedForP1, targetWeight])

  const multiplier = useMemo(
    () =>
      computeGrowthMultiplier(sensorData?.ph ?? null, sensorData?.do ?? null, sensorData?.temp ?? null),
    [sensorData]
  )

  const liveForecastSeries = useMemo(() => {
    if (!predictedSeries.length) return []
    return predictedSeries.map((v, i) =>
      i === 0 ? v : predictedSeries[i - 1] + (v - predictedSeries[i - 1]) * multiplier
    )
  }, [predictedSeries, multiplier])

  const chartData = useMemo(() => {
    if (!hasHistory) return []
    const endLen = Math.max(actualSeries.length, predictedSeries.length, liveForecastSeries.length)
    const rows: any[] = []
    for (let i = 0; i < endLen; i++) {
      rows.push({
        label: `Fortnight ${i + 1}`,
        actual: i < actualSeries.length ? actualSeries[i].actual : null,
        predicted: i < predictedSeries.length ? predictedSeries[i] : null,
        liveForecast: i < liveForecastSeries.length ? liveForecastSeries[i] : null,
      })
    }
    return rows
  }, [hasHistory, actualSeries, predictedSeries, liveForecastSeries])

  /* --------------------------------------------
     SURVIVAL curve (historical + forecast)
     -------------------------------------------- */
    /* --------------------------------------------
     SURVIVAL curve (historical + live forecast)
     -------------------------------------------- */
  const survivalCurveData = useMemo(() => {
    if (mortLogs.length === 0)
      return [{ label: "No Data", survival: 100 }]

    const chrono = [...mortLogs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    const rows: { label: string; survival: number }[] = []
    let cumulative = 0
    for (const log of chrono) {
      const add = log.mortalityRate
        ? Math.max(0, Math.min(100, log.mortalityRate))
        : 0
      cumulative = Math.min(100, cumulative + add)
      const survival = Math.max(0, 100 - cumulative)
      const d = new Date(log.date)
      const label = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
      rows.push({ label, survival })
    }
    return rows
  }, [mortLogs])

  const liveSurvivalForecastData = useMemo(() => {
    if (typeof survivalPct !== "number" || survivalCurveData.length === 0)
      return []

    // Base survival is the latest computed one from logs
    const base = survivalPct
    const lastLogLabel = survivalCurveData[survivalCurveData.length - 1].label

    const { ph, do: doVal, temp } = sensorData || {}
    const risk = computeSurvivalRiskMultiplier(ph ?? null, doVal ?? null, temp ?? null)
    const softRisk = 1 - ((1 - risk) / 7) // gradual drop rate

    const rows: { label: string; survival: number }[] = []
    let projected = base

    for (let day = 1; day <= 15; day++) {
      projected *= softRisk
      projected = Math.max(0, projected)
      const futureLabel = `+${day}d`
      rows.push({ label: futureLabel, survival: projected })
    }

    // Combine with the last log point for continuous line
    return [{ label: lastLogLabel, survival: base }, ...rows]
  }, [survivalPct, survivalCurveData, sensorData])


  /* --------------------------------------------
     SENSOR STATUS
     -------------------------------------------- */
  const sensorSummary = useMemo(() => {
    if (!sensorData)
      return <p className="text-xs text-gray-400 italic">Awaiting sensor data...</p>

    const { ph, do: doVal, temp } = sensorData
    const mPct = Math.round(multiplier * 100)
    const ok = (v: boolean) => (v ? "text-green-600" : "text-red-500")
   const phOk = ph != null && ph >= 6.5 && ph <= 9
    const doOk = doVal != null && doVal >= 3 && doVal <= 5
    const tempOk = temp != null && temp >= 28 && temp <= 31

    return (
      <div className="text-xs flex flex-wrap gap-x-4 gap-y-1 mt-1">
        <span className={ok(phOk)}>pH: {ph?.toFixed(2) ?? "--"}</span>
        <span className={ok(doOk)}>DO: {doVal?.toFixed(2) ?? "--"} mg/L</span>
        <span className={ok(tempOk)}>Temp: {temp?.toFixed(1) ?? "--"} °C</span>
        <span className="font-semibold text-amber-600">
          Growth ×{multiplier.toFixed(2)} ({mPct}%)
        </span>
        <span className="text-gray-400 ml-auto">{isOnline ? " Live" : " Offline"}</span>
      </div>
    )
  }, [sensorData, multiplier, isOnline])

  /* --------------------------------------------
     RENDER
     -------------------------------------------- */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Growth Prediction */}
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
          {sensorSummary}
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
                <Tooltip formatter={(v, n) => [`${Number(v).toFixed(2)} g`, n]} />
                <Line type="monotone" dataKey="actual" stroke="#0891b2" strokeWidth={2.5} name="Actual ABW" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="predicted" stroke="#059669" strokeWidth={1.5} name="Predicted ABW" dot={{ r: 2 }} />
                <Line type="monotone" dataKey="liveForecast" stroke="#f59e0b" strokeWidth={1.5} name="Live Growth Forecast" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Survival Curve */}
      <Card>
        <CardHeader>
          <CardTitle>Survival Rate Curve - {pond.name}</CardTitle>
          <p className="text-sm text-gray-600">
            Based on mortality logs + live forecast (sensor-based)
          </p>
        </CardHeader>
        <CardContent>
  <ResponsiveContainer width="100%" height={320}>
    <AreaChart>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis domain={[0, 100]} />
      <Tooltip formatter={(v: any) => [`${v.toFixed(1)}%`, "Survival"]} />
      {/* Historical Data */}
      <Area
        dataKey="survival"
        data={survivalCurveData}
        stroke="#2563eb"
        fill="#2563eb"
        fillOpacity={0.3}
        name="Historical"
      />
      {/* Forecast Data */}
      <Area
        dataKey="survival"
        data={liveSurvivalForecastData}
        stroke="#f59e0b"
        fill="#2563eb"
        fillOpacity={0.25}
        name="Forecast"
      />
    </AreaChart>
  </ResponsiveContainer>
</CardContent>

      </Card>
    </div>
  )
}
