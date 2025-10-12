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
import ExportModal from "@/components/export/export-modal" // 👈 NEW

import type { UnifiedPond } from "@/lib/pond-context"
import { feedingScheduleService, type FeedingSchedule } from "@/lib/feeding-schedule-service"
import { subscribeMortalityLogs, type MortalityLog } from "@/lib/mortality-service"
import { useAuth } from "@/lib/auth-context"
import { subscribeUserProfile } from "@/lib/user-service"

interface QuickActionsProps {
  pond: UnifiedPond
  onMortalityUpdate?: () => void
  onGrowthUpdate?: () => void
}

const DAY_MS = 86_400_000

export function QuickActions({ pond, onMortalityUpdate, onGrowthUpdate }: QuickActionsProps) {
  const router = useRouter()
  const { user } = useAuth()

  const [showFeedingModal, setShowFeedingModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showMortalityModal, setShowMortalityModal] = useState(false)
  const [showGrowthSetupModal, setShowGrowthSetupModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false) // 👈 NEW

  const sharedPondId = (pond as any)?.adminPondId || pond?.id

  // ---- User phone badge (Settings) ----
  const [hasPhone, setHasPhone] = useState<boolean | null>(null)
  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeUserProfile(user.uid, (p) => {
      setHasPhone(!!(p?.phone && p.phone.trim().length > 0))
    })
    return () => { try { unsub?.() } catch {} }
  }, [user?.uid])

  // ---- Schedule (for badges) ----
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null)
  useEffect(() => {
    if (!sharedPondId) return
    const unsub = feedingScheduleService.subscribeByPond(sharedPondId, (s) => setSchedule(s))
    return () => { try { unsub?.() } catch {} }
  }, [sharedPondId])

  // ---- Mortality cadence ----
  const [lastMortalityDate, setLastMortalityDate] = useState<Date | null>(null)
  useEffect(() => {
    if (!sharedPondId) return
    const unsub = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) => {
      setLastMortalityDate(logs[0]?.date ?? null)
    })
    return () => { try { unsub?.() } catch {} }
  }, [sharedPondId])

  // tick for minute-level badges
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNowTick(Date.now())
    const id = setInterval(tick, 15000)
    const onVis = () => { if (document.visibilityState === "visible") tick() }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis) }
  }, [])

  // feeding helpers
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

  const toHHMM = (d: Date) => {
    const h = String(d.getHours()).padStart(2, "0")
    const m = String(d.getMinutes()).padStart(2, "0")
    return `${h}:${m}`
  }

  // exact-time FEED badge
  const feedNow = useMemo(() => {
    if (!schedule) return false
    const now = new Date(nowTick)
    if (!dayMatches(schedule, now)) return false
    const nowHHMM = toHHMM(now)
    return schedule.feedingTimes.some((t) => t === nowHHMM)
  }, [schedule, nowTick])

  // "Due X min" within next 15 min (hidden while feedNow)
  const dueInMin = useMemo(() => {
    if (feedNow) return null
    const now = new Date(nowTick)
    const next = findNextScheduled(schedule, now)
    if (!next) return null
    const ms = next.getTime() - now.getTime()
    const min = Math.ceil(ms / 60000)
    return min > 0 && min <= 15 ? min : null
  }, [schedule, nowTick, feedNow])

  const mortalityDue = useMemo(() => {
    if (!lastMortalityDate) return true
    const days = Math.floor((Date.now() - lastMortalityDate.getTime()) / DAY_MS)
    return days >= 15
  }, [lastMortalityDate, nowTick])

  if (!pond) return null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          <p className="text-sm text-gray-600">Common pond management tasks</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-stretch">
            {/* Feed */}
            <Button
              variant="outline"
              className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => setShowFeedingModal(true)}
            >
              <Fish className="h-6 w-6 text-cyan-600" />
              <span className="text-sm">Feed Fish</span>

              {feedNow && (
                <span className="absolute -top-2 -right-2 rounded-full bg-green-600 text-white text-[10px] px-2 py-0.5 shadow">
                  Feed
                </span>
              )}
              {!feedNow && dueInMin !== null && (
                <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 text-white text-[10px] px-2 py-0.5 shadow">
                  Due {dueInMin} min
                </span>
              )}
            </Button>

            {/* Growth setup */}
            <Button
              variant="outline"
              className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => setShowGrowthSetupModal(true)}
            >
              <Scale className="h-6 w-6 text-blue-600" />
              <span className="text-sm">Growth Setup</span>
            </Button>

            {/* Schedule feeding */}
            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => setShowScheduleModal(true)}
            >
              <Calendar className="h-6 w-6 text-green-600" />
              <span className="text-sm">Schedule Feed</span>
            </Button>

            {/* Mortality log */}
            <Button
              variant="outline"
              className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => setShowMortalityModal(true)}
            >
              <TrendingDown className="h-6 w-6 text-red-600" />
              <span className="text-sm">Mortality Log</span>
              {mortalityDue && (
                <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 shadow">
                  Due
                </span>
              )}
            </Button>

            {/* Export */}
            <Button
              variant="outline"
              className="w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => setShowExportModal(true)} // 👈 NEW
            >
              <Download className="h-6 w-6 text-purple-600" />
              <span className="text-sm">Export Data</span>
            </Button>

            {/* Settings with red badge if phone missing */}
            <Button
              variant="outline"
              className="relative w-full flex flex-col items-center p-4 h-auto space-y-2 bg-transparent"
              onClick={() => router.push(`/settings?pond=${encodeURIComponent(pond.id)}`)}
            >
              <SettingsIcon className="h-6 w-6 text-orange-600" />
              <span className="text-sm">Settings</span>
              {hasPhone === false && (
                <span className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5 shadow">
                  Add phone
                </span>
              )}
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

      {/* Export Modal 👇 NEW */}
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        pond={pond}
      />
    </>
  )
}
