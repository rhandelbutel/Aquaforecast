"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TrendingUp } from "lucide-react"
import { PondData } from "@/lib/pond-service"

interface GrowthRateProps {
  ponds: PondData[]
}

// Limits
const LIMITS = {
  initial: { min: 0.1, max: 20 },   // g (fry/fingerling)
  final:   { min: 1,   max: 6000 }, // g (realistic high)
  days:    { min: 90,  max: 150 },  // 3–5 months
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const numOrNaN = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")))
const formatNum = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })

// Stage-aware performance thresholds
function getGrowthStatusStageAware(sgr: number, initial: number) {
  // Fry stage: <= 1 g
  if (initial <= 1) {
    if (sgr >= 8) return { status: "Excellent", color: "text-green-700", bg: "bg-green-50" }
    if (sgr >= 6) return { status: "Good",      color: "text-blue-700",  bg: "bg-blue-50" }
    if (sgr >= 4) return { status: "Average",   color: "text-yellow-700",bg: "bg-yellow-50" }
    return { status: "Poor", color: "text-red-700", bg: "bg-red-50" }
  }
  // Fingerling–Juvenile: >1–20 g
  if (initial <= 20) {
    if (sgr >= 5) return { status: "Excellent", color: "text-green-700", bg: "bg-green-50" }
    if (sgr >= 3) return { status: "Good",      color: "text-blue-700",  bg: "bg-blue-50" }
    if (sgr >= 2) return { status: "Average",   color: "text-yellow-700",bg: "bg-yellow-50" }
    return { status: "Poor", color: "text-red-700", bg: "bg-red-50" }
  }
  // Grow-out: >20 g
  if (sgr >= 3) return { status: "Excellent", color: "text-green-700", bg: "bg-green-50" }
  if (sgr >= 2) return { status: "Good",      color: "text-blue-700",  bg: "bg-blue-50" }
  if (sgr >= 1) return { status: "Average",   color: "text-yellow-700",bg: "bg-yellow-50" }
  return { status: "Poor", color: "text-red-700", bg: "bg-red-50" }
}

export function GrowthRate({ ponds }: GrowthRateProps) {
  const [initialWeight, setInitialWeight] = useState("")
  const [finalWeight, setFinalWeight] = useState("")
  const [days, setDays] = useState("")
  const [result, setResult] = useState<{ sgr: number; adg: number } | null>(null)
  const [errors, setErrors] = useState<{ initial?: string; final?: string; days?: string; rel?: string }>({})

  // ——— inputs (no negatives; allow one decimal point; clamp on blur only) ———
  const handleDecimalInput = (raw: string, setValue: (v: string) => void, limits: { min: number; max: number }) => {
    if (raw === "" || /^[0-9]*\.?[0-9]*$/.test(raw)) {
      if (raw === "") { setValue(""); return }
      const num = Number(raw)
      if (!Number.isNaN(num)) setValue(num > limits.max ? String(limits.max) : raw)
    }
  }
  const handleIntInput = (raw: string, setValue: (v: string) => void, limits: { min: number; max: number }) => {
    if (raw === "" || /^[0-9]+$/.test(raw)) {
      if (raw === "") { setValue(""); return }
      const num = Number(raw)
      if (!Number.isNaN(num)) setValue(num > limits.max ? String(limits.max) : raw)
    }
  }
  const onBlurClamp = (value: string, setValue: (v: string) => void, limits: { min: number; max: number }) => {
    if (value.trim() === "") { setValue(""); validateAll(); return }
    const num = numOrNaN(value)
    setValue(String(clamp(num, limits.min, limits.max)))
    validateAll()
  }

  // ——— validation ———
  const validateAll = () => {
    const ini = numOrNaN(initialWeight)
    const fin = numOrNaN(finalWeight)
    const d   = numOrNaN(days)

    const next: typeof errors = {}
    if (Number.isNaN(ini) || ini < LIMITS.initial.min || ini > LIMITS.initial.max)
      next.initial = `Initial must be ${LIMITS.initial.min}–${LIMITS.initial.max} g`
    if (Number.isNaN(fin) || fin < LIMITS.final.min || fin > LIMITS.final.max)
      next.final = `Final must be ${LIMITS.final.min}–${LIMITS.final.max} g`
    if (Number.isNaN(d) || d < LIMITS.days.min || d > LIMITS.days.max)
      next.days = `Growth period must be ${LIMITS.days.min}–${LIMITS.days.max} days (3–5 months)`
    if (!Number.isNaN(ini) && !Number.isNaN(fin) && fin <= ini)
      next.rel = "Final weight must be greater than initial weight"

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const canCalculate = useMemo(() => {
    const ini = numOrNaN(initialWeight)
    const fin = numOrNaN(finalWeight)
    const d   = numOrNaN(days)
    return (
      !Number.isNaN(ini) && ini >= LIMITS.initial.min && ini <= LIMITS.initial.max &&
      !Number.isNaN(fin) && fin >= LIMITS.final.min   && fin <= LIMITS.final.max   &&
      fin > ini &&
      !Number.isNaN(d)   && d   >= LIMITS.days.min    && d   <= LIMITS.days.max
    )
  }, [initialWeight, finalWeight, days])

  // ——— compute ———
  const calculateGrowth = () => {
    if (!validateAll()) { setResult(null); return }
    const initial = Number(initialWeight)
    const final   = Number(finalWeight)
    const period  = Number(days)
    const sgr = ((Math.log(final) - Math.log(initial)) / period) * 100  // % per day
    const adg = (final - initial) / period                              // g per day
    setResult({ sgr, adg })
  }

  const stageStatus = getGrowthStatusStageAware(result?.sgr ?? 0, Number(initialWeight) || 0)

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
          {/* Initial */}
          <div className="space-y-2">
            <Label htmlFor="initial-weight">
              Initial Weight (g) <span className="text-xs text-gray-500">(Fry/Fingerling: 0.1–20 g)</span>
            </Label>
            <Input
              id="initial-weight"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 5"
              value={initialWeight}
              onChange={(e) => handleDecimalInput(e.target.value, setInitialWeight, LIMITS.initial)}
              onBlur={() => onBlurClamp(initialWeight, setInitialWeight, LIMITS.initial)}
              aria-invalid={!!errors.initial}
            />
            {errors.initial && <p className="text-sm text-red-600">{errors.initial}</p>}
          </div>

          {/* Final */}
          <div className="space-y-2">
            <Label htmlFor="final-weight">
              Final Weight (g) <span className="text-xs text-gray-500">(1–6,000 g)</span>
            </Label>
            <Input
              id="final-weight"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 250"
              value={finalWeight}
              onChange={(e) => handleDecimalInput(e.target.value, setFinalWeight, LIMITS.final)}
              onBlur={() => onBlurClamp(finalWeight, setFinalWeight, LIMITS.final)}
              aria-invalid={!!errors.final}
            />
            {errors.final && <p className="text-sm text-red-600">{errors.final}</p>}
          </div>
        </div>

        {/* Days */}
        <div className="space-y-2">
          <Label htmlFor="growth-days">
            Growth Period (days) <span className="text-xs text-gray-500">(3–5 months / 90–150 days)</span>
          </Label>
          <Input
            id="growth-days"
            type="text"
            inputMode="numeric"
            placeholder="e.g., 120"
            value={days}
            onChange={(e) => handleIntInput(e.target.value, setDays, LIMITS.days)}
            onBlur={() => onBlurClamp(days, setDays, LIMITS.days)}
            aria-invalid={!!errors.days}
          />
          {errors.days && <p className="text-sm text-red-600">{errors.days}</p>}
        </div>

        {errors.rel && <p className="text-sm text-red-600">{errors.rel}</p>}

        <Button
          onClick={calculateGrowth}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
          disabled={!canCalculate}
        >
          Calculate Growth Rate
        </Button>

        {result !== null && (
          <div className={`p-4 rounded-lg ${stageStatus.bg}`}>
            <h3 className={`font-semibold ${stageStatus.color}`}>
              Growth Performance: {stageStatus.status}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div>
                <p className={`text-lg font-bold ${stageStatus.color}`}>{formatNum(result.sgr, 2)}%/day</p>
                <p className={`text-sm ${stageStatus.color}`}>Specific Growth Rate (SGR)</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${stageStatus.color}`}>{formatNum(result.adg, 3)} g/day</p>
                <p className={`text-sm ${stageStatus.color}`}>Average Daily Gain (ADG)</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${stageStatus.color}`}>
                  {formatNum(Number(finalWeight) / Number(initialWeight), 2)}×
                </p>
                <p className={`text-sm ${stageStatus.color}`}>Growth Multiple</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${stageStatus.color}`}>
                  {formatNum((Math.exp((result.sgr / 100) * 30) - 1) * 100, 2)}%
                </p>
                <p className={`text-sm ${stageStatus.color}`}>Approx. SGR per 30 days</p>
              </div>
            </div>

            <p className={`text-xs mt-3 ${stageStatus.color}`}>
              Note: SGR is % per day using natural logs. “Good/Excellent” thresholds adjust based on the starting weight (stage).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
