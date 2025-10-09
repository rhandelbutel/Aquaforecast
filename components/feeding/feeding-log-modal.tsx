"use client"

import type React from "react"
import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Clock, Calendar, Lightbulb } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { usePonds } from "@/lib/pond-context"
import { addFeedingLog, getFeedingLogsByPond } from "@/lib/feeding-service"
import { feedingScheduleService } from "@/lib/feeding-schedule-service"
import { GrowthService } from "@/lib/growth-service"
import { getMortalityLogs, computeSurvivalRateFromLogs } from "@/lib/mortality-service"

/** ---- Local time helpers (Asia/Manila) ---- */
const TZ = "Asia/Manila"
const fmtDatePH = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d)
const fmtTimePH = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
const toUTCFromPH = (dateStr: string, timeStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = timeStr.split(":").map(Number)
  // Manila is UTC+8: subtract 8 hours to persist as UTC
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0))
}

/** Compute today’s YYYY-MM-DD and HH:mm in PH */
const nowStringsPH = () => {
  const now = new Date()
  return { date: fmtDatePH(now), time: fmtTimePH(now) }
}

interface FeedingLogModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function FeedingLogModal({ isOpen, onClose, onSuccess }: FeedingLogModalProps) {
  const { user } = useAuth()
  const { ponds } = usePonds()
  const selectedPond = ponds[0]
  const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond?.id

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState<null | {
    fedAt: Date
    grams: number
  }>(null)

  // form (only 'g' unit now)
  const { date: currentDate, time: currentTime } = nowStringsPH()
  const [formData, setFormData] = useState({
    date: currentDate,
    time: currentTime,
    feedGiven: "", // grams
  })

  // suggestions
  const [abw, setAbw] = useState<number | null>(null)
  const [estimatedAlive, setEstimatedAlive] = useState<number | null>(null)
  const feedingFrequency = selectedPond?.feedingFrequency ?? 0

  const recommendedRateFromABW = (v?: number | null): number | null => {
    if (v == null || !Number.isFinite(v)) return null
    if (v < 2) return 20
    if (v < 15) return 10
    if (v < 100) return 5
    return 2.75
  }
  const recommendedRate = useMemo(() => recommendedRateFromABW(abw), [abw])

  const dailyFeedKg = useMemo(() => {
    if (!abw || !estimatedAlive || !recommendedRate || feedingFrequency <= 0) return null
    const biomassKg = (abw * estimatedAlive) / 1000
    return biomassKg * (recommendedRate / 100)
  }, [abw, estimatedAlive, recommendedRate, feedingFrequency])

  const perFeedingGrams = useMemo(() => {
    if (!dailyFeedKg || feedingFrequency <= 0) return null
    return Math.round((dailyFeedKg / feedingFrequency) * 1000) // g
  }, [dailyFeedKg, feedingFrequency])

  /** reset form time on open */
  useEffect(() => {
    if (!isOpen) return
    const { date, time } = nowStringsPH()
    setFormData((p) => ({ ...p, date, time }))
  }, [isOpen])

  /** load ABW + survival → suggestion inputs */
  useEffect(() => {
    if (!isOpen || !user || !sharedPondId || !selectedPond) return
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
  }, [isOpen, user, sharedPondId, selectedPond])

  /** ====== MISSED/EXCEEDED AUTO-LOGIC (no 3h grace; runs once per open) ====== */
  const autoLoggedRef = useRef(false)
  useEffect(() => {
    if (!isOpen || !user || !sharedPondId || autoLoggedRef.current === true) return
    ;(async () => {
      try {
        const sched = await feedingScheduleService.getByPondId(sharedPondId)
        if (!sched || sched.isActive === false) return

        // Build schedule times for yesterday & today (PH local)
        const slotsUTC: Date[] = []
        const today = new Date()
        const makePHDate = (d: Date, hhmm: string) => {
          const [hh, mm] = hhmm.split(":").map(Number)
          return toUTCFromPH(fmtDatePH(d), `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`)
        }
        const yest = new Date(today); yest.setDate(yest.getDate() - 1)

        for (const t of sched.feedingTimes) {
          slotsUTC.push(makePHDate(yest, t))
          slotsUTC.push(makePHDate(today, t))
        }

        // Fetch all logs for quick matching
        const allLogs = await getFeedingLogsByPond(sharedPondId)

        // Criteria:
        // - slot time is already in the past (exceeded)
        // - AND there is NO log within ±90 minutes from that slot
        const now = new Date()
        const NEAR_MS = 90 * 60 * 1000

        const missed = slotsUTC
          .filter((slot) => slot.getTime() <= now.getTime())
          .sort((a, b) => b.getTime() - a.getTime())
          .find((slot) => {
            const near = allLogs.find(
              (l) => Math.abs(new Date(l.fedAt).getTime() - slot.getTime()) <= NEAR_MS
            )
            return !near
          })

        if (!missed) return
        if (perFeedingGrams == null) return // cannot auto-log without suggestion

        await addFeedingLog({
          pondId: sharedPondId!,
          adminPondId: sharedPondId!,
          pondName: selectedPond?.name || "Pond",
          userId: user.uid,
          userDisplayName: user.displayName || undefined,
          userEmail: user.email || undefined,
          fedAt: missed,                 // log at scheduled slot time
          scheduledFor: missed,          // keep explicit
          feedGiven: perFeedingGrams,    // grams
          feedUnit: "g",
          autoLogged: true,
          reason: "missed_schedule",
        })

        autoLoggedRef.current = true
        setSuccess(`Auto-logged a missed/exceeded feeding at ${fmtTimePH(new Date(missed))} (PH).`)
        onSuccess?.()
      } catch (e) {
        console.error("auto-log failed:", e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sharedPondId, user, perFeedingGrams])

  /** input handling */
  const handleInputChange = (field: "date" | "time" | "feedGiven", value: string) => {
    if (field === "date") {
      const nextDate = value
      const isToday = nextDate === currentDate
      const nextTime = isToday && formData.time > currentTime ? currentTime : formData.time
      setFormData((prev) => ({ ...prev, date: nextDate, time: nextTime }))
      return
    }
    if (field === "time") {
      const isToday = formData.date === currentDate
      const capped = isToday && value > currentTime ? currentTime : value
      setFormData((prev) => ({ ...prev, time: capped }))
      return
    }
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validatePast = () => {
    const when = toUTCFromPH(formData.date, formData.time)
    if (when > new Date()) {
      setError("Cannot log feeding for future date/time")
      return false
    }
    return true
  }

  const beginSubmit = (fedAt: Date, grams: number) => {
    // If user input differs from suggestion → confirm
    if (perFeedingGrams != null && grams !== perFeedingGrams) {
      setPendingSubmit({ fedAt, grams })
      setConfirmOpen(true)
      return
    }
    // Otherwise proceed
    void doSubmit(fedAt, grams)
  }

  const doSubmit = async (fedAt: Date, grams: number) => {
    if (!user || !selectedPond || !sharedPondId) return
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      await addFeedingLog({
        pondId: sharedPondId!,
        adminPondId: sharedPondId!,
        pondName: selectedPond.name,
        userId: user.uid,
        userDisplayName: user.displayName || undefined,
        userEmail: user.email || undefined,
        fedAt,
        feedGiven: grams,
        feedUnit: "g",
        autoLogged: false,
        reason: "manual",
      })

      setSuccess("Feeding logged successfully!")
      setTimeout(() => {
        onSuccess?.()
        onClose()
        const { date, time } = nowStringsPH()
        setFormData({ date, time, feedGiven: "" })
        setSuccess("")
      }, 900)
    } catch (err) {
      console.error("addFeedingLog failed:", err)
      setError("Failed to log feeding. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePast()) return

    // Require an explicit value
    const hasValue = formData.feedGiven.trim().length > 0
    if (!hasValue) {
      setError("Please enter 'Feed Given' or click 'Use suggestion'.")
      return
    }

    const gramsNum = Number(formData.feedGiven)
    if (!Number.isFinite(gramsNum) || gramsNum <= 0) {
      setError("Feed Given must be a positive number of grams.")
      return
    }

    const fedAt = toUTCFromPH(formData.date, formData.time)
    beginSubmit(fedAt, Math.round(gramsNum))
  }

  const applySuggestion = () => {
    if (perFeedingGrams == null) return
    setFormData((p) => ({ ...p, feedGiven: String(perFeedingGrams) }))
  }

  if (!isOpen) return null

  if (!selectedPond) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl">Log Feeding</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <Alert><AlertDescription>No pond available. Please add a pond first.</AlertDescription></Alert>
            <Button className="w-full mt-4" onClick={onClose}>Close</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <CardHeader className="sticky top-0 bg-white z-10 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl">Log Feeding</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>

          <CardContent className="pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert className="border-green-200 bg-green-50"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

              <div className="space-y-2">
                <Label>Pond</Label>
                <Input value={selectedPond.name} disabled className="bg-gray-50" />
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <div className="relative">
                  <Input
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
                <Label>Time</Label>
                <div className="relative">
                  <Input
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
                <div className="col-span-3 space-y-2">
                  <Label>Feed Given (g)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={perFeedingGrams != null ? String(perFeedingGrams) : "e.g., 150"}
                    value={formData.feedGiven}
                    onChange={(e) => handleInputChange("feedGiven", e.target.value)}
                    required
                  />
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
                        {recommendedRate != null ? `${recommendedRate}%` : "—"} <span className="text-xs text-blue-900/60">(rule-of-thumb)</span>
                      </div>
                      <div className="text-blue-900/80">Feeding frequency:</div>
                      <div className="font-semibold">{feedingFrequency || "—"}× / day</div>
                      <div className="text-blue-900/80">Daily feed:</div>
                      <div className="font-semibold">{dailyFeedKg != null ? `${dailyFeedKg.toFixed(2)} kg` : "—"}</div>
                      <div className="text-blue-900/80">Per feeding:</div>
                      <div className="font-semibold">{perFeedingGrams != null ? `${perFeedingGrams} g` : "—"}</div>
                    </div>

                    <div className="mt-2">
                      <Button type="button" variant="outline" className="h-8 px-3 bg-white" onClick={applySuggestion} disabled={perFeedingGrams == null}>
                        Use suggestion
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={onClose} disabled={loading}>
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

      {/* Confirm different-from-suggested */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm feeding amount</DialogTitle>
          </DialogHeader>
          <div className="text-sm">
            {pendingSubmit && (
              <>
                You entered <b>{pendingSubmit.grams} g</b>, but the suggested feed is{" "}
                <b>{perFeedingGrams ?? "—"} g</b>. Do you want to continue?
              </>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!pendingSubmit) return
                setConfirmOpen(false)
                void doSubmit(pendingSubmit.fedAt, pendingSubmit.grams)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
