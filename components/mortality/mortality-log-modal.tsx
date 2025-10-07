"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, Calendar, Fish, AlertTriangle } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import {
  getMortalityLogs,
  computeSurvivalRateFromLogs,
  updateMortalityLogRate,
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
  const [latest, setLatest] = useState<MortalityLog | null>(null)
  const [editingRate, setEditingRate] = useState<string>("")

  const sharedPondId = (pond as any)?.adminPondId || pond?.id

  // helpers
  const phDateString = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)

  // load all logs (we’ll use the latest for editing and all for survival calc)
  useEffect(() => {
    if (!isOpen || !sharedPondId) return
    ;(async () => {
      try {
        const l = await getMortalityLogs(sharedPondId)
        setLogs(l)
        const newest = l[0] ?? null
        setLatest(newest)
        setEditingRate(
          typeof newest?.mortalityRate === "number" ? String(newest.mortalityRate) : ""
        )
        setError("")
      } catch (e) {
        console.error(e)
        setError("Failed to load mortality record.")
      }
    })()
  }, [isOpen, sharedPondId])

  // derived metrics
  const initialFishCount = pond?.fishCount || 0
  const survivalPct = computeSurvivalRateFromLogs(logs) // 0–100
  const estimatedAlive = Math.max(0, Math.round((survivalPct / 100) * initialFishCount))
  const latestRate =
    typeof latest?.mortalityRate === "number" ? latest.mortalityRate : undefined

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sharedPondId || !latest?.id) return

    const rate = Number.parseFloat(editingRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError("Enter a valid mortality rate between 0 and 100.")
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await updateMortalityLogRate(sharedPondId, latest.id, rate)
      setSuccess("Mortality rate updated.")
      // refresh logs & derived metrics
      const l = await getMortalityLogs(sharedPondId)
      setLogs(l)
      const newest = l[0] ?? null
      setLatest(newest)
      setEditingRate(
        typeof newest?.mortalityRate === "number" ? String(newest.mortalityRate) : ""
      )
      setTimeout(() => setSuccess(""), 1400)
      onSuccess?.()
    } catch (err) {
      console.error(err)
      setError("Failed to update mortality rate. Please try again.")
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
          {/* TOP METRICS (match screenshot style but with requested values) */}
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

          {/* EDIT FORM (latest only) */}
          <form onSubmit={handleSave} className="space-y-4 border-t pt-4">
            <h3 className="text-lg font-semibold">Edit Latest Mortality</h3>

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
                  <Input
                    id="mortality-date"
                    type="date"
                    value={latest ? phDateString(latest.date) : ""}
                    disabled
                  />
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
                disabled={loading || saving || !latest}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
