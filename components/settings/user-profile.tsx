// components/settings/user-profile.tsx
"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
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

const sanitizePhone = (v: string) => v.replace(/[^\d+]/g, "").slice(0, 13)
const isPhoneValid = (v: string) =>
  v.length === 0 || /^\+639\d{9}$/.test(v) || /^09\d{9}$/.test(v)
const normalizeToDisplay = (v: string) => (v?.startsWith("09") ? "+63" + v.slice(1) : v ?? "")
const normalizeToSave = (v: string) => (v?.startsWith("09") ? "+63" + v.slice(1) : v ?? "")

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function UserProfile() {
  const { user } = useAuth()
  const { userProfile } = useUser()
  const { toast } = useToast()

  const isAdmin = userProfile?.role === "admin"
  const showFullName = !isAdmin
  const showPhone = true

  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  // Non-admin single phone
  const [phone, setPhone] = useState("")
  const singlePhoneRef = useRef<HTMLInputElement | null>(null)
  const [singleEditing, setSingleEditing] = useState(false)

  // Admin 4 fixed phones (2×2 grid)
  const FIXED_COUNT = 4
  const [adminPhones, setAdminPhones] = useState<string[]>(Array(FIXED_COUNT).fill(""))
  const [adminErrors, setAdminErrors] = useState<(string | null)[]>(Array(FIXED_COUNT).fill(null))
  const [adminEditing, setAdminEditing] = useState<boolean[]>(Array(FIXED_COUNT).fill(false))
  const adminRefs = useRef<HTMLInputElement[]>([])

  // Originals
  const originalFullName = userProfile?.fullName ?? ""
  const originalPhone = userProfile?.phone ?? ""
  const originalPhoneNumbers = useMemo<string[]>(
    () =>
      Array.isArray((userProfile as any)?.phoneNumbers)
        ? ((userProfile as any).phoneNumbers as string[])
        : originalPhone
        ? [originalPhone]
        : [],
    [userProfile?.phoneNumbers, originalPhone]
  )
  const originalPhoneNumbersDisplay = useMemo(
    () => originalPhoneNumbers.map(normalizeToDisplay),
    [originalPhoneNumbers]
  )

  useEffect(() => {
    setFullName(originalFullName)

    if (isAdmin) {
      const base = originalPhoneNumbersDisplay.length
        ? originalPhoneNumbersDisplay
        : originalPhone
        ? [normalizeToDisplay(originalPhone)]
        : [""]

      const padded = [...base.slice(0, FIXED_COUNT)]
      while (padded.length < FIXED_COUNT) padded.push("")
      setAdminPhones(padded)
      setAdminErrors(Array(FIXED_COUNT).fill(null))
      setAdminEditing(Array(FIXED_COUNT).fill(false)) // lock all by default
    } else {
      const singleDisplay = originalPhone ? normalizeToDisplay(originalPhone) : ""
      setPhone(singleDisplay)
      setSingleEditing(false) // locked by default
    }
  }, [isAdmin, originalFullName, originalPhone, originalPhoneNumbersDisplay])

  const singlePhoneValid = isPhoneValid(phone)
  const adminAllValid = useMemo(() => adminPhones.every(isPhoneValid), [adminPhones])

  const hasChanges = useMemo(() => {
    const nameChanged = showFullName && fullName.trim() !== originalFullName.trim()

    if (isAdmin) {
      const current = adminPhones.map((p) => p || "")
      const prevPadded = [...originalPhoneNumbersDisplay.slice(0, FIXED_COUNT)]
      while (prevPadded.length < FIXED_COUNT) prevPadded.push("")
      return nameChanged || !arraysEqual(current, prevPadded)
    } else {
      const phoneChanged = showPhone && phone !== (originalPhone ? normalizeToDisplay(originalPhone) : "")
      return nameChanged || phoneChanged
    }
  }, [
    showFullName,
    fullName,
    isAdmin,
    adminPhones,
    showPhone,
    phone,
    originalFullName,
    originalPhone,
    originalPhoneNumbersDisplay,
  ])

  // Handlers
  const onSinglePhoneChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setPhone(sanitizePhone(e.target.value))
  }
  const onAdminPhoneChange = (idx: number, value: string) => {
    setAdminPhones((prev) => {
      const next = [...prev]
      next[idx] = sanitizePhone(value)
      return next
    })
  }

  const validateAdminPhones = (): { ok: boolean; normalized: string[] } => {
    const errs: (string | null)[] = Array(FIXED_COUNT).fill(null)
    let atLeastOneValid = false

    const normalized = adminPhones.map((p, i) => {
      if (!p) return "" // empty allowed
      if (!isPhoneValid(p)) {
        errs[i] = "Invalid format"
        return ""
      }
      atLeastOneValid = true
      return normalizeToSave(p)
    })

    if (!atLeastOneValid) errs[0] = errs[0] ?? "At least one number is required"

    setAdminErrors(errs)
    return { ok: atLeastOneValid && errs.every((e) => e === null), normalized: normalized.filter(Boolean) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !hasChanges) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const updates: UpdatableProfile = {}

      if (showFullName) {
        const cleaned = fullName.trim()
        if (cleaned) updates.fullName = cleaned
        else if (originalFullName) updates.fullName = null
      }

      if (isAdmin) {
        const { ok, normalized } = validateAdminPhones()
        if (!ok) {
          setLoading(false)
          setError("Please fix the highlighted phone numbers.")
          return
        }
        ;(updates as any).phoneNumbers = normalized
        updates.phone = normalized[0] ?? null // legacy sync
      } else {
        if (!singlePhoneValid) {
          setLoading(false)
          setError("Invalid phone format.")
          return
        }
        const normalized = phone ? normalizeToSave(phone) : ""
        if (normalized) updates.phone = normalized
        else if (originalPhone) updates.phone = null
      }

      await updateUserProfile(user.uid, updates)

      setSuccess("Profile updated successfully!")
      toast({ title: "Saved", description: "Your profile changes have been saved." })

      // lock back after save
      setAdminEditing((eds) => eds.map(() => false))
      setSingleEditing(false)
    } catch (err) {
      console.error("Error updating profile:", err)
      setError("Failed to update profile. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Helpers to toggle edit & focus
  const enableSingleEdit = () => {
    setSingleEditing(true)
    setTimeout(() => singlePhoneRef.current?.focus(), 0)
  }
  const enableAdminEdit = (idx: number) => {
    setAdminEditing((prev) => {
      const next = [...prev]
      next[idx] = true
      return next
    })
    setTimeout(() => adminRefs.current[idx]?.focus(), 0)
  }

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

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email || ""} disabled className="bg-gray-50" />
            <p className="text-xs text-gray-500">Email cannot be changed</p>
          </div>

          {/* Admin: four fixed phone numbers (2×2 grid) */}
          {isAdmin && showPhone && (
            <div className="space-y-3">
              <Label>Admin Phone Numbers (for GSM alerts)</Label>
              <p className="text-xs text-gray-500">
                Format: <code>09XXXXXXXXX</code> or <code>+639XXXXXXXXX</code>. Unused fields can be left blank.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: FIXED_COUNT }).map((_, i) => {
                  const err = adminErrors[i]
                  const disabled = !adminEditing[i]
                  return (
                    <div key={i} className="space-y-1">
                      <Label htmlFor={`admin-phone-${i}`}>Phone #{i + 1}</Label>

                      <div className="relative">
                        {/* Edit button (left inside input) */}
                        {!adminEditing[i] && (
                          <button
                            type="button"
                            onClick={() => enableAdminEdit(i)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 z-20"
                            aria-label={`Edit phone #${i + 1}`}
                            title={`Edit phone #${i + 1}`}
                          >
                            <Pencil className="h-4 w-4 text-gray-600" />
                          </button>
                        )}

                        <Input
                          ref={(el) => {
                            if (el) adminRefs.current[i] = el
                          }}
                          id={`admin-phone-${i}`}
                          type="tel"
                          inputMode="tel"
                          maxLength={13}
                          placeholder="+639XXXXXXXXX"
                          value={adminPhones[i] ?? ""}
                          onChange={(e) => onAdminPhoneChange(i, e.target.value)}
                          aria-invalid={!!err}
                          disabled={disabled}
                          className={[
                            err ? "border-red-500 focus-visible:ring-red-500" : "",
                            disabled ? "pl-10 cursor-default bg-gray-50" : "",
                          ].join(" ")}
                        />
                      </div>

                      {err && <p className="text-xs text-red-600">{err}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Non-admin: single phone with edit icon */}
          {!isAdmin && showPhone && (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                {!singleEditing && (
                  <button
                    type="button"
                    onClick={enableSingleEdit}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 z-20"
                    aria-label="Edit phone"
                    title="Edit phone"
                  >
                    <Pencil className="h-4 w-4 text-gray-600" />
                  </button>
                )}

                <Input
                  ref={singlePhoneRef}
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={13}
                  placeholder="+639XXXXXXXXX"
                  value={phone}
                  onChange={onSinglePhoneChange}
                  aria-invalid={!singlePhoneValid}
                  disabled={!singleEditing}
                  className={[
                    !singlePhoneValid ? "border-red-500 focus-visible:ring-red-500" : "",
                    !singleEditing ? "pl-10 cursor-default bg-gray-50" : "",
                  ].join(" ")}
                />
              </div>

              {!singlePhoneValid && <p className="text-xs text-red-600">Invalid format</p>}
            </div>
          )}


          <Button
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60"
            disabled={loading || !hasChanges || (isAdmin ? !adminAllValid : !singlePhoneValid)}
          >
            {loading ? "Saving..." : "Save Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
