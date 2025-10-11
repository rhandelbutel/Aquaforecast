"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar, Clock, Repeat, Save, X, UserCircle2, Info } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { usePonds, type UnifiedPond } from "@/lib/pond-context"
import { useToast } from "@/hooks/use-toast"
import {
  feedingScheduleService,
  type CreateFeedingScheduleData,
  type FeedingSchedule,
} from "@/lib/feeding-schedule-service"

interface FeedingScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  pond?: UnifiedPond
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
]

/**
 * Generate evenly spaced times with the **last slot fixed to 17:00 (5 PM)**.
 * Default span: 07:00 → 17:00.
 * - If count === 1 → ["17:00"] (since you want the *last* time to be 5pm)
 */
const generateTimes = (count: number): string[] => {
  if (count <= 1) return ["17:00"]
  const startHour = 7
  const endHour = 17 // ← last slot fixed to 5 PM
  const step = (endHour - startHour) / (count - 1)

  const times = Array.from({ length: count }, (_, i) => {
    const h = Math.round(startHour + i * step)
    return `${String(h).padStart(2, "0")}:00`
  })

  // Hard-ensure last is 17:00
  times[times.length - 1] = "17:00"
  return times
}

export function FeedingScheduleModal({ isOpen, onClose, pond }: FeedingScheduleModalProps) {
  const { user } = useAuth()
  const { ponds } = usePonds()
  const { toast } = useToast()

  // selected pond (shared id)
  const [selectedPondId, setSelectedPondId] = useState(pond?.id || "")
  const selectedPond = useMemo(
    () => ponds.find((p) => p.id === selectedPondId),
    [ponds, selectedPondId]
  )
  const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond?.id
  const pondFreq = Math.max(1, selectedPond?.feedingFrequency ?? 1) // lock to pond

  // form state (timesPerDay is derived; not user-editable)
  const [feedingTimes, setFeedingTimes] = useState<string[]>(generateTimes(pondFreq))
  const [repeatType, setRepeatType] = useState<"daily" | "weekly">("daily")
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // loaded schedule (for “Current Schedule” view)
  const [current, setCurrent] = useState<FeedingSchedule | null>(null)

  // guard so auto-reset runs once per (doc, freq)
  const [autoResetKey, setAutoResetKey] = useState<string | null>(null)

  // Keep the pond selector in sync
  useEffect(() => {
    if (pond?.id) setSelectedPondId(pond.id)
  }, [pond?.id])

  // Update default times when pond frequency changes (no schedule yet)
  useEffect(() => {
    setFeedingTimes((prev) => {
      // if count already equals pond freq, keep whatever user typed
      return prev.length === pondFreq ? prev : generateTimes(pondFreq)
    })
  }, [pondFreq])

  // Load & subscribe to the single schedule for the pond
  useEffect(() => {
    if (!isOpen || !sharedPondId) return
    const unsub = feedingScheduleService.subscribeByPond(sharedPondId, (sched) => {
      setCurrent(sched)

      if (sched) {
        // if schedule already matches pond frequency, use its times
        if (sched.timesPerDay === pondFreq) {
          setFeedingTimes(sched.feedingTimes)
        } else {
          // mismatch → set local preview to new evenly-spaced times (ending at 17:00)
          setFeedingTimes(generateTimes(pondFreq))
        }

        setRepeatType(sched.repeatType)
        setSelectedDays(sched.repeatType === "weekly" ? sched.selectedDays ?? [] : [0, 1, 2, 3, 4, 5, 6])
        setStartDate(sched.startDate ? sched.startDate.toISOString().slice(0, 10) : "")
        setEndDate(sched.endDate ? sched.endDate.toISOString().slice(0, 10) : "")
      } else {
        // reset when no schedule yet
        const today = new Date().toISOString().slice(0, 10)
        setFeedingTimes(generateTimes(pondFreq))
        setRepeatType("daily")
        setSelectedDays([0, 1, 2, 3, 4, 5, 6])
        setStartDate(today)
        setEndDate("")
      }
    })
    return unsub
  }, [isOpen, sharedPondId, pondFreq])

  // If a schedule exists and pond frequency changed → auto-reset & save
  useEffect(() => {
    if (!current || !user) return
    if (!selectedPond?.name || !sharedPondId) return
    if (current.timesPerDay === pondFreq) return

    const key = `${current.id}:${pondFreq}`
    if (autoResetKey === key) return // already did this reset

    const newTimes = generateTimes(pondFreq)
    // extra safety: last must be 17:00
    if (newTimes.length >= 1) newTimes[newTimes.length - 1] = "17:00"

    setAutoResetKey(key)

    // Persist immediate reset
    feedingScheduleService
      .upsert(
        user.uid,
        {
          pondId: sharedPondId,
          pondName: selectedPond.name,
          timesPerDay: pondFreq,
          feedingTimes: newTimes,
          repeatType,
          selectedDays: repeatType === "weekly" ? selectedDays : undefined,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : undefined,
        },
        { email: user.email ?? null, displayName: user.displayName ?? null }
      )
      .then(() => {
        toast({
          title: "Schedule reset",
          description: `Pond feeding frequency is now ${pondFreq}×/day. The schedule was reset .`,
        })
      })
      .catch((err) => {
        console.error(err)
      })
  }, [
    current,
    pondFreq,
    selectedPond?.name,
    sharedPondId,
    user,
    repeatType,
    selectedDays,
    startDate,
    endDate,
    toast,
    autoResetKey,
  ])

  const handleTimeChange = (idx: number, time: string) => {
    setFeedingTimes((prev) => {
      const next = [...prev]
      next[idx] = time
      return next
    })
  }

  const toggleDay = (val: number) => {
    setSelectedDays((prev) => (prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val].sort()))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedPond || !sharedPondId) {
      toast({ title: "Error", description: "Please select a pond.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const payload: CreateFeedingScheduleData = {
        pondId: sharedPondId,
        pondName: selectedPond.name,
        timesPerDay: pondFreq,           // ← locked to pond
        feedingTimes,                    // length must equal pondFreq
        repeatType,
        selectedDays: repeatType === "weekly" ? selectedDays : undefined,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
      }

      await feedingScheduleService.upsert(user.uid, payload, {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      })

      toast({
        title: current ? "Schedule updated" : "Schedule created",
        description: "Feeding schedule is now saved and shared with all users of this pond.",
      })
      onClose()
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Failed to save schedule.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            {current ? "Edit Feeding Schedule" : "Schedule Feeding"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pond */}
          <div className="space-y-2">
            <Label>Select Pond</Label>
            <Select value={selectedPondId} onValueChange={setSelectedPondId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a pond" />
              </SelectTrigger>
              <SelectContent>
                {ponds.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Times per day (locked to pond) */}
          <div className="space-y-1">
            <Label>Feeding Times Per Day</Label>
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
              {pondFreq} time{pondFreq > 1 ? "s" : ""} per day{" "}
              <span className="text-gray-500">(from pond settings)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
              <Info className="h-3.5 w-3.5" />
              Changing the pond’s feeding frequency will automatically reset this schedule to match (last time = 5:00 PM).
            </div>
          </div>

          {/* Feeding times */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Feeding Times
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: pondFreq }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs text-gray-500">Time {i + 1}</Label>
                  <Input
                    type="time"
                    value={feedingTimes[i] ?? ""}
                    onChange={(e) => handleTimeChange(i, e.target.value)}
                    className="text-center"
                    required
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Repeat */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Repeat Schedule
            </Label>
            <Select value={repeatType} onValueChange={(v: "daily" | "weekly") => setRepeatType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily (Every day)</SelectItem>
                <SelectItem value="weekly">Weekly (Select days)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {repeatType === "weekly" && (
            <div className="space-y-3">
              <Label>Select Days</Label>
              <div className="flex flex-wrap gap-3">
                {DAYS_OF_WEEK.map((d) => (
                  <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={selectedDays.includes(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                    <span className="text-sm">{d.short}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>End Date (Optional)</Label>
              <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Current schedule */}
          <div className="rounded-lg border p-4 bg-gray-50">
            <div className="text-sm font-medium mb-2">Current Schedule</div>
            {current ? (
              <div className="text-sm grid gap-1">
                <div>
                  <b>Pond:</b> {current.pondName}
                </div>
                <div>
                  <b>Times/Day:</b> {current.timesPerDay}
                </div>
                <div>
                  <b>Times:</b> {current.feedingTimes.join(", ")}
                </div>
                <div>
                  <b>Repeat:</b>{" "}
                  {current.repeatType === "daily"
                    ? "Daily"
                    : `Weekly (${(current.selectedDays ?? [])
                        .map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.short)
                        .filter(Boolean)
                        .join(", ")})`}
                </div>
                <div>
                  <b>Start:</b> {current.startDate.toISOString().slice(0, 10)}
                </div>
                {current.endDate && (
                  <div>
                    <b>End:</b> {current.endDate.toISOString().slice(0, 10)}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-gray-700">
                  <UserCircle2 className="h-4 w-4" />
                  <span className="text-xs">
                    Set by <b>{current.createdBy.displayName || current.createdBy.email || current.createdBy.userId}</b>
                    {current.lastUpdatedBy && (
                      <>
                        {" "}
                        • Last edit by{" "}
                        <b>
                          {current.lastUpdatedBy.displayName ||
                            current.lastUpdatedBy.email ||
                            current.lastUpdatedBy.userId}
                        </b>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No schedule set yet.</div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" /> Close
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Saving..." : current ? "Save Changes" : "Create Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
