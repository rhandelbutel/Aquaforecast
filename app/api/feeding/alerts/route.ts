// app/api/feeding/alerts/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

let cachedUsers: any[] = [];
let lastUserFetch = 0;

function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === "string") return new Date(v);
  return new Date(0);
}

function reminderDocId(isoDate: string, time: string, userId: string) {
  return `${isoDate}_${time}_${userId}`;
}

// Fetch approved users (cached for 10 mins)
async function getApprovedUsers() {
  const now = Date.now();
  if (now - lastUserFetch < 10 * 60 * 1000 && cachedUsers.length > 0) {
    console.log("♻️ Using cached user list");
    return cachedUsers;
  }

  console.log("🔍 Fetching approved users from Firestore...");
  const snap = await adminDb.collection("users").where("status", "==", "approved").get();
  cachedUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  lastUserFetch = now;
  return cachedUsers;
}

export async function GET() {
  try {
    const now = new Date();
    console.log("⏳ Feeding alerts started at", now.toISOString());

    const users = await getApprovedUsers();
    if (!users.length) return NextResponse.json({ success: true, note: "No approved users" });

    for (const user of users) {
      const userEmail = user.email;
      const userId = user.uid;
      console.log(`👤 Checking user: ${userEmail}`);

      let userPondsSnap;
      try {
        userPondsSnap = await adminDb.collection("user-ponds").where("userId", "==", userId).get();
      } catch (err: any) {
        if (err.code === 8) {
          console.error("⚠️ Firestore quota exceeded while fetching user-ponds.");
          return NextResponse.json({ success: false, error: "Quota exceeded" }, { status: 429 });
        }
        throw err;
      }

      if (userPondsSnap.empty) continue;

      for (const userPondDoc of userPondsSnap.docs) {
        const userPond = userPondDoc.data() as any;
        const adminPondId = userPond.adminPondId;
        if (!adminPondId) continue;

        let schedSnap;
        try {
          schedSnap = await adminDb
            .collection("feeding-schedules")
            .where("pondId", "==", adminPondId)
            .where("isActive", "==", true)
            .get();
        } catch (err: any) {
          if (err.code === 8) {
            console.error("⚠️ Firestore quota exceeded while fetching schedules.");
            return NextResponse.json({ success: false, error: "Quota exceeded" }, { status: 429 });
          }
          throw err;
        }

        if (schedSnap.empty) continue;

        for (const schedDoc of schedSnap.docs) {
          const sched = schedDoc.data() as any;
          const pondName = sched.pondName || "Unnamed Pond";
          const today = new Date();
          const todayStr = today.toISOString().split("T")[0];
          const startDate = toDate(sched.startDate);
          const endDate = sched.endDate ? toDate(sched.endDate) : null;

          if (startDate > today) continue;
          if (endDate && endDate < today) continue;

          if (sched.repeatType === "weekly") {
            const todayIndex = today.getDay();
            if (!sched.selectedDays?.includes(todayIndex)) continue;
          }

          const feedingTimes: string[] = Array.isArray(sched.feedingTimes) ? sched.feedingTimes : [];

          for (const timeStr of feedingTimes) {
            const [hh, mm] = timeStr.split(":").map(Number);
            const scheduled = new Date(today);
            scheduled.setHours(hh || 0, mm || 0, 0, 0);

            const diffMs = scheduled.getTime() - now.getTime();
            const diffMin = diffMs / 60000;
            if (diffMs <= 0 || diffMs > 60 * 60 * 1000) continue; // only within next hour

            const remId = reminderDocId(todayStr, timeStr, userId);
            const remRef = adminDb
              .collection("feeding-schedules")
              .doc(schedDoc.id)
              .collection("reminders")
              .doc(remId);
            const remSnap = await remRef.get();

            if (remSnap.exists) continue;

            // ✅ Send email
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: userEmail,
                status: "feeding-reminder",
                subject: `Feeding Reminder: ${pondName}`,
                text: `Hey there! Feeding for ${pondName} is scheduled in less than an hour. 
                Check your Aquaforecast dashboard for details.`,
              }),
            });

            console.log(`✅ Feeding reminder sent to ${userEmail} (${pondName})`);

            // Record reminder to avoid duplicates
            await remRef.set({
              userId,
              email: userEmail,
              pondId: adminPondId,
              pondName,
              time: timeStr,
              scheduledAt: scheduled,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    console.log("✅ Feeding alerts completed.");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Feeding alert error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
