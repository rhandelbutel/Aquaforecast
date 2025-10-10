"use client"

import { useState } from "react"
import { usePonds } from "@/lib/pond-context"
import { EmptyPonds } from "@/components/ponds/empty-ponds"
import { PondsWithData } from "@/components/ponds/ponds-with-data"
import HarvestModal from "@/components/admin/harvest-modal"

export default function PondsPage() {
  const { ponds, loading } = usePonds()
  const [harvestOpen, setHarvestOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ponds...</p>
        </div>
      </div>
    )
  }

  if (ponds.length === 0) {
    return <EmptyPonds />
  }

  return (
    <>
      {/* Header renders both buttons; we just provide the handler for Harvest */}
      <PondsWithData ponds={ponds} onClickHarvest={() => setHarvestOpen(true)} />

      <HarvestModal
        open={harvestOpen}
        onOpenChange={setHarvestOpen}
        ponds={ponds}
      />
    </>
  )
}
