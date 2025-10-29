import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  setDoc,
} from "firebase/firestore"
import { db } from "./firebase"

export interface MortalityLog {
  id?: string
  pondId: string
  pondName: string
  userId: string
  date: Date
  mortalityRate?: number
  deadFishCount?: number
  notes?: string
  createdAt: Date
}

/* ------------ Core CRUD helpers (update-only mode) ------------ */

/**
 * Update (or create if missing) a mortality log for a pond.
 * This ensures only one doc per pond.
 */
export const updateMortalityLog = async (
  mortalityData: Omit<MortalityLog, "id" | "createdAt">
) => {
  try {
    // Find existing doc for this pond
    const q = query(collection(db, "mortality-logs"), where("pondId", "==", mortalityData.pondId))
    const qs = await getDocs(q)

    if (!qs.empty) {
      // Update the existing log
      const ref = qs.docs[0].ref
      await updateDoc(ref, {
        ...mortalityData,
        updatedAt: serverTimestamp(),
      })
      return ref.id
    } else {
      // (Optional fallback: create one if none exists)
      const ref = doc(collection(db, "mortality-logs"))
      await setDoc(ref, {
        ...mortalityData,
        createdAt: serverTimestamp(),
      })
      return ref.id
    }
  } catch (error) {
    console.error("Error updating mortality log:", error)
    throw error
  }
}

export const getMortalityLogs = async (pondId: string): Promise<MortalityLog[]> => {
  try {
    const q = query(collection(db, "mortality-logs"), where("pondId", "==", pondId))
    const querySnapshot = await getDocs(q)

    const toSafeDate = (val: any): Date => {
      if (!val) return new Date(0)
      if (val instanceof Date) return val
      if (typeof val?.toDate === "function") {
        try { return val.toDate() as Date } catch { return new Date(0) }
      }
      if (typeof val?.seconds === "number") return new Date(val.seconds * 1000)
      if (typeof val === "string") {
        const d = new Date(val); return isNaN(d.getTime()) ? new Date(0) : d
      }
      if (typeof val === "number") {
        const d = new Date(val); return isNaN(d.getTime()) ? new Date(0) : d
      }
      return new Date(0)
    }

    const logs = querySnapshot.docs.map((d) => {
      const data = d.data() as any
      return {
        id: d.id,
        ...data,
        date: toSafeDate(data.date),
        createdAt: toSafeDate(data.createdAt),
      } as MortalityLog
    })

    return logs
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
    const toSafeDate = (val: any): Date => {
      if (!val) return new Date(0)
      if (val instanceof Date) return val
      if (typeof val?.toDate === "function") {
        try { return val.toDate() as Date } catch { return new Date(0) }
      }
      if (typeof val?.seconds === "number") return new Date(val.seconds * 1000)
      if (typeof val === "string") {
        const d = new Date(val); return isNaN(d.getTime()) ? new Date(0) : d
      }
      if (typeof val === "number") {
        const d = new Date(val); return isNaN(d.getTime()) ? new Date(0) : d
      }
      return new Date(0)
    }

    const logs: MortalityLog[] = qs.docs.map((docSnap) => {
      const data = docSnap.data() as any
      return {
        id: docSnap.id,
        ...data,
        date: toSafeDate(data.date),
        createdAt: toSafeDate(data.createdAt),
      } as MortalityLog
    })
    callback(logs)
  })
}

export const computeSurvivalRateFromLogs = (logs: MortalityLog[], initialRate = 100): number => {
  const totalMortality = logs.reduce((sum, log) => {
    const rate = typeof log.mortalityRate === "number" ? log.mortalityRate : 0
    return sum + Math.max(0, Math.min(100, rate))
  }, 0)
  return Math.max(0, initialRate - totalMortality)
}

/* ------------ Simplified update-only API ------------ */

export async function saveMortalityLog(params: {
  pondId: string
  pondName: string
  userId: string
  date: Date
  mortalityRate: number
}): Promise<string> {
  const rate = Number(params.mortalityRate)
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    throw new Error("mortalityRate must be > 0 and ≤ 100")
  }

  // Simply update (or create once)
  return await updateMortalityLog({
    pondId: params.pondId,
    pondName: params.pondName,
    userId: params.userId,
    date: params.date,
    mortalityRate: rate,
  } as MortalityLog)
}
