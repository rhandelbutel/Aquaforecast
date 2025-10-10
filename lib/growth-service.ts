import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from "firebase/firestore"
import { db } from "./firebase"

export interface GrowthSetup {
  id: string
  pondId: string
  userId: string
  targetWeight?: number
  currentABW: number
  lastABWUpdate: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  isActive: boolean
}

export interface GrowthHistory {
  id: string
  pondId: string
  userId: string
  abw: number
  recordedAt: Timestamp | null
  notes?: string
}

export class GrowthService {
  private static readonly COLLECTION_NAME = "growthsetup"
  private static readonly HISTORY_COLLECTION_NAME = "growthhistory"

  // ---- Cadence settings (15-day ABW) ----
  private static readonly ABW_CADENCE_DAYS = 15
  private static readonly DAY_MS = 86_400_000

  static async saveGrowthSetup(
    pondId: string,
    userId: string,
    targetWeight: number | null | undefined,
    currentABW: number,
    isInitialSetup: boolean = false
  ): Promise<GrowthSetup> {
    try {
      const id = `${pondId}`
      const ref = doc(db, this.COLLECTION_NAME, id)
      const now = serverTimestamp()

      if (isInitialSetup) {
        const base: Omit<GrowthSetup, "id"> = {
          pondId,
          userId,
          currentABW,
          lastABWUpdate: now as Timestamp,
          createdAt: now as Timestamp,
          updatedAt: now as Timestamp,
          isActive: true,
        }
        const payload =
          typeof targetWeight === "number" && targetWeight > 0
            ? { ...base, targetWeight }
            : base

        await setDoc(ref, payload)
        await this.addGrowthHistory(pondId, userId, currentABW)
        return { id, ...payload }
      }

      const updateData: Record<string, unknown> = {
        currentABW,
        lastABWUpdate: now as Timestamp,
        updatedAt: now as Timestamp,
      }
      if (typeof targetWeight === "number" && targetWeight > 0) {
        updateData.targetWeight = targetWeight
      }

      await updateDoc(ref, updateData)
      await this.addGrowthHistory(pondId, userId, currentABW)

      const snap = await getDoc(ref)
      return { id, ...snap.data() } as GrowthSetup
    } catch (e) {
      console.error("Error saving growth setup:", e)
      throw new Error("Failed to save growth setup")
    }
  }

  static async updateTargetWeight(pondId: string, userId: string, newTargetWeight: number): Promise<void> {
    try {
      const id = `${pondId}`
      const ref = doc(db, this.COLLECTION_NAME, id)
      await updateDoc(ref, { targetWeight: newTargetWeight, updatedAt: serverTimestamp() })
    } catch (e) {
      console.error("Error updating target weight:", e)
      throw new Error("Failed to update target weight")
    }
  }

  static async getGrowthSetup(pondId: string, userId: string): Promise<GrowthSetup | null> {
    try {
      const id = `${pondId}`
      const ref = doc(db, this.COLLECTION_NAME, id)
      const snap = await getDoc(ref)
      if (!snap.exists()) return null

      const raw = { id, ...snap.data() } as Partial<GrowthSetup> & { id: string }

      return {
        id: raw.id,
        pondId: (raw.pondId as string) ?? pondId,
        userId: (raw.userId as string) ?? userId,
        currentABW: typeof raw.currentABW === "number" ? raw.currentABW : 0,
        targetWeight: typeof raw.targetWeight === "number" ? raw.targetWeight : undefined,
        lastABWUpdate: (raw.lastABWUpdate as Timestamp) ?? (serverTimestamp() as Timestamp),
        createdAt: (raw.createdAt as Timestamp) ?? (serverTimestamp() as Timestamp),
        updatedAt: (raw.updatedAt as Timestamp) ?? (serverTimestamp() as Timestamp),
        isActive: typeof raw.isActive === "boolean" ? raw.isActive : true,
      }
    } catch (e) {
      console.error("Error getting growth setup:", e)
      throw new Error("Failed to get growth setup")
    }
  }

  static async getUserGrowthSetups(userId: string): Promise<GrowthSetup[]> {
    try {
      const q = query(collection(db, this.COLLECTION_NAME), where("isActive", "==", true))
      const qs = await getDocs(q)
      const arr: GrowthSetup[] = []
      qs.forEach((d) => {
        const raw = { id: d.id, ...d.data() } as Partial<GrowthSetup> & { id: string }
        arr.push({
          id: raw.id,
          pondId: (raw.pondId as string) ?? "",
          userId: (raw.userId as string) ?? "",
          currentABW: typeof raw.currentABW === "number" ? raw.currentABW : 0,
          targetWeight: typeof raw.targetWeight === "number" ? raw.targetWeight : undefined,
          lastABWUpdate: (raw.lastABWUpdate as Timestamp) ?? (serverTimestamp() as Timestamp),
          createdAt: (raw.createdAt as Timestamp) ?? (serverTimestamp() as Timestamp),
          updatedAt: (raw.updatedAt as Timestamp) ?? (serverTimestamp() as Timestamp),
          isActive: typeof raw.isActive === "boolean" ? raw.isActive : true,
        })
      })
      return arr
    } catch (e) {
      console.error("Error getting user growth setups:", e)
      throw new Error("Failed to get user growth setups")
    }
  }

  private static toSafeDate(value: unknown): Date | null {
    if (!value) return null
    if (value instanceof Date) return value
    const anyVal: any = value as any
    if (typeof anyVal?.toDate === "function") {
      try { return anyVal.toDate() as Date } catch { return null }
    }
    if (typeof anyVal?.seconds === "number") return new Date(anyVal.seconds * 1000)
    const d = new Date(value as any)
    return isNaN(d.getTime()) ? null : d
  }

  // ---- Cadence-aware ABW timing (15 days) ----
  static canUpdateABW(lastABWUpdate: Timestamp | Date | unknown): boolean {
    const now = new Date()
    const last = this.toSafeDate(lastABWUpdate)
    if (!last) return true
    const days = Math.floor((now.getTime() - last.getTime()) / this.DAY_MS)
    return days >= this.ABW_CADENCE_DAYS
  }

  static getDaysUntilNextUpdate(lastABWUpdate: Timestamp | Date | unknown): number {
    const now = new Date()
    const last = this.toSafeDate(lastABWUpdate)
    if (!last) return 0
    const days = Math.floor((now.getTime() - last.getTime()) / this.DAY_MS)
    return Math.max(0, this.ABW_CADENCE_DAYS - days)
  }

  /** Expose a tiny helper so UI/services can compute “ABW due” with the same rule. */
  static isABWDue(lastABWUpdate: Timestamp | Date | unknown): boolean {
    return this.canUpdateABW(lastABWUpdate)
  }

  private static async addGrowthHistory(
    pondId: string,
    userId: string,
    abw: number,
    notes?: string
  ): Promise<void> {
    try {
      const ref = doc(collection(db, this.HISTORY_COLLECTION_NAME))
      const entry = {
        pondId,
        userId: "shared" as const,
        abw,
        recordedAt: serverTimestamp() as Timestamp,
        ...(typeof notes === "string" && notes.trim().length > 0 ? { notes } : {}),
      }
      await setDoc(ref, entry)
    } catch (e) {
      console.error("Error adding growth history:", e)
    }
  }

  static async getGrowthHistory(pondId: string, userId: string): Promise<GrowthHistory[]> {
    try {
      const q = query(collection(db, this.HISTORY_COLLECTION_NAME), where("pondId", "==", pondId))
      const qs = await getDocs(q)
      const history: GrowthHistory[] = []
      qs.forEach((d) => history.push({ id: d.id, ...d.data() } as GrowthHistory))

      const ms = (v: unknown) => this.toSafeDate(v)?.getTime() ?? 0
      return history.sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt))
    } catch (e) {
      console.error("Error getting growth history:", e)
      throw new Error("Failed to get growth history")
    }
  }

  static subscribeGrowthHistory(
    pondId: string,
    callback: (history: GrowthHistory[]) => void
  ): () => void {
    const q = query(collection(db, this.HISTORY_COLLECTION_NAME), where("pondId", "==", pondId))
    return onSnapshot(q, (qs) => {
      const items: GrowthHistory[] = []
      qs.forEach((d) => items.push({ id: d.id, ...d.data() } as GrowthHistory))

      const ms = (v: unknown) => this.toSafeDate(v)?.getTime() ?? 0
      items.sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt))

      callback(items)
    })
  }

  static async deleteGrowthSetup(pondId: string, userId: string): Promise<void> {
    try {
      const id = `${pondId}`
      const ref = doc(db, this.COLLECTION_NAME, id)
      await updateDoc(ref, { isActive: false, updatedAt: serverTimestamp() })
    } catch (e) {
      console.error("Error deleting growth setup:", e)
      throw new Error("Failed to delete growth setup")
    }
  }

  static subscribeGrowthSetup(pondId: string, callback: (setup: GrowthSetup | null) => void): () => void {
    const id = `${pondId}`
    const ref = doc(db, this.COLLECTION_NAME, id)
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) callback({ id, ...snap.data() } as GrowthSetup)
      else callback(null)
    })
  }
}
