// app/(wherever)/water-quality/water-quality-charts.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAquaSensors } from "@/hooks/useAquaSensors";
import { useUser } from "@/lib/user-context";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert"; // ⬅️ NEW

type SeriesPoint = { time: string; ts: number; value: number | null };

// ⬇️ consider device offline if no fresh data within this window
const ONLINE_GRACE_MS = 20_000;

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

function badgeClass(status: "optimal" | "warning" | "danger" | "offline") {
  switch (status) {
    case "optimal": return "bg-green-100 text-green-800 border-green-200";
    case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "danger":  return "bg-red-100 text-red-800 border-red-200";
    case "offline": return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

/** rolling series + online/offline */
function useRolling24hSeries() {
  const { data } = useAquaSensors({ intervalMs: 2000 });

  const [series, setSeries] = useState({
    temp: [] as SeriesPoint[],
    ph: [] as SeriesPoint[],
    do: [] as SeriesPoint[],
    tds: [] as SeriesPoint[],
  });

  const [lastSeen, setLastSeen] = useState<number | null>(null); // ⬅️ NEW
  const [tick, setTick] = useState(0);                           // ⬅️ refresh online calc each sec
  const lastTsRef = useRef<number | null>(null);

  // heartbeat timer for online state
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;

    if (lastTsRef.current && now - lastTsRef.current < 1000) return;
    lastTsRef.current = now;

    setLastSeen(now); // ⬅️ mark last successful arrival

    setSeries(prev => {
      const push = (arr: SeriesPoint[], value: number | null) => {
        const next = [...arr, { ts: now, time: formatTime(now), value }];
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

  const online = lastSeen != null && Date.now() - lastSeen <= ONLINE_GRACE_MS; // ⬅️ NEW

  const yDomains = useMemo(() => ({
    temp: ['dataMin - 1', 'dataMax + 1'] as any,
    ph: [6.0, 9.5] as any,
    do: ['dataMin - 0.5', 'dataMax + 0.5'] as any,
    tds: ['dataMin - 10', 'dataMax + 10'] as any,
  }), []);

  // nice human string for last update
  const lastAgo = useMemo(() => {
    if (!lastSeen) return "never";
    const s = Math.round((Date.now() - lastSeen) / 1000);
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
  }, [lastSeen, tick]);

  return { ...series, yDomains, online, lastAgo };
}

const Chart = ({
  title, data, yDomain, min, max, unit, offline,
}: {
  title: string;
  data: SeriesPoint[];
  yDomain?: any;
  min: number;
  max: number;
  unit?: string;
  offline: boolean;            // ⬅️ NEW
}) => {
  // compute last reading + status
  const lastVal = data.length ? data[data.length - 1].value : null;
  const status = offline ? "offline" : statusOf(lastVal, min, max);
  const StatusIcon =
    status === "optimal" ? CheckCircle :
    status === "warning" ? AlertTriangle :
    status === "danger"  ? XCircle :
    AlertCircle; // offline icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge className={`border ${badgeClass(status as any)} flex items-center gap-1`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {status === "offline"
                ? "Offline"
                : status === "optimal"
                ? "Optimal"
                : status === "warning"
                ? "Warning"
                : "Danger"}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
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
              opacity={offline ? 0.35 : 1}   // ⬅️ dim when offline
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
  void pondId;

  const { preferences } = useUser();
  const prefs = preferences || { tempMin: 28, tempMax: 31, phMin: 6.5, phMax: 9.0, doMin: 3, doMax: 5, tdsMin: 100, tdsMax: 400 };

  const { temp, ph, do: doSeries, tds, yDomains, online, lastAgo } = useRolling24hSeries(); // ⬅️ grab online + lastAgo

  return (
    <div className="space-y-6">
      {/* ⬇️ OFFLINE ALERT BANNER */}
      {!online && (
        <Alert variant="destructive" className="border-red-300">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Sensor offline.</span> Last update: {lastAgo}. Check device power, Wi-Fi/LAN, or endpoint <code>/sensors</code>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Chart title="Temperature (Live, 24h)" data={temp} yDomain={yDomains.temp} min={prefs.tempMin} max={prefs.tempMax} unit="°C" offline={!online} />
        <Chart title="pH Level (Live, 24h)"   data={ph}   yDomain={yDomains.ph}   min={prefs.phMin}  max={prefs.phMax} offline={!online} />
        <Chart title="Dissolved Oxygen (Live, 24h)" data={doSeries} yDomain={yDomains.do} min={prefs.doMin} max={prefs.doMax} unit="mg/L" offline={!online} />
        <Chart title="TDS (Live, 24h)" data={tds} yDomain={yDomains.tds} min={prefs.tdsMin} max={prefs.tdsMax} unit="ppm" offline={!online} />
      </div>
    </div>
  );
}
