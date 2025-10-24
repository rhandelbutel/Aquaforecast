import { PondData } from '@/lib/pond-service'
import { FeedCalculator } from './feed-calculator'
import { StockingDensity } from './stocking-density'
import { WaterVolume } from './water-volume'
import { GrowthRate } from './growth-rate'
// import { CalculationsExport } from './calculations-export'

interface CalculationsWithPondsProps {
  ponds: PondData[]
}

export function CalculationsWithPonds({ ponds }: CalculationsWithPondsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Calculations</h1>
          <p className="text-gray-600 mt-1">Essential aquaculture calculations and tools</p>
        </div>
        {/* <CalculationsExport /> */}
      </div>

      <div className="space-y-6">
        <FeedCalculator ponds={ponds} />
        <StockingDensity ponds={ponds} />
        <WaterVolume ponds={ponds} />
        <GrowthRate ponds={ponds} />
      </div>
    </div>
  )
}
