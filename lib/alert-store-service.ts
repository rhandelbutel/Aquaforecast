// lib/alert-store-service.ts
"use client"

import {
  collection, doc, onSnapshot, query, where, orderBy,
  writeBatch, serverTimestamp, getDocs, Timestamp
} from "firebase/firestore"
import { db } from "@/lib/firebase"

export type StoredAlert = {
  pondName: any
  id: string                   // `${pondId}:${baseId}` (document id)
  pondId: string
  type: "warning" | "error" | "success" | "info"
  title: string
  message: string
  severity: "low" | "medium" | "high"
  active: boolean              // true if condition currently holds
  updatedAt: Timestamp
  createdAt: Timestamp
}

function alertsCol(pondId: string) {
  return collection(db, "ponds", pondId, "alerts")
}
function alertDoc(pondId: string, id: string) {
  return doc(db, "ponds", pondId, "alerts", id)
}

/** Live subscribe to ACTIVE alerts for a pond (newest first). */
export function subscribeActiveAlerts(
  pondId: string,
  onChange: (alerts: StoredAlert[]) => void
) {
  const q = query(
    alertsCol(pondId),
    where("active", "==", true),
    orderBy("updatedAt", "desc")
  )
  return onSnapshot(q, (snap) => {
    const list: StoredAlert[] = []
    snap.forEach((d) => {
      const data = d.data() as any
      list.push({
        id: d.id,
        pondId,
        type: data.type,
        title: data.title,
        message: data.message,
        severity: data.severity,
        active: data.active,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
        pondName: undefined
      })
    })
    onChange(list)
  }, (err) => {
    console.error("[alert-store] subscribeActiveAlerts error:", err)
    onChange([])
  })
}

/**
 * Materialize the current set of alerts in Firestore:
 * - Upsert all current alerts as active=true
 * - Mark previously-active alerts that are now absent as active=false
 * Use stable IDs like `${pondId}:${baseId}` for each alert.
 */
export async function materializeAlerts(
  pondId: string,
  currentAlerts: Array<{
    id: string
    type: "warning" | "error" | "success" | "info"
    title: string
    message: string
    severity: "low" | "medium" | "high"
  }>
) {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  // Upsert current alerts (active=true)
  for (const a of currentAlerts) {
    const ref = alertDoc(pondId, a.id) // already includes pondId in id
    batch.set(ref, {
      pondId,
      type: a.type,
      title: a.title,
      message: a.message,
      severity: a.severity,
      active: true,
      updatedAt: now,
      createdAt: now,
    }, { merge: true })
  }

  // Find active alerts in DB and mark missing ones inactive
  const activeSnap = await getDocs(
    query(alertsCol(pondId), where("active", "==", true))
  )
  const currentIds = new Set(currentAlerts.map(a => a.id))
  activeSnap.forEach((d) => {
    if (!currentIds.has(d.id)) {
      batch.set(d.ref, { active: false, updatedAt: now }, { merge: true })
    }
  })

  await batch.commit()
}
