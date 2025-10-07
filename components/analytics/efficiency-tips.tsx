import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, TrendingUp, AlertCircle } from 'lucide-react'
import { PondData } from '@/lib/pond-service'

interface EfficiencyTipsProps {
  pond: PondData
}

const generateTips = (pond: PondData) => {
  const tips = []
  const stockingDensity = pond.fishCount / pond.area

  // Feeding frequency tips
  if (pond.feedingFrequency < 2) {
    tips.push({
      type: 'optimization',
      title: 'Increase Feeding Frequency',
      description: `Consider feeding ${pond.fishSpecies} 2-3 times daily for better growth rates`,
      impact: 'High',
      pond: pond.name
    })
  } else if (pond.feedingFrequency > 4) {
    tips.push({
      type: 'alert',
      title: 'Reduce Feeding Frequency',
      description: 'Overfeeding can lead to water quality issues and waste',
      impact: 'Medium',
      pond: pond.name
    })
  }

  // Stocking density tips
  if (stockingDensity > 5) {
    tips.push({
      type: 'alert',
      title: 'High Stocking Density',
      description: `Current density: ${stockingDensity.toFixed(1)} fish/m². Consider reducing to improve growth`,
      impact: 'High',
      pond: pond.name
    })
  } else if (stockingDensity < 1) {
    tips.push({
      type: 'insight',
      title: 'Low Stocking Density',
      description: `Pond capacity underutilized. Current: ${stockingDensity.toFixed(1)} fish/m²`,
      impact: 'Medium',
      pond: pond.name
    })
  }

  // Species-specific tips
  if (pond.fishSpecies === 'Tilapia') {
    tips.push({
      type: 'optimization',
      title: 'Optimal Temperature for Tilapia',
      description: 'Maintain water temperature between 26-30°C for best growth rates',
      impact: 'Medium',
      pond: pond.name
    })
  } else if (pond.fishSpecies === 'Catfish') {
    tips.push({
      type: 'insight',
      title: 'Catfish Growth Optimization',
      description: 'Catfish grow well in slightly warmer water (24-28°C) with good aeration',
      impact: 'Medium',
      pond: pond.name
    })
  }

  // Default tip if no specific recommendations
  if (tips.length === 0) {
    tips.push({
      type: 'insight',
      title: 'Optimal Conditions Maintained',
      description: `${pond.name} shows good feeding frequency and stocking density for ${pond.fishSpecies}`,
      impact: 'Low',
      pond: pond.name
    })
  }

  return tips
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'optimization': return Lightbulb
    case 'alert': return AlertCircle
    case 'insight': return TrendingUp
    default: return Lightbulb
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'optimization': return 'text-green-600'
    case 'alert': return 'text-yellow-600'
    case 'insight': return 'text-blue-600'
    default: return 'text-gray-600'
  }
}

const getImpactColor = (impact: string) => {
  switch (impact) {
    case 'High': return 'bg-red-100 text-red-800'
    case 'Medium': return 'bg-yellow-100 text-yellow-800'
    case 'Low': return 'bg-green-100 text-green-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function EfficiencyTips({ pond }: EfficiencyTipsProps) {
  const tips = generateTips(pond)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Efficiency Tips & Alerts - {pond.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tips.map((tip, index) => {
            const Icon = getTypeIcon(tip.type)
            return (
              <div key={index} className="flex items-start space-x-3 p-4 border rounded-lg">
                <Icon className={`h-5 w-5 mt-0.5 ${getTypeColor(tip.type)}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{tip.title}</h3>
                    <div className="flex items-center space-x-2">
                      <Badge className={getImpactColor(tip.impact)}>
                        {tip.impact} Impact
                      </Badge>
                      <Badge variant="outline">{tip.pond}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{tip.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
