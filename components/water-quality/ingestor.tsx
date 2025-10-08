"use client";

import { useEffect } from "react";

export function Ingestor({ pondId }: { pondId: string }) {
  useEffect(() => {
    let stopped = false;

    async function pushOnce() {
      try {
        const res = await fetch("http://aquamon.local/sensors", { cache: "no-store" });
        const j = await res.json();
        if (stopped) return;

        // Post to your API route that updates Firestore buckets + daily sums
        await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pondId,
            temp: Number(j.temp),
            ph: Number(j.ph),
            tds: Number(j.tds),
            do: Number(j.do),
          }),
        });
      } catch (e) {
        // ignore network errors silently
      }
    }

    // send once now, then every 3 minutes
    pushOnce();
    const id = setInterval(pushOnce, 3 * 60 * 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pondId]);

  return null;
}
