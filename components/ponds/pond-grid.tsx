//components/ponds/pond-grid.tsx
"use client"

import { useState } from "react"
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

  // Mock sensor data - in real app this would come from your sensor service
  const getSensorData = (sensorId: string) => {
    const mockData = {
      temperature: 26.5,
      ph: 7.2,
      dissolvedOxygen: 8.1,
      tds: 450,
    }

    const getStatus = (value: number, optimal: [number, number], warning: [number, number]) => {
      if (value >= optimal[0] && value <= optimal[1]) return "optimal"
      if (value >= warning[0] && value <= warning[1]) return "warning"
      return "danger"
    }

    return {
      temperature: {
        value: mockData.temperature,
        status: getStatus(mockData.temperature, [25, 30], [20, 35]),
        unit: "°C",
      },
      ph: {
        value: mockData.ph,
        status: getStatus(mockData.ph, [6.5, 8.5], [6.0, 9.0]),
        unit: "",
      },
      dissolvedOxygen: {
        value: mockData.dissolvedOxygen,
        status: getStatus(mockData.dissolvedOxygen, [5, 12], [3, 15]),
        unit: "mg/L",
      },
      tds: {
        value: mockData.tds,
        status: getStatus(mockData.tds, [300, 600], [200, 800]),
        unit: "ppm",
      },
    }
  }

  const getStatusIcon = (sensorType: string, status: string) => {
    const iconClass = "h-4 w-4"
    const colorClass =
      status === "optimal" ? "text-green-500" : status === "warning" ? "text-yellow-500" : "text-red-500"

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal":
        return "text-green-600 bg-green-50"
      case "warning":
        return "text-yellow-600 bg-yellow-50"
      case "danger":
        return "text-red-600 bg-red-50"
      default:
        return "text-gray-600 bg-gray-50"
    }
  }

  const getOverallStatus = (sensorData: any) => {
    const statuses = Object.values(sensorData).map((sensor: any) => sensor.status)
    if (statuses.includes("danger")) return "Critical"
    if (statuses.includes("warning")) return "Warning"
    return "Optimal"
  }

  const getOverallStatusColor = (sensorData: any) => {
    const status = getOverallStatus(sensorData)
    switch (status) {
      case "Critical":
        return "bg-red-100 text-red-800"
      case "Warning":
        return "bg-yellow-100 text-yellow-800"
      case "Optimal":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

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
          const sensorData = getSensorData(pond.sensorId)

          return (
            <Card key={pond.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{pond.name}</CardTitle>
                  <Badge className={getOverallStatusColor(sensorData)}>{getOverallStatus(sensorData)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Temperature</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("temperature", sensorData.temperature.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(sensorData.temperature.status)}`}>
                        {sensorData.temperature.value}
                        {sensorData.temperature.unit}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">pH Level</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("ph", sensorData.ph.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(sensorData.ph.status)}`}>
                        {sensorData.ph.value}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Dissolved O₂</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("dissolvedOxygen", sensorData.dissolvedOxygen.status)}
                      <span
                        className={`text-sm px-2 py-1 rounded ${getStatusColor(sensorData.dissolvedOxygen.status)}`}
                      >
                        {sensorData.dissolvedOxygen.value}
                        {sensorData.dissolvedOxygen.unit}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">TDS</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon("tds", sensorData.tds.status)}
                      <span className={`text-sm px-2 py-1 rounded ${getStatusColor(sensorData.tds.status)}`}>
                        {sensorData.tds.value}
                        {sensorData.tds.unit}
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
