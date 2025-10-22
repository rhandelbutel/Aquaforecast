//components/admin/start-stocking-modal.tsx
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { UnifiedPond } from "@/lib/pond-context"
import { startNewStocking } from "@/lib/pond-service"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  pond: UnifiedPond
  onDone?: () => void
}

export default function StartStockingModal({ open, onOpenChange, pond, onDone }: Props) {
  const [count, setCount] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  const handleSave = async () => {
    const n = Number(count)
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Enter a valid fish count.")
      return
    }
    setErr("")
    setSaving(true)
    try {
      const sharedId = (pond as any)?.adminPondId || pond.id
      await startNewStocking(sharedId, n, new Date(date))
      onOpenChange(false)
      onDone?.()
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || "Failed to start new stocking.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Stocking</DialogTitle>
        </DialogHeader>

        {err && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Number of fish stocked</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="e.g., 2000"
            required
          />
        </div>

        <div className="space-y-2 mt-3">
          <Label>Date stocked</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
