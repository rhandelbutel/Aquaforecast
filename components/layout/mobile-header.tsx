"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Menu, Bell } from "lucide-react"
import { NotificationPanel } from "../notifications/notification-panel"
import { usePonds } from "@/lib/pond-context"
import { useAuth } from "@/lib/auth-context"
import { subscribeSnoozes, type SnoozeMap } from "@/lib/alert-snooze-service"
import { subscribeActiveAlerts, type StoredAlert } from "@/lib/alert-store-service"

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const { ponds } = usePonds()
  const { user } = useAuth()
  const uid = user?.uid
  const [dismissedUntil, setDismissedUntil] = useState<SnoozeMap>({})
  const [pondAlertsMap, setPondAlertsMap] = useState<Record<string, StoredAlert[]>>({})

  // Subscribe to user snoozes so badge respects dismissed items
  useEffect(() => {
    if (!uid) return
    const unsub = subscribeSnoozes(uid, {}, (m) => setDismissedUntil(m || {}))
    return unsub
  }, [uid])

  // Subscribe to active alerts across all ponds
  useEffect(() => {
    if (!ponds?.length) { setPondAlertsMap({}); return }
    const unsubs: Array<() => void> = []
    for (const p of ponds) {
      const pondId = (p as any)?.adminPondId || p.id
      if (!pondId) continue
      const unsub = subscribeActiveAlerts(pondId, (list) => {
        setPondAlertsMap(prev => ({ ...prev, [pondId]: list }))
      })
      unsubs.push(unsub)
    }
    return () => { for (const u of unsubs) try { u() } catch {} }
  }, [ponds])

  // Badge count = active alerts not snoozed (exclude purely "success"/normal items)
  const notificationCount = useMemo(() => {
    const now = Date.now()
    const dedup: Record<string, StoredAlert> = {}
    for (const list of Object.values(pondAlertsMap)) {
      for (const a of (list || [])) dedup[a.id] = a
    }
    const all = Object.values(dedup)
    const visible = all.filter(a => {
      const until = dismissedUntil[a.id]
      const notSnoozed = !until || now >= until
      const isActionable = (a as any)?.type !== "success"
      return notSnoozed && isActionable
    })
    return Math.min(visible.length, 9)
  }, [pondAlertsMap, dismissedUntil])

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg mr-2"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Logo replaces Fish icon — compact size */}
            <div className="relative h-6 w-6 md:h-7 md:w-7">
              <Image
                src="/Aquaforecast_logo1.png"
                alt="AquaForecast logo"
                fill
                sizes="(min-width: 768px) 28px, 24px"
                className="object-contain"
                priority
              />
            </div>

            <span className="ml-2 text-lg font-bold text-gray-900">AQUAFORECAST</span>
          </div>

          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-gray-600 hover:text-gray-900 relative"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </>
  )
}
