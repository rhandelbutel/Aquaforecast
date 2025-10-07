//components/dashboard/quick-actions.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Fish, Scale, Calendar, TrendingDown, Download, Settings as SettingsIcon } from "lucide-react"

import { FeedingScheduleModal } from "@/components/feeding/feeding-schedule-modal"
import { FeedingLogModal } from "@/components/feeding/feeding-log-modal"
import { MortalityLogModal } from "@/components/mortality/mortality-log-modal"
import { GrowthSetupModal } from "@/components/growth/growth-setup-modal"
import type { UnifiedPond } from "@/lib/pond-context"

interface QuickActionsProps {
  pond: UnifiedPond
  onMortalityUpdate?: () => void
  onGrowthUpdate?: () => void
}

export function QuickActions({ pond, onMortalityUpdate, onGrowthUpdate }: QuickActionsProps) {
  const router = useRouter()

  const [showFeedingModal, setShowFeedingModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showMortalityModal, setShowMortalityModal] = useState(false)
  const [showGrowthSetupModal, setShowGrowthSetupModal] = useState(false)

  if (!pond) return null

  const handleFeedFish = () => setShowFeedingModal(true)
  const handleGrowthSetup = () => setShowGrowthSetupModal(true)
  const handleScheduleFeeding = () => setShowScheduleModal(true)
  const handleMortalityLog = () => setShowMortalityModal(true)

  const handleExportData = () => {
    // Placeholder for export data functionality
    console.log("Export data action triggered")
  }

  // ✅ New: open Settings page; include pond id in query for context
  const handleOpenSettings = () => {
    router.push(`/settings?pond=${encodeURIComponent(pond.id)}`)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          <p className="text-sm text-gray-600">Common pond management tasks</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleFeedFish}
            >
              <Fish className="h-6 w-6 text-cyan-600" />
              <span className="text-sm">Feed Fish</span>
            </Button>

            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleGrowthSetup}
            >
              <Scale className="h-6 w-6 text-blue-600" />
              <span className="text-sm">Growth Setup</span>
            </Button>

            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleScheduleFeeding}
            >
              <Calendar className="h-6 w-6 text-green-600" />
              <span className="text-sm">Schedule Feed</span>
            </Button>

            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleMortalityLog}
            >
              <TrendingDown className="h-6 w-6 text-red-600" />
              <span className="text-sm">Mortality Log</span>
            </Button>

            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleExportData}
            >
              <Download className="h-6 w-6 text-purple-600" />
              <span className="text-sm">Export Data</span>
            </Button>

            {/* ✅ Renamed + navigates to /settings */}
            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleOpenSettings}
            >
              <SettingsIcon className="h-6 w-6 text-orange-600" />
              <span className="text-sm">Settings</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <FeedingLogModal isOpen={showFeedingModal} onClose={() => setShowFeedingModal(false)} />
      <FeedingScheduleModal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} pond={pond} />

      <MortalityLogModal
        isOpen={showMortalityModal}
        onClose={() => setShowMortalityModal(false)}
        pond={pond}
        onSuccess={() => {
          setShowMortalityModal(false)
          onMortalityUpdate?.()
        }}
      />

      <GrowthSetupModal
        isOpen={showGrowthSetupModal}
        onClose={() => setShowGrowthSetupModal(false)}
        pond={pond}
        onDataChange={() => {
          onGrowthUpdate?.()
          setShowGrowthSetupModal(false)
        }}
        onSuccess={() => setShowGrowthSetupModal(false)}
      />
    </>
  )
}
