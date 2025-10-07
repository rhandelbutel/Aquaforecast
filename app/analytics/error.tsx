'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Growth Analytics</h1>
        <p className="text-gray-600 mt-1">Predictive insights for optimal harvest timing</p>
      </div>

      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 mb-4">Failed to load analytics</h2>
          <p className="text-gray-600 mb-6">
            There was an error loading the growth analytics data. Please try again.
          </p>
          <Button 
            onClick={reset}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            Retry
          </Button>
        </div>
      </div>
    </div>
  )
}
