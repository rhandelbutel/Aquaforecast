"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Droplets } from 'lucide-react'

export function WaterVolume() {
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [shape, setShape] = useState('rectangular')
  const [result, setResult] = useState<number | null>(null)

  const calculateVolume = () => {
    const l = parseFloat(length)
    const w = parseFloat(width)
    const d = parseFloat(depth)
    
    if (l && w && d) {
      let volume = 0
      if (shape === 'rectangular') {
        volume = l * w * d
      } else if (shape === 'circular') {
        // For circular ponds, use length as diameter
        const radius = l / 2
        volume = Math.PI * radius * radius * d
      }
      setResult(volume)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Droplets className="h-5 w-5 mr-2 text-cyan-600" />
          Water Volume Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pond-shape">Pond Shape</Label>
          <Select value={shape} onValueChange={setShape}>
            <SelectTrigger>
              <SelectValue placeholder="Select pond shape" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rectangular">Rectangular</SelectItem>
              <SelectItem value="circular">Circular</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="length">
              {shape === 'circular' ? 'Diameter (m)' : 'Length (m)'}
            </Label>
            <Input
              id="length"
              type="number"
              placeholder="20"
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
          </div>
          
          {shape === 'rectangular' && (
            <div className="space-y-2">
              <Label htmlFor="width">Width (m)</Label>
              <Input
                id="width"
                type="number"
                placeholder="15"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="depth">Average Depth (m)</Label>
          <Input
            id="depth"
            type="number"
            step="0.1"
            placeholder="1.5"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
        </div>
        
        <Button onClick={calculateVolume} className="w-full bg-cyan-600 hover:bg-cyan-700">
          Calculate Volume
        </Button>
        
        {result !== null && (
          <div className="p-4 bg-cyan-50 rounded-lg">
            <h3 className="font-semibold text-cyan-900">Water Volume</h3>
            <p className="text-2xl font-bold text-cyan-700">{result.toLocaleString()} m³</p>
            <p className="text-sm text-cyan-600 mt-1">
              Equivalent to {(result * 1000).toLocaleString()} liters
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
