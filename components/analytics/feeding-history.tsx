// components/analytics/feeding-history.tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { History, Fish, TrendingUp, Clock, Calendar, Eye, User, Download } from "lucide-react"
import { getFeedingLogsByPond, subscribeFeedingLogs, type FeedingLog } from "@/lib/feeding-service"
import type { UnifiedPond } from "@/lib/pond-context"
import { useAuth } from "@/lib/auth-context"
import { captureById, buildPdfSinglePageFromImages, niceNow } from "@/lib/export-utils"

interface FeedingHistoryProps {
  pond: UnifiedPond
}

export function FeedingHistory({ pond }: FeedingHistoryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<FeedingLog | null>(null)
  const [stats, setStats] = useState({ totalLogs: 0, todayCount: 0, averagePerDay: 0 })
  const exportRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

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

const handleExport = async () => {
  const node = exportRef.current
  if (!node) return

  // Temporarily render the hidden section off-screen for capture
  const prevClass = node.className
  node.className = prevClass.replace(/\bhidden\b/g, "") + " fixed -left-[10000px] top-0 z-[-1]"
  await new Promise((r) => setTimeout(r, 30)) // allow layout/paint

  // Capture
  const dataUrl = await captureById("feeding-history-export")

  // Restore original classes no matter what
  node.className = prevClass
  if (!dataUrl) return

  // Build PDF with your standard header/footer
  await buildPdfSinglePageFromImages({
    images: [{ title: "", dataUrl }],
    fileName: `Feeding_History_${(pond as any).name || "Pond"}_${niceNow()}.pdf`,
    footer: { email: user?.email ?? "" },
    headerBrand: "AQUAFORECAST",
  })
}


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
                  Key Data Insights
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
                      <p className="mt-2">Keep logging feedings to unlock data-driven insights and recommendations.</p>
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
                  <div className="text-center py-8 text-gray-500">Loading…</div>
                ) : feedingLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Fish className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No feeding logs yet</p>
                    <p className="text-sm">Start logging feedings to track your pond&apos;s feeding history</p>
                  </div>
                ) : (
                  <>
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

                  </>
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

{/* 🔒 Hidden TABLE for export (centered content) */}
<div
  id={`feeding-history-export-${sharedId}`}
  data-export="feeding-history"
  ref={exportRef}
  className="hidden p-6 bg-white text-gray-800"
  style={{ width: 720 }} // crisp on A4
>
  <h2 className="text-center text-lg font-bold mb-1">AQUAFORECAST</h2>
  <p className="text-center text-sm mb-4">Feeding History — {pond.name}</p>

  <div className="mx-auto max-w-[720px]">
    <table className="w-full border-collapse border border-gray-300 text-center text-sm">
      <thead className="bg-gray-100">
        <tr>
          <th className="border border-gray-300 p-2">Date</th>
          <th className="border border-gray-300 p-2">Time</th>
          <th className="border border-gray-300 p-2">Feed Given</th>
          <th className="border border-gray-300 p-2">Logged By</th>
        </tr>
      </thead>
      <tbody>
        {feedingLogs.map((log) => (
          <tr key={log.id}>
            <td className="border border-gray-300 p-2">{formatDate(log.fedAt)}</td>
            <td className="border border-gray-300 p-2">{formatTime(log.fedAt)}</td>
            <td className="border border-gray-300 p-2">
              {typeof log.feedGiven === "number" ? `${log.feedGiven} ${log.feedUnit ?? "g"}` : "N/A"}
            </td>
            <td className="border border-gray-300 p-2">
              {log.userDisplayName || log.userEmail || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  {/* Footer texts are added by export-utils in the PDF */}
</div>

    </>
  )
}
