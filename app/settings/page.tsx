"use client"

import { useSearchParams } from "next/navigation"
import { UserProfile } from "@/components/settings/user-profile"

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const pondId = searchParams.get("pond")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          Manage your account and system preferences{" "}
          {pondId && (
            <>
              {/* — <span className="font-medium">context:</span> pond <code className="text-xs">{pondId}</code> */}
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UserProfile />
        <div className="lg:col-span-2">
          {/* <PondPreferences /> */}
        </div>
      </div>
    </div>
  )
}
