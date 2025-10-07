"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff } from "lucide-react"
import { isAdmin } from "@/lib/user-service"

interface SignInFormProps {
  onSignUpClick: () => void
  onResetClick: () => void
}

export function SignInForm({ onSignUpClick, onResetClick }: SignInFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const { signIn } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      console.log("Attempting to sign in with:", email)
      await signIn(email, password)

      // Check if user is admin after successful sign in
      if (isAdmin(email)) {
        console.log("Admin user detected, redirecting to admin panel")
        router.push("/admin")
      }
      // Regular users will be handled by the AuthWrapper/ApprovalChecker
    } catch (error: any) {
      console.error("Sign in error:", error)
      if (error.code === "auth/user-not-found") {
        setError("No account found with this email address. Please create an account first.")
      } else if (error.code === "auth/wrong-password") {
        setError("Incorrect password.")
      } else if (error.code === "auth/invalid-email") {
        setError("Invalid email address.")
      } else if (error.code === "auth/invalid-credential") {
        setError("Invalid email or password. Please check your credentials.")
      } else {
        setError(`Failed to sign in: ${error.message || "Please try again."}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-center mb-6">Sign In</h2>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700" disabled={loading}>
        {loading ? "Signing In..." : "Sign In"}
      </Button>

      <div className="text-center space-y-2">
        <button type="button" onClick={onResetClick} className="text-sm text-cyan-600 hover:underline">
          Forgot your password?
        </button>
        <p className="text-sm text-gray-600">
          Don't have an account?{" "}
          <button type="button" onClick={onSignUpClick} className="text-cyan-600 hover:underline font-medium">
            Sign up
          </button>
        </p>
      </div>
    </form>
  )
}
