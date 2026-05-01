// database.js — All Firestore CRUD operations

import { db } from "./firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp
} from "firebase/firestore";

// ── Generic helpers ──────────────────────────────────────────────────────────

const col = (name) => collection(db, name);

async function getAll(collectionName) {
  const snap = await getDocs(col(collectionName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Users ────────────────────────────────────────────────────────────────────

export const userDb = {
  async getAll() { return getAll("users"); },

  async getById(id) {
    const snap = await getDoc(doc(db, "users", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async findBy(field, value) {
    const q = query(col("users"), where(field, "==", value));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async create(data) {
    const ref = doc(col("users"));
    await setDoc(ref, { ...data, id: ref.id });
    return { ...data, id: ref.id };
  },

  async update(id, data) {
    await updateDoc(doc(db, "users", id), data);
  },

  async delete(id) {
    await deleteDoc(doc(db, "users", id));
  },
};

// ── Listings ─────────────────────────────────────────────────────────────────

export const listingDb = {
  async getAll() {
    const q = query(col("listings"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getById(id) {
    const snap = await getDoc(doc(db, "listings", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async create(data) {
    const ref = await addDoc(col("listings"), {
      ...data,
      createdAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
    });
    return { ...data, id: ref.id };
  },

  async update(id, data) {
    await updateDoc(doc(db, "listings", id), data);
  },

  async delete(id) {
    await deleteDoc(doc(db, "listings", id));
  },

  async deleteByUser(userId) {
    const q = query(col("listings"), where("userId", "==", userId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  },
};

// ── Exchanges ────────────────────────────────────────────────────────────────

export const exchangeDb = {
  async getAll() {
    const q = query(col("exchanges"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async create(data) {
    const ref = await addDoc(col("exchanges"), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { ...data, id: ref.id };
  },

  async update(id, data) {
    await updateDoc(doc(db, "exchanges", id), data);
  },

  async delete(id) {
    await deleteDoc(doc(db, "exchanges", id));
  },
};

// ── Sessions (stored in sessionStorage, validated server-side via Firestore) ─

export const sessionDb = {
  async create(userId) {
    const token = generateToken();
    await setDoc(doc(db, "sessions", token), {
      userId,
      exp: Date.now() + 7 * 86400000,
      createdAt: serverTimestamp(),
    });
    sessionStorage.setItem("bh_tok", token);
    return token;
  },

  async get(token) {
    if (!token) return null;
    const snap = await getDoc(doc(db, "sessions", token));
    if (!snap.exists()) return null;
    const sess = snap.data();
    if (sess.exp < Date.now()) {
      await deleteDoc(doc(db, "sessions", token));
      return null;
    }
    return sess;
  },

  async delete(token) {
    if (!token) return;
    await deleteDoc(doc(db, "sessions", token));
  },
};

// ── Analytics ────────────────────────────────────────────────────────────────

export const analyticsDb = {
  async getRecent(limitCount = 500) {
    const q = query(col("analytics_events"), orderBy("localTime", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
