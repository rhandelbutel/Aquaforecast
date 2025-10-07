"use client"

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Waves } from 'lucide-react'
import { AddPondModal } from './add-pond-modal'

export function EmptyPonds() {
  const [showAddPond, setShowAddPond] = useState(false)

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pond Overview</h1>
            <p className="text-gray-600 mt-1">Monitor all your fish ponds</p>
          </div>
          <Button 
            className="bg-cyan-600 hover:bg-cyan-700"
            onClick={() => setShowAddPond(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Pond
          </Button>
        </div>

        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Waves className="h-16 w-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Ponds Added Yet</h3>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              Add your first pond to start monitoring water quality and fish growth. 
              Our AI will help optimize harvest timing based on your pond data.
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
