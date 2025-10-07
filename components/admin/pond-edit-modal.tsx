"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Save, X } from "lucide-react"
import { updateAdminPond, type AdminPond } from "@/lib/admin-pond-service"

type Editable = Pick<
  AdminPond,
  "id" | "name" | "fishSpecies" | "area" | "depth" | "initialFishCount" | "feedingFrequency" | "sensorId" | "stockingDate"
>

interface PondEditModalProps {
  open: boolean
  onClose: () => void
  pond: Editable | null
  onSaved?: () => void
}

export default function PondEditModal({ open, onClose, pond, onSaved }: PondEditModalProps) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    fishSpecies: "",
    area: "",
    depth: "",
    initialFishCount: "",
    feedingFrequency: "",
    sensorId: "",
    stockingDate: "",
  })

  // Prepare date input yyyy-mm-dd for stockingDate
  const stockingDateISO = useMemo(() => {
    if (!pond?.stockingDate) return ""
    const d = pond.stockingDate instanceof Date ? pond.stockingDate : new Date(pond.stockingDate)
    if (Number.isNaN(d.getTime())) return ""
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }, [pond?.stockingDate])

  useEffect(() => {
    if (!open || !pond) return
    setError("")
    setForm({
      name: pond.name ?? "",
      fishSpecies: pond.fishSpecies ?? "",
      area: String(pond.area ?? ""),
      depth: String(pond.depth ?? ""),
      initialFishCount: String(pond.initialFishCount ?? ""),
      feedingFrequency: String(pond.feedingFrequency ?? ""),
      sensorId: pond.sensorId ?? "",
      stockingDate: stockingDateISO,
    })
  }, [open, pond, stockingDateISO])

  if (!open || !pond) return null

  const handleChange = (key: keyof typeof form, val: string) => {
    setForm((p) => ({ ...p, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validate minimally
    const area = Number(form.area)
    const depth = Number(form.depth)
    const initialFishCount = Number(form.initialFishCount)
    const feedingFrequency = Number(form.feedingFrequency)
    const stockingDate = form.stockingDate ? new Date(form.stockingDate) : new Date()

    if (!form.name.trim()) return setError("Name is required.")
    if (!form.fishSpecies.trim()) return setError("Fish species is required.")
    if (!Number.isFinite(area) || area <= 0) return setError("Area must be a positive number.")
    if (!Number.isFinite(depth) || depth <= 0) return setError("Depth must be a positive number.")
    if (!Number.isFinite(initialFishCount) || initialFishCount < 0) return setError("Initial fish count must be ≥ 0.")
    if (!Number.isFinite(feedingFrequency) || feedingFrequency <= 0)
      return setError("Feeding frequency must be a positive number.")
    if (Number.isNaN(stockingDate.getTime())) return setError("Invalid stocking date.")

    setSaving(true)
    try {
      await updateAdminPond(pond.id, {
        name: form.name.trim(),
        fishSpecies: form.fishSpecies.trim(),
        area,
        depth,
        initialFishCount,
        feedingFrequency,
        sensorId: form.sensorId.trim(),
        stockingDate,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      console.error(err)
      setError("Failed to update pond. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Pond</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => handleChange("name", e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="species">Fish Species</Label>
              <Input
                id="species"
                value={form.fishSpecies}
                onChange={(e) => handleChange("fishSpecies", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="area">Area (m²)</Label>
              <Input id="area" type="number" step="0.1" value={form.area} onChange={(e) => handleChange("area", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depth">Depth (m)</Label>
              <Input id="depth" type="number" step="0.1" value={form.depth} onChange={(e) => handleChange("depth", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Initial Fish Count</Label>
              <Input
                id="count"
                type="number"
                step="1"
                value={form.initialFishCount}
                onChange={(e) => handleChange("initialFishCount", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freq">Feeding Frequency (x/day)</Label>
              <Input
                id="freq"
                type="number"
                step="1"
                value={form.feedingFrequency}
                onChange={(e) => handleChange("feedingFrequency", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sensor">Sensor ID</Label>
              <Input id="sensor" value={form.sensorId} onChange={(e) => handleChange("sensorId", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stockingDate">Stocking Date</Label>
              <Input
                id="stockingDate"
                type="date"
                value={form.stockingDate}
                onChange={(e) => handleChange("stockingDate", e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
