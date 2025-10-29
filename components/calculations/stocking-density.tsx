"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Fish } from "lucide-react"
import { PondData } from "@/lib/pond-service"

interface StockingDensityProps {
  ponds: PondData[]
}

const LIMITS = {
  pondArea: { min: 1, max: 10000, step: 1 },    // 1–10,000 m²
  fishCount: { min: 1, max: 10000, step: 1 },  // 1–10,000 fish
}

export function StockingDensity({ ponds }: StockingDensityProps) {
  const [pondArea, setPondArea] = useState("")
  const [fishCount, setFishCount] = useState("")
  const [result, setResult] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ area?: string; count?: string }>({})

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
  const numOrNaN = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")))
  const formatWithCommas = (n: number) => n.toLocaleString("en-US")

  const handleInput = (
    raw: string,
    setValue: (val: string) => void,
    { min, max }: { min: number; max: number },
    allowDecimal: boolean,
    formatCommas = false
  ) => {
    const regex = allowDecimal ? /^[0-9]*\.?[0-9]*$/ : /^[0-9,]*$/
    if (raw === "" || regex.test(raw)) {
      if (raw === "") {
        setValue("")
        return
      }
      const num = Number(raw.replace(/,/g, ""))
      if (!Number.isNaN(num)) {
        const clamped = clamp(num, min, max)
        setValue(formatCommas ? formatWithCommas(clamped) : String(clamped))
      }
    }
  }

  const validateAll = () => {
    const a = numOrNaN(pondArea)
    const c = numOrNaN(fishCount)
    const next: typeof errors = {}
    if (Number.isNaN(a) || a < LIMITS.pondArea.min || a > LIMITS.pondArea.max)
      next.area = `Area must be ${LIMITS.pondArea.min}–${LIMITS.pondArea.max} m²`
    if (Number.isNaN(c) || c < LIMITS.fishCount.min || c > LIMITS.fishCount.max)
      next.count = `Fish count must be ${LIMITS.fishCount.min}–${LIMITS.fishCount.max}`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const canCalculate = useMemo(() => {
    const a = numOrNaN(pondArea)
    const c = numOrNaN(fishCount)
    return (
      !Number.isNaN(a) &&
      !Number.isNaN(c) &&
      a >= LIMITS.pondArea.min &&
      a <= LIMITS.pondArea.max &&
      c >= LIMITS.fishCount.min &&
      c <= LIMITS.fishCount.max
    )
  }, [pondArea, fishCount])

  const calculateDensity = () => {
    if (!validateAll()) {
      setResult(null)
      return
    }
    const area = numOrNaN(pondArea)
    const count = numOrNaN(fishCount)
    setResult(count / area)
  }

  const getDensityStatus = (density: number) => {
    if (density <= 2) return { status: "Low", color: "text-green-700", bg: "bg-green-50" }
    if (density <= 5) return { status: "Optimal", color: "text-blue-700", bg: "bg-blue-50" }
    if (density <= 8) return { status: "High", color: "text-yellow-700", bg: "bg-yellow-50" }
    return { status: "Too High", color: "text-red-700", bg: "bg-red-50" }
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
          {/* Pond Area */}
          <div className="space-y-2">
            <Label htmlFor="pond-area">Pond Area (m²)</Label>
            <Input
              id="pond-area"
              type="text"
              inputMode="decimal"
              placeholder="1,000"
              value={pondArea}
              onChange={(e) =>
                handleInput(e.target.value, setPondArea, LIMITS.pondArea, true, true)
              }
              onBlur={() => {
                if (pondArea.trim() === "") {
                  setPondArea("")
                  validateAll()
                  return
                }
                const num = clamp(numOrNaN(pondArea), LIMITS.pondArea.min, LIMITS.pondArea.max)
                setPondArea(formatWithCommas(num))
                validateAll()
              }}
            />
            {errors.area && <p className="text-sm text-red-600">{errors.area}</p>}
          </div>

          {/* Fish Count */}
          <div className="space-y-2">
            <Label htmlFor="fish-count-density">Number of Fish</Label>
            <Input
              id="fish-count-density"
              type="text"
              inputMode="numeric"
              placeholder="3,000"
              value={fishCount}
              onChange={(e) =>
                handleInput(e.target.value, setFishCount, LIMITS.fishCount, false, true)
              }
              onBlur={() => {
                if (fishCount.trim() === "") {
                  setFishCount("")
                  validateAll()
                  return
                }
                const num = clamp(numOrNaN(fishCount), LIMITS.fishCount.min, LIMITS.fishCount.max)
                setFishCount(formatWithCommas(num))
                validateAll()
              }}
            />
            {errors.count && <p className="text-sm text-red-600">{errors.count}</p>}
          </div>
        </div>

        <Button
          onClick={calculateDensity}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
          disabled={!canCalculate}
        >
          Calculate Stocking Density
        </Button>

        {result !== null && (
          <div className={`p-4 rounded-lg ${getDensityStatus(result).bg}`}>
            <h3 className={`font-semibold ${getDensityStatus(result).color}`}>
              Stocking Density: {getDensityStatus(result).status}
            </h3>
            <p className={`text-2xl font-bold ${getDensityStatus(result).color}`}>
              {formatWithCommas(Number(result.toFixed(2)))} fish/m²
            </p>
            <p className={`text-sm mt-1 ${getDensityStatus(result).color}`}>
              Recommended: 2–5 fish/m² for optimal growth
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
