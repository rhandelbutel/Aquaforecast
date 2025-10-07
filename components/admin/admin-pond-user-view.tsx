"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Waves, Fish, Eye, Droplets, Thermometer } from "lucide-react"
import { getAdminPond, type AdminPond } from "@/lib/admin-pond-service"
import { AdminPondModal } from "./admin-pond-modal"
import { AdminPondDetailsModal } from "./admin-pond-details-modal"

const getStatusColor = (status: string) => {
  switch (status) {
    case "optimal":
      return "bg-green-100 text-green-800"
    case "good":
      return "bg-blue-100 text-blue-800"
    case "warning":
      return "bg-yellow-100 text-yellow-800"
    case "danger":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

// Mock current sensor readings
const generateCurrentReadings = () => ({
  temperature: (24 + Math.random() * 2).toFixed(1) + "°C",
  ph: (7.0 + Math.random() * 0.5).toFixed(1),
  oxygen: (8.0 + Math.random() * 0.5).toFixed(1) + " mg/L",
  tds: (440 + Math.random() * 20).toFixed(0) + " ppm",
  status: Math.random() > 0.8 ? "warning" : "optimal",
})

export function AdminPondUserView() {
  const [pond, setPond] = useState<AdminPond | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  useEffect(() => {
    const loadPond = async () => {
      try {
        setLoading(true)
        const adminPond = await getAdminPond()
        setPond(adminPond)
      } catch (error) {
        console.error("Error loading admin pond:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPond()
  }, [])

  const handlePondSaved = (savedPond: AdminPond) => {
    setPond(savedPond)
    setShowCreateModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading pond overview...</p>
        </div>
      </div>
    )
  }

  if (!pond) {
    return (
      <>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pond Overview</h1>
              <p className="text-gray-600 mt-1">Monitor all fish ponds</p>
            </div>
            <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Pond
            </Button>
          </div>

          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Waves className="h-16 w-16 text-gray-400 mb-6" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No Ponds Created Yet</h3>
              <p className="text-gray-500 text-center mb-6 max-w-md">
                Create the first pond to start monitoring water quality and fish growth. This pond will be available to
                all approved users.
              </p>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Pond
              </Button>
            </CardContent>
          </Card>
        </div>

        <AdminPondModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handlePondSaved}
          pond={null}
          isEditing={false}
        />
      </>
    )
  }

  const readings = generateCurrentReadings()

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pond Overview</h1>
            <p className="text-gray-600 mt-1">Monitor all fish ponds</p>
          </div>
        </div>

        {/* Pond Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">1</div>
                <p className="text-sm text-gray-600 mt-1">Total Ponds</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{pond.initialFishCount.toLocaleString()}</div>
                <p className="text-sm text-gray-600 mt-1">Total Fish</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{pond.area.toLocaleString()} m²</div>
                <p className="text-sm text-gray-600 mt-1">Total Area</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">{pond.feedingFrequency}x/day</div>
                <p className="text-sm text-gray-600 mt-1">Avg Feeding</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pond Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{pond.name}</CardTitle>
                <Badge className={getStatusColor(readings.status)}>{readings.status}</Badge>
              </div>
              <div className="text-sm text-gray-600">
                {pond.fishSpecies} • {pond.area}m² • {pond.depth}m deep
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center">
                    <Thermometer className="h-4 w-4 mr-2 text-red-500" />
                    {readings.temperature}
                  </div>
                  <div className="flex items-center">
                    <Droplets className="h-4 w-4 mr-2 text-blue-500" />
                    pH {readings.ph}
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  <p>Oxygen: {readings.oxygen}</p>
                  <p>TDS: {readings.tds}</p>
                  <div className="flex items-center mt-2">
                    <Fish className="h-4 w-4 mr-1" />
                    <span>{pond.initialFishCount.toLocaleString()} fish</span>
                  </div>
                  <p className="text-xs mt-1">Fed {pond.feedingFrequency}x daily</p>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-3 bg-transparent"
                  onClick={() => setShowDetailsModal(true)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AdminPondDetailsModal pond={pond} isOpen={showDetailsModal} onClose={() => setShowDetailsModal(false)} />
    </>
  )
}
