"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Scale, Target, AlertCircle, ChevronDown } from "lucide-react"
import { GrowthService, type GrowthSetup, type GrowthHistory } from "@/lib/growth-service"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/hooks/use-toast"
import type { UnifiedPond } from "@/lib/pond-context"

interface GrowthSetupModalProps {
  isOpen: boolean
  onClose: () => void
  pond: UnifiedPond
  onSuccess?: () => void
  onDataChange?: () => void
}

export function GrowthSetupModal({
  isOpen,
  onClose,
  pond,
  onSuccess,
  onDataChange,
}: GrowthSetupModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [currentABW, setCurrentABW] = useState("")
  const [targetWeight, setTargetWeight] = useState("")
  const [existingSetup, setExistingSetup] = useState<GrowthSetup | null>(null)
  const [daysUntilNextUpdate, setDaysUntilNextUpdate] = useState(0)

  // history preview
  const [history, setHistory] = useState<GrowthHistory[]>([])
  const [lastABW, setLastABW] = useState<number | null>(null)
  const [prevABW, setPrevABW] = useState<number | null>(null)
  const [weeklyGrowth, setWeeklyGrowth] = useState<number>(0)

  const [previewOpen, setPreviewOpen] = useState(false)

  const sharedPondId = pond.adminPondId || pond.id

  const isTimestampLike = (v: unknown): v is { toDate: () => Date } =>
    !!v && typeof (v as any).toDate === "function"
  const isSecondsLike = (v: unknown): v is { seconds: number } =>
    !!v && typeof (v as any).seconds === "number"
  const safeDate = (value: unknown): Date | null => {
    if (!value) return null
    if (isTimestampLike(value)) { try { return value.toDate() } catch { return null } }
    if (isSecondsLike(value)) return new Date(value.seconds * 1000)
    const d = new Date(value as any)
    return isNaN(d.getTime()) ? null : d
  }

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
        const growth = latest != null && prev != null ? Number((latest - prev).toFixed(2)) : 0
        setWeeklyGrowth(growth)
      })
      return () => unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sharedPondId, isOpen])

  const loadExistingSetup = async () => {
    if (!user) return
    try {
      const setup = await GrowthService.getGrowthSetup(sharedPondId, user.uid)

      if (setup) {
        setExistingSetup(setup)
        // Show empty if not set yet
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
      toast({
        title: "Error",
        description: "Failed to load growth setup data",
        variant: "destructive",
      })
    }
  }

  const handleUpdateTargetWeight = async (target: number) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to update target weight",
        variant: "destructive",
      })
      return false
    }

    if (isNaN(target) || target <= 0) return true

    const currentABWValue = existingSetup?.currentABW ?? parseFloat(currentABW)
    if (!isNaN(target) && target > 0 && target <= currentABWValue) {
      toast({
        title: "Error",
        description: "Target weight must be greater than current weight",
        variant: "destructive",
      })
      return false
    }

    setIsLoading(true)
    try {
      await GrowthService.updateTargetWeight(sharedPondId, user.uid, target)
      toast({ title: "Success", description: "Target weight updated successfully" })
      onDataChange?.()
      return true
    } catch (error) {
      console.error("Error updating target weight:", error)
      toast({
        title: "Error",
        description: "Failed to update target weight",
        variant: "destructive",
      })
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to set up growth tracking",
        variant: "destructive",
      })
      return
    }

    const abw = parseFloat(currentABW)
    const target = parseFloat(targetWeight)

    if (isNaN(abw) || abw <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid current average body weight",
        variant: "destructive",
      })
      return
    }

    if (!isNaN(target) && target > 0 && target <= abw) {
      toast({
        title: "Error",
        description: "Target weight must be greater than current weight",
        variant: "destructive",
      })
      return
    }

    // only target change while ABW is locked by cadence rule
    if (
      existingSetup &&
      !GrowthService.canUpdateABW(existingSetup.lastABWUpdate) &&
      abw === existingSetup.currentABW &&
      target !== (existingSetup.targetWeight ?? NaN)
    ) {
      const success = await handleUpdateTargetWeight(target)
      if (success) {
        onSuccess?.()
        onClose()
      }
      return
    }

    // cadence restriction
    if (existingSetup && !GrowthService.canUpdateABW(existingSetup.lastABWUpdate)) {
      toast({
        title: "Error",
        description: `Cannot update ABW yet. Next update available in ${daysUntilNextUpdate} days.`,
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      await GrowthService.saveGrowthSetup(
        sharedPondId,
        user.uid,
        isNaN(target) || target <= 0 ? undefined : target,
        abw,
        !existingSetup
      )

      toast({
        title: "Success",
        description: existingSetup
          ? "Growth tracking data updated successfully"
          : "Growth tracking set up successfully",
      })

      onSuccess?.()
      onDataChange?.()
      onClose()
    } catch (error) {
      console.error("Error saving growth setup:", error)
      toast({
        title: "Error",
        description: "Failed to save growth tracking data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const abwLocked =
    !!existingSetup && !GrowthService.canUpdateABW(existingSetup.lastABWUpdate)

  const headerStatus =
    existingSetup && (daysUntilNextUpdate > 0
      ? { tone: "text-yellow-700", text: `Next ABW update available in ${daysUntilNextUpdate} days` }
      : { tone: "text-green-700", text: "Weekly ABW due: you can record a new ABW now" })

  const showABWNotSet = !!existingSetup && (existingSetup.currentABW ?? 0) <= 0
  const showTargetNotSet = !!existingSetup && !(typeof existingSetup.targetWeight === "number" && existingSetup.targetWeight > 0)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            {existingSetup ? "Update Growth Tracking" : "Set Up Growth Tracking"}
          </DialogTitle>
        </DialogHeader>

        {/* Status / Guidance */}
        {existingSetup && headerStatus && (
          <div className={`mb-2 text-xs flex items-center gap-2 ${headerStatus.tone}`}>
            <AlertCircle className="h-4 w-4" />
            {headerStatus.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentABW" className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Current Average Body Weight (g)
                {showABWNotSet && <span className="text-xs text-gray-500">(not set)</span>}
              </Label>
              <Input
                id="currentABW"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter current ABW"
                value={currentABW}
                onChange={(e) => setCurrentABW(e.target.value)}
                disabled={abwLocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetWeight" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Target Weight (g)
                {showTargetNotSet && <span className="text-xs text-gray-500">(not set)</span>}
              </Label>
              <Input
                id="targetWeight"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter target weight"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Preview & History */}
          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-medium">Growth Preview</p>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Toggle preview">
                  <ChevronDown className={`h-4 w-4 transition-transform ${previewOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="px-3 pb-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Previous ABW (g)</p>
                  <p className="font-semibold">{prevABW ?? 0}</p>
                </div>
                <div className="rounded bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Latest ABW (g)</p>
                  <p className="font-semibold">{lastABW ?? 0}</p>
                </div>
                <div className="rounded bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Fortnight Growth (g)</p>
                  <p className="font-semibold">{weeklyGrowth}</p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">Recent ABW History</p>
                <ul className="space-y-1 max-h-28 overflow-auto pr-1">
                  {history.slice(0, 6).map((h) => {
                    const d = safeDate(h.recordedAt)
                    const when = d ? d.toLocaleString() : "—"
                    return (
                      <li key={h.id} className="text-xs flex justify-between border-b py-1">
                        <span>{when}</span>
                        <span className="font-medium">{h.abw} g</span>
                      </li>
                    )
                  })}
                  {history.length === 0 && (
                    <li className="text-xs text-gray-500">No history yet. Growth will show 0.</li>
                  )}
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : existingSetup ? "Update" : "Set Up"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
