"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Droplets } from "lucide-react"
import { PondData } from "@/lib/pond-service"

interface WaterVolumeProps {
  ponds: PondData[]
}

const LIMITS = {
  lengthOrDiameter: { min: 1, max: 1000 }, // m
  width: { min: 1, max: 1000 },            // m
  depth: { min: 0.1, max: 5 },            // m
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const numOrNaN = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")))
const formatNum = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 })

export function WaterVolume({ ponds }: WaterVolumeProps) {
  const [length, setLength] = useState("")
  const [width, setWidth] = useState("")
  const [depth, setDepth] = useState("")
  const [shape, setShape] = useState<"rectangular" | "circular">("rectangular")
  const [result, setResult] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ length?: string; width?: string; depth?: string }>({})

  // allow only digits and one dot; no negatives
  const handleDecimalInput = (
    raw: string,
    setValue: (v: string) => void,
    limits: { min: number; max: number }
  ) => {
    if (raw === "" || /^[0-9,]*\.?[0-9]*$/.test(raw)) {
      if (raw === "") {
        setValue("")
        return
      }
      const num = Number(raw.replace(/,/g, ""))
      if (!Number.isNaN(num)) {
        // live cap above max, but allow below min until blur (so user can type)
        const capped = num > limits.max ? limits.max : num
        setValue(formatNum(capped))
      }
    }
  }

  const onBlurClamp = (
    value: string,
    setValue: (v: string) => void,
    limits: { min: number; max: number }
  ) => {
    if (value.trim() === "") {
      setValue("")
      validateAll()
      return
    }
    const num = numOrNaN(value)
    const clamped = clamp(num, limits.min, limits.max)
    setValue(formatNum(clamped))
    validateAll()
  }

  const validateAll = () => {
    const l = numOrNaN(length)
    const w = numOrNaN(width)
    const d = numOrNaN(depth)

    const next: typeof errors = {}
    if (Number.isNaN(l) || l < LIMITS.lengthOrDiameter.min || l > LIMITS.lengthOrDiameter.max) {
      next.length = `${shape === "circular" ? "Diameter" : "Length"} must be ${
        LIMITS.lengthOrDiameter.min
      }–${LIMITS.lengthOrDiameter.max} m`
    }
    if (
      shape === "rectangular" &&
      (Number.isNaN(w) || w < LIMITS.width.min || w > LIMITS.width.max)
    ) {
      next.width = `Width must be ${LIMITS.width.min}–${LIMITS.width.max} m`
    }
    if (Number.isNaN(d) || d < LIMITS.depth.min || d > LIMITS.depth.max) {
      next.depth = `Depth must be ${LIMITS.depth.min}–${LIMITS.depth.max} m`
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const canCalculate = useMemo(() => {
    const l = numOrNaN(length)
    const w = numOrNaN(width)
    const d = numOrNaN(depth)
    const okL =
      !Number.isNaN(l) && l >= LIMITS.lengthOrDiameter.min && l <= LIMITS.lengthOrDiameter.max
    const okW =
      shape === "circular"
        ? true
        : !Number.isNaN(w) && w >= LIMITS.width.min && w <= LIMITS.width.max
    const okD = !Number.isNaN(d) && d >= LIMITS.depth.min && d <= LIMITS.depth.max
    return okL && okW && okD
  }, [length, width, depth, shape])

  const calculateVolume = () => {
    if (!validateAll()) {
      setResult(null)
      return
    }
    const l = numOrNaN(length)
    const d = numOrNaN(depth)
    let volume = 0
    if (shape === "rectangular") {
      const w = numOrNaN(width)
      volume = l * w * d
    } else {
      const radius = l / 2 // l is diameter in circular mode
      volume = Math.PI * radius * radius * d
    }
    setResult(volume)
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
        {/* Shape */}
        <div className="space-y-2">
          <Label htmlFor="pond-shape">Pond Shape</Label>
          <Select
            value={shape}
            onValueChange={(v) => {
              setShape(v as "rectangular" | "circular")
              // optional: clear width when switching to circular
              if (v === "circular") setWidth("")
              setResult(null)
              setErrors({})
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select pond shape" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rectangular">Rectangular</SelectItem>
              <SelectItem value="circular">Circular</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="length">
              {shape === "circular" ? "Diameter (m)" : "Length (m)"}
            </Label>
            <Input
              id="length"
              type="text"
              inputMode="decimal"
              placeholder="1-1,000"
              value={length}
              onChange={(e) => handleDecimalInput(e.target.value, setLength, LIMITS.lengthOrDiameter)}
              onBlur={() => onBlurClamp(length, setLength, LIMITS.lengthOrDiameter)}
              aria-invalid={!!errors.length}
            />
            {errors.length && <p className="text-sm text-red-600">{errors.length}</p>}
          </div>

          {shape === "rectangular" && (
            <div className="space-y-2">
              <Label htmlFor="width">Width (m)</Label>
              <Input
                id="width"
                type="text"
                inputMode="decimal"
                placeholder="1-1,000"
                value={width}
                onChange={(e) => handleDecimalInput(e.target.value, setWidth, LIMITS.width)}
                onBlur={() => onBlurClamp(width, setWidth, LIMITS.width)}
                aria-invalid={!!errors.width}
              />
              {errors.width && <p className="text-sm text-red-600">{errors.width}</p>}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="depth">Average Depth (m)</Label>
          <Input
            id="depth"
            type="text"
            inputMode="decimal"
            placeholder="0.1-5"
            value={depth}
            onChange={(e) => handleDecimalInput(e.target.value, setDepth, LIMITS.depth)}
            onBlur={() => onBlurClamp(depth, setDepth, LIMITS.depth)}
            aria-invalid={!!errors.depth}
          />
          {errors.depth && <p className="text-sm text-red-600">{errors.depth}</p>}
        </div>

        <Button
          onClick={calculateVolume}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
          disabled={!canCalculate}
        >
          Calculate Volume
        </Button>

        {result !== null && (
          <div className="p-4 bg-cyan-50 rounded-lg">
            <h3 className="font-semibold text-cyan-900">Water Volume</h3>
            <p className="text-2xl font-bold text-cyan-700">{formatNum(result)} m³</p>
            <p className="text-sm text-cyan-600 mt-1">
              Equivalent to {formatNum(result * 1000)} liters
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
