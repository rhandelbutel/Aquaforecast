//components/analytics/harvest-forecast.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Fish } from 'lucide-react'
import { PondData } from '@/lib/pond-service'

interface HarvestForecastProps {
  pond: PondData
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ready-soon': return 'bg-green-100 text-green-800'
    case 'on-track': return 'bg-blue-100 text-blue-800'
    case 'delayed': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'ready-soon': return 'Ready Soon'
    case 'on-track': return 'On Track'
    case 'delayed': return 'Delayed'
    default: return 'Unknown'
  }
}

// Generate forecast based on pond data
const generateForecast = (pond: PondData) => {
  // Simple ML simulation based on feeding frequency and stocking density
  const stockingDensity = pond.fishCount / pond.area
  const feedingScore = pond.feedingFrequency >= 2 ? 1 : 0.8
  const densityScore = stockingDensity <= 3 ? 1 : stockingDensity <= 5 ? 0.9 : 0.7
  
  const readiness = Math.min(95, Math.floor((feedingScore * densityScore * 85) + Math.random() * 10))
  const daysToHarvest = Math.max(7, Math.floor((100 - readiness) * 2))
  const expectedYield = Math.floor(pond.fishCount * 0.25 * (readiness / 100)) // Assuming 250g average weight
  
  const estimatedDate = new Date()
  estimatedDate.setDate(estimatedDate.getDate() + daysToHarvest)
  
  let status = 'on-track'
  if (readiness >= 90) status = 'ready-soon'
  else if (readiness < 70) status = 'delayed'

  return {
    readiness,
    estimatedDate: estimatedDate.toISOString().split('T')[0],
    expectedYield: `${expectedYield} kg`,
    status
  }
}

export function HarvestForecast({ pond }: HarvestForecastProps) {
  const forecast = generateForecast(pond)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-cyan-600" />
          Harvest Forecast - {pond.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-md">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{pond.name}</h3>
              <Badge className={getStatusColor(forecast.status)}>
                {getStatusText(forecast.status)}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Readiness</span>
                <span className="font-medium">{forecast.readiness}%</span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-cyan-600 h-2 rounded-full" 
                  style={{ width: `${forecast.readiness}%` }}
                ></div>
              </div>
              
              <div className="flex items-center text-sm text-gray-600 mt-3">
                <Calendar className="h-4 w-4 mr-1" />
                {forecast.estimatedDate}
              </div>
              
              <div className="flex items-center text-sm text-gray-600">
                <Fish className="h-4 w-4 mr-1" />
                {forecast.expectedYield}
              </div>
              
              <div className="text-xs text-gray-500 mt-2">
                Based on {pond.fishSpecies} growth patterns, feeding {pond.feedingFrequency}x daily
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
