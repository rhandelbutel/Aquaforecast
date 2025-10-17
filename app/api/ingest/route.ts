// app/api/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { DateTime } from "luxon";

type DailyDoc = {
  date: string;
  tz: string;
  lastUpdated?: any;
  lastSampleAt?: Timestamp;
  count?: number;
  sum?: { ph?: number; temp?: number; do?: number; tds?: number };
  avg?: { ph?: number; temp?: number; do?: number; tds?: number };
  buckets4h?: Record<
    string,
    {
      count?: number;
      sum?: { ph?: number; temp?: number; do?: number; tds?: number };
      avg?: { ph?: number; temp?: number; do?: number; tds?: number };
      lastUpdated?: any;
    }
  >;
};

export async function POST(req: NextRequest) {
  try {
    const { pondId, ph, temp, tds, do: doMgL } = await req.json();

    // validate
    if (!pondId || [ph, temp, tds, doMgL].some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
    }

    // Align to Asia/Manila midnight
    const dt = DateTime.now().setZone("Asia/Manila");
    const dateKey = dt.toFormat("yyyy-LL-dd");
    const bucketKey = String(Math.floor(dt.hour / 4) * 4).padStart(2, "0"); // "00","04","08","12","16","20"

    const ref = doc(db, `ponds/${pondId}/dailyMetrics/${dateKey}`);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prev = (snap.exists() ? (snap.data() as DailyDoc) : {}) as DailyDoc;

      const prevCount = prev.count ?? 0;
      const prevSum = {
        ph: prev.sum?.ph ?? 0,
        temp: prev.sum?.temp ?? 0,
        do: prev.sum?.do ?? 0,
        tds: prev.sum?.tds ?? 0,
      };

      // new global aggregates
      const nextCount = prevCount + 1;
      const nextSum = {
        ph: prevSum.ph + ph,
        temp: prevSum.temp + temp,
        do: prevSum.do + doMgL,
        tds: prevSum.tds + tds,
      };
      const nextAvg = {
        ph: Number((nextSum.ph / nextCount).toFixed(3)),
        temp: Number((nextSum.temp / nextCount).toFixed(3)),
        do: Number((nextSum.do / nextCount).toFixed(3)),
        tds: Number((nextSum.tds / nextCount).toFixed(3)),
      };

      // 4h bucket aggregates (optional; useful for future sub-daily views)
      const prevBucket = prev.buckets4h?.[bucketKey] ?? {};
      const bPrevCount = prevBucket.count ?? 0;
      const bPrevSum = {
        ph: prevBucket.sum?.ph ?? 0,
        temp: prevBucket.sum?.temp ?? 0,
        do: prevBucket.sum?.do ?? 0,
        tds: prevBucket.sum?.tds ?? 0,
      };
      const bNextCount = bPrevCount + 1;
      const bNextSum = {
        ph: bPrevSum.ph + ph,
        temp: bPrevSum.temp + temp,
        do: bPrevSum.do + doMgL,
        tds: bPrevSum.tds + tds,
      };
      const bNextAvg = {
        ph: Number((bNextSum.ph / bNextCount).toFixed(3)),
        temp: Number((bNextSum.temp / bNextCount).toFixed(3)),
        do: Number((bNextSum.do / bNextCount).toFixed(3)),
        tds: Number((bNextSum.tds / bNextCount).toFixed(3)),
      };

      // write back merged structure
      const nextDoc: DailyDoc = {
        date: dateKey,
        tz: "Asia/Manila",
        lastUpdated: serverTimestamp(),
        lastSampleAt: Timestamp.fromDate(new Date()),
        count: nextCount,
        sum: nextSum,
        avg: nextAvg,
        buckets4h: {
          ...(prev.buckets4h ?? {}),
          [bucketKey]: {
            count: bNextCount,
            sum: bNextSum,
            avg: bNextAvg,
            lastUpdated: serverTimestamp(),
          },
        },
      };

      tx.set(ref, nextDoc, { merge: true });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "ingest error" }, { status: 500 });
  }
}
