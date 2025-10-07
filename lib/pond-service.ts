import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { User } from 'firebase/auth'

export interface PondData {
  id?: string
  name: string
  fishSpecies: string
  area: number // in square meters
  depth: number // in meters
  fishCount: number
  feedingFrequency: number // times per day
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface SensorReading {
  pondId: string
  timestamp: Date
  ph: number
  temperature: number
  dissolvedOxygen: number
  tds: number
  status: 'optimal' | 'good' | 'warning' | 'danger'
}

export const addPond = async (pondData: Omit<PondData, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const docRef = await addDoc(collection(db, 'ponds'), {
      ...pondData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return docRef.id
  } catch (error) {
    console.error('Error adding pond:', error)
    throw error
  }
}

export const getUserPonds = async (userId: string): Promise<PondData[]> => {
  try {
    const q = query(collection(db, 'ponds'), where('userId', '==', userId))
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as PondData))
  } catch (error) {
    console.error('Error getting ponds:', error)
    return []
  }
}

export const updatePond = async (pondId: string, updates: Partial<PondData>) => {
  try {
    const pondRef = doc(db, 'ponds', pondId)
    await updateDoc(pondRef, {
      ...updates,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Error updating pond:', error)
    throw error
  }
}

export const deletePond = async (pondId: string) => {
  try {
    await deleteDoc(doc(db, 'ponds', pondId))
  } catch (error) {
    console.error('Error deleting pond:', error)
    throw error
  }
}
