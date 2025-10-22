"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Clock, Calendar, Lightbulb } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import { usePonds } from "@/lib/pond-context"
import { addFeedingLog, subscribeFeedingLogs, type FeedingLog } from "@/lib/feeding-service"
import { feedingScheduleService, type FeedingSchedule } from "@/lib/feeding-schedule-service"
import { GrowthService } from "@/lib/growth-service"
import { getMortalityLogs, computeSurvivalRateFromLogs } from "@/lib/mortality-service"
import { pushFeedingVarianceInsight } from "@/lib/dash-insights-service"

/* ---- Time helpers (Asia/Manila) ---- */
const TZ = "Asia/Manila"
const fmtDatePH = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) // YYYY-MM-DD
const fmtTimePH = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d) // HH:mm
const toUTCFromPH = (dateStr: string, timeStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = timeStr.split(":").map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0))
}
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

  // ui
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // dialogs
  const [missedOpen, setMissedOpen] = useState(false)
  const [confirmEarlyOpen, setConfirmEarlyOpen] = useState(false)
  const [confirmAmountOpen, setConfirmAmountOpen] = useState(false)
  const [tooEarlyOpen, setTooEarlyOpen] = useState(false) // 👈 NEW: restriction popup
  const [pendingEarly, setPendingEarly] = useState<{ fedAt: Date; grams: number } | null>(null)
  const [pendingAmount, setPendingAmount] = useState<{ fedAt: Date; grams: number } | null>(null)

  // form
  const { date: currentDate, time: currentTime } = nowStringsPH()
  const [formData, setFormData] = useState({ date: currentDate, time: currentTime, feedGiven: "" })

  // schedule + logs (live)
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null)
  const [logs, setLogs] = useState<FeedingLog[]>([])
  const unsubRef = useRef<null | (() => void)>(null)

  // suggestions
  const [abw, setAbw] = useState<number | null>(null)
  const [estimatedAlive, setEstimatedAlive] = useState<number | null>(null)
  const feedingFrequency = selectedPond?.feedingFrequency ?? 0

  const rateFromABW = (v?: number | null): number | null =>
    v == null ? null : v < 2 ? 20 : v < 15 ? 10 : v < 100 ? 5 : 2.75
  const rate = useMemo(() => rateFromABW(abw), [abw])
  const dailyFeedKg = useMemo(() => {
    if (!abw || !estimatedAlive || !rate || feedingFrequency <= 0) return null
    const biomassKg = (abw * estimatedAlive) / 1000
    return biomassKg * (rate / 100)
  }, [abw, estimatedAlive, rate, feedingFrequency])
  const perFeedingGrams = useMemo(() => (dailyFeedKg ? Math.round((dailyFeedKg / feedingFrequency) * 1000) : null), [
    dailyFeedKg,
    feedingFrequency,
  ])

  /* reset when open */
  useEffect(() => {
    if (!isOpen) return
    const { date, time } = nowStringsPH()
    setFormData({ date, time, feedGiven: "" })
    setError("")
    setSuccess("")
  }, [isOpen])

  /* load schedule + subscribe logs LIVE */
  useEffect(() => {
    if (!isOpen || !sharedPondId) return
    let cancelled = false

    ;(async () => {
      const s = await feedingScheduleService.getByPondId(sharedPondId)
      if (!cancelled) setSchedule(s)
    })()

    // live logs
    unsubRef.current?.()
    unsubRef.current = subscribeFeedingLogs(sharedPondId, (arr) => setLogs(arr))

    return () => {
      cancelled = true
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [isOpen, sharedPondId])

  /* suggestions sources */
  useEffect(() => {
    if (!isOpen || !user || !sharedPondId || !selectedPond) return
    ;(async () => {
      try {
        const setup = await GrowthService.getGrowthSetup(sharedPondId, user.uid)
        setAbw(setup?.currentABW ?? null)
        const m = await getMortalityLogs(sharedPondId)
        const sr = computeSurvivalRateFromLogs(m)
        const initial = selectedPond.fishCount || 0
        setEstimatedAlive(Math.max(0, Math.round((sr / 100) * initial)))
      } catch (e) {
        console.error(e)
      }
    })()
  }, [isOpen, user, sharedPondId, selectedPond])

  /* build today's slots */
  const makePHDate = (base: Date, hhmm: string) => {
    const [hh, mm] = hhmm.split(":").map(Number)
    return toUTCFromPH(fmtDatePH(base), `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`)
  }
  const todaySlotsUTC = useMemo(() => {
    if (!schedule) return []
    const today = new Date()
    return schedule.feedingTimes.map((t) => makePHDate(today, t)).sort((a, b) => a.getTime() - b.getTime())
  }, [schedule])

  const isLoggedNear = (slot: Date, nearMs = 90 * 60 * 1000) =>
    logs.some((l) => Math.abs(new Date(l.fedAt).getTime() - slot.getTime()) <= nearMs)

  const missedSlots = useMemo(() => {
    if (!schedule) return []
    const now = new Date()
    return todaySlotsUTC.filter((s) => s.getTime() < now.getTime() && !isLoggedNear(s))
  }, [todaySlotsUTC, schedule, logs])

  const nextSlot = useMemo<Date | null>(() => {
    const now = new Date()
    return todaySlotsUTC.find((s) => s.getTime() >= now.getTime()) ?? null
  }, [todaySlotsUTC])

  /* OPEN MISSED POPUP when data becomes ready */
  const dataReady = !!schedule && isOpen
  const shownMissedOnce = useRef(false)
  useEffect(() => {
    if (!dataReady) return
    if (missedSlots.length > 0 && !shownMissedOnce.current) {
      setMissedOpen(true)
      shownMissedOnce.current = true
    }
  }, [dataReady, missedSlots.length])

  /* form handlers */
  const handleInputChange = (field: "date" | "time" | "feedGiven", value: string) => {
    if (field === "date") {
      const isToday = value === currentDate
      const nextTime = isToday && formData.time > currentTime ? currentTime : formData.time
      setFormData((p) => ({ ...p, date: value, time: nextTime }))
      return
    }
    if (field === "time") {
      const isToday = formData.date === currentDate
      const capped = isToday && value > currentTime ? currentTime : value
      setFormData((p) => ({ ...p, time: capped }))
      return
    }
    setFormData((p) => ({ ...p, [field]: value }))
  }
  const applySuggestion = () => perFeedingGrams != null && setFormData((p) => ({ ...p, feedGiven: String(perFeedingGrams) }))

  /* guards + submit */
  const countTodayLogs = () => {
    const todayStr = fmtDatePH(new Date())
    return logs.filter((l) => fmtDatePH(new Date(l.fedAt)) === todayStr).length
  }

  const doSubmit = async (fedAt: Date, grams: number) => {
    if (!user || !selectedPond || !sharedPondId) return
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      await addFeedingLog({
        pondId: sharedPondId,
        adminPondId: sharedPondId,
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

      // ⬇️ keep your insight hook
      try {
        await pushFeedingVarianceInsight(
          sharedPondId,
          selectedPond.name,
          grams,
          perFeedingGrams ?? null
        )
      } catch {}

      setSuccess("Feeding logged successfully!")
      setTimeout(() => {
        onSuccess?.()
        onClose()
        const { date, time } = nowStringsPH()
        setFormData({ date, time, feedGiven: "" })
        setSuccess("")
      }, 700)
    } catch (e) {
      console.error(e)
      setError("Failed to save feeding log.")
    } finally {
      setLoading(false)
    }
  }

  const startSubmitWithGuards = (fedAt: Date, grams: number) => {
    // cap by pond frequency (PH local day)
    if (feedingFrequency > 0 && countTodayLogs() >= feedingFrequency) {
      setError(`Daily limit reached (${feedingFrequency}×/day).`)
      return
    }

    // early logic against the NEXT schedule time
    const now = new Date()
    const early = !!nextSlot && now < nextSlot && fedAt.getTime() <= now.getTime()

    if (early && nextSlot) {
      const minutesUntilNext = Math.ceil((nextSlot.getTime() - now.getTime()) / 60000)

      // 👇 NEW: if > 60 minutes early -> restriction popup
      if (minutesUntilNext > 60) {
        setTooEarlyOpen(true)
        return
      }

      // 👇 existing behavior: 0–60 minutes early -> confirmation
      if (minutesUntilNext > 0) {
        setPendingEarly({ fedAt, grams })
        setConfirmEarlyOpen(true)
        return
      }
    }

    if (perFeedingGrams != null && grams !== perFeedingGrams) {
      setPendingAmount({ fedAt, grams })
      setConfirmAmountOpen(true)
      return
    }
    void doSubmit(fedAt, grams)
  }

  const handleSubmit: React.FormEventHandler = (e) => {
    e.preventDefault()
    const when = toUTCFromPH(formData.date, formData.time)
    if (when > new Date()) { setError("Cannot log feeding for a future time."); return }
    if (!formData.feedGiven.trim()) { setError("Please enter 'Feed Given' or click 'Use suggestion'."); return }
    const grams = Number(formData.feedGiven)
    if (!Number.isFinite(grams) || grams <= 0) { setError("Feed Given must be a positive number of grams."); return }
    startSubmitWithGuards(when, Math.round(grams))
  }

  /* render */
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
              {/* Pond */}
              <div className="space-y-2">
                <Label>Pond</Label>
                <Input value={selectedPond.name} disabled className="bg-gray-50" />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <div className="relative">
                  <Input type="date" value={formData.date} max={currentDate} onChange={(e) => handleInputChange("date", e.target.value)} required />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Time */}
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

              {/* Amount */}
              <div className="space-y-2">
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

              {/* Suggestions */}
              <div className="p-3 rounded-lg bg-blue-50 text-sm">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 mt-0.5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">Suggested feed</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      <div className="text-blue-900/80">ABW:</div><div className="font-semibold">{abw ?? "—"} g</div>
                      <div className="text-blue-900/80">Est. alive:</div><div className="font-semibold">{estimatedAlive?.toLocaleString() ?? "—"}</div>
                      <div className="text-blue-900/80">Rate:</div><div className="font-semibold">{rate ?? "—"}%</div>
                      <div className="text-blue-900/80">Freq:</div><div className="font-semibold">{feedingFrequency || "—"}×/day</div>
                      <div className="text-blue-900/80">Daily:</div><div className="font-semibold">{dailyFeedKg?.toFixed(2) ?? "—"} kg</div>
                      <div className="text-blue-900/80">Per feeding:</div><div className="font-semibold">{perFeedingGrams ?? "—"} g</div>
                    </div>
                    <div className="mt-2">
                      <Button type="button" variant="outline" className="h-8 px-3 bg-white" onClick={applySuggestion} disabled={perFeedingGrams == null}>
                        Use suggestion
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts */}
              {error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="mt-2 border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={onClose} disabled={loading}>Cancel</Button>
                <Button type="submit" className="flex-1 bg-cyan-600 hover:bg-cyan-700" disabled={loading}>
                  {loading ? "Logging..." : "Log Feeding"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Missed logs chooser */}
      <Dialog open={missedOpen} onOpenChange={setMissedOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Missed scheduled feedings today</DialogTitle></DialogHeader>
          {missedSlots.length === 0 ? (
            <div className="text-sm text-gray-600">No missed schedules for today.</div>
          ) : (
            <MissedChooser
              slots={missedSlots}
              onPick={(slot) => {
                setFormData((p) => ({ ...p, date: fmtDatePH(slot), time: fmtTimePH(slot) }))
                setMissedOpen(false)
              }}
            />
          )}
          <DialogFooter><Button variant="outline" onClick={() => setMissedOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Too-early restriction ( > 60 min ) */}
      <Dialog open={tooEarlyOpen} onOpenChange={setTooEarlyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Too early to log</DialogTitle></DialogHeader>
          <div className="text-sm">
            {nextSlot
              ? <>You can only feed within <b>60 minutes</b> before the next schedule. Next time is <b>{fmtTimePH(nextSlot)}</b>.</>
              : <>You can only feed within 60 minutes before the next scheduled time.</>}
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setTooEarlyOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 0–60 min early confirmation */}
      <Dialog open={confirmEarlyOpen} onOpenChange={setConfirmEarlyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log earlier than schedule?</DialogTitle></DialogHeader>
          <div className="text-sm">
            {nextSlot ? <>Next scheduled time today is <b>{fmtTimePH(nextSlot)}</b>. Continue?</> : <>Continue?</>}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmEarlyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!pendingEarly) return
                setConfirmEarlyOpen(false)
                if (perFeedingGrams != null && pendingEarly.grams !== perFeedingGrams) {
                  setPendingAmount(pendingEarly)
                  setConfirmAmountOpen(true)
                } else {
                  void doSubmit(pendingEarly.fedAt, pendingEarly.grams)
                }
              }}
            >
              Yes, log now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amount confirmation (unchanged) */}
      <Dialog open={confirmAmountOpen} onOpenChange={setConfirmAmountOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm feeding amount</DialogTitle></DialogHeader>
          <div className="text-sm">
            {pendingAmount && <>You entered <b>{pendingAmount.grams} g</b>, suggestion is <b>{perFeedingGrams ?? "—"} g</b>. Continue?</>}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmAmountOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!pendingAmount) return; setConfirmAmountOpen(false); void doSubmit(pendingAmount.fedAt, pendingAmount.grams) }}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* Missed chooser */
function MissedChooser({ slots, onPick }: { slots: Date[]; onPick: (slot: Date) => void }) {
  const [selected, setSelected] = useState<Date | null>(slots[0] ?? null)
  useEffect(() => { if (!selected && slots.length) setSelected(slots[0]) }, [slots, selected])
  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">Select a missed time to log:</div>
      <div className="max-h-60 overflow-y-auto border rounded-md">
        {slots.map((s) => {
          const key = s.getTime()
          return (
            <label key={key} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 cursor-pointer">
              <input type="radio" name="missed" className="accent-cyan-600" checked={selected?.getTime() === key} onChange={() => setSelected(s)} />
              <div className="text-sm">
                <div className="font-medium">{fmtTimePH(s)}</div>
                <div className="text-gray-500">{fmtDatePH(s)}</div>
              </div>
            </label>
          )
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => selected && onPick(selected)}>Use this time</Button>
      </div>
    </div>
  )
}
