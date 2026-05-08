import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCJfMeHrFgpmssdnZtxoI64nUK-2MNUq-k",
  authDomain: "apex-tus.firebaseapp.com",
  projectId: "apex-tus",
  storageBucket: "apex-tus.firebasestorage.app",
  messagingSenderId: "606223581684",
  appId: "1:606223581684:web:b372ab6f7877271f5cf9a1",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
