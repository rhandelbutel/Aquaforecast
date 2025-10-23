// components/dashboard/realtime-data.tsx
"use client";

import { Thermometer, Droplets, Zap } from "lucide-react";
import type { UnifiedPond } from "@/lib/pond-context";
import { useAquaSensors } from "@/hooks/useAquaSensors";

// ==================== SENSOR ENDPOINT CONFIG ====================
// Prefer env; falls back to mDNS host. Example:
// NEXT_PUBLIC_SENSORS_BASE=http://192.168.1.157
const ESP32_BASE =
  (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local";
// ===============================================================

// Ranges you’ve been using in your app (tweak as needed)
const RANGES = {
  ph:   { min: 6.5, max: 9.0, label: "6.5–9.0" },
  temp: { min: 28,  max: 31,  label: "22–28°C" },
  do:   { min: 3,   max: 5,   label: "3–5 mg/L" },
};

type Status = "optimal" | "warning" | "danger";

function classify(value: number, min: number, max: number): Status {
  if (value >= min && value <= max) return "optimal";
  const span = max - min;
  const warnLow = min - span * 0.1;
  const warnHigh = max + span * 0.1;
  if (value >= warnLow && value <= warnHigh) return "warning";
  return "danger";
}

function statusColor(status: Status) {
  switch (status) {
    case "optimal": return "bg-green-100 text-green-800";
    case "warning": return "bg-yellow-100 text-yellow-800";
    case "danger":  return "bg-red-100 text-red-800";
    default:        return "bg-gray-100 text-gray-800";
  }
}

function statusIcon(param: string, status: Status) {
  const iconClass =
    status === "optimal" ? "text-green-600" :
    status === "warning" ? "text-yellow-600" : "text-red-600";

  switch (param) {
    case "temperature":     return <Thermometer className={`h-4 w-4 ${iconClass}`} />;
    case "ph":              return <Droplets     className={`h-4 w-4 ${iconClass}`} />;
    case "dissolvedOxygen": return <Zap          className={`h-4 w-4 ${iconClass}`} />;
    default:                return <Droplets     className={`h-4 w-4 ${iconClass}`} />;
  }
}

interface RealtimeDataProps {
  pond: UnifiedPond;
}

export function RealtimeData({ pond }: RealtimeDataProps) {
  // Poll the ESP32 every second
  const { data, error, isOnline } = useAquaSensors({
    baseUrl: ESP32_BASE,
    intervalMs: 1000,
  });

  // Pull values (the hook gives you the exact JSON from /sensors)
  const tempVal = data?.temp ?? NaN;
  const phVal   = data?.ph   ?? NaN;
  const doVal   = data?.do   ?? NaN;

  const tempStatus = Number.isFinite(tempVal) ? classify(tempVal, RANGES.temp.min, RANGES.temp.max) : "danger";
  const phStatus   = Number.isFinite(phVal)   ? classify(phVal,   RANGES.ph.min,   RANGES.ph.max)   : "danger";
  const doStatus   = Number.isFinite(doVal)   ? classify(doVal,   RANGES.do.min,   RANGES.do.max)   : "danger";

  // This stub returns null so removing TDS won’t break the build if you’re refactoring UI separately.
  return null;
}
