// components/ponds/pond-grid.tsx
"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, Trash2, AlertTriangle, Thermometer, Droplets, Wind, AlertCircle } from "lucide-react"
import type { UnifiedPond } from "@/lib/pond-context"
import { PondDetailsModal } from "./pond-details-modal"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { deleteAdminPond } from "@/lib/admin-pond-service"
import { usePonds } from "@/lib/pond-context"
import { useAquaSensors } from "@/hooks/useAquaSensors"

// ==================== SENSOR ENDPOINT CONFIG ====================
// Prefer env; falls back to mDNS host.
// Example: NEXT_PUBLIC_SENSORS_BASE=http://192.168.1.157
const ESP32_BASE =
  (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local"
// ===============================================================

// Tilapia-friendly defaults (tweak to your SOP)
type Status = "optimal" | "warning" | "danger" | "offline"
const RANGES = {
  ph:   { min: 6.5, max: 9.0 },
  temp: { min: 28,  max: 31 },
  do:   { min: 3,   max: 5 },
  tds:  { min: 100, max: 400 },
};

function classify(value: number | null | undefined, min: number, max: number): Status {
  if (value == null || !Number.isFinite(value)) return "offline"
  if (value >= min && value <= max) return "optimal"
  const span = Math.max(1, max - min)
  const warnLow = min - span * 0.1
  const warnHigh = max + span * 0.1
  if (value >= warnLow && value <= warnHigh) return "warning"
  return "danger"
}

function getStatusIcon(sensorType: string, status: Status) {
  const iconClass = "h-4 w-4"
  const colorClass =
    status === "optimal" ? "text-green-600"
    : status === "warning" ? "text-amber-600"
    : status === "danger"  ? "text-red-600"
    : "text-gray-500"

  switch (sensorType) {
    case "temperature":
      return <Thermometer className={`${iconClass} ${colorClass}`} />
    case "ph":
      return <Droplets className={`${iconClass} ${colorClass}`} />
    case "dissolvedOxygen":
      return <Wind className={`${iconClass} ${colorClass}`} />
    case "tds":
      return <Droplets className={`${iconClass} ${colorClass}`} />
    default:
      return <AlertCircle className={`${iconClass} ${colorClass}`} />
  }
}

function getStatusColor(status: Status) {
  switch (status) {
    case "optimal":
      return "text-green-600 bg-green-50"
    case "warning":
      return "text-amber-600 bg-amber-50"
    case "danger":
      return "text-red-600 bg-red-50"
    default:
      return "text-gray-600 bg-gray-50"
  }
}

function getOverall(statuses: Status[], isOnline: boolean) {
  if (!isOnline || statuses.every((s) => s === "offline")) return { label: "Offline", color: "bg-gray-100 text-gray-800" }
  if (statuses.includes("danger")) return { label: "Critical", color: "bg-red-100 text-red-800" }
  if (statuses.includes("warning")) return { label: "Warning", color: "bg-amber-100 text-amber-800" }
  return { label: "Optimal", color: "bg-green-100 text-green-800" }
}

interface PondGridProps {
  ponds: UnifiedPond[]
}

export function PondGrid({ ponds }: PondGridProps) {
  const { user } = useAuth()
  const { refreshPonds } = usePonds()
  const [selectedPond, setSelectedPond] = useState<UnifiedPond | null>(null)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [pondToDelete, setPondToDelete] = useState<UnifiedPond | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const userIsAdmin = isAdmin(user?.email || "")

  // 🔴 One poll for the whole grid (shared across cards)
  // If you truly have one device per pond, we can move this inside the map with sensorId-specific baseUrls.
  const { data, isOnline } = useAquaSensors({
    baseUrl: ESP32_BASE,
    intervalMs: 1500,
  })

  // Normalize readings
  const tempVal = Number.isFinite(Number(data?.temp)) ? Number(data?.temp) : null
  const phVal   = Number.isFinite(Number(data?.ph))   ? Number(data?.ph)   : null
  const doVal   = Number.isFinite(Number(data?.do))   ? Number(data?.do)   : null
  const tdsVal  = Number.isFinite(Number(data?.tds))  ? Number(data?.tds)  : null

  // Precompute metric statuses once
  const liveStatus = useMemo(() => {
    const temperature = classify(tempVal, RANGES.temp.min, RANGES.temp.max)
    const ph          = classify(phVal,   RANGES.ph.min,   RANGES.ph.max)
    const dissolvedOxygen = classify(doVal,   RANGES.do.min,   RANGES.do.max)
    const tds         = classify(tdsVal,  RANGES.tds.min,  RANGES.tds.max)
    const overall     = getOverall([temperature, ph, dissolvedOxygen, tds], isOnline)
    return { temperature, ph, dissolvedOxygen, tds, overall }
  }, [tempVal, phVal, doVal, tdsVal, isOnline])

  const handleDeletePond = (pond: UnifiedPond) => {
    setPondToDelete(pond)
    setShowDeleteAlert(true)
  }

  const confirmDeletePond = async () => {
    if (!pondToDelete?.id) return
    try {
      setIsDeleting(true)
      await deleteAdminPond(pondToDelete.id)
      await refreshPonds()
      setShowDeleteAlert(false)
      setPondToDelete(null)
    } catch (error) {
      console.error("Error deleting pond:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  if (ponds.length === 0) {
    return (
      <Card className="border-dashed border-2 border-gray-300">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Ponds Available</h3>
            <p className="text-gray-500">
              {userIsAdmin
                ? "Create your first pond to get started with monitoring."
                : "No ponds have been created by the administrator yet. Please contact your administrator to create a pond."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ponds.map((pond) => {
          // For now all cards show the same device readings.
          // If each pond has its own device, change to call useAquaSensors({ baseUrl: makeBase(pond.sensorId) }) per pond.
          const temperature = {
            value: tempVal == null ? "—" : `${tempVal.toFixed(1)}°C`,
            status: liveStatus.temperature as Status,
          }
          const ph = {
            value: phVal == null ? "—" : phVal.toFixed(1),
            status: liveStatus.ph as Status,
          }
          const dissolvedOxygen = {
            value: doVal == null ? "—" : `${doVal.toFixed(1)} mg/L`,
            status: liveStatus.dissolvedOxygen as Status,
          }
          const tds = {
            value: tdsVal == null ? "—" : `${tdsVal.toFixed(0)} ppm`,
            status: liveStatus.tds as Status,
          }

          return (
            <Card key={pond.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{pond.name}</CardTitle>
                  <Badge className={liveStatus.overall.color}>{liveStatus.overall.label}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Temperature</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("temperature", temperature.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(temperature.status)}`}>
                        {temperature.value}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">pH Level</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("ph", ph.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(ph.status)}`}>
                        {ph.value}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Dissolved O₂</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("dissolvedOxygen", dissolvedOxygen.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(dissolvedOxygen.status)}`}>
                        {dissolvedOxygen.value}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">TDS</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("tds", tds.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(tds.status)}`}>
                        {tds.value}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent"
                    onClick={() => setSelectedPond(pond)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View Details
                  </Button>
                  {userIsAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeletePond(pond)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Delete Confirmation Alert */}
      {showDeleteAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold">Delete Pond</h3>
            </div>
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                Are you sure you want to delete "{pondToDelete?.name}"? This action cannot be undone and will remove all
                associated data.
              </AlertDescription>
            </Alert>
            <div className="flex space-x-3 mt-4">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => setShowDeleteAlert(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={confirmDeletePond} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedPond && (
        <PondDetailsModal pond={selectedPond} isOpen={!!selectedPond} onClose={() => setSelectedPond(null)} />
      )}
    </>
  )
}
