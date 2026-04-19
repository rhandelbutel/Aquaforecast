// components/ponds/ponds-with-data.tsx
"use client"

import { useState } from "react"
import type { UnifiedPond } from "@/lib/pond-context"
import { PondStats } from "./pond-stats"
import { PondGrid } from "./pond-grid"
import { Button } from "@/components/ui/button"
import { Plus, History } from "lucide-react"
import { AddPondModal } from "./add-pond-modal"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PondsWithDataProps {
  ponds: UnifiedPond[]
  onClickHarvest?: () => void
  onClickHistory?: () => void
}

export function PondsWithData({
  ponds,
  onClickHarvest,
  onClickHistory,
}: PondsWithDataProps) {
  const [showAddPond, setShowAddPond] = useState(false)
  const [showPondLimitAlert, setShowPondLimitAlert] = useState(false)

  const handleAddPond = () => {
    if (ponds.length >= 1) {
      setShowPondLimitAlert(true)
      return
    }
    setShowAddPond(true)
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pond Overview</h1>
            <p className="text-gray-600 mt-1">Monitor all your fish ponds</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleAddPond}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Pond
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClickHarvest}>
                Harvest
              </Button>

              <Button
                variant="outline"
                onClick={onClickHistory}
                className="sm:px-3 px-2"
                aria-label="View History"
                title="View History"
              >
                <History className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">View History</span>
              </Button>
            </div>
          </div>
        </div>

        <PondStats ponds={ponds} />
        <PondGrid ponds={ponds} />
      </div>

      {showPondLimitAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Pond Limit Reached</h3>
            <Alert>
              <AlertDescription>
                The current version only supports one pond. Multiple pond support will be available in future updates.
              </AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={() => setShowPondLimitAlert(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}

      <AddPondModal isOpen={showAddPond} onClose={() => setShowAddPond(false)} />
    </>
  )
}