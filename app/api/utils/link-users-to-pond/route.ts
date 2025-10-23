import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    console.log("🔗 Starting user-to-pond linking...");

    // Get the shared admin pond (first pond document)
    const pondsSnap = await adminDb.collection("ponds").limit(1).get();
    if (pondsSnap.empty) {
      console.error("❌ No admin pond found.");
      return NextResponse.json({ ok: false, error: "No admin pond found." }, { status: 404 });
    }

    const pondDoc = pondsSnap.docs[0];
    const pond = pondDoc.data();

    // Get all approved users
    const usersSnap = await adminDb.collection("users").where("status", "==", "approved").get();
    if (usersSnap.empty) {
      console.log("⚠️ No approved users to link.");
      return NextResponse.json({ ok: true, linked: 0, message: "No approved users" });
    }

    let linkedCount = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userId = user.uid;
      const userEmail = user.email;

      // Check if already linked
      const existing = await adminDb
        .collection("user-ponds")
        .where("userId", "==", userId)
        .where("adminPondId", "==", pondDoc.id)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.log(`🔁 ${userEmail} already linked to ${pondDoc.id}`);
        continue;
      }

      // Create link document
      await adminDb.collection("user-ponds").add({
        userId,
        adminPondId: pondDoc.id,
        adminPond: {
          id: pondDoc.id,
          name: pond.name ?? "Pond",
          fishSpecies: pond.fishSpecies ?? "",
          area: pond.area ?? 0,
          depth: pond.depth ?? 0,
          initialFishCount: pond.initialFishCount ?? pond.fishCount ?? 0,
          feedingFrequency: pond.feedingFrequency ?? 0,
          sensorId: pond.sensorId ?? "",
          createdAt: pond.createdAt ?? new Date(),
          updatedAt: pond.updatedAt ?? new Date(),
        },
        attachedAt: new Date(),
      });

      console.log(`✅ Linked ${userEmail} → ${pondDoc.id}`);
      linkedCount++;
    }

    console.log(`🎯 Linking complete. ${linkedCount} user(s) linked.`);
    return NextResponse.json({ ok: true, linked: linkedCount });
  } catch (error: any) {
    console.error("❌ link-users-to-pond error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
