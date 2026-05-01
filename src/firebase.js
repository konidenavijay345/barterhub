// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 ▸ Go to https://console.firebase.google.com
// STEP 2 ▸ Create a project → Add a web app → Copy your config here
// STEP 3 ▸ Enable Firestore Database (Build → Firestore Database → Create)
//           Choose "Start in test mode" (you can secure later)
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA2XBJuywzCZd1BGMRKrex-IGDcmKrAp1M",
  authDomain: "barterhub-2cd8f.firebaseapp.com",
  projectId: "barterhub-2cd8f",
  storageBucket: "barterhub-2cd8f.firebasestorage.app",
  messagingSenderId: "207157786096",
  appId: "1:207157786096:web:b11e4f54af6ff5831cd935"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
