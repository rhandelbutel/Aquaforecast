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
  subscribeUserProfile,   // ✅ realtime
  type UserProfile,
  type PondPreferences,
} from "./user-service"

interface UserContextType {
  userProfile: UserProfile | null
  preferences: PondPreferences | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>        // kept for compatibility
  refreshPreferences: () => Promise<void>
  checkUserExists: (uid: string) => Promise<boolean>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [preferences, setPreferences] = useState<PondPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🔴 Realtime: ensure doc exists, then subscribe to it
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

        // Ensure a profile doc exists (first-login case)
        const existing = await getUserProfile(user.uid)
        if (!existing) {
          const inferredRole: UserProfile["role"] = user.email && isAdmin(user.email) ? "admin" : "user"
          await createUserProfile(user.uid, {
            email: user.email || "",
            displayName: user.displayName || user.email?.split("@")[0] || "",
            status: inferredRole === "admin" ? "approved" : "pending",
            role: inferredRole,
            createdAt: new Date(), // will be overwritten by serverTimestamp in service
          } as Omit<UserProfile, "uid">)
        }

        if (cancelled) return

        // Subscribe to live changes
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
  }, [user?.uid])

  // Legacy manual refresh (not needed with realtime, but kept so callers don’t break)
  const refreshProfile = async () => {
    if (!user?.uid) {
      setUserProfile(null)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const profile = await getUserProfile(user.uid)
      setUserProfile(profile)
    } catch (e) {
      console.error("refreshProfile error:", e)
      setError("Failed to refresh profile.")
    } finally {
      setLoading(false)
    }
  }

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
      // optional: setError("Failed to load preferences.")
    }
  }

  const checkUserExists = async (uid: string): Promise<boolean> => {
    try {
      return await checkUserProfileExists(uid)
    } catch (e) {
      console.error("Error checking user exists:", e)
      return false
    }
  }

  // Load preferences when user changes (one-shot; make this a subscription later if you need live prefs)
  useEffect(() => {
    if (user) void refreshPreferences()
    else setPreferences(null)
  }, [user?.uid])

  const value = useMemo<UserContextType>(() => ({
    userProfile,
    preferences,
    loading,
    error,
    refreshProfile,
    refreshPreferences,
    checkUserExists,
  }), [userProfile, preferences, loading, error])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
