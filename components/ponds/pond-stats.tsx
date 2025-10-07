"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Fish, Waves, Droplets, TrendingUp } from "lucide-react"
import type { UnifiedPond } from "@/lib/pond-context"
import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"

interface PondStatsProps {
  ponds: UnifiedPond[]
}

export function PondStats({ ponds }: PondStatsProps) {
  const totalPonds = ponds.length
  const totalArea = ponds.reduce((sum, pond) => sum + (pond.area || 0), 0)
  const avgDepth =
    ponds.length > 0 ? ponds.reduce((sum, pond) => sum + (pond.depth || 0), 0) / ponds.length : 0

  // survival % cache per pond (0–100)
  const [survivalByPond, setSurvivalByPond] = useState<Record<string, number>>({})

  // subscribe to mortality logs for each pond (admin & user share by adminPondId || id)
  useEffect(() => {
    const unsubs: Array<() => void> = []
    ponds.forEach((p) => {
      const sharedId = (p as any).adminPondId || p.id
      if (!sharedId) return
      const unsub = subscribeMortalityLogs(sharedId, (logs: MortalityLog[]) => {
        const sr = computeSurvivalRateFromLogs(logs) // 0–100
        setSurvivalByPond((prev) => ({ ...prev, [sharedId]: sr }))
      })
      unsubs.push(unsub)
    })
    return () => unsubs.forEach((u) => u && u())
  }, [ponds])

  // sum of estimated alive across ponds
  const totalEstimatedAlive = useMemo(() => {
    return ponds.reduce((sum, p) => {
      const sharedId = (p as any).adminPondId || p.id
      const initial = (p as any).initialFishCount ?? p.fishCount ?? 0
      const sr = survivalByPond[sharedId]
      const alive =
        typeof sr === "number" ? Math.max(0, Math.round((sr / 100) * initial)) : initial
      return sum + alive
    }, 0)
  }, [ponds, survivalByPond])

  const stats = [
    {
      title: "Total Ponds",
      value: totalPonds.toString(),
      icon: Waves,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Estimated Fish Alive",
      value: totalEstimatedAlive.toLocaleString(),
      icon: Fish,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Total Area",
      value: `${totalArea.toFixed(1)} m²`,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Avg Depth",
      value: `${avgDepth.toFixed(1)} m`,
      icon: Droplets,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
