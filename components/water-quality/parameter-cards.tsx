"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useUser } from "@/lib/user-context"

interface ParameterCardsProps {
  pondId: string
}

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case "up":
      return TrendingUp
    case "down":
      return TrendingDown
    default:
      return Minus
  }
}

const getTrendColor = (trend: string, status: string) => {
  if (status === "warning" && trend === "up") return "text-red-500"
  if (trend === "up") return "text-green-500"
  if (trend === "down") return "text-blue-500"
  return "text-gray-500"
}

const checkParameterStatus = (value: number, min: number, max: number) => {
  if (value < min || value > max) return "warning"
  return "optimal"
}

export function ParameterCards({ pondId }: ParameterCardsProps) {
  const { preferences } = useUser()

  // Generate mock current readings
  const currentReadings = {
    ph: 7.0 + Math.random() * 0.5,
    temperature: 24 + Math.random() * 2,
    dissolvedOxygen: 8.0 + Math.random() * 0.5,
    tds: 440 + Math.random() * 20,
  }

  // Use user preferences or defaults
  const prefs = preferences || {
    tempMin: 22,
    tempMax: 28,
    phMin: 6.5,
    phMax: 8.5,
    doMin: 6,
    doMax: 10,
    tdsMin: 300,
    tdsMax: 500,
  }

  const parameters = [
    {
      name: "pH Level",
      current: currentReadings.ph.toFixed(1),
      previous: (currentReadings.ph - 0.1).toFixed(1),
      trend: "up",
      status: checkParameterStatus(currentReadings.ph, prefs.phMin, prefs.phMax),
      range: `${prefs.phMin}-${prefs.phMax}`,
    },
    {
      name: "Temperature",
      current: `${currentReadings.temperature.toFixed(1)}°C`,
      previous: `${(currentReadings.temperature - 0.3).toFixed(1)}°C`,
      trend: "down",
      status: checkParameterStatus(currentReadings.temperature, prefs.tempMin, prefs.tempMax),
      range: `${prefs.tempMin}-${prefs.tempMax}°C`,
    },
    {
      name: "Dissolved Oxygen",
      current: `${currentReadings.dissolvedOxygen.toFixed(1)} mg/L`,
      previous: `${currentReadings.dissolvedOxygen.toFixed(1)} mg/L`,
      trend: "stable",
      status: checkParameterStatus(currentReadings.dissolvedOxygen, prefs.doMin, prefs.doMax),
      range: `${prefs.doMin}-${prefs.doMax} mg/L`,
    },
    {
      name: "TDS",
      current: `${currentReadings.tds.toFixed(0)} ppm`,
      previous: `${(currentReadings.tds - 5).toFixed(0)} ppm`,
      trend: "up",
      status: checkParameterStatus(currentReadings.tds, prefs.tdsMin, prefs.tdsMax),
      range: `${prefs.tdsMin}-${prefs.tdsMax} ppm`,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {parameters.map((param) => {
        const TrendIcon = getTrendIcon(param.trend)
        return (
          <Card key={param.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{param.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{param.current}</div>
                <TrendIcon className={`h-4 w-4 ${getTrendColor(param.trend, param.status)}`} />
              </div>
              <p className="text-xs text-gray-500 mt-1">Previous: {param.previous}</p>
              <p className="text-xs text-gray-500 mt-1">Range: {param.range}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
