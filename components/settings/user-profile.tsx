// components/settings/user-profile.tsx
"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Pencil } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useUser } from "@/lib/user-context"
import { updateUserProfile, type UpdatableProfile } from "@/lib/user-service"
import { useToast } from "@/hooks/use-toast"

export function UserProfile() {
  const { user } = useAuth()
  const { userProfile } = useUser()
  const { toast } = useToast()

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("") // stored exactly as displayed (+639... or 09...)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const phoneRef = useRef<HTMLInputElement | null>(null)

  const originalFullName = userProfile?.fullName ?? ""
  const originalPhone = userProfile?.phone ?? ""

  // === Role-aware UI flags ===
  const isAdminRole = userProfile?.role === "admin"
  const showPhone = !isAdminRole // hide phone for admins

  // === Helpers ===
  const sanitizePhone = (v: string) => v.replace(/[^\d+]/g, "").slice(0, 13)
  const isPhoneEmpty = phone.length === 0
  const isPhoneValid =
    isPhoneEmpty || /^\+639\d{9}$/.test(phone) || /^09\d{9}$/.test(phone)
  const phoneMissing = !originalPhone

  // === Sync from profile ===
  useEffect(() => {
    if (!userProfile) return
    let stored = userProfile.phone ?? ""
    if (stored.startsWith("09")) {
      stored = "+63" + stored.slice(1)
    }
    setFullName(originalFullName)
    setPhone(stored)
    const hasSavedPhone = stored.length > 0
    setIsEditingPhone(!hasSavedPhone)
  }, [userProfile, originalFullName])

  // Auto-focus when enabling edit
  useEffect(() => {
    if (isEditingPhone) setTimeout(() => phoneRef.current?.focus(), 0)
  }, [isEditingPhone])

  const hasChanges = useMemo(() => {
    // For admins, ignore phone when checking for changes
    const nameChanged = fullName.trim() !== originalFullName.trim()
    if (!showPhone) return nameChanged
    return nameChanged || phone !== originalPhone
  }, [fullName, phone, originalFullName, originalPhone, showPhone])

  const onPhoneChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setPhone(sanitizePhone(e.target.value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !hasChanges) return

    // Only validate phone if it's shown (i.e., non-admin)
    if (showPhone && !isPhoneValid) {
      setError("Invalid phone format. Use 09XXXXXXXXX or +639XXXXXXXXX.")
      return
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      let normalized = phone
      if (showPhone && normalized.startsWith("09")) {
        normalized = "+63" + normalized.slice(1)
      }

      const cleanedFullName = fullName.trim()

      const updates: UpdatableProfile = {}
      if (cleanedFullName.length > 0) updates.fullName = cleanedFullName
      else if ((userProfile?.fullName ?? "") !== "") updates.fullName = null

      if (showPhone) {
        if (normalized.length > 0) updates.phone = normalized
        else if ((userProfile?.phone ?? "") !== "") updates.phone = null
      }
      // If phone is hidden (admin), we never touch it.

      await updateUserProfile(user.uid, updates)

      setSuccess("Profile updated successfully!")
      toast({ title: "Saved", description: "Your profile changes have been saved." })

      if (showPhone) {
        setPhone(normalized) // reflect +63 format immediately
        if (normalized.length > 0) setIsEditingPhone(false)
      }
    } catch (err) {
      console.error("Error updating profile:", err)
      setError("Failed to update profile. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const showPhoneEditButton =
    showPhone && !!(userProfile?.phone && userProfile.phone.trim().length > 0) && !isEditingPhone

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <User className="h-5 w-5 mr-2" />
          User Profile
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {success && (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {userProfile?.role === "user" && (
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                type="text"
                value={userProfile?.studentId ?? ""}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">Student ID cannot be changed</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ""}
              disabled
              className="bg-gray-50"
            />
            <p className="text-xs text-gray-500">Email cannot be changed</p>
          </div>

          {/* Phone number section (hidden for admins) */}
          {showPhone && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="phone">Phone</Label>
                {phoneMissing && (
                  <span className="rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5">
                    Required
                  </span>
                )}
              </div>

              <div className="relative">
                {showPhoneEditButton && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(true)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 z-20"
                    aria-label="Edit phone number"
                    title="Edit phone number"
                  >
                    <Pencil className="h-4 w-4 text-gray-600" />
                  </button>
                )}
                <Input
                  ref={phoneRef}
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  enterKeyHint="done"
                  maxLength={13}
                  placeholder="+639XXXXXXXXX"
                  value={phone}
                  onChange={onPhoneChange}
                  disabled={showPhoneEditButton && !isEditingPhone}
                  aria-invalid={!isPhoneValid}
                  className={[
                    showPhoneEditButton && !isEditingPhone ? "pl-10" : "",
                    !isPhoneValid ? "border-red-500 focus-visible:ring-red-500" : "",
                  ].join(" ")}
                />
              </div>

              <p
                className={`text-xs ${
                  !isPhoneValid
                    ? "text-red-600"
                    : phoneMissing
                    ? "text-red-600"
                    : "text-gray-500"
                }`}
              >
                {showPhoneEditButton && !isEditingPhone
                  ? "Tap the pencil to edit your saved number"
                  : phoneMissing
                  ? "Enter your number (09XXXXXXXXX). It will be saved as +639XXXXXXXXX."
                  : "You can type 09XXXXXXXXX or +639XXXXXXXXX. It will display in +63 format after saving."}
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60"
            disabled={loading || !hasChanges || (showPhone && !isPhoneValid)}
          >
            {loading ? "Saving..." : "Save Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
