// components/analytics/analytics-with-ponds.tsx
"use client"

import { AnalyticsExport } from "./analytics-export"
import { HarvestForecast } from "./harvest-forecast"
import { FeedingHistory } from "./feeding-history"
import { GrowthCharts } from "./growth-charts"
import { EfficiencyTips } from "@/components/analytics/efficiency-tips"
import { AnalyticsSummaryExport } from "./analytics-summary-export"   // ✅ NEW
import type { UnifiedPond } from "@/lib/pond-context"

interface AnalyticsWithPondsProps {
  ponds: UnifiedPond[]
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

      {/* ✅ Export target wrapper must be relative */}
      <div id="export-analytics-section" className="relative space-y-6 bg-white p-4 rounded-lg">
        {ponds.map((pond) => (
          <div key={pond.id} className="space-y-6">
            <HarvestForecast pond={pond as any} />
            <FeedingHistory pond={pond as any} />
            <GrowthCharts pond={pond as any} />

            {/* 👇 Still visible on screen, but hidden only in PDF export */}
            <div data-export-hide>
              <EfficiencyTips pond={pond as any} />
            </div>

            {/* 👇 Hidden component that renders the export-only summary table per pond */}
            <AnalyticsSummaryExport pond={pond as any} />
          </div>
        ))}
      </div>
    </div>
  )
}
