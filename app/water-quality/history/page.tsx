'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
import { db } from '@/lib/firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { usePonds } from '@/lib/pond-context'

// ---- Color map (matches your icons) ----
const SENSOR_COLOR: Record<'temp' | 'pH' | 'do' | 'tds', string> = {
  temp: '#16a34a', // green
  pH:   '#2563eb', // blue
  do:   '#9333ea', // purple
  tds:  '#f97316', // orange
}

const PARAMS = [
  { key: 'pH',   field: 'pH',   label: 'pH Level',          unit: '' },
  { key: 'temp', field: 'temp', label: 'Temperature',       unit: '°C' },
  { key: 'do',   field: 'do',   label: 'Dissolved Oxygen',  unit: 'mg/L' },
  { key: 'tds',  field: 'tds',  label: 'TDS',               unit: 'ppm' },
] as const

const FORTNIGHT_SIZE = 14

type DailyDoc = {
  date: string // "YYYY-MM-DD" (Asia/Manila)
  avg?: { ph?: number; temp?: number; do?: number; tds?: number }
}

/** Build continuous dates between min..max (inclusive), format as 'YYYY-MM-DD'. */
function enumerateDates(minKey: string, maxKey: string) {
  const [y1, m1, d1] = minKey.split('-').map(Number)
  const [y2, m2, d2] = maxKey.split('-').map(Number)
  const start = new Date(y1, m1 - 1, d1)
  const end = new Date(y2, m2 - 1, d2)
  const out: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** Label like 'Oct 16' from 'YYYY-MM-DD' (local). */
function labelFromKey(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// slice helper: Fortnight 1 = oldest days 1..14, Fortnight 2 = 15..28, etc.
function sliceFortnight<T>(rows: T[], fortnightIndex1: number, size = FORTNIGHT_SIZE) {
  const start = (fortnightIndex1 - 1) * size
  const end = Math.min(start + size, rows.length)
  return rows.slice(start, end)
}

export default function WaterQualityHistoryPage() {
  const { ponds } = usePonds()

  // Build a list that always points to the shared/admin doc space
  const effectivePonds = useMemo(() => {
    return (ponds ?? []).map(p => ({
      id: p.id!,                         // original user-pond id
      label: p.name,                     // display name
      effectiveId: (p as any).adminPondId ?? p.id!, // ✅ prefer shared/admin id
    }))
  }, [ponds])

  const [selectedPondId, setSelectedPondId] = useState<string | null>(null)

  // Parameter + Fortnight UI states
  const [param, setParam] = useState<(typeof PARAMS)[number]['key']>('temp')
  const [fortnight, setFortnight] = useState<number>(1)

  // Subscribe to dailyMetrics for the chosen (effective) pond
  const [dailyRows, setDailyRows] = useState<DailyDoc[]>([])
  useEffect(() => {
    // choose first pond by default
    if (!selectedPondId && effectivePonds.length > 0) {
      setSelectedPondId(effectivePonds[0].effectiveId)   // ✅ use shared/admin id
    }
  }, [effectivePonds, selectedPondId])

  useEffect(() => {
    if (!selectedPondId) {
      setDailyRows([])
      return
    }
    const qRef = query(
      collection(db, `ponds/${selectedPondId}/dailyMetrics`), // ✅ shared/admin path
      orderBy('date', 'asc')
    )
    const unsub = onSnapshot(qRef, (snap) => {
      const rows: DailyDoc[] = snap.docs.map((d) => d.data() as DailyDoc)
      setDailyRows(rows)
    })
    return () => unsub()
  }, [selectedPondId])

  // Build continuous series (fill nulls for missing days)
  const dataAll = useMemo(() => {
    if (!dailyRows || dailyRows.length === 0) return []
    const minKey = dailyRows[0].date
    const maxKey = dailyRows[dailyRows.length - 1].date
    const allKeys = enumerateDates(minKey, maxKey)

    const map = new Map<string, DailyDoc>()
    dailyRows.forEach((r) => map.set(r.date, r))

    return allKeys.map((key) => {
      const hit = map.get(key)
      return {
        dateKey: key,
        date: labelFromKey(key),
        pH: hit?.avg?.ph ?? null,
        temp: hit?.avg?.temp ?? null,
        do: hit?.avg?.do ?? null,
        tds: hit?.avg?.tds ?? null,
      }
    })
  }, [dailyRows])

  // Fortnight math
  const totalFortnights = Math.max(1, Math.ceil(dataAll.length / FORTNIGHT_SIZE))
  const clampedFortnight = Math.min(Math.max(1, fortnight), totalFortnights)
  const data = sliceFortnight(dataAll, clampedFortnight)

  const selectedParam = PARAMS.find((p) => p.key === param)!
  const color = SENSOR_COLOR[param]

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link href="/water-quality">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Water Quality
          </Button>
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold">Daily Trends</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle className="text-xl">{selectedParam.label}</CardTitle>

          <div className="flex flex-wrap items-center gap-3">
            {/* Pond selector (if multiple ponds) */}
            {effectivePonds.length > 1 && (
              <div className="w-48">
                <Select
                  value={selectedPondId ?? undefined}
                  onValueChange={(v) => setSelectedPondId(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pond" />
                  </SelectTrigger>
                  <SelectContent>
                    {effectivePonds.map((p) => (
                      <SelectItem key={p.effectiveId} value={p.effectiveId}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Fortnight selector */}
            <div className="w-40">
              <Select
                value={String(clampedFortnight)}
                onValueChange={(v) => setFortnight(parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fortnight" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalFortnights }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {`Fortnight ${n}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parameter selector */}
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
          </div>
        </CardHeader>

        <CardContent className="h-[360px]">
          {dataAll.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No daily data yet. Keep your sensor online to start building history.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => [
                    value == null
                      ? 'No data'
                      : selectedParam.unit
                      ? `${Number(value).toFixed(2)} ${selectedParam.unit}` // ✅ 2 decimals
                      : Number(value).toFixed(2),
                    selectedParam.label,
                  ]}
                />
                <Bar dataKey={selectedParam.field as any} fill={color} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
