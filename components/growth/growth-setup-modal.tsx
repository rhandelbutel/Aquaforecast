"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Scale, Target, AlertCircle, ChevronDown, Calculator } from "lucide-react"
import { GrowthService, type GrowthSetup, type GrowthHistory } from "@/lib/growth-service"
import { useAuth } from "@/lib/auth-context"
import type { UnifiedPond } from "@/lib/pond-context"
import { pushABWLoggedInsight } from "@/lib/dash-insights-service"

interface GrowthSetupModalProps {
  isOpen: boolean
  onClose: () => void
  pond: UnifiedPond
  onSuccess?: () => void
  onDataChange?: () => void
}

const MIN_MARKET_WEIGHT = 150 // g

export function GrowthSetupModal({
  isOpen,
  onClose,
  pond,
  onSuccess,
  onDataChange,
}: GrowthSetupModalProps) {
  const { user } = useAuth()

  const [isLoading, setIsLoading] = useState(false)
  const [currentABW, setCurrentABW] = useState("")
  const [targetWeight, setTargetWeight] = useState("")
  const [existingSetup, setExistingSetup] = useState<GrowthSetup | null>(null)
  const [daysUntilNextUpdate, setDaysUntilNextUpdate] = useState(0)
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [lastABW, setLastABW] = useState<number | null>(null)
  const [prevABW, setPrevABW] = useState<number | null>(null)
  const [weeklyGrowth, setWeeklyGrowth] = useState<number>(0)
  const [previewOpen, setPreviewOpen] = useState(false)

  // dialogs
  const [showLowerAbwWarning, setShowLowerAbwWarning] = useState(false)
  const [showNoChangeDialog, setShowNoChangeDialog] = useState(false)
  const [showBelowMarketWarning, setShowBelowMarketWarning] = useState(false)
  const [showTargetReachedDialog, setShowTargetReachedDialog] = useState(false)

  const targetInputRef = useRef<HTMLInputElement | null>(null)
  const pendingABWRef = useRef<number | null>(null)
  const pendingTargetRef = useRef<number | null>(null)

  // ABW calculator
  const [sampleCount, setSampleCount] = useState<number>(0)
  const [totalWeight, setTotalWeight] = useState<number>(0)
  const [computedABW, setComputedABW] = useState<number | null>(null)

  const sharedPondId = pond.adminPondId || pond.id

  useEffect(() => {
    if (user && sharedPondId && isOpen) {
      loadExistingSetup()
      setCurrentABW("")
      setTargetWeight("")
      const unsub = GrowthService.subscribeGrowthHistory(sharedPondId, (items) => {
        setHistory(items)
        const latest = items[0]?.abw ?? null
        const prev = items[1]?.abw ?? null
        setLastABW(latest)
        setPrevABW(prev)
        const growth =
          latest != null && prev != null ? Number((latest - prev).toFixed(2)) : 0
        setWeeklyGrowth(growth)
      })
      return () => unsub()
    }
  }, [user, sharedPondId, isOpen])

  const loadExistingSetup = async () => {
    if (!user) return
    try {
      const setup = await GrowthService.getGrowthSetup(sharedPondId, user.uid)
      if (setup) {
        setExistingSetup(setup)
        setCurrentABW(setup.currentABW > 0 ? String(setup.currentABW) : "")
        setTargetWeight(
          typeof setup.targetWeight === "number" && setup.targetWeight > 0
            ? String(setup.targetWeight)
            : ""
        )
        const days = setup.lastABWUpdate
          ? GrowthService.getDaysUntilNextUpdate(setup.lastABWUpdate)
          : 0
        setDaysUntilNextUpdate(days)
      } else {
        setExistingSetup(null)
        setCurrentABW("")
        setTargetWeight("")
        setDaysUntilNextUpdate(0)
      }
    } catch (error) {
      console.error("Error loading growth setup:", error)
    }
  }

  const proceedSave = async (abw: number, target: number | undefined) => {
    if (!user) return
    setIsLoading(true)
    try {
      await GrowthService.saveGrowthSetup(
        sharedPondId,
        user.uid,
        target && target > 0 ? target : undefined,
        abw,
        !existingSetup
      )
      await pushABWLoggedInsight(sharedPondId, abw, target && target > 0 ? target : undefined)
      onSuccess?.()
      onDataChange?.()
      onClose()
    } catch (error) {
      console.error("Error saving growth setup:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const abw = parseFloat(currentABW)
    const target = parseFloat(targetWeight)

    if (!Number.isFinite(abw) || abw <= 0) return

    if (lastABW !== null && abw < lastABW) {
      setShowLowerAbwWarning(true)
      return
    }

    // ⛔ Prevent same ABW value (no growth)
    if (existingSetup && abw === existingSetup.currentABW) {
      setShowNoChangeDialog(true)
      return
    }

    // ⛔ Prevent recording when pond already reached/exceeded harvest target
    if (Number.isFinite(target) && target > 0 && abw >= target) {
      setShowTargetReachedDialog(true)
      return
    }

    // ⛔ Prevent below-market target
    if (Number.isFinite(target) && target > 0 && target < MIN_MARKET_WEIGHT) {
      setShowBelowMarketWarning(true)
      return
    }

    await proceedSave(abw, Number.isFinite(target) && target > 0 ? target : undefined)
  }

  const abwLocked =
    !!existingSetup && !GrowthService.canUpdateABW(existingSetup.lastABWUpdate)

  const headerStatus =
    existingSetup &&
    (daysUntilNextUpdate > 0
      ? { tone: "text-yellow-700", text: `Next ABW update available in ${daysUntilNextUpdate} days` }
      : { tone: "text-green-700", text: "Weekly ABW due: you can record a new ABW now" })

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            {existingSetup ? "Update Growth Tracking" : "Set Up Growth Tracking"}
          </DialogTitle>
        </DialogHeader>

        {existingSetup && headerStatus && (
          <div className={`mb-2 text-xs flex items-center gap-2 ${headerStatus.tone}`}>
            <AlertCircle className="h-4 w-4" />
            {headerStatus.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ABW Calculator */}
          <div className="rounded-md border p-3 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              <p className="font-medium text-sm">ABW Calculator</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>No. of Fish Sampled</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 10"
                  onChange={(e) => setSampleCount(parseFloat(e.target.value))}
                  value={sampleCount || ""}
                />
              </div>
              <div>
                <Label>Total Sample Weight (g)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 420"
                  onChange={(e) => setTotalWeight(parseFloat(e.target.value))}
                  value={totalWeight || ""}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (sampleCount > 0 && totalWeight > 0) {
                    const calc = Number((totalWeight / sampleCount).toFixed(2))
                    setComputedABW(calc)
                    setCurrentABW(calc.toString())
                  }
                }}
              >
                Compute ABW
              </Button>
              {computedABW !== null && (
                <p className="text-sm text-gray-600">
                  Result: <span className="font-semibold">{computedABW} g/fish</span>
                </p>
              )}
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-4">
            <div>
              <Label>Current Average Body Weight (g)</Label>
              <Input
              type="number"
             step="0.01"
             min="0"
             value={currentABW}
             onChange={(e) => setCurrentABW(e.target.value)}
             disabled={true} 
              />
            </div>
            <div>
              <Label>Target Weight (g)</Label>
              <Input
                ref={targetInputRef}
                type="number"
                step="0.01"
                min="0"
                placeholder={`≥ ${MIN_MARKET_WEIGHT}g`}
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : existingSetup ? "Update" : "Set Up"}
            </Button>
          </div>
        </form>

        {/* Lower ABW */}
        <Dialog open={showLowerAbwWarning} onOpenChange={setShowLowerAbwWarning}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" /> Invalid ABW Entry
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-700">
              The entered ABW is lower than the previously recorded value ({lastABW}g).
            </p>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setShowLowerAbwWarning(false)}>
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* No Change */}
        <Dialog open={showNoChangeDialog} onOpenChange={setShowNoChangeDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" /> No Change Detected
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-700">
              The entered ABW is the same as the last recorded value. Please enter a new measurement.
            </p>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setShowNoChangeDialog(false)}>
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Target Reached */}
        <Dialog open={showTargetReachedDialog} onOpenChange={setShowTargetReachedDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" /> Target Weight Reached
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-700">
              The target weight has already been reached. Please set a higher target weight to continue recording new growth data.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowTargetReachedDialog(false)}
              >
                OK
              </Button>
              <Button
                onClick={() => {
                  setShowTargetReachedDialog(false)
                  setTimeout(() => {
                    targetInputRef.current?.focus()
                  }, 150)
                }}
              >
                Set Higher Target
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Below Market */}
        <Dialog open={showBelowMarketWarning} onOpenChange={setShowBelowMarketWarning}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" /> Target Below Ideal Harvest Size
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-700">
              The entered target weight is below the ideal harvestable size (minimum {MIN_MARKET_WEIGHT} g).
            </p>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setShowBelowMarketWarning(false)}>
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
