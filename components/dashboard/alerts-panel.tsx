"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react"

import type { UnifiedPond } from "@/lib/pond-context"

// feeding schedules
import {
  feedingScheduleService,
  type FeedingSchedule,
} from "@/lib/feeding-schedule-service"

// feeding logs (shared by pondId)
import {
  subscribeFeedingLogs,
  type FeedingLog,
} from "@/lib/feeding-service"

// mortality logs & helpers
import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"

// growth setup (for ABW & weekly due)
import { GrowthService } from "@/lib/growth-service"

interface AlertsPanelProps {
  pond: UnifiedPond
}

type AlertType = "warning" | "error" | "success" | "info"

interface AlertItem {
  id: string
  type: AlertType
  title: string
  message: string
  when: Date
  severity: "low" | "medium" | "high"
}

export function AlertsPanel({ pond }: AlertsPanelProps) {
  if (!pond) return null

  // shared pond id so admin & users see same alerts
  const pondId = (pond as any)?.adminPondId || pond.id
  const initialStocked = (pond as any)?.initialFishCount ?? pond.fishCount ?? 0

  // live state
  const [schedules, setSchedules] = useState<FeedingSchedule[]>([])
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([])
  const [mortalityLogs, setMortalityLogs] = useState<MortalityLog[]>([])
  const [lastABWUpdate, setLastABWUpdate] = useState<Date | null>(null)

  // ---- subscriptions ----
  useEffect(() => {
    if (!pondId) return

    // Accepts either a single schedule or an array (for compatibility)
    const handleScheduleUpdate = (scheduleOrArray: FeedingSchedule | FeedingSchedule[] | null) => {
      const arr = Array.isArray(scheduleOrArray)
        ? scheduleOrArray
        : scheduleOrArray
        ? [scheduleOrArray]
        : []
      setSchedules(arr.filter((s) => !!s?.isActive))
    }

    // Your service expects (schedule: FeedingSchedule | null) => void,
    // so we cast our more-flexible handler to that narrower type.
    const unsubSchedule = feedingScheduleService.subscribeByPond(
      pondId,
      handleScheduleUpdate as unknown as (schedule: FeedingSchedule | null) => void
    )

    const unsubFeed = subscribeFeedingLogs(pondId, (logs: FeedingLog[] = []) => setFeedingLogs(logs))

    const unsubMort = subscribeMortalityLogs(pondId, (logs: MortalityLog[] = []) => setMortalityLogs(logs))

    // 4) growth setup (one-shot load for ABW due)
    ;(async () => {
      try {
        const setup = await GrowthService.getGrowthSetup(pondId, "shared")
        if (setup?.lastABWUpdate) {
          const d =
            (setup.lastABWUpdate as any)?.toDate?.() ??
            (typeof (setup.lastABWUpdate as any)?.seconds === "number"
              ? new Date((setup.lastABWUpdate as any).seconds * 1000)
              : new Date(setup.lastABWUpdate as any))
          setLastABWUpdate(d || null)
        } else {
          setLastABWUpdate(null)
        }
      } catch {
        setLastABWUpdate(null)
      }
    })()

    return () => {
      try { unsubSchedule() } catch {}
      try { unsubFeed() } catch {}
      try { unsubMort() } catch {}
    }
  }, [pondId])

  // ---- derived metrics ----
  const survivalPct = useMemo(() => computeSurvivalRateFromLogs(mortalityLogs), [mortalityLogs])
  const estAlive = useMemo(
    () => Math.max(0, Math.round((survivalPct / 100) * (initialStocked || 0))),
    [survivalPct, initialStocked]
  )

  const latestFeedAt = useMemo<Date | null>(() => {
    if (!feedingLogs.length) return null
    const d = feedingLogs[0]?.fedAt
    return d ? new Date(d) : null
  }, [feedingLogs])

  const minutesAgo = (d: Date | null) =>
    d ? Math.round((Date.now() - d.getTime()) / 60000) : Infinity

  // find the next scheduled feeding today in minutes
  const nextScheduledMinutes = useMemo<number | null>(() => {
    if (!schedules.length) return null
    const tz = "Asia/Manila"
    const now = new Date()

    const todayMins: number[] = []
    for (const s of schedules) {
      if (!s?.isActive || !Array.isArray(s.feedingTimes)) continue
      for (const hhmm of s.feedingTimes) {
        const [hh, mm] = (hhmm || "00:00").split(":").map((v) => Number(v))
        const localISO =
          new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(now) +
          `T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`
        const t = new Date(localISO)
        const mins = Math.round((t.getTime() - now.getTime()) / 60000)
        if (mins >= 0) todayMins.push(mins)
      }
    }
    if (!todayMins.length) return null
    return Math.min(...todayMins)
  }, [schedules])

  // ---- build alerts from rules ----
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = []
    const now = new Date()

    // A) feeding overdue
    const overdueMins = minutesAgo(latestFeedAt)
    if (Number.isFinite(overdueMins) && overdueMins > 120) {
      list.push({
        id: "feed-overdue",
        type: "warning",
        title: "Feeding overdue",
        message: `No feeding recorded for ${overdueMins} minutes.`,
        when: now,
        severity: "medium",
      })
    }

    // B) next feeding coming soon
    if (nextScheduledMinutes !== null && nextScheduledMinutes <= 50 && nextScheduledMinutes >= 0) {
      list.push({
        id: "feed-soon",
        type: "info",
        title: "Feeding due soon",
        message: `Next scheduled feeding in ${nextScheduledMinutes} minutes.`,
        when: now,
        severity: "low",
      })
    }

    // C) survival drop
    if (survivalPct < 80) {
      list.push({
        id: "low-survival",
        type: "warning",
        title: "Survival below 80%",
        message: `Estimated fish alive: ${estAlive.toLocaleString()} (${survivalPct.toFixed(1)}% survival).`,
        when: now,
        severity: "medium",
      })
    }

    // D) ABW update due (weekly)
    if (lastABWUpdate) {
      const days = Math.floor((Date.now() - lastABWUpdate.getTime()) / (1000 * 60 * 60 * 24))
      if (days >= 7) {
        list.push({
          id: "abw-due",
          type: "info",
          title: "ABW measurement due",
          message: `It’s been ${days} days since the last ABW update.`,
          when: now,
          severity: "low",
        })
      }
    } else {
      list.push({
        id: "abw-missing",
        type: "info",
        title: "ABW not set",
        message: "No ABW measurement has been recorded yet.",
        when: now,
        severity: "low",
      })
    }

    if (list.length === 0) {
      list.push({
        id: "all-good",
        type: "success",
        title: "All systems normal",
        message: "No alerts at this time.",
        when: now,
        severity: "low",
      })
    }

    return list.sort((a, b) => b.when.getTime() - a.when.getTime())
  }, [latestFeedAt, nextScheduledMinutes, survivalPct, estAlive, lastABWUpdate])

  const [dismissed, setDismissed] = useState<Record<string, true>>({})
  const visibleAlerts = alerts.filter((a) => !dismissed[a.id])

  const clearAll = () => {
    const map: Record<string, true> = {}
    for (const a of alerts) map[a.id] = true
    setDismissed(map)
  }

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const getAlertBadgeColor = (type: AlertType) => {
    switch (type) {
      case "warning":
        return "bg-yellow-100 text-yellow-800"
      case "error":
        return "bg-red-100 text-red-800"
      case "success":
        return "bg-green-100 text-green-800"
      case "info":
      default:
        return "bg-blue-100 text-blue-800"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">System Alerts</CardTitle>
            <p className="text-sm text-gray-600">Live notifications from feeding, schedules, and survival</p>
          </div>
          {visibleAlerts.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {visibleAlerts.length > 0 ? (
          <div className="space-y-4">
            {visibleAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 mt-0.5">{getAlertIcon(alert.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                    <Badge className={`${getAlertBadgeColor(alert.type)} text-xs`}>{alert.type}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {alert.when.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500"
                  onClick={() => setDismissed((m) => ({ ...m, [alert.id]: true }))}
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600">No alerts at this time</p>
            <p className="text-sm text-gray-500">All systems are running normally</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
