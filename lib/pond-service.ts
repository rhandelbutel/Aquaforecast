// lib/pond-service.ts
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
import { getMortalityLogs, computeSurvivalRateFromLogs, type MortalityLog } from "./mortality-service"
import { upsertDash, resolveDashInsight } from "./dash-insights-service"
import { GrowthService, type GrowthHistory, type GrowthSetup } from "./growth-service"
import { getFeedingLogsByPond, type FeedingLog } from "./feeding-service"
import { feedingScheduleService } from "./feeding-schedule-service"

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

export interface DailyMetricsSnapshot {
  date: string
  tz?: string
  count?: number
  sum?: {
    ph?: number
    temp?: number
    do?: number
  }
  avg?: {
    ph?: number
    temp?: number
    do?: number
  }
  buckets4h?: Record<
    string,
    {
      count?: number
      sum?: {
        ph?: number
        temp?: number
        do?: number
      }
      avg?: {
        ph?: number
        temp?: number
        do?: number
      }
    }
  >
}

export interface PondCycleArchive {
  id?: string
  pondId: string
  pondName: string
  fishSpecies: string
  area: number
  depth: number
  feedingFrequency: number
  sensorId?: string

  status: "completed"
  cycleStartedAt: Date | null
  cycleEndedAt: Date
  harvestDate: Date

  stockedFishCount: number
  remainingBeforeFinalHarvest: number
  finalHarvestCount: number
  partialHarvestEventsCount: number
  partialHarvestCountTotal: number
  totalHarvestedCount: number
  mortalityCountEstimate: number
  survivalRate: number

  latestABW: number | null
  targetWeight: number | null

  harvestLogs: HarvestLog[]
  mortalityLogs: MortalityLog[]
  growthSetup: GrowthSetup | null
  growthHistory: GrowthHistory[]
  feedingLogs: FeedingLog[]
  waterQualitySnapshot: DailyMetricsSnapshot[]

  archivedAt: Date
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

function toSafeDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate() as Date
    } catch {
      return null
    }
  }
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000)
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function toDateKeyManila(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d)
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefinedDeep(v)
    }
    return out as T
  }

  return value
}

function sanitizeFeedingLogs(logs: FeedingLog[]): FeedingLog[] {
  return logs.map((log) =>
    stripUndefinedDeep({
      ...log,
      fedAt: toSafeDate(log.fedAt) ?? new Date(0),
      scheduledFor: log.scheduledFor ? toSafeDate(log.scheduledFor) ?? undefined : undefined,
      createdAt: toSafeDate(log.createdAt) ?? new Date(0),
    })
  )
}

function sanitizeWaterQualitySnapshot(rows: DailyMetricsSnapshot[]): DailyMetricsSnapshot[] {
  return rows.map((row) => stripUndefinedDeep(row))
}

/** Fetch the admin pond doc by shared id (must exist in "ponds"). */
async function getAdminPondDoc(sharedPondId: string) {
  const ref = doc(db, "ponds", sharedPondId)
  const snap = await getDoc(ref)
  return snap.exists() ? { ref, data: snap.data() as PondData & Record<string, any> } : null
}

/** Update embedded adminPond copy inside all user-pond attachments. */
async function propagateToUserPonds(
  sharedPondId: string,
  nextInitial: number,
  extra?: Record<string, any>
) {
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
    batch.update(d.ref, {
      "adminPond.initialFishCount": nextInitial,
      "adminPond.fishCount": nextInitial,
      ...(extra ?? {}),
    })
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

/** Delete top-level collection docs that match a query, safely in chunks. */
async function deleteByQuery(qy: ReturnType<typeof query>): Promise<number> {
  const qs = await getDocs(qy)
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

async function getHarvestLogs(pondId: string): Promise<HarvestLog[]> {
  const qy = query(collection(db, "harvest-logs"), where("pondId", "==", pondId))
  const qs = await getDocs(qy)

  const logs = qs.docs.map((d) => {
    const data = d.data() as any
    return {
      id: d.id,
      pondId: data.pondId,
      type: data.type,
      count: typeof data.count === "number" ? data.count : undefined,
      date: toSafeDate(data.date) ?? new Date(0),
      createdAt: toSafeDate(data.createdAt) ?? new Date(0),
    } as HarvestLog
  })

  return logs.sort((a, b) => a.date.getTime() - b.date.getTime())
}

async function getDailyMetricsSnapshot(
  pondId: string,
  cycleStartedAt: Date | null,
  harvestDate: Date
): Promise<DailyMetricsSnapshot[]> {
  const qs = await getDocs(collection(db, "ponds", pondId, "dailyMetrics"))
  if (qs.empty) return []

  const startKey = cycleStartedAt ? toDateKeyManila(cycleStartedAt) : null
  const endKey = toDateKeyManila(harvestDate)

  const rows = qs.docs
    .map((d) => d.data() as DailyMetricsSnapshot)
    .filter((row) => typeof row?.date === "string" && row.date.length > 0)
    .filter((row) => {
      if (!startKey) return row.date <= endKey
      return row.date >= startKey && row.date <= endKey
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  return rows
}

async function archiveCompletedCycle(params: {
  sharedPondId: string
  pond: PondData & Record<string, any>
  harvestDate: Date
  finalHarvestCount: number
  mortalityLogs: MortalityLog[]
  growthSetup: GrowthSetup | null
  growthHistory: GrowthHistory[]
  harvestLogsBeforeFinal: HarvestLog[]
  feedingLogsBeforeFinal: FeedingLog[]
}) {
  const {
    sharedPondId,
    pond,
    harvestDate,
    finalHarvestCount,
    mortalityLogs,
    growthSetup,
    growthHistory,
    harvestLogsBeforeFinal,
    feedingLogsBeforeFinal,
  } = params

  const partialHarvestLogs = harvestLogsBeforeFinal.filter((h) => h.type === "partial")
  const partialHarvestCountTotal = partialHarvestLogs.reduce(
    (sum, h) => sum + (typeof h.count === "number" ? h.count : 0),
    0
  )

  const remainingBeforeFinalHarvest =
    (typeof pond.initialFishCount === "number" ? pond.initialFishCount : pond.fishCount) || 0

  const stockedFishCount = remainingBeforeFinalHarvest + partialHarvestCountTotal
  const totalHarvestedCount = partialHarvestCountTotal + finalHarvestCount
  const mortalityCountEstimate = Math.max(0, stockedFishCount - totalHarvestedCount)

  const cycleStartedAt = toSafeDate(pond.cycleStartedAt ?? pond.createdAt)
  const waterQualitySnapshot = sanitizeWaterQualitySnapshot(
    await getDailyMetricsSnapshot(sharedPondId, cycleStartedAt, harvestDate)
  )
  const feedingLogs = sanitizeFeedingLogs(feedingLogsBeforeFinal)

  const archive: Omit<PondCycleArchive, "id"> = {
    pondId: sharedPondId,
    pondName: pond.name,
    fishSpecies: pond.fishSpecies,
    area: pond.area,
    depth: pond.depth,
    feedingFrequency: pond.feedingFrequency,
    sensorId: pond.sensorId,

    status: "completed",
    cycleStartedAt,
    cycleEndedAt: harvestDate,
    harvestDate,

    stockedFishCount,
    remainingBeforeFinalHarvest,
    finalHarvestCount,
    partialHarvestEventsCount: partialHarvestLogs.length,
    partialHarvestCountTotal,
    totalHarvestedCount,
    mortalityCountEstimate,
    survivalRate:
      stockedFishCount > 0
        ? Number(((totalHarvestedCount / stockedFishCount) * 100).toFixed(2))
        : 0,

    latestABW:
      typeof growthSetup?.currentABW === "number" ? growthSetup.currentABW : null,
    targetWeight:
      typeof growthSetup?.targetWeight === "number" ? growthSetup.targetWeight : null,

    harvestLogs: [
      ...harvestLogsBeforeFinal,
      {
        pondId: sharedPondId,
        type: "total",
        count: finalHarvestCount,
        date: harvestDate,
        createdAt: harvestDate,
      },
    ],
    mortalityLogs,
    growthSetup,
    growthHistory,
    feedingLogs,
    waterQualitySnapshot,

    archivedAt: new Date(),
    createdAt: new Date(),
  }

  await addDoc(collection(db, "ponds", sharedPondId, "cycles"), stripUndefinedDeep(archive))
}

async function clearLiveCycleData(sharedPondId: string) {
  await deleteSubcollection(`ponds/${sharedPondId}/daily_trends`)

  const harvestQ = query(collection(db, "harvest-logs"), where("pondId", "==", sharedPondId))
  await deleteByQuery(harvestQ)

  const mortalityQ = query(collection(db, "mortality-logs"), where("pondId", "==", sharedPondId))
  await deleteByQuery(mortalityQ)

  const growthHistoryQ = query(collection(db, "growthhistory"), where("pondId", "==", sharedPondId))
  await deleteByQuery(growthHistoryQ)

  const feedingByAdminQ = query(collection(db, "feeding-logs"), where("adminPondId", "==", sharedPondId))
  await deleteByQuery(feedingByAdminQ)

  const feedingLegacyQ = query(collection(db, "feeding-logs"), where("pondId", "==", sharedPondId))
  await deleteByQuery(feedingLegacyQ)

  await feedingScheduleService.deactivate(sharedPondId).catch(() => {})
  await GrowthService.deleteGrowthSetup(sharedPondId).catch(() => {})
}

async function resolveCycleDashInsights(sharedPondId: string) {
  const keys = [
    "dash_partial_harvest",
    "dash_abw_logged",
    "dash_growth_due",
    "dash_mortality_due",
    "dash_new_stocking",
  ]

  await Promise.all(keys.map((key) => resolveDashInsight(sharedPondId, key).catch(() => {})))
}

/* ----------------- HARVEST ACTIONS ------------------ */

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

export async function totalHarvest(sharedPondId: string) {
  const admin = await getAdminPondDoc(sharedPondId)
  if (!admin) throw new Error("Admin pond not found.")
  const { ref, data } = admin

  const harvestDate = new Date()
  const remainingBeforeFinalHarvest =
    (typeof data.initialFishCount === "number" ? data.initialFishCount : data.fishCount) || 0

  const mortalityLogs = await getMortalityLogs(sharedPondId)
  const survivalRate = computeSurvivalRateFromLogs(mortalityLogs)
  const finalHarvestCount = Math.max(
    0,
    Math.round((survivalRate / 100) * remainingBeforeFinalHarvest)
  )

  const growthSetup = await GrowthService.getGrowthSetup(sharedPondId, "shared").catch(() => null)
  const growthHistory = await GrowthService.getGrowthHistory(sharedPondId).catch(() => [])
  const harvestLogsBeforeFinal = await getHarvestLogs(sharedPondId)
  const feedingLogsBeforeFinal = await getFeedingLogsByPond(sharedPondId).catch(() => [])

  await archiveCompletedCycle({
    sharedPondId,
    pond: data,
    harvestDate,
    finalHarvestCount,
    mortalityLogs,
    growthSetup,
    growthHistory,
    harvestLogsBeforeFinal,
    feedingLogsBeforeFinal,
  })

  await addHarvestLog({
    pondId: sharedPondId,
    type: "total",
    count: finalHarvestCount,
    date: harvestDate,
  })

  await updateDoc(ref, {
    initialFishCount: 0,
    ...(typeof data.fishCount === "number" ? { fishCount: 0 } : {}),
    cycleStatus: "empty",
    lastHarvestedAt: harvestDate,
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, 0, {
    "adminPond.cycleStatus": "empty",
    "adminPond.lastHarvestedAt": harvestDate,
  })

  await clearLiveCycleData(sharedPondId)
  await resolveCycleDashInsights(sharedPondId)

  await upsertDash(sharedPondId, "dash_total_harvest", {
    key: "dash_total_harvest",
    title: "Total Harvest Completed",
    message:
      "All fish have been harvested. The pond is now ready for cleaning and preparation before the next stocking cycle.",
    severity: "info",
    category: "growth",
    suggestedAction:
      "Clean and prepare the pond, check water parameters, then record a new stocking when ready.",
    evidence: {
      harvestedAt: harvestDate.toISOString(),
      finalHarvestCount,
      remainingBeforeFinalHarvest,
    },
  })
}

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
    cycleStartedAt: date,
    cycleStatus: "active",
    updatedAt: new Date(),
  })

  await propagateToUserPonds(sharedPondId, fishCount, {
    "adminPond.cycleStartedAt": date,
    "adminPond.cycleStatus": "active",
  })

  await resolveDashInsight(sharedPondId, "dash_total_harvest").catch(() => {})

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