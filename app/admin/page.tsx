"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { AdminUserManagement } from "@/components/admin/admin-user-management"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LogOut, Shield, Loader2 } from "lucide-react"

export default function AdminPage() {
  const { user, logout, loading } = useAuth() as any
  const router = useRouter()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

  // Wait for auth to finish before deciding
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking access…</p>
        </div>
      </div>
    )
  }

  // Check if user is admin once auth is ready
  if (!user?.email || !isAdmin(user.email)) {
    router.push("/")
    return null
  }

  const handleSignOut = async () => {
    try {
      await logout()
      
      router.push("/")
    } catch (error) {
      console.error("Error signing out:", error)
    } finally {
      setShowLogoutModal(false)
    }
  }

  const onConfirmSignOut = async () => {
    try {
      setSigningOut(true)         
      await sleep(700)            
      await handleSignOut()       
    } catch (e) {
      console.error(e)
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white shadow-sm border-b lg:hidden">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="h-6 w-6 text-blue-600 mr-2" />
              <h1 className="text-lg font-bold text-gray-900">Admin Panel</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogoutModal(true)}
              className="flex items-center"
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-1">Welcome, {user.email}</p>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
                <p className="text-sm text-gray-600">User Management System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
                <p className="text-xs text-gray-500">Administrator</p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center"
                disabled={signingOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminUserManagement />
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                <LogOut className="h-5 w-5 mr-2" />
                Sign Out
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">Are you sure you want to sign out of the admin panel?</p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowLogoutModal(false)}
                  disabled={signingOut}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={onConfirmSignOut}
                  disabled={signingOut}
                  aria-busy={signingOut}
                >
                  {signingOut ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing out…
                    </>
                  ) : (
                    "Sign Out"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
