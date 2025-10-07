"use client"

import { useState } from 'react'
import { SignInForm } from './signin-form'
import { SignUpForm } from './signup-form'
import { ResetPasswordForm } from './reset-password-form'
import { Fish } from 'lucide-react'

type AuthMode = 'signin' | 'signup' | 'reset'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Fish className="h-12 w-12 text-cyan-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">AQUAFORECAST</h1>
          <p className="text-gray-600 mt-2">IoT Fish Pond Analytics Platform</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {mode === 'signin' && (
            <SignInForm 
              onSignUpClick={() => setMode('signup')}
              onResetClick={() => setMode('reset')}
            />
          )}
          {mode === 'signup' && (
            <SignUpForm onSignInClick={() => setMode('signin')} />
          )}
          {mode === 'reset' && (
            <ResetPasswordForm onBackClick={() => setMode('signin')} />
          )}
        </div>
      </div>
    </div>
  )
}
