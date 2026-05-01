// auth.js — Authentication using Firestore + sessionStorage

import { userDb, sessionDb } from "./database";

const SALT = "BarterHub_Secure_2024_!@#$%^&*";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const auth = {
  async register(username, email, password) {
    const allUsers = await userDb.getAll();
    if (allUsers.find(u => u.username.toLowerCase() === username.toLowerCase()))
      throw new Error("Username already taken");
    if (allUsers.find(u => u.email.toLowerCase() === email.toLowerCase()))
      throw new Error("Email already registered");

    const hash = await sha256(password + SALT);
    const user = await userDb.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      hash,
      role: allUsers.length === 0 ? "admin" : "user",
      joined: new Date().toISOString(),
      active: true,
    });
    return user;
  },

  async login(identifier, password) {
    const allUsers = await userDb.getAll();
    const user = allUsers.find(
      u => u.username.toLowerCase() === identifier.toLowerCase() ||
           u.email.toLowerCase() === identifier.toLowerCase()
    );
    if (!user) throw new Error("User not found");
    if (!user.active) throw new Error("Account suspended");

    const hash = await sha256(password + SALT);
    if (hash !== user.hash) throw new Error("Invalid password");

    await sessionDb.create(user.id);
    return user;
  },

  async logout() {
    const token = sessionStorage.getItem("bh_tok");
    await sessionDb.delete(token);
    sessionStorage.removeItem("bh_tok");
  },

  async me() {
    const token = sessionStorage.getItem("bh_tok");
    if (!token) return null;
    const sess = await sessionDb.get(token);
    if (!sess) { sessionStorage.removeItem("bh_tok"); return null; }
    return await userDb.getById(sess.userId);
  },

  async changePassword(userId, oldPw, newPw) {
    const user = await userDb.getById(userId);
    if (!user) throw new Error("User not found");
    const oldHash = await sha256(oldPw + SALT);
    if (oldHash !== user.hash) throw new Error("Current password is incorrect");
    const newHash = await sha256(newPw + SALT);
    await userDb.update(userId, { hash: newHash });
  },

 async seedAdmin() {
  try {
    console.log("Seeding admin user if none exist..."); 
    const users = await userDb.getAll();
    if (users.length === 0) {
      const hash = await sha256("admin123" + SALT);
      await userDb.create({
        username: "admin",
        email: "admin@barterhub.com",
        hash,
        role: "admin",
        joined: new Date().toISOString(),
        active: true,
      });
      console.log("✅ Admin created: admin / admin123");
    } else {
      console.log("✅ Users exist, skipping seedAdmin");
    }
  } catch (e) {
    console.warn("⚠️ seedAdmin failed:", e.message);
  }
},
};
