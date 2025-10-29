"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calculator } from "lucide-react"
import { PondData } from "@/lib/pond-service"

interface FeedCalculatorProps {
  ponds: PondData[]
}

// Centralized limits
const LIMITS = {
  weight: { min: 1, max: 700, step: 1 },      // grams
  count: { min: 1, max: 10000, step: 1 },      // fish
  rate: { min: 0.1, max: 10, step: 0.1 },      // % body weight
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const formatIntWithCommas = (num: number) => num.toLocaleString("en-US")

const parseNumber = (v: string) => (v.trim() === "" ? NaN : Number(v))
const parseNumberLoose = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")))

export function FeedCalculator({ ponds }: FeedCalculatorProps) {
  const [fishWeight, setFishWeight] = useState<string>("")  
  const [fishCount, setFishCount] = useState<string>("")    
  const [feedingRate, setFeedingRate] = useState<string>("")
  const [result, setResult] = useState<number | null>(null)

  const [errors, setErrors] = useState<{ weight?: string; count?: string; rate?: string }>({})

  const onWeightChange = (raw: string) => {
    // allow digits only
    if (raw === "" || /^[0-9]+$/.test(raw)) {
      // if exceeds max, cap while typing; allow blank
      if (raw !== "" && Number(raw) > LIMITS.weight.max) {
        setFishWeight(String(LIMITS.weight.max))
      } else {
        setFishWeight(raw)
      }
    }
  }
  const onWeightBlur = () => {
    if (fishWeight.trim() === "") {
      setFishWeight("") 
      validateAll()
      return
    }
    const num = Number(fishWeight)
    const clamped = clamp(num, LIMITS.weight.min, LIMITS.weight.max)
    setFishWeight(String(clamped))
    validateAll()
  }
  
  const onCountChange = (raw: string) => {
    // allow digits + commas (strip commas to parse)
    if (raw === "" || /^[0-9,]+$/.test(raw)) {
      if (raw === "") {
        setFishCount("")
        return
      }
      const num = Number(raw.replace(/,/g, ""))
      if (!Number.isNaN(num)) {
        if (num > LIMITS.count.max) {
          setFishCount(formatIntWithCommas(LIMITS.count.max))
        } else {
          // live format with commas
          setFishCount(formatIntWithCommas(num))
        }
      }
    }
  }
  const onCountBlur = () => {
    if (fishCount.trim() === "") {
      setFishCount("")
      validateAll()
      return
    }
    const num = parseNumberLoose(fishCount)
    const clamped = clamp(num, LIMITS.count.min, LIMITS.count.max)
    setFishCount(formatIntWithCommas(clamped))
    validateAll()
  }

  // Rate: decimal, text input (no spinner), allow blank; clamp on blur; cap above max while typing
  const onRateChange = (raw: string) => {
    // allow digits + optional single dot
    if (raw === "" || /^[0-9]*\.?[0-9]*$/.test(raw)) {
      if (raw === "") {
        setFeedingRate("")
        return
      }
      const num = Number(raw)
      if (!Number.isNaN(num) && num > LIMITS.rate.max) {
        setFeedingRate(String(LIMITS.rate.max))
      } else {
        setFeedingRate(raw)
      }
    }
  }
  const onRateBlur = () => {
    if (feedingRate.trim() === "") {
      setFeedingRate("")
      validateAll()
      return
    }
    const num = Number(feedingRate)
    const clamped = clamp(num, LIMITS.rate.min, LIMITS.rate.max)
    // normalize to remove trailing dot like "3."
    setFeedingRate(String(clamped))
    validateAll()
  }

  // ---- validation ----
  const validateAll = () => {
    const w = parseNumber(fishWeight)
    const c = parseNumberLoose(fishCount)
    const r = parseNumber(feedingRate)

    const nextErrors: typeof errors = {}
    if (Number.isNaN(w) || w < LIMITS.weight.min || w > LIMITS.weight.max) {
      nextErrors.weight = `Weight must be ${LIMITS.weight.min}–${LIMITS.weight.max} g`
    }
    if (Number.isNaN(c) || c < LIMITS.count.min || c > LIMITS.count.max) {
      nextErrors.count = `Fish count must be ${LIMITS.count.min}–${LIMITS.count.max}`
    }
    if (Number.isNaN(r) || r < LIMITS.rate.min || r > LIMITS.rate.max) {
      nextErrors.rate = `Feeding rate must be ${LIMITS.rate.min}–${LIMITS.rate.max} %`
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const canCalculate = useMemo(() => {
    const w = parseNumber(fishWeight)
    const c = parseNumberLoose(fishCount)
    const r = parseNumber(feedingRate)
    return (
      !Number.isNaN(w) &&
      !Number.isNaN(c) &&
      !Number.isNaN(r) &&
      w >= LIMITS.weight.min &&
      w <= LIMITS.weight.max &&
      c >= LIMITS.count.min &&
      c <= LIMITS.count.max &&
      r >= LIMITS.rate.min &&
      r <= LIMITS.rate.max
    )
  }, [fishWeight, fishCount, feedingRate])

  // ---- compute ----
  const calculateFeed = () => {
    if (!validateAll()) {
      setResult(null)
      return
    }
    const weight = Number(fishWeight)                 // grams
    const count = Number(fishCount.replace(/,/g, "")) // integer
    const rate = Number(feedingRate)                  // %

    const totalBiomassKg = (weight * count) / 1000
    const dailyFeedKg = totalBiomassKg * (rate / 100)
    setResult(dailyFeedKg)
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
          {/* Weight */}
          <div className="space-y-2">
            <Label htmlFor="fish-weight">Average Fish Weight (g)</Label>
            <Input
              id="fish-weight"
              type="text"
              inputMode="numeric"
              placeholder="1-700"
              value={fishWeight}
              onChange={(e) => onWeightChange(e.target.value)}
              onBlur={onWeightBlur}
              aria-invalid={!!errors.weight}
            />
            {errors.weight && <p className="text-sm text-red-600">{errors.weight}</p>}
          </div>

          {/* Count (with commas) */}
          <div className="space-y-2">
            <Label htmlFor="fish-count">Number of Fish</Label>
            <Input
              id="fish-count"
              type="text"
              inputMode="numeric"
              placeholder="1-10,000"
              value={fishCount}
              onChange={(e) => onCountChange(e.target.value)}
              onBlur={onCountBlur}
              aria-invalid={!!errors.count}
            />
            {errors.count && <p className="text-sm text-red-600">{errors.count}</p>}
          </div>
        </div>

        {/* Feeding Rate (no spinner) */}
        <div className="space-y-2">
          <Label htmlFor="feeding-rate">Feeding Rate (% of body weight)</Label>
          <Input
            id="feeding-rate"
            type="text"           
            inputMode="decimal"   
            placeholder="0.1-10"
            value={feedingRate}
            onChange={(e) => onRateChange(e.target.value)}
            onBlur={onRateBlur}
            aria-invalid={!!errors.rate}
            className="[appearance:textfield]"
          />
          {errors.rate && <p className="text-sm text-red-600">{errors.rate}</p>}
        </div>

        <Button
          onClick={calculateFeed}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
          disabled={!canCalculate}
        >
          Calculate Daily Feed
        </Button>

        {result !== null && canCalculate && (
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
