//components/feeding/feeding-log-modal.tsx
"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, Clock, Calendar, Lightbulb } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { usePonds } from "@/lib/pond-context"
import { addFeedingLog } from "@/lib/feeding-service"
import { GrowthService } from "@/lib/growth-service"
import { getMortalityLogs, computeSurvivalRateFromLogs } from "@/lib/mortality-service"

interface FeedingLogModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function FeedingLogModal({ isOpen, onClose, onSuccess }: FeedingLogModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const { user } = useAuth()
  const { ponds } = usePonds()

  const getPHDateString = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
  const getPHTimeString = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
  const parsePHDateTimeToUTC = (dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split("-").map((v) => Number(v))
    const [hh, mm] = timeStr.split(":").map((v) => Number(v))
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0))
  }

  const getNowStrings = () => {
    const now = new Date()
    return { date: getPHDateString(now), time: getPHTimeString(now) }
  }
  const { date: currentDate, time: currentTime } = getNowStrings()

  const [formData, setFormData] = useState({
    date: currentDate,
    time: currentTime,
    feedGiven: "",
    feedUnit: "g" as "g" | "kg",
  })

  const selectedPond = ponds[0]
  const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond?.id // << use this for ALL reads/writes

  const [abw, setAbw] = useState<number | null>(null)
  const [estimatedAlive, setEstimatedAlive] = useState<number | null>(null)
  const feedingFrequency = selectedPond?.feedingFrequency ?? 0

  const recommendedRateFromABW = (value?: number | null): number | null => {
    if (value == null || !Number.isFinite(value)) return null
    if (value < 2) return 20
    if (value >= 2 && value < 15) return 10
    if (value >= 15 && value < 100) return 5
    if (value >= 100) return 2.75
    return null
  }
  const recommendedRate = useMemo(() => recommendedRateFromABW(abw), [abw])

  const dailyFeedKg = useMemo(() => {
    if (!abw || !estimatedAlive || !recommendedRate || feedingFrequency <= 0) return null
    const biomassKg = (abw * estimatedAlive) / 1000
    return biomassKg * (recommendedRate / 100)
  }, [abw, estimatedAlive, recommendedRate, feedingFrequency])

  const perFeedingKg = useMemo(() => {
    if (!dailyFeedKg || feedingFrequency <= 0) return null
    return dailyFeedKg / feedingFrequency
  }, [dailyFeedKg, feedingFrequency])

  useEffect(() => {
    if (!isOpen) return
    const { date, time } = getNowStrings()
    setFormData((prev) => ({ ...prev, date, time }))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !user || !selectedPond || !sharedPondId) return
    ;(async () => {
      try {
        const setup = await GrowthService.getGrowthSetup(sharedPondId, user.uid)
        setAbw(setup?.currentABW ?? null)

        const logs = await getMortalityLogs(sharedPondId)
        const sr = computeSurvivalRateFromLogs(logs)
        const initial = selectedPond.fishCount || 0
        const alive = Math.max(0, Math.round((sr / 100) * initial))
        setEstimatedAlive(alive)
      } catch (e) {
        console.error("Suggestion sources error:", e)
      }
    })()
  }, [isOpen, sharedPondId, selectedPond, user])

  const handleInputChange = (field: string, value: string) => {
    if (field === "date") {
      const nextDate = value
      const isToday = nextDate === currentDate
      const nextTime = isToday && formData.time > currentTime ? currentTime : formData.time
      setFormData((prev) => ({ ...prev, date: nextDate, time: nextTime }))
      return
    }
    if (field === "time") {
      const isToday = formData.date === currentDate
      const cappedTime = isToday && value > currentTime ? currentTime : value
      setFormData((prev) => ({ ...prev, time: cappedTime }))
      return
    }
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateDateTime = () => {
    const selectedDateTime = parsePHDateTimeToUTC(formData.date, formData.time)
    if (selectedDateTime > new Date()) {
      setError("Cannot log feeding for future date/time")
      return false
    }
    return true
  }

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedPond || !sharedPondId) return
    if (!validateDateTime()) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const fedAt = parsePHDateTimeToUTC(formData.date, formData.time)
     await addFeedingLog({
  // ➜ use the shared id for both roles
  pondId: sharedPondId!,            // unified id for admin & user
  adminPondId: sharedPondId!,       // explicit field used by readers/subscribers
  pondName: selectedPond.name,
  userId: user.uid,
  userDisplayName: user.displayName || undefined,
  userEmail: user.email || undefined,
  fedAt,
  feedGiven: formData.feedGiven ? Number.parseFloat(formData.feedGiven) : undefined,
  feedUnit: formData.feedUnit,
})


      setSuccess("Feeding logged successfully!")
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setSuccess("")
        const newNow = new Date()
        setFormData({
          date: getPHDateString(newNow),
          time: getPHTimeString(newNow),
          feedGiven: "",
          feedUnit: "g",
        })
      }, 1200)
    } catch (err) {
      console.error("addFeedingLog failed:", err)
      setError("Failed to log feeding. Please try again.")
    } finally {
      setLoading(false)
    }
  }


  const applySuggestion = () => {
    if (!perFeedingKg) return
    if (formData.feedUnit === "kg") {
      setFormData((p) => ({ ...p, feedGiven: perFeedingKg.toFixed(2) }))
    } else {
      setFormData((p) => ({ ...p, feedGiven: (perFeedingKg * 1000).toFixed(0) }))
    }
  }

  if (!isOpen) return null

  if (!selectedPond) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl">Log Feeding</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>No pond available. Please add a pond first to log feeding.</AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={onClose}>
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="sticky top-0 bg-white z-10 flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl">Log Feeding</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="pond-name">Pond Name</Label>
              <Input id="pond-name" value={selectedPond.name} disabled className="bg-gray-50" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-date">Date</Label>
              <div className="relative">
                <Input
                  id="feed-date"
                  type="date"
                  value={formData.date}
                  max={currentDate}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  required
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-time">Time</Label>
              <div className="relative">
                <Input
                  id="feed-time"
                  type="time"
                  value={formData.time}
                  max={formData.date === currentDate ? currentTime : undefined}
                  onChange={(e) => handleInputChange("time", e.target.value)}
                  required
                />
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="feed-given">Feed Given</Label>
                <Input
                  id="feed-given"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 150"
                  value={formData.feedGiven}
                  onChange={(e) => handleInputChange("feedGiven", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feed-unit">Unit</Label>
                <Select value={formData.feedUnit} onValueChange={(val: "g" | "kg") => handleInputChange("feedUnit", val)}>
                  <SelectTrigger id="feed-unit">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Suggestion panel */}
            <div className="p-3 rounded-lg bg-blue-50 text-sm">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 mt-0.5 text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900">Suggested feed (auto-computed)</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <div className="text-blue-900/80">Current ABW:</div>
                    <div className="font-semibold">{abw != null ? `${abw} g` : "—"}</div>

                    <div className="text-blue-900/80">Estimated fish alive:</div>
                    <div className="font-semibold">{estimatedAlive != null ? estimatedAlive.toLocaleString() : "—"}</div>

                    <div className="text-blue-900/80">Feeding rate:</div>
                    <div className="font-semibold">
                      {recommendedRate != null ? `${recommendedRate}%` : "—"}{" "}
                      <span className="text-xs text-blue-900/60">(rule-of-thumb)</span>
                    </div>

                    <div className="text-blue-900/80">Feeding frequency:</div>
                    <div className="font-semibold">{feedingFrequency || "—"}× / day</div>

                    <div className="text-blue-900/80">Daily feed:</div>
                    <div className="font-semibold">{dailyFeedKg != null ? `${dailyFeedKg.toFixed(2)} kg` : "—"}</div>

                    <div className="text-blue-900/80">Per feeding:</div>
                    <div className="font-semibold">
                      {perFeedingKg != null
                        ? formData.feedUnit === "kg"
                          ? `${perFeedingKg.toFixed(2)} kg`
                          : `${Math.round(perFeedingKg * 1000)} g`
                        : "—"}
                    </div>
                  </div>

                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3 bg-white"
                      onClick={applySuggestion}
                      disabled={perFeedingKg == null}
                    >
                      Use suggestion
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-cyan-600 hover:bg-cyan-700" disabled={loading}>
                {loading ? "Logging..." : "Log Feeding"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
