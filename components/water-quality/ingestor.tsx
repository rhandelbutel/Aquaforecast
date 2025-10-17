// components/water-quality/ingestor.tsx
"use client";

import { useEffect } from "react";

export function Ingestor({ pondId }: { pondId: string }) {
  useEffect(() => {
    let stopped = false;

    async function pushOnce() {
      try {
        const res = await fetch("http://aquamon.local/sensors", { cache: "no-store" });
        if (!res.ok) return; // treat as offline if bad status
        const j = await res.json();
        if (stopped) return;

        const payload = {
          pondId,
          temp: Number(j.temp),
          ph: Number(j.ph),
          tds: Number(j.tds),
          do: Number(j.do),
        };

        // basic sanity: if any value isn't a finite number, skip (sensor glitch/offline)
        if ([payload.temp, payload.ph, payload.tds, payload.do].some((v) => !Number.isFinite(v))) {
          return;
        }

        // Post to API route that updates today's daily doc (running average + sums + counts)
        await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // network errors -> treat as offline; do nothing
      }
    }

    // send immediately, then every 30s
    pushOnce();
    const id = setInterval(pushOnce, 30 * 1000);

    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pondId]);

  return null;
}
