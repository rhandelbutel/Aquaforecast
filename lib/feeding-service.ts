// lib/feeding-service.ts
import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";

export interface FeedingLog {
  id?: string;
  pondId: string;               // original per-user pond id (kept for rules/back-compat)
  adminPondId?: string;         // shared/admin pond id for cross-role sync
  pondName: string;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  fedAt: Date;
  feedGiven?: number;
  feedUnit?: "g" | "kg";
  // NEW — identify auto-logs
  autoLogged?: boolean;
  reason?: "missed_schedule" | "manual" | "other";
  scheduledFor?: Date;          // 🔑 used for slot counting within the day
  createdAt: Date;
}

/** Remove keys that are strictly `undefined` (Firestore cannot store them). */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function toSafeDate(val: any): Date {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (typeof val?.toDate === "function") return val.toDate();
  if (typeof val?.seconds === "number") return new Date(val.seconds * 1000);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }
  if (typeof val === "number") return new Date(val);
  return new Date(0);
}

function toFeedingLog(id: string, data: DocumentData): FeedingLog {
  return {
    id,
    pondId: data.pondId,
    adminPondId: data.adminPondId,
    pondName: data.pondName,
    userId: data.userId,
    userDisplayName: data.userDisplayName,
    userEmail: data.userEmail,
    fedAt: toSafeDate(data.fedAt),
    feedGiven: data.feedGiven,
    feedUnit: data.feedUnit,
    autoLogged: !!data.autoLogged,
    reason: data.reason,
    scheduledFor: data.scheduledFor ? toSafeDate(data.scheduledFor) : undefined,
    createdAt: toSafeDate(data.createdAt),
  };
}

/** Write: keep original pondId for rules + store adminPondId for sync. */
export async function addFeedingLog(
  log: Omit<FeedingLog, "id" | "createdAt">
) {
  // Validation: require a positive feedGiven for manual logs
  const isAuto = !!log.autoLogged;
  const val = log.feedGiven;
  if (!isAuto) {
    if (val == null || !Number.isFinite(val) || val <= 0) {
      throw new Error("feedGiven must be a positive number for manual logs.");
    }
  }

  const payload = stripUndefined({
    ...log,
    createdAt: serverTimestamp(),
  });
  const ref = await addDoc(collection(db, "feeding-logs"), payload);
  return ref.id;
}

/** Read by shared admin id, with legacy fallback to pondId (some old rows). */
export async function getFeedingLogsByPond(sharedAdminPondId: string): Promise<FeedingLog[]> {
  const logs: FeedingLog[] = [];

  const q1 = query(collection(db, "feeding-logs"), where("adminPondId", "==", sharedAdminPondId));
  const s1 = await getDocs(q1);
  s1.docs.forEach((d) => logs.push(toFeedingLog(d.id, d.data())));

  const q2 = query(collection(db, "feeding-logs"), where("pondId", "==", sharedAdminPondId));
  const s2 = await getDocs(q2);
  s2.docs.forEach((d) => logs.push(toFeedingLog(d.id, d.data())));

  const dedup = new Map<string, FeedingLog>();
  logs.forEach((l) => l.id && dedup.set(l.id, l));
  const merged = Array.from(dedup.values());
  merged.sort((a, b) => new Date(b.fedAt).getTime() - new Date(a.fedAt).getTime());
  return merged;
}

/** Live updates (merge adminPondId stream + legacy pondId stream). */
export function subscribeFeedingLogs(sharedAdminPondId: string, cb: (logs: FeedingLog[]) => void): () => void {
  const buffer = new Map<string, FeedingLog>();
  let t: any;

  const flush = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const arr = Array.from(buffer.values());
      arr.sort((a, b) => new Date(b.fedAt).getTime() - new Date(a.fedAt).getTime());
      cb(arr);
    }, 0);
  };

  const unsub1 = onSnapshot(
    query(collection(db, "feeding-logs"), where("adminPondId", "==", sharedAdminPondId)),
    (qs) => {
      qs.docs.forEach((d) => buffer.set(d.id, toFeedingLog(d.id, d.data())));
      flush();
    }
  );

  const unsub2 = onSnapshot(
    query(collection(db, "feeding-logs"), where("pondId", "==", sharedAdminPondId)),
    (qs) => {
      qs.docs.forEach((d) => buffer.set(d.id, toFeedingLog(d.id, d.data())));
      flush();
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

// -------------------- NEW HELPERS (used by FeedingLogModal) --------------------

/** Start-of-day and end-of-day in local time */
export function dayBounds(d: Date) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d);   end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Count logs for a pond for "today".
 *  Uses scheduledFor if present (preferred).
 *  NOTE: This uses adminPondId (shared id).
 */
export async function getTodayLogCount(sharedAdminPondId: string, today = new Date()): Promise<number> {
  const { start, end } = dayBounds(today);

  // Count by scheduledFor (preferred deterministic counter)
  const qSched = query(
    collection(db, "feeding-logs"),
    where("adminPondId", "==", sharedAdminPondId),
    where("scheduledFor", ">=", start),
    where("scheduledFor", "<=", end)
  );
  const s1 = await getDocs(qSched);
  return s1.size;
}

/** Make a Date for a HH:mm on the same day as base (local). */
export function dateAt(hhmm: string, base: Date) {
  const [hh, mm] = (hhmm || "00:00").split(":").map(Number);
  const d = new Date(base);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}
