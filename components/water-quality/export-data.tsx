"use client"

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { exportToCSV } from '@/lib/export-utils'

export function ExportData() {
  const { user } = useAuth()

  const handleExport = () => {
    exportToCSV(user, false) // Don't include analytics for water quality export
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export Data
    </Button>
  )
}
