//components/analytics/analytics-export.tsx
"use client"

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { exportToCSV } from '@/lib/export-utils'

export function AnalyticsExport() {
  const { user } = useAuth()

  const handleExport = () => {
    exportToCSV(user, true) // Include analytics for growth analytics export
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export Analytics
    </Button>
  )
}
