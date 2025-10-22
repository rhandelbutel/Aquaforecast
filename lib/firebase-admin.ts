// app/lib/firebase-admin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { startFeedingAlertCron } from "@/lib/utils/feeding-alert-cron";
/**
 * Server-only Firebase initialization using a service account.
 * Safe to import in Next.js API routes or server components.
 */
const apps = getApps();

const app = apps.length
  ? apps[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // ✅ Fix 1: Ensure the key exists and convert escaped \n back to real newlines
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "")
          .replace(/\\n/g, "\n")
          .replace(/"/g, ""), // removes any stray quotes if Vercel added them
      }),
    });

// ✅ Fix 2: Explicitly export Firestore for admin use
export const adminDb = getFirestore(app);

if (process.env.NODE_ENV === "development") {
  // Run cron job automatically while developing
  startFeedingAlertCron();
}
