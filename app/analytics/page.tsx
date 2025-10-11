"use client"

import { usePonds } from "@/lib/pond-context"
import { EmptyState } from "@/components/shared/empty-state"
import { AnalyticsWithPonds } from "@/components/analytics/analytics-with-ponds"

export default function AnalyticsPage() {
  const { ponds, loading } = usePonds() // ponds is UnifiedPond[]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (ponds.length === 0) {
    return (
      <EmptyState
        title="Growth Analytics"
        description="Predictive insights for optimal harvest timing"
        emptyTitle="No Growth Data Available"
        emptyDescription="Add a pond to start tracking fish growth and get AI-powered harvest predictions based on feeding patterns, water quality, and fish development."
      />
    )
  }

  // ✅ ponds is UnifiedPond[], and AnalyticsWithPonds is typed to UnifiedPond[]
  return <AnalyticsWithPonds ponds={ponds} />
}
