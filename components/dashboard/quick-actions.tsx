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
import { GrowthService } from "@/lib/growth-service"

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

  const sharedPondId = (pond as any)?.adminPondId || pond?.id

  // ---- Schedule (for the "Before schedule" badge) ----
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null)
  useEffect(() => {
    if (!sharedPondId) return
    const unsub = feedingScheduleService.subscribeByPond(sharedPondId, (s) => setSchedule(s))
    return () => { try { unsub?.() } catch {} }
  }, [sharedPondId])

  // ---- Growth setup state (for “Set up” & 15d badges) ----
  const [growthHasSetup, setGrowthHasSetup] = useState(false)
  const [growthHasTarget, setGrowthHasTarget] = useState(false)
  const [lastABWUpdate, setLastABWUpdate] = useState<Date | null>(null)

  useEffect(() => {
    if (!sharedPondId) return
    const unsub = GrowthService.subscribeGrowthSetup(sharedPondId, (setup) => {
      if (!setup) {
        setGrowthHasSetup(false)
        setGrowthHasTarget(false)
        setLastABWUpdate(null)
        return
      }
      setGrowthHasSetup(true)
      setGrowthHasTarget(typeof (setup as any).targetWeight === "number" && (setup as any).targetWeight > 0)

      const raw = (setup as any).lastABWUpdate
      let d: Date | null = null
      if (raw?.toDate) {
        try { d = raw.toDate() as Date } catch { d = null }
      } else if (typeof raw?.seconds === "number") {
        d = new Date(raw.seconds * 1000)
      } else if (raw) {
        const t = new Date(raw)
        d = isNaN(t.getTime()) ? null : t
      }
      setLastABWUpdate(d)
    })
    return () => { try { unsub?.() } catch {} }
  }, [sharedPondId])

  // ---- Ticker so badges update without manual refresh ----
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNowTick(Date.now())
    const id = setInterval(tick, 15000)
    const onVis = () => { if (document.visibilityState === "visible") tick() }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  // Helpers to work with local time (feeding)
  const makeDateForTime = (hhmm: string, base: Date) => {
    const [hh, mm] = (hhmm || "00:00").split(":").map((v) => Number(v))
    const d = new Date(base)
    d.setHours(hh || 0, mm || 0, 0, 0)
    return d
  }
  const dayMatches = (s: FeedingSchedule | null, d: Date) =>
    !s ? false : s.repeatType === "daily" ? true : (s.selectedDays ?? []).includes(d.getDay())

  const findNextScheduled = (s: FeedingSchedule | null, now: Date) => {
    if (!s) return null
    for (let i = 0; i < 14; i++) {
      const probe = new Date(now)
      probe.setDate(now.getDate() + i)
      if (!dayMatches(s, probe)) continue
      const times = s.feedingTimes
        .map((t) => makeDateForTime(t, probe))
        .filter((dt) => i > 0 || dt > now)
        .sort((a, b) => a.getTime() - b.getTime())
      if (times.length) return times[0]
    }
    return null
  }

  // ----- Badge: "Before schedule" (minutes until next feed) -----
  const dueInMin = useMemo(() => {
    const now = new Date(nowTick)
    const next = findNextScheduled(schedule, now)
    if (!next) return null
    const ms = next.getTime() - now.getTime()
    const min = Math.ceil(ms / 60000)
    return min > 0 && min <= 15 ? min : null
  }, [schedule, nowTick])

  // ----- Badge: Growth 15d+ when lastABWUpdate is >= 15 days ago -----
  const growthDaysSince = useMemo(() => {
    if (!lastABWUpdate) return null
    const ms = Date.now() - lastABWUpdate.getTime()
    if (ms < 0) return 0
    return Math.floor(ms / 86_400_000)
  }, [lastABWUpdate, nowTick])

  const showGrowthSetUpBadge = !growthHasSetup || !growthHasTarget
  const showGrowth15dBadge = !showGrowthSetUpBadge && growthDaysSince != null && growthDaysSince >= 15

  // Mortality follows ABW cadence: show the same "Due" when growth is due
  const showMortalityDueBadge = showGrowth15dBadge

  if (!pond) return null

  const handleFeedFish = () => setShowFeedingModal(true)
  const handleGrowthSetup = () => setShowGrowthSetupModal(true)
  const handleScheduleFeeding = () => setShowScheduleModal(true)
  const handleMortalityLog = () => setShowMortalityModal(true)
  const handleExportData = () => console.log("Export data action triggered")
  const handleOpenSettings = () => router.push(`/settings?pond=${encodeURIComponent(pond.id)}`)

  const renderFeedButton = () => {
    const showBefore = dueInMin !== null
    return (
      <Button
        variant="outline"
        className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
        onClick={handleFeedFish}
      >
        <Fish className="h-6 w-6 text-cyan-600" />
        <span className="text-sm">Feed Fish</span>
        {showBefore && (
          <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 text-white text-[10px] px-2 py-0.5 shadow">
            Due {dueInMin} min
          </span>
        )}
      </Button>
    )
  }

  const renderGrowthButton = () => {
    return (
      <Button
        variant="outline"
        className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
        onClick={handleGrowthSetup}
      >
        <Scale className="h-6 w-6 text-blue-600" />
        <span className="text-sm">Growth Setup</span>

        {showGrowthSetUpBadge && (
          <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 shadow">
            Set up
          </span>
        )}
        {showGrowth15dBadge && (
          <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 shadow">
            {growthDaysSince}d
          </span>
        )}
      </Button>
    )
  }

  const renderMortalityButton = () => {
    return (
      <Button
        variant="outline"
        className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
        onClick={handleMortalityLog}
      >
        <TrendingDown className="h-6 w-6 text-red-600" />
        <span className="text-sm">Mortality Log</span>
        {showMortalityDueBadge && (
          <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 shadow">
            Due
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-stretch">
            {renderFeedButton()}
            {renderGrowthButton()}

            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={handleScheduleFeeding}
            >
              <Calendar className="h-6 w-6 text-green-600" />
              <span className="text-sm">Schedule Feed</span>
            </Button>

            {renderMortalityButton()}

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
