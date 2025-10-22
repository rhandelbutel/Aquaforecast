// app/water-quality/water-quality-history.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import { db } from '@/lib/firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { usePonds } from '@/lib/pond-context'

// Export deps
import jsPDF from 'jspdf'
import { toPng } from 'html-to-image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

// ---- Color map (matches your icons) ----
const SENSOR_COLOR: Record<'temp' | 'pH' | 'do', string> = {
  temp: '#16a34a',
  pH: '#2563eb',
  do: '#9333ea',
}

const PARAMS = [
  { key: 'pH',   field: 'pH',   label: 'pH Level',         unit: '' },
  { key: 'temp', field: 'temp', label: 'Temperature',      unit: '°C' },
  { key: 'do',   field: 'do',   label: 'Dissolved Oxygen', unit: 'mg/L' },
] as const

const FORTNIGHT_SIZE = 14

type DailyDoc = {
  date: string // "YYYY-MM-DD" (Asia/Manila)
  avg?: { ph?: number; temp?: number; do?: number }
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

// ---------- tiny hook to detect desktop (md: 768px) ----------
function useIsDesktop(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= breakpoint,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const handler = () => setIsDesktop(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isDesktop
}

export default function WaterQualityHistoryPage() {
  const { ponds } = usePonds()
  const isDesktop = useIsDesktop()

  // Build a list that always points to the shared/admin doc space
  const effectivePonds = useMemo(() => {
    return (ponds ?? []).map((p) => ({
      id: p.id!, // original user-pond id
      label: p.name, // display name
      effectiveId: (p as any).adminPondId ?? p.id!, // prefer shared/admin id
    }))
  }, [ponds])

  const [selectedPondId, setSelectedPondId] = useState<string | null>(null)

  // Parameter + Fortnight UI states
  const [param, setParam] = useState<(typeof PARAMS)[number]['key']>('temp')
  const [fortnight, setFortnight] = useState<number>(1)

  // Subscribe to dailyMetrics for the chosen (effective) pond
  const [dailyRows, setDailyRows] = useState<DailyDoc[]>([])
  useEffect(() => {
    if (!selectedPondId && effectivePonds.length > 0) {
      setSelectedPondId(effectivePonds[0].effectiveId)
    }
  }, [effectivePonds, selectedPondId])

  useEffect(() => {
    if (!selectedPondId) {
      setDailyRows([])
      return
    }
    const qRef = query(
      collection(db, `ponds/${selectedPondId}/dailyMetrics`),
      orderBy('date', 'asc'),
    )
    const unsub = onSnapshot(qRef, (snap) => {
      const rows: DailyDoc[] = snap.docs.map((d) => d.data() as DailyDoc)
      setDailyRows(rows)
    })
    return () => unsub()
  }, [selectedPondId])

  // ✅ Build continuous series (fill nulls for missing days up to today)
  const dataAll = useMemo(() => {
    if (!dailyRows || dailyRows.length === 0) return []

    const minKey = dailyRows[0].date

    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayKey = `${y}-${m}-${d}`

    const allKeys = enumerateDates(minKey, todayKey)

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
      }
    })
  }, [dailyRows])

  // Fortnight math
  const totalFortnights = Math.max(1, Math.ceil(dataAll.length / FORTNIGHT_SIZE))
  const clampedFortnight = Math.min(Math.max(1, fortnight), totalFortnights)
  const data = sliceFortnight(dataAll, clampedFortnight)

  const selectedParam = PARAMS.find((p) => p.key === param)!
  const color = SENSOR_COLOR[param]

  // ========= Export UI state =========
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedSensors, setSelectedSensors] = useState<Set<string>>(
    new Set(['pH', 'temp', 'do']),
  )
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const toggleSensor = (key: string) =>
    setSelectedSensors((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // value label — shows "null" on missing values
  const makeValueLabel =
    (field: 'pH' | 'temp' | 'do', unit: string) =>
    (props: any) => {
      const v = props.value
      const display =
        v == null ? 'null' : unit ? `${Number(v).toFixed(2)} ${unit}` : Number(v).toFixed(2)
      return (
        <text x={props.x} y={props.y - 6} textAnchor="middle" fontSize={12} fill="#555">
          {display}
        </text>
      )
    }

  // ===== Single-page PDF export (adds another page only if it can't fit) =====
  async function handleExportPDF() {
    if (selectedSensors.size === 0) return

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    // Header
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('AQUAFORECAST — Water Quality Daily Trends', pageW / 2, 15, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const now = new Date().toLocaleString()
    pdf.text(`Generated on ${now}`, pageW / 2, 22, { align: 'center' })

    // Layout config
    const margin = 12
    const contentTop = 28
    const gap = 6
    const targetW = pageW - margin * 2

    // High-res export size; keep aspect and give extra space to avoid clipping
    const nativeW = 1200
    const nativeH = 480
    const aspect = nativeH / nativeW

    // Stack all charts on one page; shrink heights to fit if needed
    const ordered = PARAMS.map((p) => p.key).filter((k) => selectedSensors.has(k))
    const maxStackHeight = pageH - contentTop - margin - gap * Math.max(0, ordered.length - 1)
    const naturalImgH = targetW * aspect
    const imgH = Math.min(naturalImgH, maxStackHeight / ordered.length)

    let y = contentTop

    for (const k of ordered) {
      const el = exportRefs.current[k]
      if (!el) continue

      const dataUrl = await toPng(el, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        width: nativeW,
        height: nativeH,
      })

      if (y + imgH > pageH - margin) {
        pdf.addPage()
        y = contentTop
      }

      pdf.addImage(dataUrl, 'PNG', margin, y, targetW, imgH)
      y += imgH + gap
    }

    pdf.save('water-quality-daily-trends.pdf')
    setExportOpen(false)
  }

  // ----------- Reusable chart: desktop = responsive, mobile = horizontal scroll -----------
  function TrendsChart({
    paramKey,
    label,
    unit,
    color,
    data,
    innerRef,
    showTitle = false,
  }: {
    paramKey: 'pH' | 'temp' | 'do'
    label: string
    unit: string
    color: string
    data: any[]
    innerRef?: (el: HTMLDivElement | null) => void
    showTitle?: boolean
  }) {
    const field = PARAMS.find((p) => p.key === paramKey)!.field
    const ValueLabel = makeValueLabel(field as any, unit)

    if (isDesktop) {
      // DESKTOP: full responsive width (no horizontal scroll)
      return (
        <div ref={innerRef} className="w-full">
          {showTitle && <div className="text-base font-semibold mb-2">{label}</div>}
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 24, right: 28, left: 28, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={36}
                  tick={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => [
                    value == null ? 'No data' : unit ? `${Number(value).toFixed(2)} ${unit}` : Number(value).toFixed(2),
                    label,
                  ]}
                />
                <Bar dataKey={field as any} fill={color}>
                  <LabelList dataKey={field as any} content={<ValueLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    }

    // MOBILE: horizontal scroll with virtual width + thicker bars
    const perDay = 64 // adjust density on mobile (48..80)
    const minWidth = 640
    const chartWidth = Math.max(minWidth, data.length * perDay)
    const chartHeight = 420

    return (
      <div ref={innerRef} className="w-full">
        {showTitle && <div className="text-base font-semibold mb-2">{label}</div>}
        <div className="w-full overflow-x-auto">
          <div style={{ width: chartWidth }}>
            <BarChart
              width={chartWidth}
              height={chartHeight}
              data={data}
              margin={{ top: 24, right: 28, left: 28, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                interval={0}
                angle={-45}
                textAnchor="end"
                height={50}
                tick={{ fontSize: 11 }}
              />
              <YAxis />
              <Tooltip
                formatter={(value: any) => [
                  value == null ? 'No data' : unit ? `${Number(value).toFixed(2)} ${unit}` : Number(value).toFixed(2),
                  label,
                ]}
              />
              <Bar dataKey={field as any} fill={color} barSize={32}>
                <LabelList dataKey={field as any} content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header: keep Back left, Title center, Export right; no overlap */}
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2 mb-2">
        {/* Mobile: icon-only back */}
        <Link href="/water-quality" className="justify-self-start md:hidden">
          <Button variant="ghost" size="icon" aria-label="Back to Water Quality">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {/* Desktop: full text back */}
        <Link href="/water-quality" className="justify-self-start hidden md:block">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Water Quality
          </Button>
        </Link>

        <h1 className="text-2xl md:text-3xl font-semibold text-center">Daily Trends</h1>

        <Button
          onClick={() => setExportOpen(true)}
          size="sm"
          className="justify-self-end whitespace-nowrap bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 shadow-sm md:text-sm text-xs"
        >
          <span className="hidden md:inline">Export Trends</span>
          <span className="md:hidden">Export</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle className="text-xl">{selectedParam.label}</CardTitle>

          <div className="flex flex-wrap items-center gap-3">
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

        <CardContent>
          {dataAll.length === 0 ? (
            <div className="h-[360px] flex items-center justify-center text-muted-foreground">
              No daily data yet. Keep your sensor online to start building history.
            </div>
          ) : (
            <TrendsChart
              paramKey={selectedParam.key as any}
              label={selectedParam.label}
              unit={selectedParam.unit}
              color={color}
              data={data}
              showTitle={false} // avoid double heading
            />
          )}
        </CardContent>
      </Card>

      {/* ===== Export Modal ===== */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Trends</DialogTitle>
          </DialogHeader>

        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick which sensor charts to include in the PDF. Bars will show their values (or “null” if no data).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PARAMS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 rounded-md border p-3 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedSensors.has(p.key)}
                    onCheckedChange={() => toggleSensor(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>

            <Separator />

            {/* Offscreen render targets for crisp export (NOT display:none to avoid 0 size) */}
            <div
              aria-hidden
              style={{
                position: 'fixed',
                left: '-99999px',
                top: 0,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1,
              }}
            >
              {PARAMS.filter((p) => selectedSensors.has(p.key)).map((p) => (
                <div
                  key={`export-${p.key}`}
                  ref={(el) => {
                    exportRefs.current[p.key] = el
                  }}
                  style={{
                    width: 1200,
                    height: 480,
                    padding: 16,
                    background: '#fff',
                    display: 'block',
                  }}
                >
                  <ExportChart
                    paramKey={p.key as any}
                    label={`${p.label} — Fortnight ${clampedFortnight}`}
                    unit={p.unit}
                    color={SENSOR_COLOR[p.key as 'pH' | 'temp' | 'do']}
                    data={data}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPDF}>Export PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Dedicated fixed-size chart for clean export images (1200x480 above). */
function ExportChart({
  paramKey,
  label,
  unit,
  color,
  data,
}: {
  paramKey: 'pH' | 'temp' | 'do'
  label: string
  unit: string
  color: string
  data: any[]
}) {
  const field = PARAMS.find((p) => p.key === paramKey)!.field
  const ValueLabel = ((unitInner: string) =>
    (props: any) => {
      const v = props.value
      const display =
        v == null ? 'null' : unitInner ? `${Number(v).toFixed(2)} ${unitInner}` : Number(v).toFixed(2)
      return (
        <text x={props.x} y={props.y - 6} textAnchor="middle" fontSize={12} fill="#555">
          {display}
        </text>
      )
    })(unit)

  return (
    <div className="w-full">
      <div className="text-base font-semibold mb-2">{label}</div>
      <BarChart width={1200} height={448} data={data} margin={{ top: 24, right: 28, left: 28, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip
          formatter={(value: any) => [
            value == null ? 'No data' : unit ? `${Number(value).toFixed(2)} ${unit}` : Number(value).toFixed(2),
            label,
          ]}
        />
        <Bar dataKey={field as any} fill={color} barSize={32}>
          <LabelList dataKey={field as any} content={<ValueLabel />} />
        </Bar>
      </BarChart>
    </div>
  )
}
