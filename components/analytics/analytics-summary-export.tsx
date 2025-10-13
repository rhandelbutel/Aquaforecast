// components/analytics/analytics-summary-export.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import type { PondData } from "@/lib/pond-service"
import {
  subscribeMortalityLogs,
  type MortalityLog,
} from "@/lib/mortality-service"
import { GrowthService, type GrowthHistory } from "@/lib/growth-service"

type GrowthStage = { from: number; to: number | null; rate: number } // g/week

// Keep in sync with growth-charts.tsx
const TILAPIA_STAGES: GrowthStage[] = [
  { from: 1,   to: 15,   rate: 4.0 },
  { from: 16,  to: 30,   rate: 13.0 },
  { from: 31,  to: 45,   rate: 16.5 },
  { from: 46,  to: 60,   rate: 20.5 },
  { from: 61,  to: 75,   rate: 21.5 },
  { from: 76,  to: 90,   rate: 22.0 },
  { from: 91,  to: 105,  rate: 18.0 },
  { from: 106, to: null, rate: 12.0 },
]

const CADENCE_DAYS = 15

const stageWeeklyRate = (w:number) => {
  for (const s of TILAPIA_STAGES) {
    if (s.to === null) { if (w >= s.from) return s.rate }
    else if (w >= s.from && w < s.to) return s.rate
  }
  return TILAPIA_STAGES[TILAPIA_STAGES.length - 1].rate
}
const ratePerFortnight = (w:number) => stageWeeklyRate(w) * (CADENCE_DAYS/7)

function buildPredictedSeriesDynamic(
  actual: Array<number | null>,
  seedForP1: number,
  target: number | null | undefined,
  extraAheadIfNoTarget = 8,
  safetyCap = 200
): number[] {
  const nextVal = (prev:number) => prev + ratePerFortnight(prev)
  const baseLen = Math.max(1, actual.length)

  if (target == null || !Number.isFinite(target)) {
    const len = baseLen + Math.max(0, extraAheadIfNoTarget)
    const out = new Array<number>(len)
    out[0] = Math.max(1, seedForP1)
    for (let i=1;i<len;i++) out[i] = nextVal(out[i-1])

    let li=-1; for (let i=actual.length-1;i>=0;i--) if (typeof actual[i]==="number") { li=i; break }
    if (li>=0) { let w=actual[li] as number; for (let i=li+1;i<len;i++){ w=nextVal(w); out[i]=w } }
    return out
  }

  const hit = actual.findIndex(v => typeof v==="number" && (v as number) >= (target as number))
  if (hit>=0){
    const len = hit+1
    const out = new Array<number>(len)
    out[0] = Math.max(1, seedForP1)
    for (let i=1;i<len;i++) out[i]=nextVal(out[i-1])
    return out
  }

  let li=-1; for (let i=actual.length-1;i>=0;i--) if (typeof actual[i]==="number") { li=i; break }
  const out:number[]=[]; const startLen=Math.max(1, actual.length)
  out.length = startLen; out[0]=Math.max(1, seedForP1)
  for (let i=1;i<startLen;i++) out[i]=nextVal(out[i-1])
  let w = li>=0 ? (actual[li] as number) : out[startLen-1]
  let steps=0
  while (steps<safetyCap && (target==null || w < target)) { w=nextVal(w); out.push(w); steps++ }
  if (target!=null && out.length && out[out.length-1] >= target) out[out.length-1]=target
  return out
}

interface Props { pond: PondData }

/**
 * Hidden export-only block:
 *  - Appears in PDF via cloning
 *  - Not visible in the UI
 */
export function AnalyticsSummaryExport({ pond }: Props) {
  const sharedPondId = (pond as any)?.adminPondId || pond.id
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [currentABW, setCurrentABW] = useState<number | null>(null)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [mortLogs, setMortLogs] = useState<MortalityLog[]>([])

  useEffect(() => {
    if (!sharedPondId) return

    const u1 = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
      setHistory([...items].reverse()) // chronological
    })
    const u2 = GrowthService.subscribeGrowthSetup(sharedPondId, (s) => {
      setCurrentABW(s?.currentABW ?? null)
      setTargetWeight(typeof s?.targetWeight === "number" ? s!.targetWeight : null)
    })
    const u3 = subscribeMortalityLogs(sharedPondId, (logs) => setMortLogs(logs))

    return () => { u1(); u2(); u3() }
  }, [sharedPondId])

  const actual = useMemo(
    () => history.map(h => (typeof h.abw === "number" ? h.abw : null)),
    [history]
  )

  const seedForP1 =
    (history.length && typeof history[0].abw === "number" ? history[0].abw : null) ??
    currentABW ?? 5

  const predicted = useMemo(
    () => (history.length ? buildPredictedSeriesDynamic(actual, seedForP1, targetWeight, 8) : []),
    [history.length, actual, seedForP1, targetWeight]
  )

  // Columns shown (like your mock): up to 6 fortnights
  const maxCols = 10
  const colCount = Math.min(
    Math.max(actual.length, predicted.length) || maxCols,
    maxCols
  )

  // ----- Survival dates + values (Start + each mortality date) -----
  const { survivalDates, survivalValues } = useMemo(() => {
    const chrono = [...mortLogs].sort((a, b) => {
      const ta = a.date instanceof Date ? a.date.getTime() : new Date(a.date as any).getTime()
      const tb = b.date instanceof Date ? b.date.getTime() : new Date(b.date as any).getTime()
      return ta - tb
    })

    const dates: string[] = ["Start"]
    const values: number[] = [100] // Start = 100%

    let cumulativeMortality = 0
    for (const log of chrono) {
      const add = typeof log.mortalityRate === "number"
        ? Math.max(0, Math.min(100, log.mortalityRate))
        : 0
      cumulativeMortality = Math.min(100, cumulativeMortality + add)
      const survival = Math.max(0, 100 - cumulativeMortality)

      const d = log.date instanceof Date ? log.date : new Date(log.date as any)
      dates.push(d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }))
      values.push(survival)
    }

    // pad to maxCols
    while (dates.length < maxCols) dates.push("(Date)")
    while (values.length < maxCols) values.push(NaN)

    return {
      survivalDates: dates.slice(0, maxCols),
      survivalValues: values.slice(0, maxCols),
    }
  }, [mortLogs])

  return (
    <div
      id={`analytics-summary-export-${sharedPondId}`}
      data-export="analytics-summary"
      className="hidden p-6 bg-white text-gray-800"
      style={{ width: 720 }}  // crisp on A4
    >
      <h2 className="text-center text-lg font-bold mb-1">AQUAFORECAST</h2>
      <p className="text-center text-sm mb-4">Analytics Summary — {pond.name}</p>

      {/* ABW table */}
      <div className="mx-auto max-w-[720px] mb-4">
        <table className="w-full border-collapse border border-gray-300 text-center text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 p-2 w-32"></th>
              {Array.from({ length: colCount }).map((_, i) => (
                <th key={i} className="border border-gray-300 p-2">{"Fortnight " + (i+1)}</th>
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
          </tbody>
        </table>
      </div>

      {/* Survival timeline */}
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
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Survival rate</td>
              {survivalValues.map((val, i) => (
                <td key={i} className="border border-gray-300 p-2">
                  {Number.isFinite(val) ? `${val.toFixed(1)}%` : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
