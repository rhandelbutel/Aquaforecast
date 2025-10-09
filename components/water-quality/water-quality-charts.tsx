// app/(wherever)/water-quality/water-quality-charts.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAquaSensors } from "@/hooks/useAquaSensors";
import { useUser } from "@/lib/user-context";                 // ⬅️ added
import { Badge } from "@/components/ui/badge";                // ⬅️ added
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react"; // ⬅️ added

type SeriesPoint = { time: string; ts: number; value: number | null };

function formatTwoDecimals(v: unknown) {
  if (typeof v === "number" && isFinite(v)) return v.toFixed(2);
  const n = Number(v as any);
  return isFinite(n) ? n.toFixed(2) : String(v ?? "");
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** classify last reading vs range (with small warning band) */
function statusOf(
  value: number | null | undefined,
  min: number,
  max: number,
  marginPct = 0.10
): "optimal" | "warning" | "danger" {
  if (value == null || !isFinite(value)) return "warning";
  if (value >= min && value <= max) return "optimal";
  const span = Math.max(1e-6, max - min);
  const margin = span * marginPct;
  const lowerWarn = min - margin;
  const upperWarn = max + margin;
  return value < lowerWarn || value > upperWarn ? "danger" : "warning";
}

function badgeClass(status: "optimal" | "warning" | "danger") {
  switch (status) {
    case "optimal": return "bg-green-100 text-green-800 border-green-200";
    case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "danger":  return "bg-red-100 text-red-800 border-red-200";
  }
}

function useRolling24hSeries() {
  const { data } = useAquaSensors({ intervalMs: 2000 });

  const [series, setSeries] = useState({
    temp: [] as SeriesPoint[],
    ph: [] as SeriesPoint[],
    do: [] as SeriesPoint[],
    tds: [] as SeriesPoint[],
  });

  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;

    // Avoid pushing duplicates if the device sends unchanged millis rapidly
    if (lastTsRef.current && now - lastTsRef.current < 1000) return;
    lastTsRef.current = now;

    setSeries(prev => {
      const push = (arr: SeriesPoint[], value: number | null) => {
        const next = [...arr, { ts: now, time: formatTime(now), value }];
        // drop older than 24h
        return next.filter(p => p.ts >= windowStart);
      };
      return {
        temp: push(prev.temp, isFinite(Number(data.temp)) ? Number(data.temp) : null),
        ph: push(prev.ph, isFinite(Number(data.ph)) ? Number(data.ph) : null),
        do: push(prev.do, isFinite(Number(data.do)) ? Number(data.do) : null),
        tds: push(prev.tds, isFinite(Number(data.tds)) ? Number(data.tds) : null),
      };
    });
  }, [data]);

  // Provide static yDomains that make sense; pH commonly 6.5-9
  const yDomains = useMemo(() => ({
    temp: ['dataMin - 1', 'dataMax + 1'] as any,
    ph: [6.0, 9.5] as any,
    do: ['dataMin - 0.5', 'dataMax + 0.5'] as any,
    tds: ['dataMin - 10', 'dataMax + 10'] as any,
  }), []);

  return { ...series, yDomains };
}

const Chart = ({
  title, data, yDomain, min, max, unit,
}: { title: string; data: SeriesPoint[]; yDomain?: any; min: number; max: number; unit?: string }) => {
  // compute last reading + status
  const lastVal = data.length ? data[data.length - 1].value : null;
  const status = statusOf(lastVal, min, max);
  const StatusIcon = status === "optimal" ? CheckCircle : status === "warning" ? AlertTriangle : XCircle;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge className={`border ${badgeClass(status)} flex items-center gap-1`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {status === "optimal" ? "Optimal" : status === "warning" ? "Warning" : "Danger"}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            {/* ⬇️ GRAPH UNCHANGED */}
            <XAxis dataKey="time" minTickGap={24} />
            <YAxis domain={yDomain ?? ["auto", "auto"]} tickFormatter={formatTwoDecimals as any} />
            <Tooltip formatter={(value) => (unit ? `${formatTwoDecimals(value)} ${unit}` : formatTwoDecimals(value))} />
            <Line
              type="monotone"
              dataKey="value"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-gray-500">
          Range: {min}{unit ? ` ${unit}` : ""} – {max}{unit ? ` ${unit}` : ""}
        </div>
      </CardContent>
    </Card>
  );
};

export function WaterQualityCharts({ pondId }: { pondId: string }) {
  // pondId kept for parity and future per-pond devices; currently unused by sensor hub
  void pondId;

  const { preferences } = useUser(); // ⬅️ read thresholds if available
  const prefs = preferences || { tempMin: 28, tempMax: 31, phMin: 6.5, phMax: 9.0, doMin: 3, doMax: 5, tdsMin: 100, tdsMax: 400 };

  const { temp, ph, do: doSeries, tds, yDomains } = useRolling24hSeries();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Chart title="Temperature (Live, 24h)" data={temp} yDomain={yDomains.temp} min={prefs.tempMin} max={prefs.tempMax} unit="°C" />
        <Chart title="pH Level (Live, 24h)"   data={ph}   yDomain={yDomains.ph}   min={prefs.phMin}  max={prefs.phMax} />
        <Chart title="Dissolved Oxygen (Live, 24h)" data={doSeries} yDomain={yDomains.do} min={prefs.doMin} max={prefs.doMax} unit="mg/L" />
        <Chart title="TDS (Live, 24h)" data={tds} yDomain={yDomains.tds} min={prefs.tdsMin} max={prefs.tdsMax} unit="ppm" />
      </div>
    </div>
  );
}
