"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TrendingUp } from 'lucide-react'

export function GrowthRate() {
  const [initialWeight, setInitialWeight] = useState('')
  const [finalWeight, setFinalWeight] = useState('')
  const [days, setDays] = useState('')
  const [result, setResult] = useState<{ sgr: number; adg: number } | null>(null)

  const calculateGrowth = () => {
    const initial = parseFloat(initialWeight)
    const final = parseFloat(finalWeight)
    const period = parseInt(days)
    
    if (initial && final && period) {
      // Specific Growth Rate (SGR) = (ln(final weight) - ln(initial weight)) / days * 100
      const sgr = ((Math.log(final) - Math.log(initial)) / period) * 100
      
      // Average Daily Gain (ADG) = (final weight - initial weight) / days
      const adg = (final - initial) / period
      
      setResult({ sgr, adg })
    }
  }

  const getGrowthStatus = (sgr: number) => {
    if (sgr >= 3) return { status: 'Excellent', color: 'text-green-700', bg: 'bg-green-50' }
    if (sgr >= 2) return { status: 'Good', color: 'text-blue-700', bg: 'bg-blue-50' }
    if (sgr >= 1) return { status: 'Average', color: 'text-yellow-700', bg: 'bg-yellow-50' }
    return { status: 'Poor', color: 'text-red-700', bg: 'bg-red-50' }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-cyan-600" />
          Growth Rate Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="initial-weight">Initial Weight (g)</Label>
            <Input
              id="initial-weight"
              type="number"
              placeholder="50"
              value={initialWeight}
              onChange={(e) => setInitialWeight(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="final-weight">Final Weight (g)</Label>
            <Input
              id="final-weight"
              type="number"
              placeholder="250"
              value={finalWeight}
              onChange={(e) => setFinalWeight(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="growth-days">Growth Period (days)</Label>
          <Input
            id="growth-days"
            type="number"
            placeholder="60"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        
        <Button onClick={calculateGrowth} className="w-full bg-cyan-600 hover:bg-cyan-700">
          Calculate Growth Rate
        </Button>
        
        {result !== null && (
          <div className={`p-4 rounded-lg ${getGrowthStatus(result.sgr).bg}`}>
            <h3 className={`font-semibold ${getGrowthStatus(result.sgr).color}`}>
              Growth Performance: {getGrowthStatus(result.sgr).status}
            </h3>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <p className={`text-lg font-bold ${getGrowthStatus(result.sgr).color}`}>
                  {result.sgr.toFixed(2)}%
                </p>
                <p className={`text-sm ${getGrowthStatus(result.sgr).color}`}>
                  Specific Growth Rate (SGR)
                </p>
              </div>
              <div>
                <p className={`text-lg font-bold ${getGrowthStatus(result.sgr).color}`}>
                  {result.adg.toFixed(2)}g
                </p>
                <p className={`text-sm ${getGrowthStatus(result.sgr).color}`}>
                  Average Daily Gain (ADG)
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
