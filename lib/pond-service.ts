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
import { upsertDash, resolveDashInsight } from "./dash-insights-service"

export interface PondData {
  id?: string
  name: string
  fishSpecies: string
  area: number
  depth: number
  fishCount: number
  initialFishCount?: number
  feedingFrequency: number
  userId?: string
  adminPondId?: string
  sensorId?: string
  createdAt: Date
  updatedAt: Date
}

export interface HarvestLog {
  id?: string
  pondId: string
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
    return qs.docs.map((d) => ({ id: d.id, ...d.data() } as PondData))
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

/** Delete docs from a subcollection safely in chunks. */
async function deleteSubcollection(collPath: string): Promise<number> {
  const collRef = collection(db, collPath)
  const qs = await getDocs(collRef)
  if (qs.empty) return 0

  let batch = writeBatch(db)
  let ops = 0
  let total = 0

  const commit = async () => {
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const d of qs.docs) {
    batch.delete(d.ref)
    ops++
    total++
    if (ops >= 400) await commit()
  }

  if (ops > 0) await commit()
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

  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref, data } = admin
  const initial =
    (typeof data.initialFishCount === "number" ? data.initialFishCount : data.fishCount) || 0

  const mortalityLogs = await getMortalityLogs(sharedPondId)
  const survivalRate = computeSurvivalRateFromLogs(mortalityLogs)
  const estimatedAlive = Math.max(0, Math.round((survivalRate / 100) * initial))

  if (harvestCount > estimatedAlive) {
    throw new Error(
      `Harvest count (${harvestCount.toLocaleString()}) exceeds estimated alive (${estimatedAlive.toLocaleString()}).`
    )
  }

  const nextInitial = Math.max(0, initial - harvestCount)

  await updateDoc(ref, {
    initialFishCount: nextInitial,
    ...(typeof data.fishCount === "number" ? { fishCount: nextInitial } : {}),
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, nextInitial)
  await addHarvestLog({ pondId: sharedPondId, type: "partial", count: harvestCount, date })
}

/**
 * Total Harvest:
 * - Sets fish counts to 0
 * - Propagates to user ponds
 * - Clears daily trend data only
 * - Resolves harvest-related insights
 * - Adds new “Total Harvest Completed” insight
 */
export async function totalHarvest(sharedPondId: string) {
  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref, data } = admin

  // 1️⃣ Reset pond fish count
  await updateDoc(ref, {
    initialFishCount: 0,
    ...(typeof data.fishCount === "number" ? { fishCount: 0 } : {}),
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, 0)

  // 2️⃣ Log harvest
  await addHarvestLog({ pondId: sharedPondId, type: "total", date: new Date() })

  // 3️⃣ Clear daily trend data only
  await deleteSubcollection(`ponds/${sharedPondId}/daily_trends`)

  // 4️⃣ Resolve outdated insights
  await resolveDashInsight(sharedPondId, "dash_partial_harvest").catch(() => {})
  await resolveDashInsight(sharedPondId, "dash_abw_logged").catch(() => {})

  // 5️⃣ Add new insight
  await upsertDash(sharedPondId, "dash_total_harvest", {
    key: "dash_total_harvest",
    title: "Total Harvest Completed",
    message:
      "All fish have been harvested. The pond is now ready for cleaning and preparation before the next stocking cycle.",
    severity: "info",
    category: "growth",
    suggestedAction:
      "Clean and prepare the pond, check water parameters, then record a new stocking when ready.",
    evidence: { harvestedAt: new Date().toISOString() },
  })
}

/**
 * Start a new cycle after total harvest.
 * Resets pond counts and adds a “New Stocking” insight.
 */
export async function startNewStocking(sharedPondId: string, fishCount: number, date: Date) {
  if (!Number.isFinite(fishCount) || fishCount <= 0) {
    throw new Error("Fish count must be greater than 0.")
  }

  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref } = admin

  await updateDoc(ref, {
    initialFishCount: fishCount,
    fishCount,
    createdAt: date,
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, fishCount)

  // clear old harvest insight
  await resolveDashInsight(sharedPondId, "dash_total_harvest").catch(() => {})

  // add a new one
  await upsertDash(sharedPondId, "dash_new_stocking", {
    key: "dash_new_stocking",
    title: "New Stocking Recorded",
    message: `A new cycle has started with ${fishCount.toLocaleString()} fish stocked.`,
    severity: "info",
    category: "growth",
    suggestedAction: "Monitor water quality and record daily feedings to track growth performance.",
    evidence: { fishCount, stockedAt: date.toISOString() },
  })
}

