//components/analytics/analytics-with-ponds.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { AnalyticsExport } from "./analytics-export"
import { HarvestForecast } from "./harvest-forecast"
import { FeedingHistory } from "./feeding-history"
import { GrowthCharts } from "./growth-charts"
import { EfficiencyTips } from "./efficiency-tips"
import type { UnifiedPond } from "@/lib/pond-context"
import { subscribeMortalityLogs, computeSurvivalRateFromLogs, type MortalityLog } from "@/lib/mortality-service"

interface AnalyticsWithPondsProps {
  ponds: UnifiedPond[] // ← use unified pond so Admin & User share the same ids
}

export function AnalyticsWithPonds({ ponds }: AnalyticsWithPondsProps) {
  // Keep a tiny cache of survival % per pond
  const [survivalByPond, setSurvivalByPond] = useState<Record<string, number>>({})

  // Subscribe to mortality logs for each pond shown on the page
  useEffect(() => {
    const unsubs: Array<() => void> = []

    ponds.forEach((p) => {
      const sharedId = (p as any).adminPondId || p.id
      if (!sharedId) return

      const unsub = subscribeMortalityLogs(sharedId, (logs: MortalityLog[]) => {
        const sr = computeSurvivalRateFromLogs(logs) // 0–100
        setSurvivalByPond((prev) => ({ ...prev, [sharedId]: sr }))
      })
      unsubs.push(unsub)
    })

    return () => unsubs.forEach((u) => u && u())
  }, [ponds])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Growth Analytics</h1>
          <p className="text-gray-600 mt-1">Predictive insights for optimal harvest timing</p>
        </div>
        <AnalyticsExport />
      </div>

      {ponds.map((pond) => {
        const sharedId = (pond as any).adminPondId || pond.id
        const initialStocked = pond.fishCount || 0
        const survival = survivalByPond[sharedId]
        const estimatedAlive =
          typeof survival === "number"
            ? Math.max(0, Math.round((survival / 100) * initialStocked))
            : initialStocked // fallback if no logs yet

        const stockingDensity = useMemo(() => {
          const area = pond.area || 1
          return estimatedAlive / area
        }, [estimatedAlive, pond.area])

        return (
          <div key={pond.id} className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{pond.name} Analytics</h2>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  <strong>Species:</strong> {pond.fishSpecies}
                </p>
                <p>
                  <strong>Fish Count:</strong>{" "}
                  <span className="font-semibold">
                    {estimatedAlive.toLocaleString()}{" "}
                    <span className="text-gray-500 font-normal">(Estimated fish alive{typeof survival === "number" ? ` • ${survival.toFixed(1)}% SR` : ""})</span>
                  </span>
                </p>
                <p>
                  <strong>Feeding:</strong> {pond.feedingFrequency}x daily
                </p>
                <p>
                  <strong>Stocking Density:</strong> {stockingDensity.toFixed(1)} fish/m²
                </p>
              </div>
            </div>

            {/* These components already work fine. GrowthCharts also shows the estimated alive in its subheader. */}
            <HarvestForecast pond={pond as any} />
            <FeedingHistory pond={pond as any} />
            <GrowthCharts pond={pond as any} />
            <EfficiencyTips pond={pond as any} />
          </div>
        )
      })}
    </div>
  )
}
