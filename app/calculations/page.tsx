"use client"

import { usePonds } from '@/lib/pond-context'
import { EmptyState } from '@/components/shared/empty-state'
import { CalculationsWithPonds } from '@/components/calculations/calculations-with-ponds'

export default function CalculationsPage() {
  const { ponds, loading } = usePonds()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading calculations...</p>
        </div>
      </div>
    )
  }

  if (ponds.length === 0) {
    return (
      <EmptyState
        title="Calculations"
        description="Essential aquaculture calculations and tools"
        emptyTitle="No Pond Data for Calculations"
        emptyDescription="Add a pond to access feed calculators, stocking density tools, water volume calculations, and growth rate analysis based on your pond specifications."
      />
    )
  }

  return <CalculationsWithPonds ponds={ponds} />
}
