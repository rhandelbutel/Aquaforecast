// lib/alert-snooze-service.ts
"use client"

import {
  doc, setDoc, updateDoc, onSnapshot, getDoc,
  serverTimestamp, deleteField
} from "firebase/firestore"
import { db } from "@/lib/firebase"

export type SnoozeMap = Record<string, number>

const COLLECTION = "users"
const PREFS_DOC = "alertPrefs"
const SNOOZES_ID = "snoozes"

function snoozesRef(uid: string) {
  return doc(db, COLLECTION, uid, PREFS_DOC, SNOOZES_ID)
}

/** Live subscribe (supports old and new signatures) */
export function subscribeSnoozes(uid: string, onChange: (map: SnoozeMap) => void): () => void
export function subscribeSnoozes(uid: string, _opts: {}, onChange: (map: SnoozeMap) => void): () => void
export function subscribeSnoozes(
  uid: string,
  arg2: {} | ((map: SnoozeMap) => void),
  arg3?: (map: SnoozeMap) => void
) {
  const onChange = (typeof arg2 === "function" ? arg2 : arg3) as (map: SnoozeMap) => void
  const ref = snoozesRef(uid)
  return onSnapshot(ref, (snap) => {
    const data = snap.data() || {}
    const keys = (data.keys ?? {}) as Record<string, number>
    onChange(keys)
  }, (err) => {
    console.error("[subscribeSnoozes] snapshot error:", err)
    onChange({})
  })
}

/** One-time load */
export async function loadSnoozes(uid: string): Promise<SnoozeMap> {
  const snap = await getDoc(snoozesRef(uid))
  const data = snap.data() || {}
  return (data.keys ?? {}) as SnoozeMap
}

/** Ensure the doc exists */
async function ensureDoc(uid: string) {
  const ref = snoozesRef(uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, { keys: {}, updatedAt: serverTimestamp() })
  }
}

/** Deep-merge one key without wiping others */
export async function setSnooze(uid: string, alertKey: string, untilEpochMs: number) {
  const ref = snoozesRef(uid)
  await ensureDoc(uid)
  await updateDoc(ref, {
    [`keys.${alertKey}`]: untilEpochMs,
    updatedAt: serverTimestamp(),
  })
}

/** Batch deep-merge multiple keys */
export async function setSnoozes(uid: string, alertKeys: string[], untilEpochMs: number) {
  const ref = snoozesRef(uid)
  await ensureDoc(uid)
  const payload: Record<string, number> = {}
  for (const k of alertKeys) payload[`keys.${k}`] = untilEpochMs
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() })
}

/** Remove expired keys (hygiene). If map not provided, it will be loaded. */
export async function pruneExpiredSnoozes(uid: string, map?: SnoozeMap) {
  if (!map) {
    try {
      map = await loadSnoozes(uid)
    } catch {
      map = {}
    }
  }
  const now = Date.now()
  const ref = snoozesRef(uid)
  const deletions: Record<string, any> = {}
  for (const [k, v] of Object.entries(map)) {
    if (!v || v < now) deletions[`keys.${k}`] = deleteField()
  }
  if (Object.keys(deletions).length) {
    await updateDoc(ref, { ...deletions, updatedAt: serverTimestamp() })
  }
}
