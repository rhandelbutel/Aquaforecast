"use client"

import { usePonds } from '@/lib/pond-context'
import { EmptyState } from '@/components/shared/empty-state'
import { WaterQualityWithPonds } from '@/components/water-quality/water-quality-with-ponds'

export default function WaterQualityPage() {
  const { ponds, loading } = usePonds()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading water quality data...</p>
        </div>
      </div>
    )
  }

  if (ponds.length === 0) {
    return (
      <EmptyState
        title="Water Quality"
        description="Detailed parameter monitoring and analysis"
        emptyTitle="No Ponds to Monitor"
        emptyDescription="Add a pond to start monitoring water quality parameters like pH, temperature, dissolved oxygen, and TDS levels."
      />
    )
  }

  return <WaterQualityWithPonds ponds={ponds} />
}
