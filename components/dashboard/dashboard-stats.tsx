//components/dashboard/dashboard-stats.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Fish, Droplets, Activity, TrendingUp } from "lucide-react"
import type { UnifiedPond } from "@/lib/pond-context"

interface DashboardStatsProps {
  pond: UnifiedPond
}

export function DashboardStats({ pond }: DashboardStatsProps) {
  // Add null checks for all pond properties
  if (!pond) {
    return null
  }

  // Calculate volume (length × width × depth) - using area and depth
  const area = pond.area || 0
  const depth = pond.depth || 0
  const fishCount = pond.fishCount || 0
  const volume = area * depth

  // Calculate stocking density (fish per cubic meter)
  const stockingDensity = volume > 0 ? fishCount / volume : 0

  const stats = [
    {
      title: "Total Fish",
      value: fishCount.toLocaleString(),
      icon: Fish,
      color: "text-blue-600",
    },
    {
      title: "Water Volume",
      value: `${volume.toFixed(1)} m³`,
      icon: Droplets,
      color: "text-cyan-600",
    },
    {
      title: "Stocking Density",
      value: `${stockingDensity.toFixed(1)} fish/m³`,
      icon: Activity,
      color: "text-green-600",
    },
    {
      title: "Growth Rate",
      value: "12.5%",
      icon: TrendingUp,
      color: "text-orange-600",
    },
  ]

  return (
    <>
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
