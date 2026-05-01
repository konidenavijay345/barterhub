// database.js — All Firestore CRUD operations

import { db } from "./firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, limit,
  serverTimestamp
} from "firebase/firestore";

const col = (name) => collection(db, name);

async function getAll(collectionName) {
  try {
    const snap = await getDocs(col(collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error(`getAll(${collectionName}) failed:`, e);
    return [];
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const userDb = {
  async getAll() {
    return getAll("users");
  },

  async getById(id) {
    try {
      const snap = await getDoc(doc(db, "users", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) {
      console.error("userDb.getById failed:", e);
      return null;
    }
  },

  async create(data) {
    try {
      const ref = doc(col("users"));
      await setDoc(ref, { ...data, id: ref.id });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("userDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "users", id), data);
    } catch (e) {
      console.error("userDb.update failed:", e);
      throw e;
    }
  },

  async delete(id) {
    try {
      await deleteDoc(doc(db, "users", id));
    } catch (e) {
      console.error("userDb.delete failed:", e);
      throw e;
    }
  },
};

// ── Listings ──────────────────────────────────────────────────────────────────

export const listingDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("listings"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("listingDb.getAll failed:", e);
      return [];
    }
  },

  async getById(id) {
    try {
      const snap = await getDoc(doc(db, "listings", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) {
      console.error("listingDb.getById failed:", e);
      return null;
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("listings"), {
        ...data,
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("listingDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "listings", id), data);
    } catch (e) {
      console.error("listingDb.update failed:", e);
      throw e;
    }
  },

  async delete(id) {
    try {
      await deleteDoc(doc(db, "listings", id));
    } catch (e) {
      console.error("listingDb.delete failed:", e);
      throw e;
    }
  },

  async deleteByUser(userId) {
    try {
      const q = query(col("listings"), where("userId", "==", userId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) {
      console.error("listingDb.deleteByUser failed:", e);
    }
  },
};

// ── Exchanges ─────────────────────────────────────────────────────────────────

export const exchangeDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("exchanges"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("exchangeDb.getAll failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("exchanges"), {
        ...data,
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("exchangeDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "exchanges", id), data);
    } catch (e) {
      console.error("exchangeDb.update failed:", e);
      throw e;
    }
  },

  async delete(id) {
    try {
      await deleteDoc(doc(db, "exchanges", id));
    } catch (e) {
      console.error("exchangeDb.delete failed:", e);
      throw e;
    }
  },
};

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessionDb = {
  async create(userId) {
    try {
      const token = generateToken();
      await setDoc(doc(db, "sessions", token), {
        userId,
        exp: Date.now() + 7 * 86400000,
        createdAt: serverTimestamp(),
      });
      sessionStorage.setItem("bh_tok", token);
      return token;
    } catch (e) {
      console.error("sessionDb.create failed:", e);
      throw e;
    }
  },

  async get(token) {
    try {
      if (!token) return null;
      const snap = await getDoc(doc(db, "sessions", token));
      if (!snap.exists()) return null;
      const sess = snap.data();
      if (sess.exp < Date.now()) {
        await deleteDoc(doc(db, "sessions", token));
        return null;
      }
      return sess;
    } catch (e) {
      console.error("sessionDb.get failed:", e);
      return null;
    }
  },

  async delete(token) {
    try {
      if (!token) return;
      await deleteDoc(doc(db, "sessions", token));
    } catch (e) {
      console.error("sessionDb.delete failed:", e);
    }
  },
};

// ── Analytics ─────────────────────────────────────────────────────────────────

export const analyticsDb = {
  async getRecent(limitCount = 500) {
    try {
      const q = query(col("analytics_events"), limit(limitCount));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.localTime) - new Date(a.localTime));
    } catch (e) {
      console.error("analyticsDb.getRecent failed:", e);
      return [];
    }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}