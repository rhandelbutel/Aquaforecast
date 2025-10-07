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
  const { userProfile, refreshProfile } = useUser()
  const { toast } = useToast()

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("") // always store digits-only here
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const phoneRef = useRef<HTMLInputElement | null>(null)

  const originalPhone = (userProfile?.phone ?? "").replace(/\D/g, "")
  const originalFullName = userProfile?.fullName ?? ""

  // --- helpers ---
  const sanitizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 11)
  const isPhoneEmpty = phone.length === 0
  const isPhoneValid = isPhoneEmpty || /^\d{11}$/.test(phone) // allow empty (to clear), else exactly 11 digits

  useEffect(() => {
    if (!userProfile) return
    setFullName(originalFullName)
    setPhone(originalPhone) // keep digits only

    const hasSavedPhone = originalPhone.length > 0
    setIsEditingPhone(!hasSavedPhone) // if saved, start locked; otherwise editable
  }, [userProfile, originalFullName, originalPhone])

  useEffect(() => {
    if (isEditingPhone) {
      setTimeout(() => phoneRef.current?.focus(), 0)
    }
  }, [isEditingPhone])

  const hasChanges = useMemo(() => {
    return fullName.trim() !== originalFullName.trim() || phone !== originalPhone
  }, [fullName, phone, originalFullName, originalPhone])

  const onPhoneChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setPhone(sanitizePhone(e.target.value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!hasChanges) return

    // block invalid phone before saving
    if (!isPhoneValid) {
      setError("Phone number must be exactly 11 digits.")
      return
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const cleanedPhone = phone // already digits-only & max 11
      const cleanedFullName = fullName.trim()

      const updates: UpdatableProfile = {}

      // fullName: set new, or clear (null) if user erased an existing one
      if (cleanedFullName.length > 0) {
        updates.fullName = cleanedFullName
      } else if ((userProfile?.fullName ?? "") !== "") {
        updates.fullName = null
      }

      // phone: set new (digits), or clear (null) if user erased an existing one
      if (cleanedPhone.length > 0) {
        updates.phone = cleanedPhone
      } else if ((userProfile?.phone ?? "") !== "") {
        updates.phone = null
      }

      await updateUserProfile(user.uid, updates)

      setSuccess("Profile updated successfully!")
      toast({ title: "Saved", description: "Your profile changes have been saved." })

      await refreshProfile()

      if (cleanedPhone.length > 0) setIsEditingPhone(false)
    } catch (err) {
      console.error("Error updating profile:", err)
      setError("Failed to update profile. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const showPhoneEditButton = !!(userProfile?.phone && userProfile.phone.trim().length > 0) && !isEditingPhone

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
              <AlertDescription className="text-green-800">{success}</AlertDescription>
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
            <Input id="email" type="email" value={user?.email || ""} disabled className="bg-gray-50" />
            <p className="text-xs text-gray-500">Email cannot be changed</p>
          </div>

          {/* Phone with edit icon */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
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
                inputMode="numeric"
                pattern="\d{11}"
                maxLength={11}
                autoComplete="tel"
                placeholder="Enter your 11-digit phone number"
                value={phone}
                onChange={onPhoneChange}
                disabled={showPhoneEditButton && !isEditingPhone}
                aria-invalid={!isPhoneValid}
                className={[
                  showPhoneEditButton && !isEditingPhone ? "pl-10" : "",
                  !isPhoneValid ? "border-red-500 focus-visible:ring-red-500" : ""
                ].join(" ")}
              />
            </div>
            <p className={`text-xs ${!isPhoneValid ? "text-red-600" : "text-gray-500"}`}>
              {showPhoneEditButton && !isEditingPhone
                ? "Tap the pencil to edit your saved number"
                : "Only digits allowed. Must be exactly 11 digits (e.g., 09XXXXXXXXX)."}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60"
            disabled={loading || !hasChanges || !isPhoneValid}
          >
            {loading ? "Saving..." : "Save Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
