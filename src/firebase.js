// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 ▸ Go to https://console.firebase.google.com
// STEP 2 ▸ Create a project → Add a web app → Copy your config here
// STEP 3 ▸ Enable Firestore Database (Build → Firestore Database → Create)
//           Choose "Start in test mode" (you can secure later)
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCC1nLCrQFJVmk5fiPbBILMfLvtJ3qOxk8",
  authDomain: "barterhub-17d81.firebaseapp.com",
  projectId: "barterhub-17d81",
  storageBucket: "barterhub-17d81.firebasestorage.app",
  messagingSenderId: "1050729474762",
  appId: "1:1050729474762:web:8dd647d9c43c04d5896233"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
