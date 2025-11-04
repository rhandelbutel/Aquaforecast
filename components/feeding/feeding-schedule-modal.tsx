// components/feeding/feeding-schedule-modal.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Repeat, Save, X, UserCircle2, Info, Lock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUser } from "@/lib/user-context";
import { usePonds, type UnifiedPond } from "@/lib/pond-context";
import {
  feedingScheduleService,
  type CreateFeedingScheduleData,
  type FeedingSchedule,
} from "@/lib/feeding-schedule-service";

/* --------------------------------------------
   Types & Constants
--------------------------------------------- */
interface FeedingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  pond?: UnifiedPond;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

/* --------------------------------------------
   Helper Functions
--------------------------------------------- */
const generateTimes = (count: number): string[] => {
  if (count <= 1) return ["17:00"];
  const startHour = 7;
  const endHour = 17;
  const step = (endHour - startHour) / (count - 1);
  const times = Array.from({ length: count }, (_, i) => {
    const h = Math.round(startHour + i * step);
    return `${String(h).padStart(2, "0")}:00`;
  });
  times[times.length - 1] = "17:00";
  return times;
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

function validateFeedingTimes(times: string[]): string | null {
  const mins = times.map(timeToMinutes).sort((a, b) => a - b);

  // Check daylight range (7 AM - 6 PM)
  if (mins[0] < 420 || mins[mins.length - 1] > 1080) {
    return "Feeding times should be within daylight hours (7:00 AM–6:00 PM).";
  }

  // Adjust spacing rule depending on frequency
  for (let i = 1; i < mins.length; i++) {
    const diff = mins[i] - mins[i - 1];

    if (times.length === 2) {
      // 2 feedings/day: allow 8–10 hours apart
      if (diff < 480 || diff > 600) {
        return "For 2×/day feedings, spacing should be 8–10 hours apart.";
      }
    } else {
      // 3+ feedings/day: allow 4–5 hours apart
      if (diff < 240 || diff > 300) {
        return "Each feeding should be spaced 4–5 hours apart for optimal feed efficiency.";
      }
    }
  }

  return null;
}


/* --------------------------------------------
   Component
--------------------------------------------- */
export function FeedingScheduleModal({ isOpen, onClose, pond }: FeedingScheduleModalProps) {
  const { user } = useAuth();
  const { userProfile } = useUser();
  const isAdmin = (userProfile?.role ?? "user") === "admin";
  const { ponds } = usePonds();

  const [selectedPondId, setSelectedPondId] = useState(pond?.id || "");
  const selectedPond = useMemo(() => ponds.find((p) => p.id === selectedPondId), [ponds, selectedPondId]);
  const sharedPondId = (selectedPond as any)?.adminPondId || selectedPond?.id;
  const pondFreq = Math.max(1, selectedPond?.feedingFrequency ?? 1);

  const [feedingTimes, setFeedingTimes] = useState<string[]>(generateTimes(pondFreq));
  const [repeatType, setRepeatType] = useState<"daily" | "weekly">("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [current, setCurrent] = useState<FeedingSchedule | null>(null);
  const [autoResetKey, setAutoResetKey] = useState<string | null>(null);

  // Alert dialog state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  /* --------------------------------------------
     Effects
  --------------------------------------------- */
  useEffect(() => {
    if (pond?.id) setSelectedPondId(pond.id);
  }, [pond?.id]);

  useEffect(() => {
    setFeedingTimes((prev) => (prev.length === pondFreq ? prev : generateTimes(pondFreq)));
  }, [pondFreq]);

  useEffect(() => {
    if (!isOpen || !sharedPondId) return;
    const unsub = feedingScheduleService.subscribeByPond(sharedPondId, (sched) => {
      setCurrent(sched);

      if (sched) {
        if (sched.timesPerDay === pondFreq) setFeedingTimes(sched.feedingTimes);
        else setFeedingTimes(generateTimes(pondFreq));
        setRepeatType(sched.repeatType);
        setSelectedDays(sched.repeatType === "weekly" ? sched.selectedDays ?? [] : [0, 1, 2, 3, 4, 5, 6]);
        setStartDate(sched.startDate?.toISOString().slice(0, 10) ?? "");
        setEndDate(sched.endDate?.toISOString().slice(0, 10) ?? "");
      } else {
        const today = new Date().toISOString().slice(0, 10);
        setFeedingTimes(generateTimes(pondFreq));
        setRepeatType("daily");
        setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
        setStartDate(today);
        setEndDate("");
      }
    });
    return unsub;
  }, [isOpen, sharedPondId, pondFreq]);

  /* --------------------------------------------
     Handlers
  --------------------------------------------- */
  const handleTimeChange = (idx: number, time: string) => {
    setFeedingTimes((prev) => {
      const next = [...prev];
      next[idx] = time;
      return next;
    });
  };

  const toggleDay = (val: number) => {
    setSelectedDays((prev) => (prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val].sort()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    // Validation
    const validationMsg = validateFeedingTimes(feedingTimes);
    if (validationMsg) {
      setAlertMessage(validationMsg);
      setAlertOpen(true);
      return;
    }

    if (!user || !selectedPond || !sharedPondId) {
      setAlertMessage("Please select a pond before saving.");
      setAlertOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const payload: CreateFeedingScheduleData = {
        pondId: sharedPondId,
        pondName: selectedPond.name,
        timesPerDay: pondFreq,
        feedingTimes,
        repeatType,
        selectedDays: repeatType === "weekly" ? selectedDays : undefined,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
      };

      await feedingScheduleService.upsert(user.uid, payload, {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      });

      setAlertMessage("✅ Feeding schedule saved successfully.");
      setAlertOpen(true);
      onClose();
    } catch (err) {
      console.error(err);
      setAlertMessage("❌ Failed to save schedule. Please try again.");
      setAlertOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const disableInputs = !isAdmin;

  /* --------------------------------------------
     Render
  --------------------------------------------- */
  return (
    <>
      {/* Main Feeding Schedule Dialog */}
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Feeding Schedule
              {!isAdmin && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-gray-600">
                  <Lock className="h-3.5 w-3.5" />
                  Read-only (admin manages)
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Pond Selector */}
            <div className="space-y-2">
              <Label>Select Pond</Label>
              <Select value={selectedPondId} onValueChange={setSelectedPondId} disabled={disableInputs}>
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

            {/* Feeding Times */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Feeding Times ({pondFreq}×/day)
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {feedingTimes.map((time, i) => (
                  <div key={i}>
                    <Label className="text-xs text-gray-500">Time {i + 1}</Label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => handleTimeChange(i, e.target.value)}
                      className="text-center"
                      required
                      disabled={disableInputs}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                <p>
                  <b>Tip:</b> Tilapia are daytime feeders. Spread feedings evenly during daylight hours.
                  <br />• 2×/day → 9:00 AM & 4–5:00 PM <br />• 3×/day → 8:00 AM, 12:00 PM & 4:00 PM
                </p>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  disabled={disableInputs}
                />
              </div>
              <div>
                <Label>End Date (Optional)</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={disableInputs}
                />
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" /> Close
              </Button>
              {isAdmin && (
                <Button type="submit" disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  {isLoading ? "Saving..." : "Save Schedule"}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ⚠️ Alert Dialog */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="max-w-sm text-center space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Feeding Schedule Warning
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-line">{alertMessage}</p>
          <Button variant="outline" onClick={() => setAlertOpen(false)}>
            OK
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
