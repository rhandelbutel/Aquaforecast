import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAb28_DSQdTSkiwENqp_nlolHkeQcNfUWQ",
  authDomain: "aquaforecast-6b568.firebaseapp.com",
  projectId: "aquaforecast-6b568",
  storageBucket: "aquaforecast-6b568.firebasestorage.app",
  messagingSenderId: "650994973717",
  appId: "1:650994973717:web:4bf9b21f80c58fdb61a21c",
  measurementId: "G-EXRJTNS0EF"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
