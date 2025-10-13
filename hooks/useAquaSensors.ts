'use client';

import { useEffect, useRef, useState, useCallback } from "react";

export type SensorJson = {
  device: string;
  ts: number;   // millis since boot
  temp: number; // °C
  ph: number;
  tds: number;  // ppm
  do: number;   // mg/L
  v: { ph: number; tds: number; do: number };
};

type Options = {
  baseUrl?: string;     // e.g. "http://aquamon.local" or "/api"
  intervalMs?: number;  // polling interval
  // ⛔️ no function props; use setOnReading below
};

export function useAquaSensors(opts: Options = {}) {
  const baseUrl = (opts.baseUrl ?? "http://aquamon.local").replace(/\/+$/, "");
  const intervalMs = opts.intervalMs ?? 1000;

  const [data, setData] = useState<SensorJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(intervalMs);

  // keep an optional callback without making it a prop
  const onReadingRef = useRef<((r: SensorJson) => void) | undefined>(undefined);
  const setOnReading = useCallback((cb?: (r: SensorJson) => void) => {
    onReadingRef.current = cb;
  }, []);

  useEffect(() => {
    let aborted = false;

    async function tick() {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);

      try {
        const res = await fetch(`${baseUrl}/sensors`, {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: SensorJson = await res.json();
        if (!aborted) {
          setData(json);
          setIsOnline(true);
          setError(null);
          backoffRef.current = intervalMs;

          // call optional listener
          onReadingRef.current?.(json);
        }
      } catch (e: any) {
        if (!aborted) {
          setIsOnline(false);
          setError(e?.message ?? "Fetch failed");
          backoffRef.current = Math.min(Math.round(backoffRef.current * 1.8), 10000);
        }
      } finally {
        clearTimeout(t);
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
  }, [baseUrl, intervalMs]);

  return { data, error, isOnline, setOnReading };
}
