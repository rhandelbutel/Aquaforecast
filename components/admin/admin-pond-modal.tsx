"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle } from "lucide-react"
import { createAdminPond, updateAdminPond, type AdminPond } from "@/lib/admin-pond-service"

interface AdminPondModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (saved: AdminPond) => void
  pond?: AdminPond | null
  isEditing?: boolean
}

export function AdminPondModal({ isOpen, onClose, onSave, pond = null, isEditing = false }: AdminPondModalProps) {
  const getPHDateString = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)

  const [formData, setFormData] = useState({
    name: pond?.name ?? "",
    fishSpecies: pond?.fishSpecies ?? "",
    area: pond ? String(pond.area) : "",
    depth: pond ? String(pond.depth) : "",
    initialFishCount: pond ? String(pond.initialFishCount) : "",
    feedingFrequency: pond ? String(pond.feedingFrequency) : "",
    sensorId: pond?.sensorId ?? "",
    stockingDate: pond ? getPHDateString(new Date(pond.stockingDate)) : "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showLimitWarning, setShowLimitWarning] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate form
    if (
      !formData.name ||
      !formData.fishSpecies ||
      !formData.area ||
      !formData.depth ||
      !formData.initialFishCount ||
      !formData.feedingFrequency ||
      !formData.sensorId ||
      !formData.stockingDate
    ) {
      setError("Please fill in all fields")
      return
    }

    try {
      setLoading(true)
      setError("")

      if (isEditing && pond?.id) {
        await updateAdminPond(pond.id, {
          name: formData.name,
          fishSpecies: formData.fishSpecies,
          area: Number.parseFloat(formData.area),
          depth: Number.parseFloat(formData.depth),
          initialFishCount: Number.parseInt(formData.initialFishCount),
          feedingFrequency: Number.parseInt(formData.feedingFrequency),
          sensorId: formData.sensorId,
          stockingDate: new Date(formData.stockingDate),
        })

        const saved: AdminPond = {
          id: pond.id,
          name: formData.name,
          fishSpecies: formData.fishSpecies,
          area: Number.parseFloat(formData.area),
          depth: Number.parseFloat(formData.depth),
          initialFishCount: Number.parseInt(formData.initialFishCount),
          feedingFrequency: Number.parseInt(formData.feedingFrequency),
          sensorId: formData.sensorId,
          stockingDate: new Date(formData.stockingDate),
          createdAt: pond.createdAt,
          updatedAt: new Date(),
        }
        onSave(saved)
      } else {
        const saved = await createAdminPond({
          name: formData.name,
          fishSpecies: formData.fishSpecies,
          area: Number.parseFloat(formData.area),
          depth: Number.parseFloat(formData.depth),
          initialFishCount: Number.parseInt(formData.initialFishCount),
          feedingFrequency: Number.parseInt(formData.feedingFrequency),
          sensorId: formData.sensorId,
          stockingDate: new Date(formData.stockingDate),
        })
        onSave(saved)
      }

      // Reset form
      setFormData({
        name: "",
        fishSpecies: "",
        area: "",
        depth: "",
        initialFishCount: "",
        feedingFrequency: "",
        sensorId: "",
        stockingDate: "",
      })

    } catch (err) {
      console.error("Error creating pond:", err)
      if (!isEditing && err instanceof Error && err.message.includes("only one pond")) {
        setShowLimitWarning(true)
      } else {
        setError(err instanceof Error ? err.message : "Failed to create pond")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      name: "",
      fishSpecies: "",
      area: "",
      depth: "",
      initialFishCount: "",
      feedingFrequency: "",
      sensorId: "",
      stockingDate: "",
    })
    setError("")
    setShowLimitWarning(false)
    onClose()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit System Pond" : "Create System Pond"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Pond Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter pond name"
              />
            </div>

            <div>
              <Label htmlFor="fishSpecies">Fish Species</Label>
              <Select value={formData.fishSpecies} onValueChange={(value) => handleInputChange("fishSpecies", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fish species" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tilapia">Tilapia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="area">Area (m²)</Label>
                <Input
                  id="area"
                  type="number"
                  value={formData.area}
                  onChange={(e) => handleInputChange("area", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="depth">Depth (m)</Label>
                <Input
                  id="depth"
                  type="number"
                  step="0.1"
                  value={formData.depth}
                  onChange={(e) => handleInputChange("depth", e.target.value)}
                  placeholder="0.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="initialFishCount">Initial Fish Count</Label>
                <Input
                  id="initialFishCount"
                  type="number"
                  value={formData.initialFishCount}
                  onChange={(e) => handleInputChange("initialFishCount", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="feedingFrequency">Feeding Frequency (per day)</Label>
                <Input
                  id="feedingFrequency"
                  type="number"
                  value={formData.feedingFrequency}
                  onChange={(e) => handleInputChange("feedingFrequency", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="stockingDate">Stocking Date</Label>
              <Input
                id="stockingDate"
                type="date"
                value={formData.stockingDate}
                onChange={(e) => handleInputChange("stockingDate", e.target.value)}
                placeholder="YYYY-MM-DD"
                max={getPHDateString(new Date())}
              />
            </div>

            <div>
              <Label htmlFor="sensorId">Select Sensor</Label>
              <Select value={formData.sensorId} onValueChange={(value) => handleInputChange("sensorId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sensor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sensor 1">Sensor 1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

            <div className="flex space-x-3">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1 bg-transparent">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-cyan-600 hover:bg-cyan-700">
                {loading ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Changes" : "Create Pond"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pond Limit Warning Modal */}
      <Dialog open={showLimitWarning} onOpenChange={setShowLimitWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-yellow-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Pond Limit Reached
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              The current app is only capable of creating one pond. More ponds will be supported in future development.
            </p>
            <Button onClick={() => setShowLimitWarning(false)} className="w-full">
              Understood
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
