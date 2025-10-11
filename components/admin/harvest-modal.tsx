//components/admin/harvest-modal.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { UnifiedPond } from "@/lib/pond-context"
import { applyPartialHarvest, totalHarvest } from "@/lib/pond-service"

type Mode = "partial" | "total"

interface HarvestModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  ponds: UnifiedPond[]
  /** Optional: if you later open the modal from a specific pond row, pass it here */
  pond?: UnifiedPond
  onDone?: () => void
}

const fmtDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d)

export default function HarvestModal({ open, onOpenChange, ponds, pond, onDone }: HarvestModalProps) {
  // If a pond prop is provided, use it; otherwise default to first pond
  const initialPond = pond ?? (ponds.length ? ponds[0] : undefined)
  const [activePondId, setActivePondId] = useState<string>(initialPond?.id || "")
  const [mode, setMode] = useState<Mode>("partial")
  const [count, setCount] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string>("")
  const today = fmtDate()

  const activePond = useMemo(
    () => ponds.find(p => p.id === activePondId) || undefined,
    [ponds, activePondId]
  )

  useEffect(() => {
    if (!open) return
    setActivePondId((pond ?? ponds[0])?.id || "")
    setMode("partial")
    setCount("")
    setErr("")
  }, [open, pond, ponds])

  const doSave = async () => {
    if (!activePond) {
      setErr("No pond selected.")
      return
    }

    // Always use the SHARED admin id when mutating (users use adminPondId; admin uses its id)
    const targetId = (activePond as any).adminPondId || activePond.id

    setErr("")
    setSaving(true)
    try {
      if (mode === "partial") {
        const n = Number(count)
        if (!Number.isFinite(n) || n <= 0) {
          setErr("Enter a valid number of fish to harvest.")
          setSaving(false)
          return
        }
        await applyPartialHarvest(targetId, n, new Date())
      } else {
        await totalHarvest(targetId)
      }
      onOpenChange(false)
      onDone?.()
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || "Failed to save harvest action.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Harvest</DialogTitle>
        </DialogHeader>

        {err && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        {/* Pond name — plain text (no dropdown icon) */}
        <div className="space-y-2">
          <Label>Pond</Label>
          <Input value={activePond?.name ?? ""} disabled className="bg-gray-50" />
        </div>

        {/* Harvest Type — dropdown */}
        <div className="space-y-2 mt-3">
          <Label>Harvest Type</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="partial">Partial Harvest</SelectItem>
              <SelectItem value="total">Total Harvest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Partial fields */}
        {mode === "partial" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="space-y-2">
              <Label>Number of fish harvested</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g., 120"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={today} disabled className="bg-gray-50" />
            </div>
          </div>
        )}

        {/* Total info */}
        {mode === "total" && (
          <div className="rounded-md border bg-amber-50 text-amber-900 text-sm p-3 mt-2">
            This will reset this pond’s cycle (sets fish alive to 0 and clears related data). This cannot be undone.
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={doSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
