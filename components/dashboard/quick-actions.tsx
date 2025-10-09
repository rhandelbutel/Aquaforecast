// components/dashboard/quick-actions.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Fish, Scale, Calendar, TrendingDown, Download, Settings as SettingsIcon } from "lucide-react"

import { FeedingScheduleModal } from "@/components/feeding/feeding-schedule-modal"
import { FeedingLogModal } from "@/components/feeding/feeding-log-modal"
import { MortalityLogModal } from "@/components/mortality/mortality-log-modal"
import { GrowthSetupModal } from "@/components/growth/growth-setup-modal"

import type { UnifiedPond } from "@/lib/pond-context"
import { feedingScheduleService, type FeedingSchedule } from "@/lib/feeding-schedule-service"
import { subscribeFeedingLogs, type FeedingLog } from "@/lib/feeding-service"

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

  // ---- NEW: schedule + logs to power the badge ----
  const sharedPondId = (pond as any)?.adminPondId || pond?.id
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null)
  const [logs, setLogs] = useState<FeedingLog[]>([])

  useEffect(() => {
    if (!sharedPondId) return

    const unsubSched = feedingScheduleService.subscribeByPond(sharedPondId, (s) => setSchedule(s))
    const unsubLogs = subscribeFeedingLogs(sharedPondId, (arr) => setLogs(arr))

    return () => {
      try { unsubSched?.() } catch {}
      try { unsubLogs?.() } catch {}
    }
  }, [sharedPondId])

  // Helpers to work with local time
  const makeDateForTime = (hhmm: string, base: Date) => {
    const [hh, mm] = (hhmm || "00:00").split(":").map((v) => Number(v))
    const d = new Date(base)
    d.setHours(hh || 0, mm || 0, 0, 0)
    return d
  }
  const dayMatches = (s: FeedingSchedule | null, d: Date) =>
    !s ? false : s.repeatType === "daily" ? true : (s.selectedDays ?? []).includes(d.getDay())

  const enumerateScheduledBetween = (s: FeedingSchedule | null, from: Date, to: Date) => {
    if (!s) return [] as Date[]
    const out: Date[] = []
    const cur = new Date(from)
    cur.setHours(0, 0, 0, 0)
    const limit = new Date(to)

    while (cur <= limit) {
      if (dayMatches(s, cur)) {
        for (const t of s.feedingTimes) {
          const dt = makeDateForTime(t, cur)
          if (dt >= from && dt <= to) out.push(dt)
        }
      }
      cur.setDate(cur.getDate() + 1)
    }
    return out.sort((a, b) => a.getTime() - b.getTime())
  }

  const findNextScheduled = (s: FeedingSchedule | null, now: Date) => {
    if (!s) return null
    // Try today, otherwise walk forward day by day until a matching day is found
    for (let i = 0; i < 14; i++) {
      const probe = new Date(now)
      probe.setDate(now.getDate() + i)
      if (!dayMatches(s, probe)) continue
      // Today: only future times; future day: all times
      const times = s.feedingTimes
        .map((t) => makeDateForTime(t, probe))
        .filter((dt) => i > 0 || dt > now)
        .sort((a, b) => a.getTime() - b.getTime())
      if (times.length) return times[0]
    }
    return null
  }

  // Badge values
  const { dueInMin, missedCount } = useMemo(() => {
    const now = new Date()
    let due: number | null = null
    let missed = 0

    // Due badge → within next 15 minutes
    const next = findNextScheduled(schedule, now)
    if (next) {
      const ms = next.getTime() - now.getTime()
      const min = Math.ceil(ms / 60000)
      if (min > 0 && min <= 15) due = min
    }

    // Missed badge → scheduled in last 3 hours with no log within ±60 minutes
    if (schedule) {
      const start = new Date(now.getTime() - 3 * 60 * 60 * 1000)
      const scheduled = enumerateScheduledBetween(schedule, start, now)
      const TOL = 60 * 60 * 1000 // ±60 min
      for (const sch of scheduled) {
        const found = logs.some((l) => Math.abs(l.fedAt.getTime() - sch.getTime()) <= TOL)
        if (!found) missed += 1
      }
    }

    return { dueInMin: due, missedCount: missed }
  }, [schedule, logs])

  if (!pond) return null

  const handleFeedFish = () => setShowFeedingModal(true)
  const handleGrowthSetup = () => setShowGrowthSetupModal(true)
  const handleScheduleFeeding = () => setShowScheduleModal(true)
  const handleMortalityLog = () => setShowMortalityModal(true)
  const handleExportData = () => {
    // Placeholder for export data functionality
    console.log("Export data action triggered")
  }
  const handleOpenSettings = () => {
    router.push(`/settings?pond=${encodeURIComponent(pond.id)}`)
  }

  // --- Button with non-shrinking, in-tile badge ---
  const renderFeedButton = () => {
    const showMissed = missedCount > 0
    const showDue = !showMissed && dueInMin !== null

    return (
      <Button
        variant="outline"
        className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
        onClick={handleFeedFish}
      >
        <Fish className="h-6 w-6 text-cyan-600" />
        <span className="text-sm">Feed Fish</span>

        {showMissed && (
          <span className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5 shadow">
            Missed ×{missedCount}
          </span>
        )}
        {showDue && (
          <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 text-white text-[10px] px-2 py-0.5 shadow">
            Due {dueInMin}m
          </span>
        )}
      </Button>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          <p className="text-sm text-gray-600">Common pond management tasks</p>
        </CardHeader>
        <CardContent>
          {/* items-stretch + each Button uses w-full so tiles don't shrink */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-stretch">
            {renderFeedButton()}

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleGrowthSetup}
            >
              <Scale className="h-6 w-6 text-blue-600" />
              <span className="text-sm">Growth Setup</span>
            </Button>

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleScheduleFeeding}
            >
              <Calendar className="h-6 w-6 text-green-600" />
              <span className="text-sm">Schedule Feed</span>
            </Button>

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleMortalityLog}
            >
              <TrendingDown className="h-6 w-6 text-red-600" />
              <span className="text-sm">Mortality Log</span>
            </Button>

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleExportData}
            >
              <Download className="h-6 w-6 text-purple-600" />
              <span className="text-sm">Export Data</span>
            </Button>

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
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
