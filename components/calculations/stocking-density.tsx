"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Fish } from 'lucide-react'

export function StockingDensity() {
  const [pondArea, setPondArea] = useState('')
  const [fishCount, setFishCount] = useState('')
  const [result, setResult] = useState<number | null>(null)

  const calculateDensity = () => {
    const area = parseFloat(pondArea)
    const count = parseInt(fishCount)
    
    if (area && count) {
      const density = count / area
      setResult(density)
    }
  }

  const getDensityStatus = (density: number) => {
    if (density <= 2) return { status: 'Low', color: 'text-green-700', bg: 'bg-green-50' }
    if (density <= 5) return { status: 'Optimal', color: 'text-blue-700', bg: 'bg-blue-50' }
    if (density <= 8) return { status: 'High', color: 'text-yellow-700', bg: 'bg-yellow-50' }
    return { status: 'Too High', color: 'text-red-700', bg: 'bg-red-50' }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Fish className="h-5 w-5 mr-2 text-cyan-600" />
          Stocking Density Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pond-area">Pond Area (m²)</Label>
            <Input
              id="pond-area"
              type="number"
              placeholder="1000"
              value={pondArea}
              onChange={(e) => setPondArea(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fish-count-density">Number of Fish</Label>
            <Input
              id="fish-count-density"
              type="number"
              placeholder="3000"
              value={fishCount}
              onChange={(e) => setFishCount(e.target.value)}
            />
          </div>
        </div>
        
        <Button onClick={calculateDensity} className="w-full bg-cyan-600 hover:bg-cyan-700">
          Calculate Stocking Density
        </Button>
        
        {result !== null && (
          <div className={`p-4 rounded-lg ${getDensityStatus(result).bg}`}>
            <h3 className={`font-semibold ${getDensityStatus(result).color}`}>
              Stocking Density: {getDensityStatus(result).status}
            </h3>
            <p className={`text-2xl font-bold ${getDensityStatus(result).color}`}>
              {result.toFixed(2)} fish/m²
            </p>
            <p className={`text-sm mt-1 ${getDensityStatus(result).color}`}>
              Recommended: 2-5 fish/m² for optimal growth
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
