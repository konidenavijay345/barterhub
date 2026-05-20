// database.js — All Firestore CRUD operations

import { db } from "./firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, limit,
  serverTimestamp, onSnapshot, orderBy
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
      const users = await getAll("users");
      const userNumber = data.userNumber || nextUserNumber(users);
      const encryptedId = data.encryptedId || makePublicUserId(users);
      await setDoc(ref, { ...data, id: ref.id, userNumber, encryptedId, messagingBannerSeen: false });
      return { ...data, id: ref.id, userNumber, encryptedId, messagingBannerSeen: false };
    } catch (e) {
      console.error("userDb.create failed:", e);
      throw e;
    }
  },

  async ensureUserNumbers() {
    try {
      const users = await getAll("users");
      let next = nextUserNumber(users);
      const usedIds = new Set(users.map(u => u.encryptedId).filter(Boolean));
      const missing = users.filter(u => !u.userNumber || !u.encryptedId || u.messagingBannerSeen === undefined);
      await Promise.all(missing.map(u => {
        const patch = {};
        if (!u.userNumber) patch.userNumber = next++;
        if (!u.encryptedId) {
          let id = randomAlphaNum(10);
          while (usedIds.has(id)) id = randomAlphaNum(10);
          usedIds.add(id);
          patch.encryptedId = id;
        }
        if (u.messagingBannerSeen === undefined) patch.messagingBannerSeen = false;
        return updateDoc(doc(db, "users", u.id), patch);
      }));
      return missing.length;
    } catch (e) {
      console.error("userDb.ensureUserNumbers failed:", e);
      return 0;
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

  async toggleFollow(userId, targetId) {
    try {
      const ref = doc(db, "users", userId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const user = { id: snap.id, ...snap.data() };
      const following = Array.isArray(user.following) ? user.following : [];
      const isFollowing = following.includes(targetId);
      const nextFollowing = isFollowing ? following.filter(id => id !== targetId) : [...following, targetId];
      await updateDoc(ref, { following: nextFollowing });
      return { following: nextFollowing, isFollowing: !isFollowing };
    } catch (e) {
      console.error("userDb.toggleFollow failed:", e);
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

  async toggleLike(id, userId) {
    try {
      const ref = doc(db, "listings", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const listing = { id: snap.id, ...snap.data() };
      const likedBy = Array.isArray(listing.likedBy) ? listing.likedBy : [];
      const liked = likedBy.includes(userId);
      const nextLikedBy = liked ? likedBy.filter(x => x !== userId) : [...likedBy, userId];
      await updateDoc(ref, { likedBy: nextLikedBy, likeCount: nextLikedBy.length });
      return { liked: !liked, likeCount: nextLikedBy.length, listing };
    } catch (e) {
      console.error("listingDb.toggleLike failed:", e);
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
        updatedAt: new Date().toISOString(),
        seenByOwner: false,
        statusSeenByOfferer: true,
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("exchangeDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "exchanges", id), { ...data, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error("exchangeDb.update failed:", e);
      throw e;
    }
  },

  async markListingSeen(listingId, ownerId) {
    try {
      const q = query(col("exchanges"), where("listingId", "==", listingId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => {
        const ex = d.data();
        if (ex.ownerId && ex.ownerId !== ownerId) return Promise.resolve();
        return updateDoc(d.ref, { seenByOwner: true, ownerSeenAt: new Date().toISOString() });
      }));
    } catch (e) {
      console.error("exchangeDb.markListingSeen failed:", e);
    }
  },

  async markOffererStatusSeen(offererId) {
    try {
      const q = query(col("exchanges"), where("offererId", "==", offererId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(d.ref, { statusSeenByOfferer: true, offererSeenAt: new Date().toISOString() })));
    } catch (e) {
      console.error("exchangeDb.markOffererStatusSeen failed:", e);
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

// Chat threads and encrypted messages

export const chatDb = {
  async getThreadsForUser(userId) {
    try {
      if (!userId) return [];
      const q = query(col("chat_threads"), where("participants", "array-contains", userId), limit(200));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0));
    } catch (e) {
      console.error("chatDb.getThreadsForUser failed:", e);
      return [];
    }
  },

  async ensureThreadForExchange(exchange, listing) {
    try {
      if (!exchange?.id || !listing?.userId || !exchange?.offererId) return null;
      const threadId = `exchange_${exchange.id}`;
      const ref = doc(db, "chat_threads", threadId);
      const snap = await getDoc(ref);
      const participants = [listing.userId, exchange.offererId].sort();
      const payload = {
        exchangeId: exchange.id,
        listingId: listing.id,
        participants,
        participantNames: {
          [listing.userId]: listing.ownerUsername || "",
          [exchange.offererId]: exchange.offererUsername || "",
        },
        active: true,
        updatedAt: new Date().toISOString(),
      };
      if (!snap.exists()) {
        await setDoc(ref, { ...payload, createdAt: new Date().toISOString(), typing: {} });
      } else {
        await updateDoc(ref, payload);
      }
      return { id: threadId, ...payload };
    } catch (e) {
      console.error("chatDb.ensureThreadForExchange failed:", e);
      return null;
    }
  },

  subscribeThread(threadId, cb) {
    return onSnapshot(doc(db, "chat_threads", threadId), snap => {
      cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  },

  subscribeMessages(threadId, cb) {
    const q = query(collection(db, "chat_threads", threadId, "messages"), orderBy("createdAt", "asc"), limit(300));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  },

  async sendMessage(threadId, data) {
    try {
      const ref = await addDoc(collection(db, "chat_threads", threadId, "messages"), {
        ...data,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "chat_threads", threadId), {
        lastMessageAt: new Date().toISOString(),
        lastSenderId: data.senderId,
        lastCipherPreview: data.ciphertext?.slice(0, 18) || "",
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("chatDb.sendMessage failed:", e);
      throw e;
    }
  },

  async updateMessage(threadId, messageId, data) {
    try {
      await updateDoc(doc(db, "chat_threads", threadId, "messages", messageId), {
        ...data,
        editedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "chat_threads", threadId), {
        lastMessageAt: new Date().toISOString(),
        lastCipherPreview: data.ciphertext?.slice(0, 18) || "",
      });
    } catch (e) {
      console.error("chatDb.updateMessage failed:", e);
      throw e;
    }
  },

  async deleteMessage(threadId, messageId) {
    try {
      await updateDoc(doc(db, "chat_threads", threadId, "messages", messageId), {
        deleted: true,
        deletedAt: new Date().toISOString(),
        ciphertext: "",
        iv: "",
      });
      await updateDoc(doc(db, "chat_threads", threadId), {
        lastMessageAt: new Date().toISOString(),
        lastCipherPreview: "deleted",
      });
    } catch (e) {
      console.error("chatDb.deleteMessage failed:", e);
      throw e;
    }
  },

  async setTyping(threadId, userId, isTyping) {
    try {
      await updateDoc(doc(db, "chat_threads", threadId), {
        [`typing.${userId}`]: isTyping ? new Date().toISOString() : null,
      });
    } catch (e) {
      console.error("chatDb.setTyping failed:", e);
    }
  },

  async countMessagesToday(threadId, userId) {
    try {
      const q = query(collection(db, "chat_threads", threadId, "messages"), where("senderId", "==", userId), limit(300));
      const snap = await getDocs(q);
      const day = new Date().toISOString().slice(0, 10);
      return snap.docs.filter(d => (d.data().createdAt || "").slice(0, 10) === day).length;
    } catch (e) {
      console.error("chatDb.countMessagesToday failed:", e);
      return 0;
    }
  },
};

// Reports, ratings, and appeals

export const reportDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("reports"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("reportDb.getAll failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("reports"), {
        ...data,
        status: "open",
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("reportDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "reports", id), { ...data, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error("reportDb.update failed:", e);
      throw e;
    }
  },
};

export const ratingDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("ratings"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("ratingDb.getAll failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("ratings"), {
        ...data,
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("ratingDb.create failed:", e);
      throw e;
    }
  },
};

export const appealDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("appeals"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("appealDb.getAll failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("appeals"), {
        ...data,
        status: "open",
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("appealDb.create failed:", e);
      throw e;
    }
  },

  async update(id, data) {
    try {
      await updateDoc(doc(db, "appeals", id), { ...data, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error("appealDb.update failed:", e);
      throw e;
    }
  },
};

// Notifications

export const notificationDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("notifications"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("notificationDb.getAll failed:", e);
      return [];
    }
  },

  async getForUser(userId) {
    try {
      if (!userId) return [];
      const q = query(col("notifications"), where("userId", "==", userId), limit(200));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.error("notificationDb.getForUser failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("notifications"), {
        ...data,
        read: false,
        createdAt: new Date().toISOString(),
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("notificationDb.create failed:", e);
      return null;
    }
  },

  async markRead(id) {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true, readAt: new Date().toISOString() });
    } catch (e) {
      console.error("notificationDb.markRead failed:", e);
    }
  },

  async markAllRead(userId) {
    try {
      const q = query(col("notifications"), where("userId", "==", userId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true, readAt: new Date().toISOString() })));
    } catch (e) {
      console.error("notificationDb.markAllRead failed:", e);
    }
  },

  async deleteReadOlderThan(userId, hours = 24) {
    try {
      if (!userId) return 0;
      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const q = query(col("notifications"), where("userId", "==", userId));
      const snap = await getDocs(q);
      const expired = snap.docs.filter(d => {
        const data = d.data();
        const readAt = data.readAt ? new Date(data.readAt).getTime() : 0;
        return data.read === true && readAt > 0 && readAt < cutoff;
      });
      await Promise.all(expired.map(d => deleteDoc(d.ref)));
      return expired.length;
    } catch (e) {
      console.error("notificationDb.deleteReadOlderThan failed:", e);
      return 0;
    }
  },

  async markListingRead(userId, listingId) {
    try {
      const q = query(col("notifications"), where("userId", "==", userId), where("listingId", "==", listingId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true, readAt: new Date().toISOString() })));
    } catch (e) {
      console.error("notificationDb.markListingRead failed:", e);
    }
  },
};

// Comments

export const commentDb = {
  async getAll() {
    try {
      const snap = await getDocs(col("comments"));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } catch (e) {
      console.error("commentDb.getAll failed:", e);
      return [];
    }
  },

  async create(data) {
    try {
      const ref = await addDoc(col("comments"), {
        ...data,
        createdAt: new Date().toISOString(),
        active: true,
      });
      return { ...data, id: ref.id };
    } catch (e) {
      console.error("commentDb.create failed:", e);
      throw e;
    }
  },

  async delete(id) {
    try {
      await updateDoc(doc(db, "comments", id), { active: false, deletedAt: new Date().toISOString() });
    } catch (e) {
      console.error("commentDb.delete failed:", e);
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
      localStorage.setItem("bh_tok", token);
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

function nextUserNumber(users) {
  const max = users.reduce((n, u) => Math.max(n, Number(u.userNumber) || 1000), 1000);
  return max + 1;
}

function makePublicUserId(users) {
  const used = new Set(users.map(u => u.encryptedId).filter(Boolean));
  let id = randomAlphaNum(10);
  while (used.has(id)) id = randomAlphaNum(10);
  return id;
}

function randomAlphaNum(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
