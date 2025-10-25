import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toDate, reminderDocId } from "@/lib/utils/date-utils";


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
      const user = userDoc.data() as any;
      const userEmail: string = user.email;
      const userId: string = user.uid;
      console.log(`👤 Checking user: ${userEmail} (${userId})`);

      // 2) Ponds attached to this user
      const userPondsSnap = await adminDb
        .collection("user-ponds")
        .where("userId", "==", userId)
        .get();

      if (userPondsSnap.empty) {
        console.log(`🚫 No ponds found for ${userEmail}`);
        continue;
      }

      for (const userPondDoc of userPondsSnap.docs) {
        const userPond = userPondDoc.data() as any;
        const adminPondId: string | undefined = userPond.adminPondId;
        if (!adminPondId) continue;

        // 3) Active feeding schedule(s)
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
          const todayStr = today.toISOString().split("T")[0];

          const startDate = toDate(sched.startDate);
          const endDate = sched.endDate ? toDate(sched.endDate) : null;

          if (startDate > today) continue;
          if (endDate && endDate < today) continue;

          if (sched.repeatType === "weekly") {
            const todayIndex = today.getDay();
            if (
              !Array.isArray(sched.selectedDays) ||
              !sched.selectedDays.includes(todayIndex)
            ) {
              continue;
            }
          }

          const feedingTimes: string[] = Array.isArray(sched.feedingTimes)
            ? sched.feedingTimes
            : [];

          for (const timeStr of feedingTimes) {
            const [hh, mm] = timeStr.split(":").map(Number);
            const scheduled = new Date(today);
            scheduled.setHours(hh || 0, mm || 0, 0, 0);

            const diffMs = scheduled.getTime() - now.getTime();
            const diffMin = diffMs / 60000;
            console.log(
              `🕒 ${pondName} → ${timeStr} | diff = ${diffMin.toFixed(2)} mins`
            );

            // Only within next 60 minutes
            if (diffMs <= 0 || diffMs > 60 * 60 * 1000) continue;

            // 4) Reminder check
            const remindersColl = adminDb
              .collection("feeding-schedules")
              .doc(schedDoc.id)
              .collection("reminders");

            const remId = reminderDocId(todayStr, timeStr, userId);
            const remRef = remindersColl.doc(remId);
            const remSnap = await remRef.get();

            if (remSnap.exists) {
              console.log(
                `⚠️ Already reminded ${userEmail} for ${pondName} at ${timeStr}`
              );
              continue;
            }

            // 5) Send email
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: userEmail,
                status: "feeding-reminder",
                subject: `Feeding reminder: ${pondName} at ${timeStr}`,
                text: `Heads up! Feeding for ${pondName} is scheduled at ${timeStr} today.`,
              }),
            });

            console.log(
              `✅ Feeding reminder sent to ${userEmail} for ${timeStr} (${pondName})`
            );

            // 6) Create reminder record
            await remRef.set({
              userId,
              email: userEmail,
              pondId: adminPondId,
              pondName: pondName,
              time: timeStr,
              scheduledAt: scheduled,
              createdAt: new Date(),
            });
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
