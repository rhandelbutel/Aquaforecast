import { collection, addDoc, getDocs, doc, getDoc, query, where, Timestamp } from "firebase/firestore"
import { db } from "./firebase"
import { getAllAdminPonds, type AdminPond } from "./admin-pond-service"

export interface UserPond {
  id: string
  userId: string
  adminPondId: string
  attachedAt: Date
  adminPond?: AdminPond
}

export async function attachUserToPond(userId: string, adminPondId: string): Promise<UserPond> {
  try {
    // Check if user is already attached to this pond
    const existingAttachment = await getUserPondByAdminPondId(userId, adminPondId)
    if (existingAttachment) {
      throw new Error("User is already attached to this pond")
    }

    const userPondsRef = collection(db, "userPonds")
    const docRef = await addDoc(userPondsRef, {
      userId,
      adminPondId,
      attachedAt: Timestamp.now(),
    })

    return {
      id: docRef.id,
      userId,
      adminPondId,
      attachedAt: new Date(),
    }
  } catch (error) {
    console.error("Error attaching user to pond:", error)
    throw error
  }
}

export async function getUserPonds(userId: string): Promise<UserPond[]> {
  try {
    const userPondsRef = collection(db, "userPonds")
    const q = query(userPondsRef, where("userId", "==", userId))
    const querySnapshot = await getDocs(q)

    const userPonds: UserPond[] = []

    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data()

      try {
        // Get the admin pond data
        const adminPondRef = doc(db, "ponds", data.adminPondId)
        const adminPondDoc = await getDoc(adminPondRef)

        let adminPond: AdminPond | undefined
        if (adminPondDoc.exists()) {
          const adminPondData = adminPondDoc.data()
          adminPond = {
            id: adminPondDoc.id,
            name: adminPondData.name,
            fishSpecies: adminPondData.fishSpecies,
            area: adminPondData.area,
            depth: adminPondData.depth,
            initialFishCount: adminPondData.initialFishCount,
            feedingFrequency: adminPondData.feedingFrequency,
            sensorId: adminPondData.sensorId,
            createdAt: adminPondData.createdAt.toDate(),
            updatedAt: adminPondData.updatedAt.toDate(),
          }
        }

        userPonds.push({
          id: docSnapshot.id,
          userId: data.userId,
          adminPondId: data.adminPondId,
          attachedAt: data.attachedAt.toDate(),
          adminPond,
        })
      } catch (error) {
        console.error(`Error fetching admin pond ${data.adminPondId}:`, error)
        // Still add the user pond even if admin pond fetch fails
        userPonds.push({
          id: docSnapshot.id,
          userId: data.userId,
          adminPondId: data.adminPondId,
          attachedAt: data.attachedAt.toDate(),
        })
      }
    }

    return userPonds.sort((a, b) => b.attachedAt.getTime() - a.attachedAt.getTime())
  } catch (error) {
    console.error("Error fetching user ponds:", error)
    return []
  }
}

export async function getUserPondByAdminPondId(userId: string, adminPondId: string): Promise<UserPond | null> {
  try {
    const userPondsRef = collection(db, "userPonds")
    const q = query(userPondsRef, where("userId", "==", userId), where("adminPondId", "==", adminPondId))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      return null
    }

    const doc = querySnapshot.docs[0]
    const data = doc.data()

    return {
      id: doc.id,
      userId: data.userId,
      adminPondId: data.adminPondId,
      attachedAt: data.attachedAt.toDate(),
    }
  } catch (error) {
    console.error("Error fetching user pond by admin pond ID:", error)
    return null
  }
}

export async function getAvailableAdminPonds(): Promise<AdminPond[]> {
  try {
    return await getAllAdminPonds()
  } catch (error) {
    console.error("Error fetching available admin ponds:", error)
    return []
  }
}
