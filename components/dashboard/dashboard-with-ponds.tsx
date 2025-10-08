"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Fish, Plus, Thermometer, Droplets, Zap, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AddPondModal } from "../ponds/add-pond-modal"
import { usePonds } from "@/lib/pond-context"
import { RealtimeData } from "./realtime-data"
import { AlertsPanel } from "./alerts-panel"
import { QuickActions } from "./quick-actions"
import { HarvestPredictionDashboard } from "./harvest-prediction-dashboard"
import {
  getMortalityLogs,
  computeSurvivalRateFromLogs,
  subscribeMortalityLogs,
} from "@/lib/mortality-service"
import { useAquaSensors } from "@/hooks/useAquaSensors";

export function DashboardWithPonds() {
  const { ponds, refreshPonds } = usePonds()
  const [selectedPond, setSelectedPond] = useState<ReturnType<typeof usePonds>["ponds"][number] | null>(
    ponds[0] || null,
  )
  // Use env-configured base URL if provided; default to mDNS host
  const ESP32_BASE = (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local";
  const { data, error, isOnline } = useAquaSensors({
    baseUrl: ESP32_BASE,
    intervalMs: 1000,
  });

  const tempVal = data?.temp ?? NaN;
  const phVal   = data?.ph   ?? NaN;
  const doVal   = data?.do   ?? NaN;
  const tdsVal  = data?.tds  ?? NaN;


  const [showAddModal, setShowAddModal] = useState(false)

  // mortality-derived state used across the page
  const [aliveFish, setAliveFish] = useState<number | null>(null)
  const [survivalRate, setSurvivalRate] = useState<number | null>(null)

  // refresh growth widgets after edits
  const [growthRefresh, setGrowthRefresh] = useState(0)

  // keep selected pond synced with pond list
  useEffect(() => {
    if (ponds.length > 0 && !selectedPond) setSelectedPond(ponds[0])
    if (ponds.length === 0) setSelectedPond(null)
  }, [ponds, selectedPond])

  // one-time load (for immediate first paint)
  useEffect(() => {
    const run = async () => {
      if (!selectedPond) {
        setAliveFish(null)
        setSurvivalRate(null)
        return
      }
      const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond.id
      const initial = selectedPond.fishCount || 0
      try {
        const logs = await getMortalityLogs(sharedPondId)
        const sr = computeSurvivalRateFromLogs(logs) // 0–100
        const estAlive = Math.max(0, Math.round((sr / 100) * initial))
        setSurvivalRate(sr)
        setAliveFish(estAlive)
      } catch {
        setAliveFish(null)
        setSurvivalRate(null)
      }
    }
    run()
  }, [selectedPond?.id, (selectedPond as any)?.adminPondId, selectedPond?.fishCount])

  // REALTIME subscription — instant UI sync for admin AND shared users
  useEffect(() => {
    if (!selectedPond) return
    const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond.id
    const initial = selectedPond.fishCount || 0

    const unsub = subscribeMortalityLogs(sharedPondId, (logs) => {
      const sr = computeSurvivalRateFromLogs(logs) // 0–100
      const estAlive = Math.max(0, Math.round((sr / 100) * initial))
      setSurvivalRate(sr)
      setAliveFish(estAlive)
    })

    return () => {
      try {
        unsub?.()
      } catch {}
    }
  }, [selectedPond?.id, (selectedPond as any)?.adminPondId, selectedPond?.fishCount])

  const handleAddPond = () => setShowAddModal(true)
  const handleCloseModal = () => {
    setShowAddModal(false)
    refreshPonds()
  }

  function RealtimeClock({ data, isOnline }: { data: any; isOnline: boolean }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
      let timer: NodeJS.Timeout | null = null;

      if (isOnline) {
        // 🟢 Start updating time every second only when device is online
        timer = setInterval(() => setNow(new Date()), 1000);
      }

      // 🔴 Stop timer when offline
      return () => {
        if (timer) clearInterval(timer);
      };
    }, [isOnline]);

    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const uptime = data ? Math.round(data.ts / 1000) : 0;

    return (
      <p className="text-xs text-gray-500">
        As of{" "}
        <span className={`font-medium ${isOnline ? "text-green-700" : "text-red-600"}`}>
          {timeString}
        </span>{" "}
      </p>
    );
  }


  return (
    <>
      <div className="space-y-6">
        {/* Header with Pond Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600">Monitor your aquaculture operations</p>
          </div>

        <div className="flex items-center gap-3">
            {ponds.length > 0 && (
              <Select
                value={selectedPond?.id || ""}
                onValueChange={(value) => {
                  const pond = ponds.find((p) => p.id === value)
                  setSelectedPond(pond || null)
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select a pond" />
                </SelectTrigger>
                <SelectContent>
                  {ponds.map((pond) => (
                    <SelectItem key={pond.id} value={pond.id}>
                      <div className="flex items-center">
                        <Fish className="h-4 w-4 mr-2 text-cyan-600" />
                        {pond.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button onClick={handleAddPond} className="bg-cyan-600 hover:bg-cyan-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Pond
            </Button>
          </div>
        </div>

        {selectedPond ? (
          <>
            {/* Current Pond Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Fish className="h-5 w-5 mr-2 text-cyan-600" />
                  {selectedPond.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Species</p>
                    <p className="font-semibold">{selectedPond.fishSpecies || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Area</p>
                    <p className="font-semibold">{selectedPond.area || 0} m²</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Estimated Fish Count</p>
                    <p className="font-semibold flex items-baseline gap-2">
                      {aliveFish !== null ? aliveFish.toLocaleString() : "—"}
                      <span className="text-xs text-gray-500">
                        {survivalRate !== null ? `${survivalRate.toFixed(1)}% SR` : ""}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Feeding</p>
                    <p className="font-semibold">{selectedPond.feedingFrequency || 0}x daily</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Real-time Sensor Data */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-cyan-600" />
                  Real-time Sensor Data
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Live readings from {selectedPond.sensorId} •{" "}
                  <span className={isOnline ? "text-green-600" : "text-red-600"}>
                    {isOnline ? "Online" : "Offline"}
                  </span>
                  {error && <span className="ml-2 text-red-500">| (signal is aborted)</span>}
                </p>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Thermometer className="h-6 w-6 mx-auto mb-2 text-green-600" />
                    <p className="text-sm text-gray-600">Temperature</p>
                    <p className="text-xl font-bold">
                      {Number.isFinite(tempVal) ? `${tempVal.toFixed(1)} °C` : "—"}
                    </p>
                    <Badge
                      className={`text-xs ${
                        isOnline
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isOnline ? "Live" : "Offline"}
                    </Badge>

                  </div>

                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Droplets className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                    <p className="text-sm text-gray-600">pH Level</p>
                    <p className="text-xl font-bold">
                      {Number.isFinite(phVal) ? phVal.toFixed(2) : "—"}
                    </p>
                    <Badge
                      className={`text-xs ${
                        isOnline
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isOnline ? "Live" : "Offline"}
                    </Badge>

                  </div>

                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Zap className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                    <p className="text-sm text-gray-600">Dissolved Oxygen</p>
                    <p className="text-xl font-bold">
                      {Number.isFinite(doVal) ? `${doVal.toFixed(2)} mg/L` : "—"}
                    </p>
                    <Badge
                      className={`text-xs ${
                        isOnline
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isOnline ? "Live" : "Offline"}
                    </Badge>
                      </div>

                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Eye className="h-6 w-6 mx-auto mb-2 text-orange-600" />
                    <p className="text-sm text-gray-600">TDS</p>
                    <p className="text-xl font-bold">
                      {Number.isFinite(tdsVal) ? `${Math.round(tdsVal)} ppm` : "—"}
                    </p>
                    <Badge
                      className={`text-xs ${
                        isOnline
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isOnline ? "Live" : "Offline"}
                    </Badge>
                      </div>
                </div>

                <div className="mt-4 pt-4 border-t text-center">
                  <RealtimeClock data={data} isOnline={isOnline} />
                </div>


              </CardContent>
            </Card>



            {/* Harvest Prediction Dashboard */}
            <HarvestPredictionDashboard
              pond={selectedPond}
              aliveFish={aliveFish ?? selectedPond.fishCount}
              initialStocked={selectedPond.fishCount}
              survivalRate={survivalRate}
              refreshTrigger={growthRefresh}
            />

            {/* System Alerts */}
            <AlertsPanel pond={selectedPond} />

            {/* Quick Actions */}
            <QuickActions
              pond={selectedPond}
              // still fine to keep; subscription will catch changes too
              onMortalityUpdate={() => {
                // no-op; subscription handles it, but this keeps compatibility
              }}
              onGrowthUpdate={() => setGrowthRefresh((prev) => prev + 1)}
            />
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Fish className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Ponds Available</h3>
              <p className="text-gray-600 text-center mb-4">
                Get started by adding your first pond to monitor water quality and fish health.
              </p>
              <Button onClick={handleAddPond} className="bg-cyan-600 hover:bg-cyan-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Pond
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AddPondModal isOpen={showAddModal} onClose={handleCloseModal} />
    </>
  )
}
