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
} from "firebase/firestore"
import { db } from "./firebase"

export interface UserProfile {
  role: any
  uid: string
  email: string
  displayName: string
  fullName?: string
  phone?: string
  status: "pending" | "approved" | "rejected" | "blocked"
  createdAt: Date
  approvedAt?: Date
  approvedBy?: string
  rejectedAt?: Date
  rejectedBy?: string
  blockedAt?: Date
  blockedBy?: string
  blockReason?: string | null
  studentId?: string
}

export interface PondPreferences {
  userId: string
  tempMin: number
  tempMax: number
  phMin: number
  phMax: number
  doMin: number
  doMax: number
  tdsMin: number
  tdsMax: number
  updatedAt: Date
}

// add near the top, after interfaces
export type UpdatableProfile =
  // allow null for these two (so UI can clear them)
  { fullName?: string | null; phone?: string | null } &
  // keep everything else as before
  Partial<Omit<UserProfile, "uid" | "createdAt" | "fullName" | "phone">>;


// ----- Admin email check -----
export function isAdmin(email: string): boolean {
  const adminEmails = ["admin@aquaforecast.com", "admin@gmail.com"]
  return adminEmails.includes(email.toLowerCase())
}

// ----- Safe date conversion -----
function safeToDate(timestamp: any): Date {
  if (!timestamp) return new Date()
  if (timestamp instanceof Date) return timestamp
  if (timestamp?.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate()
  }
  if (timestamp?.seconds) {
    return new Date(timestamp.seconds * 1000)
  }
  return new Date(timestamp)
}

// ----- Utils -----
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

function normalizeStudentId(id: string): string {
  // Trim + collapse spaces and uppercase (you can tweak normalization here)
  return id.trim().replace(/\s+/g, "").toUpperCase()
}

// ----- Converters -----
function convertToUserProfile(docSnap: any): UserProfile {
  const data = docSnap.data()
  return {
    uid: docSnap.id,
    email: data.email || "",
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
    studentId: typeof data.studentId === "string" ? data.studentId : undefined,
  }
}

// ===== CREATE / READ / UPDATE =====
export async function createUserProfile(uid: string, profile: Omit<UserProfile, "uid">): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    const cleaned = stripUndefined(profile as Record<string, any>)
    await setDoc(userRef, {
      ...cleaned,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error creating user profile:", error)
    throw error
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, "users", uid)
    const userSnap = await getDoc(userRef)
    if (userSnap.exists()) {
      return convertToUserProfile(userSnap)
    }
    return null
  } catch (error) {
    console.error("Error getting user profile:", error)
    throw error
  }
}

export async function updateUserProfile(
  uid: string,
  updates: UpdatableProfile,
): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)

    // you already have this logic — keep it
    const cleaned = stripUndefined(updates as Record<string, any>)
    const payload: Record<string, any> = { updatedAt: serverTimestamp() }
    for (const [k, v] of Object.entries(cleaned)) {
      payload[k] = v === null ? deleteField() : v
    }

    await updateDoc(userRef, payload)
  } catch (error) {
    console.error("Error updating user profile:", error)
    throw error
  }
}


// Real-time subscription to a user doc (useful for block/approval status)
export function subscribeUserProfile(uid: string, cb: (profile: UserProfile | null) => void): () => void {
  const userRef = doc(db, "users", uid)
  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) return cb(null)
      cb(convertToUserProfile(snap))
    },
    (err) => {
      console.error("subscribeUserProfile error:", err)
      cb(null)
    },
  )
}

// ===== UNIQUENESS HELPERS =====
export async function isStudentIdTaken(studentId: string, excludeUid?: string): Promise<boolean> {
  const norm = normalizeStudentId(studentId)
  const qRef = query(collection(db, "users"), where("studentId", "==", norm))
  const qs = await getDocs(qRef)
  if (qs.empty) return false
  // If checking for updates, allow same user to keep their own studentId
  const others = qs.docs.filter((d) => d.id !== excludeUid)
  return others.length > 0
}

export async function isEmailTaken(email: string, excludeUid?: string): Promise<boolean> {
  const lower = email.toLowerCase().trim()
  const qRef = query(collection(db, "users"), where("email", "==", lower))
  const qs = await getDocs(qRef)
  if (qs.empty) return false
  const others = qs.docs.filter((d) => d.id !== excludeUid)
  return others.length > 0
}

// Optional helpers to fetch by unique keys
export async function getUserByStudentId(studentId: string): Promise<UserProfile | null> {
  const norm = normalizeStudentId(studentId)
  const qRef = query(collection(db, "users"), where("studentId", "==", norm))
  const qs = await getDocs(qRef)
  if (qs.empty) return null
  return convertToUserProfile(qs.docs[0])
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const lower = email.toLowerCase().trim()
  const qRef = query(collection(db, "users"), where("email", "==", lower))
  const qs = await getDocs(qRef)
  if (qs.empty) return null
  return convertToUserProfile(qs.docs[0])
}

// Optional setter that normalizes ID
export async function setStudentId(uid: string, studentId: string | null): Promise<void> {
  const userRef = doc(db, "users", uid)
  const value = studentId ? normalizeStudentId(studentId) : null
  await updateDoc(userRef, {
    studentId: value === null ? deleteField() : value,
    updatedAt: serverTimestamp(),
  } as any)
}

// ===== EXISTENCE CHECK =====
export async function checkUserProfileExists(uid: string): Promise<boolean> {
  try {
    const userRef = doc(db, "users", uid)
    const userSnap = await getDoc(userRef)
    return userSnap.exists()
  } catch (error) {
    console.error("Error checking user profile exists:", error)
    return false
  }
}

// ===== LISTS =====
export async function getAllUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, "users")
    const querySnapshot = await getDocs(usersRef)
    const users = querySnapshot.docs.map(convertToUserProfile)
    return users.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
  } catch (error) {
    console.error("Error getting all users:", error)
    throw error
  }
}

export async function getPendingUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, "users")
    const qRef = query(usersRef, where("status", "==", "pending"))
    const qs = await getDocs(qRef)
    const users = qs.docs.map(convertToUserProfile)
    return users.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
  } catch (error) {
    console.error("Error getting pending users:", error)
    throw error
  }
}

export async function getApprovedUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, "users")
    const qRef = query(usersRef, where("status", "==", "approved"))
    const qs = await getDocs(qRef)
    const users = qs.docs.map(convertToUserProfile)
    return users.sort((a, b) => (b.approvedAt?.getTime() || 0) - (a.approvedAt?.getTime() || 0))
  } catch (error) {
    console.error("Error getting approved users:", error)
    throw error
  }
}

export async function getRejectedUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, "users")
    const qRef = query(usersRef, where("status", "==", "rejected"))
    const qs = await getDocs(qRef)
    const users = qs.docs.map(convertToUserProfile)
    return users.sort((a, b) => (b.rejectedAt?.getTime() || 0) - (a.rejectedAt?.getTime() || 0))
  } catch (error) {
    console.error("Error getting rejected users:", error)
    throw error
  }
}

export async function getBlockedUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, "users")
    const qRef = query(usersRef, where("status", "==", "blocked"))
    const qs = await getDocs(qRef)
    const users = qs.docs.map(convertToUserProfile)
    return users.sort((a, b) => (b.blockedAt?.getTime() || 0) - (a.blockedAt?.getTime() || 0))
  } catch (error) {
    console.error("Error getting blocked users:", error)
    throw error
  }
}

// ===== ACTIONS =====
export async function approveUser(uid: string, approvedBy: string): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    await updateDoc(userRef, {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy,
      // clear rejection/block fields when approving
      rejectedAt: null,
      rejectedBy: null,
      blockedAt: null,
      blockedBy: null,
      blockReason: null,
      updatedAt: serverTimestamp(),
    } as any)
  } catch (error) {
    console.error("Error approving user:", error)
    throw error
  }
}

export async function rejectUser(uid: string, rejectedBy: string): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    await updateDoc(userRef, {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error rejecting user:", error)
    throw error
  }
}

export async function blockUser(uid: string, adminEmail: string, reason?: string): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    await updateDoc(userRef, {
      status: "blocked",
      blockedAt: serverTimestamp(),
      blockedBy: adminEmail,
      blockReason: reason ?? null,
      updatedAt: serverTimestamp(),
    } as any)
  } catch (error) {
    console.error("Error blocking user:", error)
    throw error
  }
}

export async function unblockUser(uid: string, adminEmail: string): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    await updateDoc(userRef, {
      status: "approved",
      blockedAt: null,
      blockedBy: null,
      blockReason: null,
      updatedAt: serverTimestamp(),
    } as any)
  } catch (error) {
    console.error("Error unblocking user:", error)
    throw error
  }
}

export async function deleteUser(uid: string): Promise<void> {
  try {
    const userRef = doc(db, "users", uid)
    await deleteDoc(userRef)
  } catch (error) {
    console.error("Error deleting user:", error)
    throw error
  }
}

// ===== Pond Preferences =====
export async function savePondPreferences(preferences: Omit<PondPreferences, "updatedAt">): Promise<void> {
  try {
    const preferencesRef = doc(db, "pondPreferences", preferences.userId)
    await setDoc(preferencesRef, {
      ...preferences,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error saving pond preferences:", error)
    throw error
  }
}

export async function getPondPreferences(userId: string): Promise<PondPreferences | null> {
  try {
    const preferencesRef = doc(db, "pondPreferences", userId)
    const preferencesSnap = await getDoc(preferencesRef)

    if (preferencesSnap.exists()) {
      const data = preferencesSnap.data()
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
      }
    }
    return null
  } catch (error) {
    console.error("Error getting pond preferences:", error)
    return null
  }
}
