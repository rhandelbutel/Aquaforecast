"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Fish, Plus, AlertTriangle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { getAvailableAdminPonds, attachUserToPond } from "@/lib/user-pond-service"
import { usePonds } from "@/lib/pond-context"
import { AdminPondModal } from "../admin/admin-pond-modal"

interface AddPondModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddPondModal({ isOpen, onClose }: AddPondModalProps) {
  const { user } = useAuth()
  const { refreshPonds } = usePonds()
  const [availablePonds, setAvailablePonds] = useState<Array<{ id: string; name: string; fishSpecies: string }>>([])
  const [selectedPondId, setSelectedPondId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showAdminModal, setShowAdminModal] = useState(false)

  const userIsAdmin = isAdmin(user?.email || "")

  // Load available ponds when modal opens
  const loadAvailablePonds = async () => {
    try {
      setLoading(true)
      const ponds = await getAvailableAdminPonds()
      setAvailablePonds(ponds)
      setError("")
    } catch (err) {
      console.error("Error loading available ponds:", err)
      setError("Failed to load available ponds")
    } finally {
      setLoading(false)
    }
  }

  // Handle modal open
  const handleModalOpen = () => {
    if (isOpen && !userIsAdmin) {
      loadAvailablePonds()
    }
  }

  // Handle attaching to pond
  const handleAttachToPond = async () => {
    if (!selectedPondId || !user) return

    try {
      setLoading(true)
      setError("")
      await attachUserToPond(user.uid, selectedPondId)
      await refreshPonds()
      onClose()
      setSelectedPondId("")
    } catch (err) {
      console.error("Error attaching to pond:", err)
      setError(err instanceof Error ? err.message : "Failed to attach to pond")
    } finally {
      setLoading(false)
    }
  }

  // Handle admin pond creation
  const handleAdminPondCreated = () => {
    setShowAdminModal(false)
    refreshPonds()
    onClose()
  }

  // Load ponds when modal opens
  if (isOpen && !userIsAdmin && availablePonds.length === 0 && !loading) {
    handleModalOpen()
  }

  if (userIsAdmin) {
    return (
      <>
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create System Pond</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Fish className="h-5 w-5 mr-2 text-cyan-600" />
                    Admin Pond Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    As an administrator, you can create the system pond that users can connect to.
                  </p>
                  <Button onClick={() => setShowAdminModal(true)} className="w-full bg-cyan-600 hover:bg-cyan-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create System Pond
                  </Button>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        <AdminPondModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          onSave={() => handleAdminPondCreated()}
        />
      </>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select a Pond</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading available ponds...</p>
            </div>
          ) : availablePonds.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <AlertTriangle className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Ponds Available</h3>
                <p className="text-gray-600 text-center">
                  No ponds have been created by the administrator yet. Please contact your administrator to create a
                  pond.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Available Ponds</label>
                  <Select value={selectedPondId} onValueChange={setSelectedPondId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a pond to connect to" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePonds.map((pond) => (
                        <SelectItem key={pond.id} value={pond.id}>
                          <div className="flex items-center">
                            <Fish className="h-4 w-4 mr-2 text-cyan-600" />
                            <div>
                              <p className="font-medium">{pond.name}</p>
                              <p className="text-xs text-gray-500">{pond.fishSpecies}</p>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

                <div className="flex space-x-3">
                  <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAttachToPond}
                    disabled={!selectedPondId || loading}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                  >
                    {loading ? "Connecting..." : "Connect to Pond"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
