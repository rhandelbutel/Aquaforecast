// components/auth/pending-approval.tsx (or your current path)
"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useUser } from "@/lib/user-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  LogOut,
  User,
  Mail,
  Calendar,
  ShieldBan,
  IdCard, // 👈 NEW: lucide-react id card icon
} from "lucide-react"

type ApprovalState = "pending" | "approved" | "rejected" | "blocked"

export function PendingApproval() {
  const { user, logout } = useAuth()
  const { userProfile, refreshProfile, checkUserExists } = useUser()

  const [approvalStatus, setApprovalStatus] = useState<ApprovalState>("pending")
  const [statusMessage, setStatusMessage] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [countdown, setCountdown] = useState(0) // used only for "approved" redirect

  // Safe date formatter
  const fmt = (d?: Date) =>
    d instanceof Date && !isNaN(d.getTime())
      ? d.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" })
      : "—"

  useEffect(() => {
    if (!userProfile) return

    const status = (userProfile.status ?? "pending") as ApprovalState
    setApprovalStatus(status)

    switch (status) {
      case "approved":
        setStatusMessage("Your account has been approved! Redirecting to dashboard...")
        setCountdown(3)
        break
      case "rejected":
        setStatusMessage(
          "Your account has been rejected by an administrator. Please contact support for more information."
        )
        setCountdown(0)
        break
      case "blocked":
        setStatusMessage(
          "Your account has been blocked by an administrator. Please sign out and contact support if you believe this is a mistake."
        )
        setCountdown(0) // no auto-logout here
        break
      case "pending":
      default:
        setStatusMessage(
          "Your account is pending approval from an administrator. Please wait while we review your application."
        )
        setCountdown(0)
        break
    }
  }, [userProfile])

  // Keep the countdown ONLY for approved (redirect), not for blocked.
  useEffect(() => {
    if (approvalStatus !== "approved") return
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    } else if (countdown === 0) {
      window.location.reload()
    }
  }, [countdown, approvalStatus])

  const handleCheckStatus = async () => {
    if (!user) return
    setIsChecking(true)
    try {
      const exists = await checkUserExists(user.uid)
      if (!exists) {
        setApprovalStatus("rejected")
        setStatusMessage(
          "Your account has been rejected by an administrator. Please contact support for more information."
        )
      } else {
        await refreshProfile()
      }
    } catch (error) {
      console.error("Error checking status:", error)
    } finally {
      setIsChecking(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await logout()
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const getStatusIcon = () => {
    switch (approvalStatus) {
      case "approved":
        return <CheckCircle className="h-16 w-16 text-green-500" />
      case "rejected":
        return <XCircle className="h-16 w-16 text-red-500" />
      case "blocked":
        return <ShieldBan className="h-16 w-16 text-red-600" />
      case "pending":
      default:
        return <Clock className="h-16 w-16 text-yellow-500" />
    }
  }

  const getStatusColor = () => {
    switch (approvalStatus) {
      case "approved":
        return "bg-green-50 border-green-200"
      case "rejected":
      case "blocked":
        return "bg-red-50 border-red-200"
      case "pending":
      default:
        return "bg-yellow-50 border-yellow-200"
    }
  }

  const getBadgeVariant = () => {
    switch (approvalStatus) {
      case "approved":
        return "default"
      case "rejected":
      case "blocked":
        return "destructive"
      case "pending":
      default:
        return "secondary"
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className={`w-full max-w-md ${getStatusColor()}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">{getStatusIcon()}</div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {approvalStatus === "pending" && "Account Pending"}
            {approvalStatus === "approved" && "Account Approved"}
            {approvalStatus === "rejected" && "Account Rejected"}
            {approvalStatus === "blocked" && "Account Blocked"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* User Info */}
          {userProfile && (
            <div className="bg-white rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="font-medium">{userProfile.displayName}</span>
                <Badge variant={getBadgeVariant()} className="capitalize">
                  {approvalStatus}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>{userProfile.email}</span>
              </div>

              {/* 👇 NEW: Student ID row (shown for all states) */}
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <IdCard className="h-4 w-4" />
                <span>
                  <span className="font-medium">Student ID:</span>{" "}
                  {userProfile.studentId && String(userProfile.studentId).trim() !== ""
                    ? userProfile.studentId
                    : "—"}
                </span>
              </div>

              {approvalStatus === "blocked" ? (
                // ONLY show Date blocked when account is blocked
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>Date blocked: {fmt(userProfile.blockedAt)}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Applied: {fmt(userProfile.createdAt)}</span>
                  </div>
                  {userProfile.approvedAt && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>Approved: {fmt(userProfile.approvedAt)}</span>
                    </div>
                  )}
                  {userProfile.rejectedAt && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>Rejected: {fmt(userProfile.rejectedAt)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Status Message */}
          <div className="text-center">
            <p className="text-gray-700 mb-4">{statusMessage}</p>
            {approvalStatus === "approved" && countdown > 0 && (
              <p className="text-sm text-green-600">
                Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}…
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {approvalStatus === "pending" && (
              <Button
                onClick={handleCheckStatus}
                disabled={isChecking}
                className="w-full bg-transparent"
                variant="outline"
              >
                {isChecking ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Checking Status…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check Approval Status
                  </>
                )}
              </Button>
            )}

            {approvalStatus === "blocked" ? (
              <div className="text-center text-sm text-gray-500 space-y-3">
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 bg-transparent"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>

                <div className="pt-4 space-y-1">
                  <p>Need help? Contact support at</p>
                  <a
                    href="mailto:aquaforecast.care@gmail.com?subject=Account%20blocked%20support"
                    className="font-medium text-blue-600 underline italic"
                  >
                    aquaforecast.care@gmail.com
                  </a>
                  <div>
                    <a
                      href="https://mail.google.com/mail/?view=cm&fs=1&to=aquaforecast.care@gmail.com&su=Account%20blocked%20support"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline italic text-blue-600"
                    >
                      Open in Gmail (web)
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                onClick={handleSignOut}
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 bg-transparent"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            )}
          </div>

          {approvalStatus === "pending" && (
            <div className="text-center text-sm text-gray-500 space-y-3">
              <div className="pt-4 space-y-1">
                <p>Need help? Contact support at</p>
                <a
                  href="mailto:aquaforecast.care@gmail.com?subject=Account%20application%20support"
                  className="font-medium text-blue-600 underline italic"
                >
                  aquaforecast.care@gmail.com
                </a>
                <div>
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=aquaforecast.care@gmail.com&su=Account%20application%20support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline italic text-blue-600"
                  >
                    Open in Gmail (web)
                  </a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
