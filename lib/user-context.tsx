"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useAuth } from "./auth-context"
import {
  getUserProfile,
  createUserProfile,
  checkUserProfileExists,
  isAdmin,
  getPondPreferences,
  type UserProfile,
  type PondPreferences,
} from "./user-service"

interface UserContextType {
  userProfile: UserProfile | null
  preferences: PondPreferences | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
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

  const refreshProfile = async () => {
    if (!user) {
      setUserProfile(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Figure out role from email as fallback (used if doc lacks role)
      const inferredRole = user.email && isAdmin(user.email) ? "admin" : "user"

      // Get existing profile
      const profile = await getUserProfile(user.uid)

      if (profile) {
        // Ensure role is present even if older docs don't have it yet
        const withRole = (profile.role
          ? profile
          : ({ ...profile, role: inferredRole } as UserProfile))

        setUserProfile(withRole)
      } else {
        // Create new profile for new users
        const newProfile: Omit<UserProfile, "uid"> = {
          email: user.email || "",
          displayName: user.displayName || user.email?.split("@")[0] || "",
          status: user.email && isAdmin(user.email) ? "approved" : "pending",
          role: inferredRole, // ✅ ensure role is saved on first write
          createdAt: new Date(),
        }

        await createUserProfile(user.uid, newProfile)

        // Fetch the created profile
        const createdProfile = await getUserProfile(user.uid)

        // Guarantee role on the object we store in state
        const withRole = createdProfile
          ? (createdProfile.role
              ? createdProfile
              : ({ ...createdProfile, role: inferredRole } as UserProfile))
          : null

        setUserProfile(withRole)
      }
    } catch (error) {
      console.error("Error refreshing profile:", error)
      setError("Failed to load user profile")
    } finally {
      setLoading(false)
    }
  }

  const refreshPreferences = async () => {
    if (!user) {
      setPreferences(null)
      return
    }

    try {
      const prefs = await getPondPreferences(user.uid)
      setPreferences(prefs)
    } catch (error) {
      console.error("Error refreshing preferences:", error)
    }
  }

  const checkUserExists = async (uid: string): Promise<boolean> => {
    try {
      return await checkUserProfileExists(uid)
    } catch (error) {
      console.error("Error checking user exists:", error)
      return false
    }
  }

  useEffect(() => {
    refreshProfile()
  }, [user])

  useEffect(() => {
    if (user) {
      refreshPreferences()
    }
  }, [user])

  const value = {
    userProfile,
    preferences,
    loading,
    error,
    refreshProfile,
    refreshPreferences,
    checkUserExists,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
