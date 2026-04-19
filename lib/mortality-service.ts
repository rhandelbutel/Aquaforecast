import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
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
  updatedAt?: Date
}

function toSafeDate(val: any): Date {
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function getMortalityRateFromLog(
  log: MortalityLog,
  initialFishCount?: number
): number {
  if (typeof log.mortalityRate === "number" && Number.isFinite(log.mortalityRate)) {
    return clampPercent(log.mortalityRate)
  }

  if (
    typeof log.deadFishCount === "number" &&
    Number.isFinite(log.deadFishCount) &&
    typeof initialFishCount === "number" &&
    initialFishCount > 0
  ) {
    return clampPercent((log.deadFishCount / initialFishCount) * 100)
  }

  return 0
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
    const q = query(collection(db, "mortality-logs"), where("pondId", "==", mortalityData.pondId))
    const qs = await getDocs(q)

    if (!qs.empty) {
      const ref = qs.docs[0].ref
      await updateDoc(ref, {
        ...mortalityData,
        updatedAt: serverTimestamp(),
      })
      return ref.id
    } else {
      const ref = doc(collection(db, "mortality-logs"))
      await setDoc(ref, {
        ...mortalityData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

    const logs = querySnapshot.docs.map((d) => {
      const data = d.data() as any
      return {
        id: d.id,
        ...data,
        date: toSafeDate(data.date),
        createdAt: toSafeDate(data.createdAt),
        updatedAt: data.updatedAt ? toSafeDate(data.updatedAt) : undefined,
      } as MortalityLog
    })

    return logs.sort((a, b) => b.date.getTime() - a.date.getTime())
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
    const logs: MortalityLog[] = qs.docs
      .map((docSnap) => {
        const data = docSnap.data() as any
        return {
          id: docSnap.id,
          ...data,
          date: toSafeDate(data.date),
          createdAt: toSafeDate(data.createdAt),
          updatedAt: data.updatedAt ? toSafeDate(data.updatedAt) : undefined,
        } as MortalityLog
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    callback(logs)
  })
}

export const computeSurvivalRateFromLogs = (
  logs: MortalityLog[],
  initialFishCount?: number,
  initialRate = 100
): number => {
  const totalMortality = logs.reduce((sum, log) => {
    return sum + getMortalityRateFromLog(log, initialFishCount)
  }, 0)

  return Math.max(0, initialRate - totalMortality)
}

/* ------------ Simplified update-only API ------------ */

export async function saveMortalityLog(params: {
  pondId: string
  pondName: string
  userId: string
  date: Date
  mortalityRate?: number
  deadFishCount?: number
  initialFishCount?: number
}): Promise<string> {
  const q = query(collection(db, "mortality-logs"), where("pondId", "==", params.pondId))
  const qs = await getDocs(q)
  const existing = !qs.empty ? (qs.docs[0].data() as any) : null

  if (typeof params.deadFishCount === "number") {
    const newDeadFish = Number(params.deadFishCount)
    if (!Number.isFinite(newDeadFish) || newDeadFish <= 0) {
      throw new Error("deadFishCount must be greater than 0")
    }

    const previousDeadFish =
      typeof existing?.deadFishCount === "number" && Number.isFinite(existing.deadFishCount)
        ? existing.deadFishCount
        : 0

    const totalDeadFishCount = previousDeadFish + newDeadFish

    let derivedRate: number | undefined = undefined
    if (
      typeof params.initialFishCount === "number" &&
      Number.isFinite(params.initialFishCount) &&
      params.initialFishCount > 0
    ) {
      derivedRate = clampPercent((totalDeadFishCount / params.initialFishCount) * 100)
    }

    return await updateMortalityLog({
      pondId: params.pondId,
      pondName: params.pondName,
      userId: params.userId,
      date: params.date,
      deadFishCount: totalDeadFishCount,
      ...(typeof derivedRate === "number" ? { mortalityRate: derivedRate } : {}),
    } as MortalityLog)
  }

  const rate = Number(params.mortalityRate)
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    throw new Error("mortalityRate must be > 0 and ≤ 100")
  }

  const previousRate =
    typeof existing?.mortalityRate === "number" && Number.isFinite(existing.mortalityRate)
      ? existing.mortalityRate
      : 0

  const totalRate = clampPercent(previousRate + rate)

  return await updateMortalityLog({
    pondId: params.pondId,
    pondName: params.pondName,
    userId: params.userId,
    date: params.date,
    mortalityRate: totalRate,
  } as MortalityLog)
}