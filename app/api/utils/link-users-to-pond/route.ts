import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Normalize Firestore TS/ISO to Date
function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === "string") return new Date(v);
  return new Date(0);
}

export async function GET() {
  try {
    const now = new Date();
    console.log("⏳ Feeding alerts started at", now.toISOString());

    // 1) All approved users
    const usersSnap = await adminDb
      .collection("users")
      .where("status", "==", "approved")
      .get();

    if (usersSnap.empty) {
      console.log("⚠️ No approved users found.");
      return NextResponse.json({ success: true, note: "No approved users" });
    }

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userEmail: string = user.email;
      const userId: string = user.uid;
      console.log(`👤 Checking user: ${userEmail} (${userId})`);

      // 2) Ponds attached to this user (via user-ponds)
      const userPondsSnap = await adminDb
        .collection("user-ponds")
        .where("userId", "==", userId)
        .get();

      if (userPondsSnap.empty) {
        console.log(`🚫 No ponds found for ${userEmail}`);
        continue;
      }

      for (const userPondDoc of userPondsSnap.docs) {
        const userPond = userPondDoc.data();
        const adminPondId: string | undefined = userPond.adminPondId;
        if (!adminPondId) continue;

        // 3) Feeding schedule(s) for that pond
        const schedSnap = await adminDb
          .collection("feeding-schedules")
          .where("pondId", "==", adminPondId)
          .where("isActive", "==", true)
          .get();

        if (schedSnap.empty) {
          console.log(`📭 No active schedule for pond ${adminPondId}`);
          continue;
        }

        for (const schedDoc of schedSnap.docs) {
          const sched = schedDoc.data() as any;
          const pondName: string = sched.pondName || "Unnamed Pond";

          const today = new Date();
          const startDate = toDate(sched.startDate);
          const endDate = sched.endDate ? toDate(sched.endDate) : null;

          if (startDate > today) continue;
          if (endDate && endDate < today) continue;

          if (sched.repeatType === "weekly") {
            const todayIndex = today.getDay();
            if (!Array.isArray(sched.selectedDays) || !sched.selectedDays.includes(todayIndex)) {
              continue;
            }
          }

          const feedingTimes: string[] = Array.isArray(sched.feedingTimes) ? sched.feedingTimes : [];
          const todayStr = today.toISOString().split("T")[0];

          for (const timeStr of feedingTimes) {
            const [hh, mm] = timeStr.split(":").map(Number);
            const scheduled = new Date(today);
            scheduled.setHours(hh || 0, mm || 0, 0, 0);

            const diffMs = scheduled.getTime() - now.getTime();
            console.log(
              `🕒 Checking ${pondName} → ${timeStr} | diff = ${(diffMs / 60000).toFixed(2)} mins`
            );

            // Only within next 60 minutes (and not past)
            if (diffMs <= 0 || diffMs > 60 * 60 * 1000) continue;

            // 🔑 Per-user key so each approved user gets their own reminder
            const userKey = `${todayStr}_${timeStr}_${userId}`;

            // Backward compatibility: old array may have non-user-specific keys
            const sentArray: string[] = Array.isArray(sched.reminderSentFor) ? sched.reminderSentFor : [];
            const alreadySentForUser = sentArray.includes(userKey);

            if (alreadySentForUser) {
              console.log(`⚠️ Reminder already sent for ${pondName} (${timeStr}) to ${userEmail}`);
              continue;
            }

            // ✅ Send email (uses your /api/email/send route)
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: userEmail,
                status: "feeding-reminder",
                // Optional extras if your /api/email/send supports them:
                subject: `Feeding reminder: ${pondName} at ${timeStr}`,
                text: `Heads up! Feeding for ${pondName} is scheduled at ${timeStr} (about ${(diffMs/60000)|0} mins).`,
              }),
            });

            console.log(`✅ Feeding reminder sent to ${userEmail} for ${timeStr} (${pondName})`);

            // ✅ Mark as sent for THIS user
            const nextSentArray = [...sentArray, userKey];
            await adminDb
              .collection("feeding-schedules")
              .doc(schedDoc.id)
              .update({ reminderSentFor: nextSentArray });
          }
        }
      }
    }

    console.log("✅ Feeding alerts check completed.");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feeding alert error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
