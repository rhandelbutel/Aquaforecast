"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { todayKeyManila } from "../time"; // ⬅️ relative import

const BUCKETS = ["00", "04", "08", "12", "16", "20"] as const;
const TICKS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"] as const;

type SumMap = { ph?: number; temp?: number; do?: number; tds?: number };
type Bucket = { count?: number; sum?: SumMap };
type Buckets = Record<string, Bucket>;
type DocLike = { buckets4h?: Buckets } & Record<string, any>;

function normalizeBuckets(data: DocLike | null): Buckets {
  const out: Buckets = {};
  if (!data) return out;

  // nested form
  if (data.buckets4h && typeof data.buckets4h === "object") {
    for (const [k, v] of Object.entries<any>(data.buckets4h)) {
      if (!out[k]) out[k] = { count: 0, sum: {} };
      if (typeof v?.count === "number") out[k].count = v.count;
      if (v?.sum && typeof v.sum === "object") {
        out[k].sum = { ...(out[k].sum || {}), ...v.sum };
      }
    }
  }

  // flattened form
  for (const [k, val] of Object.entries<any>(data)) {
    if (!k.startsWith("buckets4h.")) continue;
    const rest = k.slice("buckets4h.".length); // "00.count" | "00.sum.temp"
    const parts = rest.split(".");
    const bKey = parts[0];
    if (!out[bKey]) out[bKey] = { count: 0, sum: {} };

    if (parts[1] === "count") {
      if (typeof val === "number") out[bKey].count = val;
    } else if (parts[1] === "sum" && parts[2]) {
      out[bKey].sum = out[bKey].sum || {};
      (out[bKey].sum as any)[parts[2]] = val as number;
    }
  }

  return out;
}

export function useAnalytics24h(pondId: string) {
  const [raw, setRaw] = useState<DocLike | null>(null);

  useEffect(() => {
    const todayKey = todayKeyManila();
    const unsub = onSnapshot(doc(db, `ponds/${pondId}/dailyMetrics/${todayKey}`), s => {
      setRaw(s.exists() ? (s.data() as DocLike) : null);
    });
    return () => unsub();
  }, [pondId]);

  const build = (key: "ph" | "temp" | "do" | "tds") => {
    const buckets = normalizeBuckets(raw);

    const avgFor = (bk: string): number | null => {
      const b = buckets[bk];
      if (!b || !b.count) return null;
      const sum = b.sum?.[key] ?? 0;
      return sum / b.count;
    };

    const y = BUCKETS.map(avgFor);

    // return value typed as number|null (NOT undefined)
    return [
      { time: "00:00", value: y[0] ?? null },
      { time: "04:00", value: y[1] ?? null },
      { time: "08:00", value: y[2] ?? null },
      { time: "12:00", value: y[3] ?? null },
      { time: "16:00", value: y[4] ?? null },
      { time: "20:00", value: y[5] ?? null },
      { time: "24:00", value: (y[5] ?? null) }, // repeat last bucket
    ];
  };

  const ticks = useMemo(() => [...TICKS], []);

  return useMemo(() => ({
    ph: build("ph"),
    temp: build("temp"),
    do: build("do"),
    tds: build("tds"),
    ticks,
  }), [raw, ticks]);
}
