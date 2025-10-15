// app/water-quality/history/page.tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ---- Color map (matches your icons) ----
const SENSOR_COLOR: Record<'temp' | 'pH' | 'do' | 'tds', string> = {
  temp: '#16a34a', // green
  pH:   '#2563eb', // blue
  do:   '#9333ea', // purple
  tds:  '#f97316', // orange
}

// --- Mock daily data for last 14 days (replace with real aggregates soon) ---
function makeMock() {
  const labels = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
  return labels.map((date) => ({
    date,
    pH: +(6.8 + Math.random() * 0.6).toFixed(2),
    temp: +(28 + Math.random() * 3).toFixed(2), // °C
    do: +(3.6 + Math.random() * 1.2).toFixed(2), // mg/L
    tds: Math.round(220 + Math.random() * 160),  // ppm
  }))
}

const PARAMS = [
  { key: 'pH',   field: 'pH',   label: 'pH Level',          unit: '' },
  { key: 'temp', field: 'temp', label: 'Temperature',       unit: '°C' },
  { key: 'do',   field: 'do',   label: 'Dissolved Oxygen',  unit: 'mg/L' },
  { key: 'tds',  field: 'tds',  label: 'TDS',               unit: 'ppm' },
] as const

export default function WaterQualityHistoryPage() {
  const [param, setParam] = useState<(typeof PARAMS)[number]['key']>('temp')
  const data = useMemo(() => makeMock(), [])
  const selected = PARAMS.find((p) => p.key === param)!

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/water-quality">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Water Quality
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold">Daily Trends</h1>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle className="text-xl">
            {selected.label} (last 14 days)
          </CardTitle>

          <div className="w-48">
            <Select value={param} onValueChange={(v) => setParam(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select parameter" />
              </SelectTrigger>
              <SelectContent>
                {PARAMS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: any) => [
                  selected.unit ? `${value} ${selected.unit}` : value,
                  selected.label,
                ]}
              />
              {/* Color now matches selected parameter */}
              <Bar dataKey={selected.field as any} fill={SENSOR_COLOR[param]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
