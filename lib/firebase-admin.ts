// app/lib/firebase-admin.ts
import 'server-only';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { startFeedingAlertCron } from '@/lib/utils/feeding-alert-cron';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function loadServiceAccount(): ServiceAccount {
  // Preferred: full JSON in a single env var
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json && json.trim() !== '') {
    const parsed = JSON.parse(json);
    return {
      project_id: String(parsed.project_id || ''),
      client_email: String(parsed.client_email || ''),
      private_key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
    };
  }

  // Fallback: three separate env vars
  return {
    project_id:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || // last resort fallback
      '',
    client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

function assertValid(sa: ServiceAccount) {
  const missing: string[] = [];
  if (!sa.project_id) missing.push('FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT.project_id');
  if (!sa.client_email) missing.push('FIREBASE_CLIENT_EMAIL or FIREBASE_SERVICE_ACCOUNT.client_email');
  if (!sa.private_key) missing.push('FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT.private_key');
  if (missing.length) {
    throw new Error(`Firebase Admin env not set. Missing: ${missing.join(', ')}`);
  }
  if (!sa.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('FIREBASE_PRIVATE_KEY looks malformed (missing BEGIN PRIVATE KEY).');
  }
}

const sa = loadServiceAccount();
assertValid(sa);

const app: App =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });

export const adminDb = getFirestore(app);

// Dev-only cron trigger
if (process.env.NODE_ENV === 'development') {
  startFeedingAlertCron();
}
