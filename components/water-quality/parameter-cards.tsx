// app/(wherever)/water-quality/parameter-cards.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useEffect, useMemo, useState } from "react";
import { useDailyMetrics } from "@/lib/hooks/useDailyMetrics";
import { Badge } from "@/components/ui/badge";

interface ParameterCardsProps {
  pondId: string;
}

const ONLINE_GRACE_MS = 20_000; // consider offline if no update for 20s

const getTrendIcon = (trend: "up" | "down" | "stable") => {
  switch (trend) {
    case "up": return TrendingUp;
    case "down": return TrendingDown;
    default: return Minus;
  }
};

const getTrendColor = (trend: "up" | "down" | "stable", status: string) => {
  if (status === "warning" && trend === "up") return "text-red-500";
  if (trend === "up") return "text-green-500";
  if (trend === "down") return "text-blue-500";
  return "text-gray-500";
};

/** Classify value vs range with a small warning margin */
const statusOf = (
  value: number,
  min: number,
  max: number,
  marginPct = 0.1
): "optimal" | "warning" | "danger" => {
  if (!isFinite(value)) return "warning";
  if (value >= min && value <= max) return "optimal";

  const span = Math.max(1e-6, max - min);
  const margin = span * marginPct;
  const lowerWarn = min - margin;
  const upperWarn = max + margin;

  return value < lowerWarn || value > upperWarn ? "danger" : "warning";
};

// Include "offline" style
const badgeClass = (
  status: "optimal" | "warning" | "danger" | "offline"
) => {
  switch (status) {
    case "optimal": return "bg-green-100 text-green-800 border-green-200";
    case "warning": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "danger":  return "bg-red-100 text-red-800 border-red-200";
    case "offline": return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export function ParameterCards({ pondId }: ParameterCardsProps) {
  const { preferences } = useUser();
  const prefs =
    preferences || {
      tempMin: 28, tempMax: 31,
      phMin: 6.5, phMax: 9.0,
      doMin: 3,   doMax: 5,
      tdsMin: 100, tdsMax: 400,
    };

  // 1) live current from ESP32 (LAN)
  const [current, setCurrent] = useState<{ ph: number; temp: number; do: number; tds: number } | null>(null);

  // track last successful fetch time
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  // heartbeat so "online" can expire in real time
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  // precise one-shot timer that fires exactly when grace window ends
  useEffect(() => {
    if (lastSeen == null) return;
    const remain = Math.max(0, ONLINE_GRACE_MS - (Date.now() - lastSeen));
    const id = setTimeout(() => setTick(t => t + 1), remain + 5);
    return () => clearTimeout(id);
  }, [lastSeen]);

  useEffect(() => {
    let mounted = true;

    async function tickFetch() {
      try {
        const res = await fetch("http://aquamon.local/sensors", { cache: "no-store" });
        const j = await res.json();
        if (!mounted) return;
        setCurrent({
          ph: Number(j.ph),
          temp: Number(j.temp),
          do: Number(j.do),
          tds: Number(j.tds),
        });
        setLastSeen(Date.now()); // mark successful arrival
      } catch {
        // no update → lastSeen unchanged so it will drift to offline
      }
    }

    tickFetch();
    const id = setInterval(tickFetch, 10_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const online = lastSeen != null && Date.now() - lastSeen <= ONLINE_GRACE_MS;

  // 2) today/yesterday averages
  const { today, yesterday } = useDailyMetrics(pondId);

  const trendOf = (todayVal: number | null, yVal: number | null): "up" | "down" | "stable" => {
    if (todayVal == null || yVal == null) return "stable";
    const diff = todayVal - yVal;
    if (Math.abs(diff) < 1e-3) return "stable";
    return diff > 0 ? "up" : "down";
  };

  const cards = useMemo(() => {
    const cur = current ?? { ph: NaN, temp: NaN, do: NaN, tds: NaN };

    const computeStatus = (
      v: number, min: number, max: number
    ): "optimal" | "warning" | "danger" | "offline" =>
      online ? statusOf(v, min, max) : "offline";

    const phStatus  = computeStatus(cur.ph,   prefs.phMin,   prefs.phMax);
    const tStatus   = computeStatus(cur.temp, prefs.tempMin, prefs.tempMax);
    const doStatus  = computeStatus(cur.do,   prefs.doMin,   prefs.doMax);
    const tdsStatus = computeStatus(cur.tds,  prefs.tdsMin,  prefs.tdsMax);

    return [
      {
        key: "ph",
        name: "pH Level",
        current: isFinite(cur.ph) ? cur.ph.toFixed(2) : "—",
        previous: yesterday.ph != null ? yesterday.ph.toFixed(2) : "—",
        trend: trendOf(today.ph, yesterday.ph),
        status: phStatus,
        range: `${prefs.phMin}-${prefs.phMax}`,
      },
      {
        key: "temp",
        name: "Temperature",
        current: isFinite(cur.temp) ? `${cur.temp.toFixed(2)}°C` : "—",
        previous: yesterday.temp != null ? `${yesterday.temp.toFixed(2)}°C` : "—",
        trend: trendOf(today.temp, yesterday.temp),
        status: tStatus,
        range: `${prefs.tempMin}-${prefs.tempMax}°C`,
      },
      {
        key: "do",
        name: "Dissolved Oxygen",
        current: isFinite(cur.do) ? `${cur.do.toFixed(2)} mg/L` : "—",
        previous: yesterday.do != null ? `${yesterday.do.toFixed(2)} mg/L` : "—",
        trend: trendOf(today.do, yesterday.do),
        status: doStatus,
        range: `${prefs.doMin}-${prefs.doMax} mg/L`,
      },
      {
        key: "tds",
        name: "TDS",
        current: isFinite(cur.tds) ? `${cur.tds.toFixed(0)} ppm` : "—",
        previous: yesterday.tds != null ? `${yesterday.tds.toFixed(0)} ppm` : "—",
        trend: trendOf(today.tds, yesterday.tds),
        status: tdsStatus,
        range: `${prefs.tdsMin}-${prefs.tdsMax} ppm`,
      },
    ] as const;
  // include `tick` so the memo recalculates as time passes
  }, [current, today, yesterday, prefs, online, tick]);

  return (
    <div id="wq-cards" data-online={online ? "1" : "0"}>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((param) => {
        const TrendIcon = getTrendIcon(param.trend as any);
        return (
          <Card key={param.key}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {param.name}
                </CardTitle>
                <Badge className={`border ${badgeClass(param.status)}`}>
                  {param.status === "offline"
                    ? "Offline"
                    : param.status === "optimal"
                    ? "Optimal"
                    : param.status === "warning"
                    ? "Warning"
                    : "Danger"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">
                  {param.current}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Range: {param.range}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
    </div>
  );
}
