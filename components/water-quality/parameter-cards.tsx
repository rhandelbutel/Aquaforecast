// app/(wherever)/water-quality/parameter-cards.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useEffect, useMemo, useState } from "react";
import { useDailyMetrics } from "@/lib/hooks/useDailyMetrics";

interface ParameterCardsProps {
  pondId: string;
}

const getTrendIcon = (trend: "up"|"down"|"stable") => {
  switch (trend) {
    case "up": return TrendingUp;
    case "down": return TrendingDown;
    default: return Minus;
  }
};

const getTrendColor = (trend: "up"|"down"|"stable", status: string) => {
  if (status === "warning" && trend === "up") return "text-red-500";
  if (trend === "up") return "text-green-500";
  if (trend === "down") return "text-blue-500";
  return "text-gray-500";
};

const statusOf = (value: number, min: number, max: number) =>
  value < min || value > max ? "warning" : "optimal";

export function ParameterCards({ pondId }: ParameterCardsProps) {
  const { preferences } = useUser();
  const prefs = preferences || { tempMin: 28, tempMax: 31, phMin: 6.5, phMax: 9.0, doMin: 3, doMax: 5, tdsMin: 100, tdsMax: 400 };

  // 1) live current from ESP32 (LAN)
  const [current, setCurrent] = useState<{ph:number; temp:number; do:number; tds:number} | null>(null);
  useEffect(() => {
    let mounted = true;
    async function tick() {
      try {
        const res = await fetch("http://aquamon.local/sensors", { cache: "no-store" });
        const j = await res.json();
        if (!mounted) return;
        setCurrent({ ph: j.ph, temp: j.temp, do: j.do, tds: j.tds });
        // also (optionally) post every ~3–5 minutes to /api/ingest — do this elsewhere or add a throttle here
      } catch {}
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // 2) today/yesterday averages
  const { today, yesterday } = useDailyMetrics(pondId);

  // helper to compute trend vs yesterday
  const trendOf = (todayVal: number | null, yVal: number | null): "up"|"down"|"stable" => {
    if (todayVal == null || yVal == null) return "stable";
    const diff = todayVal - yVal;
    if (Math.abs(diff) < 1e-3) return "stable";
    return diff > 0 ? "up" : "down";
  };

  const cards = useMemo(() => {
    const cur = current ?? { ph: NaN, temp: NaN, do: NaN, tds: NaN };
    return [
      {
        name: "pH Level",
        current: isFinite(cur.ph) ? cur.ph.toFixed(2) : "—",
        previous: yesterday.ph != null ? yesterday.ph.toFixed(2) : "—",
        trend: trendOf(today.ph, yesterday.ph),
        status: isFinite(cur.ph) ? statusOf(cur.ph, prefs.phMin, prefs.phMax) : "optimal",
        range: `${prefs.phMin}-${prefs.phMax}`,
      },
      {
        name: "Temperature",
        current: isFinite(cur.temp) ? `${cur.temp.toFixed(2)}°C` : "—",
        previous: yesterday.temp != null ? `${yesterday.temp.toFixed(2)}°C` : "—",
        trend: trendOf(today.temp, yesterday.temp),
        status: isFinite(cur.temp) ? statusOf(cur.temp, prefs.tempMin, prefs.tempMax) : "optimal",
        range: `${prefs.tempMin}-${prefs.tempMax}°C`,
      },
      {
        name: "Dissolved Oxygen",
        current: isFinite(cur.do) ? `${cur.do.toFixed(2)} mg/L` : "—",
        previous: yesterday.do != null ? `${yesterday.do.toFixed(2)} mg/L` : "—",
        trend: trendOf(today.do, yesterday.do),
        status: isFinite(cur.do) ? statusOf(cur.do, prefs.doMin, prefs.doMax) : "optimal",
        range: `${prefs.doMin}-${prefs.doMax} mg/L`,
      },
      {
        name: "TDS",
        current: isFinite(cur.tds) ? `${cur.tds.toFixed(0)} ppm` : "—",
        previous: yesterday.tds != null ? `${yesterday.tds.toFixed(0)} ppm` : "—",
        trend: trendOf(today.tds, yesterday.tds),
        status: isFinite(cur.tds) ? statusOf(cur.tds, prefs.tdsMin, prefs.tdsMax) : "optimal",
        range: `${prefs.tdsMin}-${prefs.tdsMax} ppm`,
      },
    ];
  }, [current, today, yesterday, prefs]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((param) => {
        const TrendIcon = getTrendIcon(param.trend as any);
        return (
          <Card key={param.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{param.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{param.current}</div>
                {/* <TrendIcon className={`h-4 w-4 ${getTrendColor(param.trend as any, param.status)}`} /> */}
              </div>
              <p className="text-xs text-gray-500 mt-1">Range: {param.range}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
