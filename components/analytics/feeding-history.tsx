"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  History,
  Fish,
  Clock,
  Calendar,
  Eye,
  User,
  List,
  CalendarDays,
} from "lucide-react";
import {
  getFeedingLogsByPond,
  subscribeFeedingLogs,
  type FeedingLog,
  dateAt,
  dayBounds,
} from "@/lib/feeding-service";
import {
  feedingScheduleService,
  type FeedingSchedule,
} from "@/lib/feeding-schedule-service";
import type { UnifiedPond } from "@/lib/pond-context";

interface FeedingHistoryProps {
  pond: UnifiedPond;
}

export function FeedingHistory({ pond }: FeedingHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [mergedLogs, setMergedLogs] = useState<FeedingLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<FeedingLog | null>(null);
  const [stats, setStats] = useState({
    totalLogs: 0,
    todayCount: 0,
    averagePerDay: 0,
  });
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null);
  const [viewMode, setViewMode] = useState<"today" | "all">("today");

  const sharedId = (pond as any).adminPondId || pond.id;

  const formatDate = (ts: Date) =>
    ts.toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatTime = (ts: Date) =>
    ts.toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatTimeAgo = (ts: Date) => {
    const diff = Date.now() - ts.getTime();
    const m = Math.floor(diff / 60000),
      h = Math.floor(diff / 3600000),
      d = Math.floor(diff / 86400000);
    if (d > 0) return `${d} day${d > 1 ? "s" : ""} ago`;
    if (h > 0) return `${h} hour${h > 1 ? "s" : ""} ago`;
    if (m > 0) return `${m} minute${m > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  // --- Fetch Feeding Schedule ---
  useEffect(() => {
    if (!sharedId) return;
    const unsub = feedingScheduleService.subscribeByPond(sharedId, (sched) =>
      setSchedule(sched)
    );
    return () => unsub?.();
  }, [sharedId]);

  // --- Fetch Logs + Subscribe Realtime ---
  useEffect(() => {
    if (!sharedId) return;
    let unsub: (() => void) | undefined;
    (async () => {
      setIsLoading(true);
      try {
        const initial = await getFeedingLogsByPond(sharedId);
        setFeedingLogs(initial);
        unsub = subscribeFeedingLogs(sharedId, (logs) => setFeedingLogs(logs));
      } finally {
        setIsLoading(false);
      }
    })();
    return () => unsub?.();
  }, [sharedId]);

  // --- Merge Logs + Scheduled Slots (only for "today") ---
  useEffect(() => {
    if (!schedule) {
      setMergedLogs(feedingLogs);
      return;
    }

    const today = new Date();
    const { start, end } = dayBounds(today);

    const logsToUse =
      viewMode === "today"
        ? feedingLogs.filter((l) => {
            const fed = new Date(l.fedAt);
            return fed >= start && fed <= end;
          })
        : [...feedingLogs];

    if (viewMode === "today") {
      const scheduledSlots: FeedingLog[] = schedule.feedingTimes.map((time) => {
        const slot = dateAt(time, today);

        const actual = logsToUse.find((log) => {
          const fed = new Date(log.fedAt);
          return (
            fed.getHours() === slot.getHours() ||
            Math.abs(fed.getTime() - slot.getTime()) <= 2 * 60 * 60 * 1000
          );
        });

        if (actual) return actual;

        return {
          id: `missing-${time}`,
          pondId: pond.id,
          adminPondId: sharedId,
          pondName: pond.name,
          userId: "system",
          userDisplayName: "—",
          userEmail: "—",
          fedAt: slot,
          feedGiven: undefined,
          feedUnit: "g",
          autoLogged: true,
          reason: "missed_schedule",
          scheduledFor: slot,
          createdAt: slot,
        };
      });

      const manualLogs = logsToUse.filter(
        (log) =>
          !scheduledSlots.some(
            (s) =>
              Math.abs(s.fedAt.getTime() - log.fedAt.getTime()) <=
              2 * 60 * 60 * 1000
          )
      );

      const combined = [...scheduledSlots, ...manualLogs];
      combined.sort((a, b) => a.fedAt.getTime() - b.fedAt.getTime());
      setMergedLogs(combined);
    } else {
      const all = [...logsToUse];
      all.sort((a, b) => b.fedAt.getTime() - a.fedAt.getTime());
      setMergedLogs(all);
    }
  }, [feedingLogs, schedule, viewMode]);

  // --- Stats ---
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = feedingLogs.filter((l) => {
      const d = new Date(l.fedAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const recent = feedingLogs.filter((l) => new Date(l.fedAt) >= thirtyAgo);
    const avg = Math.round((recent.length / 30) * 10) / 10;
    setStats({ totalLogs: feedingLogs.length, todayCount, averagePerDay: avg });
  }, [feedingLogs]);

  return (
    <>
      {/* Summary Button */}
      <Button
        variant="outline"
        className="w-full justify-start h-auto p-4 bg-transparent"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-50 rounded-lg">
              <History className="h-5 w-5 text-cyan-600" />
            </div>
            <div className="text-left">
              <div className="font-medium">{pond.name} - Feeding History</div>
              <div className="text-sm text-gray-500">
                View feeding logs and patterns
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{stats.totalLogs} logs</div>
            <div className="text-xs text-gray-500">Today: {stats.todayCount}</div>
          </div>
        </div>
      </Button>

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fish className="h-5 w-5 text-cyan-600" />
              Feeding History - {pond.name}
            </DialogTitle>
          </DialogHeader>

          {/* Toggle Buttons */}
          <div className="flex justify-between items-center px-4 mb-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "today" ? "default" : "outline"}
                onClick={() => setViewMode("today")}
              >
                <CalendarDays className="h-4 w-4 mr-1" /> Today
              </Button>
              <Button
                size="sm"
                variant={viewMode === "all" ? "default" : "outline"}
                onClick={() => setViewMode("all")}
              >
                <List className="h-4 w-4 mr-1" /> All
              </Button>
            </div>
          </div>

          {/* Logs List */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading…</div>
            ) : mergedLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Fish className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No feeding logs yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto px-2">
                {mergedLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      log.reason === "missed_schedule"
                        ? "bg-gray-100 opacity-70"
                        : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-100 rounded-full">
                        <Fish className="h-4 w-4 text-cyan-600" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {log.reason === "missed_schedule"
                            ? "Missed Feed Slot"
                            : "Feeding Session"}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {formatDate(log.fedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(log.fedAt)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.reason === "missed_schedule"
                          ? "No feeding recorded"
                          : formatTimeAgo(log.fedAt)}
                      </div>
                      {log.reason !== "missed_schedule" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 px-2"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4 text-cyan-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog
        open={!!selectedLog}
        onOpenChange={(v) => !v && setSelectedLog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Feeding Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Date</span>
                <span className="font-medium">{formatDate(selectedLog.fedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Time</span>
                <span className="font-medium">{formatTime(selectedLog.fedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Feed Given</span>
                <span className="font-medium">
                  {typeof selectedLog.feedGiven === "number"
                    ? `${selectedLog.feedGiven} ${selectedLog.feedUnit ?? "g"}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Logged by</span>
                <span className="font-medium flex items-center gap-2">
                  <User className="h-3 w-3 text-gray-500" />
                  {selectedLog.userDisplayName || selectedLog.userEmail || "—"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- EXPORT TABLE (ALWAYS ALL LOGS) --- */}
      {feedingLogs.length > 0 && (
        <div data-export="feeding-history" className="hidden">
          <h3 className="text-center text-lg font-semibold mt-6 mb-2">
            Feeding History — {pond.name}
          </h3>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>
                <th style={{ border: "1px solid #ccc", padding: "6px" }}>Date</th>
                <th style={{ border: "1px solid #ccc", padding: "6px" }}>Time</th>
                <th style={{ border: "1px solid #ccc", padding: "6px" }}>
                  Feed Given
                </th>
                <th style={{ border: "1px solid #ccc", padding: "6px" }}>
                  Logged By
                </th>
              </tr>
            </thead>
            <tbody>
              {feedingLogs
                .sort((a, b) => b.fedAt.getTime() - a.fedAt.getTime())
                .map((log) => (
                  <tr key={log.id}>
                    <td
                      style={{
                        border: "1px solid #ccc",
                        padding: "6px",
                        textAlign: "center",
                      }}
                    >
                      {formatDate(log.fedAt)}
                    </td>
                    <td
                      style={{
                        border: "1px solid #ccc",
                        padding: "6px",
                        textAlign: "center",
                      }}
                    >
                      {formatTime(log.fedAt)}
                    </td>
                    <td
                      style={{
                        border: "1px solid #ccc",
                        padding: "6px",
                        textAlign: "center",
                      }}
                    >
                      {typeof log.feedGiven === "number"
                        ? `${log.feedGiven} ${log.feedUnit ?? "g"}`
                        : "–"}
                    </td>
                    <td
                      style={{
                        border: "1px solid #ccc",
                        padding: "6px",
                        textAlign: "center",
                      }}
                    >
                      {log.userDisplayName || log.userEmail || "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
