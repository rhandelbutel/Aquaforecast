// lib/use-alerts.ts
"use client"

import { useEffect, useMemo, useState } from "react"
import type { UnifiedPond } from "@/lib/pond-context"

import {
  feedingScheduleService,
  type FeedingSchedule,
} from "@/lib/feeding-schedule-service"

import {
  subscribeFeedingLogs,
  type FeedingLog,
} from "@/lib/feeding-service"

import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"

import { GrowthService } from "@/lib/growth-service"

export type AlertType = "warning" | "error" | "success" | "info"
export type AlertSeverity = "low" | "medium" | "high"

export interface AlertItem {
  id: string
  type: AlertType
  title: string
  message: string
  when: Date
  severity: AlertSeverity
  pondId?: string
  pondName?: string
}

function minutesAgo(d: Date | null) {
  return d ? Math.round((Date.now() - d.getTime()) / 60000) : Infinity
}

/** Mirrors AlertsPanel’s logic for a single pond, returns a live list of alerts. */
export function useAlertsForPond(pond: UnifiedPond | null | undefined) {
  const pondId = (pond as any)?.adminPondId || pond?.id
  const initialStocked = (pond as any)?.initialFishCount ?? pond?.fishCount ?? 0

  const [schedules, setSchedules] = useState<FeedingSchedule[]>([])
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([])
  const [mortalityLogs, setMortalityLogs] = useState<MortalityLog[]>([])
  const [lastABWUpdate, setLastABWUpdate] = useState<Date | null>(null)

  // ---- subscriptions (same as AlertsPanel) ----
  useEffect(() => {
    if (!pondId) return

    const handleScheduleUpdate = (
      scheduleOrArray: FeedingSchedule | FeedingSchedule[] | null
    ) => {
      const arr = Array.isArray(scheduleOrArray)
        ? scheduleOrArray
        : scheduleOrArray
        ? [scheduleOrArray]
        : []
      setSchedules(arr.filter((s) => !!s?.isActive))
    }

    const unsubSchedule = feedingScheduleService.subscribeByPond(
      pondId,
      handleScheduleUpdate as unknown as (schedule: FeedingSchedule | null) => void
    )

    const unsubFeed = subscribeFeedingLogs(
      pondId,
      (logs: FeedingLog[] = []) => setFeedingLogs(logs)
    )

    const unsubMort = subscribeMortalityLogs(
      pondId,
      (logs: MortalityLog[] = []) => setMortalityLogs(logs)
    )

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

  // ---- derived ----
  const survivalPct = useMemo(
    () => computeSurvivalRateFromLogs(mortalityLogs),
    [mortalityLogs]
  )

  const estAlive = useMemo(
    () => Math.max(0, Math.round((survivalPct / 100) * (initialStocked || 0))),
    [survivalPct, initialStocked]
  )

  const latestFeedAt = useMemo<Date | null>(() => {
    if (!feedingLogs.length) return null
    const d = feedingLogs[0]?.fedAt
    return d ? new Date(d) : null
  }, [feedingLogs])

  const nextScheduledMinutes = useMemo<number | null>(() => {
    if (!schedules.length) return null
    const tz = "Asia/Manila"
    const now = new Date()

    const todayMins: number[] = []
    for (const s of schedules) {
      if (!s?.isActive || !Array.isArray(s.feedingTimes)) continue
      for (const hhmm of s.feedingTimes) {
        const [hh, mm] = (hhmm || "00:00").split(":").map(Number)
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

  // ---- alerts (same rules as AlertsPanel) ----
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = []
    const now = new Date()

    const overdueMins = minutesAgo(latestFeedAt)
    if (Number.isFinite(overdueMins) && overdueMins > 120) {
      list.push({
        id: `${pondId}-feed-overdue`,
        type: "warning",
        title: "Feeding overdue",
        message: `No feeding recorded for ${overdueMins} minutes.`,
        when: now,
        severity: "medium",
        pondId,
        pondName: pond?.name,
      })
    }

    if (nextScheduledMinutes !== null && nextScheduledMinutes <= 50 && nextScheduledMinutes >= 0) {
      list.push({
        id: `${pondId}-feed-soon`,
        type: "info",
        title: "Feeding due soon",
        message: `Next scheduled feeding in ${nextScheduledMinutes} minutes.`,
        when: now,
        severity: "low",
        pondId,
        pondName: pond?.name,
      })
    }

    if (survivalPct < 80) {
      list.push({
        id: `${pondId}-low-survival`,
        type: "warning",
        title: "Survival below 80%",
        message: `Estimated fish alive: ${estAlive.toLocaleString()} (${survivalPct.toFixed(1)}% survival).`,
        when: now,
        severity: "medium",
        pondId,
        pondName: pond?.name,
      })
    }

    if (lastABWUpdate) {
      const days = Math.floor((Date.now() - lastABWUpdate.getTime()) / (1000 * 60 * 60 * 24))
      if (days >= 7) {
        list.push({
          id: `${pondId}-abw-due`,
          type: "info",
          title: "ABW measurement due",
          message: `It’s been ${days} days since the last ABW update.`,
          when: now,
          severity: "low",
          pondId,
          pondName: pond?.name,
        })
      }
    } else {
      list.push({
        id: `${pondId}-abw-missing`,
        type: "info",
        title: "ABW not set",
        message: "No ABW measurement has been recorded yet.",
        when: now,
        severity: "low",
        pondId,
        pondName: pond?.name,
      })
    }

    if (list.length === 0) {
      list.push({
        id: `${pondId}-all-good`,
        type: "success",
        title: "All systems normal",
        message: "No alerts at this time.",
        when: now,
        severity: "low",
        pondId,
        pondName: pond?.name,
      })
    }

    return list.sort((a, b) => b.when.getTime() - a.when.getTime())
  }, [pondId, pond?.name, latestFeedAt, nextScheduledMinutes, survivalPct, estAlive, lastABWUpdate])

  return alerts
}

/** Helper to aggregate alerts for many ponds and cap count */
export function useAlertsForPonds(ponds: UnifiedPond[], max = 8) {
  const all = ponds.flatMap((p) => useAlertsForPond(p))
  // sort newest first & cap
  return useMemo(
    () => [...all].sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, max),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(all.map(a => ({ id: a.id, when: a.when.getTime() })))],
  )
}
