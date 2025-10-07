"use client"

import { usePonds } from '@/lib/pond-context'
import { EmptyDashboard } from '@/components/dashboard/empty-dashboard'
import { DashboardWithPonds } from '@/components/dashboard/dashboard-with-ponds'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

export default function Dashboard() {
  const { ponds, loading, error } = usePonds()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor your fish pond conditions in real-time</p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (ponds.length === 0) {
    return <EmptyDashboard />
  }

 return <DashboardWithPonds />

}
