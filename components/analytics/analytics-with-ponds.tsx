// components/analytics/analytics-with-ponds.tsx
"use client"

import { AnalyticsExport } from "./analytics-export"
import { HarvestForecast } from "./harvest-forecast"
import { FeedingHistory } from "./feeding-history"
import { GrowthCharts } from "./growth-charts"
import type { UnifiedPond } from "@/lib/pond-context"
import { EfficiencyTips } from "@/components/analytics/efficiency-tips"

interface AnalyticsWithPondsProps {
  ponds: UnifiedPond[] // Admin & User share the same ids
}

export function AnalyticsWithPonds({ ponds }: AnalyticsWithPondsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Growth Analytics</h1>
          <p className="text-gray-600 mt-1">Predictive insights for optimal harvest timing</p>
        </div>
        <AnalyticsExport />
      </div>

      {ponds.map((pond) => (
        <div key={pond.id} className="space-y-6">
          {/* Removed the “Pond Alpha Analytics” header & details block */}

          {/* Core cards */}
          <HarvestForecast pond={pond as any} />
          <FeedingHistory pond={pond as any} />
          <GrowthCharts pond={pond as any} />
          <EfficiencyTips pond={pond as any} />
        </div>
      ))}
    </div>
  )
}
