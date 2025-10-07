"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldBan } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useUser } from "@/lib/user-context"
import { isAdmin } from "@/lib/user-service"
import { db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * Watches the current user's document. If it becomes "blocked":
 * - show a modal (non-admins only)
 * - on OK: refresh profile and navigate to "/" so ApprovalChecker renders
 *   the red "Account Blocked" card immediately (no logout).
 */
export default function BlockWatcher() {
  const { user } = useAuth()
  const { refreshProfile } = useUser()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)

  // Not mounted for logged-out users or admins
  const email = user?.email ?? ""
  if (!user || (email && isAdmin(email))) return null

  useEffect(() => {
    const ref = doc(db, "users", user.uid)
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      const data = snap.data() as { status?: string; blockReason?: string | null }
      if (data?.status === "blocked") {
        setReason(typeof data.blockReason === "string" ? data.blockReason : null)
        setOpen(true)
      }
    })
    return () => unsub()
  }, [user.uid])

  const handleOk = async () => {
    setOpen(false)
    // Make sure context sees the new status…
    try {
      await refreshProfile()
    } catch {}
    // …then route once so ApprovalChecker runs and shows the red card.
    router.replace("/")
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 rounded-full bg-red-100 p-3 w-12 h-12 flex items-center justify-center">
            <ShieldBan className="h-6 w-6 text-red-600" />
          </div>
          <AlertDialogTitle className="text-center">Account Blocked</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Your account has been blocked by an administrator.
            {/* {reason ? (
              <>
                {" "}
                Reason: <span className="font-medium text-red-700">{reason}</span>.
              </>
            ) : null}{" "} */}
            You can no longer access the dashboard. Click OK to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleOk}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
