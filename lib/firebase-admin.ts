// lib/firebase-admin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { startFeedingAlertCron } from "@/lib/utils/feeding-alert-cron";
import { startUserLinkingCron } from "@/lib/utils/link-users-cron";
/**
 * Server-only Firebase initialization using a service account.
 * Safe to import in Next.js API routes.
 */
const apps = getApps();

const app = apps.length
  ? apps[0]
  : initializeApp({
      credential: cert({
        projectId: "aquaforecast-6b568",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // convert escaped newlines to real ones
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

export const adminDb = getFirestore(app);

// Dev-only cron trigger
if (process.env.NODE_ENV === 'development') {
  startFeedingAlertCron();
  startUserLinkingCron();
}
