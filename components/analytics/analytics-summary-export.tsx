"use client"

import { useEffect, useMemo, useState } from "react"
import type { PondData } from "@/lib/pond-service"
import {
  subscribeMortalityLogs,
  type MortalityLog,
  computeSurvivalRateFromLogs,
} from "@/lib/mortality-service"
import { GrowthService, type GrowthHistory } from "@/lib/growth-service"
import { useAquaSensors } from "@/hooks/useAquaSensors"

/* ---------------------- Growth model ---------------------- */
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
const stageWeeklyRate = (w: number) => {
  for (const s of TILAPIA_STAGES) {
    if (s.to === null) {
      if (w >= s.from) return s.rate
    } else if (w >= s.from && w < s.to) return s.rate
  }
  return TILAPIA_STAGES[TILAPIA_STAGES.length - 1].rate
}
const ratePerFortnight = (w: number) => stageWeeklyRate(w) * (CADENCE_DAYS / 7)

/* ---------------------- Prediction models ---------------------- */
function buildPredictedSeriesDynamic(
  actual: Array<number | null>,
  seed: number,
  target: number | null | undefined,
  extraAhead = 8,
  cap = 200
): number[] {
  const nextVal = (p: number) => p + ratePerFortnight(p)
  const baseLen = Math.max(1, actual.length)
  if (!target) {
    const len = baseLen + extraAhead
    const out = [Math.max(1, seed)]
    for (let i = 1; i < len; i++) out.push(nextVal(out[i - 1]))
    return out
  }
  const out: number[] = [Math.max(1, seed)]
  let w = seed
  let steps = 0
  while (steps < cap && w < target) {
    w = nextVal(w)
    out.push(Math.min(w, target))
    steps++
  }
  return out
}

/* ---------------------- Sensor-based Growth & Risk ---------------------- */
function computeGrowthMultiplier(ph: number | null, do_: number | null, temp: number | null): number {
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

function computeMortalityRisk(ph: number | null, do_: number | null, temp: number | null): number {
  let r = 0
  if (ph != null) {
    if (ph < 6.5 || ph > 9) r += 0.3
    else if (ph < 7 || ph > 8.5) r += 0.15
  }
  if (do_ != null) {
    if (do_ < 3) r += 0.4
    else if (do_ < 5) r += 0.2
  }
  if (temp != null) {
    if (temp < 28 || temp > 31) r += 0.2
  }
  return Math.min(1, r)
}

function forecastSurvivalRate(current: number, risk: number, steps = 10): number[] {
  const arr: number[] = []
  let s = current
  for (let i = 0; i < steps; i++) {
    const decay = risk * 0.5
    s = Math.max(0, s - decay)
    arr.push(s)
  }
  return arr
}

/* ---------------------- Main Component ---------------------- */
interface Props {
  pond: PondData
}

export function AnalyticsSummaryExport({ pond }: Props) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [mortLogs, setMortLogs] = useState<MortalityLog[]>([])
  const { data: sensorData } = useAquaSensors({ intervalMs: 2000 })

  useEffect(() => {
    if (!sharedPondId) return
    const u1 = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => setHistory([...items].reverse()))
    const u2 = GrowthService.subscribeGrowthSetup(sharedPondId, (s) => {
      setCurrentABW(s?.currentABW ?? null)
      setTargetWeight(typeof s?.targetWeight === "number" ? s.targetWeight : null)
    })
    const u3 = subscribeMortalityLogs(sharedPondId, (logs) => setMortLogs(logs))
    return () => {
      u1()
      u2()
      u3()
    }
  }, [sharedPondId])

  const actual = useMemo(() => history.map((h) => (typeof h.abw === "number" ? h.abw : null)), [history])
  const seed = (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ?? currentABW ?? 5

  const predicted = useMemo(
    () => (history.length ? buildPredictedSeriesDynamic(actual, seed, targetWeight, 8) : []),
    [history.length, actual, seed, targetWeight]
  )

  /* ---------- Live Forecast ABW (sensor-based) ---------- */
  const liveForecast = useMemo(() => {
    if (!predicted.length || !sensorData) return []
    const m = computeGrowthMultiplier(sensorData.ph, sensorData.do, sensorData.temp)
    return predicted.map((v, i) => (i === 0 ? v : predicted[i - 1] + (v - predicted[i - 1]) * m))
  }, [predicted, sensorData])

  /* ---------- Survival Data ---------- */
  const { survivalDates, survivalValues, liveSurvival } = useMemo(() => {
    const chrono = [...mortLogs].sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime())
    const dates: string[] = ["Start"]
    const values: number[] = [100]
    let cumulative = 0

    for (const log of chrono) {
      const add = typeof log.mortalityRate === "number" ? Math.max(0, Math.min(100, log.mortalityRate)) : 0
      cumulative = Math.min(100, cumulative + add)
      const surv = Math.max(0, 100 - cumulative)
      const d = new Date(log.date as any)
      dates.push(d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }))
      values.push(surv)
    }

    const currentSurv = values[values.length - 1] ?? 100
    const risk = computeMortalityRisk(sensorData?.ph ?? null, sensorData?.do ?? null, sensorData?.temp ?? null)
    const forecast = forecastSurvivalRate(currentSurv, risk, 8)

    while (dates.length < 10) dates.push("(Date)")
    while (values.length < 10) values.push(NaN)

    return {
      survivalDates: dates.slice(0, 10),
      survivalValues: values.slice(0, 10),
      liveSurvival: forecast,
    }
  }, [mortLogs, sensorData])

  const maxCols = 10
  const colCount = Math.min(Math.max(actual.length, predicted.length, liveForecast.length) || maxCols, maxCols)

  /* ---------- Render ---------- */
  return (
    <div
      id={`analytics-summary-export-${sharedPondId}`}
      data-export="analytics-summary"
      className="hidden p-6 bg-white text-gray-800"
      style={{ width: 720 }}
    >
     
      <p className="text-center text-sm mb-4">Analytics Summary — {pond.name}</p>

      {/* ABW Table */}
      <div className="mx-auto max-w-[720px] mb-4">
        <table className="w-full border-collapse border border-gray-300 text-center text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 p-2 w-32"></th>
              {Array.from({ length: colCount }).map((_, i) => (
                <th key={i} className="border border-gray-300 p-2">{"Fortnight " + (i + 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-gray-50">
              <td className="border border-gray-300 p-2 font-medium">Actual ABW</td>
              {Array.from({ length: colCount }).map((_, i) => {
                const v = actual[i]
                return (
                  <td key={i} className="border border-gray-300 p-2">
                    {typeof v === "number" ? `${v.toFixed(2)} g` : "—"}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Predicted ABW</td>
              {Array.from({ length: colCount }).map((_, i) => {
                const v = predicted[i]
                return (
                  <td key={i} className="border border-gray-300 p-2">
                    {typeof v === "number" ? `${v.toFixed(2)} g` : "—"}
                  </td>
                )
              })}
            </tr>
            <tr className="bg-amber-50">
              <td className="border border-gray-300 p-2 font-medium text-amber-700">
                Live Forecast ABW (Sensors)
              </td>
              {Array.from({ length: colCount }).map((_, i) => {
                const v = liveForecast[i]
                return (
                  <td key={i} className="border border-gray-300 p-2 text-amber-700">
                    {typeof v === "number" ? `${v.toFixed(2)} g` : "—"}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Survival Table */}
      <div className="mx-auto max-w-[720px]">
        <table className="w-full border-collapse border border-gray-300 text-center text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 p-2 w-32"></th>
              {survivalDates.map((lbl, i) => (
                <th key={i} className="border border-gray-300 p-2">{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-amber-50">
              <td className="border border-gray-300 p-2 font-medium text-amber-700">
                Live Survival Forecast
              </td>
              {Array.from({ length: 10 }).map((_, i) => {
                const v = liveSurvival[i]
                return (
                  <td key={i} className="border border-gray-300 p-2 text-amber-700">
                    {typeof v === "number" ? `${v.toFixed(1)}%` : "—"}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
