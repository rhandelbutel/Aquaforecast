"use client";

import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "./firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, studentId: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ---------- Auth state watcher ----------
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const init = async () => {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch {
        // ignore persistence error
      } finally {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
          setLoading(false);
        });
      }
    };
    void init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ---------- Sign In ----------
  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  };

  // ---------- Sign Up (with pending email) ----------
  const signUp = async (email: string, password: string, studentId: string) => {
    const sid = studentId.trim();

    // 1 Reserve Student ID to ensure uniqueness
    const sidRef = doc(db, "studentIds", sid);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sidRef);
        if (snap.exists()) {
          const err: any = new Error("Student ID already in use");
          err.code = "student-id-already-in-use";
          throw err;
        }
        tx.set(sidRef, { reservedAt: serverTimestamp() });
      });
    } catch (e) {
      throw e;
    }

    // 2 Create Firebase Auth user
    let fbUser: User | null = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      fbUser = cred.user;
    } catch (e) {
      await deleteDoc(sidRef).catch(() => {});
      throw e;
    }

    // 3️ Create Firestore profile + send pending email
    try {
      if (!fbUser) throw new Error("User not created");
      const profileRef = doc(db, "users", fbUser.uid);
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
      );

      // finalize SID reservation (bind to uid)
      await setDoc(
        sidRef,
        { uid: fbUser.uid, createdAt: serverTimestamp() },
        { merge: true }
      );

      // 4️ Send "pending" email via API route
      try {
        await fetch(
          `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/api/email/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: fbUser.email, status: "pending" }),
          }
        );
        console.log("✅ Pending email sent to", fbUser.email);
      } catch (err) {
        console.error("❌ Failed to send pending email:", err);
      }
    } catch (e) {
      await deleteDoc(sidRef).catch(() => {});
      throw e;
    }
  };

  // ---------- Logout ----------
  const logout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  // ---------- Reset Password ----------
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error("Password reset error:", error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
