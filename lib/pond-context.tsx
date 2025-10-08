//lib/pond-context.tsx
"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useAuth } from "./auth-context"
import { isAdmin } from "./user-service"
import { getAdminPond } from "./admin-pond-service"
import { getUserPonds } from "./user-pond-service"

import { db } from "./firebase"
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore"

export interface UnifiedPond {
  id: string
  name: string
  fishSpecies: string
  area: number
  depth: number
  fishCount: number
  feedingFrequency: number
  sensorId: string
  type: "admin" | "user"
  adminPondId?: string
  attachedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

interface PondContextType {
  ponds: UnifiedPond[]
  loading: boolean
  error: string | null
  refreshPonds: () => Promise<void>
}

const PondContext = createContext<PondContextType | undefined>(undefined)

export function PondProvider({ children }: { children: ReactNode }) {
  const [ponds, setPonds] = useState<UnifiedPond[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const refreshPonds = async () => {
    if (!user) {
      setPonds([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const userIsAdmin = isAdmin(user.email || "")

      if (userIsAdmin) {
        // Admin: Get the admin pond
        const adminPond = await getAdminPond()
        if (adminPond) {
          const unifiedPond: UnifiedPond = {
            id: adminPond.id,
            name: adminPond.name,
            fishSpecies: adminPond.fishSpecies,
            area: adminPond.area,
            depth: adminPond.depth,
            fishCount: adminPond.initialFishCount,
            feedingFrequency: adminPond.feedingFrequency,
            sensorId: adminPond.sensorId,
            type: "admin",
            createdAt: adminPond.createdAt,
            updatedAt: adminPond.updatedAt,
          }
          setPonds([unifiedPond])
        } else {
          setPonds([])
        }
      } else {
        // Regular user: Get attached ponds
        const userPonds = await getUserPonds(user.uid)
        const unifiedPonds: UnifiedPond[] = userPonds
          .filter((userPond) => userPond.adminPond)
          .map((userPond) => ({
            id: userPond.id,
            name: userPond.adminPond!.name,
            fishSpecies: userPond.adminPond!.fishSpecies,
            area: userPond.adminPond!.area,
            depth: userPond.adminPond!.depth,
            fishCount: userPond.adminPond!.initialFishCount,
            feedingFrequency: userPond.adminPond!.feedingFrequency,
            sensorId: userPond.adminPond!.sensorId,
            type: "user",
            adminPondId: userPond.adminPondId,
            attachedAt: userPond.attachedAt,
            createdAt: userPond.adminPond!.createdAt,
            updatedAt: userPond.adminPond!.updatedAt,
          }))
        setPonds(unifiedPonds)
      }
    } catch (err) {
      console.error("Error refreshing ponds:", err)
      setError(err instanceof Error ? err.message : "Failed to load ponds")
      setPonds([])
    } finally {
      setLoading(false)
    }
  }

  // Initial load + set up realtime subscriptions
  useEffect(() => {
    if (!user) {
      setPonds([])
      setLoading(false)
      return
    }

    let unsubscribers: Unsubscribe[] = []
    let cancelled = false

    const setup = async () => {
      await refreshPonds()
      if (cancelled) return

      const userIsAdmin = isAdmin(user.email || "")

      if (userIsAdmin) {
        // Admin: listen to the single ponds doc (limit 1)
        const qAdmin = query(collection(db, "ponds"), limit(1))
        const unsubAdmin = onSnapshot(qAdmin, () => {
          // Any change to admin pond -> refresh context
          refreshPonds()
        })
        unsubscribers.push(unsubAdmin)
      } else {
        // User: listen to their user-pond attachment docs
        const qUserPonds = query(collection(db, "user-ponds"), where("userId", "==", user.uid))
        const unsubUserPonds = onSnapshot(qUserPonds, () => {
          // If attachment changes (or embedded admin data updated via server), refresh
          refreshPonds()
        })
        unsubscribers.push(unsubUserPonds)

        // Also listen to the shared admin pond(s) themselves (system currently supports 1)
        const qAdminShared = query(collection(db, "ponds"), limit(1))
        const unsubAdminShared = onSnapshot(qAdminShared, () => {
          refreshPonds()
        })
        unsubscribers.push(unsubAdminShared)
      }
    }

    setup()

    return () => {
      cancelled = true
      unsubscribers.forEach((u) => {
        try { u() } catch {}
      })
      unsubscribers = []
    }
    // re-subscribe when the signed-in user changes
  }, [user?.uid, user?.email])

  return (
    <PondContext.Provider value={{ ponds, loading, error, refreshPonds }}>
      {children}
    </PondContext.Provider>
  )
}

export function usePonds() {
  const context = useContext(PondContext)
  if (context === undefined) {
    throw new Error("usePonds must be used within a PondProvider")
  }
  return context
}
