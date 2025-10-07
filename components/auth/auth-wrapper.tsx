"use client"

import type React from "react"

import { useAuth } from "@/lib/auth-context"
import { UserProvider } from "@/lib/user-context"
import { PondProvider } from "@/lib/pond-context"
import { AuthScreen } from "./auth-screen"
import { ApprovalChecker } from "./approval-checker"
import { ResponsiveLayout } from "@/components/layout/responsive-layout"
import BlockWatcher from "./block-watcher"

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <AuthScreen />

  return (
    <UserProvider>
      {/* If account becomes blocked, show popup (non-admin only). */}
      <BlockWatcher />
      <ApprovalChecker>
        <PondProvider>
          <ResponsiveLayout>{children}</ResponsiveLayout>
        </PondProvider>
      </ApprovalChecker>
    </UserProvider>
  )
}
