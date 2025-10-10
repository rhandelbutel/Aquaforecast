import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"
import { getMortalityLogs, computeSurvivalRateFromLogs } from "./mortality-service"

export interface PondData {
  id?: string
  name: string
  fishSpecies: string
  area: number
  depth: number
  fishCount: number
  initialFishCount?: number         // canonical for your UI
  feedingFrequency: number
  userId: string
  adminPondId?: string
  sensorId?: string
  createdAt: Date
  updatedAt: Date
}

export interface HarvestLog {
  id?: string
  pondId: string                    // shared admin id
  type: "partial" | "total"
  count?: number
  date: Date
  createdAt: Date
}

export const addPond = async (pondData: Omit<PondData, "id" | "createdAt" | "updatedAt">) => {
  const docRef = await addDoc(collection(db, "ponds"), {
    ...pondData,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return docRef.id
}

export const getUserPonds = async (userId: string): Promise<PondData[]> => {
  try {
    const q = query(collection(db, "ponds"), where("userId", "==", userId))
    const qs = await getDocs(q)
    return qs.docs.map(d => ({ id: d.id, ...d.data() } as PondData))
  } catch {
    return []
  }
}

export const updatePond = async (pondId: string, updates: Partial<PondData>) => {
  const pondRef = doc(db, "ponds", pondId)
  await updateDoc(pondRef, { ...updates, updatedAt: new Date() })
}

export const deletePond = async (pondId: string) => {
  await deleteDoc(doc(db, "ponds", pondId))
}

/* ----------------- internal helpers ------------------ */

async function addHarvestLog(log: Omit<HarvestLog, "id" | "createdAt">) {
  await addDoc(collection(db, "harvest-logs"), { ...log, createdAt: new Date() })
}

/** Fetch the admin pond doc by shared id (must exist in "ponds"). */
async function getAdminPondDoc(sharedPondId: string) {
  const ref = doc(db, "ponds", sharedPondId)
  const snap = await getDoc(ref)
  return snap.exists() ? { ref, data: snap.data() as PondData } : null
}

/** Update embedded adminPond copy inside all user-pond attachments. */
async function propagateToUserPonds(sharedPondId: string, nextInitial: number) {
  const qUP = query(collection(db, "user-ponds"), where("adminPondId", "==", sharedPondId))
  const qsUP = await getDocs(qUP)
  if (qsUP.empty) return

  let batch = writeBatch(db)
  let ops = 0

  const COMMIT = async () => {
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const d of qsUP.docs) {
    batch.update(d.ref, { "adminPond.initialFishCount": nextInitial })
    ops++
    if (ops >= 450) await COMMIT()
  }

  if (ops > 0) await COMMIT()
}

/** Delete docs from a collection where `field == value`, safely in chunks. */
async function deleteWhereChunked(
  collName: string,
  field: string,
  value: string
): Promise<number> {
  const qDel = query(collection(db, collName), where(field, "==", value))
  const qs = await getDocs(qDel)
  if (qs.empty) return 0

  let batch = writeBatch(db)
  let ops = 0
  let total = 0

  const COMMIT = async () => {
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const d of qs.docs) {
    batch.delete(d.ref)
    ops++
    total++
    if (ops >= 450) await COMMIT()
  }

  if (ops > 0) await COMMIT()
  return total
}

/* ----------------- HARVEST ACTIONS ------------------ */

/**
 * Partial Harvest:
 * - Reads initialFishCount from the ADMIN pond (fallback to fishCount).
 * - Computes estimatedAlive using mortality logs against the shared id.
 * - Rejects if harvestCount > estimatedAlive.
 * - Writes nextInitial back to ADMIN pond's initialFishCount (and mirrors fishCount if present).
 * - Propagates the updated initialFishCount into all user-ponds embeds.
 */
export async function applyPartialHarvest(sharedPondId: string, harvestCount: number, date: Date) {
  if (!Number.isFinite(harvestCount) || harvestCount <= 0) {
    throw new Error("Enter a valid number of fish to harvest.")
  }

  // Load ADMIN pond record
  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref, data } = admin
  const initial = (typeof data.initialFishCount === "number" ? data.initialFishCount : data.fishCount) || 0

  // Compute estimated alive
  const mortalityLogs = await getMortalityLogs(sharedPondId)
  const survivalRate = computeSurvivalRateFromLogs(mortalityLogs) // 0..100
  const estimatedAlive = Math.max(0, Math.round((survivalRate / 100) * initial))

  if (harvestCount > estimatedAlive) {
    throw new Error(
      `Harvest count (${harvestCount.toLocaleString()}) exceeds estimated alive (${estimatedAlive.toLocaleString()}).`
    )
  }

  const nextInitial = Math.max(0, initial - harvestCount)

  // Update ADMIN pond (initialFishCount, and mirror fishCount if you still use it)
  await updateDoc(ref, {
    initialFishCount: nextInitial,
    ...(typeof data.fishCount === "number" ? { fishCount: nextInitial } : {}),
    updatedAt: new Date(),
  })

  // Propagate to user-ponds embeds so users see it too
  await propagateToUserPonds(sharedPondId, nextInitial)

  // Log
  await addHarvestLog({ pondId: sharedPondId, type: "partial", count: harvestCount, date })
}

/**
 * Total Harvest:
 * - Sets initialFishCount (and fishCount, if present) to 0 on ADMIN pond.
 * - Propagates 0 to user-ponds embeds.
 * - Optional cleanup for a fresh cycle, using chunked batches (safe).
 */
export async function totalHarvest(sharedPondId: string) {
  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref, data } = admin

  await updateDoc(ref, {
    initialFishCount: 0,
    ...(typeof data.fishCount === "number" ? { fishCount: 0 } : {}),
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, 0)

  await addHarvestLog({ pondId: sharedPondId, type: "total", date: new Date() })

  // ---- OPTIONAL CLEANUP (safe, chunked; uncomment if you want the wipe) ----
  await deleteWhereChunked("feeding-logs", "adminPondId", sharedPondId)
  await deleteWhereChunked("feeding-logs", "pondId", sharedPondId)
  await deleteWhereChunked("mortality-logs", "adminPondId", sharedPondId)
  await deleteWhereChunked("mortality-logs", "pondId", sharedPondId)
  await deleteWhereChunked("growthsetup", "pondId", sharedPondId)
  await deleteWhereChunked("feeding-schedules", "pondId", sharedPondId)
  await deleteWhereChunked("growthhistory", "pondId", sharedPondId)
}
