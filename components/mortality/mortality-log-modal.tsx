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
  createMortalityLogMonotonic,
  canCreateMortalityNow,
  daysUntilNextMortality,
  type MortalityLog,
} from "@/lib/mortality-service"
import type { UnifiedPond } from "@/lib/pond-context"

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
  const [lastLogDate, setLastLogDate] = useState<Date | null>(null)

  const [rateStr, setRateStr] = useState("")
  const [dateStr, setDateStr] = useState("")

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
        const l = await getMortalityLogs(sharedPondId)
        setLogs(l)
        const latest = l[0] ?? null
        setLastLogDate(latest?.date ?? null)

        setDateStr(toYMD(new Date())) 
        setRateStr("")
        setError("")
        setSuccess("")
      } catch (e) {
        console.error(e)
        setError("Failed to load mortality record.")
      } finally {
        setLoading(false)
      }
    })()
  }, [isOpen, sharedPondId])

  const initialFishCount = pond?.fishCount || 0
  const survivalPct = computeSurvivalRateFromLogs(logs)
  const estimatedAlive = Math.max(0, Math.round((survivalPct / 100) * initialFishCount))

  const isDue = canCreateMortalityNow(lastLogDate)
  const daysLeft = daysUntilNextMortality(lastLogDate)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sharedPondId) return

    const rate = Number.parseFloat(rateStr)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setError("Enter a valid mortality rate (> 0 and ≤ 100).")
      return
    }
    if (!isDue) {
      setError(`Not due yet. You can record again in ${daysLeft} day(s).`)
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await createMortalityLogMonotonic({
        pondId: sharedPondId,
        pondName: pond.name,
        userId: user.uid,
        date: new Date(), // today only (no edit)
        mortalityRate: rate,
      })

      // refresh
      const l = await getMortalityLogs(sharedPondId)
      setLogs(l)
      const latest = l[0] ?? null
      setLastLogDate(latest?.date ?? null)

      setRateStr("")
      setSuccess("Mortality recorded for this 15-day period.")
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
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
          {/* Cadence banner */}
          <div className={`text-xs flex items-center gap-2 ${isDue ? "text-indigo-700" : "text-yellow-700"}`}>
            <AlertCircle className="h-4 w-4" />
            {isDue
              ? "New 15-day period: you can record a new mortality rate now."
              : `Next entry allowed in ${daysLeft} day(s).`}
          </div>

          {/* Top metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {estimatedAlive.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Estimated Fish Alive</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{survivalPct.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Survival % = (Alive ÷ Stocked) × 100</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">
                {lastLogDate ? toYMD(lastLogDate) : "—"}
              </div>
              <div className="text-sm text-gray-600">Last Mortality Entry</div>
            </div>
          </div>

          {/* Create-only form */}
          <form onSubmit={handleSave} className="space-y-4 border-t pt-4">
            <h3 className="text-lg font-semibold">Record Mortality (every 15 days)</h3>

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
                <Label>Date</Label>
                <div className="relative">
                  <Input type="date" value={dateStr} disabled />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-500">Date is fixed to today. Entries are allowed once every 15 days.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mortality-rate">Mortality Rate (%)</Label>
                <Input
                  id="mortality-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                  placeholder="e.g. 1.5"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={onClose} disabled={loading || saving}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700" disabled={loading || saving || !isDue}>
                {saving ? "Saving..." : "Save (New Period)"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
