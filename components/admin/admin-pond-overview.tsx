"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Waves, Fish, Edit, AlertTriangle, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { AdminPondModal } from "./admin-pond-modal"
import { getAdminPond, deleteAdminPond, type AdminPond } from "@/lib/admin-pond-service"

export function AdminPondOverview() {
  const { user } = useAuth()
  const [pond, setPond] = useState<AdminPond | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showLimitAlert, setShowLimitAlert] = useState(false)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const loadPond = async () => {
      try {
        setLoading(true)
        const adminPond = await getAdminPond()
        setPond(adminPond)
      } catch (error) {
        console.error("Error loading admin pond:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPond()
  }, [])

  const handleAddPond = () => {
    if (pond) {
      setShowLimitAlert(true)
      return
    }
    setIsEditing(false)
    setShowModal(true)
  }

  const handleEditPond = () => {
    setIsEditing(true)
    setShowModal(true)
  }

  const handleDeletePond = () => {
    setShowDeleteAlert(true)
  }

  const confirmDeletePond = async () => {
    if (!pond?.id) return

    try {
      setIsDeleting(true)
      await deleteAdminPond(pond.id)
      setPond(null)
      setShowDeleteAlert(false)
    } catch (error) {
      console.error("Error deleting pond:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePondSaved = (savedPond: AdminPond) => {
    setPond(savedPond)
    setShowModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading pond data...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pond Management</h2>
            <p className="text-gray-600 mt-1">Create and manage the system pond</p>
          </div>
          <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleAddPond}>
            <Plus className="h-4 w-4 mr-2" />
            {pond ? "Add Another Pond" : "Create Pond"}
          </Button>
        </div>

        {!pond ? (
          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Waves className="h-16 w-16 text-gray-400 mb-6" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No Pond Created Yet</h3>
              <p className="text-gray-500 text-center mb-6 max-w-md">
                Create the system pond that will be available to all approved users. Only one pond is supported in the
                current version.
              </p>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleAddPond}>
                <Plus className="h-4 w-4 mr-2" />
                Create System Pond
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Fish className="h-5 w-5 mr-2 text-cyan-600" />
                  {pond.name}
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                  <Button variant="outline" size="sm" onClick={handleEditPond}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeletePond}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 bg-transparent"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Fish Species</p>
                  <p className="text-lg font-semibold">{pond.fishSpecies}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Area</p>
                  <p className="text-lg font-semibold">{pond.area} m²</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Depth</p>
                  <p className="text-lg font-semibold">{pond.depth} m</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Initial Fish Count</p>
                  <p className="text-lg font-semibold">{pond.initialFishCount.toLocaleString()}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Feeding Frequency</p>
                  <p className="text-lg font-semibold">{pond.feedingFrequency}x daily</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Assigned Sensor</p>
                  <p className="text-lg font-semibold">{pond.sensorId}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Stocking Date</p>
                  <p className="text-lg font-semibold">{pond.stockingDate.toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Created</p>
                    <p className="text-sm text-gray-900">{pond.createdAt.toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Last Updated</p>
                    <p className="text-sm text-gray-900">{pond.updatedAt.toLocaleDateString("en-US", { timeZone: "Asia/Manila" })}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This pond will be available to all approved users. They can attach this pond to
                  their account to start monitoring and logging data.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pond Limit Alert */}
      {showLimitAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
              <h3 className="text-lg font-semibold">Pond Limit Reached</h3>
            </div>
            <Alert>
              <AlertDescription>
                The current app is only capable of creating one pond. More ponds will be supported in future
                development.
              </AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={() => setShowLimitAlert(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Alert */}
      {showDeleteAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold">Delete Pond</h3>
            </div>
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                Are you sure you want to delete this pond? This action cannot be undone and will remove all associated
                data.
              </AlertDescription>
            </Alert>
            <div className="flex space-x-3 mt-4">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => setShowDeleteAlert(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={confirmDeletePond} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AdminPondModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handlePondSaved}
        pond={isEditing ? pond : null}
        isEditing={isEditing}
      />
    </>
  )
}
