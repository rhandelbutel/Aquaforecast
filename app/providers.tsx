"use client"

import type React from "react"
import dynamic from "next/dynamic"

const AuthProvider = dynamic(
  () => import("@/lib/auth-context").then((m) => m.AuthProvider),
  { ssr: false }
)

const AuthWrapper = dynamic(
  () => import("@/components/auth/auth-wrapper").then((m) => m.AuthWrapper),
  { ssr: false }
)

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (typeof window !== "undefined") {
    // Best-effort recovery for transient dev-time chunk load errors
    // Avoid infinite loops by only reloading once per session
    const key = "__reloaded_on_chunk_error__"
    if (!(window as any)[key]) {
      const reloadOnChunkError = (message?: string) =>
        message && message.includes("ChunkLoadError") && ((window as any)[key] = true, window.location.reload())

      window.addEventListener("error", (e: Event) => {
        const err = e as unknown as { message?: string }
        reloadOnChunkError(err?.message)
      })

      window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
        const reason = (e && (e.reason as any)) || {}
        const msg = typeof reason === "string" ? reason : reason?.message
        reloadOnChunkError(msg)
      })
    }
  }
  return (
    <AuthProvider>
      <AuthWrapper>{children}</AuthWrapper>
    </AuthProvider>
  )
}


