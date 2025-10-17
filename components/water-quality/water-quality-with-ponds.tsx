import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BarChart3 } from 'lucide-react'

import { PondData } from '@/lib/pond-service'
import { ParameterCards } from './parameter-cards'
import { WaterQualityCharts } from './water-quality-charts'
import { ExportData } from './export-data'
import { Ingestor } from "./ingestor"

interface WaterQualityWithPondsProps {
  ponds: PondData[]
}

export function WaterQualityWithPonds({ ponds }: WaterQualityWithPondsProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Water Quality</h1>
          <p className="text-gray-600 mt-1">Detailed parameter monitoring and analysis</p>
        </div>

        {/* Right: stacked actions */}
        <div className="flex flex-col items-end gap-2">
          <ExportData />
          <Link href="/water-quality/history">
            <Button variant="secondary" className="inline-flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Trends
            </Button>
          </Link>
        </div>
      </div>

      {/* Per-pond sections */}
      {ponds.map((pond) => {
        // ✅ Always use the shared/admin pond id for ingestion & metrics
        const effectivePondId = pond.adminPondId ?? pond.id!

        return (
          <div key={pond.id} className="space-y-4">
            {/* Hidden background poster that feeds Firestore (every 30s) */}
            <Ingestor pondId={effectivePondId} />

            <h2 className="text-xl font-semibold text-gray-900">
              {pond.name} - {pond.fishSpecies}
            </h2>
            <ParameterCards pondId={effectivePondId} />
            <WaterQualityCharts pondId={effectivePondId} />
          </div>
        )
      })}
    </div>
  )
}
