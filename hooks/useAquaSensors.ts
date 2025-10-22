// hooks/useAquaSensors.ts
'use client';

import { useEffect, useRef, useState, useCallback } from "react";

export type SensorJson = {
  device: string;
  ts: number;        // ms epoch (or "now" if firmware gives uptime)
  temp: number | null;      // °C
  ph: number | null;
  do: number | null;        // mg/L
  connected?: boolean;
  v?: { ph?: number; do?: number };
};

type Options = {
  baseUrl?: string;     // e.g. "http://192.168.1.50" or "http://aquamon.local"
  intervalMs?: number;  // polling interval
};

function resolveBaseUrl(explicit?: string) {
  // priority: explicit > ?device= > localStorage > default
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const qs = new URLSearchParams(window.location.search);
    const fromQS = qs.get("device");
    if (fromQS) return fromQS;
    const fromLS = window.localStorage.getItem("aqua_base");
    if (fromLS) return fromLS;
  }
  return "http://aquamon.local";
}

function buildSensorsUrl(base: string) {
  const root = (base || "").replace(/\/+$/, "");
  // If caller already passed ".../sensors", don't double-append it
  return /\/sensors$/i.test(root) ? root : `${root}/sensors`;
}

// Normalize any firmware shape to SensorJson
function normalize(raw: any): SensorJson {
  const device = String(raw?.device ?? raw?.deviceId ?? "device");

  // Firmware 'ts' looks like uptime ticks; if too small, use Date.now()
  let ts = Number(raw?.ts ?? raw?.timeMs ?? raw?.timestamp);
  if (!Number.isFinite(ts) || ts < 1e10) ts = Date.now();

  const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : null);

  const temp = num(raw?.temp ?? raw?.temperature ?? raw?.tempC);
  const ph   = num(raw?.ph ?? raw?.pH);
  const domg = num(raw?.do ?? raw?.DOmgL ?? raw?.dissolvedOxygen);

  const v = raw?.v
    ? { ph: num(raw.v.ph) ?? undefined, do: num(raw.v.do) ?? undefined }
    : undefined;

  const connected =
    typeof raw?.connected === "boolean" ? raw.connected : undefined;

  return { device, ts, temp, ph, do: domg, connected, v };
}

export function useAquaSensors(opts: Options = {}) {
  const baseUrl = resolveBaseUrl(opts.baseUrl).replace(/\/+$/, "");
  const sensorsUrl = buildSensorsUrl(baseUrl);
  const intervalMs = opts.intervalMs ?? 1000;

  const [data, setData] = useState<SensorJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(intervalMs);

  // optional external listener without re-renders
  const onReadingRef = useRef<((r: SensorJson) => void) | undefined>(undefined);
  const setOnReading = useCallback((cb?: (r: SensorJson) => void) => {
    onReadingRef.current = cb;
  }, []);

  useEffect(() => {
    let aborted = false;

    async function tick() {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);

      try {
        const res = await fetch(sensorsUrl, {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const raw = await res.json();
        const normalized = normalize(raw);

        if (!aborted) {
          setData(normalized);
          setIsOnline(normalized.connected ?? true);
          setError(null);
          backoffRef.current = intervalMs;
          onReadingRef.current?.(normalized);
        }
      } catch (e: any) {
        if (!aborted) {
          setIsOnline(false);
          setError(e?.message ?? "Fetch failed");
          backoffRef.current = Math.min(Math.round(backoffRef.current * 1.8), 10000);
        }
      } finally {
        clearTimeout(timeout);
        if (!aborted) {
          timerRef.current = window.setTimeout(tick, backoffRef.current);
        }
      }
    }

    tick();
    return () => {
      aborted = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [sensorsUrl, intervalMs]);

  return { data, error, isOnline, setOnReading };
}
