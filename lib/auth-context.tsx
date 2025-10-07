"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth"
import { auth } from "./firebase"

import {
  doc,
  setDoc,
  serverTimestamp,
  runTransaction,
  deleteDoc,
} from "firebase/firestore"
import { db } from "./firebase"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, studentId: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    const init = async () => {
      try {
        // Don't restore across browser restarts
        await setPersistence(auth, browserSessionPersistence)
      } catch {
        // ignore
      } finally {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser)
          setLoading(false)
        })
      }
    }
    void init()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      console.error("Sign in error:", error)
      throw error
    }
  }

  const signUp = async (email: string, password: string, studentId: string) => {
    const sid = studentId.trim()

    // 1) Reserve SID transactionally to guarantee uniqueness (even under race)
    const sidRef = doc(db, "studentIds", sid)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sidRef)
        if (snap.exists()) {
          const err: any = new Error("Student ID already in use")
          err.code = "student-id-already-in-use"
          throw err
        }
        tx.set(sidRef, { reservedAt: serverTimestamp() })
      })
    } catch (e) {
      // Pass custom error through so UI can show "already registered"
      throw e
    }

    // 2) Create the Auth user (email uniqueness enforced here)
    let fbUser: User | null = null
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      fbUser = cred.user
    } catch (e) {
      // release reservation if auth creation failed
      await deleteDoc(sidRef).catch(() => {})
      throw e
    }

    // 3) Create user profile so admin panel can see pending account immediately
    try {
      if (!fbUser) throw new Error("User not created")
      const profileRef = doc(db, "users", fbUser.uid)
      await setDoc(
        profileRef,
        {
          uid: fbUser.uid,
          email: fbUser.email,
          studentId: sid,
          status: "pending", // admin panel reads this
          role: "user",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      // finalize SID reservation (bind to uid)
      await setDoc(sidRef, { uid: fbUser.uid, createdAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      // best-effort cleanup if profile write failed
      await deleteDoc(sidRef).catch(() => {})
      throw e
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
      throw error
    }
  }

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error) {
      console.error("Password reset error:", error)
      throw error
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signUp,
    logout,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
