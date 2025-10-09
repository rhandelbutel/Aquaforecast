import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

export type RepeatType = "daily" | "weekly"

export interface FeedingSchedule {
  id: string               // == pondId
  pondId: string           // shared key: (adminPondId || pond.id)
  pondName: string
  timesPerDay: number
  feedingTimes: string[]   // ["07:00","19:00"] 24h (local)
  repeatType: RepeatType
  selectedDays?: number[]  // 0..6 if weekly
  startDate: Date
  endDate?: Date
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: {
    userId: string
    email?: string | null
    displayName?: string | null
  }
  lastUpdatedBy?: {
    userId: string
    email?: string | null
    displayName?: string | null
  }
}

export interface CreateFeedingScheduleData {
  pondId: string
  pondName: string
  timesPerDay: number
  feedingTimes: string[]     // length === timesPerDay
  repeatType: RepeatType
  selectedDays?: number[]
  startDate: Date
  endDate?: Date
}

const COLLECTION = "feeding-schedules"

function toJSDate(v: any): Date {
  if (!v) return new Date(0)
  if (v instanceof Date) return v
  if (typeof v?.toDate === "function") return v.toDate()
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000)
  if (typeof v === "string") {
    const d = new Date(v)
    return isNaN(d.getTime()) ? new Date(0) : d
  }
  if (typeof v === "number") return new Date(v)
  return new Date(0)
}

function validate(data: CreateFeedingScheduleData) {
  if (!data.pondId) throw new Error("pondId is required")
  if (!data.pondName) throw new Error("pondName is required")
  if (!Array.isArray(data.feedingTimes) || data.feedingTimes.length !== data.timesPerDay) {
    throw new Error("feedingTimes must match timesPerDay")
  }
  if (data.repeatType === "weekly" && (!data.selectedDays || data.selectedDays.length === 0)) {
    throw new Error("selectedDays required for weekly schedule")
  }
  if (data.endDate && data.endDate < data.startDate) {
    throw new Error("endDate cannot be earlier than startDate")
  }
}

export const feedingScheduleService = {
  /** Returns the single schedule for a pond (doc id == pondId), or null if not set. */
  async getByPondId(pondId: string): Promise<FeedingSchedule | null> {
    const ref = doc(db, COLLECTION, pondId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const d = snap.data() as any
    return {
      id: snap.id,
      pondId: d.pondId,
      pondName: d.pondName,
      timesPerDay: d.timesPerDay,
      feedingTimes: d.feedingTimes ?? [],
      repeatType: d.repeatType,
      selectedDays: Array.isArray(d.selectedDays) ? d.selectedDays : [],
      startDate: toJSDate(d.startDate),
      endDate: d.endDate ? toJSDate(d.endDate) : undefined,
      isActive: !!d.isActive,
      createdAt: toJSDate(d.createdAt),
      updatedAt: toJSDate(d.updatedAt),
      createdBy: {
        userId: d.createdBy?.userId ?? "",
        email: d.createdBy?.email ?? null,
        displayName: d.createdBy?.displayName ?? null,
      },
      lastUpdatedBy: d.lastUpdatedBy
        ? {
            userId: d.lastUpdatedBy.userId ?? "",
            email: d.lastUpdatedBy.email ?? null,
            displayName: d.lastUpdatedBy.displayName ?? null,
          }
        : undefined,
    }
  },

  /** Live updates for the pond's single schedule. */
  subscribeByPond(pondId: string, cb: (schedule: FeedingSchedule | null) => void): () => void {
    const ref = doc(db, COLLECTION, pondId)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return cb(null)
      const d = snap.data() as any
      cb({
        id: snap.id,
        pondId: d.pondId,
        pondName: d.pondName,
        timesPerDay: d.timesPerDay,
        feedingTimes: d.feedingTimes ?? [],
        repeatType: d.repeatType,
        selectedDays: Array.isArray(d.selectedDays) ? d.selectedDays : [],
        startDate: toJSDate(d.startDate),
        endDate: d.endDate ? toJSDate(d.endDate) : undefined,
        isActive: !!d.isActive,
        createdAt: toJSDate(d.createdAt),
        updatedAt: toJSDate(d.updatedAt),
        createdBy: {
          userId: d.createdBy?.userId ?? "",
          email: d.createdBy?.email ?? null,
          displayName: d.createdBy?.displayName ?? null,
        },
        lastUpdatedBy: d.lastUpdatedBy
          ? {
              userId: d.lastUpdatedBy.userId ?? "",
              email: d.lastUpdatedBy.email ?? null,
              displayName: d.lastUpdatedBy.displayName ?? null,
            }
          : undefined,
      })
    })
  },

  /** Create OR update the schedule for a pond (single doc, id = pondId). */
  async upsert(
    userId: string,
    data: CreateFeedingScheduleData,
    actor: { email?: string | null; displayName?: string | null } = {}
  ): Promise<void> {
    validate(data)
    const ref = doc(db, COLLECTION, data.pondId)
    const snap = await getDoc(ref)
    const base = {
      pondId: data.pondId,
      pondName: data.pondName,
      timesPerDay: data.timesPerDay,
      feedingTimes: data.feedingTimes,
      repeatType: data.repeatType,
      selectedDays: data.repeatType === "weekly" ? data.selectedDays ?? [] : [],
      startDate: Timestamp.fromDate(data.startDate),
      endDate: data.endDate ? Timestamp.fromDate(data.endDate) : null,
      isActive: true,
      updatedAt: serverTimestamp(),
      lastUpdatedBy: {
        userId,
        email: actor.email ?? null,
        displayName: actor.displayName ?? null,
      },
    }

    if (!snap.exists()) {
      await setDoc(ref, {
        ...base,
        createdAt: serverTimestamp(),
        createdBy: {
          userId,
          email: actor.email ?? null,
          displayName: actor.displayName ?? null,
        },
      })
    } else {
      await updateDoc(ref, base)
    }
  },

  /** Soft-disable schedule */
  async deactivate(pondId: string): Promise<void> {
    const ref = doc(db, COLLECTION, pondId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    await updateDoc(ref, { isActive: false, updatedAt: serverTimestamp() })
  },
}
