//components/analytics/feeding-history.tsx
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { History, Fish, TrendingUp, Clock, Calendar, Eye, User } from "lucide-react"
import { getFeedingLogsByPond, subscribeFeedingLogs, type FeedingLog } from "@/lib/feeding-service"
import type { UnifiedPond } from "@/lib/pond-context"

interface FeedingHistoryProps {
  pond: UnifiedPond
}

export function FeedingHistory({ pond }: FeedingHistoryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<FeedingLog | null>(null)
  const [stats, setStats] = useState({ totalLogs: 0, todayCount: 0, averagePerDay: 0 })

  // unified/shared pond id (same for admin & user)
  const sharedId = (pond as any).adminPondId || pond.id

  const formatDate = (ts: Date) =>
    ts.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })
  const formatTime = (ts: Date) =>
    ts.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" })
  const formatTimeAgo = (ts: Date) => {
    const diff = Date.now() - ts.getTime()
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
    if (d > 0) return `${d} day${d > 1 ? "s" : ""} ago`
    if (h > 0) return `${h} hour${h > 1 ? "s" : ""} ago`
    if (m > 0) return `${m} minute${m > 1 ? "s" : ""} ago`
    return "Just now"
  }

  // initial fetch + realtime subscribe (shared id)
  useEffect(() => {
    if (!sharedId) return
    let unsub: (() => void) | undefined
    ;(async () => {
      setIsLoading(true)
      try {
        const initial = await getFeedingLogsByPond(sharedId)
        setFeedingLogs(initial)

        // realtime updates
        unsub = subscribeFeedingLogs(sharedId, (logs) => setFeedingLogs(logs))
      } finally {
        setIsLoading(false)
      }
    })()
    return () => { unsub?.() }
  }, [sharedId])

  // recompute quick stats whenever logs change
  useEffect(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const todayCount = feedingLogs.filter((l) => {
      const d = new Date(l.fedAt); d.setHours(0,0,0,0)
      return d.getTime() === today.getTime()
    }).length
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const recent = feedingLogs.filter((l) => new Date(l.fedAt) >= thirtyAgo)
    const avg = Math.round((recent.length / 30) * 10) / 10
    setStats({ totalLogs: feedingLogs.length, todayCount, averagePerDay: avg })
  }, [feedingLogs])

  return (
    <>
      <Button variant="outline" className="w-full justify-start h-auto p-4 bg-transparent" onClick={() => setIsOpen(true)}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-50 rounded-lg">
              <History className="h-5 w-5 text-cyan-600" />
            </div>
            <div className="text-left">
              <div className="font-medium">{pond.name} - Feeding History</div>
              <div className="text-sm text-gray-500">View feeding logs and patterns</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{stats.totalLogs} logs</div>
            <div className="text-xs text-gray-500">Today: {stats.todayCount}</div>
          </div>
        </div>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fish className="h-5 w-5 text-cyan-600" />
              Feeding History - {pond.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            {/* summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-cyan-600">{stats.totalLogs}</div>
                <div className="text-sm text-gray-500">Total Logs</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.todayCount}</div>
                <div className="text-sm text-gray-500">Today</div>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.averagePerDay}</div>
                <div className="text-sm text-gray-500">Avg/Day</div>
              </CardContent></Card>
            </div>

            {/* ML panel */}
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  ML Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">
                  {feedingLogs.length >= 10 ? (
                    <>
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">Pattern Analysis Ready</Badge>
                      <p className="mt-2">We're analyzing your feeding patterns to provide personalized recommendations.</p>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline">{feedingLogs.length}/10 logs needed</Badge>
                      <p className="mt-2">Keep logging feedings to unlock AI-powered insights and recommendations.</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* list */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent Feeding Logs</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full" />
                          <div>
                            <div className="w-24 h-4 bg-gray-200 rounded mb-1" />
                            <div className="w-32 h-3 bg-gray-200 rounded" />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-16 h-4 bg-gray-200 rounded mb-1" />
                          <div className="w-12 h-3 bg-gray-200 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : feedingLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Fish className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No feeding logs yet</p>
                    <p className="text-sm">Start logging feedings to track your pond&apos;s feeding history</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {feedingLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-cyan-100 rounded-full">
                            <Fish className="h-4 w-4 text-cyan-600" />
                          </div>
                          <div>
                            <div className="font-medium">Feeding Session</div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              {formatDate(log.fedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" />{formatTime(log.fedAt)}
                          </div>
                          <div className="text-xs text-gray-500">{formatTimeAgo(log.fedAt)}</div>
                          <Button variant="ghost" size="sm" className="mt-2 px-2" onClick={() => setSelectedLog(log)}>
                            <Eye className="h-4 w-4 text-cyan-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* details dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(v) => !v && setSelectedLog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Feeding Details</DialogTitle></DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Date</span>
                <span className="font-medium">{formatDate(selectedLog.fedAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Time</span>
                <span className="font-medium">{formatTime(selectedLog.fedAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Feed Given</span>
                <span className="font-medium">
                  {typeof selectedLog.feedGiven === "number" ? `${selectedLog.feedGiven} ${selectedLog.feedUnit ?? "g"}` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
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
    </>
  )
}
