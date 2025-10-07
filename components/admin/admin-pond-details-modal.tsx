"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Droplets, Thermometer, Zap, Activity, Scale, Target } from "lucide-react"
import type { AdminPond } from "@/lib/admin-pond-service"
import { useEffect, useState } from "react"
import { GrowthService } from "@/lib/growth-service"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"

interface AdminPondDetailsModalProps {
  pond: AdminPond
  isOpen: boolean
  onClose: () => void
}

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

// Mock current readings
const generateDetailedReadings = () => ({
  temperature: (24 + Math.random() * 2).toFixed(1),
  ph: (7.0 + Math.random() * 0.5).toFixed(1),
  oxygen: (8.0 + Math.random() * 0.5).toFixed(1),
  tds: (440 + Math.random() * 20).toFixed(0),
  status: Math.random() > 0.8 ? "warning" : "optimal",
})

export function AdminPondDetailsModal({ pond, isOpen, onClose }: AdminPondDetailsModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [growthData, setGrowthData] = useState<any>(null)

  useEffect(() => {
    if (isOpen && user && pond.id) {
      loadGrowthData()
    }
  }, [isOpen, user, pond.id])

  const loadGrowthData = async () => {
    try {
      const setup = await GrowthService.getGrowthSetup(pond.id, user?.uid || '')
      setGrowthData(setup)
    } catch (error) {
      console.error('Error loading growth data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load growth tracking data',
        variant: 'destructive',
      })
    }
  }

  if (!isOpen) return null

  const readings = generateDetailedReadings()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl">{pond.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status</span>
            <Badge className={getStatusColor(readings.status)}>{readings.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Thermometer className="h-6 w-6 text-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{readings.temperature}°C</p>
              <p className="text-xs text-gray-600">Temperature</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Droplets className="h-6 w-6 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold">pH {readings.ph}</p>
              <p className="text-xs text-gray-600">pH Level</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Activity className="h-6 w-6 text-green-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{readings.oxygen} mg/L</p>
              <p className="text-xs text-gray-600">Dissolved Oxygen</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Zap className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{readings.tds} ppm</p>
              <p className="text-xs text-gray-600">TDS</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-semibold text-gray-900">Pond Information</h3>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Fish Species</span>
              <span className="text-sm font-medium">{pond.fishSpecies}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Area</span>
              <span className="text-sm font-medium">{pond.area} m²</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Depth</span>
              <span className="text-sm font-medium">{pond.depth} m</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Initial Fish Count</span>
              <span className="text-sm font-medium">{pond.initialFishCount.toLocaleString()}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Feeding Frequency</span>
              <span className="text-sm font-medium">{pond.feedingFrequency}x daily</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Assigned Sensor</span>
              <span className="text-sm font-medium">{pond.sensorId}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Stocking Density</span>
              <span className="text-sm font-medium">{(pond.initialFishCount / pond.area).toFixed(1)} fish/m²</span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Created</span>
              <span className="text-sm font-medium">
                {pond.createdAt ? new Date(pond.createdAt).toLocaleDateString() : "N/A"}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Growth Tracking
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Scale className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{growthData?.currentABW || 'N/A'}g</p>
                <p className="text-xs text-gray-600">Current ABW</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Target className="h-6 w-6 text-orange-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{growthData?.targetWeight || 'N/A'}g</p>
                <p className="text-xs text-gray-600">Target Weight</p>
              </div>
            </div>

            {growthData && (
              <div className="text-xs text-gray-500">
                Last updated: {growthData.lastABWUpdate?.toDate().toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="pt-4 border-t">
            <Button className="w-full bg-cyan-600 hover:bg-cyan-700" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
