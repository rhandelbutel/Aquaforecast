//components/dashboard/empty-dashboard.tsx
"use client"

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Fish } from 'lucide-react'
import { AddPondModal } from '@/components/ponds/add-pond-modal'

export function EmptyDashboard() {
  const [showAddPond, setShowAddPond] = useState(false)

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor your fish pond conditions in real-time</p>
        </div>

        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Fish className="h-16 w-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Ponds Added Yet</h3>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              Get started by adding your first pond to begin monitoring water quality, 
              fish growth, and optimize your harvest timing with AI-powered insights.
            </p>
            <Button 
              className="bg-cyan-600 hover:bg-cyan-700"
              onClick={() => setShowAddPond(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Pond
            </Button>
          </CardContent>
        </Card>
      </div>

      <AddPondModal 
        isOpen={showAddPond}
        onClose={() => setShowAddPond(false)}
      />
    </>
  )
}
