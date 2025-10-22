// components/dashboard/alerts-panel.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle, XCircle, WifiOff } from "lucide-react"
import type { UnifiedPond } from "@/lib/pond-context"
import { useAuth } from "@/lib/auth-context"

// 🔔 snoozes
import { subscribeSnoozes, setSnooze, setSnoozes, type SnoozeMap } from "@/lib/alert-snooze-service"

// 🔒 Firestore alerts store
import { materializeAlerts, subscribeActiveAlerts, type StoredAlert } from "@/lib/alert-store-service"

// 📡 live sensor polling hook
import { useAquaSensors } from "@/hooks/useAquaSensors"

/* ==================== SENSOR ENDPOINT CONFIG ==================== */
const ESP32_BASE =
  (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local"
/* =============================================================== */

/* ==================== RANGES (optimal windows) ==================== */
const RANGES = {
  ph:   { min: 6.5, max: 9.0, label: "6.5–9.0" },
  temp: { min: 28,  max: 31,  label: "28–31°C" },
  do:   { min: 3,   max: 5,   label: "3–5 mg/L" },
}
// ================================================================

// IMPORTANT: use only the platform-supported types
type AlertType = "warning" | "error"

interface AlertItem {
  id: string
  type: AlertType            // "warning" | "error"
  title: string
  message: string
  when: Date
  severity: "medium" | "high"
}

interface AlertsPanelProps { pond: UnifiedPond }

// ⏱️ Make dismissed sensor alerts reappear in 1 minute if still not optimal
const SNOOZE_MS = 60 * 1000

function classify(value: number, min: number, max: number): "optimal" | "warning" | "error" {
  if (Number.isNaN(value)) return "error"
  if (value >= min && value <= max) return "optimal"
  const span = max - min
  const warnLow = min - span * 0.1
  const warnHigh = max + span * 0.1
  if (value >= warnLow && value <= warnHigh) return "warning"
  return "error"
}

export function AlertsPanel({ pond }: AlertsPanelProps) {
  if (!pond) return null

  const { user } = useAuth()
  const uid = user?.uid
  const pondId = (pond as any)?.adminPondId || pond.id

  // 👉 live sensor data (polled every second by the hook)
  const { data, error, isOnline } = useAquaSensors({
    baseUrl: ESP32_BASE,
    intervalMs: 1000,
  })

  const phVal   = data?.ph   ?? NaN
  const tempVal = data?.temp ?? NaN
  const doVal   = data?.do   ?? NaN

  const phStatus   = classify(phVal,   RANGES.ph.min,   RANGES.ph.max)
  const tempStatus = classify(tempVal, RANGES.temp.min, RANGES.temp.max)
  const doStatus   = classify(doVal,   RANGES.do.min,   RANGES.do.max)

  // 🔕 snoozes
  const [dismissedUntil, setDismissedUntil] = useState<SnoozeMap>({})
  useEffect(() => {
    if (!uid) return
    const unsub = subscribeSnoozes(uid, {}, (m: any) => setDismissedUntil(m || {}))
    return unsub
  }, [uid])

  // 🔴 Firestore materialized alerts we render
  const [remoteAlerts, setRemoteAlerts] = useState<StoredAlert[]>([])
  useEffect(() => {
    if (!pondId) return
    const unsub = subscribeActiveAlerts(pondId, (list) => setRemoteAlerts(list))
    return unsub
  }, [pondId])

  const describeDir = (value: number, min: number, max: number) =>
    Number.isFinite(value)
      ? value < min ? "low" : value > max ? "high" : "out of range"
      : "unknown"

  // 🧮 Build sensor alerts list (auto-clears when values return to optimal / online)
  const baseAlerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = []
    const now = new Date()

    // Offline alert → store as "error"
    if (!isOnline || error) {
      list.push({
        id: "sensor-offline",
        type: "error",
        title: "Sensor offline",
        message: "No connection to the pond sensor. Check power/network.",
        when: now,
        severity: "high",
      })
      return list
    }

    const addParam = (
      key: "ph" | "temp" | "do",
      label: string,
      value: number,
      status: "optimal" | "warning" | "error"
    ) => {
      if (status === "optimal") return
      const range = RANGES[key]
      const dir = describeDir(value, range.min, range.max)
      const pretty = Number.isFinite(value)
        ? value.toFixed(key === "ph" ? 2 : 1)
        : "—"

      if (status === "warning") {
        list.push({
          id: `sensor-${key}-warning`,
          type: "warning",
          title: `${label} slightly ${dir}`,
          message: `${label} is ${pretty}. Optimal ${range.label}.`,
          when: now,
          severity: "medium",
        })
      } else {
        list.push({
          id: `sensor-${key}-error`,
          type: "error",
          title: `${label} dangerously ${dir}`,
          message: `${label} is ${pretty}. Optimal ${range.label}.`,
          when: now,
          severity: "high",
        })
      }
    }

    addParam("ph",   "pH",               phVal,   phStatus)
    addParam("temp", "Temperature (°C)", tempVal, tempStatus)
    addParam("do",   "Dissolved Oxygen", doVal,   doStatus)

    return list
  }, [isOnline, error, phVal, tempVal, doVal, phStatus, tempStatus, doStatus])

  // 🔴 MATERIALIZE to Firestore whenever baseAlerts change
  useEffect(() => {
    if (!pondId) return
    const toStore = baseAlerts.map(a => ({
      id: `${pondId}:${a.id}`,
      type: a.type,          // "warning" | "error" (platform-supported)
      title: a.title,
      message: a.message,
      severity: a.severity,
    }))
    materializeAlerts(pondId, toStore).catch((e) => {
      console.error("[AlertsPanel] materializeAlerts failed:", e)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pondId, JSON.stringify(baseAlerts.map(a => ({ id: a.id, type: a.type, msg: a.message }))) ])

  // combine remote active alerts + user snoozes
  const visibleAlerts = useMemo(() => {
    const now = Date.now()
    return remoteAlerts.filter(a => {
      const until = dismissedUntil[a.id]
      const notSnoozed = !until || now >= until
      // Only show our two severities
      const t = (a as any)?.type
      const isWanted = t === "warning" || t === "error"
      return notSnoozed && isWanted
    })
  }, [remoteAlerts, dismissedUntil])

  // Helper: is this the OFFLINE alert?
  const isOfflineAlert = (a: StoredAlert) => a.id === `${pondId}:sensor-offline`

  // Icons
  const getAlertIcon = (type: AlertType, id?: string) => {
    if (id === `${pondId}:sensor-offline`) return <WifiOff className="h-4 w-4 text-red-600" />
    switch (type) {
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "error":
      default:        return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  // Badge color now considers OFFLINE vs sensor threshold
  const getAlertBadgeColor = (a: StoredAlert) => {
    if (isOfflineAlert(a)) return "bg-red-100 text-red-800"     // error
    if ((a as any).type === "warning") return "bg-yellow-100 text-yellow-800" // warning
    return "bg-red-100 text-red-800"                             // danger (sensor error)
  }

  // Badge text: error ONLY for offline; otherwise danger/warning
  const badgeLabel = (a: StoredAlert) => {
    if (isOfflineAlert(a)) return "error"
    return (a as any).type === "warning" ? "warning" : "danger"
  }

  // Snooze handlers
  const dismissForAnHour = async (alertId: string) => {
    const until = Date.now() + SNOOZE_MS
    setDismissedUntil(m => ({ ...m, [alertId]: until }))
    if (!uid) return
    try { await setSnooze(uid, alertId, until) } catch (e) { console.error("setSnooze failed:", e) }
  }
  const clearAllForAnHour = async () => {
    const until = Date.now() + SNOOZE_MS
    setDismissedUntil(m => {
      const next = { ...m }
      for (const a of remoteAlerts) next[a.id] = until
      return next
    })
    if (!uid) return
    try { await setSnoozes(uid, remoteAlerts.map(a => a.id), until) } catch (e) { console.error("setSnoozes failed:", e) }
  }

  return (
    <div id="export-alerts" className="w-full">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">System Alerts</CardTitle>
              <p className="text-sm text-gray-600">
                Live notifications from sensors (pH, Temperature, DO) and device status
              </p>
            </div>
            {visibleAlerts.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearAllForAnHour}>
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visibleAlerts.length > 0 ? (
            <div className="space-y-4">
              {visibleAlerts.map((alert) => {
                const t = (alert as any).type as AlertType
                return (
                  <div key={alert.id} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0 mt-0.5">
                      {getAlertIcon(t, alert.id)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                        <Badge className={`${getAlertBadgeColor(alert)} text-xs`}>
                          {badgeLabel(alert)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {alert.updatedAt?.toDate ? alert.updatedAt.toDate().toLocaleTimeString() : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-500"
                      onClick={() => dismissForAnHour(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No alerts at this time</p>
              <p className="text-sm text-gray-500">All parameters are currently optimal</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
