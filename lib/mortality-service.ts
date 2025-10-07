import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

export interface MortalityLog {
  id?: string
  pondId: string
  pondName: string
  userId: string
  date: Date
  // Prefer mortalityRate percent (0-100). Keep deadFishCount optional for backward compatibility
  mortalityRate?: number
  deadFishCount?: number
  notes?: string
  createdAt: Date
}

export const addMortalityLog = async (mortalityData: Omit<MortalityLog, "id" | "createdAt">) => {
  try {
    const { notes, ...rest } = mortalityData
    const payload = {
      ...rest,
      ...(notes ? { notes } : {}),
      createdAt: serverTimestamp(),
    }
    const docRef = await addDoc(collection(db, "mortality-logs"), payload)
    return docRef.id
  } catch (error) {
    console.error("Error adding mortality log:", error)
    throw error
  }
}

/**
 * NEW: Update only the mortalityRate of a log.
 * Safeguards:
 * - validates 0..100
 * - verifies the log belongs to the provided pondId before updating
 */
export const updateMortalityLogRate = async (
  pondId: string,
  logId: string,
  mortalityRate: number
): Promise<void> => {
  const rate = Number(mortalityRate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("mortalityRate must be between 0 and 100")
  }

  const ref = doc(db, "mortality-logs", logId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error("Mortality log not found")
  }
  const data = snap.data() as any
  if (data?.pondId !== pondId) {
    // Extra safety so a UI bug can't update a different pond's record
    throw new Error("Log does not belong to the specified pond")
  }

  await updateDoc(ref, { mortalityRate: rate })
}

export const getMortalityLogs = async (pondId: string): Promise<MortalityLog[]> => {
  try {
    const q = query(collection(db, "mortality-logs"), where("pondId", "==", pondId))
    const querySnapshot = await getDocs(q)
    const logs = querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data() as any
      const toSafeDate = (val: any): Date => {
        if (!val) return new Date(0)
        if (val instanceof Date) return val
        if (typeof val?.toDate === "function") {
          try {
            return val.toDate() as Date
          } catch {
            return new Date(0)
          }
        }
        if (typeof val?.seconds === "number") return new Date(val.seconds * 1000)
        if (typeof val === "string") {
          const d = new Date(val)
          return isNaN(d.getTime()) ? new Date(0) : d
        }
        if (typeof val === "number") {
          const d = new Date(val)
          return isNaN(d.getTime()) ? new Date(0) : d
        }
        return new Date(0)
      }
      return {
        id: docSnap.id,
        ...data,
        date: toSafeDate(data.date),
        createdAt: toSafeDate(data.createdAt),
      } as MortalityLog
    })
    // Sort client-side by date desc to avoid index
    return logs.sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0))
  } catch (error) {
    console.error("Error getting mortality logs:", error)
    return []
  }
}

export const subscribeMortalityLogs = (
  pondId: string,
  callback: (logs: MortalityLog[]) => void
): (() => void) => {
  const q = query(collection(db, "mortality-logs"), where("pondId", "==", pondId))
  return onSnapshot(q, (qs) => {
    const logs: MortalityLog[] = qs.docs.map((docSnap) => {
      const data = docSnap.data() as any
      const toSafeDate = (val: any): Date => {
        if (!val) return new Date(0)
        if (val instanceof Date) return val
        if (typeof val?.toDate === "function") {
          try {
            return val.toDate() as Date
          } catch {
            return new Date(0)
          }
        }
        if (typeof val?.seconds === "number") return new Date(val.seconds * 1000)
        if (typeof val === "string") {
          const d = new Date(val)
          return isNaN(d.getTime()) ? new Date(0) : d
        }
        if (typeof val === "number") {
          const d = new Date(val)
          return isNaN(d.getTime()) ? new Date(0) : d
        }
        return new Date(0)
      }
      return {
        id: docSnap.id,
        ...data,
        date: toSafeDate(data.date),
        createdAt: toSafeDate(data.createdAt),
      } as MortalityLog
    })
    logs.sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0))
    callback(logs)
  })
}

export const computeSurvivalRateFromLogs = (logs: MortalityLog[], initialRate = 100): number => {
  // Sum mortality rates; clamp 0-100; survival = 100 - totalMortality
  const totalMortality = logs.reduce((sum, log) => {
    const rate = typeof log.mortalityRate === "number" ? log.mortalityRate : 0
    return sum + Math.max(0, Math.min(100, rate))
  }, 0)
  const survival = Math.max(0, initialRate - totalMortality)
  return survival
}

export const resetMortalityLogs = async (pondId: string): Promise<void> => {
  try {
    const q = query(collection(db, "mortality-logs"), where("pondId", "==", pondId))
    const qs = await getDocs(q)
    if (qs.empty) return
    let batch = writeBatch(db)
    let opCount = 0
    for (const d of qs.docs) {
      batch.delete(d.ref)
      opCount++
      if (opCount === 450) {
        // stay under 500 write limit
        await batch.commit()
        batch = writeBatch(db)
        opCount = 0
      }
    }
    if (opCount > 0) {
      await batch.commit()
    }
  } catch (error) {
    console.error("Error resetting mortality logs:", error)
    throw error
  }
}

export const calculateSurvivalRate = (initialCount: number, totalDeaths: number): number => {
  if (initialCount === 0) return 0
  const alive = initialCount - totalDeaths
  return Math.max(0, (alive / initialCount) * 100)
}
