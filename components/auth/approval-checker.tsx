"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { useUser } from "@/lib/user-context"
import { isAdmin } from "@/lib/user-service"
import { PendingApproval } from "./pending-approval"

interface ApprovalCheckerProps {
  children: React.ReactNode
}

export function ApprovalChecker({ children }: ApprovalCheckerProps) {
  const { user } = useAuth()
  const { userProfile, loading } = useUser()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    )
  }

  // Check approval status first (before admin check)
  if (!userProfile || userProfile.status !== "approved") {
    return <PendingApproval />
  }

  // Admin users get full access after approval
  if (user?.email && isAdmin(user.email)) {
    return <>{children}</>
  }

  // Regular approved users get access to main app
  return <>{children}</>
}
