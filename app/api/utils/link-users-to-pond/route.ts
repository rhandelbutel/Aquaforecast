import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

let cachedAdminPond: any = null;
let lastFetch = 0;

export async function GET() {
  try {
    console.log("🔗 Starting user-to-pond linking...");

    // ✅ Cache the shared admin pond for 10 minutes
    const now = Date.now();
    if (!cachedAdminPond || now - lastFetch > 10 * 60 * 1000) {
      console.log("🔍 Fetching admin pond...");
      const pondsSnap = await adminDb.collection("ponds").limit(1).get();
      if (pondsSnap.empty) {
        console.error("❌ No admin pond found.");
        return NextResponse.json({ ok: false, error: "No admin pond found." }, { status: 404 });
      }
      cachedAdminPond = pondsSnap.docs[0];
      lastFetch = now;
    }

    const adminPond = cachedAdminPond.data();
    const adminPondId = cachedAdminPond.id;
    console.log(`✅ Found shared pond: ${adminPond.pondName || "Unnamed"} (${adminPondId})`);

    // ✅ Fetch approved users
    const usersSnap = await adminDb.collection("users").where("status", "==", "approved").get();
    if (usersSnap.empty) {
      console.log("⚠️ No approved users found.");
      return NextResponse.json({ ok: false, note: "No approved users" });
    }

    let linked = 0;
    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userId = user.uid;
      const email = user.email;

      // Check if already linked
      const userPondSnap = await adminDb
        .collection("user-ponds")
        .where("userId", "==", userId)
        .where("adminPondId", "==", adminPondId)
        .limit(1)
        .get();

      if (!userPondSnap.empty) {
        console.log(`✅ Already linked: ${email}`);
        continue;
      }

      await adminDb.collection("user-ponds").add({
        userId,
        userEmail: email,
        adminPondId,
        pondName: adminPond.pondName || "Unnamed Pond",
        linkedAt: new Date(),
      });

      console.log(`✅ Linked ${email} → ${adminPond.pondName}`);
      linked++;
    }

    console.log(`🔗 Linking complete. Total new links: ${linked}`);
    return NextResponse.json({ ok: true, linked });
  } catch (error) {
    console.error("❌ link-users-to-pond error:", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
