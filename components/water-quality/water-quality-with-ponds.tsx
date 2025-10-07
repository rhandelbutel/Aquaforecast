import { PondData } from '@/lib/pond-service'
import { ParameterCards } from './parameter-cards'
import { WaterQualityCharts } from './water-quality-charts'
import { ExportData } from './export-data'

interface WaterQualityWithPondsProps {
  ponds: PondData[]
}

export function WaterQualityWithPonds({ ponds }: WaterQualityWithPondsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Water Quality</h1>
          <p className="text-gray-600 mt-1">Detailed parameter monitoring and analysis</p>
        </div>
        <ExportData />
      </div>

      {ponds.map((pond) => (
        <div key={pond.id} className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {pond.name} - {pond.fishSpecies}
          </h2>
          <ParameterCards pondId={pond.id!} />
          <WaterQualityCharts pondId={pond.id!} />
        </div>
      ))}
    </div>
  )
}
