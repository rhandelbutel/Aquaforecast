"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Home,
  Droplets,
  BarChart3,
  Calculator,
  Settings,
  LogOut,
  X,
  Fish,          
  Users,
  Loader2,
} from "lucide-react"

interface SideMenuProps {
  onClose: () => void
}

export function SideMenu({ onClose }: SideMenuProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

  const handleNavigation = (path: string) => {
    router.push(path)
    onClose()
  }

  // Call this ONLY after showing the spinner for a short moment.
  const onConfirmSignOut = async () => {
    setSigningOut(true) // immediately show loader overlay
    try {
      await sleep(900)  
      await logout()    // triggers your redirect/guard
      if (pathname.startsWith("/admin")) {
        router.push("/")
      }
    } catch (error) {
      console.error("Error signing out:", error)
      setSigningOut(false)
    } finally {
      setShowLogoutModal(false)
      
    }
  }

  // Create base menu items
  const baseMenuItems = [
    { icon: Home, label: "Dashboard", path: "/" },
    { icon: Fish, label: "Ponds", path: "/ponds" }, 
    { icon: Droplets, label: "Water Quality", path: "/water-quality" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: Calculator, label: "Calculations", path: "/calculations" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ]

  // Add admin menu item at the top if user is admin
  const menuItems =
    user?.email && isAdmin(user.email)
      ? [{ icon: Users, label: "Admin Panel", path: "/admin" }, ...baseMenuItems]
      : baseMenuItems

  return (
    <>
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center">
            {/* Logo replaces header Fish icon */}
            <span className="relative h-6 w-6 md:h-7 md:w-7">
              <Image
                src="/Aquaforecast_logo.png"
                alt="AquaForecast logo"
                fill
                sizes="(min-width: 768px) 28px, 24px"
                className="object-contain"
                priority
              />
            </span>
            <span className="ml-2 text-lg font-bold text-gray-900">AQUAFORECAST</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            disabled={signingOut}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
              <span className="text-cyan-600 font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.email}</p>
              <p className="text-xs text-gray-500">
                {user?.email && isAdmin(user.email) ? "Administrator" : "User"}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.path
              return (
                <li key={item.path}>
                  <button
                    onClick={() => handleNavigation(item.path)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-cyan-100 text-cyan-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                    disabled={signingOut}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Sign Out */}
        <div className="p-4 border-t">
          <button
            onClick={() => setShowLogoutModal(true)}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            disabled={signingOut}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm relative">
            <CardHeader>
              <CardTitle>Sign Out</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">Are you sure you want to sign out?</p>
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

            {/* Subtle blocker while signing out */}
            {signingOut && (
              <div className="absolute inset-0 rounded-lg bg-white/60 backdrop-blur-[1px]" />
            )}
          </Card>
        </div>
      )}

      {/* Global full-screen overlay so loading is visible even before redirect */}
      {signingOut && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm bg-white border">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium text-gray-800">Signing out…</span>
          </div>
        </div>
      )}
    </>
  )
}
