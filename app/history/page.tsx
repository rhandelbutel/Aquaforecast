// app/history/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore"
import { ArrowLeft, Trash2 } from "lucide-react"
import { db } from "@/lib/firebase"
import { usePonds } from "@/lib/pond-context"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface WaterQualitySnapshotItem {
  date: string
  avg?: {
    ph?: number
    temp?: number
    do?: number
  }
}

interface Cycle {
  id: string
  pondName: string
  fishSpecies: string
  stockedFishCount: number
  partialHarvestEventsCount?: number
  partialHarvestCountTotal?: number
  finalHarvestCount?: number
  totalHarvestedCount: number
  mortalityCountEstimate: number
  survivalRate: number
  latestABW: number | null
  targetWeight: number | null
  cycleStartedAt?: any
  harvestDate?: any
  waterQualitySnapshot?: WaterQualitySnapshotItem[]
}

function toSafeDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate()
    } catch {
      return null
    }
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000)
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

function formatDate(value: any) {
  const d = toSafeDate(value)
  return d ? d.toLocaleDateString() : "-"
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : "-"
}

function summarizeWaterQuality(snapshot?: WaterQualitySnapshotItem[]) {
  if (!snapshot || snapshot.length === 0) {
    return {
      daysCaptured: 0,
      avgPh: null as number | null,
      avgTemp: null as number | null,
      avgDo: null as number | null,
    }
  }

  const phValues = snapshot
    .map((item) => item.avg?.ph)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))

  const tempValues = snapshot
    .map((item) => item.avg?.temp)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))

  const doValues = snapshot
    .map((item) => item.avg?.do)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))

  const mean = (arr: number[]) =>
    arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : null

  return {
    daysCaptured: snapshot.length,
    avgPh: mean(phValues),
    avgTemp: mean(tempValues),
    avgDo: mean(doValues),
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const { ponds } = usePonds()
  const { user } = useAuth()

  const userIsAdmin = !!user && isAdmin(user.email || "")

  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null)

  const loadHistory = async () => {
    if (!ponds.length) {
      setLoading(false)
      return
    }

    try {
      const pond = ponds[0]
      const pondId = (pond as any)?.adminPondId || pond.id

      const snap = await getDocs(collection(db, "ponds", pondId, "cycles"))

      const data: Cycle[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }))

      data.sort((a, b) => {
        const da = toSafeDate(a.harvestDate)?.getTime() ?? 0
        const dbb = toSafeDate(b.harvestDate)?.getTime() ?? 0
        return dbb - da
      })

      setCycles(data)
    } catch (e) {
      console.error("Failed to load history:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [ponds])

  const handleAskDelete = (cycle: Cycle) => {
    setSelectedCycle(cycle)
    setConfirmOpen(true)
  }

  const handleDeleteConfirmed = async () => {
    if (!selectedCycle || !ponds.length || !userIsAdmin) return

    setDeleting(true)
    try {
      const pond = ponds[0]
      const pondId = (pond as any)?.adminPondId || pond.id

      await deleteDoc(doc(db, "ponds", pondId, "cycles", selectedCycle.id))

      setCycles((prev) => prev.filter((c) => c.id !== selectedCycle.id))
      setConfirmOpen(false)
      setSelectedCycle(null)
    } catch (e) {
      console.error("Failed to delete history item:", e)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-gray-500">Loading history...</p>
      </div>
    )
  }

  if (cycles.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push("/ponds")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Ponds Page</span>
          </Button>
        </div>

        <h1 className="text-2xl font-bold mb-6">Harvest History</h1>

        <div className="text-center mt-20 text-gray-500">
          No harvest history yet.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push("/ponds")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Ponds Page</span>
          </Button>
        </div>

        <h1 className="text-2xl font-bold mb-6">Harvest History</h1>

        <div className="space-y-4">
          {cycles.map((c) => {
            const waterSummary = summarizeWaterQuality(c.waterQualitySnapshot)

            return (
              <div
                key={c.id}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div>
                    <h2 className="font-semibold text-lg">{c.pondName}</h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{c.fishSpecies}</span>

                    {userIsAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleAskDelete(c)}
                        aria-label={`Delete history for ${c.pondName}`}
                        title="Delete history"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Stocked</p>
                    <p className="font-medium">{c.stockedFishCount.toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Total Harvested</p>
                    <p className="font-medium">{c.totalHarvestedCount.toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Mortality</p>
                    <p className="font-medium">{c.mortalityCountEstimate.toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Survival</p>
                    <p className="font-medium">{c.survivalRate}%</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Partial Harvest Events</p>
                    <p className="font-medium">{(c.partialHarvestEventsCount ?? 0).toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Partial Harvest Total</p>
                    <p className="font-medium">{(c.partialHarvestCountTotal ?? 0).toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Final Harvest Count</p>
                    <p className="font-medium">{(c.finalHarvestCount ?? 0).toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Final ABW</p>
                    <p className="font-medium">
                      {c.latestABW != null ? `${c.latestABW} g` : "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500">Target</p>
                    <p className="font-medium">
                      {c.targetWeight != null ? `${c.targetWeight} g` : "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500">Start</p>
                    <p className="font-medium">{formatDate(c.cycleStartedAt)}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Harvest</p>
                    <p className="font-medium">{formatDate(c.harvestDate)}</p>
                  </div>
                </div>

                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Water Quality Snapshot</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Days Captured</p>
                      <p className="font-medium">{waterSummary.daysCaptured.toLocaleString()}</p>
                    </div>

                    <div>
                      <p className="text-gray-500">Avg pH</p>
                      <p className="font-medium">{formatMetric(waterSummary.avgPh)}</p>
                    </div>

                    <div>
                      <p className="text-gray-500">Avg Temp</p>
                      <p className="font-medium">{formatMetric(waterSummary.avgTemp, " °C")}</p>
                    </div>

                    <div>
                      <p className="text-gray-500">Avg DO</p>
                      <p className="font-medium">{formatMetric(waterSummary.avgDo, " mg/L")}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete History Record</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {selectedCycle
                ? `Are you sure you want to delete the archived history for "${selectedCycle.pondName}" harvested on ${formatDate(selectedCycle.harvestDate)}? This cannot be undone.`
                : "Are you sure you want to delete this history record? This cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (deleting) return
                setConfirmOpen(false)
                setSelectedCycle(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}