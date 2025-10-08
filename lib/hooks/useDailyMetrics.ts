"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { todayKeyManila, yesterdayKeyManila } from "../time"; // ⬅️ relative

type DailyDoc = {
  sum?: { ph?: number; temp?: number; do?: number; tds?: number };
  count?: number;
};

export function useDailyMetrics(pondId: string) {
  const [today, setToday] = useState<DailyDoc | null>(null);
  const [yesterday, setYesterday] = useState<DailyDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayKey = todayKeyManila();
    const yKey = yesterdayKeyManila();

    const unsub1 = onSnapshot(doc(db, `ponds/${pondId}/dailyMetrics/${todayKey}`), s => {
      setToday(s.exists() ? (s.data() as DailyDoc) : null);
    });
    const unsub2 = onSnapshot(doc(db, `ponds/${pondId}/dailyMetrics/${yKey}`), s => {
      setYesterday(s.exists() ? (s.data() as DailyDoc) : null);
      setLoading(false);
    });

    return () => { unsub1(); unsub2(); };
  }, [pondId]);

  const avgs = (d: DailyDoc | null) => {
    const c = d?.count ?? 0;
    const s = d?.sum ?? {};
    if (!c) return { ph: null, temp: null, do: null, tds: null };
    return {
      ph: (s.ph ?? 0) / c,
      temp: (s.temp ?? 0) / c,
      do: (s.do ?? 0) / c,
      tds: (s.tds ?? 0) / c,
    };
  };

  return useMemo(() => ({
    today: avgs(today),
    yesterday: avgs(yesterday),
    loading,
  }), [today, yesterday, loading]);
}
