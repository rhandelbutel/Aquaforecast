// lib/mortality-service.ts
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
  /** Mortality as percent for the period (0–100). */
  mortalityRate?: number
  /** Legacy/back-compat (optional) */
  deadFishCount?: number
  notes?: string
  createdAt: Date
}

/* ------------ Core CRUD helpers ------------ */

export const addMortalityLog = async (
  mortalityData: Omit<MortalityLog, "id" | "createdAt">
) => {
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

/** Still exported for back-compat in other screens; not used by the new modal. */
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
  if (!snap.exists()) throw new Error("Mortality log not found")
  const data = snap.data() as any
  if (data?.pondId !== pondId) throw new Error("Log does not belong to the specified pond")

  await updateDoc(ref, { mortalityRate: rate })
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
    logs.sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0))
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
        await batch.commit()
        batch = writeBatch(db)
        opCount = 0
      }
    }
    if (opCount > 0) await batch.commit()
  } catch (error) {
    console.error("Error resetting mortality logs:", error)
    throw error
  }
}

/* ------------ 15-day cadence utilities (independent of ABW) ------------ */

const DAY_MS = 86_400_000
const CADENCE_DAYS = 15

export function canCreateMortalityNow(lastLogDate: Date | null | undefined): boolean {
  if (!lastLogDate) return true
  const days = Math.floor((Date.now() - lastLogDate.getTime()) / DAY_MS)
  return days >= CADENCE_DAYS
}

export function daysUntilNextMortality(lastLogDate: Date | null | undefined): number {
  if (!lastLogDate) return 0
  const days = Math.floor((Date.now() - lastLogDate.getTime()) / DAY_MS)
  return Math.max(0, CADENCE_DAYS - days)
}

/**
 * Create a **new** mortality doc (for the next 15-day period) ensuring:
 *  - rate > 0 and ≤ 100
 *  - cumulative mortality stays ≤ 100 (so survival never increases)
 */
export async function createMortalityLogMonotonic(params: {
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

  const logs = await getMortalityLogs(params.pondId)
  const lastDate = logs[0]?.date ?? null
  if (!canCreateMortalityNow(lastDate)) {
    throw new Error(`Not due yet. Next entry allowed in ${daysUntilNextMortality(lastDate)} day(s).`)
  }

  const prevTotal = logs.reduce(
    (sum, l) => sum + (typeof l.mortalityRate === "number" ? Math.max(0, Math.min(100, l.mortalityRate)) : 0),
    0
  )
  if (prevTotal + rate > 100) {
    throw new Error(`Cumulative mortality would exceed 100% (current ${prevTotal}%, +${rate}%).`)
  }

  return await addMortalityLog({
    pondId: params.pondId,
    pondName: params.pondName,
    userId: params.userId,
    date: params.date,
    mortalityRate: rate,
  } as MortalityLog)
}
