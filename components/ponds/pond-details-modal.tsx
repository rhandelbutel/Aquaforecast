//components/ponds/pond-details-modal.tsx
"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, Fish } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { deleteAdminPond } from "@/lib/admin-pond-service"
import { usePonds } from "@/lib/pond-context"
import type { UnifiedPond } from "@/lib/pond-context"

// mortality imports
import {
  subscribeMortalityLogs,
  computeSurvivalRateFromLogs,
  type MortalityLog,
} from "@/lib/mortality-service"

// edit modal
import PondEditModal from "@/components/admin/pond-edit-modal"

interface PondDetailsModalProps {
  pond: UnifiedPond | null
  isOpen: boolean
  onClose: () => void
}

export function PondDetailsModal({ pond, isOpen, onClose }: PondDetailsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEdit, setShowEdit] = useState(false) // NEW

  // live derived fields
  const [aliveFish, setAliveFish] = useState<number | null>(null)
  const [survivalRate, setSurvivalRate] = useState<number | null>(null)

  const { user } = useAuth()
  const { refreshPonds } = usePonds()
  if (!pond) return null

  const userIsAdmin = isAdmin(user?.email || "")

  // Use shared pond id so admin & users sync
  const sharedPondId = (pond as any)?.adminPondId || pond.id
  const initialStocked = (pond as any)?.initialFishCount ?? pond.fishCount ?? 0

  // Subscribe to mortality logs
  useEffect(() => {
    if (!isOpen || !sharedPondId) return
    const unsub = subscribeMortalityLogs(sharedPondId, (logs: MortalityLog[]) => {
      const sr = computeSurvivalRateFromLogs(logs)
      const estAlive = Math.max(0, Math.round((sr / 100) * initialStocked))
      setSurvivalRate(sr)
      setAliveFish(estAlive)
    })
    return () => unsub()
  }, [isOpen, sharedPondId, initialStocked])

  const formatDate = (date: Date | undefined | null): string => {
    if (!date) return "N/A"
    try {
      return new Date(date).toLocaleDateString()
    } catch {
      return "N/A"
    }
  }

  const handleDelete = async () => {
    if (!pond || !userIsAdmin) return
    setIsDeleting(true)
    try {
      await deleteAdminPond(sharedPondId)
      await refreshPonds()
      setShowDeleteConfirm(false)
      onClose()
    } catch (error) {
      console.error("Error deleting pond:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center space-x-2">
              <Fish className="h-5 w-5 text-cyan-600" />
              <span>{pond.name}</span>
            </DialogTitle>
            <div className="flex items-center space-x-2">
              {userIsAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center space-x-2">
              <Badge className="bg-green-100 text-green-800">Status: Active</Badge>
              <Badge variant="outline">{pond.type === "admin" ? "System Pond" : "User Pond"}</Badge>
            </div>

            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Fish Species</p>
                    <p className="font-medium">{pond.fishSpecies || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Area</p>
                    <p className="font-medium">{pond.area || 0} m²</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Depth</p>
                    <p className="font-medium">{pond.depth || 0} m</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Fish Count (Alive)</p>
                    <p className="font-medium">
                      {(aliveFish ?? initialStocked).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Initial: {initialStocked.toLocaleString()}{" "}
                      {survivalRate !== null ? <>| Survival: {survivalRate.toFixed(1)}%</> : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Feeding Frequency</p>
                    <p className="font-medium">{pond.feedingFrequency || 0}x daily</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Sensor ID</p>
                    <p className="font-medium">{pond.sensorId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Created</p>
                    <p className="font-medium">{formatDate(pond.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Last Updated</p>
                    <p className="font-medium">{formatDate(pond.updatedAt)}</p>
                  </div>
                  {pond.attachedAt && (
                    <div>
                      <p className="text-sm text-gray-600">Attached</p>
                      <p className="font-medium">{formatDate(pond.attachedAt)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Pond Modal */}
      {userIsAdmin && (
        <PondEditModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          pond={
            pond
              ? {
                  id: (pond as any)?.adminPondId || pond.id,
                  name: pond.name,
                  fishSpecies: pond.fishSpecies,
                  area: pond.area,
                  depth: pond.depth,
                  initialFishCount: (pond as any)?.initialFishCount ?? pond.fishCount ?? 0,
                  feedingFrequency: pond.feedingFrequency,
                  sensorId: pond.sensorId,
                  stockingDate: pond.createdAt ?? new Date(), // fallback
                }
              : null
          }
          onSaved={async () => {
            await refreshPonds()
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <Trash2 className="h-5 w-5 mr-2" />
              Delete Pond
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{pond.name}</strong>? This action cannot be undone and will remove
              all associated data.
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete Pond"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
