import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Normalize Firestore TS/ISO to Date
export function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === "string") return new Date(v);
  return new Date(0);
}

// Build deterministic reminder doc id (one per user per time per day)
export function reminderDocId(
  isoDate: string /* YYYY-MM-DD */,
  time: string /* HH:mm */,
  userId: string
) {
  return `${isoDate}_${time}_${userId}`;
}

export async function GET() {
  try {
    const now = new Date();
    console.log("⏳ User linking cron started at", now.toISOString());

    // Get all approved users
    const usersSnap = await adminDb
      .collection("users")
      .where("status", "==", "approved")
      .get();

    if (usersSnap.empty) {
      console.log("⚠️ No approved users found.");
      return NextResponse.json({ success: true, note: "No approved users" });
    }

    console.log(`✅ Found ${usersSnap.size} approved users`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Linking error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
