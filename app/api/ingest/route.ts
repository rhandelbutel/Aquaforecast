// ✅ Make sure this route always runs on the Node runtime (not Edge)
//    and is never prerendered at build (so env vars are read at runtime).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// (Optional but handy) If your project uses regions, you can pin it:
// export const preferredRegion = 'hkg1'; // or remove this line

import { NextRequest, NextResponse } from "next/server";
// This import should export an *already-initialized* admin app/db,
// where the private_key is fixed with .replace(/\\n/g, '\n').
// (See note below for what to put in "@/lib/firebase-admin")
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DateTime } from "luxon";

// (Optional) Handle CORS preflight if you call this from a mobile app / different origin
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log("/api/ingest called");

    const body = await req.json();
    console.log("Request body:", body);

    const { pondId, ph, temp, do: doMgL } = body;

    if (!pondId || [ph, temp, doMgL].some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      console.error("Invalid body", body);
      return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
    }

    console.log("✅ Validated body");

    const dt = DateTime.now().setZone("Asia/Manila");
    const dateKey = dt.toFormat("yyyy-LL-dd");
    const bucketKey = String(Math.floor(dt.hour / 4) * 4).padStart(2, "0");

    const ref = adminDb.doc(`ponds/${pondId}/dailyMetrics/${dateKey}`);
    console.log("Target doc path:", ref.path);

    await adminDb.runTransaction(async (tx) => {
      console.log("Starting Firestore transaction...");
      const snap = await tx.get(ref);
      console.log("Snapshot exists:", snap.exists);

      const prev = (snap.exists ? snap.data() : {}) as any;
      const prevCount = prev.count ?? 0;
      const prevSum = {
        ph: prev.sum?.ph ?? 0,
        temp: prev.sum?.temp ?? 0,
        do: prev.sum?.do ?? 0,
      };

      const nextCount = prevCount + 1;
      const nextSum = {
        ph: prevSum.ph + ph,
        temp: prevSum.temp + temp,
        do: prevSum.do + doMgL,
      };
      const nextAvg = {
        ph: Number((nextSum.ph / nextCount).toFixed(3)),
        temp: Number((nextSum.temp / nextCount).toFixed(3)),
        do: Number((nextSum.do / nextCount).toFixed(3)),
      };

      const prevBucket = prev.buckets4h?.[bucketKey] ?? {};
      const bPrevCount = prevBucket.count ?? 0;
      const bPrevSum = {
        ph: prevBucket.sum?.ph ?? 0,
        temp: prevBucket.sum?.temp ?? 0,
        do: prevBucket.sum?.do ?? 0,
      };
      const bNextCount = bPrevCount + 1;
      const bNextSum = {
        ph: bPrevSum.ph + ph,
        temp: bPrevSum.temp + temp,
        do: bPrevSum.do + doMgL,
      };
      const bNextAvg = {
        ph: Number((bNextSum.ph / bNextCount).toFixed(3)),
        temp: Number((bNextSum.temp / bNextCount).toFixed(3)),
        do: Number((bNextSum.do / bNextCount).toFixed(3)),
      };

      const nextDoc = {
        date: dateKey,
        tz: "Asia/Manila",
        lastUpdated: FieldValue.serverTimestamp(),
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
            lastUpdated: FieldValue.serverTimestamp(),
          },
        },
      };

      console.log("Writing document...");
      tx.set(ref, nextDoc, { merge: true });
    });

    console.log("✅ Transaction complete");

    // (Optional) add CORS if calling from a different origin
    const headers = new Headers({ "Access-Control-Allow-Origin": "*" });
    return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e: any) {
    console.error("🔥 Ingest route error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "ingest error" }, { status: 500 });
  }
}
