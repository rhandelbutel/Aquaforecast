"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, Calendar, Fish, AlertTriangle, AlertCircle } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import {
  getMortalityLogs,
  computeSurvivalRateFromLogs,
  updateMortalityLogRate,
  upsertMortalityRateForDate,
  createMortalityLogMonotonic, // ✅ NEW (create new doc when ABW due)
  type MortalityLog,
} from "@/lib/mortality-service"
import type { UnifiedPond } from "@/lib/pond-context"
import { GrowthService, type GrowthSetup } from "@/lib/growth-service"

interface MortalityLogModalProps {
  isOpen: boolean
  onClose: () => void
  pond: UnifiedPond
  onSuccess?: () => void
}

export function MortalityLogModal({ isOpen, onClose, pond, onSuccess }: MortalityLogModalProps) {
  const { user } = useAuth()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [logs, setLogs] = useState<MortalityLog[]>([])
  const [latest, setLatest] = useState<MortalityLog | null>(null)
  const [editingRate, setEditingRate] = useState<string>("")
  const [dateStr, setDateStr] = useState<string>("")
  const [setup, setSetup] = useState<GrowthSetup | null>(null)
  const [isAbwDue, setIsAbwDue] = useState<boolean>(false)
  const [daysUntil, setDaysUntil] = useState<number>(0)

  const sharedPondId = (pond as any)?.adminPondId || pond?.id

  const toYMD = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)

  useEffect(() => {
    if (!isOpen || !sharedPondId) return
    ;(async () => {
      setLoading(true)
      try {
        // growth setup (for cadence)
        const s = await GrowthService.getGrowthSetup(sharedPondId, "shared")
        setSetup(s)
        setIsAbwDue(!!s ? GrowthService.isABWDue(s.lastABWUpdate) : true)
        setDaysUntil(!!s ? GrowthService.getDaysUntilNextUpdate(s.lastABWUpdate) : 0)

        // mortality logs
        const l = await getMortalityLogs(sharedPondId)
        setLogs(l)
        const newest = l[0] ?? null
        setLatest(newest)

        // initial inputs
        setEditingRate(
          typeof newest?.mortalityRate === "number" ? String(newest.mortalityRate) : ""
        )
        setDateStr(newest?.date ? toYMD(new Date(newest.date)) : toYMD(new Date()))
        setError("")
      } catch (e) {
        console.error(e)
        setError("Failed to load mortality record.")
      } finally {
        setLoading(false)
      }
    })()
  }, [isOpen, sharedPondId])

  // derived metrics
  const initialFishCount = pond?.fishCount || 0
  const survivalPct = computeSurvivalRateFromLogs(logs) // 0–100
  const estimatedAlive = Math.max(0, Math.round((survivalPct / 100) * initialFishCount))
  const latestRate =
    typeof latest?.mortalityRate === "number" ? latest.mortalityRate : undefined

  const parsedDate: Date | null = useMemo(() => {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split("-").map((n) => Number(n))
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
  }, [dateStr])

  const previousRate = useMemo(() => (logs[0]?.mortalityRate ?? undefined), [logs])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sharedPondId) return

    const rate = Number.parseFloat(editingRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError("Enter a valid mortality rate between 0 and 100.")
      return
    }
    if (!parsedDate) {
      setError("Invalid date.")
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")
    try {
      if (isAbwDue || !latest) {
        // 🆕 New 15-day period (or first ever) → create a NEW mortality doc
        await createMortalityLogMonotonic({
          pondId: sharedPondId,
          pondName: pond.name,
          userId: user.uid,
          date: parsedDate,
          mortalityRate: rate,
        })
      } else {
        // Same period → allow update of the latest record
        await updateMortalityLogRate(sharedPondId, latest.id!, rate)
      }

      setSuccess(isAbwDue || !latest ? "Mortality recorded for new period." : "Mortality rate updated.")
      const l = await getMortalityLogs(sharedPondId)
      setLogs(l)
      const newest = l[0] ?? null
      setLatest(newest)
      setEditingRate(
        typeof newest?.mortalityRate === "number" ? String(newest.mortalityRate) : ""
      )
      setDateStr(newest?.date ? toYMD(new Date(newest.date)) : toYMD(new Date()))
      setTimeout(() => setSuccess(""), 1400)
      onSuccess?.()
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "Failed to save mortality. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl flex items-center">
            <Fish className="h-5 w-5 mr-2 text-red-600" />
            Mortality Record – {pond.name}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* cadence banner */}
          {setup && (
            <div className={`text-xs flex items-center gap-2 ${isAbwDue ? "text-indigo-700" : "text-yellow-700"}`}>
              <AlertCircle className="h-4 w-4" />
              {isAbwDue
                ? "New 15-day period: you can record a new mortality rate now (must be ≥ previous)."
                : `Next period in ${daysUntil} day(s). You can still edit the current period's value.`}
            </div>
          )}

          {/* TOP METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {estimatedAlive.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Estimated Fish Alive</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {typeof latestRate === "number" ? `${latestRate}%` : "—"}
              </div>
              <div className="text-sm text-gray-600">Latest Mortality Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {survivalPct.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">
                Survival % = (Alive ÷ Stocked) × 100
              </div>
            </div>
          </div>

          {/* EDIT FORM */}
          <form onSubmit={handleSave} className="space-y-4 border-t pt-4">
            <h3 className="text-lg font-semibold">Record Mortality</h3>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mortality-date">Date</Label>
                <div className="relative">
                  <Input id="mortality-date" type="date" value={dateStr} disabled />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mortality-rate">Mortality Rate (%)</Label>
                <Input
                  id="mortality-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={editingRate}
                  onChange={(e) => setEditingRate(e.target.value)}
                  placeholder="Enter mortality %"
                  required
                />
                {isAbwDue && typeof previousRate === "number" && (
                  <p className="text-xs text-gray-500">
                    Must be ≥ previous period’s {previousRate}%.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={onClose}
                disabled={loading || saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={loading || saving}
              >
                {saving ? "Saving..." : isAbwDue || !latest ? "Save (New Period)" : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
