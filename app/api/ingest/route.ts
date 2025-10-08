// app/api/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc, increment, serverTimestamp } from "firebase/firestore"; // ⬅️ use helpers
import { DateTime } from "luxon";

export async function POST(req: NextRequest) {
  const { pondId, ph, temp, tds, do: doMgL } = await req.json();

  if (!pondId || [ph, temp, tds, doMgL].some(v => typeof v !== "number")) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  // Align to Asia/Manila midnight
  const dt = DateTime.now().setZone("Asia/Manila");
  const dateKey = dt.toFormat("yyyy-LL-dd");
  const bucketStart = String(Math.floor(dt.hour / 4) * 4).padStart(2, "0"); // "00","04","08","12","16","20"

  const ref = doc(db, `ponds/${pondId}/dailyMetrics/${dateKey}`);

  await setDoc(ref, {
    date: dateKey,
    tz: "Asia/Manila",
    lastUpdated: serverTimestamp(),            // ⬅️ changed

    // daily totals
    count: increment(1),                       // ⬅️ changed
    "sum.ph":   increment(ph),
    "sum.temp": increment(temp),
    "sum.do":   increment(doMgL),
    "sum.tds":  increment(tds),

    // 4h bucket totals
    [`buckets4h.${bucketStart}.count`]:     increment(1),
    [`buckets4h.${bucketStart}.sum.ph`]:    increment(ph),
    [`buckets4h.${bucketStart}.sum.temp`]:  increment(temp),
    [`buckets4h.${bucketStart}.sum.do`]:    increment(doMgL),
    [`buckets4h.${bucketStart}.sum.tds`]:   increment(tds),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
