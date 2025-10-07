"use client";
import { Thermometer, Droplets, Zap, Eye } from "lucide-react";
import type { UnifiedPond } from "@/lib/pond-context";
import { useAquaSensors } from "@/hooks/useAquaSensors";

// ==================== SET THIS TO YOUR ESP32 IP ====================
const ESP32_BASE = "http://192.168.1.157"; // <-- change to the IP shown on LCD
// If you prefer mDNS and it works on your machine, you can use:
// const ESP32_BASE = "http://aquamon.local";
// Or if you created the Next.js proxy, use:
// const ESP32_BASE = "/api";
// ==================================================================

// Ranges you’ve been using in your app (tweak as needed)
const RANGES = {
  ph:   { min: 6.5, max: 8.5, label: "6.5–8.5" },
  temp: { min: 22,  max: 28,  label: "22–28°C" },
  do:   { min: 6,   max: 10,  label: "6–10 mg/L" },
  tds:  { min: 300, max: 500, label: "300–500 ppm" },
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
    case "tds":             return <Eye          className={`h-4 w-4 ${iconClass}`} />;
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
  const tdsVal  = data?.tds  ?? NaN;

  const tempStatus = Number.isFinite(tempVal) ? classify(tempVal, RANGES.temp.min, RANGES.temp.max) : "danger";
  const phStatus   = Number.isFinite(phVal)   ? classify(phVal,   RANGES.ph.min,   RANGES.ph.max)   : "danger";
  const doStatus   = Number.isFinite(doVal)   ? classify(doVal,   RANGES.do.min,   RANGES.do.max)   : "danger";
  const tdsStatus  = Number.isFinite(tdsVal)  ? classify(tdsVal,  RANGES.tds.min,  RANGES.tds.max)  : "danger";

}
