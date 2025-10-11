// app/ponds/page.tsx
"use client"

import { useCallback, useState } from "react"
import { usePonds } from "@/lib/pond-context"
import { EmptyPonds } from "@/components/ponds/empty-ponds"
import { PondsWithData } from "@/components/ponds/ponds-with-data"
import HarvestModal from "@/components/admin/harvest-modal"
import { useAuth } from "@/lib/auth-context"
import { isAdmin } from "@/lib/user-service"
import { GrowthService } from "@/lib/growth-service"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function PondsPage() {
  const { ponds, loading } = usePonds()
  const { user } = useAuth()

  const [harvestOpen, setHarvestOpen] = useState(false)

  // Info dialog (single “OK”)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoTitle, setInfoTitle] = useState<string>("")
  const [infoMsg, setInfoMsg] = useState<string>("")

  // Confirm dialog (Continue/Cancel)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState<string>("")
  const [confirmMsg, setConfirmMsg] = useState<string>("")
  const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null)

  const openInfo = useCallback((title: string, msg: string) => {
    setInfoTitle(title)
    setInfoMsg(msg)
    setInfoOpen(true)
  }, [])

  const openConfirm = useCallback((title: string, msg: string, handler: () => void) => {
    setConfirmTitle(title)
    setConfirmMsg(msg)
    setOnConfirm(() => handler)
    setConfirmOpen(true)
  }, [])

  const handleHarvestClick = useCallback(async () => {
    // must be admin
    if (!user || !isAdmin(user.email || "")) {
      openInfo("Restricted", "Only administrators can perform harvest.")
      return
    }
    if (!ponds.length) return

    const pond = ponds[0] // single-pond app
    const sharedPondId = (pond as any)?.adminPondId || pond.id

    const setup = await GrowthService.getGrowthSetup(sharedPondId, "shared")
    const currentABW = typeof setup?.currentABW === "number" ? setup.currentABW : 0
    const target = typeof setup?.targetWeight === "number" ? setup.targetWeight : undefined

    if (!currentABW || currentABW <= 0) {
      openInfo("ABW Required", "No current ABW is recorded yet. Please set ABW before harvesting.")
      return
    }

    // Block if not harvestable
    if (currentABW < 100) {
      openInfo(
        "Not Harvestable",
        `Fish are not yet harvestable.\n\nCurrent ABW: ${currentABW} g\nRequired: at least 100 g.`
      )
      return
    }

    // If ≥100g but below target — ask to continue
    if (typeof target === "number" && currentABW < target) {
      openConfirm(
        "Below Target Weight",
        `Current ABW is ${currentABW} g, which is below your target of ${target} g.\n\nDo you want to continue with harvest at the current weight?`,
        () => setHarvestOpen(true)
      )
      return
    }

    // Otherwise proceed
    setHarvestOpen(true)
  }, [user, ponds, openInfo, openConfirm])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ponds...</p>
        </div>
      </div>
    )
  }

  if (ponds.length === 0) return <EmptyPonds />

  return (
    <>
      {/* Header has the existing Harvest button; we pass our guarded handler */}
      <PondsWithData ponds={ponds} onClickHarvest={handleHarvestClick} />

      <HarvestModal open={harvestOpen} onOpenChange={setHarvestOpen} ponds={ponds} />

      {/* Info dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{infoTitle}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{infoMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setInfoOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{confirmMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                onConfirm?.()
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
