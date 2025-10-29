// lib/user-context.tsx
"use client"

import type React from "react"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useAuth } from "./auth-context"
import {
  getUserProfile,
  createUserProfile,
  checkUserProfileExists,
  isAdmin,
  getPondPreferences,
  subscribeUserProfile, // realtime
  type UserProfile,
  type PondPreferences,
} from "./user-service"

export interface UserContextType {
  userProfile: UserProfile | null
  preferences: PondPreferences | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  refreshPreferences: () => Promise<void>
  checkUserExists: (uid: string) => Promise<boolean>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function useUser(): UserContextType {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser must be used within a UserProvider")
  return ctx
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [preferences, setPreferences] = useState<PondPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ---- Realtime profile subscription (and bootstrap on first login) ----
  useEffect(() => {
    setError(null)

    if (!user?.uid) {
      setUserProfile(null)
      setLoading(false)
      return
    }

    let unsub: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        // Ensure the profile doc exists (first-time login)
        const existing = await getUserProfile(user.uid)
        if (!existing) {
          const role: UserProfile["role"] =
            user.email && isAdmin(user.email) ? "admin" : "user"
          await createUserProfile(user.uid, {
            email: user.email || "",
            displayName:
              user.displayName || user.email?.split("@")[0] || "",
            status: role === "admin" ? "approved" : "pending",
            role,
            createdAt: new Date(), // serverTimestamp will overwrite in service
          } as Omit<UserProfile, "uid">)
        }

        if (cancelled) return

        // Subscribe to live updates of the profile
        unsub = subscribeUserProfile(
          user.uid,
          (profile) => {
            setUserProfile(profile)
            setLoading(false)
          },
          (e) => {
            console.error("subscribeUserProfile error:", e)
            setError("Failed to subscribe to profile changes.")
            setLoading(false)
          }
        )
      } catch (e) {
        console.error("Error initializing user profile subscription:", e)
        setError("Failed to load user profile.")
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
    // Only user.uid & user.email affect bootstrap role and doc path
  }, [user?.uid, user?.email])

  // ---- Manual refresh (kept for compatibility; snapshot already updates UI) ----
  const refreshProfile = async () => {
    if (!user?.uid) {
      setUserProfile(null)
      return
    }
    try {
      setError(null)
      const profile = await getUserProfile(user.uid)
      setUserProfile(profile)
    } catch (e) {
      console.error("refreshProfile error:", e)
      setError("Failed to refresh profile.")
    }
  }

  // ---- Preferences (one-shot; can be made realtime later) ----
  const refreshPreferences = async () => {
    if (!user?.uid) {
      setPreferences(null)
      return
    }
    try {
      const prefs = await getPondPreferences(user.uid)
      setPreferences(prefs)
    } catch (e) {
      console.error("Error refreshing preferences:", e)
      // optional: surface an error if needed
    }
  }

  // Load preferences when user changes
  useEffect(() => {
    if (user?.uid) void refreshPreferences()
    else setPreferences(null)
  }, [user?.uid])

  const checkUserExists = async (uid: string): Promise<boolean> => {
    try {
      return await checkUserProfileExists(uid)
    } catch (e) {
      console.error("Error checking user exists:", e)
      return false
    }
  }

  const value = useMemo<UserContextType>(
    () => ({
      userProfile,
      preferences,
      loading,
      error,
      refreshProfile,
      refreshPreferences,
      checkUserExists,
    }),
    [userProfile, preferences, loading, error]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

// Explicit named exports to avoid resolution issues in TS/Next caches
export { UserContext }
export type { UserProfile, PondPreferences }
