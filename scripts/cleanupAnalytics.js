import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./firebaseConfig.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const keepDays = Number(process.env.ANALYTICS_KEEP_DAYS || 7);

async function main() {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
  const snap = await getDocs(query(collection(db, "analytics_events"), where("localTime", "<", cutoff)));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  console.log(`${snap.size} analytics event${snap.size === 1 ? "" : "s"} older than ${keepDays} days deleted.`);
}

main().catch(error => {
  console.error("Analytics cleanup failed:", error);
  process.exit(1);
});
