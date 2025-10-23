import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { sendUserStatusEmail } from "./email-service"; //  added

// ---------- Types ----------
export interface UserProfile {
  role: "admin" | "user";
  uid: string;
  email: string;
  displayName: string;
  fullName?: string;
  phone?: string;
  status: "pending" | "approved" | "rejected" | "blocked";
  createdAt?: Date | undefined;
  approvedAt?: Date | undefined;
  approvedBy?: string;
  rejectedAt?: Date | undefined;
  rejectedBy?: string;
  blockedAt?: Date | undefined;
  blockedBy?: string;
  blockReason?: string;
  studentId?: string;
}

export interface PondPreferences {
  userId: string;
  tempMin: number;
  tempMax: number;
  phMin: number;
  phMax: number;
  doMin: number;
  doMax: number;
  tdsMin: number;
  tdsMax: number;
  updatedAt: Date;
}

// allow null for fullName/phone so UI can clear them safely
export type UpdatableProfile =
  { fullName?: string | null; phone?: string | null } &
  Partial<Omit<UserProfile, "uid" | "createdAt" | "fullName" | "phone">>;

// ---------- Admin email check ----------
export function isAdmin(email: string): boolean {
  const adminEmails = ["admin@aquaforecast.com", "admin@gmail.com"];
  return adminEmails.includes(email.toLowerCase());
}

// ---------- Safe date conversion ----------
function safeToDate(timestamp: any): Date {
  if (!timestamp) return new Date(0);
  if (timestamp instanceof Date) return timestamp;
  if (timestamp?.toDate && typeof timestamp.toDate === "function")
    return timestamp.toDate();
  if (timestamp?.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(0);
}

// ---------- Utils ----------
function stripUndefined<T extends Record<string, any>>(
  obj: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

function normalizeStudentId(id: string): string {
  return id.trim().replace(/\s+/g, "").toUpperCase();
}

// ---------- Converters ----------
function convertToUserProfile(docSnap: any): UserProfile {
  const data = docSnap.data() || {};
  return {
    uid: docSnap.id,
    email: (data.email || "").toLowerCase(),
    displayName: data.displayName || "",
    fullName: data.fullName || undefined,
    phone: data.phone || undefined,
    status: (data.status as UserProfile["status"]) || "pending",
    createdAt: safeToDate(data.createdAt),
    approvedAt: data.approvedAt ? safeToDate(data.approvedAt) : undefined,
    approvedBy: data.approvedBy || undefined,
    rejectedAt: data.rejectedAt ? safeToDate(data.rejectedAt) : undefined,
    rejectedBy: data.rejectedBy || undefined,
    blockedAt: data.blockedAt ? safeToDate(data.blockedAt) : undefined,
    blockedBy: data.blockedBy || undefined,
    blockReason: data.blockReason ?? null,
    studentId:
      typeof data.studentId === "string" ? data.studentId : undefined,
    role: (data.role as UserProfile["role"]) ?? "user",
  };
}

// ========== CREATE / READ / UPDATE ==========
export async function createUserProfile(
  uid: string,
  profile: Omit<UserProfile, "uid">
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const cleaned = stripUndefined(profile as Record<string, any>);
  await setDoc(userRef, {
    ...cleaned,
    email: (cleaned.email || "").toLowerCase(),
    createdAt: serverTimestamp(),
  });

  // ✅ Send "pending" email after signup
  if (cleaned.email) {
    await sendUserStatusEmail({ to: cleaned.email, status: "pending" });
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) return convertToUserProfile(userSnap);
  return null;
}

/**
 * Merge-style update so it also works if doc is missing (no “not found” error).
 * Null values become deleteField() to truly clear them.
 */
export async function updateUserProfile(
  uid: string,
  updates: UpdatableProfile
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const cleaned = stripUndefined(updates as Record<string, any>);

  const payload: Record<string, any> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(cleaned)) {
    payload[k] =
      v === null
        ? deleteField()
        : k === "email" && typeof v === "string"
        ? v.toLowerCase()
        : v;
  }

  await setDoc(userRef, payload, { merge: true });
}

// ---------- Realtime subscription ----------
export function subscribeUserProfile(
  uid: string,
  cb: (profile: UserProfile | null) => void,
  onError?: (e: unknown) => void
): () => void {
  const userRef = doc(db, "users", uid);
  return onSnapshot(
    userRef,
    (snap) => cb(snap.exists() ? convertToUserProfile(snap) : null),
    (err) => {
      console.error("subscribeUserProfile error:", err);
      if (onError) onError(err);
    }
  );
}

// ========== UNIQUENESS HELPERS ==========
export async function isStudentIdTaken(
  studentId: string,
  excludeUid?: string
): Promise<boolean> {
  const norm = normalizeStudentId(studentId);
  const qRef = query(collection(db, "users"), where("studentId", "==", norm));
  const qs = await getDocs(qRef);
  if (qs.empty) return false;
  const others = qs.docs.filter((d) => d.id !== excludeUid);
  return others.length > 0;
}

export async function isEmailTaken(
  email: string,
  excludeUid?: string
): Promise<boolean> {
  const lower = email.toLowerCase().trim();
  const qRef = query(collection(db, "users"), where("email", "==", lower));
  const qs = await getDocs(qRef);
  if (qs.empty) return false;
  const others = qs.docs.filter((d) => d.id !== excludeUid);
  return others.length > 0;
}

export async function getUserByStudentId(
  studentId: string
): Promise<UserProfile | null> {
  const norm = normalizeStudentId(studentId);
  const qRef = query(collection(db, "users"), where("studentId", "==", norm));
  const qs = await getDocs(qRef);
  if (qs.empty) return null;
  return convertToUserProfile(qs.docs[0]);
}

export async function getUserByEmail(
  email: string
): Promise<UserProfile | null> {
  const lower = email.toLowerCase().trim();
  const qRef = query(collection(db, "users"), where("email", "==", lower));
  const qs = await getDocs(qRef);
  if (qs.empty) return null;
  return convertToUserProfile(qs.docs[0]);
}

export async function setStudentId(
  uid: string,
  studentId: string | null
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const value = studentId ? normalizeStudentId(studentId) : null;
  await updateDoc(userRef, {
    studentId: value === null ? deleteField() : value,
    updatedAt: serverTimestamp(),
  } as any);
}

// ========== EXISTENCE ==========
export async function checkUserProfileExists(uid: string): Promise<boolean> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  return userSnap.exists();
}

// ========== LISTS ==========
export async function getAllUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const querySnapshot = await getDocs(usersRef);
  const users = querySnapshot.docs.map(convertToUserProfile);
  return users.sort(
    (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
  );
}

export async function getPendingUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const qRef = query(usersRef, where("status", "==", "pending"));
  const qs = await getDocs(qRef);
  const users = qs.docs.map(convertToUserProfile);
  return users.sort(
    (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
  );
}

export async function getApprovedUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const qRef = query(usersRef, where("status", "==", "approved"));
  const qs = await getDocs(qRef);
  const users = qs.docs.map(convertToUserProfile);
  return users.sort(
    (a, b) => (b.approvedAt?.getTime() || 0) - (a.approvedAt?.getTime() || 0)
  );
}

export async function getRejectedUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const qRef = query(usersRef, where("status", "==", "rejected"));
  const qs = await getDocs(qRef);
  const users = qs.docs.map(convertToUserProfile);
  return users.sort(
    (a, b) => (b.rejectedAt?.getTime() || 0) - (a.rejectedAt?.getTime() || 0)
  );
}

export async function getBlockedUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const qRef = query(usersRef, where("status", "==", "blocked"));
  const qs = await getDocs(qRef);
  const users = qs.docs.map(convertToUserProfile);
  return users.sort(
    (a, b) => (b.blockedAt?.getTime() || 0) - (a.blockedAt?.getTime() || 0)
  );
}

// ========== ACTIONS ==========
export async function approveUser(
  uid: string,
  approvedBy: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const email = userSnap.data()?.email;

  await updateDoc(userRef, {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy,
    rejectedAt: null,
    rejectedBy: null,
    blockedAt: null,
    blockedBy: null,
    blockReason: null,
    updatedAt: serverTimestamp(),
  } as any);

  if (email) await sendUserStatusEmail({ to: email, status: "approved" });
}

export async function rejectUser(
  uid: string,
  rejectedBy: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const email = userSnap.data()?.email;

  await updateDoc(userRef, {
    status: "rejected",
    rejectedAt: serverTimestamp(),
    rejectedBy,
    updatedAt: serverTimestamp(),
  });

  if (email) await sendUserStatusEmail({ to: email, status: "rejected" });
}

export async function blockUser(
  uid: string,
  adminEmail: string,
  reason?: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const email = userSnap.data()?.email;

  await updateDoc(userRef, {
    status: "blocked",
    blockedAt: serverTimestamp(),
    blockedBy: adminEmail,
    blockReason: reason ?? null,
    updatedAt: serverTimestamp(),
  } as any);

  if (email) await sendUserStatusEmail({ to: email, status: "blocked" });
}

export async function unblockUser(
  uid: string,
  adminEmail: string
): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const email = userSnap.data()?.email;

  await updateDoc(userRef, {
    status: "approved",
    blockedAt: null,
    blockedBy: null,
    blockReason: null,
    updatedAt: serverTimestamp(),
  } as any);

  if (email) await sendUserStatusEmail({ to: email, status: "approved" });
}

export async function deleteUser(uid: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  await deleteDoc(userRef);
}

// ========== Pond Preferences ==========
export async function savePondPreferences(
  preferences: Omit<PondPreferences, "updatedAt">
): Promise<void> {
  const preferencesRef = doc(db, "pondPreferences", preferences.userId);
  await setDoc(preferencesRef, {
    ...preferences,
    updatedAt: serverTimestamp(),
  });
}

export async function getPondPreferences(
  userId: string
): Promise<PondPreferences | null> {
  const preferencesRef = doc(db, "pondPreferences", userId);
  const preferencesSnap = await getDoc(preferencesRef);

  if (!preferencesSnap.exists()) return null;
  const data = preferencesSnap.data();
  return {
    userId: data.userId,
    tempMin: data.tempMin,
    tempMax: data.tempMax,
    phMin: data.phMin,
    phMax: data.phMax,
    doMin: data.doMin,
    doMax: data.doMax,
    tdsMin: data.tdsMin,
    tdsMax: data.tdsMax,
    updatedAt: safeToDate(data.updatedAt),
  };
}
