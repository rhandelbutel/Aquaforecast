"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calculator } from 'lucide-react'

export function FeedCalculator() {
  const [fishWeight, setFishWeight] = useState('')
  const [fishCount, setFishCount] = useState('')
  const [feedingRate, setFeedingRate] = useState('3')
  const [result, setResult] = useState<number | null>(null)

  const calculateFeed = () => {
    const weight = parseFloat(fishWeight)
    const count = parseInt(fishCount)
    const rate = parseFloat(feedingRate)
    
    if (weight && count && rate) {
      const totalBiomass = (weight * count) / 1000 
      const dailyFeed = totalBiomass * (rate / 100)
      setResult(dailyFeed)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calculator className="h-5 w-5 mr-2 text-cyan-600" />
          Feed Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fish-weight">Average Fish Weight (g)</Label>
            <Input
              id="fish-weight"
              type="number"
              placeholder="250"
              value={fishWeight}
              onChange={(e) => setFishWeight(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fish-count">Number of Fish</Label>
            <Input
              id="fish-count"
              type="number"
              placeholder="1000"
              value={fishCount}
              onChange={(e) => setFishCount(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="feeding-rate">Feeding Rate (% of body weight)</Label>
          <Input
            id="feeding-rate"
            type="number"
            step="0.1"
            placeholder="3.0"
            value={feedingRate}
            onChange={(e) => setFeedingRate(e.target.value)}
          />
        </div>
        
        <Button onClick={calculateFeed} className="w-full bg-cyan-600 hover:bg-cyan-700">
          Calculate Daily Feed
        </Button>
        
        {result !== null && (
          <div className="p-4 bg-cyan-50 rounded-lg">
            <h3 className="font-semibold text-cyan-900">Daily Feed Requirement</h3>
            <p className="text-2xl font-bold text-cyan-700">{result.toFixed(2)} kg</p>
            <p className="text-sm text-cyan-600 mt-1">
              Per feeding: {(result / 2).toFixed(2)} kg (assuming 2 feedings per day)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
