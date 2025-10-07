import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, limit, Timestamp } from "firebase/firestore"
import { db } from "./firebase"

export interface AdminPond {
  id: string
  name: string
  fishSpecies: string
  area: number
  depth: number
  initialFishCount: number
  feedingFrequency: number
  sensorId: string
  stockingDate: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateAdminPondData {
  name: string
  fishSpecies: string
  area: number
  depth: number
  initialFishCount: number
  feedingFrequency: number
  sensorId: string
  stockingDate: Date
}

export async function createAdminPond(pondData: CreateAdminPondData): Promise<AdminPond> {
  try {
    const adminPondsRef = collection(db, "ponds")

    // Check if there's already a pond (limit to 1)
    const existingPonds = await getDocs(query(adminPondsRef, limit(1)))
    if (!existingPonds.empty) {
      throw new Error("Only one pond is allowed in the current version")
    }

    const now = Timestamp.now()
    const docRef = await addDoc(adminPondsRef, {
      ...pondData,
      stockingDate: Timestamp.fromDate(pondData.stockingDate),
      createdAt: now,
      updatedAt: now,
    })

    return {
      id: docRef.id,
      ...pondData,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    }
  } catch (error) {
    console.error("Error creating admin pond:", error)
    throw error
  }
}

export async function getAdminPond(): Promise<AdminPond | null> {
  try {
    const adminPondsRef = collection(db, "ponds")
    const querySnapshot = await getDocs(query(adminPondsRef, limit(1)))

    if (querySnapshot.empty) {
      return null
    }

    const doc = querySnapshot.docs[0]
    const data = doc.data()

    return {
      id: doc.id,
      name: data.name,
      fishSpecies: data.fishSpecies,
      area: data.area,
      depth: data.depth,
      initialFishCount: data.initialFishCount,
      feedingFrequency: data.feedingFrequency,
      sensorId: data.sensorId,
      stockingDate: data.stockingDate?.toDate?.() ?? new Date(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    }
  } catch (error) {
    console.error("Error fetching admin pond:", error)
    return null
  }
}

export async function getAllAdminPonds(): Promise<AdminPond[]> {
  try {
    const adminPondsRef = collection(db, "ponds")
    const querySnapshot = await getDocs(adminPondsRef)

    const adminPonds: AdminPond[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      adminPonds.push({
        id: doc.id,
        name: data.name,
        fishSpecies: data.fishSpecies,
        area: data.area,
        depth: data.depth,
        initialFishCount: data.initialFishCount,
        feedingFrequency: data.feedingFrequency,
        sensorId: data.sensorId,
        stockingDate: data.stockingDate?.toDate?.() ?? new Date(),
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      })
    })

    return adminPonds.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch (error) {
    console.error("Error fetching all admin ponds:", error)
    return []
  }
}

export async function updateAdminPond(pondId: string, updates: Partial<CreateAdminPondData>): Promise<void> {
  try {
    const pondRef = doc(db, "ponds", pondId)
    await updateDoc(pondRef, {
      ...updates,
      ...(updates.stockingDate ? { stockingDate: Timestamp.fromDate(updates.stockingDate) } : {}),
      updatedAt: Timestamp.now(),
    })
  } catch (error) {
    console.error("Error updating admin pond:", error)
    throw error
  }
}

export async function deleteAdminPond(pondId: string): Promise<void> {
  try {
    const pondRef = doc(db, "ponds", pondId)
    await deleteDoc(pondRef)
  } catch (error) {
    console.error("Error deleting admin pond:", error)
    throw error
  }
}
