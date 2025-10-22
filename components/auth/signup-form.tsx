"use client"

import type React from "react"
import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Eye, EyeOff } from "lucide-react"

interface SignUpFormProps {
  onSignInClick: () => void
}

export function SignUpForm({ onSignInClick }: SignUpFormProps) {
  const [studentId, setStudentId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const { signUp } = useAuth()

  const [showConfirm, setShowConfirm] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    const trimmedId = studentId.trim()
    if (!trimmedId) { setError("Student ID is required."); return }
    if (!/^[0-9\-]+$/.test(trimmedId)) { setError("Student ID must contain only numbers and dashes."); return }
    if (trimmedId.length < 5) { setError("Student ID is too short."); return }

    const usernamePart = email.split("@")[0]
    if (usernamePart.length < 6 || usernamePart.length > 30) {
      setError("Email username must be between 6 and 30 characters before @.")
      return
    }
    if (password !== confirmPassword) { setError("Passwords do not match."); return }
    if (password.length < 6) { setError("Password must be at least 6 characters long."); return }

    setShowConfirm(true)
  }

  const confirmSignup = async () => {
    setShowConfirm(false)
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      await signUp(email, password, studentId.trim())
      setSuccess("Account created successfully! Please wait for admin approval before accessing the dashboard.")
    } catch (error: any) {
      if (error?.code === "student-id-already-in-use") setError("This Student ID is already registered.")
      else if (error?.code === "auth/email-already-in-use") setError("An account with this email already exists.")
      else if (error?.code === "auth/invalid-email") setError("Invalid email address.")
      else if (error?.code === "auth/weak-password") setError("Password is too weak.")
      else setError("Failed to create account. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-2xl font-bold text-center mb-6">Sign Up</h2>
      {error && (<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>)}
      {success && (<Alert className="border-green-200 bg-green-50"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>)}

      <div className="space-y-2">
        <Label htmlFor="studentId">Student ID</Label>
        <Input id="studentId" type="text" inputMode="numeric" placeholder="e.g. 22-12345" value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" className="absolute right-3 top-1/2 transform -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="Confirm your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700" disabled={loading}>{loading ? "Creating Account..." : "Sign Up"}</Button>
      <div className="text-center text-sm text-gray-600">Already have an account? <button type="button" onClick={onSignInClick} className="text-cyan-600 hover:underline font-medium">Sign in</button></div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Email</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to create this account with email: {email}?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={confirmSignup} disabled={loading}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
