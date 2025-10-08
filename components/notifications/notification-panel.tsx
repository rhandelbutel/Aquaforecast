// components/notifications/notification-panel.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X, AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react"

import { usePonds } from "@/lib/pond-context"
import { useAuth } from "@/lib/auth-context"

// 🔔 same services used by AlertsPanel
import {
  subscribeSnoozes,
  setSnoozes,
  pruneExpiredSnoozes,
  type SnoozeMap,
} from "@/lib/alert-snooze-service"

import {
  subscribeActiveAlerts,
  type StoredAlert,
} from "@/lib/alert-store-service"

type AlertType = "warning" | "error" | "success" | "info"

interface NotificationPanelProps {
  onClose: () => void
  /** Optional: limit how many notifications to show (defaults to 6) */
  limit?: number
}

const SNOOZE_MS = 60 * 60 * 1000 // 1 hour

const getNotificationIcon = (type: AlertType) => {
  switch (type) {
    case "error": return XCircle
    case "warning": return AlertTriangle
    case "info": return Info
    case "success": return CheckCircle
    default: return Info
  }
}
const getNotificationColor = (type: AlertType) => {
  switch (type) {
    case "error": return "text-red-600"
    case "warning": return "text-yellow-600"
    case "info": return "text-blue-600"
    case "success": return "text-green-600"
    default: return "text-gray-600"
  }
}
const getBadgeColor = (type: AlertType) => {
  switch (type) {
    case "error": return "bg-red-100 text-red-800"
    case "warning": return "bg-yellow-100 text-yellow-800"
    case "info": return "bg-blue-100 text-blue-800"
    case "success": return "bg-green-100 text-green-800"
    default: return "bg-gray-100 text-gray-800"
  }
}

function formatWhen(d: Date) {
  const diff = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diff < 1) return "Just now"
  if (diff < 60) return `${diff} min ago`
  const hours = Math.floor(diff / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? "s" : ""} ago`
}

export function NotificationPanel({ onClose, limit = 6 }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { ponds } = usePonds()
  const { user } = useAuth()
  const uid = user?.uid

  // 🔴 all active alerts across visible ponds (from Firestore)
  const [remoteAlerts, setRemoteAlerts] = useState<StoredAlert[]>([])

  // 🔕 user snoozes (shared with AlertsPanel)
  const [dismissedUntil, setDismissedUntil] = useState<SnoozeMap>({})

  // Subscribe to snoozes for this user
  useEffect(() => {
    if (!uid) return
    const unsub = subscribeSnoozes(uid, {}, (m) => setDismissedUntil(m || {}))
    // opportunistically prune expired on mount
    pruneExpiredSnoozes(uid).catch(() => {})
    return unsub
  }, [uid])

  // Subscribe to each pond's active alerts and merge
  useEffect(() => {
    if (!ponds?.length) { setRemoteAlerts([]); return }
    const unsubs: Array<() => void> = []

    const all: Record<string, StoredAlert> = {}
    for (const p of ponds) {
      const pondId = (p as any)?.adminPondId || p.id
      const pondName = p.name || "Pond"
      if (!pondId) continue

      const unsub = subscribeActiveAlerts(pondId, (list) => {
        // tag with pondName (without mutating Firestore docs)
        for (const a of list) {
          all[a.id] = { ...a, pondName } as StoredAlert & { pondName?: string }
        }
        // convert to array, sort desc by updatedAt
        const arr = Object.values(all).sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() ?? 0
          const tb = b.updatedAt?.toMillis?.() ?? 0
          return tb - ta
        })
        setRemoteAlerts(arr)
      })
      unsubs.push(unsub)
    }
    return () => { for (const u of unsubs) try { u() } catch {} }
  }, [ponds])

  // Apply snoozes → only show non-snoozed alerts, exclude non-actionable "success" items
  const visible = useMemo(() => {
    const now = Date.now()
    const base = remoteAlerts.filter(a => {
      const until = dismissedUntil[a.id]
      const notSnoozed = !until || now >= until
      const isActionable = (a as any)?.type !== "success"
      return notSnoozed && isActionable
    })
    // keep most recent first and cap to limit
    return base.slice(0, limit)
  }, [remoteAlerts, dismissedUntil, limit])

  // close panel if click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  const markAllAsRead = async () => {
    // Snooze ALL active alerts currently loaded in the panel (not just visible)
    const ids = remoteAlerts.map(a => a.id)
    const until = Date.now() + SNOOZE_MS

    // optimistic local hide
    setDismissedUntil(m => {
      const next = { ...m }
      for (const id of ids) next[id] = until
      return next
    })

    // persist so AlertsPanel also hides them
    if (uid && ids.length) {
      try { await setSnoozes(uid, ids, until) } catch (e) { /* no-op */ }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 pt-16">
      <div ref={panelRef} className="bg-white shadow-lg max-w-md mx-auto">
        <Card className="rounded-none border-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Notifications</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="max-h-96 overflow-y-auto">
            {ponds.length === 0 ? (
              <div className="text-center py-8">
                <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No notifications</p>
                <p className="text-sm text-gray-400 mt-1">Add a pond to start receiving alerts</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                <p className="text-green-600 font-medium">All clear!</p>
                <p className="text-sm text-gray-500 mt-1">No notifications at this time</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((n) => {
                  const Icon = getNotificationIcon(n.type as AlertType)
                  const when =
                    n.updatedAt?.toDate?.() ??
                    (typeof (n as any).when === "string" || (n as any).when instanceof Date
                      ? new Date((n as any).when)
                      : new Date())
                  return (
                    <div key={n.id} className="p-3 border rounded-lg bg-white">
                      <div className="flex items-start space-x-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${getNotificationColor(n.type as AlertType)}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium text-sm">
                              {n.pondName ? `${n.title} — ${n.pondName}` : n.title}
                            </h4>
                            <Badge className={`${getBadgeColor(n.type as AlertType)} capitalize`}>{n.type}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{n.message}</p>
                          <p className="text-xs text-gray-500">{formatWhen(when)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {visible.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <Button variant="outline" className="w-full" onClick={markAllAsRead}>
                  Mark All as Read
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
