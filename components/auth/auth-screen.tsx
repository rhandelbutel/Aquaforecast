"use client"

import { useState } from "react"
import Image from "next/image"
import { SignInForm } from "./signin-form"
import { SignUpForm } from "./signup-form"
import { ResetPasswordForm } from "./reset-password-form"

type AuthMode = "signin" | "signup" | "reset"

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin")

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            {/* Responsive logo size: 64px on mobile, 80px on md+ */}
            <div className="relative h-16 w-16 md:h-20 md:w-20">
              <Image
                src="/Aquaforecast_logo1.png"
                alt="AquaForecast logo"
                fill
                sizes="(min-width: 768px) 80px, 64px"
                className="object-contain"
                priority
              />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900">AQUAFORECAST</h1>
          <p className="text-gray-600 mt-2">IoT Fish Pond Analytics Platform</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {mode === "signin" && (
            <SignInForm
              onSignUpClick={() => setMode("signup")}
              onResetClick={() => setMode("reset")}
            />
          )}
          {mode === "signup" && <SignUpForm onSignInClick={() => setMode("signin")} />}
          {mode === "reset" && <ResetPasswordForm onBackClick={() => setMode("signin")} />}
        </div>
      </div>
    </div>
  )
}
